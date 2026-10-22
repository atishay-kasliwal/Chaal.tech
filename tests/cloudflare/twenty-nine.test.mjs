import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { baseURL, createSession, createRoom, openPlayer, closeClub } from './club-helper.mjs';

test.after(closeClub);

/* 29 through the real Worker and Durable Object: four seats, the auction, a secret trump that only
 * the bidder sees, rule errors as messages, and a player who drops and comes back. */
test('29 room: four seats, bidding, secret trump, and a reconnect', async (t) => {
	assert.ok(baseURL, 'the test runner must set CHAAL_CF_TEST_URL');
	const sessions = await Promise.all([1, 2, 3, 4].map(() => createSession()));
	const created = await createRoom(sessions[0], randomUUID(), 'twenty-nine');
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
	for (const p of players) {
		const ready = await p.send('ready', [true]);
		assert.equal(ready.ok, true, JSON.stringify(ready));
		await Promise.all(
			players.map((q) => q.waitFor((packet) => packet.args?.[0]?.revision === ready.revision))
		);
	}
	const started = await players[0].send('start', [name]);
	assert.equal(started.ok, true, JSON.stringify(started));
	await Promise.all(players.map((p) => p.waitFor((packet) => packet.args?.[0]?.stage === 'bid')));
	const order = players[0].view.order;
	const seat = (k) => players.find((p) => p.session.playerId === order[k]);
	for (const p of players)
		assert.equal(p.view.usersList.find((u) => u.id === p.session.playerId).cardsInHand.length, 4);
	// Out of turn: the reason, not a service failure.
	const early = await seat(1).send('trickAction', ['pass', {}]);
	assert.equal(early.ok, false);
	// The first player bids 16; the other three pass.
	assert.equal((await seat(0).send('trickAction', ['bid', { value: 16 }])).ok, true);
	for (const k of [1, 2, 3]) {
		await seat(k).waitFor((packet) => packet.args?.[0]?.currentPlayerId === order[k]);
		assert.equal((await seat(k).send('trickAction', ['pass', {}])).ok, true);
	}
	const bidder = seat(0);
	await bidder.waitFor((packet) => packet.args?.[0]?.stage === 'trump');
	const card = bidder.view.legalActions.chooseTrump[0];
	assert.equal((await bidder.send('trickAction', ['chooseTrump', { card }])).ok, true);
	await Promise.all(players.map((p) => p.waitFor((packet) => packet.args?.[0]?.stage === 'play')));
	for (const p of players) {
		const v = p.view;
		const mine = p === bidder;
		assert.equal(v.trump, mine ? card.suit : null);
		assert.equal(!!v.indicator, mine);
		assert.equal(
			v.usersList.find((u) => u.id === p.session.playerId).cardsInHand.length,
			mine ? 7 : 8
		);
	}

	// Someone drops: their seat and cards are kept, and they resume.
	const dropper = seat(2);
	const handBefore = JSON.stringify(
		dropper.view.usersList.find((u) => u.id === dropper.session.playerId).cardsInHand
	);
	dropper.ws.close();
	await bidder.waitFor(
		(packet) =>
			packet.args?.[0]?.usersList?.find((u) => u.id === dropper.session.playerId)?.connected ===
			false
	);
	const back = openPlayer(dropper.session, name);
	t.after(() => back.ws.close());
	await back.open;
	assert.equal((await back.send('resumeRoom', [name], false)).ok, true);
	await back.waitFor((packet) => packet.args?.[0]?.stage === 'play');
	assert.equal(
		JSON.stringify(back.view.usersList.find((u) => u.id === dropper.session.playerId).cardsInHand),
		handBefore
	);
	assert.equal(back.view.trump, null, 'still secret after a reconnect');
});
