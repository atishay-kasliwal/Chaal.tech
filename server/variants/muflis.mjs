import { evaluateHand, compareHands } from '../classic.mjs';

const rules = Object.freeze({
	rankingOrder: Object.freeze(['high-card', 'pair', 'flush', 'sequence', 'pure-sequence', 'trail']),
	lowestSequences: Object.freeze(['4-3-2', '5-4-3', '6-5-4']),
	suitsBreakTies: false,
	comparison:
		'Exact reverse of Classic, including category, ranks and kickers; equal hands stay equal.'
});

export const muflis = Object.freeze({
	id: 'muflis',
	version: 1,
	rulesVersion: 'muflis-1',
	name: 'Muflis',
	description:
		'Lowest Classic hand wins. Aces keep their Classic value; sequences and flushes count.',
	// Preserve the rank-vector convention: larger vectors always mean stronger hands.
	evaluateHand: (cards) => evaluateHand(cards).map((value) => (value === 0 ? 0 : -value)),
	compareHands: (left, right) => compareHands(right, left),
	getRules: () => rules
});
