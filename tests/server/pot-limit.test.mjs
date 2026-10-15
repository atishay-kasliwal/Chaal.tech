import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import {
	newRoom,
	transition,
	projection,
	invariant,
	playing,
	POT_LIMITS
} from '../../server/engine.mjs';

const c = (rank, suit) => ({ rank, suit });
const ids = ['a', 'b', 'c'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, connected };

function deckFor(...hands) {
	const dealt = [];
	for (let i = 0; i < hands[0].length; i++) for (const hand of hands) dealt.push(hand[i]);
	const key = (card) => `${card.rank}:${card.suit}`;
	const used = new Set(dealt.map(key));
	return [...dealt, ...freshDeck().filter((card) => !used.has(key(card)))];
}

function table({ boot = 10, potLimit = 64, table: chips = 5000 } = {}) {
	let room = newRoom('limit-room', chips, 'a', 'classic-1', { boot, autoReady: true, potLimit });
	for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
	return room;
}
const deal = (room, deck) =>
	transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck, handId: 'h', requireReady: true }
	);

/** Everyone keeps raising blind (the fastest way to grow the pot) until the hand ends. */
function raiseUntilDone(room) {
	let steps = 0;
	while (playing(room)) {
		assert.ok(++steps < 100, 'pot limit never triggered');
		const legal = projection(room, room.currentPlayerId, connected).legalActions;
		room = transition(room, room.currentPlayerId, 'bet', { amount: legal.maxBet }, ctx);
		invariant(room);
	}
	return room;
}

test('Pot limits are validated and shown to players', () => {
	for (const bad of [1, 100, -64, '128', 1024])
		assert.throws(
			() => newRoom('bad-limit', 5000, 'a', 'classic-1', { boot: 10, potLimit: bad }),
			/Pot limit/
		);
	assert.deepEqual(POT_LIMITS, [0, 64, 128, 256, 512]);
	assert.equal(projection(table(), 'a', connected).potLimit, 64);
	assert.equal(projection(table({ potLimit: 0 }), 'a', connected).potLimit, 0);
});

test('Reaching the pot limit forces a Show: everyone still in reveals and the best hand wins', () => {
	const hands = [
		[c(9, 'hearts'), c(9, 'spades'), c(4, 'clubs')], // a: pair of 9s
		[c(14, 'hearts'), c(14, 'spades'), c(14, 'clubs')], // b: trail of Aces
		[c(13, 'diamonds'), c(7, 'clubs'), c(2, 'hearts')] // c: King high
	];
	let room = raiseUntilDone(deal(table(), deckFor(...hands)));
	assert.equal(room.result.reason, 'pot-limit');
	assert.equal(room.result.winnerId, 'b');
	assert.deepEqual([...room.result.revealedPlayerIds].sort(), ['a', 'b', 'c']);
	assert.ok(room.result.amount >= 640, `pot ${room.result.amount}`);
	assert.equal(room.pot, 0);
	// Every viewer now sees all three hands, with names.
	for (const viewer of ids)
		assert.ok(
			projection(room, viewer, connected).usersList.every(
				(u) => u.cardsInHand[0].rank > 0 && u.handName
			)
		);
	invariant(room);
});

test('Packed players are not part of the forced Show', () => {
	const hands = [
		[c(2, 'hearts'), c(5, 'spades'), c(7, 'clubs')],
		[c(14, 'hearts'), c(14, 'spades'), c(14, 'clubs')],
		[c(13, 'diamonds'), c(13, 'clubs'), c(2, 'diamonds')]
	];
	let room = deal(table(), deckFor(...hands));
	room = transition(room, 'b', 'pack', {}, ctx); // the trail packs blind
	room = raiseUntilDone(room);
	assert.equal(room.result.reason, 'pot-limit');
	assert.equal(room.result.winnerId, 'c');
	assert.deepEqual([...room.result.revealedPlayerIds].sort(), ['a', 'c']);
});

test('Equal best hands split the pot exactly; the odd rupee goes to the first tied player', () => {
	const hands = [
		[c(13, 'hearts'), c(12, 'spades'), c(9, 'clubs')],
		[c(13, 'spades'), c(12, 'clubs'), c(9, 'hearts')],
		[c(5, 'diamonds'), c(3, 'clubs'), c(2, 'hearts')]
	];
	// Boot 1 makes odd pots possible.
	let room = deal(table({ boot: 1, potLimit: 64, table: 1000 }), deckFor(...hands));
	room = transition(room, 'b', 'bet', { amount: 1 }, ctx);
	room = transition(room, 'c', 'bet', { amount: 2 }, ctx);
	room = raiseUntilDone(room);
	assert.equal(room.result.reason, 'pot-limit-split');
	const { winners, amount } = room.result;
	assert.deepEqual(winners.map((w) => w.id).sort(), ['a', 'b']);
	assert.equal(
		winners.reduce((sum, w) => sum + w.amount, 0),
		amount
	);
	assert.ok(Math.abs(winners[0].amount - winners[1].amount) <= 1);
	assert.ok(winners[0].amount >= winners[1].amount);
	assert.equal(room.result.winnerName, 'a & b');
	assert.deepEqual(projection(room, 'c', connected).result.winners, winners);
	invariant(room);
});

test('Without a limit the hand carries on; the host changes the limit between hands only', () => {
	let room = deal(table({ potLimit: 0 }), freshDeck());
	for (let i = 0; i < 6; i++) {
		const legal = projection(room, room.currentPlayerId, connected).legalActions;
		room = transition(room, room.currentPlayerId, 'bet', { amount: legal.maxBet }, ctx);
	}
	assert.ok(playing(room) && room.pot > 640);
	assert.throws(
		() => transition(room, 'a', 'setPotLimit', { potLimit: 128 }, ctx),
		/between hands/
	);
	while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	assert.throws(() => transition(room, 'b', 'setPotLimit', { potLimit: 128 }, ctx), /host/);
	assert.throws(() => transition(room, 'a', 'setPotLimit', { potLimit: 100 }, ctx), /Pot limit/);
	room = transition(room, 'a', 'setPotLimit', { potLimit: 128 }, ctx);
	assert.equal(projection(room, 'b', connected).potLimit, 128);
	room = transition(room, 'a', 'setPotLimit', { potLimit: 0 }, ctx);
	assert.equal(room.potLimit, undefined);
});
