import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { migrateAnalytics } from '../../server/analytics/store.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { baseURL, createSession, createRoom, openPlayer, closeClub } from './club-helper.mjs';

const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
test.after(async () => {
	await mongo.close();
	await closeClub();
});

/* One person and Chaal characters at each trick game, through the real Worker: the characters sit
 * down, the hand starts, and the characters play their turns. */
for (const [game, characters] of [
	['three-two-five', ['rohit-sharma', 'ms-dhoni']],
	['ten-pakad', ['rohit-sharma', 'ms-dhoni', 'gg']],
	['twenty-nine', ['virat-kohli', 'samay-raina', 'gg']]
])
	test(`${game}: one person with characters, the hand starts and the characters play`, async (t) => {
		assert.ok(baseURL, 'the test runner must set CHAAL_CF_TEST_URL');
		await migrateAnalytics(db);
		await seedCharacters(db);
		const session = await createSession();
		const created = await createRoom(session, randomUUID(), game);
		assert.equal(created.result.ok, true, JSON.stringify(created.result));
		const name = created.result.roomName;
		const me = openPlayer(session, name);
		t.after(() => me.ws.close());
		await me.open;
		assert.equal((await me.send('joinRoom', ['Me', name], false)).ok, true);
		await me.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList?.length === 1);
		for (const [k, id] of characters.entries()) {
			const added = await me.send('addBot', [id]);
			assert.equal(added.ok, true, `${id}: ${JSON.stringify(added)}`);
			await me.waitFor((p) => p.args?.[0]?.usersList?.length === k + 2);
		}
		const ready = await me.send('ready', [true]);
		assert.equal(ready.ok, true, JSON.stringify(ready));
		await me.waitFor((p) => p.args?.[0]?.revision === ready.revision);
		const started = await me.send('start', [name]);
		assert.equal(started.ok, true, JSON.stringify(started));
		await me.waitFor((p) => p.args?.[0]?.isStarted === true);
		// Some character makes a move within the bots' thinking time.
		const startRevision = me.view.revision;
		const botIds = me.view.usersList.filter((u) => u.isBot).map((u) => u.id);
		await me.waitFor((p) => {
			const v = p.args?.[0];
			if (!v || v.revision <= startRevision) return false;
			return botIds.includes(v.currentPlayerId) === false || v.revision > startRevision + 1;
		}, 20000);
	});
