import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestThreeOfFour, compareVectors, describeClassic } from './hand-utils.mjs';

const negate = (vector) => vector.map((value) => (value === 0 ? 0 : -value));
const muflisThree = (cards) => negate(evaluateClassic(cards));

const rules = Object.freeze({
	cardsPerPlayer: 4,
	bestCards: 3,
	rankingOrder: Object.freeze(['high-card', 'pair', 'flush', 'sequence', 'pure-sequence', 'trail']),
	suitsBreakTies: false,
	discards: false,
	comparison:
		'Each hand is automatically its lowest three-card Classic hand out of the four cards. The lowest such hand wins; equal hands stay equal.'
});

/** Larger vector means stronger, so the lowest Classic subset scores highest. */
export function evaluateHand(cards) {
	return bestThreeOfFour(cards, muflisThree);
}

export const worstOfFour = Object.freeze({
	id: 'worst-of-four',
	version: 1,
	rulesVersion: 'worst-of-four-1',
	name: 'Worst of Four',
	description:
		'Four cards, no discards. Your lowest three-card Classic hand counts, and the lowest hand wins.',
	cardsPerPlayer: 4,
	evaluateHand,
	compareHands: (left, right) => compareVectors(evaluateHand(left), evaluateHand(right)),
	describe: (cards) => describeClassic(negate(evaluateHand(cards))),
	getRules: () => rules
});
