import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { compareVectors, describeClassic, validateCards } from './hand-utils.mjs';

const SUITS = ['hearts', 'spades', 'diamonds', 'clubs'];

function trumpOf(handState) {
	if (!SUITS.includes(handState?.trump)) throw new Error('Hukum requires the revealed trump suit');
	return handState.trump;
}

const trumpCount = (cards, trump) => cards.filter((card) => card.suit === trump).length;

/** [category, trumpCount, ...rest of the Classic vector] */
function evaluateHand(cards, handState) {
	validateCards(cards, 3);
	const trump = trumpOf(handState);
	const [category, ...ranks] = evaluateClassic(cards);
	return [category, trumpCount(cards, trump), ...ranks];
}

const rules = Object.freeze({
	rankingOrder: Object.freeze(['trail', 'pure-sequence', 'sequence', 'flush', 'pair', 'high-card']),
	trumpSource: 'suit-of-next-undealt-card',
	trumpRule:
		'An open card names the trump suit (hukum) for the hand. Hands are ranked by the Classic categories first. Between two hands of the same category, the hand holding more trump cards wins. If the trump count is equal, the normal Classic ranks decide.',
	suitsBreakTies: false
});

export const hukum = Object.freeze({
	id: 'hukum',
	version: 1,
	rulesVersion: 'hukum-1',
	name: 'Hukum',
	description:
		'An open card names the trump suit. Within the same hand type, more trump cards beat higher ranks.',
	evaluateHand,
	compareHands: (left, right, handState) =>
		compareVectors(evaluateHand(left, handState), evaluateHand(right, handState)),
	wildIndexes: () => [],
	describe: (cards, handState) => {
		const [category, trump, ...ranks] = evaluateHand(cards, handState);
		const name = describeClassic([category, ...ranks]);
		return trump > 0 ? `${name} · ${trump} trump` : name;
	},
	prepareHand: ({ remainingDeck }) => {
		if (!remainingDeck.length) throw new Error('No card remains for the Hukum indicator');
		const indicator = remainingDeck[0];
		return { state: { trump: indicator.suit, indicator }, cardsConsumed: 1 };
	},
	getRules: () => rules
});
