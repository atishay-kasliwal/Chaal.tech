import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestWildHand } from './hand-utils.mjs';

const rules = Object.freeze({
	description:
		'After the deal, reveal the next undealt card. Every dealt card of its rank is wild.',
	wildSource: 'next-undealt-card-rank',
	wildCards: 'All dealt cards matching the revealed rank are wild.',
	rankingOrder: Object.freeze(['trail', 'pure-sequence', 'sequence', 'flush', 'pair', 'high-card']),
	suitsBreakTies: false
});

export function evaluateHand(cards, handState) {
	if (!handState || !Number.isInteger(handState.wildRank))
		throw new Error('Joker requires the revealed wild rank');
	return bestWildHand(cards, new Set([handState.wildRank]), evaluateClassic);
}

export const joker = Object.freeze({
	id: 'joker',
	version: 1,
	rulesVersion: 'joker-1',
	name: 'Joker',
	description: 'A revealed card sets the wild rank for the hand.',
	evaluateHand,
	compareHands: (left, right, handState) =>
		compareVectors(evaluateHand(left, handState), evaluateHand(right, handState)),
	prepareHand: ({ remainingDeck }) => {
		if (!remainingDeck.length) throw new Error('No card remains for the Joker indicator');
		const indicator = remainingDeck[0];
		return { state: { wildRank: indicator.rank, indicator }, cardsConsumed: 1 };
	},
	getRules: () => rules
});

function compareVectors(left, right) {
	for (let i = 0; i < Math.min(left.length, right.length); i++) {
		if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
	}
	return Math.sign(left.length - right.length);
}
