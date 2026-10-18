import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { migrateAnalytics, archiveRecorderRow, COLLECTIONS } from '../../server/analytics/store.mjs';
import { analyticsResponse, ROUTES } from '../../server/analytics/api.mjs';
import { INTEL_ROUTES, OPPONENT_ROUTES } from '../../server/analytics/intel/api.mjs';
import { adminBotIntel, adminClubIntel, adminExport, adminQuality } from '../../server/analytics/intel/admin.mjs';
import { loadShown } from '../../server/analytics/intel/ranking.mjs';
import { clearMemo } from '../../server/analytics/intel/memo.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti, holdemTable, playHoldem, blackjackTable, playBlackjack, rummyTable, playRummy } from './helpers/drivers.mjs';
import { privacyViolations } from './helpers/intel.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('intel-api');
await migrateAnalytics(db);
test.after(async () => { await client.close(); await mongo.stop(); });

// A real history from the real recorder: every game, a bot, several variants, a table 'a' never sat at.
const sims = [];
const tp = teenPattiTable({ seed: 7, bots: ['hard'], table: 100000 });
for (let i = 0; i < 24; i++) { dealTeenPatti(tp, i % 3 ? 'classic-1' : 'muflis-1', `t${i}`); playTeenPatti(tp, { packBias: 0.1 }); }
sims.push(tp);
const holdem = holdemTable({ seed: 8, players: ['a', 'b', 'c'] });
for (let i = 0; i < 3; i++) playHoldem(holdem);
sims.push(holdem);
const bj = blackjackTable({ seed: 9, players: ['a', 'b'] });
for (let i = 0; i < 5; i++) playBlackjack(bj);
sims.push(bj);
const rummy = rummyTable({ seed: 10, players: ['a', 'b'] });
playRummy(rummy, { turns: 6 });
sims.push(rummy);
const elsewhere = teenPattiTable({ seed: 11, humans: ['b', 'c'] });
dealTeenPatti(elsewhere);
playTeenPatti(elsewhere);
sims.push(elsewhere);
let roomNo = 0;
for (const sim of sims) {
	roomNo++;
	for (const row of sim.rows) await archiveRecorderRow(db, JSON.parse(JSON.stringify(row.payload).replaceAll('sim-room', `sim-room-${roomNo}`)));
}
await db.collection('members').insertMany([
	{ playerId: 'a', nickname: 'asha', status: 'active' },
	{ playerId: 'b', nickname: 'bina', status: 'active' },
	{ playerId: 'c', nickname: 'chirag', status: 'active' }
]);
const me = { playerId: 'a' };
const ask = (route, params = {}, options) => analyticsResponse(db, me, route, new URLSearchParams(params), Date.now(), options);

test('every Phase 5 view answers on a real recorded history and leaks no private field', async () => {
	for (const route of INTEL_ROUTES) {
		const body = await ask(route);
		assert.equal(body.route, route);
		// Fairness is explicitly about the viewer's own cards, which are theirs to see.
		assert.deepEqual(privacyViolations(body, { allow: [] }), [], `${route} leaks`);
	}
	for (const route of ['rivals', 'insights']) assert.deepEqual(privacyViolations(await ask(route)), [], `${route} leaks`);
	assert.ok(ROUTES.includes('recap') && ROUTES.includes('skill') && ROUTES.includes('fairness'));
});

test('every game answers the skill view with its own method, and says what it cannot know', async () => {
	const { skill, improvement } = await ask('skill');
	assert.equal(skill.games['teen-patti'].model, 'estimated');
	assert.equal(skill.games.blackjack.model, 'exact');
	assert.equal(skill.games.rummy.model, 'outcome-only');
	assert.ok(skill.games['texas-holdem']);
	for (const g of Object.values(skill.games)) assert.ok(g.limitations.length >= 1, `${g.game} documents its limits`);
	assert.ok(['improving', 'slipping', 'mixed', 'steady', 'not-enough'].includes(improvement.verdict));
	const keys = new Set();
	const walk = (v) => v && typeof v === 'object' && Object.entries(v).forEach(([k, x]) => (keys.add(k), walk(x)));
	walk(skill);
	for (const banned of ['score', 'skillScore', 'rating', 'rank', 'iq']) assert.ok(!keys.has(banned), `no fake universal ${banned}`);
});

