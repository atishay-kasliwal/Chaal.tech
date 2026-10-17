import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection } from '../../server/engine.mjs';
import { getVariant } from '../../server/variants/index.mjs';
import { jokerPair, CHATAI_LINES } from '../../server/variants/table-games.mjs';
import { describeClassic } from '../../server/variants/hand-utils.mjs';

/**
 * The rules of the table-card games as the club plays them: Chatai 3×3, Running, Rotating and
 * Revolving Joker, Kiss-Miss-Bliss and Kissing-Missing. Every deck here is stacked on purpose.
 */

const SUITS = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
const RANKS = { A: 14, K: 13, Q: 12, J: 11 };
const c = (text) => ({
	rank: RANKS[text.slice(0, -1)] ?? Number(text.slice(0, -1)),
	suit: SUITS[text.slice(-1)]
});
const key = (card) => `${card.rank}:${card.suit}`;

/** A full deck dealing these hands (seat order, round-robin) and then these table cards. */
function stacked(hands, table = []) {
	const size = hands[0].length;
	const order = [];
	for (let i = 0; i < size; i++) for (const hand of hands) order.push(c(hand[i]));
	order.push(...table.map(c));
	const used = new Set(order.map(key));
	return [...order, ...freshDeck().filter((card) => !used.has(key(card)))];
}

const ctx = (extra = {}) => ({
	now: 1000,
	turnMs: 90000,
	connected: new Set(['a', 'b', 'c']),
	...extra
});
function deal(rulesVersion, hands, table = [], players = ['a', 'b']) {
	let room = newRoom('table-games', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of players) room = transition(room, id, 'join', { username: id }, ctx());
	const variant = getVariant(rulesVersion);
	return transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion },
		ctx({ deck: stacked(hands, table), handId: 'h1' })
	);
}
const act = (room, id, action, payload = {}) => transition(room, id, action, payload, ctx());
const view = (room, id) => projection(room, id, new Set(['a', 'b', 'c']));
const me = (room, id) => view(room, id).usersList.find((u) => u.id === id);
const turn = (room) => room.currentPlayerId;
const bet = (room) =>
	act(room, turn(room), 'bet', { amount: view(room, turn(room)).legalActions.minBet });

// ——— Chatai ———

const MAT = ['7♦', '4♣', 'K♠', '9♥', '7♣', 'K♣', '2♣', 'J♠', 'Q♠'];

test('Chatai: nine mat cards stay hidden until someone pays and opens one', () => {
	let room = deal(
		'chatai-1',
		[
			['K♥', '5♠', '9♦'],
			['3♦', '8♠', '10♣']
		],
		MAT
	);
	assert.ok(view(room, 'a').variantState.mat.every((card) => card.rank === 0));
	const first = turn(room);
	room = bet(room);
	// The player who just paid may open any closed card, even after the turn has moved on.
	const options = view(room, first).legalActions.table;
	assert.equal(options.length, 9);
	assert.deepEqual(view(room, turn(room)).legalActions.table, []);
	room = act(room, first, 'table', { kind: 'open', index: 2 });
	const mat = view(room, 'b').variantState.mat;
	assert.deepEqual(mat[2], c('K♠'));
	assert.equal(mat.filter((card) => card.rank).length, 1);
	assert.throws(() => act(room, first, 'table', { kind: 'open', index: 3 }), /Pay your chaal/);
});

test('Chatai: a paid-for card nobody opened opens itself on the next move', () => {
	let room = deal(
		'chatai-1',
		[
			['K♥', '5♠', '9♦'],
			['3♦', '8♠', '10♣']
		],
		MAT
	);
	room = bet(room);
	room = bet(room);
	assert.equal(view(room, 'a').variantState.open.filter(Boolean).length, 1);
});

test('Chatai: every open card is a joker for everyone while the mat is still closing', () => {
	let room = deal(
		'chatai-1',
		[
			['K♥', '5♠', '9♦'],
			['3♦', '8♠', '10♣']
		],
		MAT
	);
	room = act(room, 'a', 'see');
	const first = turn(room);
	room = bet(room);
	room = act(room, first, 'table', { kind: 'open', index: 2 }); // K♠: Kings are wild
	const mine = me(room, 'a');
	assert.deepEqual(mine.wildCards, [0]);
	assert.match(mine.handName, /Pair of 9s/);
});

