import { VARIANT_CATALOG } from '#lib/variant-catalog.js';
import { HOW_TO_PLAY } from '#lib/teen-patti/how-to-play.js';

export type GameCategory = 'Teen Patti' | 'Poker' | 'Blackjack' | 'Rummy' | 'Tricks';
export interface GameGuide {
	id: string;
	name: string;
	category: GameCategory;
	win: string;
	rules: string[];
	cards: { rank: string; suit: string; wild?: boolean }[];
	example: string;
}
const card = (rank: string, suit = 'spades', wild = false) => ({ rank, suit, wild });
const variants: GameGuide[] = VARIANT_CATALOG.map((variant) => {
	const id = variant.rulesVersion;
	const guide = HOW_TO_PLAY[id];
	const name = variant.selectionLabel.split(':')[0];
	let cards = [card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts')];
	let example = 'A♥ K♥ Q♥ · pure sequence';
	if (id.includes('muflis')) {
		cards = [card('2'), card('3', 'hearts'), card('5', 'clubs')];
		example = '2♠ 3♥ 5♣ · a low high-card hand';
	} else if (id === '999-1') {
		cards = [card('9'), card('9', 'hearts'), card('9', 'clubs')];
		example = '9 · 9 · 9 = 999';
	} else if (id === '2-card-1') {
		cards = [card('K'), card('K', 'hearts')];
		example = 'K♠ K♥ · a pair';
	} else if (id.includes('ak47')) {
		cards = [card('A', 'hearts', true), card('4', 'clubs', true), card('9')];
		example = 'A and 4 are wild · make three 9s';
	} else if (id.includes('one-eyed')) {
		cards = [card('J', 'hearts', true), card('8'), card('8', 'clubs')];
		example = 'J♥ is wild · make three 8s';
	} else if (id.includes('lallan')) {
		cards = [card('5', 'hearts'), card('K', 'diamonds'), card('8', 'clubs', true)];
		example = 'Two red, one black · the black card is wild';
	} else if (id.includes('color-joker')) {
		cards = [card('5', 'hearts', true), card('K', 'diamonds', true), card('8', 'clubs')];
		example = 'If the open card is red, all red cards are wild';
	} else if (id.includes('lowest-joker')) {
		cards = [card('2', 'clubs', true), card('8'), card('8', 'hearts')];
		example = 'Your lowest rank is wild · make three 8s';
	} else if (id.includes('highest-joker')) {
		cards = [card('A', 'clubs', true), card('8'), card('8', 'hearts')];
		example = 'Your highest rank is wild · make three 8s';
	} else if (id.includes('folding')) {
		cards = [card('8', 'clubs', true), card('8', 'hearts', true), card('K')];
		example = 'Fold an 8 · your remaining 8s become wild';
	} else if (id.includes('joker')) {
		cards = [card('5', 'clubs', true), card('8'), card('8', 'hearts')];
		example = 'If a 5 is revealed, every 5 is wild';
	}
	if (variant.cardsPerPlayer === 4) {
		cards = [...cards, card(id.includes('folding') ? '8' : '2', 'diamonds')];
		example =
			id === '4-card-1'
				? 'Four cards dealt · best three chosen automatically'
				: 'Four cards dealt · look, discard one, then play';
	}
	if (id === 'pot-blind-1') example = 'Stay blind · reveal only at the Show';
	return {
		id,
		name,
		category: 'Teen Patti',
		win: guide?.win ?? variant.description,
		rules: guide?.points ?? [variant.description],
		cards,
		example
	};
});
const otherGames: GameGuide[] = [
	{
		id: 'texas-holdem',
		name: 'Texas Hold’em',
		category: 'Poker',
		win: 'Make the best five-card poker hand, or get everyone else to fold.',
		rules: [
			'Each player receives two private hole cards. Five community cards are revealed in stages: flop, turn and river.',
			'Bet, check, call, raise or fold as the action comes to you.',
			'Use any five of your two hole cards and the five community cards. The best remaining hand wins at showdown.'
		],
		cards: [card('A'), card('A', 'hearts')],
		example: 'Two hole cards + five community cards · best five play'
	},
	{
		id: 'blackjack',
		name: 'Blackjack',
		category: 'Blackjack',
		win: 'Beat the dealer’s total without going over 21.',
		rules: [
			'Number cards use their face value, J/Q/K count as 10, and Aces count as 1 or 11.',
			'Choose a wager before the deal. Hit for another card, stand to keep your total, or double on your first two cards when you can match the wager.',
			'The dealer stands on all 17s, including soft 17. A natural blackjack pays 3:2 and beats other 21s. Equal non-blackjack totals, or two naturals, push.'
		],
		cards: [card('A'), card('K', 'hearts')],
		example: 'A + K = 21 · a natural blackjack'
	},
	{
		id: 'rummy',
		name: '13-card Indian Rummy',
		category: 'Rummy',
		win: 'Arrange all 13 cards into valid sequences and sets, then declare.',
		rules: [
			'On your turn, draw a card from the stock or discard pile, then discard one.',
			'A sequence has consecutive cards of one suit. A set has equal ranks in different suits.',
			'A valid declaration needs at least two sequences, including one pure sequence without a joker. Every remaining card must belong to a valid group.',
			'After drawing, select the final discard and declare only when your remaining 13 cards form a valid hand.'
		],
		cards: [card('5', 'hearts'), card('6', 'hearts'), card('7', 'hearts')],
		example: '5♥ 6♥ 7♥ · one pure sequence, not a complete declaration'
	},
	{
		id: 'three-two-five',
		name: '3 2 5',
		category: 'Tricks',
		win: 'Take more tricks than your target: 5, 3 or 2, depending on your seat this round.',
		rules: [
			'Three players, 30 cards (8 to A in every suit, plus 7♥ and 7♠), ten cards each. Targets rotate every round.',
			'The player whose target is 5 picks trump after seeing their first five cards.',
			'Follow suit if you can; otherwise trump or throw any card. The highest trump wins the trick, otherwise the highest card of the suit led.',
			'Your score is tricks taken minus your target. Next round, each extra trick lets you pull a face-down card from a player who fell short, then give back any card except the one you took.'
		],
		cards: [card('A', 'hearts'), card('K', 'hearts'), card('7', 'spades')],
		example: 'A♥ K♥ 7♠ · trump decides who takes the trick'
	}
];
// Start the carousel with the four game families and two familiar Teen Patti variants.
export const GAME_GUIDES = [
	variants[0],
	...otherGames,
	variants[1],
	variants[2],
	...variants.slice(3)
];
export const GAME_CATEGORIES = [
	'All',
	'Teen Patti',
	'Poker',
	'Blackjack',
	'Rummy',
	'Tricks'
] as const;

const POSTER_COLORS = ['#293b21', '#34283f', '#4b3023', '#203b48', '#452a33', '#203e33'];
export function gameColor(id: string) {
	return POSTER_COLORS[
		Math.max(
			0,
			GAME_GUIDES.findIndex((game) => game.id === id)
		) % POSTER_COLORS.length
	];
}
