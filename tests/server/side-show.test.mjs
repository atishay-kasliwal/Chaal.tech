import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck, compareHands } from '../../server/classic.mjs';
import { newRoom, transition, projection, invariant, playing, SIDE_SHOW_MS } from '../../server/engine.mjs';
import { nextBotMove } from '../../server/bots/runner.mjs';
import { sideShowReply } from '../../server/bots/strategy.mjs';
import { getVariant } from '../../server/variants/index.mjs';

const c = (rank, suit) => ({ rank, suit });
const H = 'hearts',
	S = 'spades',
	D = 'diamonds',
	C = 'clubs';
const connected = new Set(['a', 'b', 'c', 'd']);
const ctx = { now: 1000, turnMs: 60000, handId: 'h1', deck: freshDeck(), connected };

// Seat order a, b, c (, d): a holds the trail, b a pair, c the high card, d a lower pair.
const HANDS = {
	a: [c(9, H), c(9, S), c(9, C)],
	b: [c(13, D), c(13, S), c(3, C)],
	c: [c(12, H), c(7, S), c(2, D)],
	d: [c(10, D), c(10, C), c(4, H)]
};
function start(players = ['a', 'b', 'c'], hands = HANDS, rulesVersion = 'side-show-1') {
	let room = newRoom('side-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of players) room = transition(room, id, 'join', { username: id }, ctx);
	const dealt = [];
	for (let i = 0; i < 3; i++) for (const id of players) dealt.push(hands[id][i]);
	const key = (card) => `${card.rank}:${card.suit}`;
	const used = new Set(dealt.map(key));
	const deck = [...dealt, ...freshDeck().filter((card) => !used.has(key(card)))];
	return transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3, rulesVersion }, { ...ctx, deck });
}
const view = (room, id) => projection(room, id, connected);
const live = (room) => room.players.filter((p) => !p.isPacked && p.cards.length);
const bySeat = (room) => [...live(room)].sort((x, y) => x.seatNumber - y.seatNumber);
/** The player to act, and the one seated just before them among those still in. */
const turn = (room) => {
	const order = bySeat(room);
	const at = order.findIndex((p) => p.id === room.currentPlayerId);
	return { cur: order[at].id, prev: order[(at - 1 + order.length) % order.length].id };
};
const look = (room, ...ids) =>
	ids.reduce(
		(r, id) => (r.players.find((p) => p.id === id).isBlind ? transition(r, id, 'see', {}, ctx) : r),
		room
	);
const chips = (room) => room.players.reduce((n, p) => n + p.balance, room.pot);
const ask = { kind: 'sideshow' };
const answer = (accept) => ({ kind: 'sideshow-answer', accept });

test('Side Show is offered only to a seen player, for a seen player before them, with three in', () => {
	let room = start();
	let { cur, prev } = turn(room);
	assert.equal(view(room, cur).legalActions.sideShow, null, 'blind: nothing to ask');
	room = look(room, cur);
	assert.equal(view(room, cur).legalActions.sideShow, null, 'the player before is still blind');
	room = look(room, prev);
	assert.equal(view(room, cur).legalActions.sideShow, prev);
	// Only the player on turn is offered it, and only against the previous player.
	for (const p of room.players.filter((q) => q.id !== cur))
		assert.equal(view(room, p.id).legalActions.sideShow, null);
	// With two left it is a Show, not a side show.
	const third = room.players.find((p) => p.id !== cur && p.id !== prev).id;
	room = look(room, third);
	room = transition(room, cur, 'pack', {}, ctx);
	({ cur, prev } = turn(room));
	room = look(room, cur, prev);
	assert.equal(live(room).length, 2);
	assert.equal(view(room, cur).legalActions.sideShow, null);
	assert.throws(() => transition(room, cur, 'table', ask, ctx), /cannot ask/);
});