test('Chatai: with all nine open, your locked line is your only jokers, and it never changes', () => {
	let room = deal(
		'chatai-1',
		[
			['K♥', '5♠', '2♦'],
			['3♦', '8♠', '10♣']
		],
		MAT
	);
	room = act(room, 'a', 'see');
	room = act(room, 'b', 'see');
	for (let i = 0; i < 9; i++) {
		const payer = turn(room);
		room = bet(room);
		room = act(room, payer, 'table', {
			kind: 'open',
			index: view(room, payer).legalActions.table[0].index
		});
	}
	assert.ok(view(room, 'a').variantState.open.every(Boolean));
	// No line yet: no jokers, and no Show.
	assert.deepEqual(me(room, 'a').wildCards, []);
	assert.equal(view(room, turn(room)).legalActions.show, false);
	assert.throws(() => act(room, turn(room), 'show'), /Lock your joker line/);
	// The diagonal from top right to bottom left: K♠ 7♣ 2♣. Kings and 2s are wild for a.
	const diagonal = CHATAI_LINES.findIndex((line) => line.join() === '2,4,6');
	room = act(room, 'a', 'table', { kind: 'line', line: diagonal });
	assert.deepEqual(me(room, 'a').wildCards, [0, 2]);
	assert.match(me(room, 'a').handName, /Trail of 5s/);
	assert.throws(() => act(room, 'a', 'table', { kind: 'line', line: 0 }), /already locked/);
	// Others see that a locked, not which line.
	assert.deepEqual(view(room, 'b').variantState.lines, {});
	assert.deepEqual(view(room, 'b').variantState.locked, ['a']);
});

test('Chatai: a Show compares each player with their own line', () => {
	let room = deal(
		'chatai-1',
		[
			['K♥', '5♠', '2♦'],
			['3♦', '8♠', '10♣']
		],
		MAT
	);
	room = act(room, 'a', 'see');
	room = act(room, 'b', 'see');
	for (let i = 0; i < 9; i++) {
		const payer = turn(room);
		room = bet(room);
		room = act(room, payer, 'table', {
			kind: 'open',
			index: view(room, payer).legalActions.table[0].index
		});
	}
	room = act(room, 'a', 'table', { kind: 'line', line: 7 }); // K 7 2: trail for a
	room = act(room, 'b', 'table', { kind: 'line', line: 1 }); // 9 7 K: nothing helps b much
	room = act(room, turn(room), 'show');
	assert.equal(room.result.winnerId, 'a');
	// After the Show, both lines are visible.
	assert.deepEqual(Object.keys(view(room, 'b').variantState.lines).sort(), ['a', 'b']);
});

// ——— Running ———

const RUN_TABLE = ['7♣', 'J♥', '4♦'];
const raiseTo = (room, target) => {
	while (room.pot < target && room.isStarted && !room.gameShow)
		room = act(room, turn(room), 'bet', { amount: view(room, turn(room)).legalActions.maxBet });
	return room;
};

test('Running: the table cards open at ₹200, ₹400 and ₹600 of pot', () => {
	let room = deal(
		'running-1',
		[
			['8♠', 'A♥', 'A♣'],
			['K♠', '3♣', '5♥'],
			['Q♠', 'Q♥', '2♠']
		],
		RUN_TABLE,
		['a', 'b', 'c']
	);
	room = act(room, 'a', 'see');
	assert.equal(view(room, 'a').variantState.opened, 0);
	room = raiseTo(room, 200);
	const state = view(room, 'a').variantState;
	assert.equal(state.opened, 1);
	assert.deepEqual(state.table[0], c('7♣'));
	assert.equal(state.table[1].rank, 0);
	// 7 opened: 6s and 8s are wild. a holds 8♠ A♥ A♣: a Trail of Aces.
	assert.deepEqual(me(room, 'a').wildCards, [0]);
	assert.match(me(room, 'a').handName, /Trail of Aces/);
});

test('Running: Aces wrap, so an open Ace makes Kings and 2s wild', () => {
	const running = getVariant('running-1');
	const state = { table: [c('A♠'), c('5♥'), c('9♣')], opened: 1, out: [] };
	assert.deepEqual(running.wildIndexes([c('K♦'), c('2♣'), c('9♥')], state), [0, 1]);
	const second = { table: [c('6♠'), c('J♥'), c('9♣')], opened: 2, out: [] };
	// First card 6: 5 and 7. Second card J: J, 10 and Q. All stay.
	assert.deepEqual(running.wildIndexes([c('5♦'), c('7♣'), c('10♥')], second), [0, 1, 2]);
	assert.deepEqual(running.wildIndexes([c('J♦'), c('Q♣'), c('6♥')], second), [0, 1]);
});

