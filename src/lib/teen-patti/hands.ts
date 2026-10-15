import { rankLabel } from './format.js';

type Card = { rank: number; suit: string };

const plural = (rank: number) => (rank === 6 ? 'Sixes' : `${rankLabel(rank)}s`);

/**
 * Plain-language name of a three-card hand under Classic ranking. Only used as a
 * reading aid for variants without wild cards; the server decides every winner.
 */
export function handName(cards: Card[]): string | null {
	if (cards.length !== 3 || cards.some((card) => !card.rank)) return null;
	const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
	const flush = cards.every((card) => card.suit === cards[0].suit);
	const unique = new Set(ranks).size;
	const wheel = ranks.join(',') === '14,3,2';
	const run = unique === 3 && (wheel || (ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1));
	const top = wheel ? 'A-2-3' : ranks.map(rankLabel).join('-');
	if (unique === 1) return `Trail of ${plural(ranks[0])}`;
	if (run && flush) return `Pure sequence ${top}`;
	if (run) return `Sequence ${top}`;
	if (flush) return `Colour, ${rankLabel(ranks[0])} high`;
	if (unique === 2) {
		const pair = ranks.find((rank) => ranks.filter((other) => other === rank).length === 2)!;
		return `Pair of ${plural(pair)}`;
	}
	return `High card ${rankLabel(ranks[0])}`;
}

/** Variants whose hands read correctly with Classic names. */
export const NAMED_VARIANTS = new Set(['classic-1', 'muflis-1']);

export const HAND_RANKINGS = [
	{ name: 'Trail', hint: 'Three of a kind', cards: ['A♠', 'A♥', 'A♦'] },
	{ name: 'Pure sequence', hint: 'Run, same suit', cards: ['Q♥', 'K♥', 'A♥'] },
	{ name: 'Sequence', hint: 'Run, any suits', cards: ['4♣', '5♥', '6♠'] },
	{ name: 'Colour', hint: 'Same suit', cards: ['2♦', '7♦', 'J♦'] },
	{ name: 'Pair', hint: 'Two of a kind', cards: ['9♠', '9♥', '3♣'] },
	{ name: 'High card', hint: 'Nothing else', cards: ['K♠', '8♦', '4♣'] }
] as const;
