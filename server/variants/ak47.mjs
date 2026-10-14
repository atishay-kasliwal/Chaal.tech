import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestWildHand } from './hand-utils.mjs';

const wildRanks = Object.freeze([4, 7, 13, 14]);
const rules = Object.freeze({
	wildRanks,
	wildCards: 'Every Ace, King, 4 and 7 is wild and may represent any card.',
	rankingOrder: Object.freeze(['trail', 'pure-sequence', 'sequence', 'flush', 'pair', 'high-card']),
	comparison:
		'Wild cards take the strongest valid Classic hand. Equal best Classic rank vectors tie; suits do not break ties.',
	suitsBreakTies: false
});

/** Evaluate the best Classic-ranked hand available by substituting each wild card. */
export function evaluateHand(cards) {
	return bestWildHand(cards, new Set(wildRanks), evaluateClassic);
}

export const ak47 = Object.freeze({
	id: 'ak47',
	version: 1,
	rulesVersion: 'ak47-1',
	name: 'AK47',
	description: 'Three-card Teen Patti where Aces, Kings, 4s and 7s are wild.',
	evaluateHand,
	compareHands: (left, right) => {
		const a = evaluateHand(left),
			b = evaluateHand(right);
		for (let index = 0; index < Math.max(a.length, b.length); index++) {
			if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
		}
		return 0;
	},
	getRules: () => rules
});
