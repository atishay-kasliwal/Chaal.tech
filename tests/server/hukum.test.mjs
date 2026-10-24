import test from 'node:test';
import assert from 'node:assert/strict';
import { hukum } from '../../server/variants/hukum.mjs';
import { describeHand } from '../../server/variants/describe.mjs';

const c = (rank, suit) => ({ rank, suit });
const state = { trump: 'hearts', indicator: c(5, 'hearts') };

test('prepareHand reveals the next card and its suit is trump', () => {
	const deck = [c(9, 'clubs'), c(2, 'spades')];
	const prepared = hukum.prepareHand({ remainingDeck: deck });
	assert.equal(prepared.cardsConsumed, 1);
	assert.deepEqual(prepared.state, { trump: 'clubs', indicator: c(9, 'clubs') });
	assert.throws(() => hukum.prepareHand({ remainingDeck: [] }));
});

test('pair with more trump beats a higher pair', () => {
	const low = [c(3, 'hearts'), c(3, 'spades'), c(7, 'hearts')];
	const high = [c(12, 'clubs'), c(12, 'spades'), c(7, 'diamonds')];
	assert.equal(hukum.compareHands(low, high, state), 1);
	assert.equal(hukum.compareHands(high, low, state), -1);
});

test('different categories ignore trump', () => {
	const trail = [c(2, 'clubs'), c(2, 'spades'), c(2, 'diamonds')];
	const trumpHigh = [c(14, 'hearts'), c(13, 'hearts'), c(9, 'spades')];
	const pair = [c(4, 'clubs'), c(4, 'spades'), c(9, 'diamonds')];
	assert.equal(hukum.compareHands(trail, trumpHigh, state), 1);
	assert.equal(hukum.compareHands(trumpHigh, pair, state), -1);
});

test('equal trump falls back to Classic ranks; identical strength ties', () => {
	const a = [c(9, 'hearts'), c(9, 'spades'), c(4, 'clubs')];
	const b = [c(8, 'hearts'), c(8, 'diamonds'), c(4, 'clubs')];
	assert.equal(hukum.compareHands(a, b, state), 1);
	const t1 = [c(9, 'clubs'), c(9, 'spades'), c(4, 'clubs')];
	const t2 = [c(9, 'diamonds'), c(9, 'spades'), c(4, 'spades')];
	assert.equal(hukum.compareHands(t1, t2, state), 0);
});

test('evaluateHand vector shape and wildIndexes', () => {
	const hand = [c(9, 'hearts'), c(9, 'spades'), c(4, 'hearts')];
	const vector = hukum.evaluateHand(hand, state);
	assert.deepEqual(vector.slice(0, 2), [1, 2]);
	assert.deepEqual(hukum.wildIndexes(hand, state), []);
	assert.throws(() => hukum.evaluateHand(hand, {}));
});

test('describe names the Classic hand with a trump suffix', () => {
	assert.equal(
		hukum.describe([c(9, 'hearts'), c(9, 'spades'), c(4, 'hearts')], state),
		'Pair of 9s · 2 trump'
	);
	assert.equal(
		hukum.describe([c(9, 'clubs'), c(7, 'spades'), c(4, 'clubs')], state),
		'High card 9'
	);
	assert.equal(
		describeHand(hukum, [c(9, 'clubs'), c(7, 'spades'), c(4, 'clubs')], state),
		'High card 9'
	);
});

test('getRules states the trump rule', () => {
	const rules = hukum.getRules();
	assert.equal(rules.suitsBreakTies, false);
	assert.equal(rules.rankingOrder[0], 'trail');
	assert.match(rules.trumpRule, /more trump/);
	assert.doesNotMatch(JSON.stringify(rules), /—/);
	assert.equal(hukum.rulesVersion, 'hukum-1');
});
