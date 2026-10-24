import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { compareVectors, describeClassic, isRed, validateCards } from './hand-utils.mjs';

// Classic categories keep their numbers; the Colour hand slots in between Flush (2) and Pair (1).
const COLOUR_HAND = 1.5;

const rules = Object.freeze({
	rankingOrder: Object.freeze([
		'high-card',
		'pair',
		'colour-hand',
		'flush',
		'sequence',
		'pure-sequence',
		'trail'
	]),
	colourHand:
		'All three cards red (hearts, diamonds) or all black (spades, clubs), but not all one suit and not a sequence.',
	upgradeRule:
		'Only a hand that would be a high card becomes a Colour hand. A pair stays a pair even when all three cards share a colour, and a same-colour sequence stays a sequence.',
	suitsBreakTies: false,
	comparison:
		'Classic order, with the Colour hand between Flush and Pair. Colour hands compare by their ranks from high to low; red and black tie on equal ranks.'
});

function evaluateHand(cards) {
	validateCards(cards, 3);
	const vector = evaluateClassic(cards);
	if (vector[0] === 0) {
		const red = isRed(cards[0]);
		if (cards.every((card) => isRed(card) === red)) return [COLOUR_HAND, ...vector.slice(1)];
	}
	return vector;
}

const rankName = (rank) => ({ 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack' })[rank] ?? String(rank);

export const redBlack = Object.freeze({
	id: 'red-black',
	version: 1,
	rulesVersion: 'red-black-1',
	name: 'Red & Black',
	description:
		'Classic plus a new hand: three cards all red or all black rank above a Pair but below a Colour (flush).',
	evaluateHand,
	compareHands: (left, right) => compareVectors(evaluateHand(left), evaluateHand(right)),
	wildIndexes: () => [],
	describe: (cards) => {
		const vector = evaluateHand(cards);
		if (vector[0] === COLOUR_HAND)
			return `All ${isRed(cards[0]) ? 'red' : 'black'}, ${rankName(vector[1])} high`;
		return describeClassic(vector);
	},
	getRules: () => rules
});
