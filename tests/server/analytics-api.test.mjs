import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { migrateAnalytics, archiveRecorderRow, COLLECTIONS } from '../../server/analytics/store.mjs';
import { analyticsResponse, adminAnalytics, AnalyticsError, ROUTES } from '../../server/analytics/api.mjs';
import {
	teenPattiTable,
	dealTeenPatti,
	playTeenPatti,
	holdemTable,
	playHoldem,
	blackjackTable,
	playBlackjack,
	rummyTable,
	playRummy
} from './helpers/drivers.mjs';

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('analytics-api');
await migrateAnalytics(db);
test.after(async () => {
	await client.close();
	await mongo.stop();
});

// A realistic history from the real recorder: several games, a bot, varied variants.
const sims = [];
const tp = teenPattiTable({ seed: 7, bots: ['hard'], table: 100000 });
for (const v of ['classic-1', 'muflis-1', 'joker-1', 'kiss-miss-bliss-1', 'classic-1', '4-card-1']) {
	dealTeenPatti(tp, v);
	playTeenPatti(tp, { packBias: 0.1 });
}
sims.push(tp);
const holdem = holdemTable({ seed: 8, players: ['a', 'b', 'c'] });
playHoldem(holdem);
playHoldem(holdem);
sims.push(holdem);
const bj = blackjackTable({ seed: 9, players: ['a', 'b'] });
playBlackjack(bj);
sims.push(bj);
const rummy = rummyTable({ seed: 10, players: ['a', 'b'] });
playRummy(rummy, { turns: 6 });
sims.push(rummy);
// A table 'a' never sat at.
const elsewhere = teenPattiTable({ seed: 11, humans: ['b', 'c'] });
dealTeenPatti(elsewhere);
playTeenPatti(elsewhere);
sims.push(elsewhere);
let roomNo = 0;
for (const sim of sims) {
	roomNo++;
	for (const row of sim.rows) {
		// Distinct rooms so hand ids do not collide across simulated tables.
		const payload = JSON.parse(JSON.stringify(row.payload).replaceAll('sim-room', `sim-room-${roomNo}`));
		await archiveRecorderRow(db, payload);
	}
}
await db.collection('members').insertMany([
	{ playerId: 'a', nickname: 'asha', status: 'active' },
	{ playerId: 'b', nickname: 'bina', status: 'active' },
	{ playerId: 'c', nickname: 'chirag', status: 'active' }
]);
const me = { playerId: 'a' };
const ask = (route, params = {}) => analyticsResponse(db, me, route, new URLSearchParams(params));

test('every analytics view answers for a real recorded history', async () => {
	for (const route of ROUTES.filter((r) => !['rival', 'hand'].includes(r))) {
		const body = await ask(route);
		assert.equal(body.route, route);
	}
	const overview = (await ask('overview')).overview;
	const mine = await db.collection(COLLECTIONS.records).countDocuments({ 'seats.p': 'a' });
	assert.equal(overview.hands, mine);
	assert.deepEqual(Object.keys(overview.games).sort(), ['blackjack', 'rummy', 'teen-patti', 'texas-holdem']);
	assert.ok(overview.cumulative.length > 0);
});

test('stake results equal the recorded nets divided by each hand’s stake unit', async () => {
	const records = await db.collection(COLLECTIONS.records).find({ 'seats.p': 'a', gameType: 'teen-patti' }).toArray();
	const expected = records.reduce((s, r) => s + (r.outcome.pot === null ? 0 : r.outcome.players.find((p) => p.p === 'a').net / r.config.boot), 0);
	const body = await ask('overview', { game: 'teen-patti' });
	assert.ok(Math.abs(body.overview.results.units - expected) < 0.11);
});

test('filters are validated: unknown values are refused, not widened', async () => {
	for (const bad of [{ window: 'forever' }, { game: 'poker' }, { company: 'enemies' }, { variant: 'DROP TABLE' }])
		await assert.rejects(ask('overview', bad), AnalyticsError);
	await assert.rejects(analyticsResponse(db, me, 'secrets', new URLSearchParams()), /Unknown analytics view/);
});

test("cards and fairness use only the viewer's own private cards", async () => {
	const body = await ask('cards');
	assert.ok(body.cards.teenPatti.hands > 0);
	const others = await db.collection(COLLECTIONS.private).find({ p: { $ne: 'a' } }).toArray();
	const own = await db.collection(COLLECTIONS.private).find({ p: 'a' }).toArray();
	const key = (c) => `${c.rank}:${c.suit}:${c.copy ?? 0}`;
	const mine = new Set(own.flatMap((o) => [...o.dealt, ...o.final]).map(key));
	const found = [];
	JSON.stringify(body, (k, v) => {
		if (v && typeof v === 'object' && 'rank' in v && 'suit' in v) found.push(key(v));
		return v;
	});
	for (const card of found) assert.ok(mine.has(card), `${card} in the cards view is not the viewer's`);
	assert.ok(others.length > 0, 'other players do have private cards in the database');
	assert.ok(['fair', 'insufficient', 'unusual'].includes(body.fairness.verdict));
});

test('hand detail: refused for a table the viewer never sat at; filtered for one they did', async () => {
	const foreign = await db.collection(COLLECTIONS.records).findOne({ 'seats.p': { $ne: 'a' } });
	await assert.rejects(ask('hand', { id: foreign._id }), (error) => error.status === 403);
	const own = await db.collection(COLLECTIONS.records).findOne({ 'seats.p': 'a', gameType: 'teen-patti' });
	const { hand } = await ask('hand', { id: own._id });
	assert.equal(hand.handId, own._id);
	assert.ok(hand.yourCards.final.length);
	for (const s of hand.shown) assert.ok(s.you || own.shown.concat(own.lateShown ?? []).some((x) => x.p !== 'a' && (x.observedBy ?? []).includes('a')));
	assert.ok(!JSON.stringify(hand).includes('preDeal'));
});

test('patterns, rivals and insights are structured, with bots grouped by identity', async () => {
	const patterns = await ask('patterns');
	assert.ok(patterns.core.decisions > 0);
	assert.ok(patterns.club.decisions > 0, 'club prior computed');
	const rivals = (await ask('rivals')).rivals;
	assert.ok(rivals.some((r) => r.subject === 'b'));
	assert.ok(rivals.some((r) => r.subject === 'bot:legacy-hard'));
	const detail = await ask('rival', { opponent: 'b' });
	assert.equal(detail.rival.subject, 'b');
	assert.equal(detail.names.b.name, 'bina');
	const { insights } = await ask('insights');
	for (const i of insights) for (const key of ['type', 'metric', 'n', 'confidence', 'eligible', 'text']) assert.ok(key in i, key);
});

test('owner analytics are normalised and read no private cards', async () => {
	const admin = await adminAnalytics(db, new URLSearchParams());
	const a = admin.members.find((m) => m.playerId === 'a');
	assert.ok(a.hands > 0);
	assert.ok('perHand' in a.results && 'ratio' in a.fairShare);
	assert.ok(admin.totals.hands >= a.hands);
	assert.ok(!JSON.stringify(admin).includes('"dealt"'));
});

test('a member who never played sees an empty, honest state', async () => {
	const body = await analyticsResponse(db, { playerId: 'nobody' }, 'overview', new URLSearchParams());
	assert.equal(body.overview.hands, 0);
	assert.equal(body.overview.results.verdict, 'insufficient');
	assert.equal(body.overview.fairShare.verdict, 'insufficient');
	assert.deepEqual((await analyticsResponse(db, {}, 'overview', new URLSearchParams())).empty, true);
});
