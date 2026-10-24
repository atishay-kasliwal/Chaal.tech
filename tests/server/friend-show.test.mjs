import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, invariant, playing } from '../../server/engine.mjs';

const c = (rank, suit) => ({ rank, suit });
const H = 'hearts',
	S = 'spades',
	D = 'diamonds',
	C = 'clubs';
const ids = ['a', 'b', 'c', 'd'];
const connected = new Set([...ids, 'bot-0001']);
const ctx = { now: 1000, turnMs: 60000, handId: 'h1', deck: freshDeck(), connected };

const HANDS = {
	a: [c(9, H), c(9, S), c(9, C)],
	b: [c(13, D), c(13, S), c(3, C)],
	c: [c(12, H), c(7, S), c(2, D)],
	d: [c(10, D), c(10, C), c(4, H)]
};
function start(rulesVersion = 'side-show-2', players = ids) {
	let room = newRoom('friend-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of players.filter((p) => !p.startsWith('bot-')))
		room = transition(room, id, 'join', { username: id }, ctx);
	for (const id of players.filter((p) => p.startsWith('bot-')))
		room = transition(room, 'a', 'addBot', { botId: id, name: 'Botty', level: 'normal' }, ctx);
	const hands = { ...HANDS, 'bot-0001': [c(8, H), c(6, S), c(5, C)] };
	const dealt = [];
	for (let i = 0; i < 3; i++) for (const id of players) dealt.push(hands[id][i]);
	const key = (card) => `${card.rank}:${card.suit}`;
	const used = new Set(dealt.map(key));
	const deck = [...dealt, ...freshDeck().filter((card) => !used.has(key(card)))];
	return transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3, rulesVersion }, { ...ctx, deck });
}
const view = (room, id) => projection(room, id, connected);
const share = (target) => ({ kind: 'share', target });
const hiddenCards = (cards) => cards.every((card) => card.rank === 0);
const userOf = (room, viewer, id) => view(room, viewer).usersList.find((u) => u.id === id);

test('a seen player shows their cards, in private, to a friend who has packed', () => {
	let room = start();
	// Nobody has packed yet: nobody can be shown anything.
	for (const id of ids) assert.deepEqual(view(room, id).legalActions.share, []);
	room = transition(room, 'b', 'pack', {}, ctx);
	assert.equal(room.currentPlayerId, 'c');
	// c has not looked yet, so there is nothing for c to show.
	assert.deepEqual(view(room, 'c').legalActions.share, []);
	assert.throws(() => transition(room, 'c', 'table', share('b'), ctx), /Look at your cards first/);
	room = transition(room, 'c', 'see', {}, ctx);
	assert.deepEqual(view(room, 'c').legalActions.share, ['b']);
	room = transition(room, 'c', 'table', share('b'), ctx);
	// b sees c's hand, with its name; the others still in do not, and cannot tell which cards.
	assert.deepEqual(userOf(room, 'b', 'c').cardsInHand, HANDS.c);
	assert.equal(typeof userOf(room, 'b', 'c').handName, 'string');
	for (const viewer of ['a', 'd']) {
		assert.ok(hiddenCards(userOf(room, viewer, 'c').cardsInHand), `${viewer} sees nothing`);
		assert.equal(userOf(room, viewer, 'c').handName, undefined);
	}
	// Everyone is told who showed whom, and only that.
	for (const viewer of ids) assert.deepEqual(view(room, viewer).shares, [{ from: 'c', to: 'b' }]);
	assert.ok(!JSON.stringify(view(room, 'a')).includes('"rank":12,"suit":"hearts"'), 'no card leaks to a');
	// Once is enough, and the hand is not touched.
	assert.deepEqual(view(room, 'c').legalActions.share, []);
	assert.throws(() => transition(room, 'c', 'table', share('b'), ctx), /friend who has packed/);
	assert.ok(playing(room));
	invariant(room);
});

