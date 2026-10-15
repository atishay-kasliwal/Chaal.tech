import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck, evaluateHand, compareHands } from '../../server/classic.mjs';
import { newRoom, transition, projection, invariant } from '../../server/engine.mjs';

const cards = (ranks) => ranks.map((rank, i) => ({ rank, suit: ['hearts', 'spades', 'clubs'][i] }));
const context = {
	now: 1000,
	turnMs: 60000,
	handId: 'test-hand',
	deck: freshDeck(),
	connected: new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
};
function waiting(count = 2) {
	let r = newRoom('test-room', 50, 'a');
	for (let i = 0; i < count; i++)
		r = transition(r, String.fromCharCode(97 + i), 'join', { username: `Player ${i}` }, context);
	return r;
}
function started(count = 2, deck = freshDeck()) {
	return transition(
		waiting(count),
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...context, deck }
	);
}

test('Classic category order, kickers, aces and ties are explicit', () => {
	const hands = [
		cards([14, 14, 14]),
		[
			{ rank: 14, suit: 'hearts' },
			{ rank: 13, suit: 'hearts' },
			{ rank: 12, suit: 'hearts' }
		],
		cards([14, 13, 12]),
		[
			{ rank: 14, suit: 'spades' },
			{ rank: 10, suit: 'spades' },
			{ rank: 4, suit: 'spades' }
		],
		cards([10, 10, 4]),
		cards([14, 10, 4])
	];
	for (let i = 0; i < hands.length - 1; i++) assert.equal(compareHands(hands[i], hands[i + 1]), 1);
	assert.equal(compareHands(cards([14, 13, 12]), cards([14, 2, 3])), 1);
	assert.equal(compareHands(cards([14, 2, 3]), cards([13, 12, 11])), 1);
	assert.equal(compareHands(cards([10, 10, 9]), cards([10, 10, 8])), 1);
	assert.equal(
		compareHands(
			cards([14, 10, 4]),
			cards([14, 10, 4]).map((c) => ({ ...c, suit: c.suit === 'hearts' ? 'diamonds' : c.suit }))
		),
		0
	);
	assert.throws(() =>
		evaluateHand([cards([2, 3, 4])[0], cards([2, 3, 4])[0], cards([2, 3, 4])[2]])
	);
});

test('All 22,100 physical three-card hands have expected independent category totals', () => {
	const d = freshDeck(),
		counts = [0, 0, 0, 0, 0, 0];
	for (let a = 0; a < 50; a++)
		for (let b = a + 1; b < 51; b++)
			for (let c = b + 1; c < 52; c++) counts[evaluateHand([d[a], d[b], d[c]])[0]]++;
	assert.deepEqual(counts, [16440, 3744, 1096, 720, 48, 52]);
});

test('Six-player deal conserves chips, has unique cards and keeps all blind hands private', () => {
	const r = started(6);
	assert.equal(r.pot, 6);
	assert.equal(r.deck.length, 34);
	assert.equal(
		new Set(r.players.flatMap((p) => p.cards.map((c) => `${c.rank}:${c.suit}`))).size,
		18
	);
	for (const player of r.players) {
		const view = projection(r, player.id, context.connected);
		assert.equal('deck' in view, false);
		assert.ok(
			view.usersList.every((p) => p.cardsInHand.every((c) => c.rank === 0 && c.suit === ''))
		);
	}
	const seen = transition(r, 'a', 'see', {}, context);
	const mine = projection(seen, 'a', context.connected),
		other = projection(seen, 'b', context.connected);
	assert.ok(mine.usersList.find((p) => p.id === 'a').cardsInHand.every((c) => c.rank > 0));
	assert.ok(other.usersList.find((p) => p.id === 'a').cardsInHand.every((c) => c.rank === 0));
	assert.ok(r.players.find((p) => p.id === 'a').isBlind); // Input snapshot was not mutated.
});

test('Reject wrong turn, malformed bets, wrong card count/deck and non-host start without mutation', () => {
	const r = started(3),
		before = JSON.stringify(r);
	for (const amount of [-1, 0, 1.5, NaN, Infinity, 3, 1000])
		assert.throws(() => transition(r, 'b', 'bet', { amount }, context));
	assert.throws(() => transition(r, 'a', 'bet', { amount: 1 }, context));
	assert.throws(() => transition(waiting(), 'b', 'start', { cutAt: 0, cardsToDeal: 3 }, context));
	assert.throws(() => transition(waiting(), 'a', 'start', { cutAt: 0, cardsToDeal: 4 }, context));
	assert.throws(() => started(2, Array(52).fill(freshDeck()[0])));
	assert.equal(JSON.stringify(r), before);
});

