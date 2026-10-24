import test from 'node:test';
import assert from 'node:assert/strict';
import { progressiveJoker as pj, PROGRESSIVE_JOKER_THRESHOLDS } from '../../server/variants/progressive-joker.mjs';

const c = (rank, suit) => ({ rank, suit });
const at = (indicator, stage) => ({ indicator, stage });
const deck = [c(7, 'hearts'), c(2, 'spades'), c(3, 'clubs')];

test('identity and rules shape', () => {
	assert.equal(pj.id, 'progressive-joker');
	assert.equal(pj.rulesVersion, 'progressive-joker-1');
	assert.equal(pj.name, 'Progressive Joker');
	const rules = pj.getRules();
	assert.deepEqual(rules.thresholds, [100, 200, 400]);
	assert.equal(rules.suitsBreakTies, false);
	assert.deepEqual(rules.rankingOrder[0], 'trail');
	assert.ok(!/—/.test(pj.description + rules.wildCards));
});

test('prepareHand takes one indicator card at stage 0', () => {
	const { state, cardsConsumed } = pj.prepareHand({ remainingDeck: deck });
	assert.equal(cardsConsumed, 1);
	assert.deepEqual(state, { indicator: c(7, 'hearts'), stage: 0 });
	assert.notEqual(state.indicator, deck[0]);
	assert.throws(() => pj.prepareHand({ remainingDeck: [] }));
});

test('afterPot stages by threshold and never decreases', () => {
	const { state } = pj.prepareHand({ remainingDeck: deck });
	const seen = [];
	for (const pot of [0, 99, 100, 150, 200, 399, 400, 1000, 50, 0]) {
		pj.afterPot(state, pot);
		seen.push(state.stage);
	}
	assert.deepEqual(seen, [0, 0, 1, 1, 2, 2, 3, 3, 3, 3]);
	assert.deepEqual(PROGRESSIVE_JOKER_THRESHOLDS, [100, 200, 400]);
});

test('wild ranks per stage', () => {
	const hand = [c(7, 'spades'), c(8, 'spades'), c(6, 'clubs')];
	const ind = c(7, 'hearts');
	assert.deepEqual(pj.wildIndexes(hand, at(ind, 0)), []);
	assert.deepEqual(pj.wildIndexes(hand, at(ind, 1)), [0]);
	assert.deepEqual(pj.wildIndexes(hand, at(ind, 2)), [0, 1, 2]);
});

test('wrap-around at stage 2', () => {
	assert.deepEqual(pj.publicState(at(c(14, 'clubs'), 2)).wildRanks.sort((a, b) => a - b), [2, 13, 14]);
	assert.deepEqual(pj.publicState(at(c(2, 'clubs'), 2)).wildRanks.sort((a, b) => a - b), [2, 3, 14]);
});

test('suit wild at stage 3 only', () => {
	const hand = [c(9, 'hearts'), c(4, 'hearts'), c(12, 'clubs')];
	const ind = c(7, 'hearts');
	assert.deepEqual(pj.wildIndexes(hand, at(ind, 2)), []);
	assert.deepEqual(pj.wildIndexes(hand, at(ind, 3)), [0, 1]);
	assert.equal(pj.publicState(at(ind, 3)).wildSuit, 'hearts');
	assert.equal(pj.publicState(at(ind, 2)).wildSuit, null);
});

test('evaluate and compare follow the stage', () => {
	const ind = c(7, 'hearts');
	const a = [c(7, 'spades'), c(7, 'clubs'), c(14, "diamonds")]; // pair of sevens naturally
	const b = [c(13, 'spades'), c(13, 'clubs'), c(13, 'diamonds')]; // natural trail of kings
	assert.equal(pj.evaluateHand(b, at(ind, 0))[0], 5);
	assert.equal(pj.compareHands(a, b, at(ind, 0)), -1);
	// Stage 1: both sevens are wild, so a becomes a trail of aces.
	assert.deepEqual(pj.evaluateHand(a, at(ind, 1)), [5, 14]);
	assert.equal(pj.compareHands(a, b, at(ind, 1)), 1);
	assert.equal(pj.compareHands(a, a, at(ind, 1)), 0);
	// Suit wild: three hearts become a trail of aces.
	const h = [c(2, 'hearts'), c(3, 'hearts'), c(5, 'hearts')];
	assert.deepEqual(pj.evaluateHand(h, at(c(9, 'hearts'), 3)), [5, 14]);
	assert.throws(() => pj.evaluateHand(h.slice(0, 2), at(ind, 1)));
});

test('publicState hides the indicator until stage 1', () => {
	const state = at(c(7, 'hearts'), 0);
	const hiddenView = pj.publicState(state);
	assert.deepEqual(hiddenView.indicator, { rank: 0, suit: '' });
	assert.equal(hiddenView.stage, 0);
	assert.deepEqual(hiddenView.thresholds, [100, 200, 400]);
	assert.deepEqual(hiddenView.wildRanks, []);
	assert.equal(hiddenView.wildSuit, null);
	state.stage = 1;
	const open = pj.publicState(state);
	assert.deepEqual(open.indicator, c(7, 'hearts'));
	assert.deepEqual(open.wildRanks, [7]);
	open.indicator.rank = 2;
	assert.equal(state.indicator.rank, 7);
});
