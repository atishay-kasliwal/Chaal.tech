import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { handValue, newRoom, projection, transition } from '../../server/blackjack/blackjack.mjs';

const connected = new Set(['a', 'b']);
const ctx = { now: 100, turnMs: 10000, connected, handId: 'blackjack-1' };
const card = (rank, suit = 'spades') => ({ rank, suit });
function arrangedDeck(front) {
	const used = new Set(front.map((value) => `${value.rank}:${value.suit}`));
	return [...front, ...freshDeck().filter((value) => !used.has(`${value.rank}:${value.suit}`))];
}
function readyRoom(name = 'blackjack-room') {
	let room = newRoom(name, 100, 'a');
	for (const id of ['a', 'b']) room = transition(room, id, 'join', { username: id }, ctx);
	for (const id of ['a', 'b']) room = transition(room, id, 'ready', { ready: true }, ctx);
	return room;
}

test('Blackjack hand values count aces high when possible and soft when appropriate', () => {
	assert.deepEqual(handValue([card(14), card(6)]), { total: 17, soft: true });
	assert.deepEqual(handValue([card(14), card(9), card(5)]), { total: 15, soft: false });
	assert.deepEqual(handValue([card(14), card(14), card(9)]), { total: 21, soft: true });
});
test('Blackjack keeps private hands and the dealer hole card hidden until settlement', () => {
	let room = readyRoom();
	const deck = arrangedDeck([card(10), card(9, 'hearts'), card(6, 'clubs'), card(7), card(8, 'diamonds'), card(10, 'hearts')]);
	room = transition(room, 'a', 'start', {}, { ...ctx, deck });
	const a = projection(room, 'a', connected);
	const b = projection(room, 'b', connected);
	assert.equal(a.usersList[0].cardsInHand[0].rank, 10);
	assert.equal(b.usersList[0].cardsInHand[0].rank, 0);
	assert.equal(a.dealerCards[1].rank, 0);
});

test('Blackjack stands on soft 17, settles a dealer bust, and pays a natural at 3:2', () => {
	let room = readyRoom();
	// a has A+K; b has 10+7; dealer shows 6 and has a hidden 10, then draws a 9.
	const deck = arrangedDeck([card(14), card(10, 'hearts'), card(6, 'clubs'), card(13), card(7, 'diamonds'), card(10, 'clubs'), card(9, 'hearts')]);
	room = transition(room, 'a', 'start', {}, { ...ctx, deck });
	assert.equal(room.currentPlayerId, 'b');
	room = transition(room, 'b', 'stand', {}, ctx);
	assert.equal(room.gameShow, true);
	assert.equal(room.dealerCards.length, 3);
	assert.equal(room.players.find((player) => player.id === 'a').blackjackOutcome, 'blackjack');
	assert.equal(room.players.find((player) => player.id === 'a').balance, 103);
	assert.equal(room.players.find((player) => player.id === 'b').blackjackOutcome, 'win');
	assert.equal(room.players.reduce((sum, player) => sum + player.balance, 0), room.issuedChips);
});

test('Blackjack rejects invalid wagers, out-of-turn actions, and doubling after a hit without mutating state', () => {
	let room = readyRoom();
	assert.throws(() => transition(room, 'a', 'bet', { amount: 3 }, ctx), /even amount/i);
	room = transition(room, 'a', 'start', {}, { ...ctx, deck: freshDeck() });
	const before = structuredClone(room);
	const wrong = room.players.find((player) => player.id !== room.currentPlayerId);
	assert.throws(() => transition(room, wrong.id, 'hit', {}, ctx), /turn/i);
	assert.deepEqual(room, before);
	const actor = room.currentPlayerId;
	room = transition(room, actor, 'hit', {}, ctx);
	if (room.currentPlayerId === actor && room.players.find((player) => player.id === actor).status === 'playing') {
		const hitRoom = structuredClone(room);
		assert.throws(() => transition(room, actor, 'double', {}, ctx), /first two cards/i);
		assert.deepEqual(room, hitRoom);
	}
});
