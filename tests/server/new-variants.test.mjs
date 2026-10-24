import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck, evaluateHand as evaluateClassic } from '../../server/classic.mjs';
import { getVariant } from '../../server/variants/index.mjs';
import { describeHand, wildIndexes } from '../../server/variants/describe.mjs';
import { newRoom, transition, projection, invariant } from '../../server/engine.mjs';

const c = (rank, suit) => ({ rank, suit });
const H = 'hearts',
	S = 'spades',
	D = 'diamonds',
	C = 'clubs';
const connected = new Set(['a', 'b', 'c']);
const ctx = { now: 1000, turnMs: 60000, handId: 'h1', deck: freshDeck(), connected };

function startRoom(rulesVersion, deck = freshDeck(), players = ['a', 'b']) {
	let room = newRoom('variant-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of players) room = transition(room, id, 'join', { username: id }, ctx);
	const cardsToDeal = getVariant(rulesVersion).cardsPerPlayer ?? 3;
	return transition(room, 'a', 'start', { cutAt: 0, cardsToDeal, rulesVersion }, { ...ctx, deck });
}

/** A deck whose first cards are dealt round-robin: hands[0] to seat 0, hands[1] to seat 1. */
function deckFor(...hands) {
	const dealt = [];
	for (let i = 0; i < hands[0].length; i++) for (const hand of hands) dealt.push(hand[i]);
	const key = (card) => `${card.rank}:${card.suit}`;
	const used = new Set(dealt.map(key));
	return [...dealt, ...freshDeck().filter((card) => !used.has(key(card)))];
}

test('Highest Joker: the highest rank in your own hand is wild', () => {
	const v = getVariant('highest-joker-1');
	assert.deepEqual(v.evaluateHand([c(13, S), c(9, H), c(3, C)]), [1, 9, 3]);
	assert.deepEqual(v.evaluateHand([c(13, S), c(13, H), c(5, C)]), [5, 5]);
	assert.deepEqual(v.evaluateHand([c(14, S), c(14, H), c(14, C)]), [5, 14]);
	// Wild K becomes K♥: pure sequence K-Q-J (A♥ cannot complete A-Q-J).
	assert.deepEqual(v.evaluateHand([c(13, S), c(12, H), c(11, H)]), [4, 13]);
	assert.deepEqual(v.wildIndexes([c(13, S), c(9, H), c(3, C)]), [0]);
	assert.equal(v.compareHands([c(13, S), c(13, H), c(5, C)], [c(12, S), c(9, H), c(3, C)]), 1);
});

test('One-Eyed Jack: only J♥ and J♠ are wild', () => {
	const v = getVariant('one-eyed-jack-1');
	assert.deepEqual(v.evaluateHand([c(11, H), c(5, S), c(5, D)]), [5, 5]);
	assert.deepEqual(v.evaluateHand([c(11, S), c(5, S), c(5, D)]), [5, 5]);
	assert.deepEqual(
		v.evaluateHand([c(11, D), c(5, S), c(5, D)]),
		evaluateClassic([c(11, D), c(5, S), c(5, D)])
	);
	assert.deepEqual(v.evaluateHand([c(11, C), c(2, S), c(9, D)]), [0, 11, 9, 2]);
	assert.deepEqual(v.wildIndexes([c(11, H), c(11, D), c(11, S)]), [0, 2]);
	// Two one-eyed jacks with a natural Jack make a trail of Jacks.
	assert.deepEqual(v.evaluateHand([c(11, H), c(11, D), c(11, S)]), [5, 11]);
});

test('Color Joker: an open card picks a colour and every card of it is wild', () => {
	const v = getVariant('color-joker-1');
	const red = { wildColor: 'red' };
	assert.deepEqual(v.evaluateHand([c(2, H), c(3, S), c(4, S)], red), [4, 5]);
	assert.deepEqual(v.evaluateHand([c(2, H), c(3, D), c(4, S)], red), [5, 4]);
	assert.deepEqual(v.evaluateHand([c(2, H), c(3, D), c(4, H)], red), [5, 14]);
	assert.deepEqual(
		v.evaluateHand([c(2, C), c(9, S), c(4, S)], red),
		evaluateClassic([c(2, C), c(9, S), c(4, S)])
	);
	assert.deepEqual(v.wildIndexes([c(2, C), c(9, H), c(4, S)], { wildColor: 'black' }), [0, 2]);
	assert.throws(() => v.evaluateHand([c(2, H), c(3, S), c(4, S)], {}), /colour/);
	const prepared = v.prepareHand({ remainingDeck: [c(7, C), c(8, H)] });
	assert.deepEqual(prepared, {
		state: { wildColor: 'black', indicator: c(7, C) },
		cardsConsumed: 1
	});
	assert.throws(() => v.prepareHand({ remainingDeck: [] }), /indicator/);
});

test('Odd/Even: the odd-parity card in your hand is your joker', () => {
	const v = getVariant('odd-even-1');
	assert.deepEqual(v.wildIndexes([c(3, H), c(5, S), c(8, C)]), [2]);
	assert.deepEqual(v.wildIndexes([c(4, H), c(8, S), c(9, C)]), [2]);
	// Ace is 14 (even): A with two odds makes the Ace the joker.
	assert.deepEqual(v.wildIndexes([c(14, H), c(5, S), c(9, C)]), [0]);
	assert.deepEqual(v.wildIndexes([c(3, H), c(5, S), c(9, C)]), []);
	assert.deepEqual(v.wildIndexes([c(2, H), c(4, S), c(8, C)]), []);
});

test('Lallan Kallan: the odd-coloured card in your hand is your joker', () => {
	const v = getVariant('lallan-kallan-1');
	// Two hearts + K♠: the spade is wild and best becomes a colour, A high (colour beats pair).
	assert.deepEqual(v.evaluateHand([c(2, H), c(9, H), c(13, S)]), [2, 14, 9, 2]);
	assert.deepEqual(v.wildIndexes([c(2, H), c(9, H), c(13, S)]), [2]);
	assert.deepEqual(v.wildIndexes([c(2, H), c(9, S), c(13, C)]), [0]);
	// One colour: no joker at all.
	assert.deepEqual(v.wildIndexes([c(2, H), c(9, D), c(13, H)]), []);
	assert.deepEqual(
		v.evaluateHand([c(2, H), c(9, D), c(13, H)]),
		evaluateClassic([c(2, H), c(9, D), c(13, H)])
	);
	// Pair + odd card makes a trail.
	assert.deepEqual(v.evaluateHand([c(8, H), c(8, D), c(3, S)]), [5, 8]);
});

test('Pot Blind: nobody can see, betting stays blind, Show still settles', () => {
	let room = startRoom('pot-blind-1');
	assert.equal(projection(room, 'b', connected).legalActions.see, false);
	assert.throws(() => transition(room, 'b', 'see', {}, ctx), /blind until the Show/);
	room = transition(room, 'b', 'bet', { amount: 10 }, ctx);
	room = transition(room, 'a', 'show', {}, ctx);
	assert.ok(room.result);
	assert.equal(room.pot, 0);
	invariant(room);
	assert.ok(projection(room, 'a', connected).usersList.every((user) => user.handName));
});

test('Discard One: four cards, look, discard one, play three; blind players use their first three', () => {
	const hands = [
		[c(14, S), c(14, H), c(2, C), c(14, D)],
		[c(13, S), c(13, H), c(13, D), c(3, C)]
	];
	let room = startRoom('discard-one-1', deckFor(hands[0], hands[1]));
	assert.ok(room.players.every((p) => p.cards.length === 4));
	// b (seat 1) acts first after the host. b looks and must discard before betting.
	room = transition(room, 'b', 'see', {}, ctx);
	let view = projection(room, 'b', connected);
	assert.equal(view.legalActions.discard, true);
	assert.equal(view.legalActions.bet, false);
	assert.throws(() => transition(room, 'b', 'bet', { amount: 20 }, ctx), /Discard/);
	assert.throws(() => transition(room, 'b', 'discard', { index: 4 }, ctx), /Choose/);
	room = transition(room, 'b', 'discard', { index: 3 }, ctx);
	view = projection(room, 'b', connected);
	assert.equal(view.usersList[1].cardsInHand.length, 3);
	assert.equal(view.usersList[1].handName, 'Trail of Kings');
	assert.equal(view.legalActions.discard, false);
	assert.throws(() => transition(room, 'b', 'discard', { index: 0 }, ctx), /nothing to discard/);
	room = transition(room, 'b', 'bet', { amount: 20 }, ctx);
	// a stays blind: first three cards A A 2 = pair of Aces, loses to the trail of Kings.
	room = transition(room, 'a', 'show', {}, ctx);
	assert.equal(room.result.winnerId, 'b');
	invariant(room);
	// The discarded card is gone for good; no hidden card leaks to the other player.
	assert.equal(room.players.find((p) => p.id === 'b').cards.length, 3);
});

test('Hand names and joker markers are only sent for hands the viewer may see', () => {
	let room = startRoom(
		'one-eyed-jack-1',
		deckFor([c(11, H), c(5, S), c(5, D)], [c(9, C), c(8, C), c(2, D)])
	);
	let view = projection(room, 'a', connected);
	assert.equal(view.usersList[0].handName, undefined);
	room = transition(room, 'a', 'see', {}, ctx);
	view = projection(room, 'a', connected);
	assert.equal(view.usersList[0].handName, 'Trail of 5s (with joker)');
	assert.deepEqual(view.usersList[0].wildCards, [0]);
	assert.equal(view.usersList[1].handName, undefined);
	assert.equal(projection(room, 'b', connected).usersList[0].handName, undefined);
});

test('Open-card games publish face-up cards to everyone and keep the rest hidden', () => {
	const hands = [
		[c(9, H), c(5, S), c(2, C)],
		[c(13, D), c(7, S), c(3, C)]
	];
	for (const [version, open] of [['open-card-1', 1], ['one-hidden-1', 2]]) {
		const room = startRoom(version, deckFor(...hands));
		// Before anyone looks, a (blind) player and every rival see exactly the open cards.
		for (const viewer of ['a', 'b']) {
			const view = projection(room, viewer, connected);
			for (const [i, user] of view.usersList.entries()) {
				assert.equal(user.openCards.length, open, version);
				assert.deepEqual(
					user.openCards.map((o) => o.card),
					hands[i].slice(0, open),
					version
				);
				assert.ok(user.cardsInHand.every((card) => card.rank === 0), 'hand stays hidden');
			}
		}
		// Once you look, your own hand is fully visible and the extra field disappears.
		const looked = transition(room, 'a', 'see', {}, ctx);
		const mine = projection(looked, 'a', connected).usersList[0];
		assert.deepEqual(mine.cardsInHand, hands[0]);
		assert.equal(mine.openCards, undefined);
		// A rival still sees only your open cards.
		const theirs = projection(looked, 'b', connected).usersList[0];
		assert.equal(theirs.openCards.length, open);
		assert.ok(theirs.cardsInHand.every((card) => card.rank === 0));
	}
	// Other games never publish open cards.
	const plain = projection(startRoom('classic-1', deckFor(...hands)), 'b', connected);
	assert.equal(plain.usersList[0].openCards, undefined);
});

test('Stud turns the second card up when the pot reaches 100', () => {
	const hands = [
		[c(9, H), c(5, S), c(2, C)],
		[c(13, D), c(7, S), c(3, C)]
	];
	let room = startRoom('stud-1', deckFor(...hands));
	assert.equal(projection(room, 'b', connected).usersList[0].openCards.length, 1);
	for (let i = 0; i < 30 && room.pot < 100; i++) {
		const turn = room.currentPlayerId;
		room = transition(room, turn, 'bet', { amount: projection(room, turn, connected).legalActions.maxBet }, ctx);
	}
	assert.ok(room.pot >= 100, 'the pot reached 100');
	assert.equal(projection(room, 'b', connected).usersList[0].openCards.length, 2);
	invariant(room);
});

test('Draw: a seen player swaps one card from the deck, once, and rivals only see who drew', () => {
	const hands = [
		[c(9, H), c(5, S), c(2, C)],
		[c(13, D), c(7, S), c(3, C)]
	];
	const deck = deckFor(...hands);
	const next = deck[6]; // the first card after the six dealt
	let room = startRoom('draw-1', deck);
	// Blind: no draw yet.
	assert.deepEqual(projection(room, 'a', connected).legalActions.table, []);
	assert.throws(() => transition(room, 'a', 'table', { kind: 'draw', index: 0 }, ctx), /Look at your cards/);
	room = transition(room, 'a', 'see', {}, ctx);
	const options = projection(room, 'a', connected).legalActions.table;
	assert.deepEqual(options.map((o) => o.index), [0, 1, 2, -1]);
	room = transition(room, 'a', 'table', { kind: 'draw', index: 2 }, ctx);
	const mine = projection(room, 'a', connected);
	assert.deepEqual(mine.usersList[0].cardsInHand, [hands[0][0], hands[0][1], next]);
	assert.deepEqual(mine.legalActions.table, []);
	assert.deepEqual(mine.variantState.drawn, ['a']);
	assert.throws(() => transition(room, 'a', 'table', { kind: 'draw', index: 0 }, ctx), /already drew/);
	// A rival learns that a drew, not what a holds.
	const theirs = projection(room, 'b', connected);
	assert.deepEqual(theirs.variantState.drawn, ['a']);
	assert.ok(theirs.usersList[0].cardsInHand.every((card) => card.rank === 0));
	// Standing pat uses the draw without changing the hand.
	room = transition(room, 'b', 'see', {}, ctx);
	room = transition(room, 'b', 'table', { kind: 'draw', index: -1 }, ctx);
	assert.deepEqual(projection(room, 'b', connected).usersList[1].cardsInHand, hands[1]);
	assert.deepEqual(projection(room, 'b', connected).legalActions.table, []);
	invariant(room);
});

test('Every registered variant names hands in plain language', () => {
	const samples = {
		'classic-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'muflis-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'ak47-1': [[c(14, H), c(9, S), c(9, C)], 'Trail of 9s (with joker)'],
		'joker-1': [[c(5, H), c(9, S), c(9, C)], 'Trail of 9s (with joker)', { wildRank: 5 }],
		'lowest-joker-1': [[c(2, H), c(9, S), c(9, C)], 'Trail of 9s (with joker)'],
		'999-1': [[c(9, H), c(8, S), c(14, C)], 'Scores 981'],
		'2-card-1': [[c(9, H), c(9, S)], 'Pair of 9s'],
		'4-card-1': [[c(9, H), c(9, S), c(9, C), c(2, D)], 'Trail of 9s'],
		'highest-joker-1': [[c(13, H), c(9, S), c(9, C)], 'Trail of 9s (with joker)'],
		'one-eyed-jack-1': [[c(11, H), c(9, S), c(9, C)], 'Trail of 9s (with joker)'],
		'color-joker-1': [
			[c(2, H), c(9, S), c(9, C)],
			'Trail of 9s (with joker)',
			{ wildColor: 'red' }
		],
		'lallan-kallan-1': [[c(2, H), c(9, S), c(9, C)], 'Trail of 9s (with joker)'],
		'best-of-five-1': [[c(3, H), c(2, H), c(14, H), c(9, C), c(7, D)], 'Pure sequence A-2-3'],
		'worst-of-four-1': [[c(14, H), c(9, S), c(4, C), c(2, D)], 'High card 9'],
		'hukum-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s · 1 trump', { trump: 'hearts' }],
		'red-black-1': [[c(13, H), c(8, D), c(3, H)], 'All red, King high'],
		'progressive-joker-1': [
			[c(9, H), c(9, S), c(4, C)],
			'Pair of 9s',
			{ indicator: c(2, D), stage: 0, wildRanks: [], wildSuit: null }
		],
		'open-card-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'one-hidden-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'stud-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'trade-one-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'pass-the-card-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'high-low-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'split-pot-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'faceoff-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'buying-joker-2': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'auction-2': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'knockout-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'sudden-death-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'survivor-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'banko-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'community-1': [
			[c(9, H), c(9, S)],
			'Pair of 9s',
			{ community: [c(4, C), c(2, D), c(3, H)], opened: 1 }
		],
		'side-show-2': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'draw-1': [[c(9, H), c(9, S), c(4, C)], 'Pair of 9s'],
		'odd-even-1': [[c(3, H), c(5, S), c(8, C)], 'Sequence, 5 high (with joker)'],
		'pot-blind-1': [[c(14, H), c(13, H), c(12, H)], 'Pure sequence, Ace high'],
		'discard-one-1': [[c(3, H), c(2, H), c(14, H), c(9, C)], 'Pure sequence A-2-3']
	};
	for (const [version, [cards, name, state]] of Object.entries(samples))
		assert.equal(describeHand(getVariant(version), cards, state), name, version);
	assert.deepEqual(wildIndexes(getVariant('ak47-1'), [c(14, H), c(9, S), c(7, C)]), [0, 2]);
	assert.deepEqual(wildIndexes(getVariant('classic-1'), [c(14, H), c(9, S), c(7, C)]), []);
	assert.equal(describeHand(getVariant('classic-1'), [c(0, ''), c(0, ''), c(0, '')]), null);
});

test('Two- and three-joker shortcuts equal the full search for every sampled hand', async () => {
	const { bestWildHand } = await import('../../server/variants/hand-utils.mjs');
	const deck = freshDeck();
	// A wrapper evaluator disables the shortcut, forcing the exhaustive search.
	const exhaustive = (cards) => evaluateClassic(cards);
	let checked = 0;
	for (let a = 0; a < 52; a++)
		for (let b = a + 1; b < 52; b++)
			for (let x = b + 1; x < 52; x++) {
				if ((a * 7 + b * 3 + x) % 23) continue;
				const cards = [deck[a], deck[b], deck[x]];
				for (const mask of [3, 5, 6, 7]) {
					const wild = (card) => ((mask >> cards.indexOf(card)) & 1) === 1;
					assert.deepEqual(
						bestWildHand(cards, wild, evaluateClassic),
						bestWildHand(cards, wild, exhaustive)
					);
					checked++;
				}
			}
	assert.ok(checked > 3000);
});
