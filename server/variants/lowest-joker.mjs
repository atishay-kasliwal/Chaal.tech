import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestWildHand, validateCards } from './hand-utils.mjs';

const rules = Object.freeze({
	description: "Each player's lowest rank becomes wild; if tied, every card of that rank is wild.",
	wildSource: 'lowest-rank-in-player-hand',
	wildCards: 'All cards of the lowest rank in each hand are wild.',
	rankingOrder: Object.freeze(['trail', 'pure-sequence', 'sequence', 'flush', 'pair', 'high-card']),
	suitsBreakTies: false
});

export function getWildRanks(cards) {
	validateCards(cards, 3);
	const lowest = Math.min(...cards.map(({ rank }) => rank));
	return new Set(cards.filter((card) => card.rank === lowest).map(({ rank }) => rank));
}

export function evaluateHand(cards) {
	return bestWildHand(cards, getWildRanks(cards), evaluateClassic);
}

function compareVectors(left, right) {
	for (let i = 0; i < Math.min(left.length, right.length); i++) {
		if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
	}
	return Math.sign(left.length - right.length);
}

export const lowestJoker = Object.freeze({
	id: 'lowest-joker',
	version: 1,
	rulesVersion: 'lowest-joker-1',
	name: 'Lowest Joker',
	description: "Each player's lowest rank is wild for that player's hand.",
	evaluateHand,
	compareHands: (left, right) => compareVectors(evaluateHand(left), evaluateHand(right)),
	getRules: () => rules
});
