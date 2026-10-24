import { describeClassic, compareVectors } from './hand-utils.mjs';
import { playedCards } from './discard-one.mjs';

/**
 * Plain-language hand names for the table ("Pair of 9s", "999 scores 873").
 * Kept beside the variants (not inside them) so the frozen Classic and Muflis
 * modules stay byte-identical. The server decides winners; this only explains.
 */
export function describeHand(variant, cards, handState) {
	if (!variant || !Array.isArray(cards) || cards.some((card) => !card.rank)) return null;
	// Four-card games built on a three-card game: name the three that play, in that game's terms.
	if (variant.base && variant.played)
		return describeHand(variant.base, variant.played(cards), handState);
	try {
		// A game whose rank vector is not the Classic shape names its own hands.
		if (variant.describe) return variant.describe(cards, handState);
		switch (variant.rulesVersion) {
			case '999-1':
				return `Scores ${String(variant.evaluateHand(cards)[0]).padStart(3, '0')}`;
			case '2-card-1': {
				const [kind, top] = variant.evaluateHand(cards);
				return describeClassic([kind, top]);
			}
			case 'muflis-1':
				return describeClassic(variant.evaluateHand(cards).map((value) => -value));
			case 'discard-one-1':
			case 'discard-one-2':
				return describeClassic(variant.evaluateHand(playedCards(cards)));
			default: {
				const name = describeClassic(variant.evaluateHand(cards, handState));
				return wildIndexes(variant, cards, handState).length ? `${name} (with joker)` : name;
			}
		}
	} catch {
		return null;
	}
}

/** Which of these cards are jokers, for highlighting. Rank-based variants included. */
export function wildIndexes(variant, cards, handState) {
	if (!variant || cards.some((card) => !card.rank)) return [];
	if (variant.wildIndexes) return variant.wildIndexes(cards, handState);
	if (variant.base && variant.played)
		return wildIndexes(variant.base, variant.played(cards), handState);
	const ranks =
		variant.rulesVersion === 'ak47-1'
			? new Set([4, 7, 13, 14])
			: variant.rulesVersion === 'joker-1' && Number.isInteger(handState?.wildRank)
				? new Set([handState.wildRank])
				: variant.rulesVersion === 'lowest-joker-1' && cards.length
					? new Set([Math.min(...cards.map((card) => card.rank))])
					: null;
	return ranks ? cards.flatMap((card, index) => (ranks.has(card.rank) ? [index] : [])) : [];
}

/**
 * A seen hand that still has to throw cards away (four-card and Kiss-Miss-Bliss games): name the
 * best cards it could keep, and mark the jokers on those cards, as positions in the whole hand.
 * Without this the name and stars would come from the first three cards dealt, ignoring the rest.
 */
export function describeKeep(variant, cards, handState) {
	const keep = variant?.discardTo;
	if (!Number.isInteger(keep) || !Array.isArray(cards) || cards.length <= keep)
		return {
			handName: describeHand(variant, cards, handState),
			wildCards: wildIndexes(variant, cards, handState)
		};
	let best = null;
	const choose = (start, picked) => {
		if (picked.length === keep) {
			const subset = picked.map((i) => cards[i]);
			let score;
			try {
				score = variant.evaluateHand(subset, handState);
			} catch {
				return;
			}
			if (!best || compareVectors(score, best.score) > 0) best = { score, picked: [...picked] };
			return;
		}
		for (let i = start; i < cards.length; i++) choose(i + 1, [...picked, i]);
	};
	choose(0, []);
	if (!best) return { handName: null, wildCards: [] };
	const subset = best.picked.map((i) => cards[i]);
	const name = describeHand(variant, subset, handState);
	return {
		handName: name ? `Best three: ${name}` : null,
		wildCards: wildIndexes(variant, subset, handState).map((i) => best.picked[i])
	};
}
