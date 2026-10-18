import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import {
	migrateAnalytics,
	archiveRecorderRow,
	verifyStoredHands,
	recorderHealth,
	writeRoomStatus,
	readSealed,
	COLLECTIONS,
	IdentityConflict,
	NotReady,
	SchemaNotReady
} from '../../server/analytics/store.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti } from './helpers/drivers.mjs';

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
test.after(async () => {
	await client.close();
	await mongo.stop();
});
let dbCount = 0;
const newDb = () => client.db(`recorder-store-${++dbCount}`);
async function freshDb() {
	const db = newDb();
	await migrateAnalytics(db);
	return db;
}
async function archiveAll(db, rows) {
	for (const row of rows) await archiveRecorderRow(db, row.payload);
}
function botNight(seed = 1) {
	const sim = teenPattiTable({ seed, bots: ['hard'] });
	for (let n = 0; n < 2; n++) {
		dealTeenPatti(sim);
		playTeenPatti(sim);
	}
	const folder = sim.captures().at(-1).hand.steps.find((s) => s.action === 'pack')?.actor;
	if (folder && !folder.startsWith('bot-')) sim.act(folder, 'reveal');
	return sim;
}
const cleanReport = (extra) => ({
	checked: 0, reproduced: 0, compatible: 0, unavailable: [], mismatched: [], missingPublic: [], keptForRebuild: [], ...extra
});

test('migration creates every collection with validators that keep tiers apart', async () => {
	const db = await freshDb();
	const names = (await db.listCollections().toArray()).map((c) => c.name);
	for (const name of Object.values(COLLECTIONS)) assert.ok(names.includes(name), name);
	const base = { _id: 'x:1', v: 2, versions: {}, room: 'x', handId: '1', nightId: 'x:0', gameType: 'teen-patti', seats: [], events: [], outcome: {}, verified: {}, complete: true };
	await db.collection(COLLECTIONS.records).insertOne(base);
	await assert.rejects(db.collection(COLLECTIONS.records).insertOne({ ...base, _id: 'x:2', preDeal: {} }), /validation/i, 'no replay inputs in public');
	await assert.rejects(db.collection(COLLECTIONS.records).insertOne({ ...base, _id: 'x:3', deck: [] }), /validation/i, 'no deck in public');
	await assert.rejects(
		db.collection(COLLECTIONS.records).insertOne({ ...base, _id: 'x:4', seats: [{ p: 'a', cards: [{ rank: 2, suit: 'hearts' }] }] }),
		/validation/i,
		'no cards on a public seat'
	);
	await assert.rejects(db.collection(COLLECTIONS.records).insertOne({ ...base, _id: 'x:5', complete: false }), /validation/i);
	await assert.rejects(
		db.collection(COLLECTIONS.private).insertOne({ _id: 'x:1:a', handId: 'x:1', p: 'a', dealt: [], deck: [] }),
		/validation/i,
		'no deck in a private record'
	);
	await assert.rejects(
		db.collection(COLLECTIONS.sealed).insertOne({ _id: 'x:1', status: 'verified', codec: 'gzip-json', z: 'not bytes' }),
		/validation/i,
		'sealed inputs are stored compressed'
	);
	await migrateAnalytics(db); // idempotent
	assert.equal(await db.collection(COLLECTIONS.styles).countDocuments(), 3);
	assert.equal(await db.collection(COLLECTIONS.bots).countDocuments(), 3);
});

test('the runtime never administers schema: before migration it refuses, creating nothing', async () => {
	const db = newDb();
	const sim = botNight(3);
	await assert.rejects(archiveRecorderRow(db, sim.rows.find((r) => r.payload.type === 'capture').payload), SchemaNotReady);
	const names = (await db.listCollections().toArray()).map((c) => c.name);
	assert.deepEqual(names.filter((n) => n !== COLLECTIONS.meta), [], 'no unvalidated collection appears');
	// Styles are published by migration only; the runtime just checks them.
	const migrated = await freshDb();
	await migrated.collection(COLLECTIONS.styles).deleteMany({});
	await assert.rejects(archiveRecorderRow(migrated, sim.rows.find((r) => r.payload.type === 'capture').payload), /not published/);
});

test('a night archives into its tiers once, compressed where only replay reads it', async () => {
	const db = await freshDb();
	const sim = botNight(11);
	await archiveAll(db, sim.rows);
	await archiveAll(db, sim.rows);
	assert.equal(await db.collection(COLLECTIONS.records).countDocuments(), 2);
	assert.equal(await db.collection(COLLECTIONS.sealed).countDocuments(), 2);
	assert.equal(await db.collection(COLLECTIONS.private).countDocuments(), 2 * 4);
	assert.equal(await db.collection(COLLECTIONS.failures).countDocuments(), 0);
	const sealed = await db.collection(COLLECTIONS.sealed).findOne();
	assert.equal(sealed.codec, 'gzip-json');
	assert.ok(sealed.size.gz < sealed.size.json / 2, `compressed ${sealed.size.json} -> ${sealed.size.gz}`);
	const opened = await readSealed(sealed);
	assert.ok(opened.preDeal && opened.steps.length >= 2);
	const night = await db.collection(COLLECTIONS.nights).findOne();
	assert.ok(night.events.some((e) => e.a === 'join'));
	assert.equal(new Set(night.events.map((e) => e.seq)).size, night.events.length, 'no duplicated events');
	const record = await db.collection(COLLECTIONS.records).findOne({}, { sort: { handNo: -1 } });
	assert.equal(record.complete, true);
	if (sim.rows.some((row) => row.payload.type === 'reveal')) assert.equal(record.lateShown.length, 1);
	assert.deepEqual(await verifyStoredHands(db), cleanReport({ checked: 2, reproduced: 2 }));
});

