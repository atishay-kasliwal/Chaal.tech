import test from 'node:test';
import assert from 'node:assert/strict';
import { lowestJoker, evaluateHand, getWildRanks } from '../../server/variants/lowest-joker.mjs';

const card = (rank, suit) => ({ rank, suit });

test('every card of the lowest rank in each hand is wild', () => {
	const pairedLow = [card(2, 'hearts'), card(2, 'spades'), card(13, 'clubs')];
	assert.deepEqual([...getWildRanks(pairedLow)], [2]);
	assert.deepEqual(evaluateHand(pairedLow), [5, 13]);
	assert.equal(
		lowestJoker.compareHands(pairedLow, [card(3, 'hearts'), card(3, 'spades'), card(12, 'clubs')]),
		1
	);
});

test('wild rank is private-hand-derived and malformed card sets fail closed', () => {
	assert.deepEqual(
		evaluateHand([card(8, 'hearts'), card(9, 'clubs'), card(12, 'spades')]),
		[1, 12, 9]
	);
	assert.throws(() => evaluateHand([card(2, 'hearts'), card(2, 'hearts'), card(9, 'clubs')]));
});
