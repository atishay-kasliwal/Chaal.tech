import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import worker from '../../server/cloudflare/worker.mjs';
import { issueClubToken } from '../../server/cloudflare/security.mjs';
import { COLLECTIONS, gzipJson } from '../../server/analytics/store.mjs';
import { finishCapture } from '../../server/analytics/recorder.mjs';
import { botSeatPayload } from '../../server/bots/runner.mjs';
import { decisionView, factorLabel, inspectHand, inspectableHands, policyGraphs } from '../../server/analytics/intel/inspector.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti } from './helpers/drivers.mjs';

/**
 * Owner decision inspector (BOT_BRAIN.md §20 Phase 6). Traces carry a bot's own hand strength and
 * mind: owners only, finished hands only, and never anyone's cards.
 */
const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const DB = 'bot-inspector';
const db = client.db(DB);
test.after(async () => {
	await client.close();
	await mongo.stop();
});

// Real hands from the real recorder: a human and two character bots on tp-dna@3.
const sim = teenPattiTable({ seed: 77, humans: ['a'] });
sim.act('a', 'addBot', botSeatPayload(sim.room, 'virat-kohli', 'bot-test-virat', () => 0.5));
sim.act('a', 'addBot', botSeatPayload(sim.room, 'ms-dhoni', 'bot-test-dhoni', () => 0.5));
for (let hand = 0; hand < 2; hand++) {
	dealTeenPatti(sim);
	playTeenPatti(sim, { packBias: 0.1 });
}
const finished = sim.captures().map((capture) => finishCapture(capture));
for (const f of finished) assert.ok(f.ok, f.failure?.detail?.message);

/** Store one hand the way store.mjs writeHand does: sealed (gzipped), then the public record. */
async function store({ public: record, sealed }, { publicRecord = true, status = 'verified' } = {}) {
	const { preDeal, steps, hiddenStacks, botTrace, ...meta } = sealed;
	const z = await gzipJson({ preDeal, steps, hiddenStacks, botTrace });
	await db.collection(COLLECTIONS.sealed).insertOne({ ...meta, status, codec: 'gzip-json', z, storedAt: new Date() });
	if (publicRecord) await db.collection(COLLECTIONS.records).insertOne({ ...record, complete: true });
}
const [first, second] = finished.map((f) => f.records);
await store(first);
// The second hand's sealed inputs exist but its public record does not: as if still being written.
await store(second, { publicRecord: false });
const humanCards = first.private.find((p) => p.p === 'a').dealt;

await db.collection('members').insertMany([
	{ _id: new ObjectId(), playerId: 'a', nickname: 'Asha', status: 'active', googleSub: 'g-a', role: 'owner', sessionVersion: 1, email: 'asha@example.com' },
	{ _id: new ObjectId(), playerId: 'b', nickname: 'Bina', status: 'active', googleSub: 'g-b', role: 'member', sessionVersion: 1, email: 'bina@example.com' }
]);
await db.collection(COLLECTIONS.bots).insertMany([
	{ _id: 'virat-kohli', name: 'Virat' },
	{ _id: 'ms-dhoni', name: 'Dhoni' }
]);

/** Keys that must never reach the inspector: cards, decks, replay inputs, seeds and hashes. */
const BANNED = new Set(['cards', 'cardsInHand', 'dealt', 'final', 'deck', 'preDeal', 'steps', 'hiddenStacks', 'rngSeed', 'seed', 'configHash', 'z', 'salt', 'rank', 'suit', 'email']);
function leaks(value, path = '$', out = []) {
	if (Array.isArray(value)) value.forEach((v, i) => leaks(v, `${path}[${i}]`, out));
	else if (value && typeof value === 'object')
		for (const [k, v] of Object.entries(value)) {
			if (BANNED.has(k)) out.push(`${path}.${k}`);
			leaks(v, `${path}.${k}`, out);
		}
	return out;
}

test('a finished hand: every bot decision explained with probabilities, deltas, mind and its graph route', async () => {
	const result = await inspectHand(db, first.public._id);
	assert.equal(result.hand.id, first.public._id);
	assert.equal(result.decisions.length, first.sealed.botTrace.length);
	assert.ok(result.decisions.length > 0);
	assert.ok(result.graphs['tp-dna@3'].length >= 6, 'the policy graph comes with the hand');
	for (const d of result.decisions) {
		assert.ok(['Virat', 'Dhoni'].includes(d.name), d.name);
		assert.ok(d.why.length > 10 && !d.why.includes('—'), d.why);
		assert.equal(d.policy, 'tp-dna@3');
		assert.ok(d.graph.length >= 6);
		// The highlighted route is exactly the recorded path, in order.
		assert.deepEqual(d.graph.filter((n) => n.visited).sort((x, y) => x.order - y.order).map((n) => n.id), d.path);
		assert.ok(typeof d.text === 'string' && d.text.includes('Path:'));
		if (d.probs.length) assert.equal(d.probs.filter((p) => p.chosen).length, 1, `${d.action} is one of the candidates`);
	}
	const full = result.decisions.find((d) => d.deltas.length && d.mind);
	assert.ok(full, 'a decision that ran the whole graph');
	assert.ok(full.graph.find((n) => n.id === 'assess').deltas.some((x) => x.factor.startsWith('base.')));
	assert.ok(full.graph.find((n) => n.id === 'personalize').deltas.every((x) => x.factor.startsWith('dna.')));
	assert.ok(Object.keys(full.mind.mood).length >= 4);
	// Player ids are names in everything the owner reads.
	for (const d of result.decisions) for (const b of d.mind?.beliefs ?? []) assert.ok(['Asha', 'Virat', 'Dhoni'].includes(b.about), b.about);
	const forced = result.decisions.find((d) => d.path.length && !d.path.includes('choose'));
	if (forced) assert.ok(forced.graph.find((n) => n.id === 'choose').visited === false);
});

