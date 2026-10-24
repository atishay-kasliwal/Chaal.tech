import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { getVariant } from '../../server/variants/index.mjs';
import { newRoom, transition, projection, invariant } from '../../server/engine.mjs';

const c = (rank, suit) => ({ rank, suit });
const H = 'hearts',
	S = 'spades',
	D = 'diamonds',
	C = 'clubs';
const ids = ['a', 'b', 'c'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, handId: 'h1', deck: freshDeck(), connected };

/** A hand where seat order a, b, c is dealt the given hands. */
function deckFor(...hands) {
	const dealt = [];
	for (let i = 0; i < hands[0].length; i++) for (const hand of hands) dealt.push(hand[i]);
	const key = (card) => `${card.rank}:${card.suit}`;
	const used = new Set(dealt.map(key));
	return [...dealt, ...freshDeck().filter((card) => !used.has(key(card)))];
}
function start(rulesVersion, hands, players = ids.slice(0, hands.length)) {
	let room = newRoom('swap-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of players) room = transition(room, id, 'join', { username: id }, ctx);
	return transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3, rulesVersion },
		{ ...ctx, deck: deckFor(...hands) }
	);
}
const cardsOf = (room, id) => room.players.find((p) => p.id === id).cards;
const view = (room, id) => projection(room, id, connected);
const look = (room, ...who) => who.reduce((r, id) => transition(r, id, 'see', {}, ctx), room);

const A = [c(9, H), c(5, S), c(2, C)];
const B = [c(13, D), c(7, S), c(3, C)];
const Cc = [c(14, H), c(10, S), c(4, D)];

test('Trade One: a seen player swaps a card with the same slot of a rival, once, and the rival is told', () => {
	let room = start('trade-one-1', [A, B, Cc]);
	assert.deepEqual(view(room, 'a').legalActions.table, []);
	assert.throws(
		() => transition(room, 'a', 'table', { kind: 'trade', index: 1, target: 'b' }, ctx),
		/Look at your cards/
	);
	room = look(room, 'a');
	const options = view(room, 'a').legalActions.table;
	assert.equal(options.length, 3 * 2 + 1);
	assert.throws(
		() => transition(room, 'a', 'table', { kind: 'trade', index: 1, target: 'a' }, ctx),
		/rival/
	);
	room = transition(room, 'a', 'table', { kind: 'trade', index: 1, target: 'b' }, ctx);
	assert.deepEqual(cardsOf(room, 'a'), [A[0], B[1], A[2]]);
	assert.deepEqual(cardsOf(room, 'b'), [B[0], A[1], B[2]]);
	assert.deepEqual(view(room, 'b').variantState.trades, [{ from: 'a', to: 'b' }]);
	assert.deepEqual(view(room, 'a').legalActions.table, []);
	assert.throws(
		() => transition(room, 'a', 'table', { kind: 'trade', index: 0, target: 'c' }, ctx),
		/already traded/
	);
	// Keeping your hand also uses the trade up.
	room = look(room, 'b');
	room = transition(room, 'b', 'table', { kind: 'trade', index: -1 }, ctx);
	assert.deepEqual(cardsOf(room, 'b'), [B[0], A[1], B[2]]);
	assert.deepEqual(view(room, 'b').legalActions.table, []);
	invariant(room);
});

test('Pass the Card: once everyone has picked, each card moves to the next seat', () => {
	let room = start('pass-the-card-1', [A, B, Cc]);
	// Blind players may pass; picking twice or a bad slot is refused.
	assert.equal(view(room, 'a').legalActions.table.length, 3);
	assert.throws(() => transition(room, 'a', 'table', { kind: 'pass', index: 3 }, ctx), /Choose one/);
	room = transition(room, 'a', 'table', { kind: 'pass', index: 0 }, ctx);
	assert.throws(() => transition(room, 'a', 'table', { kind: 'pass', index: 1 }, ctx), /already picked/);
	room = transition(room, 'b', 'table', { kind: 'pass', index: 1 }, ctx);
	assert.deepEqual(view(room, 'c').variantState, { passed: ['a', 'b'], done: false });
	assert.deepEqual(cardsOf(room, 'a'), A);
	room = transition(room, 'c', 'table', { kind: 'pass', index: 2 }, ctx);
	// a gets c's slot-2 card in a's slot 0, b gets a's slot-0 card in b's slot 1, c gets b's slot 1 in slot 2.
	assert.deepEqual(cardsOf(room, 'a'), [Cc[2], A[1], A[2]]);
	assert.deepEqual(cardsOf(room, 'b'), [B[0], A[0], B[2]]);
	assert.deepEqual(cardsOf(room, 'c'), [Cc[0], Cc[1], B[1]]);
	assert.equal(view(room, 'a').variantState.done, true);
	assert.deepEqual(view(room, 'a').legalActions.table, []);
	invariant(room);
});

test('Pass the Card: a player who packs no longer holds the others up', () => {
	let room = start('pass-the-card-1', [A, B, Cc]);
	room = transition(room, 'a', 'table', { kind: 'pass', index: 0 }, ctx);
	room = transition(room, 'b', 'table', { kind: 'pass', index: 0 }, ctx);
	for (let i = 0; i < 6 && !view(room, 'a').variantState.done; i++) {
		const turn = room.currentPlayerId;
		room =
			turn === 'c'
				? transition(room, 'c', 'pack', {}, ctx)
				: transition(room, turn, 'bet', { amount: view(room, turn).legalActions.minBet }, ctx);
	}
	assert.equal(view(room, 'a').variantState.done, true);
	assert.deepEqual(cardsOf(room, 'a')[0], B[0]);
	assert.deepEqual(cardsOf(room, 'b')[0], A[0]);
	invariant(room);
});

