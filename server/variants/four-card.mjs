import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestThreeOfFour } from './hand-utils.mjs';

const rules = Object.freeze({
	cardsPerPlayer: 4,
	bestCards: 3,
	rankingOrder: Object.freeze(['trail', 'pure-sequence', 'sequence', 'flush', 'pair', 'high-card']),
	comparison: 'Evaluate all four three-card subsets and use the strongest Classic hand.',
	suitsBreakTies: false
});

export function evaluateHand(cards) {
	return bestThreeOfFour(cards, evaluateClassic);
}

export const fourCard = Object.freeze({
	id: 'four-card',
	version: 1,
	rulesVersion: '4-card-1',
	name: '4 Card',
	description: 'Deal four cards and use the best three-card Teen Patti hand.',
	cardsPerPlayer: 4,
	evaluateHand,
	compareHands: (left, right) => compareVectors(evaluateHand(left), evaluateHand(right)),
	getRules: () => rules
});

function compareVectors(left, right) {
	for (let i = 0; i < Math.min(left.length, right.length); i++) {
		if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
	}
	return Math.sign(left.length - right.length);
}
