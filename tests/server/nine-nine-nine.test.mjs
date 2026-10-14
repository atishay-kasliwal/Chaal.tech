import test from 'node:test';
import assert from 'node:assert/strict';
import { nineNineNine, evaluateHand } from '../../server/variants/nine-nine-nine.mjs';

const card = (rank, suit = 'hearts') => ({ rank, suit });

test('999 forms the largest three-digit number with Ace=1 and 10/J/Q/K=0', () => {
	assert.deepEqual(evaluateHand([card(14), card(13, 'spades'), card(9, 'clubs')]), [910]);
	assert.deepEqual(evaluateHand([card(9), card(9, 'spades'), card(9, 'clubs')]), [999]);
	assert.deepEqual(evaluateHand([card(10), card(11, 'spades'), card(12, 'clubs')]), [0]);
	assert.equal(
		nineNineNine.compareHands(
			[card(9), card(9, 'spades'), card(9, 'clubs')],
			[card(14), card(13, 'spades'), card(9, 'clubs')]
		),
		1
	);
});

test('999 ignores suits and validates three distinct physical cards', () => {
	assert.equal(
		nineNineNine.compareHands(
			[card(9), card(8, 'spades'), card(7, 'clubs')],
			[card(9, 'diamonds'), card(8, 'clubs'), card(7, 'hearts')]
		),
		0
	);
	assert.throws(() => evaluateHand([card(9), card(9), card(9, 'clubs')]));
});
