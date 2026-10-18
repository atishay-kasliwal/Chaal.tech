import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { DIMENSIONS, MemoryMomentIndex, MongoMomentIndex, PineconeMomentIndex, cosine, fingerprint, momentKind, momentsFrom, recallRelationship, recallSimilar } from '../../server/bots/memory/moments.mjs';
import { observeHand } from '../../server/bots/memory/observations.mjs';
import { observedFixture, T0, DAY } from './helpers/bot-memory.mjs';
import { privacyViolations } from './helpers/intel.mjs';

const decision = (over = {}) => ({ action: 'raise', betting: true, facing: 'none', blind: false, potUnits: 40, stakeMultiple: 2, live: ['x'], stackUnits: 80, relOrder: 0.5, ...over });

test('a fingerprint is a fixed-length, unit-length, public-only vector, and similar moments are close', () => {
	const v = fingerprint(decision(), { handNo: 3, outcome: 'won' });
	assert.equal(v.length, DIMENSIONS);
	assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-4);
	const same = fingerprint(decision({ potUnits: 42 }), { handNo: 3, outcome: 'won' });
	const different = fingerprint(decision({ action: 'fold', facing: 'raise', potUnits: 2, blind: true }), { handNo: 3, outcome: 'lost' });
	assert.ok(cosine(v, same) > 0.99);
	assert.ok(cosine(v, same) > cosine(v, different) + 0.3);
	assert.deepEqual(fingerprint(decision()), fingerprint(decision()), 'deterministic');
});

test('moments come only from public observation: one per person, no cards, bot-side outcome', () => {
	const observation = observeHand(observedFixture(1, { botId: 'rohit-sharma', action: 'fold' }), 'rohit-sharma');
	const moments = momentsFrom(observation);
	assert.equal(moments.length, 1);
	const m = moments[0];
	assert.equal(m.botId, 'rohit-sharma');
	assert.equal(m.playerId, 'a');
	assert.equal(m.kind, 'they-packed-to-me');
	assert.ok(m.vec.length === DIMENSIONS);
	assert.deepEqual(Object.keys(m).sort(), ['_id', 'at', 'botId', 'game', 'handId', 'kind', 'nightId', 'outcome', 'playerId', 'units', 'vec']);
	assert.deepEqual(privacyViolations(m), []);
	assert.equal(momentKind(decision({ action: 'raise' }), 'lost'), 'they-pushed-and-won');
});

async function filled(index, { outcomes }) {
	let i = 0;
	for (const [outcome, kind] of outcomes) {
		await index.upsert([{ _id: `m${i}`, botId: 'virat-kohli', playerId: 'a', handId: `h${i}`, nightId: 'n', game: 'teen-patti', at: T0 + i * DAY, kind, outcome, units: outcome === 'lost' ? -20 : 20, vec: fingerprint(decision({ action: kind.startsWith('they-pushed') ? 'raise' : 'fold', facing: 'raise' }), { outcome }) }]);
		i++;
	}
}

test('a bot remembers a relationship: rematch, revenge or pressure, from recent moments only', async () => {
	const rematch = new MemoryMomentIndex();
	await filled(rematch, { outcomes: [['lost', 'i-lost-to-them'], ['lost', 'i-lost-to-them'], ['lost', 'i-lost-to-them'], ['won', 'i-beat-them']] });
	assert.equal((await recallRelationship(rematch, { botId: 'virat-kohli', playerId: 'a', now: T0 + 10 * DAY })).mood, 'rematch');
	const revenge = new MemoryMomentIndex();
	await filled(revenge, { outcomes: [['won', 'i-beat-them'], ['won', 'i-beat-them'], ['won', 'i-beat-them']] });
	assert.equal((await recallRelationship(revenge, { botId: 'virat-kohli', playerId: 'a' })).mood, 'revenge');
	const pressure = new MemoryMomentIndex();
	await filled(pressure, { outcomes: [['lost', 'they-pushed-and-won'], ['won', 'they-pushed-and-lost'], ['lost', 'they-pushed-and-won']] });
	assert.equal((await recallRelationship(pressure, { botId: 'virat-kohli', playerId: 'a' })).mood, 'pressure');
	assert.deepEqual(await recallRelationship(new MemoryMomentIndex(), { botId: 'virat-kohli', playerId: 'a' }), { moments: 0, mood: 'new', lastAt: null });
	// A different person's moments never leak into this person's memory.
	assert.equal((await recallRelationship(rematch, { botId: 'virat-kohli', playerId: 'someone-else' })).moments, 0);
});

