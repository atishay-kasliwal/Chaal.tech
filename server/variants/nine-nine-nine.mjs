import { validateCards } from './hand-utils.mjs';

const rules = Object.freeze({
	cardValues: Object.freeze({
		ace: 1,
		twoToNine: 'face value',
		ten: 0,
		jack: 0,
		queen: 0,
		king: 0
	}),
	target: 999,
	comparison: 'Sort the three digits high to low; the largest resulting three-digit number wins.',
	suitsBreakTies: false
});

export function evaluateHand(cards) {
	validateCards(cards, 3);
	const digits = cards.map(({ rank }) => (rank === 14 ? 1 : rank >= 10 ? 0 : rank));
	digits.sort((a, b) => b - a);
	return [digits[0] * 100 + digits[1] * 10 + digits[2]];
}

export const nineNineNine = Object.freeze({
	id: '999',
	version: 1,
	rulesVersion: '999-1',
	name: '999',
	description: 'Arrange three card values into the largest number, aiming for 999.',
	evaluateHand,
	compareHands: (left, right) => Math.sign(evaluateHand(left)[0] - evaluateHand(right)[0]),
	getRules: () => rules
});