test('Running: at ₹600 the killer suit packs every seen player holding it and shows their cards', () => {
	let room = deal(
		'running-1',
		[
			['8♠', 'A♥', 'A♣'],
			['K♠', '10♦', '3♣'],
			['Q♠', 'Q♥', '2♦']
		],
		RUN_TABLE,
		['a', 'b', 'c']
	);
	room = act(room, 'a', 'see');
	room = act(room, 'b', 'see');
	// c stays blind and also holds a ♦.
	room = raiseTo(room, 600);
	const state = view(room, 'a').variantState;
	assert.equal(state.killer, 'diamonds');
	const raju = room.players.find((p) => p.id === 'b');
	assert.equal(raju.isPacked, true);
	assert.deepEqual(state.out, ['b']);
	assert.deepEqual(view(room, 'a').usersList.find((u) => u.id === 'b').cardsInHand, raju.cards);
	// The blind ♦ holder plays on.
	assert.equal(room.players.find((p) => p.id === 'c').isPacked, false);
});

test('Running: a blind player holding the killer suit may Show but cannot win it', () => {
	const running = getVariant('running-1');
	const state = { table: [c('7♣'), c('J♥'), c('4♦')], opened: 3, out: [] };
	assert.equal(
		running.compareHands([c('A♦'), c('A♠'), c('A♥')], [c('2♠'), c('5♣'), c('9♥')], state),
		-1
	);
	assert.equal(
		running.compareHands([c('2♠'), c('5♣'), c('9♥')], [c('A♦'), c('A♠'), c('A♥')], state),
		1
	);
	// Both hold it at a Show: the player who opens last (not the one asking) wins.
	const asker = { cards: [c('A♦'), c('A♠'), c('A♥')] };
	const other = { cards: [c('2♦'), c('5♣'), c('9♥')] };
	assert.equal(running.showOverride(state, asker, other), other);
	assert.equal(running.showOverride(state, { cards: [c('2♠'), c('5♣'), c('9♥')] }, other), null);
});

test('Running: a blind player who looks after the killer opens is packed if they hold it', () => {
	let room = deal(
		'running-1',
		[
			['8♠', 'A♥', 'A♣'],
			['K♠', '10♠', '3♣'],
			['Q♠', 'Q♥', '2♦']
		],
		RUN_TABLE,
		['a', 'b', 'c']
	);
	room = raiseTo(room, 600);
	assert.equal(room.players.find((p) => p.id === 'c').isPacked, false);
	room = act(room, 'c', 'see');
	assert.equal(room.players.find((p) => p.id === 'c').isPacked, true);
});

test('Running: equal hands go to the higher card, then spades, hearts, clubs, diamonds', () => {
	const running = getVariant('running-1');
	const state = { table: [c('7♣'), c('J♥'), c('4♦')], opened: 2, out: [] };
	// Both hold three jokers (8, J, Q are wild): a Trail of Aces each. ♠A beats ♥A... here the
	// highest real card decides: Q♠ over Q♥.
	assert.equal(
		running.compareHands([c('Q♠'), c('J♣'), c('8♦')], [c('Q♥'), c('J♠'), c('8♣')], state),
		1
	);
});

// ——— Rotating and Revolving Joker ———

test('Rotating Joker: three open jokers, and a player who packs turns their cards into the jokers', () => {
	let room = deal(
		'rotating-joker-1',
		[
			['9♣', '9♠', 'A♦'],
			['4♠', '9♥', 'Q♦'],
			['2♣', '6♥', 'K♠']
		],
		['3♣', '8♦', 'A♠'],
		['a', 'b', 'c']
	);
	assert.deepEqual(view(room, 'a').variantState.jokers, [c('3♣'), c('8♦'), c('A♠')]);
	while (turn(room) !== 'b') room = bet(room);
	room = act(room, 'b', 'pack');
	const state = view(room, 'a').variantState;
	assert.deepEqual(state.jokers, [c('4♠'), c('9♥'), c('Q♦')]);
	assert.deepEqual(state.before, [c('3♣'), c('8♦'), c('A♠')]);
	room = act(room, 'a', 'see');
	assert.match(me(room, 'a').handName, /Trail of Aces/);
});

test('Revolving Joker: a pack deals three fresh jokers from the deck', () => {
	let room = deal(
		'revolving-joker-1',
		[
			['9♣', '9♠', 'A♦'],
			['4♠', '9♥', 'Q♦'],
			['2♣', '6♥', 'K♠']
		],
		['3♣', '8♦', 'A♠', '5♠', '5♥', '5♦'],
		['a', 'b', 'c']
	);
	while (turn(room) !== 'b') room = bet(room);
	room = act(room, 'b', 'pack');
	assert.deepEqual(view(room, 'a').variantState.jokers, [c('5♠'), c('5♥'), c('5♦')]);
});

