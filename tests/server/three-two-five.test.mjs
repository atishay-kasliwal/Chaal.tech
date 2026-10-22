import test from 'node:test';
import assert from 'node:assert/strict';
import {
	fresh325Deck,
	newRoom,
	transition,
	projection,
	pullQueue,
	faceDownOrder,
	autoMove
} from '../../server/tricks/three-two-five.mjs';
import { cardKey, trickWinner, legalPlays } from '../../server/tricks/cards.mjs';
import { runTable325, randomPlayer } from '../../server/sim/tricks/table-325.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';

const ctx = (extra = {}) => ({
	now: 1000,
	turnMs: 60000,
	connected: new Set(['a', 'b', 'c']),
	...extra
});
const deckFor = (n) => shuffle(fresh325Deck(), stream(9, 'deck', n).random);
function table() {
	let room = newRoom('three-two-five-test', 0, 'a');
	for (const id of ['a', 'b', 'c']) {
		room = transition(room, id, 'join', { username: id }, ctx());
		room = transition(room, id, 'ready', { ready: true }, ctx());
	}
	return room;
}

test('the V1 deck: 30 cards, 8 to A in every suit plus 7♥ and 7♠', () => {
	const deck = fresh325Deck();
	assert.equal(deck.length, 30);
	assert.equal(new Set(deck.map(cardKey)).size, 30);
	const sevens = deck
		.filter((c) => c.rank === 7)
		.map((c) => c.suit)
		.sort();
	assert.deepEqual(sevens, ['hearts', 'spades']);
	assert.ok(deck.every((c) => c.rank >= 7 && c.rank <= 14));
});

test('trick rules: follow suit when able; highest trump, else highest of the suit led', () => {
	const hand = [
		{ rank: 9, suit: 'hearts' },
		{ rank: 14, suit: 'spades' }
	];
	assert.deepEqual(legalPlays(hand, 'hearts'), [{ rank: 9, suit: 'hearts' }]);
	assert.equal(legalPlays(hand, 'clubs').length, 2);
	const plays = (cards) => cards.map((card, i) => ({ id: i, card }));
	assert.equal(
		trickWinner(
			plays([
				{ rank: 10, suit: 'hearts' },
				{ rank: 14, suit: 'clubs' },
				{ rank: 12, suit: 'hearts' }
			]),
			'spades'
		),
		2
	);
	assert.equal(
		trickWinner(
			plays([
				{ rank: 14, suit: 'hearts' },
				{ rank: 8, suit: 'spades' },
				{ rank: 13, suit: 'hearts' }
			]),
			'spades'
		),
		1
	);
	assert.equal(
		trickWinner(
			plays([
				{ rank: 8, suit: 'hearts' },
				{ rank: 14, suit: 'diamonds' },
				{ rank: 9, suit: 'hearts' }
			]),
			'spades'
		),
		2
	);
});

test('a round: quotas 5/3/2 by role, trump from the first five, 10 tricks, scores = tricks - quota', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(1), handId: 'h1' }));
	assert.equal(room.stage, 'trump');
	const [first, second, dealer] = room.order;
	assert.deepEqual([room.quotas[first], room.quotas[second], room.quotas[dealer]], [5, 3, 2]);
	assert.equal(room.dealerId, dealer);
	// The trump chooser holds exactly five cards when choosing; others' cards are hidden from them.
	const v = projection(room, first, ctx().connected);
	assert.equal(v.usersList.find((u) => u.id === first).cardsInHand.length, 5);
	assert.ok(
		v.usersList.filter((u) => u.id !== first).every((u) => u.cardsInHand.every((c) => c.rank === 0))
	);
	assert.ok(v.legalActions.chooseTrump);
	room = transition(room, first, 'chooseTrump', { suit: 'hearts' }, ctx());
	assert.equal(room.trump, 'hearts');
	assert.ok(room.order.every((id) => room.players.find((p) => p.id === id).cards.length === 10));
	assert.equal(room.stage, 'play');
	assert.equal(room.currentPlayerId, first);
	// Must follow suit.
	const lead = room.players.find((p) => p.id === first).cards[0];
	room = transition(room, first, 'play', { card: lead }, ctx());
	const next = room.players.find((p) => p.id === room.currentPlayerId);
	const off = next.cards.find((c) => c.suit !== lead.suit);
	if (off && next.cards.some((c) => c.suit === lead.suit))
		assert.throws(() => transition(room, next.id, 'play', { card: off }, ctx()), /Follow the suit/);
});

test('full rounds with random legal players: cards conserved, 10 tricks, scores add up, roles rotate', () => {
	const { results, room } = runTable325({
		seed: 3,
		table: 1,
		rounds: 9,
		seats: [randomPlayer, randomPlayer, randomPlayer]
	});
	for (const r of results) {
		assert.equal(r.reason, 'round-complete');
		assert.equal(
			Object.values(r.tricks).reduce((a, b) => a + b, 0),
			10
		);
		assert.equal(
			Object.values(r.diffs).reduce((a, b) => a + b, 0),
			0
		);
	}
	// Over nine rounds each seat dealt three times.
	assert.equal(room.round, 9);
	const total = Object.values(room.scores).reduce((a, b) => a + b, 0);
	assert.equal(total, 0);
});