test('you can only show a friend who has packed: not yourself, not someone still in, not nobody', () => {
	let room = start();
	room = transition(room, 'b', 'pack', {}, ctx);
	room = transition(room, 'c', 'see', {}, ctx);
	for (const target of ['c', 'd', 'a', 'zz', undefined, null, 5, ['b'], { id: 'b' }])
		assert.throws(() => transition(room, 'c', 'table', share(target), ctx), /friend who has packed/);
	assert.throws(() => transition(room, 'c', 'table', { kind: 'share' }, ctx), /friend who has packed/);
});

test('friends who have both packed can show each other what they held', () => {
	let room = start();
	room = transition(room, 'b', 'pack', {}, ctx);
	room = transition(room, 'c', 'bet', { amount: view(room, 'c').legalActions.minBet }, ctx);
	room = transition(room, 'd', 'pack', {}, ctx);
	// b and d are out. b has not looked at their own cards yet.
	assert.deepEqual(view(room, 'b').legalActions.share, []);
	assert.throws(() => transition(room, 'b', 'table', share('d'), ctx), /Look at your cards first/);
	room = transition(room, 'b', 'see', {}, ctx);
	assert.deepEqual(view(room, 'b').legalActions.share, ['d']);
	room = transition(room, 'b', 'table', share('d'), ctx);
	assert.deepEqual(userOf(room, 'd', 'b').cardsInHand, HANDS.b);
	// d never looked at their own cards, yet can look at b's. a, who is still in, cannot.
	assert.ok(hiddenCards(userOf(room, 'd', 'd').cardsInHand));
	assert.ok(hiddenCards(userOf(room, 'a', 'b').cardsInHand));
	assert.ok(hiddenCards(userOf(room, 'c', 'b').cardsInHand));
	// d shows theirs back once they have looked.
	room = transition(room, 'd', 'see', {}, ctx);
	room = transition(room, 'd', 'table', share('b'), ctx);
	assert.deepEqual(userOf(room, 'b', 'd').cardsInHand, HANDS.d);
	assert.deepEqual(view(room, 'a').shares, [
		{ from: 'b', to: 'd' },
		{ from: 'd', to: 'b' }
	]);
	invariant(room);
});

test('bots are never shown cards, and the offer ends with the hand', () => {
	let room = start('side-show-2', ['a', 'b', 'c', 'bot-0001']);
	room = transition(room, 'b', 'pack', {}, ctx);
	room = transition(room, 'c', 'see', {}, ctx);
	room = transition(room, 'c', 'bet', { amount: view(room, 'c').legalActions.minBet }, ctx);
	room = transition(room, 'bot-0001', 'pack', {}, ctx);
	// b (a person) can be shown, the packed bot cannot.
	assert.deepEqual(view(room, 'c').legalActions.share, ['b']);
	assert.throws(() => transition(room, 'c', 'table', share('bot-0001'), ctx), /friend who has packed/);
	room = transition(room, 'c', 'table', share('b'), ctx);
	while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	assert.throws(() => transition(room, 'c', 'table', share('b'), ctx), /hand is over|friend who has packed/);
	// The next hand starts clean.
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3, rulesVersion: 'side-show-2' }, { ...ctx, deck: freshDeck(), handId: 'h2' });
	assert.equal(room.sharedCards, undefined);
	assert.equal(view(room, 'b').shares, undefined);
	assert.ok(hiddenCards(userOf(room, 'b', 'c').cardsInHand));
});

test('only Side Show 2 has it: the first Side Show and every other game refuse', () => {
	for (const rulesVersion of ['side-show-1', 'classic-1', 'faceoff-1']) {
		let room = start(rulesVersion);
		room = transition(room, 'b', 'pack', {}, ctx);
		room = transition(room, 'c', 'see', {}, ctx);
		assert.equal(view(room, 'c').legalActions.share, undefined, rulesVersion);
		assert.throws(() => transition(room, 'c', 'table', share('b'), ctx), undefined, rulesVersion);
	}
});