// ——— Kiss-Miss-Bliss and Kissing-Missing ———

test('Kiss, Miss and Bliss pairs, with the Ace on both ends', () => {
	assert.equal(jokerPair(c('2♠'), c('3♥')), 'kiss');
	assert.equal(jokerPair(c('A♠'), c('2♥')), 'kiss');
	assert.equal(jokerPair(c('K♠'), c('A♥')), 'kiss');
	assert.equal(jokerPair(c('8♠'), c('10♥')), 'miss');
	assert.equal(jokerPair(c('A♠'), c('3♥')), 'miss');
	assert.equal(jokerPair(c('K♠'), c('K♥')), 'bliss');
	assert.equal(jokerPair(c('2♠'), c('9♥')), null);
});

test('Kiss-Miss-Bliss: two cards become one joker, then you keep three, and the joker stays', () => {
	let room = deal('kiss-miss-bliss-1', [
		['2♠', '3♥', '9♣', 'K♦', 'Q♠'],
		['4♠', '4♥', '7♣', '10♦', 'J♠']
	]);
	assert.deepEqual(view(room, 'a').legalActions.table, []); // blind: no joker
	room = act(room, 'a', 'see');
	const pairs = view(room, 'a').legalActions.table.map((move) => move.indexes.join('-'));
	assert.ok(pairs.includes('0-1')); // 2-3 Kiss
	assert.ok(pairs.includes('3-4')); // K-Q Kiss
	room = act(room, 'a', 'table', { kind: 'joker', indexes: [0, 1] });
	const hand = room.players.find((p) => p.id === 'a').cards;
	assert.equal(hand.length, 4);
	assert.deepEqual(hand[0], c('2♠'));
	assert.throws(() => act(room, 'a', 'table', { kind: 'joker', indexes: [2, 3] }), /already made/);
	assert.throws(() => act(room, 'a', 'discard', { index: 0 }), /Keep your joker/);
	room = act(room, 'a', 'discard', { index: 1 }); // throw 9♣, keep joker K Q
	assert.equal(room.players.find((p) => p.id === 'a').cards.length, 3);
	assert.deepEqual(me(room, 'a').wildCards, [0]);
	assert.match(me(room, 'a').handName, /Sequence, Ace high/);
});

test('Kiss-Miss-Bliss: no joker, throw two cards and play the natural three', () => {
	let room = deal('kiss-miss-bliss-1', [
		['2♠', '3♥', '9♣', 'K♦', 'Q♠'],
		['4♠', '4♥', '7♣', '10♦', 'J♠']
	]);
	room = act(room, 'a', 'see');
	room = act(room, 'a', 'discard', { index: 0 });
	assert.deepEqual(view(room, 'a').legalActions.table, []); // too late for a joker
	room = act(room, 'a', 'discard', { index: 0 });
	assert.equal(room.players.find((p) => p.id === 'a').cards.length, 3);
	assert.deepEqual(me(room, 'a').wildCards, []);
	// Others never learn who made what.
	assert.deepEqual(view(room, 'b').variantState.jokers, {});
});

test('Kissing-Missing: four cards, Kiss or Miss only, and the joker leaves exactly three', () => {
	let room = deal('kissing-missing-1', [
		['5♠', '5♥', '9♣', 'J♦'],
		['4♠', '6♥', '7♣', '10♦']
	]);
	room = act(room, 'a', 'see');
	// 5-5 is a Bliss, not allowed here; 9-J is a Miss.
	const pairs = view(room, 'a').legalActions.table.map((move) => move.indexes.join('-'));
	assert.deepEqual(pairs, ['2-3']);
	assert.throws(() => act(room, 'a', 'table', { kind: 'joker', indexes: [0, 1] }), /kiss, miss/);
	room = act(room, 'a', 'table', { kind: 'joker', indexes: [2, 3] });
	assert.equal(room.players.find((p) => p.id === 'a').cards.length, 3);
	assert.equal(view(room, 'a').legalActions.discard, false);
	assert.match(me(room, 'a').handName, /Trail of 5s/);
});

test('A blind Kiss-Miss-Bliss player plays their first three, with no joker', () => {
	const kmb = getVariant('kiss-miss-bliss-1');
	const score = kmb.evaluateHand([c('2♠'), c('3♥'), c('9♣'), c('K♦'), c('Q♠')], { jokerKey: null });
	assert.equal(describeClassic(score), 'High card 9');
});
