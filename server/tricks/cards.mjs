/**
 * Shared trick-taking primitives (docs/games/TRICK_GAMES_PHASE1.md §3): decks, card identity, legal
 * plays and trick resolution. Pure functions over plain cards { rank, suit }, ranks 2..14 (A = 14),
 * the same shape every Chaal game uses. Each game passes its own rank order; nothing here knows
 * which game it is.
 */
export const SUITS = Object.freeze(['spades', 'hearts', 'diamonds', 'clubs']);
export const SUIT_SYMBOL = Object.freeze({ spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' });

export const cardKey = (card) => `${card.rank}${card.suit[0]}`;
export const sameCard = (a, b) => !!a && !!b && a.rank === b.rank && a.suit === b.suit;
export const cardName = (card) =>
	`${{ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[card.rank] ?? card.rank}${SUIT_SYMBOL[card.suit] ?? ''}`;

/** A deck from rank lists per suit, in a fixed canonical order. */
export function buildDeck(ranksBySuit) {
	return SUITS.flatMap((suit) => (ranksBySuit[suit] ?? []).map((rank) => ({ rank, suit })));
}

/** Cards a player may play: any card when leading, otherwise the led suit if they hold it. */
export function legalPlays(hand, ledSuit) {
	if (!ledSuit) return hand.slice();
	const follow = hand.filter((card) => card.suit === ledSuit);
	return follow.length ? follow : hand.slice();
}

/**
 * Index (in `plays`) of the winning card: the highest trump if any trump was played, otherwise the
 * highest card of the suit led. `strength(card)` gives a card's rank within its suit (higher wins).
 */
export function trickWinner(plays, trump, strength = (card) => card.rank) {
	const led = plays[0].card.suit;
	let best = 0;
	for (let i = 1; i < plays.length; i++) {
		const a = plays[i].card;
		const b = plays[best].card;
		const aTrump = trump && a.suit === trump;
		const bTrump = trump && b.suit === trump;
		if (aTrump && !bTrump) best = i;
		else if (aTrump === bTrump && a.suit === b.suit && strength(a) > strength(b)) best = i;
		else if (!aTrump && !bTrump && a.suit === led && b.suit !== led) best = i;
	}
	return best;
}

/** Sort for display and for deterministic choices: by suit order, then rank high to low. */
export function sortHand(cards, suitOrder = SUITS) {
	return cards
		.slice()
		.sort((a, b) => suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit) || b.rank - a.rank);
}

/** 32-bit FNV-1a: a stable hash for secret, replayable orderings (never for security). */
export function fnv(text) {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	return h >>> 0;
}