test('a write interrupted part-way leaves no public record, and the retry completes it', async () => {
	const db = await freshDb();
	const sim = botNight(21);
	const capture = sim.rows.find((row) => row.payload.type === 'capture');
	let fail = true;
	const flaky = new Proxy(db, {
		get(target, prop) {
			if (prop !== 'collection') return Reflect.get(target, prop);
			return (name) => {
				const collection = target.collection(name);
				if (name !== COLLECTIONS.records) return collection;
				return new Proxy(collection, {
					get(c, method) {
						if (method === 'updateOne' && fail) {
							fail = false;
							return () => Promise.reject(new Error('network down'));
						}
						const value = Reflect.get(c, method);
						return typeof value === 'function' ? value.bind(c) : value;
					}
				});
			};
		}
	});
	await assert.rejects(archiveRecorderRow(flaky, capture.payload), /network down/);
	assert.equal(await db.collection(COLLECTIONS.records).countDocuments(), 0, 'no public record: the hand is not complete');
	assert.equal(await db.collection(COLLECTIONS.sealed).countDocuments(), 1);
	assert.equal((await verifyStoredHands(db)).missingPublic.length, 1, 'the gap is observable');
	await archiveRecorderRow(db, capture.payload);
	assert.equal(await db.collection(COLLECTIONS.records).countDocuments(), 1);
	assert.equal((await verifyStoredHands(db)).reproduced, 1);
});

test('a bot hand is refused if its style id now means a different configuration', async () => {
	const db = await freshDb();
	await db.collection(COLLECTIONS.styles).updateOne({ _id: 'legacy-hard@1' }, { $set: { configHash: '0000000000000000' } });
	await assert.rejects(migrateAnalytics(db), IdentityConflict, 'migration refuses to republish');
	const sim = botNight(31);
	const capture = sim.rows.find((row) => row.payload.type === 'capture');
	await assert.rejects(archiveRecorderRow(db, capture.payload), IdentityConflict);
	assert.equal(await db.collection(COLLECTIONS.records).countDocuments(), 0);
});

test('failures are stored with the raw inputs kept; a late reveal waits for its hand unless it failed', async () => {
	const db = await freshDb();
	const sim = teenPattiTable({ seed: 41 });
	dealTeenPatti(sim);
	const folder = sim.room.currentPlayerId;
	sim.act(folder, 'pack');
	playTeenPatti(sim);
	sim.act(folder, 'reveal');
	const reveal = sim.rows.find((row) => row.payload.type === 'reveal');
	await assert.rejects(archiveRecorderRow(db, reveal.payload), NotReady);
	const capture = sim.rows.find((row) => row.payload.type === 'capture');
	const broken = structuredClone(capture.payload);
	broken.hand.steps[1].s = 'ffffffffffffffff';
	broken.hand.steps[1].h = 'ffffffffffffffff';
	await archiveRecorderRow(db, broken);
	const failure = await db.collection(COLLECTIONS.failures).findOne();
	assert.equal(failure.reason, 'replay-mismatch');
	assert.equal(failure.handId, reveal.payload.handId);
	const kept = await db.collection(COLLECTIONS.sealed).findOne({ _id: reveal.payload.handId });
	assert.equal(kept.status, 'replay-mismatch');
	assert.equal((await readSealed(kept)).capture.hand.steps.length, broken.hand.steps.length);
	await archiveRecorderRow(db, reveal.payload); // resolved: nothing to amend
	assert.equal(await db.collection(COLLECTIONS.records).countDocuments(), 0);
	assert.deepEqual((await verifyStoredHands(db)).keptForRebuild, [{ id: kept._id, status: 'replay-mismatch' }]);
});

test('recorder health answers attempted, recorded, failed, waiting, last good hand and reasons', async () => {
	const db = await freshDb();
	const sim = botNight(51);
	await archiveAll(db, sim.rows);
	// A second room that keeps failing, with one hand waiting.
	await writeRoomStatus(db, sim.room.name, {
		stats: sim.state.stats,
		pending: { total: 0, capture: 0 },
		consecutiveFailures: 0,
		lastSuccessAt: new Date()
	});
	await writeRoomStatus(db, 'stuck-room', {
		stats: { handsStarted: 4, captured: 3, failed: 0 },
		pending: { total: 2, capture: 1, nightEvent: 1 },
		consecutiveFailures: 5,
		lastError: 'Analytics schema is at version 0, needs 2',
		failingSince: Date.now() - 60_000
	});
	// The leaderboard archive saw one more hand than the recorder accounts for.
	const record = await db.collection(COLLECTIONS.records).findOne();
	await db.collection('club_hands').insertMany([
		{ _id: record._id, completedAt: record.completedAt },
		{ _id: 'ghost-room:h9', completedAt: record.completedAt + 1 }
	]);
	const health = await recorderHealth(db);
	assert.equal(health.attempted, sim.state.stats.handsStarted + 4);
	assert.equal(health.recorded, 2);
	assert.equal(health.failed, 0);
	assert.deepEqual(health.waitingForRetry.hands, 1);
	assert.equal(health.waitingForRetry.rooms[0].room, 'stuck-room');
	assert.deepEqual(health.repeatedlyRetrying.map((r) => r.room), ['stuck-room']);
	assert.match(health.repeatedlyRetrying[0].lastError, /schema/);
	assert.ok(health.lastSuccessfulHand.id);
	assert.deepEqual(health.unaccountedHands, ['ghost-room:h9']);
});
