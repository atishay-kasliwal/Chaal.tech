import { discardOne } from './discard-one.mjs';
import { bestOfFive } from './best-of-five.mjs';
import {
	muflisFour,
	jokerFour,
	lowestJokerFour,
	highestJokerFour,
	colorJokerFour,
	sharedFoldingJoker
} from './four-discard.mjs';

/**
 * Throw games where a thrown card lands face up on the table for everyone, with who threw it.
 * Each wraps the game it replaces and changes nothing else; the replaced version stays
 * registered, unchanged, for saved hands, lineups and the replay corpus.
 *
 * Public state gains `throws: [{ playerId, card }]`, in the order the cards were thrown.
 */
function withPublicThrows(base, { description, ...extra } = {}) {
	const version = base.version + 1;
	return Object.freeze({
		...base,
		version,
		rulesVersion: `${base.id}-${version}`,
		...(description ? { description } : {}),
		prepareHand: (args) => {
			const prepared = base.prepareHand?.(args) ?? { state: {}, cardsConsumed: 0 };
			return { ...prepared, state: { ...prepared.state, throws: [] } };
		},
		onDiscard: (state, move) => {
			base.onDiscard?.(state, move);
			state.throws.push({
				playerId: move.playerId,
				card: { rank: move.card.rank, suit: move.card.suit }
			});
		},
		...(base.publicState
			? {
					publicState: (state, viewerId, revealed) => ({
						...base.publicState(state, viewerId, revealed),
						throws: structuredClone(state.throws)
					})
				}
			: {}),
		getRules: () =>
			Object.freeze({ ...base.getRules(), thrownCards: 'Face up on the table for everyone.' }),
		...extra
	});
}

export const discardOne2 = withPublicThrows(discardOne);
export const bestOfFive2 = withPublicThrows(bestOfFive);
export const muflisFour2 = withPublicThrows(muflisFour);
export const jokerFour2 = withPublicThrows(jokerFour);
export const lowestJokerFour2 = withPublicThrows(lowestJokerFour);
export const highestJokerFour2 = withPublicThrows(highestJokerFour);
export const colorJokerFour2 = withPublicThrows(colorJokerFour);
/**
 * Folding Joker 3: the folded card lies face up on the table, and nobody packs without adding a
 * joker. A seen player folds before packing; a blind player's (or a timed-out player's) fourth
 * card is folded for them.
 */
export const foldingJoker3 = withPublicThrows(sharedFoldingJoker, {
	description:
		'Get four, fold one face up on the table. Every folded rank is a joker for everyone, and you fold before you pack.',
	foldBeforePack: true
});

/** The versions on offer, in the order the old ones were listed. */
export const PUBLIC_THROW_GAMES = Object.freeze({
	discardOne: discardOne2,
	bestOfFive: bestOfFive2,
	fourCard: Object.freeze([
		foldingJoker3,
		muflisFour2,
		jokerFour2,
		lowestJokerFour2,
		highestJokerFour2,
		colorJokerFour2
	])
});
/** The versions they replace, kept readable for saved hands. */
export const PRIVATE_THROW_GAMES = Object.freeze([
	discardOne,
	bestOfFive,
	sharedFoldingJoker,
	muflisFour,
	jokerFour,
	lowestJokerFour,
	highestJokerFour,
	colorJokerFour
]);