test('every surface uses the same definitions: nights, records, recap, skill and overview agree', async () => {
	const nights = (await ask('nights')).nights;
	const recap = (await ask('recap')).recap;
	const night = nights.find((n) => n.nightId === recap.nightId);
	assert.equal(recap.you.units, night.units, 'recap and night list agree');
	assert.equal(recap.you.hands, night.hands);
	const records = (await ask('records')).records;
	const best = Math.max(...nights.map((n) => n.units));
	if (best > 0) assert.equal(records.find((r) => r.id === 'best-night').value, best, 'records and night list agree');
	const games = (await ask('games')).games.games.find((g) => g.key === 'teen-patti');
	const skill = (await ask('skill')).skill.games['teen-patti'];
	if (skill.boots) assert.ok(Math.abs(skill.boots.total - games.results.units) < 0.11 + Math.abs(games.results.units) * 0.02, `skill ${skill.boots.total} vs games ${games.results.units}`);
	const overview = (await ask('overview')).overview;
	assert.ok(overview.results.units !== undefined);
});

test('authorization: only your own nights and hands, at every layer', async () => {
	const other = await db.collection(COLLECTIONS.records).findOne({ 'seats.p': { $ne: 'a' } });
	assert.ok(other);
	await assert.rejects(ask('recap', { night: other.nightId }), (e) => e.status === 403);
	const evidence = await ask('evidence', { hands: other._id });
	assert.equal(evidence.hands.length, 0, 'a hand you were not dealt into never appears');
	await assert.rejects(ask('hand', { id: other._id }), (e) => e.status === 403);
	const mine = await db.collection(COLLECTIONS.records).findOne({ 'seats.p': 'a' });
	const ok = await ask('evidence', { hands: mine._id });
	assert.equal(ok.hands.length, 1);
	assert.equal((await analyticsResponse(db, { playerId: null }, 'skill', new URLSearchParams())).empty, true, 'a member without a player id gets an empty state');
	await assert.rejects(ask('evidence', { hands: 'x'.repeat(300) }), /Unknown hand/);
});

test('live-game boundary: opponent scouting waits between hands; your own history does not', async () => {
	for (const route of OPPONENT_ROUTES) await assert.rejects(ask(route, {}, { live: true }), (e) => e.status === 423 && e.code === 'IN_LIVE_HAND');
	for (const route of ['skill', 'records', 'fairness', 'club', 'timeline', 'overview']) assert.ok(await ask(route, {}, { live: true }), `${route} is available mid-game`);
});

test('the recap remembers what it showed, once per night, and does not repeat tomorrow', async () => {
	await db.collection('insight_shown').deleteMany({});
	const first = await ask('recap');
	const again = await ask('recap');
	assert.deepEqual(first.recap.highlights.map((h) => h.id), again.recap.highlights.map((h) => h.id), 'a refresh does not change the recap');
	const shown = await loadShown(db, 'a');
	for (const h of first.recap.highlights) assert.equal(shown.get(h.id).count, 1, 'counted once, not per refresh');
	// The next night's recap treats these as already seen.
	const next = await loadShown(db, 'a', { exclude: 'recap:some-other-night' });
	assert.equal(next.size, first.recap.highlights.length);
});

test('drilldown: every highlight links to evidence the viewer is allowed to open', async () => {
	const { recap } = await ask('recap');
	for (const h of recap.highlights) {
		for (const id of h.evidence.hands ?? []) {
			const detail = await ask('hand', { id });
			assert.equal(detail.hand.handId, id);
		}
		assert.ok(h.evidence.nightId === recap.nightId || h.evidence.nightId === undefined || h.evidence.nightId === null);
	}
	const night = await ask('hands', { night: recap.nightId });
	assert.ok(night.total >= 1);
});

