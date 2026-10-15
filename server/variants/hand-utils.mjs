import { freshDeck, evaluateHand as evaluateClassic } from '../classic.mjs';

export function validateCards(cards, count) {
	if (!Array.isArray(cards) || cards.length !== count)
		throw new Error(`Expected exactly ${count} cards`);
	if (
		cards.some(
			(card) =>
				!Number.isInteger(card.rank) ||
				card.rank < 2 ||
				card.rank > 14 ||
				!['hearts', 'spades', 'diamonds', 'clubs'].includes(card.suit)
		)
	)
		throw new Error('Invalid card');
	if (new Set(cards.map(cardKey)).size !== cards.length) throw new Error('Duplicate card');
}

export const cardKey = ({ rank, suit }) => `${rank}:${suit}`;

export function compareVectors(left, right) {
	const count = Math.min(left.length, right.length);
	for (let i = 0; i < count; i++) {
		if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
	}
	return Math.sign(left.length - right.length);
}

/**
 * Replace wild cards with distinct physical cards and return the best score.
 * `wild` is a Set of wild ranks or a predicate for card-specific jokers.
 */
export function bestWildHand(cards, wild, evaluateNatural, cardCount = 3) {
	validateCards(cards, cardCount);
	const isWild = typeof wild === 'function' ? wild : (card) => wild.has(card.rank);
	const natural = cards.filter((card) => !isWild(card));
	const wildCount = cards.length - natural.length;
	if (!wildCount) return evaluateNatural(cards);
	// Classic shortcuts: with two jokers the best hand is a trail of the natural card;
	// with three, a trail of Aces. Avoids searching ~22,000 combinations per hand.
	if (evaluateNatural === evaluateClassic && cardCount === 3) {
		if (wildCount === 3) return [5, 14];
		if (wildCount === 2) return [5, natural[0].rank];
	}

	const unavailable = new Set(natural.map(cardKey));
	const candidates = freshDeck().filter((card) => !unavailable.has(cardKey(card)));
	let best;
	const chosen = [];
	function visit(start) {
		if (chosen.length === wildCount) {
			const score = evaluateNatural([...natural, ...chosen]);
			if (!best || compareVectors(score, best) > 0) best = score;
			return;
		}
		for (let i = start; i <= candidates.length - (wildCount - chosen.length); i++) {
			chosen.push(candidates[i]);
			visit(i + 1);
			chosen.pop();
		}
	}
	visit(0);
	return best;
}

export function bestThreeOfFour(cards, evaluateThree) {
	validateCards(cards, 4);
	let best;
	for (let omitted = 0; omitted < cards.length; omitted++) {
		const score = evaluateThree(cards.filter((_, index) => index !== omitted));
		if (!best || compareVectors(score, best) > 0) best = score;
	}
	return best;
}

export const isRed = ({ suit }) => suit === 'hearts' || suit === 'diamonds';

const rankName = (rank) =>
	({ 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 13.5: 'A-2-3' })[rank] ?? String(rank);
const plural = (rank) => (rank === 6 ? 'Sixes' : `${rankName(rank)}s`);

/** Plain-language name of a Classic rank vector, e.g. [1, 9, 4] -> "Pair of 9s". */
export function describeClassic(vector) {
	const [category, top] = vector;
	if (category === 5) return `Trail of ${plural(top)}`;
	if (category === 4)
		return top === 13.5 ? 'Pure sequence A-2-3' : `Pure sequence, ${rankName(top)} high`;
	if (category === 3) return top === 13.5 ? 'Sequence A-2-3' : `Sequence, ${rankName(top)} high`;
	if (category === 2) return `Colour, ${rankName(top)} high`;
	if (category === 1) return `Pair of ${plural(top)}`;
	return `High card ${rankName(top)}`;
}
