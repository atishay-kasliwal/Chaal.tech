import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestWildHand, compareVectors, validateCards } from './hand-utils.mjs';

/**
 * Progressive Joker: Classic ranking, three cards each, and one face-down indicator card.
 * As the pot grows the indicator is revealed and the jokers widen:
 * stage 1: the indicator's rank; stage 2: also the ranks above and below it (Aces wrap);
 * stage 3: also every card of the indicator's suit. Stages only go up.
 *
 * Hand state for evaluate, compare and wildIndexes is the variant state itself.
 */

/** Pot amounts that start stage 1, 2 and 3. */
export const PROGRESSIVE_JOKER_THRESHOLDS = Object.freeze([100, 200, 400]);

const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);
const HIDDEN = Object.freeze({ rank: 0, suit: '' });
const hidden = () => ({ ...HIDDEN });
const copy = (card) => ({ rank: card.rank, suit: card.suit });
const below = (rank) => (rank === 2 ? 14 : rank - 1);
const above = (rank) => (rank === 14 ? 2 : rank + 1);

function wildRanks(state) {
	const rank = state?.indicator?.rank;
	if (!(state?.stage >= 1) || !rank) return [];
	return state.stage >= 2 ? [rank, below(rank), above(rank)] : [rank];
}
const wildSuit = (state) =>
	state?.stage >= 3 && state.indicator?.suit ? state.indicator.suit : null;

/** Card-specific joker test for the current stage. */
function wildTest(state) {
	const ranks = new Set(wildRanks(state));
	const suit = wildSuit(state);
	return (card) => ranks.has(card.rank) || (!!suit && card.suit === suit);
}

function evaluate(cards, state) {
	validateCards(cards, 3);
	const isWild = wildTest(state);
	return cards.some(isWild) ? bestWildHand(cards, isWild, evaluateClassic) : evaluateClassic(cards);
}

export const progressiveJoker = Object.freeze({
	id: 'progressive-joker',
	version: 1,
	rulesVersion: 'progressive-joker-1',
	name: 'Progressive Joker',
	description:
		'A hidden indicator card turns over as the pot reaches ₹100: its rank is wild. At ₹200 the ranks ' +
		'either side join, and at ₹400 every card of its suit does.',
	evaluateHand: evaluate,
	compareHands: (left, right, state) =>
		compareVectors(evaluate(left, state), evaluate(right, state)),
	prepareHand: ({ remainingDeck }) => {
		if (remainingDeck.length < 1) throw new Error('Not enough cards for the indicator');
		return { state: { indicator: copy(remainingDeck[0]), stage: 0 }, cardsConsumed: 1 };
	},
	wildIndexes: (cards, state) => {
		const isWild = wildTest(state);
		return cards.flatMap((card, index) => (index < 3 && isWild(card) ? [index] : []));
	},
	publicState: (state) => ({
		indicator: state.stage >= 1 ? copy(state.indicator) : hidden(),
		stage: state.stage,
		thresholds: [...PROGRESSIVE_JOKER_THRESHOLDS],
		wildRanks: wildRanks(state),
		wildSuit: wildSuit(state)
	}),
	afterPot: (state, pot) => {
		const reached = PROGRESSIVE_JOKER_THRESHOLDS.filter((amount) => pot >= amount).length;
		state.stage = Math.max(state.stage, reached);
	},
	getRules: () =>
		Object.freeze({
			indicatorCards: 1,
			thresholds: PROGRESSIVE_JOKER_THRESHOLDS,
			wildCards:
				'At ₹100 the indicator’s rank is wild. At ₹200 the ranks above and below it join (Aces wrap). ' +
				'At ₹400 every card of the indicator’s suit is wild too.',
			rankingOrder: CLASSIC_ORDER,
			suitsBreakTies: false
		})
});
