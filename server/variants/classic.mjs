import { evaluateHand, compareHands } from '../classic.mjs';

const rules = Object.freeze({
	rankingOrder: Object.freeze(['trail', 'pure-sequence', 'sequence', 'flush', 'pair', 'high-card']),
	highestSequences: Object.freeze(['A-K-Q', 'A-2-3', 'K-Q-J']),
	suitsBreakTies: false
});

// Adapter only: Phase 1's evaluator/comparer remain the Classic reference implementation.
export const classic = Object.freeze({
	id: 'classic',
	version: 1,
	rulesVersion: 'classic-1',
	name: 'Classic',
	description: 'Classic three-card Teen Patti with the documented Phase 1 ranking rules.',
	evaluateHand,
	compareHands,
	getRules: () => rules
});
