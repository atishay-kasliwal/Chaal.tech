import { validateCards } from './hand-utils.mjs';

const rules = Object.freeze({
	cardsPerPlayer: 2,
	rankingOrder: Object.freeze(['pair', 'high-card']),
	comparison: 'A pair beats every high-card hand; compare pair rank or high cards high to low.',
	suitsBreakTies: false
});

export function evaluateHand(cards) {
	validateCards(cards, 2);
	const ranks = cards.map(({ rank }) => rank).sort((a, b) => b - a);
	return ranks[0] === ranks[1] ? [1, ranks[0]] : [0, ...ranks];
}

export const twoCard = Object.freeze({
	id: 'two-card',
	version: 1,
	rulesVersion: '2-card-1',
	name: '2 Card',
	description: 'Two cards per player: pairs beat high card.',
	cardsPerPlayer: 2,
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
