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

type ExampleCard = { rank: number; suit: 'spades' | 'hearts' | 'diamonds' | 'clubs' };
const c = (rank: number, suit: ExampleCard['suit']): ExampleCard => ({ rank, suit });

/** The strongest and the weakest hand of each kind, for the rankings drawer. A is 14. */
export const RANKING_EXAMPLES: Record<string, { best: ExampleCard[]; worst: ExampleCard[] }> = {
	Trail: {
		best: [c(14, 'hearts'), c(14, 'spades'), c(14, 'clubs')],
		worst: [c(2, 'diamonds'), c(2, 'hearts'), c(2, 'spades')]
	},
	'Pure sequence': {
		best: [c(14, 'diamonds'), c(13, 'diamonds'), c(12, 'diamonds')],
		worst: [c(4, 'diamonds'), c(3, 'diamonds'), c(2, 'diamonds')]
	},
	Sequence: {
		best: [c(14, 'spades'), c(13, 'hearts'), c(12, 'diamonds')],
		worst: [c(4, 'clubs'), c(3, 'spades'), c(2, 'clubs')]
	},
	Colour: {
		best: [c(14, 'diamonds'), c(13, 'diamonds'), c(11, 'diamonds')],
		worst: [c(5, 'diamonds'), c(3, 'diamonds'), c(2, 'diamonds')]
	},
	Pair: {
		best: [c(14, 'clubs'), c(14, 'diamonds'), c(13, 'spades')],
		worst: [c(2, 'hearts'), c(2, 'spades'), c(3, 'spades')]
	},
	'High card': {
		best: [c(14, 'spades'), c(13, 'spades'), c(11, 'clubs')],
		worst: [c(5, 'hearts'), c(3, 'diamonds'), c(2, 'spades')]
	}
};
