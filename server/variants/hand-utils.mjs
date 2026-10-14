import { freshDeck } from '../classic.mjs';

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

/** Replace selected ranks with distinct physical cards and return the best score. */
export function bestWildHand(cards, wildRanks, evaluateNatural, cardCount = 3) {
	validateCards(cards, cardCount);
	const isWild = (card) => wildRanks.has(card.rank);
	const natural = cards.filter((card) => !isWild(card));
	const wildCount = cards.length - natural.length;
	if (!wildCount) return evaluateNatural(cards);

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