test('Lobby readiness is server state, required from every connected player before a hand starts', () => {
	let room = waiting(2);
	assert.equal(projection(room, 'a', context.connected).usersList[0].ready, undefined);
	room = transition(room, 'a', 'ready', { ready: true }, context);
	assert.equal(projection(room, 'a', context.connected).usersList[0].ready, true);
	assert.equal(projection(room, 'b', context.connected).usersList[0].ready, true);
	assert.throws(
		() =>
			transition(
				room,
				'a',
				'start',
				{ cutAt: 0, cardsToDeal: 3 },
				{ ...context, requireReady: true }
			),
		/Every connected player must be ready/
	);
	room = transition(room, 'b', 'ready', { ready: true }, context);
	room = transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...context, requireReady: true }
	);
	assert.ok(room.players.every((p) => p.ready === false));
	assert.equal(projection(room, 'a', context.connected).legalActions.ready, false);
});

test('Blind and seen betting bands advance turns and stake predictably', () => {
	let r = started(3);
	r = transition(r, 'b', 'bet', { amount: 2 }, context);
	assert.equal(r.maxStake, 4);
	assert.equal(r.pot, 5);
	assert.equal(r.currentPlayerId, 'c');
	r = transition(r, 'c', 'see', {}, context);
	assert.equal(projection(r, 'c', context.connected).legalActions.minBet, 4);
	r = transition(r, 'c', 'bet', { amount: 5 }, context);
	assert.equal(r.maxStake, 5);
	assert.equal(r.currentPlayerId, 'a');
	invariant(r);
});

test('Last-player settlement happens once and does not reveal a blind winner', () => {
	let r = started();
	r = transition(r, 'b', 'pack', {}, context);
	assert.equal(r.result.winnerId, 'a');
	assert.equal(r.players[0].balance, 51);
	assert.equal(r.pot, 0);
	assert.ok(
		projection(r, 'a', context.connected).usersList.every((p) =>
			p.cardsInHand.every((c) => c.rank === 0)
		)
	);
	assert.throws(() => transition(r, 'b', 'pack', {}, context));
	invariant(r);
});

test('Show compares server hands; equal show loses for requester; folded hands stay private', () => {
	let r = started(3);
	r.players[0].cards = cards([4, 5, 6]);
	r.players[1].cards = cards([6, 7, 8]);
	r = transition(r, 'b', 'see', {}, context);
	r = transition(r, 'b', 'bet', { amount: 2 }, context);
	r = transition(r, 'c', 'pack', {}, context);
	r = transition(r, 'a', 'see', {}, context);
	r = transition(r, 'a', 'show', {}, context);
	assert.equal(r.result.winnerId, 'b');
	assert.ok(
		projection(r, 'b', context.connected)
			.usersList.find((p) => p.id === 'c')
			.cardsInHand.every((c) => c.rank === 0)
	);
	let tie = started();
	tie.players[0].cards = cards([4, 5, 6]);
	tie.players[1].cards = cards([4, 5, 6]);
	tie = transition(tie, 'b', 'show', {}, context);
	assert.equal(tie.result.winnerId, 'a');
	assert.equal(tie.result.reason, 'show-tie-requester-loses');
	invariant(tie);
});

test('Timeout, departures and repeated join do not mint chips or strand a hand', () => {
	let r = started(3);
	assert.throws(() => transition(r, 'b', 'timeout', {}, context));
	r = transition(r, 'b', 'timeout', {}, { ...context, now: 62000 });
	assert.equal(r.players[1].isPacked, true);
	assert.equal(r.currentPlayerId, 'c');
	r = transition(r, 'a', 'leave', {}, context);
	assert.equal(r.result.winnerId, 'c');
	assert.equal(r.hostId, 'b');
	const chips = r.issuedChips;
	r = transition(r, 'a', 'join', { username: 'Returned' }, context);
	assert.equal(r.issuedChips, chips);
	assert.equal(r.players.find((p) => p.id === 'a').balance, 49);
	invariant(r);
});

test('Seat capacity is enforced and unfunded bets fail', () => {
	assert.throws(() => transition(waiting(6), 'g', 'join', { username: 'Seventh' }, context));
	const r = started();
	r.players[1].balance = 0;
	r.players[0].balance += 49;
	assert.throws(() => transition(r, 'b', 'bet', { amount: 1 }, context));
});

