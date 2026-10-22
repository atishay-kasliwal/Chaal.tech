import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { baseURL, createSession, createRoom, openPlayer, closeClub } from './club-helper.mjs';

test.after(closeClub);

/* 3 2 5 through the real Worker and Durable Object: seats, hidden cards, trump, and a reconnect. */
test('3 2 5 room: three seats, private hands, public trump, and a player who drops and comes back', async (t) => {
	assert.ok(baseURL, 'the test runner must set CHAAL_CF_TEST_URL');
	const sessions = await Promise.all([createSession(), createSession(), createSession()]);
	const created = await createRoom(sessions[0], randomUUID(), 'three-two-five');
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
	// A fourth person is refused: 3 2 5 is for three.
	const fourth = await createSession();
	const extra = openPlayer(fourth, name);
	t.after(() => extra.ws.close());
	await extra.open;
	const refused = await extra.send('joinRoom', ['P3', name], false);
	assert.equal(refused.ok, false);
	for (const p of players) {
		const ready = await p.send('ready', [true]);
		assert.equal(ready.ok, true, JSON.stringify(ready));
		await Promise.all(
			players.map((q) => q.waitFor((packet) => packet.args?.[0]?.revision === ready.revision))
		);
	}
	const started = await players[0].send('start', [name]);
	assert.equal(started.ok, true, JSON.stringify(started));
	await Promise.all(players.map((p) => p.waitFor((packet) => packet.args?.[0]?.stage === 'trump')));
	const view = players[0].view;
	assert.equal(view.gameType, 'three-two-five');
	assert.deepEqual(Object.values(view.quotas).sort(), [2, 3, 5]);
	// Each player sees their own cards only (five for the trump chooser, none yet for the others).
	for (const p of players) {
		const me = p.view.usersList.find((u) => u.id === p.session.playerId);
		const others = p.view.usersList.filter((u) => u.id !== p.session.playerId);
		assert.ok(me.cardsInHand.every((c) => c.rank > 0));
		assert.ok(others.every((u) => u.cardsInHand.every((c) => c.rank === 0 && c.suit === '')));
	}
	const chooser = players.find((p) => p.session.playerId === view.order[0]);
	const chose = await chooser.send('trickAction', ['chooseTrump', { suit: 'hearts' }]);
	assert.equal(chose.ok, true, JSON.stringify(chose));
	await Promise.all(
		players.map((p) => p.waitFor((packet) => packet.args?.[0]?.trump === 'hearts'))
	);
	for (const p of players)
		assert.equal(p.view.usersList.find((u) => u.id === p.session.playerId).cardsInHand.length, 10);

	// Someone drops: the others see them away, their seat and cards are kept, and they resume.
	const dropper = players.find((p) => p !== chooser);
	const handBefore = JSON.stringify(
		dropper.view.usersList.find((u) => u.id === dropper.session.playerId).cardsInHand
	);
	dropper.ws.close();
	await chooser.waitFor(
		(packet) =>
			packet.args?.[0]?.usersList?.find((u) => u.id === dropper.session.playerId)?.connected ===
			false
	);
	const back = openPlayer(dropper.session, name);
	t.after(() => back.ws.close());
	await back.open;
	const resumed = await back.send('resumeRoom', [name], false);
	assert.equal(resumed.ok, true, JSON.stringify(resumed));
	await back.waitFor((packet) => packet.args?.[0]?.trump === 'hearts');
	const handAfter = JSON.stringify(
		back.view.usersList.find((u) => u.id === dropper.session.playerId).cardsInHand
	);
	assert.equal(handAfter, handBefore);
	await chooser.waitFor(
		(packet) =>
			packet.args?.[0]?.usersList?.find((u) => u.id === dropper.session.playerId)?.connected ===
			true
	);

	// The first card of the round, from the 5-player, reaches everyone.
	const first = chooser.view.legalActions.play[0];
	const played = await chooser.send('trickAction', ['play', { card: first }]);
	assert.equal(played.ok, true, JSON.stringify(played));
	await back.waitFor((packet) => packet.args?.[0]?.trick?.plays?.length === 1);
});
