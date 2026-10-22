import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { baseURL, createSession, createRoom, openPlayer, closeClub } from './club-helper.mjs';

test.after(closeClub);

/* 10 Pakad through the real Worker and Durable Object: four seats, partnerships, hidden cards,
 * rule errors as messages, play reaching everyone, and a player who drops and comes back. */
test('10 Pakad room: four seats, private hands, partnerships, play, and a reconnect', async (t) => {
	assert.ok(baseURL, 'the test runner must set CHAAL_CF_TEST_URL');
	const sessions = await Promise.all([1, 2, 3, 4].map(() => createSession()));
	const created = await createRoom(sessions[0], randomUUID(), 'ten-pakad');
	assert.equal(created.result.ok, true, JSON.stringify(created.result));
	const name = created.result.roomName;
	const players = sessions.map((s) => openPlayer(s, name));
	t.after(() => players.forEach((p) => p.ws.close()));
	await Promise.all(players.map((p) => p.open));
	for (const [i, p] of players.entries()) {
		assert.equal((await p.send('joinRoom', [`P${i}`, name], false)).ok, true);
		await Promise.all(
			players
				.slice(0, i + 1)
				.map((q) =>
					q.waitFor(
						(packet) => packet.event === 'roomData' && packet.args?.[0]?.usersList?.length === i + 1
					)
				)
		);
	}
	// A fifth person is refused: 10 Pakad is for four.
	const fifth = openPlayer(await createSession(), name);
	t.after(() => fifth.ws.close());
	await fifth.open;
	assert.equal((await fifth.send('joinRoom', ['P4', name], false)).ok, false);
	for (const p of players) {
		const ready = await p.send('ready', [true]);
		assert.equal(ready.ok, true, JSON.stringify(ready));
		await Promise.all(
			players.map((q) => q.waitFor((packet) => packet.args?.[0]?.revision === ready.revision))
		);
	}
	const started = await players[0].send('start', [name]);
	assert.equal(started.ok, true, JSON.stringify(started));
	await Promise.all(players.map((p) => p.waitFor((packet) => packet.args?.[0]?.stage === 'open')));
	const view = players[0].view;
	assert.equal(view.gameType, 'ten-pakad');
	assert.equal(view.trump, null);
	assert.deepEqual(Object.values(view.teams).sort(), [0, 0, 1, 1]);
	for (const p of players) {
		const me = p.view.usersList.find((u) => u.id === p.session.playerId);
		const others = p.view.usersList.filter((u) => u.id !== p.session.playerId);
		assert.equal(me.cardsInHand.length, 5);
		assert.ok(me.cardsInHand.every((c) => c.rank > 0));
		assert.ok(others.every((u) => u.cardsInHand.every((c) => c.rank === 0 && c.suit === '')));
	}
	const leader = players.find((p) => p.session.playerId === view.order[0]);
	const waiting = players.find((p) => p !== leader);
	// Out of turn: the player sees the reason, not a service failure.
	const early = await waiting.send('trickAction', [
		'play',
		{ card: waiting.view.usersList.find((u) => u.id === waiting.session.playerId).cardsInHand[0] }
	]);
	assert.equal(early.ok, false);
	assert.match(early.error ?? early.message ?? JSON.stringify(early), /turn/i);

	const first = leader.view.legalActions.play[0];
	const played = await leader.send('trickAction', ['play', { card: first }]);
	assert.equal(played.ok, true, JSON.stringify(played));
	await Promise.all(
		players.map((p) => p.waitFor((packet) => packet.args?.[0]?.trick?.plays?.length === 1))
	);

	// Someone drops: the others see them away, their seat and cards are kept, and they resume.
	const dropper = players.find((p) => p !== leader);
	const handBefore = JSON.stringify(
		dropper.view.usersList.find((u) => u.id === dropper.session.playerId).cardsInHand
	);
	dropper.ws.close();
	await leader.waitFor(
		(packet) =>
			packet.args?.[0]?.usersList?.find((u) => u.id === dropper.session.playerId)?.connected ===
			false
	);
	const back = openPlayer(dropper.session, name);
	t.after(() => back.ws.close());
	await back.open;
	assert.equal((await back.send('resumeRoom', [name], false)).ok, true);
	await back.waitFor((packet) => packet.args?.[0]?.trick?.plays?.length === 1);
	assert.equal(
		JSON.stringify(back.view.usersList.find((u) => u.id === dropper.session.playerId).cardsInHand),
		handBefore
	);
});
