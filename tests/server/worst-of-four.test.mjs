import test from 'node:test';
import assert from 'node:assert/strict';
import { worstOfFour as v } from '../../server/variants/worst-of-four.mjs';

const c = (rank, suit) => ({ rank, suit });

test('identity and shape', () => {
	assert.equal(v.id, 'worst-of-four');
	assert.equal(v.rulesVersion, 'worst-of-four-1');
	assert.equal(v.name, 'Worst of Four');
	assert.equal(v.cardsPerPlayer, 4);
	const rules = v.getRules();
	assert.equal(rules.cardsPerPlayer, 4);
	assert.equal(rules.bestCards, 3);
	assert.deepEqual(rules.rankingOrder.at(-1), 'trail');
	assert.ok(!/—/.test(v.description + rules.comparison));
});

test('a trail loses to a high card', () => {
	const trail = [c(14, 'spades'), c(14, 'hearts'), c(14, 'clubs'), c(14, 'diamonds')];
	const high = [c(2, 'spades'), c(5, 'hearts'), c(9, 'clubs'), c(13, 'diamonds')];
	assert.ok(v.compareHands(high, trail) > 0);
	assert.ok(v.compareHands(trail, high) < 0);
});

test('A-2-4-9 picks the lowest subset', () => {
	const hand = [c(14, 'spades'), c(2, 'hearts'), c(4, 'clubs'), c(9, 'diamonds')];
	assert.equal(v.describe(hand), 'High card 9');
	// 9-high beats a hand whose lowest is King high.
	const worse = [c(13, 'spades'), c(11, 'hearts'), c(12, 'clubs'), c(10, 'diamonds')];
	assert.ok(v.compareHands(hand, worse) > 0);
});

test('equal hands compare equal and suits do not matter', () => {
	const a = [c(2, 'spades'), c(5, 'hearts'), c(9, 'clubs'), c(13, 'diamonds')];
	const b = [c(2, 'hearts'), c(5, 'spades'), c(9, 'diamonds'), c(13, 'clubs')];
	assert.equal(v.compareHands(a, b), 0);
});

test('four of a kind falls back to a trail, the worst hand', () => {
	const quad = [c(7, 'spades'), c(7, 'hearts'), c(7, 'clubs'), c(7, 'diamonds')];
	assert.equal(v.describe(quad), 'Trail of 7s');
});

test('describe names the chosen lowest hand', () => {
	const pairs = [c(9, 'spades'), c(9, 'hearts'), c(4, 'clubs'), c(4, 'diamonds')];
	assert.equal(v.describe(pairs), 'Pair of 4s');
	const seq = [c(3, 'spades'), c(4, 'hearts'), c(5, 'clubs'), c(5, 'diamonds')];
	assert.equal(v.describe(seq), 'Pair of 5s');
});

test('rejects wrong card counts', () => {
	assert.throws(() => v.evaluateHand([c(2, 'spades'), c(3, 'hearts'), c(4, 'clubs')]));
});