for (const rulesVersion of [
	'classic-1',
	'muflis-1',
	'ak47-1',
	'joker-1',
	'lowest-joker-1',
	'999-1'
])
	test(`${rulesVersion}: server hand contributions include boot, blind/seen bets and Show, reset per hand and survive Pack`, () => {
		let room = waiting(3);
		room.rulesVersion = rulesVersion;
		room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3 }, context);
		assert.deepEqual(
			room.players.map((p) => p.handBet),
			[1, 1, 1]
		);
		room = transition(room, 'b', 'bet', { amount: 2, handBet: 99999 }, context);
		assert.deepEqual(
			room.players.map((p) => p.handBet),
			[1, 3, 1]
		);
		room = transition(room, 'c', 'pack', {}, context);
		room = transition(room, 'a', 'see', {}, context);
		room = transition(room, 'a', 'bet', { amount: 4 }, context);
		room = transition(room, 'b', 'see', {}, context);
		room = transition(room, 'b', 'show', {}, context);
		assert.deepEqual(
			room.players.map((p) => p.handBet),
			[5, 7, 1]
		);
		assert.equal(room.result.amount, 13);
		assert.equal(room.pot, 0);
		assert.deepEqual(
			projection(room, 'a', context.connected).usersList.map((p) => p.handBet),
			[5, 7, 1]
		);
		assert.equal(
			room.players.reduce((sum, p) => sum + p.balance, 0),
			150
		);
		room = transition(
			room,
			'a',
			'start',
			{ cutAt: 0, cardsToDeal: 3 },
			{ ...context, handId: 'next' }
		);
		assert.deepEqual(
			room.players.map((p) => p.handBet),
			[1, 1, 1]
		);
		invariant(room);
	});

test('Legacy in-progress rooms expose unknown contributions until a new deal; invalid totals fail invariants', () => {
	let room = started(2);
	for (const p of room.players) delete p.handBet;
	room = transition(room, 'b', 'bet', { amount: 1 }, context);
	assert.ok(projection(room, 'a', context.connected).usersList.every((p) => p.handBet === null));
	room = transition(room, 'a', 'pack', {}, context);
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3 }, context);
	assert.deepEqual(
		room.players.map((p) => p.handBet),
		[1, 1]
	);
	room.players[0].handBet = -1;
	assert.throws(() => invariant(room));
	room.players[0].handBet = 99;
	assert.throws(() => invariant(room));
});

test('A departed seat is released after a six-player hand, so rejoin preserves the old balance', () => {
	let room = started(6);
	room = transition(room, 'a', 'leave', {}, context);
	while (!room.gameShow) room = transition(room, room.currentPlayerId, 'pack', {}, context);
	const balance = room.players.find((p) => p.id === 'a').balance;
	const issued = room.issuedChips;
	room = transition(room, 'a', 'join', { username: 'Returned' }, context);
	assert.equal(room.players.find((p) => p.id === 'a').seatNumber, 0);
	assert.equal(room.players.find((p) => p.id === 'a').balance, balance);
	assert.equal(room.issuedChips, issued);
	assert.equal(
		new Set(room.players.filter((p) => p.seatNumber !== null).map((p) => p.seatNumber)).size,
		6
	);
	invariant(room);
});

test('Table options set the boot, scale the betting bands and seat players ready', () => {
	assert.throws(() => newRoom('boot-room', 1000, 'a', 'classic-1', { boot: 51 }), /Boot/);
	assert.throws(() => newRoom('boot-room', 1000, 'a', 'classic-1', { boot: 2.5 }), /Boot/);
	let room = newRoom('boot-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ['a', 'b', 'c']) room = transition(room, id, 'join', { username: id }, context);
	assert.ok(room.players.every((p) => p.ready === true));
	assert.equal(projection(room, 'a', context.connected).boot, 10);
	room = transition(room, 'c', 'ready', { ready: false }, context);
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3 }, { ...context, requireReady: true });
	assert.equal(room.pot, 20);
	assert.equal(room.maxStake, 20);
	assert.equal(room.players.find((p) => p.id === 'c').isPacked, true);
	assert.equal(room.players.find((p) => p.id === 'c').balance, 1000);
	const view = projection(room, 'b', context.connected);
	assert.equal(view.legalActions.minBet, 10);
	assert.equal(view.legalActions.maxBet, 20);
	assert.equal(view.turnMs, 60000);
	assert.equal(view.legalActions.ready, true);
	room = transition(room, 'c', 'ready', { ready: true }, context);
	room = transition(room, 'b', 'see', {}, context);
	assert.equal(projection(room, 'b', context.connected).legalActions.minBet, 20);
	assert.equal(projection(room, 'b', context.connected).legalActions.maxBet, 40);
	room = transition(room, 'b', 'bet', { amount: 40 }, context);
	assert.equal(room.maxStake, 40);
	assert.ok(room.players.every((p) => p.ready === true));
	invariant(room);
});
