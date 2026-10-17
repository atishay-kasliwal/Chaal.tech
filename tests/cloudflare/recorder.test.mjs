import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { verifyStoredHands, migrateAnalytics, recorderHealth, COLLECTIONS } from '../../server/analytics/store.mjs';
import { baseURL, origin, closeClub, createSession, openPlayer } from './club-helper.mjs';

const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
test.after(async () => {
	await mongo.close();
	await closeClub();
});

async function createBootTable(session) {
	const response = await fetch(`${baseURL}/rooms`, {
		method: 'POST',
		headers: { Origin: origin, Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			event: 'createRoom',
			args: ['', 1000, 'classic-1', 'teen-patti', { boot: 10, autoReady: true }],
			meta: { commandId: randomUUID() }
		})
	});
	return response.json();
}

const until = async (check, tries = 80) => {
	for (let attempt = 0; attempt < tries; attempt++) {
		const value = await check();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
	return null;
};

test('the Worker reports its engine build', async () => {
	const health = await (await fetch(`${baseURL}/health`)).json();
	assert.deepEqual(health, { ok: true, service: 'chaal-game', engineBuild: 'test' });
});

test('a real hand with a bot is recorded in three tiers and replays exactly from storage', async (t) => {
	// Schema administration is a separate, deliberate step (the runtime never does it).
	await migrateAnalytics(db);
	const hostSession = await createSession({ nickname: 'Recorder host' });
	const guestSession = await createSession({ nickname: 'Recorder guest' });
	const created = await createBootTable(hostSession);
	assert.equal(created.ok, true, JSON.stringify(created));
	const room = created.roomName;
	const host = openPlayer(hostSession, room);
	const guest = openPlayer(guestSession, room);
	t.after(() => {
		host.ws.close();
		guest.ws.close();
	});
	await Promise.all([host.open, guest.open]);
	assert.equal((await host.send('joinRoom', ['Host', room], false)).ok, true);
	await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList?.length === 1);
	assert.equal((await guest.send('joinRoom', ['Guest', room], false)).ok, true);
	await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList?.length === 2);
	const added = await host.send('addBot', ['hard']);
	assert.equal(added.ok, true, JSON.stringify(added));
	await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList?.length === 3);
	const started = await host.send('start', [room, 0, 3, 'classic-1', 'selected']);
	assert.equal(started.ok, true, JSON.stringify(started));
	await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.revision >= started.revision);

	// Humans pack on their turn; the bot plays on its own (the room's alarm), until the hand ends.
	for (let turn = 0; turn < 20; turn++) {
		const view = host.view;
		if (!view.isStarted || view.gameShow) break;
		const current = view.usersList[view.currentPlayer]?.id;
		const human = [host, guest].find((player) => player.session.playerId === current);
		if (human) {
			await human.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.revision >= view.revision);
			const packed = await human.send('play', [true, 0]);
			assert.equal(packed.ok, true, JSON.stringify(packed));
			await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.revision >= packed.revision);
		} else await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.revision > view.revision);
	}
	assert.ok(host.view.gameShow, 'the hand ended');

	const record = await until(() => db.collection(COLLECTIONS.records).findOne({ room }));
	assert.ok(record, 'the outbox delivered the public record');
	assert.equal(record.complete, true);
	assert.equal(record.seats.length, 3);
	const bot = record.seats.find((seat) => seat.kind === 'bot');
	assert.equal(bot.bot.styleId, 'legacy-hard@1');
	assert.equal(bot.bot.policy, 'tp-heuristic@1');
	assert.equal(record.engine, 'test', 'the engine build is recorded');
	assert.deepEqual(record.versions, {
		engine: 'test', recorder: 2, game: 'teen-patti', gameVersion: 1, rulesVersion: 'classic-1', variant: { id: 'classic', version: 1 }
	});
	assert.equal(await db.collection(COLLECTIONS.private).countDocuments({ handId: record._id }), 3);
	const { readSealed } = await import('../../server/analytics/store.mjs');
	const sealed = await readSealed(await db.collection(COLLECTIONS.sealed).findOne({ _id: record._id }));
	assert.ok(sealed.steps.length >= 2);
	for (const trace of sealed.botTrace) assert.equal(trace.verified, 'reproduced');
	assert.equal(await db.collection(COLLECTIONS.failures).countDocuments({ room }), 0);
	const night = await until(() => db.collection(COLLECTIONS.nights).findOne({ room }));
	assert.ok(night.events.some((event) => event.a === 'addBot' && event.identity?.styleId === 'legacy-hard@1'));

	// The stored hand replays from its sealed inputs in this process, outside Cloudflare.
	const report = await verifyStoredHands(db, { filter: { _id: record._id } });
	assert.deepEqual(report, {
		checked: 1, reproduced: 1, compatible: 0, unavailable: [], mismatched: [], missingPublic: [], keptForRebuild: []
	});

	// The room reported its recorder counters after flushing.
	const status = await until(() => db.collection(COLLECTIONS.status).findOne({ room }));
	assert.equal(status.stats.handsStarted, 1);
	assert.equal(status.stats.captured, 1);
	assert.equal(status.engineBuild, 'test');
	const health = await recorderHealth(db);
	assert.ok(health.recorded >= 1);
	assert.equal(health.repeatedlyRetrying.length, 0);
});