test('High Low: the Show must say high or low, and the call decides the winner', () => {
	for (const declare of ['high', 'low']) {
		const pairHand = [c(9, H), c(9, S), c(2, C)];
		const weak = [c(13, D), c(7, S), c(3, C)];
		let room = start('high-low-1', [pairHand, weak]);
		const asker = room.currentPlayerId;
		const other = asker === 'a' ? 'b' : 'a';
		const asksWithPair = cardsOf(room, asker)[0].rank === 9;
		assert.throws(() => transition(room, asker, 'show', {}, ctx), /high or the low/);
		room = transition(room, asker, 'show', { declare }, ctx);
		const highWinner = asksWithPair ? asker : other;
		const expected = declare === 'high' ? highWinner : highWinner === asker ? other : asker;
		assert.equal(room.result.winnerId, expected, declare);
		assert.equal(room.result.reason, `show-${declare}`);
		invariant(room);
	}
	// Equal hands lose for the asker whichever end is called.
	let room = start('high-low-1', [[c(9, H), c(8, S), c(2, C)], [c(9, D), c(8, C), c(2, H)]]);
	const asker = room.currentPlayerId;
	room = transition(room, asker, 'show', { declare: 'low' }, ctx);
	assert.equal(room.result.reason, 'show-tie-requester-loses');
	assert.notEqual(room.result.winnerId, asker);
});

test('Split Pot: a big pot with three players in is split between the best and the worst hand', () => {
	const best = [c(9, H), c(9, S), c(9, C)];
	const middle = [c(13, D), c(7, S), c(3, C)];
	const worst = [c(8, H), c(5, S), c(2, D)];
	let room = start('split-pot-1', [best, middle, worst]);
	const total = room.players.reduce((n, p) => n + p.balance, room.pot);
	for (let i = 0; i < 40 && !room.result; i++) {
		const turn = room.currentPlayerId;
		room = transition(room, turn, 'bet', { amount: view(room, turn).legalActions.maxBet }, ctx);
	}
	assert.equal(room.result.reason, 'split-pot');
	assert.deepEqual(
		room.result.winners.map((w) => w.id),
		['a', 'c']
	);
	assert.equal(room.result.winners[0].amount + room.result.winners[1].amount, room.result.amount);
	assert.ok(room.result.winners[0].amount >= room.result.winners[1].amount);
	assert.equal(room.players.reduce((n, p) => n + p.balance, room.pot), total);
	assert.deepEqual(room.result.revealedPlayerIds.sort(), ['a', 'b', 'c']);
	invariant(room);
});

test('Split Pot: with two players left it is an ordinary Show', () => {
	let room = start('split-pot-1', [A, B]);
	room = transition(room, room.currentPlayerId, 'show', {}, ctx);
	assert.equal(room.result.reason, 'show');
	assert.equal(room.result.winners, undefined);
});

test('Faceoff: on your turn challenge one player; the loser is out and the hand goes on', () => {
	let room = start('faceoff-1', [A, B, Cc]);
	const challenger = room.currentPlayerId;
	const targets = view(room, challenger).legalActions.faceoff;
	assert.deepEqual(targets.sort(), ids.filter((id) => id !== challenger));
	const other = ids.find((id) => id !== challenger);
	assert.throws(
		() => transition(room, ids.find((id) => id !== challenger), 'table', { kind: 'faceoff', target: challenger }, ctx),
		/not your turn/
	);
	const pot = room.pot;
	const fee = view(room, challenger).legalActions.minBet;
	const mine = cardsOf(room, challenger);
	const theirs = cardsOf(room, other);
	room = transition(room, challenger, 'table', { kind: 'faceoff', target: other }, ctx);
	const stronger = getVariant('faceoff-1').compareHands(mine, theirs) > 0 ? challenger : other;
	const loser = stronger === challenger ? other : challenger;
	assert.equal(room.players.find((p) => p.id === loser).isPacked, true);
	assert.equal(room.players.find((p) => p.id === stronger).isPacked, false);
	assert.equal(room.pot, pot + fee);
	assert.ok(room.shownIds.includes(challenger) && room.shownIds.includes(other));
	assert.deepEqual(room.variantState.faceoffs, [{ challenger, target: other, loser }]);
	// Both hands are public now.
	const outsider = ids.find((id) => id !== challenger && id !== other);
	const seen = view(room, outsider).usersList.find((u) => u.id === loser);
	assert.ok(seen.cardsInHand.every((card) => card.rank > 0));
	assert.notEqual(room.currentPlayerId, loser);
	invariant(room);
});

test('Faceoff: equal hands go against the challenger, and seen players cannot pick on a blind one', () => {
	let room = start('faceoff-1', [
		[c(9, H), c(8, S), c(2, C)],
		[c(9, D), c(8, C), c(2, H)],
		Cc
	]);
	const challenger = room.currentPlayerId;
	// a and b hold equal hands; c holds the strongest. Whoever starts is a or b, or c.
	assert.ok(['a', 'b', 'c'].includes(challenger));
	const rival = challenger === 'a' ? 'b' : 'a';
	const seenFirst = look(room, challenger);
	assert.deepEqual(view(seenFirst, challenger).legalActions.faceoff, []);
	assert.throws(
		() => transition(seenFirst, challenger, 'table', { kind: 'faceoff', target: rival }, ctx),
		/blind/
	);
	room = transition(room, challenger, 'table', { kind: 'faceoff', target: rival }, ctx);
	// Equal hands (a vs b) go against the challenger; against c the challenger loses on strength.
	assert.equal(room.players.find((p) => p.id === challenger).isPacked, true);
});
