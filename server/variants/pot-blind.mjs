import { evaluateHand, compareHands } from '../classic.mjs';

/** Nobody may look: every player bets blind until the Show reveals the hands. */
export const potBlind = Object.freeze({
	id: 'pot-blind',
	version: 1,
	rulesVersion: 'pot-blind-1',
	name: 'Pot Blind',
	description: 'Nobody sees their cards. Everyone bets blind until the Show.',
	allowSee: false,
	evaluateHand,
	compareHands,
	getRules: () =>
		Object.freeze({
			seeing: 'disabled',
			rankingOrder: Object.freeze([
				'trail',
				'pure-sequence',
				'sequence',
				'flush',
				'pair',
				'high-card'
			]),
			suitsBreakTies: false
		})
});
