import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestWildHand, compareVectors, validateCards } from './hand-utils.mjs';
import { muflis } from './muflis.mjs';
import { joker } from './joker.mjs';
import { lowestJoker } from './lowest-joker.mjs';
import { highestJoker } from './highest-joker.mjs';
import { colorJoker } from './color-joker.mjs';

const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);

/** Three cards play: the first three in hand. A blind player who never discards plays these too. */
const played = (cards) => {
	if (!Array.isArray(cards) || (cards.length !== 3 && cards.length !== 4))
		throw new Error('Four-card hands hold three or four cards');
	validateCards(cards, cards.length);
	return cards.slice(0, 3);
};

/**
 * "Deal four, throw one, play three" built on an existing three-card game. More chances to
 * make a hand than Classic, with the base game's own ranking and jokers.
 */
function fourCardOf(base, { id, name, description }) {
	const evaluateHand = (cards, handState) => base.evaluateHand(played(cards), handState);
	return Object.freeze({
		id,
		version: 1,
		rulesVersion: `${id}-1`,
		name,
		description,
		cardsPerPlayer: 4,
		discardTo: 3,
		base,
		played,
		evaluateHand,
		compareHands: (left, right, handState) =>
			base.compareHands(played(left), played(right), handState),
		...(base.prepareHand ? { prepareHand: base.prepareHand } : {}),
		...(base.wildIndexes
			? { wildIndexes: (cards, handState) => base.wildIndexes(played(cards), handState) }
			: {}),
		getRules: () =>
			Object.freeze({
				...base.getRules(),
				cardsPerPlayer: 4,
				keep: 3,
				blindPlayers: 'A player who never looks plays their first three cards.'
			})
	});
}

export const muflisFour = fourCardOf(muflis, {
	id: 'muflis-4',
	name: 'Muflis 4',
	description: 'Get four, throw one. The lowest three-card hand wins.'
});

export const jokerFour = fourCardOf(joker, {
	id: 'joker-4',
	name: 'Joker 4',
	description: 'Get four, throw one. A revealed card sets the wild rank for everyone.'
});

export const lowestJokerFour = fourCardOf(lowestJoker, {
	id: 'lowest-joker-4',
	name: 'Lowest Joker 4',
	description: 'Get four, throw one. The lowest rank in the three you keep is wild.'
});

export const highestJokerFour = fourCardOf(highestJoker, {
	id: 'highest-joker-4',
	name: 'Highest Joker 4',
	description: 'Get four, throw one. The highest rank in the three you keep is wild.'
});

export const colorJokerFour = fourCardOf(colorJoker, {
	id: 'color-joker-4',
	name: 'Color Joker 4',
	description: 'Get four, throw one. An open card picks red or black; that colour is wild.'
});

/**
 * Folding Joker: deal four, fold one face down. The folded card is your joker: cards of its
 * rank in the three you keep are wild. The folded card stays last in hand (`foldsToEnd`), so
 * a blind player who never folds plays their first three with the fourth as the joker.
 */
const foldingRules = Object.freeze({
	cardsPerPlayer: 4,
	keep: 3,
	wildSource: 'rank-of-your-folded-card',
	wildCards: 'Cards in your hand matching the rank of the card you folded are wild.',
	blindPlayers: 'A player who never looks plays their first three; the fourth is their joker.',
	rankingOrder: CLASSIC_ORDER,
	suitsBreakTies: false
});
const foldedRank = (cards) => (cards.length === 4 ? cards[3].rank : null);
const foldingEvaluate = (cards) => {
	const keep = played(cards);
	const rank = foldedRank(cards);
	return rank === null
		? evaluateClassic(keep)
		: bestWildHand(keep, new Set([rank]), evaluateClassic);
};
export const foldingJoker = Object.freeze({
	id: 'folding-joker',
	version: 1,
	rulesVersion: 'folding-joker-1',
	name: 'Folding Joker',
	description:
		'Get four, fold one. The card you fold is your joker: its rank is wild in your hand.',
	cardsPerPlayer: 4,
	discardTo: 3,
	foldsToEnd: true,
	played,
	evaluateHand: foldingEvaluate,
	compareHands: (left, right) => compareVectors(foldingEvaluate(left), foldingEvaluate(right)),
	wildIndexes: (cards) => {
		const rank = foldedRank(cards);
		return rank === null ? [] : played(cards).flatMap((card, i) => (card.rank === rank ? [i] : []));
	},
	getRules: () => foldingRules
});

export const FOUR_CARD_VARIANTS = Object.freeze([
	foldingJoker,
	muflisFour,
	jokerFour,
	lowestJokerFour,
	highestJokerFour,
	colorJokerFour
]);