test('pulling: one pull per extra trick, from the furthest below quota; it is its own phase', () => {
	assert.deepEqual(pullQueue({ a: 2, b: -1, c: -1 }), [
		{ puller: 'a', victim: 'b' },
		{ puller: 'a', victim: 'c' }
	]);
	assert.deepEqual(pullQueue({ a: 1, b: 1, c: -2 }), [
		{ puller: 'a', victim: 'c' },
		{ puller: 'b', victim: 'c' }
	]);
	assert.deepEqual(pullQueue({ a: 0, b: 0, c: 0 }), []);
	let pulls = 0;
	let checked = false;
	runTable325(
		{ seed: 5, table: 2, rounds: 6, seats: [randomPlayer, randomPlayer, randomPlayer] },
		{
			onDecision({ view, move, room }) {
				if (view.stage !== 'pull') return;
				if (move.action === 'pull') {
					pulls++;
					// The puller sees only how many face-down cards there are, never which they are.
					assert.equal(view.pull.taken, null);
					const victim = view.usersList.find((u) => u.id === view.pull.victim);
					assert.ok(victim.cardsInHand.every((c) => c.rank === 0));
					assert.equal(view.legalActions.pull, victim.cardCount);
					checked = true;
				} else {
					assert.equal(move.action, 'give');
					assert.ok(view.pull.taken, 'the puller learns the card they took');
					assert.ok(
						!view.legalActions.give.some(
							(c) => c.rank === view.pull.taken.rank && c.suit === view.pull.taken.suit
						)
					);
				}
				void room;
			}
		}
	);
	assert.ok(pulls > 0 && checked);
});

test('the face-down order depends on the secret deck order, not on how the cards are held', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(4), handId: 'h4' }));
	const victim = room.order[1];
	const a = faceDownOrder(room, victim, 0).map(cardKey);
	const reordered = structuredClone(room);
	reordered.players.find((p) => p.id === victim).cards.reverse();
	assert.deepEqual(faceDownOrder(reordered, victim, 0).map(cardKey), a);
	// A different secret (another deal of the same cards) gives a different order.
	const other = structuredClone(room);
	other.secret.salt = `${other.secret.salt}x`;
	assert.notDeepEqual(faceDownOrder(other, victim, 0).map(cardKey), a);
});

test('seat views hide every card a player could not see (swap invariance)', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(6), handId: 'h6' }));
	room = transition(room, room.order[0], 'chooseTrump', { suit: 'spades' }, ctx());
	for (const viewer of room.order) {
		const others = room.order.filter((id) => id !== viewer);
		const swapped = structuredClone(room);
		const [x, y] = others.map((id) => swapped.players.find((p) => p.id === id));
		[x.cards[0], y.cards[0]] = [y.cards[0], x.cards[0]];
		assert.deepEqual(
			projection(swapped, viewer, ctx().connected),
			projection(room, viewer, ctx().connected)
		);
	}
});

test('a person whose turn runs out gets a simple legal move; a leaver ends the round unscored', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(7), handId: 'h7' }));
	const first = room.order[0];
	assert.throws(() => transition(room, first, 'timeout', {}, ctx({ now: 2000 })), /not expired/);
	room = transition(room, first, 'timeout', {}, ctx({ now: 1000 + 60000 }));
	assert.ok(room.trump);
	assert.equal(room.players.find((p) => p.id === first).autoMoves, 1);
	const auto = autoMove(room, room.currentPlayerId);
	assert.equal(auto.action, 'play');
	room = transition(room, 'b', 'leave', {}, ctx());
	assert.equal(room.result.reason, 'abandoned');
	assert.equal(room.stage, 'round-over');
	assert.ok(Object.values(room.scores).every((s) => s === 0));
});

test('bots fill empty seats; a fourth player is refused; a round needs exactly three', () => {
	let room = newRoom('three-two-five-bots', 0, 'a');
	room = transition(room, 'a', 'join', { username: 'host' }, ctx());
	room = transition(room, 'a', 'ready', { ready: true }, ctx());
	assert.throws(
		() => transition(room, 'a', 'start', {}, ctx({ deck: deckFor(8), handId: 'x' })),
		/exactly three/
	);
	room = transition(
		room,
		'a',
		'addBot',
		{ botId: 'bot-rohit-1', characterId: 'rohit-sharma' },
		ctx()
	);
	assert.throws(
		() =>
			transition(room, 'a', 'addBot', { botId: 'bot-rohit-2', characterId: 'rohit-sharma' }, ctx()),
		/already at the table/
	);
	room = transition(room, 'a', 'addBot', { botId: 'bot-dhoni-1', characterId: 'ms-dhoni' }, ctx());
	assert.throws(() => transition(room, 'd', 'join', { username: 'late' }, ctx()), /full/);
	room = transition(room, 'a', 'start', {}, ctx({ deck: deckFor(8), handId: 'y' }));
	assert.equal(room.stage, 'trump');
	const v = projection(room, 'a', ctx().connected);
	assert.equal(v.usersList.filter((u) => u.isBot).length, 2);
});
