import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { archiveHands } from '../../server/club/history.mjs';
import {
	baseURL,
	origin,
	members,
	closeClub,
	createSession,
	createRoom,
	openPlayer
} from './club-helper.mjs';
const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
test.after(async () => {
	await mongo.close();
	await closeClub();
});
const get = (token, query = '') =>
	fetch(`${baseURL}/club/history${query}`, {
		headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
	});

test('club record is authenticated, idempotent, paginated, and excludes practice', async () => {
	assert.equal((await get()).status, 401);
	const session = await createSession({ nickname: 'Record keeper' });
	const member = await members.findOne({ email: session.email });
	const prefix = randomUUID();
	const hands = Array.from({ length: 4 }, (_, index) => ({
		_id: `${prefix}:${index}`,
		room: prefix,
		handId: `${index}`,
		practice: false,
		gameType: 'teen-patti',
		completedAt: Date.now() + index,
		winnerName: 'Record keeper',
		amount: 20,
		players: [
			{ playerId: member.playerId, nickname: 'Record keeper', bot: false, net: 10, won: true }
		]
	}));
	try {
		await archiveHands(db, [
			...hands,
			{
				...hands[0],
				_id: `${prefix}:practice`,
				practice: true,
				players: [{ ...hands[0].players[0], net: 999 }]
			}
		]);
		await archiveHands(db, hands);
		assert.equal(await db.collection('club_hands').countDocuments({ room: prefix }), 5);
		const response = await get(session.token);
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.deepEqual(body.personal, { net: 40, wins: 4, hands: 4 });
		assert.equal(body.hands.length, 3);
		assert.equal(body.hasMore, true);
		const self = body.leaderboard.find((entry) => entry.isYou);
		assert.equal(self.net, 40);
		assert.equal(self.nickname, member.nickname);
		assert.equal(JSON.stringify(body).includes(member.email), false);
		assert.equal(JSON.stringify(body.hands).includes(member.playerId), false);
		const next = await (await get(session.token, '?page=1')).json();
		assert.notEqual(next.hands[0].id, body.hands[0].id);
		assert.equal((await get(session.token, '?page=-1')).status, 400);
		assert.equal((await get(session.token, '?period=bad')).status, 400);
	} finally {
		await db.collection('club_hands').deleteMany({ room: prefix });
	}
});

test('a real completed hand reaches MongoDB once with exact net chips and no private cards', async (t) => {
	const hostSession = await createSession({ nickname: 'History host' });
	const guestSession = await createSession({ nickname: 'History guest' });
	const created = await createRoom(hostSession, randomUUID());
	assert.equal(created.response.status, 200);
	const room = created.result.roomName;
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
	const sync = (revision) =>
		Promise.all(
			[host, guest].map((player) =>
				player.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.revision === revision)
			)
		);
	await Promise.all(
		[host, guest].map((player) =>
			player.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList?.length === 2)
		)
	);
	for (const player of [host, guest]) {
		const ready = await player.send('ready', [true]);
		assert.equal(ready.ok, true);
		await sync(ready.revision);
	}
	const initialBalances = new Map(
		[host, guest].map((player) => [
			player.session.playerId,
			player.view.usersList.find((user) => user.id === player.session.playerId).balance
		])
	);
	const started = await host.send('start', [room, 0, 3, 'classic-1', 'selected']);
	assert.equal(started.ok, true, JSON.stringify(started));
	await sync(started.revision);
	const turnId = host.view.usersList[host.view.currentPlayer].id;
	const folder = [host, guest].find((player) => player.session.playerId === turnId);
	const packed = await folder.send('play', [true, 0]);
	assert.equal(packed.ok, true, JSON.stringify(packed));
	await sync(packed.revision);
	let hand;
	for (let attempt = 0; attempt < 40; attempt++) {
		hand = await db.collection('club_hands').findOne({ room });
		if (hand) break;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.ok(hand, 'the durable outbox must archive the completed hand');
	assert.equal(hand.practice, false);
	assert.equal(hand.players.length, 2);
	assert.equal(
		hand.players.reduce((sum, player) => sum + player.net, 0),
		0
	);
	assert.ok(hand.players.find((player) => player.playerId === turnId).net < 0);
	for (const player of [host, guest]) {
		const finalBalance = player.view.usersList.find(
			(user) => user.id === player.session.playerId
		).balance;
		assert.equal(
			hand.players.find((entry) => entry.playerId === player.session.playerId).net,
			finalBalance - initialBalances.get(player.session.playerId)
		);
	}
	assert.ok(hand.players.every((player) => !('cards' in player) && !('balance' in player)));
	await archiveHands(db, [hand]);
	assert.equal(await db.collection('club_hands').countDocuments({ room }), 1);
	await db.collection('club_hands').deleteMany({ room });
});