test('privacy: no cards, decks, seeds or replay inputs in the inspector, and not the human’s hand', async () => {
	const result = await inspectHand(db, first.public._id);
	const listing = await inspectableHands(db);
	assert.deepEqual(leaks(result), []);
	assert.deepEqual(leaks(listing), []);
	const json = JSON.stringify(result);
	for (const card of humanCards) assert.ok(!json.includes(JSON.stringify(card)));
});

test('only finished hands: a hand without its public record, or kept raw, is not served', async () => {
	await assert.rejects(inspectHand(db, second.public._id), (e) => e.status === 404);
	await assert.rejects(inspectHand(db, 'no-such-hand'), (e) => e.status === 404);
	await assert.rejects(inspectHand(db, 'x'.repeat(300)), (e) => e.status === 400);
	await assert.rejects(inspectHand(db, undefined), (e) => e.status === 400);
	// A public record without verified sealed inputs (a capture kept raw for rebuilding).
	await db.collection(COLLECTIONS.records).insertOne({ ...second.public, _id: 'raw-hand', complete: true });
	await db.collection(COLLECTIONS.sealed).insertOne({ _id: 'raw-hand', status: 'replay-failed', codec: 'gzip-json', z: await gzipJson({ capture: {} }) });
	await assert.rejects(inspectHand(db, 'raw-hand'), (e) => e.status === 404);
	// The list offers finished hands with bots only.
	const ids = (await inspectableHands(db)).hands.map((h) => h.id);
	assert.ok(ids.includes(first.public._id));
	assert.ok(!ids.includes(second.public._id));
	await db.collection(COLLECTIONS.records).deleteOne({ _id: 'raw-hand' });
	await db.collection(COLLECTIONS.sealed).deleteOne({ _id: 'raw-hand' });
});

test('the hand list names the seats and carries every policy graph', async () => {
	const { hands, graphs } = await inspectableHands(db);
	const hand = hands.find((h) => h.id === first.public._id);
	assert.deepEqual(hand.seats.map((s) => s.name).sort(), ['Asha', 'Dhoni', 'Virat']);
	assert.deepEqual(graphs, policyGraphs());
	assert.ok(graphs.some((g) => g.policy === 'tp-dna@8'));
});

test('decision view: words for factors, trick traces and forced moves', () => {
	assert.equal(factorLabel('social.rivalry'), 'rivalry');
	assert.equal(factorLabel('dna.blindAggression'), 'blind aggression (trait)');
	assert.equal(factorLabel('base.equity'), 'hand strength vs price');
	const trick = decisionView(
		{ i: 3, p: 'b1', policy: null, chosen: 'play', params: { card: { rank: 11, suit: 'hearts' } }, probs: [0.7, 0.3], reason: 'play-best', trace: { kind: 'play', cands: ['J♥', '9♠'], base: [0.5, 0.1], persona: [0.02, 0], probs: [0.7, 0.3] } },
		{ gameType: 'twenty-nine', players: [{ id: 'b1', username: 'Bot', cards: [] }] }
	);
	assert.equal(trick.graph, null);
	assert.equal(trick.probs.length, 2);
	assert.deepEqual(leaks(trick), []);
	const forced = decisionView({ i: 0, p: 'b1', policy: 'tp-dna@8', chosen: 'pack', params: {}, probs: {}, reason: 'only-move', trace: { path: ['perceive', 'recall', 'assess'] } }, null);
	assert.equal(forced.why, 'Packed: it was the only move.');
	assert.equal(forced.graph.filter((n) => n.visited).length, 3);
});

/* ------------------------------- through the real Worker ------------------------------- */

const SECRET = 'x'.repeat(40);
const env = { SESSION_SECRET: SECRET, ENGINE_BUILD: '05066112abcd', MONGODB_URI: mongo.getUri(), MONGODB_DB: DB };
const call = (path, token) => worker.fetch(new Request(`https://game.test${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }), env);
const tokenFor = async (playerId) => {
	const member = await db.collection('members').findOne({ playerId });
	return issueClubToken(SECRET, { memberId: String(member._id), version: 1 });
};

test('Worker: only owners reach the inspector; members are refused, strangers must sign in', async () => {
	const owner = await tokenFor('a');
	const member = await tokenFor('b');
	const inspect = `/admin/bots/inspect?hand=${encodeURIComponent(first.public._id)}`;
	for (const path of ['/admin/bots/hands', inspect]) {
		assert.equal((await call(path)).status, 401, `${path} needs a sign-in`);
		const denied = await call(path, member);
		assert.equal(denied.status, 403, `${path} is owner-only`);
		const body = await denied.json();
		assert.equal(body.decisions, undefined);
		assert.equal(body.hands, undefined);
	}
	const list = await call('/admin/bots/hands', owner);
	assert.equal(list.status, 200);
	assert.ok((await list.json()).hands.some((h) => h.id === first.public._id));
	const ok = await call(inspect, owner);
	assert.equal(ok.status, 200);
	const body = await ok.json();
	assert.ok(body.decisions.length > 0);
	assert.deepEqual(leaks(body), []);
});

test('Worker: an unfinished hand is not served, even to the owner', async () => {
	const owner = await tokenFor('a');
	const res = await call(`/admin/bots/inspect?hand=${encodeURIComponent(second.public._id)}`, owner);
	assert.equal(res.status, 404);
	const body = await res.json();
	assert.equal(body.decisions, undefined);
	assert.equal((await call('/admin/bots/inspect', owner)).status, 400);
});
