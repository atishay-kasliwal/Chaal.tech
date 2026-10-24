import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, invariant } from '../../server/engine.mjs';

const c = (rank, suit) => ({ rank, suit });
const H = 'hearts',
	S = 'spades',
	D = 'diamonds',
	C = 'clubs';
const ids = ['a', 'b', 'c', 'd'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, handId: 'h1', deck: freshDeck(), connected };

/** Cards dealt round-robin in seat order a, b, c, d; extra cards follow in `after`. */
function deckFor(hands, after = []) {
	const dealt = [];
	for (let i = 0; i < hands[0].length; i++) for (const hand of hands) dealt.push(hand[i]);
	const key = (card) => `${card.rank}:${card.suit}`;
	const used = new Set([...dealt, ...after].map(key));
	return [...dealt, ...after, ...freshDeck().filter((card) => !used.has(key(card)))];
}
function start(rulesVersion, hands, after = []) {
	const players = ids.slice(0, hands.length);
	let room = newRoom('round-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of players) room = transition(room, id, 'join', { username: id }, ctx);
	return transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: hands[0].length, rulesVersion },
		{ ...ctx, deck: deckFor(hands, after) }
	);
}
const view = (room, id) => projection(room, id, connected);
const live = (room) => room.players.filter((p) => !p.isPacked && p.cards.length);
/** Everyone in turn bets the minimum. */
const betMin = (room) =>
	transition(
		room,
		room.currentPlayerId,
		'bet',
		{ amount: view(room, room.currentPlayerId).legalActions.minBet },
		ctx
	);

const TRAIL = [c(9, H), c(9, S), c(9, C)];
const PAIR = [c(13, D), c(13, S), c(3, C)];
const HIGH = [c(12, H), c(7, S), c(3, D)];
const LOW = [c(8, H), c(5, S), c(2, D)];

test('Knockout: after each lap the lowest hand is knocked out and shown', () => {
	let room = start('knockout-1', [TRAIL, PAIR, HIGH, LOW]);
	for (let i = 0; i < 4; i++) room = betMin(room);
	assert.equal(live(room).length, 3);
	const out = room.players.find((p) => p.isPacked);
	assert.deepEqual(out.cards, LOW);
	assert.ok(room.shownIds.includes(out.id));
	assert.deepEqual(view(room, 'a').variantState.out, [out.id]);
	for (let i = 0; i < 3; i++) room = betMin(room);
	assert.equal(live(room).length, 2);
	// Two left: nobody else is knocked out; play goes on to a Show.
	for (let i = 0; i < 2; i++) room = betMin(room);
	assert.equal(live(room).length, 2);
	assert.equal(room.result, null);
	invariant(room);
});

test('Knockout: equal lowest hands go together unless that would leave fewer than two', () => {
	const twin = (suitA, suitB) => [c(10, suitA), c(8, suitA), c(2, suitB)];
	let room = start('knockout-1', [TRAIL, twin(H, S), twin(D, C)]);
	for (let i = 0; i < 3; i++) room = betMin(room);
	// Three players, the two lowest tie: knocking both out would leave one, so nobody goes.
	assert.equal(live(room).length, 3);
});

test('Survivor: no Show, and the last player after the knockouts takes the pot', () => {
	let room = start('survivor-1', [TRAIL, PAIR, HIGH]);
	assert.equal(view(room, room.currentPlayerId).legalActions.show, false);
	assert.throws(() => transition(room, room.currentPlayerId, 'show', {}, ctx), /no Show/);
	const pot = room.pot;
	for (let i = 0; i < 3 && !room.result; i++) room = betMin(room);
	assert.equal(live(room).length, 2);
	for (let i = 0; i < 2 && !room.result; i++) room = betMin(room);
	assert.equal(room.result.reason, 'last-standing');
	assert.equal(room.result.winnerId, 'a');
	assert.ok(room.result.amount > pot);
	assert.equal(room.players.find((p) => p.id === 'c').isPacked, true);
	invariant(room);
});

test('Sudden Death: the stake doubles every lap', () => {
	let room = start('sudden-death-1', [TRAIL, PAIR, HIGH, LOW]);
	const first = room.maxStake;
	for (let i = 0; i < 4; i++) room = betMin(room);
	// Everyone bet the minimum (the stake), then the stake doubled and the lowest hand went.
	assert.equal(room.maxStake, first * 2);
	assert.equal(live(room).length, 3);
	invariant(room);
});

test('Banko: equal hands at a Show go to the banker, whoever asked', () => {
	const mirror = [c(9, D), c(8, C), c(2, H)];
	let room = start('banko-1', [[c(9, H), c(8, S), c(2, C)], mirror]);
	assert.equal(room.initiator, 'a');
	const asker = room.currentPlayerId;
	room = transition(room, asker, 'show', {}, ctx);
	assert.equal(room.result.reason, 'show-banker');
	assert.equal(room.result.winnerId, 'a');
});

