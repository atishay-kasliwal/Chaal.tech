import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { compareVectors, validateCards } from './hand-utils.mjs';

/**
 * Community Teen Patti: two cards each plus shared cards in the middle. One of the three
 * community cards is open from the deal, the second turns up when the pot reaches ₹100 and the
 * third at ₹200. A hand is the best three cards from your two and the community cards open now.
 */
export const COMMUNITY_THRESHOLDS = Object.freeze([100, 200]);
const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);
const copy = (card) => ({ rank: card.rank, suit: card.suit });
const hidden = () => ({ rank: 0, suit: '' });

/** The best Classic hand among every three of these cards. */
function bestThree(cards) {
	let best = null;
	for (let i = 0; i < cards.length; i++)
		for (let j = i + 1; j < cards.length; j++)
			for (let k = j + 1; k < cards.length; k++) {
				const score = evaluateClassic([cards[i], cards[j], cards[k]]);
				if (!best || compareVectors(score, best) > 0) best = score;
			}
	return best;
}
const openCommunity = (state) => (state?.community ?? []).slice(0, state?.opened ?? 0);
const evaluate = (cards, state) => {
	validateCards(cards, 2);
	const all = [...cards, ...openCommunity(state)];
	validateCards(all, all.length);
	return bestThree(all);
};

export const community = Object.freeze({
	id: 'community',
	version: 1,
	rulesVersion: 'community-1',
	name: 'Community Teen Patti',
	description:
		'Two cards each plus shared cards in the middle. Your hand is the best three of your two and the open shared cards.',
	cardsPerPlayer: 2,
	evaluateHand: evaluate,
	compareHands: (left, right, state) =>
		compareVectors(evaluate(left, state), evaluate(right, state)),
	prepareHand: ({ remainingDeck }) => {
		if (remainingDeck.length < 3) throw new Error('Not enough cards for the community');
		return {
			state: { community: remainingDeck.slice(0, 3).map(copy), opened: 1 },
			cardsConsumed: 3
		};
	},
	afterPot: (state, pot) => {
		const reached = 1 + COMMUNITY_THRESHOLDS.filter((amount) => pot >= amount).length;
		if (reached > state.opened) state.opened = reached;
	},
	publicState: (state) => ({
		community: state.community.map((card, i) => (i < state.opened ? copy(card) : hidden())),
		opened: state.opened,
		thresholds: [...COMMUNITY_THRESHOLDS]
	}),
	wildIndexes: () => [],
	getRules: () =>
		Object.freeze({
			cardsPerPlayer: 2,
			rankingOrder: CLASSIC_ORDER,
			suitsBreakTies: false,
			community: `Three community cards lie in the middle: one open from the deal, the next at ₹${COMMUNITY_THRESHOLDS[0]} of pot and the last at ₹${COMMUNITY_THRESHOLDS[1]}. Your hand is the best three cards among your two and the open community cards.`
		})
});