test('asking pauses the turn, and only the one asked can answer', () => {
	let room = start();
	const { cur, prev } = turn(room);
	room = look(room, 'a', 'b', 'c');
	const stake = view(room, cur).legalActions.minBet;
	const pot = room.pot;
	room = transition(room, cur, 'table', ask, ctx);
	assert.deepEqual(room.sideShow, { from: cur, to: prev });
	assert.equal(room.deadline, ctx.now + SIDE_SHOW_MS);
	// Nothing is paid until it is answered, and the asker's own moves are on hold.
	assert.equal(room.pot, pot);
	const asker = view(room, cur);
	assert.equal(asker.legalActions.bet, false);
	assert.equal(asker.legalActions.pack, false);
	assert.equal(asker.legalActions.show, false);
	assert.equal(asker.legalActions.sideShow, null);
	assert.throws(() => transition(room, cur, 'bet', { amount: stake }, ctx), /Waiting for the side show/);
	assert.throws(() => transition(room, cur, 'pack', {}, ctx), /Waiting for the side show/);
	assert.throws(() => transition(room, cur, 'timeout', {}, ctx), /Waiting for the side show/);
	// Everyone sees the request; only the target can answer it.
	assert.deepEqual(view(room, 'a').sideShow, { from: cur, to: prev });
	assert.equal(view(room, prev).legalActions.sideShowAnswer, true);
	for (const p of room.players.filter((q) => q.id !== prev))
		assert.equal(view(room, p.id).legalActions.sideShowAnswer, false);
	const other = room.players.find((p) => p.id !== cur && p.id !== prev).id;
	assert.throws(() => transition(room, other, 'table', answer(true), ctx), /no side show for you/);
	assert.throws(() => transition(room, cur, 'table', answer(true), ctx), /no side show for you/);
	assert.throws(() => transition(room, prev, 'table', { kind: 'sideshow-answer' }, ctx), /Accept or decline/);
	assert.throws(
		() => transition(room, prev, 'table', answer(true), { ...ctx, now: room.deadline }),
		/expired/
	);
	invariant(room);
});

test('accepted: the weaker hand leaves, nothing is shown, and the asker pays a chaal', () => {
	for (const [players, hands] of [
		[['a', 'b', 'c'], HANDS],
		[['a', 'b', 'c', 'd'], HANDS]
	]) {
		let room = start(players, hands);
		const { cur, prev } = turn(room);
		room = look(room, ...players);
		const total = chips(room);
		const before = room.players.find((p) => p.id === cur).balance;
		const stake = view(room, cur).legalActions.minBet;
		room = transition(room, cur, 'table', ask, ctx);
		room = transition(room, prev, 'table', answer(true), ctx);
		const askerWins = compareHands(hands[cur], hands[prev]) > 0;
		const loser = askerWins ? prev : cur;
		assert.equal(room.players.find((p) => p.id === loser).isPacked, true, 'the weaker hand left');
		assert.equal(room.players.find((p) => p.id === (askerWins ? cur : prev)).isPacked, false);
		assert.deepEqual(room.lastSideShow, { from: cur, to: prev, accepted: true, loser });
		assert.equal(room.sideShow, undefined);
		assert.equal(room.players.find((p) => p.id === cur).balance, before - stake, 'paid one chaal');
		assert.equal(chips(room), total);
		// The turn moved on to someone else, and no cards were shown to the table.
		assert.notEqual(room.currentPlayerId, cur);
		assert.ok(playing(room));
		const watcher = players.find((id) => id !== cur && id !== prev);
		const seen = view(room, watcher).usersList.find((u) => u.id === loser);
		assert.ok(seen.cardsInHand.every((card) => card.rank === 0), 'the loser stays face down');
		assert.deepEqual(room.shownIds ?? [], []);
		invariant(room);
	}
});

test('a tie goes against the one who asked', () => {
	// b acts first and a sits just before b: give them equal hands.
	const tie = {
		a: [c(9, H), c(8, S), c(2, C)],
		b: [c(9, D), c(8, C), c(2, H)],
		c: [c(14, D), c(13, S), c(11, C)]
	};
	let room = start(['a', 'b', 'c'], tie);
	assert.deepEqual(turn(room), { cur: 'b', prev: 'a' });
	room = look(room, 'a', 'b', 'c');
	room = transition(room, 'b', 'table', ask, ctx);
	room = transition(room, 'a', 'table', answer(true), ctx);
	assert.equal(room.lastSideShow.loser, 'b', 'the asker loses a tie');
	assert.equal(room.players.find((p) => p.id === 'b').isPacked, true);
	assert.equal(room.players.find((p) => p.id === 'a').isPacked, false);
	invariant(room);
});

test('declined: nobody leaves, the asker still pays a chaal, and play moves on', () => {
	let room = start();
	const { cur, prev } = turn(room);
	room = look(room, 'a', 'b', 'c');
	const total = chips(room);
	const before = room.players.find((p) => p.id === cur).balance;
	const stake = view(room, cur).legalActions.minBet;
	room = transition(room, cur, 'table', ask, ctx);
	room = transition(room, prev, 'table', answer(false), ctx);
	assert.equal(live(room).length, 3);
	assert.deepEqual(room.lastSideShow, { from: cur, to: prev, accepted: false, loser: null });
	assert.equal(room.players.find((p) => p.id === cur).balance, before - stake);
	assert.notEqual(room.currentPlayerId, cur);
	assert.equal(chips(room), total);
	invariant(room);
});

