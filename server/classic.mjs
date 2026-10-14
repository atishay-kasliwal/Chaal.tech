import { randomInt } from 'node:crypto';

export function freshDeck() {
	return ['hearts', 'spades', 'diamonds', 'clubs'].flatMap((suit) =>
		Array.from({ length: 13 }, (_, index) => ({ rank: index + 2, suit }))
	);
}

export function shuffledDeck() {
	const deck = freshDeck();
	for (let i = deck.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

// Rank vectors compare lexicographically, highest first. Suits never break ties.
export function evaluateHand(cards) {
	if (!Array.isArray(cards) || cards.length !== 3) throw new Error('Classic requires three cards');
	if (
		cards.some(
			(c) =>
				!Number.isInteger(c.rank) ||
				c.rank < 2 ||
				c.rank > 14 ||
				!['hearts', 'spades', 'diamonds', 'clubs'].includes(c.suit)
		)
	)
		throw new Error('Invalid card');
	if (new Set(cards.map((c) => `${c.rank}:${c.suit}`)).size !== 3)
		throw new Error('Duplicate card');
	const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
	const flush = cards.every((c) => c.suit === cards[0].suit);
	const unique = new Set(ranks).size;
	const wheel = ranks.join(',') === '14,3,2';
	const sequence =
		unique === 3 && (wheel || (ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1));
	// Original homepage explicitly places AKQ first, A23 second, then KQJ.
	const sequenceRank = wheel ? 13.5 : ranks[0];
	if (unique === 1) return [5, ranks[0]];
	if (sequence && flush) return [4, sequenceRank];
	if (sequence) return [3, sequenceRank];
	if (flush) return [2, ...ranks];
	if (unique === 2) {
		const pair = ranks.find((rank) => ranks.filter((r) => r === rank).length === 2);
		return [1, pair, ranks.find((rank) => rank !== pair)];
	}
	return [0, ...ranks];
}

export function compareHands(a, b) {
	const left = evaluateHand(a),
		right = evaluateHand(b);
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
	}
	return 0;
}
