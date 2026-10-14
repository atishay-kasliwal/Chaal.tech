import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, transition, projection, evaluateBestHand, compareScores } from '../../server/poker/holdem.mjs';
import { freshDeck } from '../../server/classic.mjs';

const connected = new Set(['a', 'b']);
const ctx = { now: 0, turnMs: 10000, connected, handId: 'holdem-hand-1' };
const card = (rank, suit = 'spades') => ({ rank, suit });

test('Texas Hold’em hand ranking covers categories, kickers, and wheel straights', () => {
	assert.deepEqual(evaluateBestHand([card(14), card(13), card(12), card(11), card(10), card(2, 'hearts'), card(3, 'clubs')]), [8, 14]);
	assert.deepEqual(evaluateBestHand([card(14), card(5, 'hearts'), card(4, 'clubs'), card(3, 'diamonds'), card(2, 'spades')]), [4, 5]);
	assert.deepEqual(evaluateBestHand([card(9), card(9, 'hearts'), card(9, 'clubs'), card(9, 'diamonds'), card(14, 'clubs')]), [7, 9, 14]);
	assert.deepEqual(evaluateBestHand([card(14), card(14, 'hearts'), card(14, 'clubs'), card(13, 'diamonds'), card(13, 'clubs')]), [6, 14, 13]);
	assert.deepEqual(evaluateBestHand([card(14), card(11), card(8), card(5), card(2)]), [5, 14, 11, 8, 5, 2]);
	assert.deepEqual(evaluateBestHand([card(8), card(7, 'hearts'), card(6, 'clubs'), card(5, 'diamonds'), card(4, 'spades')]), [4, 8]);
	assert.deepEqual(evaluateBestHand([card(12), card(12, 'hearts'), card(12, 'clubs'), card(14, 'diamonds'), card(11, 'clubs')]), [3, 12, 14, 11]);
	assert.deepEqual(evaluateBestHand([card(14), card(14, 'hearts'), card(8, 'clubs'), card(8, 'diamonds'), card(13, 'clubs')]), [2, 14, 8, 13]);
	assert.deepEqual(evaluateBestHand([card(14), card(14, 'hearts'), card(12, 'clubs'), card(11, 'diamonds'), card(9, 'clubs')]), [1, 14, 12, 11, 9]);
	assert.deepEqual(evaluateBestHand([card(14), card(12, 'hearts'), card(10, 'clubs'), card(7, 'diamonds'), card(3, 'clubs')]), [0, 14, 12, 10, 7, 3]);
	assert.equal(compareScores([1, 14, 10, 8, 7], [1, 14, 10, 8, 6]), 1);
});

test('Hold’em room keeps hole cards private, follows streets, and settles a showdown', () => {
	let room = newRoom('holdem-room', 50, 'a');
	for (const [id, username] of [['a', 'Alice'], ['b', 'Bob']])
		room = transition(room, id, 'join', { username }, ctx);
	room = transition(room, 'a', 'ready', { ready: true }, ctx);
	room = transition(room, 'b', 'ready', { ready: true }, ctx);
	assert.equal(projection(room, 'a', connected).usersList.every((player) => player.ready), true);
	room = transition(room, 'a', 'start', {}, { ...ctx, deck: freshDeck().reverse() });
	const own = projection(room, 'a', connected);
	const other = projection(room, 'b', connected);
	assert.equal(own.usersList[0].cardsInHand.length, 2);
	assert.deepEqual(other.usersList[0].cardsInHand, [{ rank: 0, suit: '' }, { rank: 0, suit: '' }]);
	assert.equal(room.stage, 'preflop');
	assert.equal(room.pot, 3);

	const takeTurn = (action) => {
		const actor = room.currentPlayerId;
		room = transition(room, actor, action, {}, ctx);
	};
	takeTurn('call');
	takeTurn('check');
	assert.equal(room.stage, 'flop');
	assert.equal(room.board.length, 3);
	while (room.isStarted && !room.gameShow) takeTurn('check');
	assert.equal(room.stage, 'showdown');
	assert.equal(room.board.length, 5);
	assert.equal(room.pot, 0);
	assert.equal(room.players.reduce((sum, p) => sum + p.balance, 0), room.issuedChips);
	assert.equal(projection(room, 'a', connected).usersList.every((p) => p.cardsInHand.length === 2), true);
	assert.equal(room.result.reason, 'showdown');
});

test('Poker rejects a raise that is out of turn without mutating the room', () => {
	let room = newRoom('holdem-turn', 50, 'a');
	for (const id of ['a', 'b']) room = transition(room, id, 'join', { username: id }, ctx);
	for (const id of ['a', 'b']) room = transition(room, id, 'ready', { ready: true }, ctx);
	room = transition(room, 'a', 'start', {}, { ...ctx, deck: freshDeck() });
	const before = structuredClone(room);
	const wrongPlayer = room.players.find((p) => p.id !== room.currentPlayerId);
	assert.throws(() => transition(room, wrongPlayer.id, 'raise', { amount: 8 }, ctx), /turn/i);
	assert.deepEqual(room, before);
});

test('Side pots are awarded only through the contribution levels each player covered', () => {
	let room = newRoom('holdem-sidepot', 50, 'a');
	for (const id of ['a', 'b', 'c']) room = transition(room, id, 'join', { username: id }, { ...ctx, connected: new Set(['a', 'b', 'c']) });
	room.isStarted = true;
	room.stage = 'river';
	room.board = [card(2, 'clubs'), card(3, 'diamonds'), card(4, 'hearts'), card(5, 'spades'), card(9, 'clubs')];
	room.players[0].cards = [card(6, 'clubs'), card(7, 'diamonds')]; // 7-high straight wins the main pot.
	room.players[1].cards = [card(14, 'hearts'), card(14, 'diamonds')]; // Pair of aces wins the side pot.
	room.players[2].cards = [card(13, 'hearts'), card(13, 'diamonds')];
	room.players[0].handBet = 5;
	room.players[1].handBet = 10;
	room.players[2].handBet = 10;
	room.players[0].balance = 45;
	room.players[1].balance = 40;
	room.players[2].balance = 40;
	room.players.forEach((p) => { p.streetBet = 0; p.folded = false; });
	room.issuedChips = 150;
	room.pot = 25;
	room.currentBet = 0;
	room.currentPlayerId = 'a';
	room.acted = ['b', 'c'];
	room.handId = 'side-pot-hand';
	room.deadline = 10000;
	room = transition(room, 'a', 'check', {}, ctx);
	assert.equal(room.players.find((p) => p.id === 'a').balance, 60);
	assert.equal(room.players.find((p) => p.id === 'b').balance, 50);
	assert.equal(room.players.find((p) => p.id === 'c').balance, 40);
	assert.deepEqual(room.result.winners, ['a', 'b']);
});