test('similar-moment recall ranks by likeness and stays within one bot and one person', async () => {
	const index = new MemoryMomentIndex();
	await filled(index, { outcomes: [['lost', 'they-pushed-and-won'], ['won', 'i-beat-them']] });
	await index.upsert([{ _id: 'other', botId: 'ms-dhoni', playerId: 'a', handId: 'x', at: T0, kind: 'played', outcome: 'won', units: 1, vec: fingerprint(decision()) }]);
	const found = await recallSimilar(index, { botId: 'virat-kohli', playerId: 'a', decision: decision({ action: 'raise', facing: 'raise' }), outcome: 'lost', limit: 2 });
	assert.equal(found[0]._id, 'm0');
	assert.ok(found.every((m) => m.botId === 'virat-kohli'));
});

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
test.after(async () => { await client.close(); await mongo.stop(); });

test('the MongoDB backend stores and recalls, and falls back to an exact search without an Atlas vector index', async () => {
	const index = new MongoMomentIndex(client.db('moments'));
	await filled(index, { outcomes: [['lost', 'they-pushed-and-won'], ['won', 'i-beat-them'], ['won', 'i-beat-them']] });
	await filled(index, { outcomes: [['lost', 'they-pushed-and-won']] }); // idempotent ids: same moments, replaced
	assert.equal(await client.db('moments').collection('bot_moments').countDocuments(), 3);
	const found = await index.query({ botId: 'virat-kohli', playerId: 'a', vec: fingerprint(decision({ action: 'raise', facing: 'raise' }), { outcome: 'lost' }), limit: 2 });
	assert.equal(found.length, 2);
	assert.equal(found[0].kind, 'they-pushed-and-won');
	assert.equal(index.atlas, false, 'a local MongoDB has no $vectorSearch: the exact search took over');
	assert.equal((await index.recent({ botId: 'virat-kohli', playerId: 'a' }))[0].at > 0, true);
});

test('the Pinecone backend speaks the REST API: a namespace per bot, the person as a filter, no SDK', async () => {
	const calls = [];
	const fetcher = async (url, init) => {
		calls.push({ url, body: JSON.parse(init.body), key: init.headers['Api-Key'] });
		return { ok: true, json: async () => ({ matches: [{ id: 'm1', score: 0.93, metadata: { playerId: 'a', at: 5, kind: 'i-beat-them', outcome: 'won' } }] }) };
	};
	const index = new PineconeMomentIndex({ host: 'https://example-index.svc.pinecone.io/', apiKey: 'secret', fetcher });
	await index.upsert([{ _id: 'm1', botId: 'gg', playerId: 'a', handId: 'h', nightId: 'n', at: 5, kind: 'i-beat-them', outcome: 'won', units: 3, vec: fingerprint(decision()) }]);
	const found = await index.query({ botId: 'gg', playerId: 'a', vec: fingerprint(decision()), limit: 3 });
	assert.equal(calls[0].url, 'https://example-index.svc.pinecone.io/vectors/upsert');
	assert.equal(calls[0].body.namespace, 'gg');
	assert.equal(calls[1].body.namespace, 'gg');
	assert.deepEqual(calls[1].body.filter, { playerId: { $eq: 'a' } });
	assert.equal(calls[0].key, 'secret');
	assert.equal(found[0].score, 0.93);
	const broken = new PineconeMomentIndex({ host: 'https://x', apiKey: 'k', fetcher: async () => ({ ok: false, status: 503 }) });
	await assert.rejects(broken.query({ botId: 'gg', playerId: 'a', vec: fingerprint(decision()) }), /503/);
});
