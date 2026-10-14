import test from 'node:test';
import assert from 'node:assert/strict';
import { freshRummyDeck, isValidIndianRummyHand, minimumPenalty, newRoom, projection, transition } from '../../server/rummy/rummy.mjs';

const connected = new Set(['a', 'b']);
const ctx = { now: 100, turnMs: 10000, connected, handId: 'rummy-1' };
const card = (rank, suit, copy = 0) => ({ rank, suit, copy });
const validHand = [
	card(3, 'hearts'), card(4, 'hearts'), card(5, 'hearts'),
	card(7, 'clubs'), card(8, 'clubs'), card(9, 'clubs'),
	card(10, 'spades'), card(11, 'spades'), card(12, 'spades'),
	card(6, 'diamonds'), card(7, 'diamonds'), card(8, 'diamonds'), card(9, 'diamonds')
];

test('13-card Indian Rummy requires a pure sequence and at least two total sequences', () => {
	assert.equal(isValidIndianRummyHand(validHand, 2), true);
	const withoutPure = [card(5, 'hearts'), card(5, 'spades'), card(5, 'diamonds'), card(5, 'clubs'), ...Array.from({ length: 4 }, (_, copy) => card(0, 'joker', copy)), card(3, 'hearts'), card(7, 'spades'), card(9, 'diamonds'), card(12, 'clubs'), card(4, 'spades')];
	assert.equal(isValidIndianRummyHand(withoutPure, 5), false);
	assert.equal(isValidIndianRummyHand(validHand.slice(0, 12), 2), false);
});
test('Indian Rummy scores unmatched cards and caps invalid hands at 80 points', () => {
	assert.equal(minimumPenalty(validHand, 2), 0);
	const loose = Array.from({ length: 13 }, (_, index) => card(2 + (index % 13), ['hearts', 'spades', 'diamonds', 'clubs'][Math.floor(index / 4)], 0));
	assert.ok(minimumPenalty(loose, 14) >= 0 && minimumPenalty(loose, 14) <= 80);
	assert.equal(minimumPenalty(Array.from({ length: 13 }, (_, index) => card(14, 'hearts', index)), 2), 80);
});

function dealValidHand() {
	let room = newRoom('rummy-room', 100, 'b');
	for (const id of ['a', 'b']) room = transition(room, id, 'join', { username: id }, ctx);
	for (const id of ['a', 'b']) room = transition(room, id, 'ready', { ready: true }, ctx);
	const deck = freshRummyDeck();
	const indicator = card(2, 'hearts', 0);
	const hand = validHand;
	const available = deck.filter((candidate) => `${candidate.rank}:${candidate.suit}:${candidate.copy}` !== `${indicator.rank}:${indicator.suit}:${indicator.copy}` && !hand.some((used) => `${candidate.rank}:${candidate.suit}:${candidate.copy}` === `${used.rank}:${used.suit}:${used.copy}`));
	const opponent = available.slice(0, 13);
	const used = new Set([indicator, ...hand, ...opponent].map((candidate) => `${candidate.rank}:${candidate.suit}:${candidate.copy}`));
	const rest = deck.filter((candidate) => !used.has(`${candidate.rank}:${candidate.suit}:${candidate.copy}`));
	const arranged = [indicator];
	for (let i = 0; i < 13; i++) arranged.push(hand[i], opponent[i]);
	arranged.push(...rest);
	room = transition(room, 'b', 'start', {}, { ...ctx, deck: arranged });
	return room;
}

test('Rummy gives each player 13 private cards and a public indicator/discard', () => {
	const room = dealValidHand();
	const own = projection(room, 'a', connected);
	const other = projection(room, 'b', connected);
	assert.equal(own.usersList[0].cardsInHand.length, 13);
	assert.equal(other.usersList[0].cardsInHand[0].rank, 0);
	assert.equal(own.indicator.rank, 2);
	assert.equal(own.discardPile.length, 1);
	assert.equal(own.stockCount, 80);
});

test('Rummy requires draw then discard, validates declaration on the server, and settles point penalties', () => {
	let room = dealValidHand();
	assert.equal(room.currentPlayerId, 'a');
	assert.throws(() => transition(room, 'a', 'discard', { index: 0 }, ctx), /draw a card/i);
	room = transition(room, 'a', 'draw-stock', {}, ctx);
	assert.equal(room.players.find((player) => player.id === 'a').cards.length, 14);
	room = transition(room, 'a', 'declare', { index: 13 }, ctx);
	assert.equal(room.gameShow, true);
	assert.equal(room.result.winnerId, 'a');
	assert.equal(room.players.reduce((sum, player) => sum + player.balance, 0), room.issuedChips);
	assert.equal(room.players.find((player) => player.id === 'a').cards.length, 13);
});