test('Banko: a big pot sends everyone against the banker', () => {
	// a is the banker with a pair; b beats it, c and d do not.
	let room = start('banko-1', [PAIR, TRAIL, HIGH, LOW]);
	const total = room.players.reduce((n, p) => n + p.balance, room.pot);
	for (let i = 0; i < 40 && !room.result; i++) {
		const turn = room.currentPlayerId;
		room = transition(room, turn, 'bet', { amount: view(room, turn).legalActions.maxBet }, ctx);
	}
	assert.equal(room.result.reason, 'banko-players');
	assert.deepEqual(room.result.winners.map((w) => w.id), ['b']);
	assert.equal(room.players.reduce((n, p) => n + p.balance, room.pot), total);
	invariant(room);
	// Nobody beats the banker: the banker takes it.
	room = start('banko-1', [TRAIL, PAIR, HIGH, LOW]);
	for (let i = 0; i < 40 && !room.result; i++) {
		const turn = room.currentPlayerId;
		room = transition(room, turn, 'bet', { amount: view(room, turn).legalActions.maxBet }, ctx);
	}
	assert.equal(room.result.reason, 'banko-banker');
	assert.equal(room.result.winnerId, 'a');
});

test('Buying Joker: paying shows only the buyer the rank, and it is wild in their hand only', () => {
	const hands = [[c(9, H), c(5, S), c(2, C)], [c(13, D), c(7, S), c(3, C)]];
	let room = start('buying-joker-1', hands);
	const rank = room.variantState.rank;
	assert.equal(view(room, 'a').variantState.rank, null);
	const price = view(room, 'a').legalActions.table[0].price;
	assert.equal(price, 50);
	const before = room.players.find((p) => p.id === 'a').balance;
	const pot = room.pot;
	room = transition(room, 'a', 'table', { kind: 'buy' }, ctx);
	assert.equal(room.players.find((p) => p.id === 'a').balance, before - price);
	assert.equal(room.pot, pot + price);
	assert.equal(room.players.find((p) => p.id === 'a').handBet >= price, true);
	assert.equal(view(room, 'a').variantState.rank, rank);
	assert.equal(view(room, 'b').variantState.rank, null);
	assert.deepEqual(view(room, 'b').variantState.bought, ['a']);
	assert.deepEqual(view(room, 'a').legalActions.table, []);
	assert.throws(() => transition(room, 'a', 'table', { kind: 'buy' }, ctx), /already bought/);
	invariant(room);
});

test('Auction: the highest sealed bid pays and wins the joker', () => {
	const hands = [[c(9, H), c(5, S), c(2, C)], [c(13, D), c(7, S), c(3, C)], [c(14, H), c(10, S), c(4, D)]];
	let room = start('auction-1', hands);
	const rank = room.variantState.rank;
	assert.deepEqual(view(room, 'a').legalActions.table.map((o) => o.bid), [0, 1, 2, 5, 10]);
	room = transition(room, 'a', 'table', { kind: 'bid', bid: 1 }, ctx);
	assert.throws(() => transition(room, 'a', 'table', { kind: 'bid', bid: 2 }, ctx), /already bid/);
	assert.throws(() => transition(room, 'b', 'table', { kind: 'bid', bid: 3 }, ctx), /one of the bids/);
	room = transition(room, 'b', 'table', { kind: 'bid', bid: 5 }, ctx);
	assert.equal(view(room, 'c').variantState.done, false);
	const pot = room.pot;
	room = transition(room, 'c', 'table', { kind: 'bid', bid: 2 }, ctx);
	const state = view(room, 'b').variantState;
	assert.equal(state.done, true);
	assert.equal(state.winner, 'b');
	assert.equal(state.amount, 50);
	assert.equal(state.rank, rank);
	assert.equal(view(room, 'a').variantState.rank, null);
	assert.equal(room.pot, pot + 50);
	invariant(room);
});

test('Auction: a player who packs no longer holds up the sale; no bids means no sale', () => {
	const hands = [[c(9, H), c(5, S), c(2, C)], [c(13, D), c(7, S), c(3, C)], [c(14, H), c(10, S), c(4, D)]];
	let room = start('auction-1', hands);
	room = transition(room, 'a', 'table', { kind: 'bid', bid: 0 }, ctx);
	room = transition(room, 'b', 'table', { kind: 'bid', bid: 0 }, ctx);
	for (let i = 0; i < 6 && !view(room, 'a').variantState.done; i++) {
		const turn = room.currentPlayerId;
		room =
			turn === 'c'
				? transition(room, 'c', 'pack', {}, ctx)
				: transition(room, turn, 'bet', { amount: view(room, turn).legalActions.minBet }, ctx);
	}
	assert.equal(view(room, 'a').variantState.done, true);
	assert.equal(view(room, 'a').variantState.winner, null);
	invariant(room);
});

test('Community: your two cards plus the open community cards, opening as the pot grows', () => {
	const hands = [[c(9, H), c(5, S)], [c(13, D), c(7, S)]];
	const board = [c(9, D), c(2, C), c(9, S)];
	let room = start('community-1', hands, board);
	let shown = view(room, 'b').variantState;
	assert.equal(shown.opened, 1);
	assert.deepEqual(shown.community[0], board[0]);
	assert.deepEqual(shown.community[1], { rank: 0, suit: '' });
	// a holds 9H 5S, the open 9D: a pair of nines is the best three.
	room = transition(room, 'a', 'see', {}, ctx);
	assert.equal(view(room, 'a').usersList[0].handName, 'Pair of 9s');
	for (let i = 0; i < 40 && room.pot < 200 && !room.result; i++) {
		const turn = room.currentPlayerId;
		room = transition(room, turn, 'bet', { amount: view(room, turn).legalActions.maxBet }, ctx);
	}
	shown = view(room, 'b').variantState;
	assert.equal(shown.opened, 3);
	assert.deepEqual(shown.community, board);
	// Now a has 9H 9D 9S on the board: a trail.
	assert.equal(view(room, 'a').usersList[0].handName, 'Trail of 9s');
	invariant(room);
});