test('rival and rivals views carry the board and page, with bots grouped and no hidden numbers', async () => {
	const list = await ask('rivals');
	assert.ok(list.board && 'closest' in list.board && 'note' in list.board);
	const target = list.rivals[0]?.subject;
	assert.ok(target);
	const detail = await ask('rival', { opponent: target });
	assert.ok(detail.page.headline.length > 0 && Array.isArray(detail.page.timeline));
	assert.deepEqual(privacyViolations(detail), []);
});

test('date and bot filters narrow every view that takes a filter', async () => {
	const all = await ask('hands');
	const future = await ask('hands', { from: '2999-01-01' });
	assert.ok(all.total > 0 && future.total === 0);
	const bot = await db.collection(COLLECTIONS.bots).findOne({});
	if (bot) await ask('overview', { bot: bot._id.startsWith('legacy-') ? bot._id : bot._id });
	await assert.rejects(ask('hands', { from: 'soon' }), /Dates look like/);
});

/* ---------------------------------------- owner views and data quality ---------------------------------------- */

test('owner views: club, variants, bots, quality and export read only public history', async () => {
	clearMemo();
	await seedCharacters(db);
	const club = await adminClubIntel(db);
	assert.ok(club.overview.hands > 0 && club.variants.variants.length >= 2 && club.records.records.length > 0);
	const bots = await adminBotIntel(db);
	assert.ok(bots.bots.length >= 1 && bots.bots.every((b) => 'exploitability' in b && Array.isArray(b.versions)));
	const exported = await adminExport(db, { limit: 50 });
	assert.ok(exported.rows.length > 0);
	for (const view of [club, bots, exported]) assert.deepEqual(privacyViolations(view), [], 'no cards or traces in owner views');
});

test('data quality is clean on real recorder output, which also calibrates the public-field list', async () => {
	const quality = await adminQuality(db);
	const attention = quality.checks.filter((c) => c.status !== 'ok' && !['memory-failures', 'missing-hands', 'stale-aggregates'].includes(c.id));
	assert.deepEqual(attention.map((c) => [c.id, c.count, c.examples.slice(0, 2)]), [], 'real records raise no per-hand problems');
	assert.equal(quality.scanned, await db.collection(COLLECTIONS.records).countDocuments());
	// A tampered record is found.
	await db.collection(COLLECTIONS.records).updateOne({ 'seats.p': 'a' }, { $set: { 'outcome.players.0.net': 99999 } }, { bypassDocumentValidation: true });
	const after = await adminQuality(db);
	assert.ok(after.checks.find((c) => c.id === 'impossible-nets').count >= 1);
	assert.equal(after.status, 'attention');
});

test('privacy audit: nothing from another player’s private record reaches any view, owner views included', async () => {
	await db.collection(COLLECTIONS.private).updateMany({ p: { $ne: 'a' } }, { $set: { label: 'CANARY-SECRET-LABEL', seenAt: 424242 } });
	clearMemo();
	const bodies = [];
	for (const route of ROUTES.filter((r) => !['hand', 'rival'].includes(r))) bodies.push(await ask(route));
	const rivals = await ask('rivals');
	bodies.push(await ask('rival', { opponent: rivals.rivals[0].subject }));
	const mine = await db.collection(COLLECTIONS.records).findOne({ 'seats.p': 'a' });
	bodies.push(await ask('hand', { id: mine._id }));
	bodies.push(await adminClubIntel(db), await adminBotIntel(db), await adminExport(db), await adminQuality(db));
	for (const body of bodies) assert.doesNotMatch(JSON.stringify(body), /CANARY-SECRET-LABEL|424242/);
});

test('club card counts are withheld when too few people contribute, so nobody can subtract themselves out', async () => {
	const { clubCardCounts, MIN_CLUB_CARD_PLAYERS } = await import('../../server/analytics/data.mjs');
	const counts = await clubCardCounts(db);
	// This history has three people: far below the threshold, so the club panel never appears.
	assert.equal(counts.withheld, true);
	assert.ok(MIN_CLUB_CARD_PLAYERS >= 5);
	assert.equal((await ask('fairness')).club, null);
});
