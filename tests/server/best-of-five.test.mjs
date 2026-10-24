import test from 'node:test';
import assert from 'node:assert/strict';
import { bestOfFive } from '../../server/variants/best-of-five.mjs';
import { describeKeep } from '../../server/variants/describe.mjs';
import { evaluateHand as classic } from '../../server/classic.mjs';

const c = (rank, suit) => ({ rank, suit });
const H = 'hearts';
const S = 'spades';
const D = 'diamonds';
const C = 'clubs';

test('plays the first three cards of a five-card hand', () => {
	const hand = [c(2, H), c(7, S), c(9, D), c(14, C), c(14, H)];
	assert.deepEqual(bestOfFive.evaluateHand(hand), classic(hand.slice(0, 3)));
	assert.deepEqual(bestOfFive.evaluateHand(hand.slice(0, 3)), classic(hand.slice(0, 3)));
	assert.deepEqual(bestOfFive.evaluateHand(hand.slice(0, 4)), classic(hand.slice(0, 3)));
});

test('compareHands uses Classic ranking on the played three', () => {
	const trail = [c(5, H), c(5, S), c(5, D), c(2, C), c(3, C)];
	const pair = [c(14, H), c(14, S), c(2, D), c(9, C), c(9, H)];
	assert.equal(bestOfFive.compareHands(trail, pair), 1);
	assert.equal(bestOfFive.compareHands(pair, trail), -1);
	assert.equal(bestOfFive.compareHands(trail, trail), 0);
});

test('rejects too few, too many and duplicate cards', () => {
	assert.throws(() => bestOfFive.evaluateHand([c(2, H), c(3, H)]));
	assert.throws(() =>
		bestOfFive.evaluateHand([c(2, H), c(3, H), c(4, H), c(5, H), c(6, H), c(7, H)])
	);
	assert.throws(() => bestOfFive.evaluateHand([c(2, H), c(2, H), c(4, H)]));
});

test('getRules shape', () => {
	const rules = bestOfFive.getRules();
	assert.equal(bestOfFive.cardsPerPlayer, 5);
	assert.equal(bestOfFive.discardTo, 3);
	assert.equal(bestOfFive.rulesVersion, 'best-of-five-1');
	assert.equal(rules.cardsPerPlayer, 5);
	assert.equal(rules.keep, 3);
	assert.equal(rules.suitsBreakTies, false);
	assert.deepEqual(rules.rankingOrder.slice(0, 2), ['trail', 'pure-sequence']);
	assert.ok(!/—/.test(JSON.stringify(rules) + bestOfFive.description));
});

test('describeKeep picks the best three of five', () => {
	const hand = [c(2, H), c(7, S), c(9, D), c(10, H), c(10, C)];
	const keep = describeKeep(bestOfFive, hand);
	assert.match(keep.handName, /Pair of 10s/);
	assert.deepEqual(keep.wildCards, []);
});