test('no answer in time counts as a decline', () => {
	let room = start();
	const { cur, prev } = turn(room);
	room = look(room, 'a', 'b', 'c');
	const before = room.players.find((p) => p.id === cur).balance;
	const stake = view(room, cur).legalActions.minBet;
	room = transition(room, cur, 'table', ask, ctx);
	assert.throws(() => transition(room, cur, 'timeout', {}, { ...ctx, now: room.deadline - 1 }), /Waiting/);
	room = transition(room, cur, 'timeout', {}, { ...ctx, now: room.deadline });
	assert.equal(live(room).length, 3);
	assert.deepEqual(room.lastSideShow, { from: cur, to: prev, accepted: false, loser: null });
	assert.equal(room.players.find((p) => p.id === cur).balance, before - stake);
	assert.notEqual(room.currentPlayerId, cur);
	invariant(room);
});

test('a new hand starts clean, and other games have no Side Show', () => {
	let room = start();
	const { cur, prev } = turn(room);
	room = look(room, 'a', 'b', 'c');
	room = transition(room, cur, 'table', ask, ctx);
	room = transition(room, prev, 'table', answer(false), ctx);
	while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3, rulesVersion: 'side-show-1' }, { ...ctx, deck: freshDeck(), handId: 'h2' });
	assert.equal(room.lastSideShow, undefined);
	assert.equal(room.sideShow, undefined);
	const classic = start(['a', 'b', 'c'], HANDS, 'classic-1');
	const t = turn(classic);
	const seen = look(classic, 'a', 'b', 'c');
	assert.equal(view(seen, t.cur).legalActions.sideShow, undefined);
	assert.throws(() => transition(seen, t.cur, 'table', ask, ctx), /no table moves/);
});

test('a bot that is asked answers: it accepts a strong hand and declines a weak one', () => {
	const variant = getVariant('side-show-1');
	const strong = [c(14, H), c(14, S), c(5, C)];
	const weak = [c(9, H), c(5, S), c(2, C)];
	const hidden = [c(0, ''), c(0, ''), c(0, '')];
	const reply = (cards) => sideShowReply(cards, variant, undefined, () => 0.5).payload;
	assert.deepEqual(reply(strong), { kind: 'sideshow-answer', accept: true });
	assert.deepEqual(reply(weak), { kind: 'sideshow-answer', accept: false });
	assert.deepEqual(reply(hidden), { kind: 'sideshow-answer', accept: false });
});

test('a human asks a bot for a side show and the bot answers on its own', () => {
	let room = newRoom('side-bots', 1000, 'h', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'h', 'join', { username: 'h' }, ctx);
	for (const [n, botId] of ['bot-0001', 'bot-0002', 'bot-0003'].entries())
		room = transition(room, 'h', 'addBot', { botId, name: `Bot${n}`, level: 'normal' }, ctx);
	const hands = {
		h: [c(2, H), c(3, S), c(5, C)],
		'bot-0001': [c(8, D), c(6, S), c(4, C)],
		'bot-0002': [c(14, H), c(14, S), c(5, D)],
		'bot-0003': [c(13, D), c(13, S), c(12, C)]
	};
	const order = ['h', 'bot-0001', 'bot-0002', 'bot-0003'];
	const dealt = [];
	for (let i = 0; i < 3; i++) for (const id of order) dealt.push(hands[id][i]);
	const key = (card) => `${card.rank}:${card.suit}`;
	const used = new Set(dealt.map(key));
	const everyone = new Set([...order]);
	const live = { ...ctx, connected: everyone };
	room = transition(room, 'h', 'start', { cutAt: 0, cardsToDeal: 3, rulesVersion: 'side-show-1' }, { ...live, deck: [...dealt, ...freshDeck().filter((x) => !used.has(key(x)))] });
	// bot-0001 packs, bot-0002 and bot-0003 call; then it is the human's turn, with bot-0003 just before.
	room = transition(room, 'bot-0001', 'pack', {}, live);
	for (const id of ['bot-0002', 'bot-0003']) {
		room = transition(room, id, 'see', {}, live);
		room = transition(room, id, 'bet', { amount: projection(room, id, everyone).legalActions.minBet }, live);
	}
	assert.equal(room.currentPlayerId, 'h');
	room = transition(room, 'h', 'see', {}, live);
	assert.equal(projection(room, 'h', everyone).legalActions.sideShow, 'bot-0003');
	room = transition(room, 'h', 'table', { kind: 'sideshow' }, live);
	// The bot is due, and its answer closes the request.
	const move = nextBotMove(room, everyone, () => 0.5);
	assert.equal(move.botId, 'bot-0003');
	assert.equal(move.payload.kind, 'sideshow-answer');
	room = transition(room, move.botId, move.action, move.payload, live);
	assert.equal(room.sideShow, undefined);
	assert.equal(room.lastSideShow.to, 'bot-0003');
	// Two pairs beat nothing: whatever the bot said, the human's 5-high hand does not win the compare.
	if (room.lastSideShow.accepted) assert.equal(room.lastSideShow.loser, 'h');
	invariant(room);
});
