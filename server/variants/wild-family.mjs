import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestWildHand, compareVectors, validateCards, isRed } from './hand-utils.mjs';

const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);

/**
 * Builds a three-card Classic-ranked variant whose jokers are chosen by `wildFor`:
 * (cards, handState) -> predicate(card) telling which of these cards are wild.
 */
export function wildVariant({ id, name, description, wildFor, rules, prepareHand, extra = {} }) {
	const evaluateHand = (cards, handState) => {
		validateCards(cards, 3);
		return bestWildHand(cards, wildFor(cards, handState), evaluateClassic);
	};
	return Object.freeze({
		id,
		version: 1,
		rulesVersion: `${id}-1`,
		name,
		description,
		evaluateHand,
		compareHands: (left, right, handState) =>
			compareVectors(evaluateHand(left, handState), evaluateHand(right, handState)),
		wildIndexes: (cards, handState) => {
			const wild = wildFor(cards, handState);
			return cards.flatMap((card, index) => (wild(card) ? [index] : []));
		},
		...(prepareHand ? { prepareHand } : {}),
		getRules: () => Object.freeze({ ...rules, rankingOrder: CLASSIC_ORDER, suitsBreakTies: false }),
		...extra
	});
}

export { isRed };
