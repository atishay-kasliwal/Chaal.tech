import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, playing } from '../../server/engine.mjs';
import { settleUp } from '../../server/settle-up.mjs';

/**
 * Real money: only what moves between people counts, bots never, and the night settles with the
 * fewest payments.
 */

test('settle up: one loser pays each winner directly', () => {
	const payments = settleUp([
		{ id: 'aditya', name: 'Aditya', net: -300 },
		{ id: 'atishay', name: 'Atishay', net: 100 },
		{ id: 'divyansh', name: 'Divyansh', net: 100 },
		{ id: 'adarsh', name: 'Adarsh', net: 100 }
	]);
	assert.equal(payments.length, 3);
	assert.ok(payments.every((p) => p.from === 'aditya' && p.amount === 100));
});

test('settle up: a loss and a win of the same size is one payment', () => {
	assert.deepEqual(
		settleUp([
			{ id: 'aditya', name: 'Aditya', net: -300 },
			{ id: 'atishay', name: 'Atishay', net: 0 },
			{ id: 'divyansh', name: 'Divyansh', net: 300 }
		]),
		[{ from: 'aditya', fromName: 'Aditya', to: 'divyansh', toName: 'Divyansh', amount: 300 }]
	);
});

test('settle up: at most one payment fewer than the people involved, and everyone ends square', () => {
	const people = [
		{ id: 'a', name: 'A', net: -300 },
		{ id: 'b', name: 'B', net: -100 },
		{ id: 'c', name: 'C', net: 250 },
		{ id: 'd', name: 'D', net: 150 }
	];
	const payments = settleUp(people);
	assert.ok(payments.length <= 3);
	const left = Object.fromEntries(people.map((p) => [p.id, p.net]));
	for (const p of payments) {
		left[p.from] += p.amount;
		left[p.to] -= p.amount;
	}
	assert.ok(Object.values(left).every((v) => v === 0));
});

const connected = new Set(['a', 'b']);
const ctx = { now: 1000, turnMs: 90000, connected };
function table(withBot, potLimit = 0) {
	let room = newRoom('money-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true, potLimit });
	for (const id of ['a', 'b']) room = transition(room, id, 'join', { username: id }, ctx);
	if (withBot)
		room = transition(
			room,
			'a',
			'addBot',
			{ botId: 'bot-0001', name: 'Bunty', level: 'easy' },
			ctx
		);
	return room;
}
const deal = (room, deck = freshDeck()) =>
	transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3, rulesVersion: 'classic-1' },
		{ ...ctx, deck, handId: `h${room.revision}`, requireReady: true }
	);

test('winning a bot’s chips does not count as real money; neither does losing to a bot', () => {
	let room = deal(table(true));
	// Everyone puts in the boot; then b and the bot pack, a wins.
	while (playing(room)) {
		const turn = room.currentPlayerId;
		room = transition(
			room,
			turn,
			turn === 'a' ? 'bet' : 'pack',
			turn === 'a' ? { amount: 20 } : {},
			ctx
		);
	}
	assert.equal(room.result.winnerId, 'a');
	const real = Object.fromEntries(
		projection(room, 'a', connected).realNet.map((p) => [p.id, p.net])
	);
	// a won b's boot (10) for real; the bot's boot is not real money.
	assert.deepEqual(real, { a: 10, b: -10 });
	// Now the bot wins a hand: a and b pack.
	room = deal(room);
	while (playing(room))
		room = transition(
			room,
			room.currentPlayerId,
			room.currentPlayerId.startsWith('bot') ? 'bet' : 'pack',
			room.currentPlayerId.startsWith('bot') ? { amount: 20 } : {},
			ctx
		);
	assert.equal(room.result.winnerId, 'bot-0001');
	const after = Object.fromEntries(
		projection(room, 'a', connected).realNet.map((p) => [p.id, p.net])
	);
	assert.deepEqual(after, { a: 10, b: -10 }, 'losing to a bot costs nothing real');
	assert.deepEqual(projection(room, 'b', connected).settleUp, [
		{ from: 'b', fromName: 'b', to: 'a', toName: 'a', amount: 10 }
	]);
});

function rng(seed) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 2 ** 32;
	};
}

test('random nights: real money always sums to zero; with no bots it matches the chips exactly', () => {
	for (const withBot of [false, true])
		for (let seed = 1; seed <= 25; seed++) {
			const random = rng(seed * 7919);
			// Some nights run into the pot limit, so forced Shows and split pots happen too.
			let room = table(withBot, [0, 64, 128][seed % 3]);
			for (let hand = 0; hand < 8; hand++) {
				const deck = freshDeck();
				for (let i = deck.length - 1; i > 0; i--) {
					const j = Math.floor(random() * (i + 1));
					[deck[i], deck[j]] = [deck[j], deck[i]];
				}
				if (room.players.filter((p) => p.balance >= 10).length < 2) break;
				room = deal(room, deck);
				let steps = 0;
				while (playing(room) && steps++ < 200) {
					const turn = room.currentPlayerId;
					const legal = projection(room, turn, new Set([...connected, 'bot-0001'])).legalActions;
					const r = random();
					if (legal.show && r < 0.2) room = transition(room, turn, 'show', {}, ctx);
					else if (legal.bet && r < 0.85)
						room = transition(room, turn, 'bet', { amount: legal.minBet }, ctx);
					else room = transition(room, turn, 'pack', {}, ctx);
				}
				const real = projection(room, 'a', connected).realNet ?? [];
				assert.equal(
					real.reduce((sum, p) => sum + p.net, 0),
					0,
					'real money sums to zero'
				);
				if (!withBot)
					for (const p of real)
						assert.equal(p.net, room.players.find((x) => x.id === p.id).balance - room.table);
			}
		}
});
