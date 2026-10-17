/**
 * Each game in plain words, for the "what is this game?" panel at the table. One line on how
 * to win, then a few short points. Everything else (betting, Show, hand order) is the same as
 * Classic Teen Patti.
 */
export interface HowToPlay {
	win: string;
	points: string[];
}

const BEST = 'Best hand wins: Trail, then Pure sequence, Sequence, Colour, Pair, High card.';
const FOUR = 'You get 4 cards. After you look, throw one away and play the best 3.';
const BLIND4 = 'Stay blind and your first 3 cards play.';

export const HOW_TO_PLAY: Record<string, HowToPlay> = {
	'classic-1': {
		win: 'The best 3-card hand wins.',
		points: [BEST, 'Play blind (without looking) to bet half as much.']
	},
	'muflis-1': {
		win: 'The worst hand wins.',
		points: [
			'Everything is upside down: High card beats a Pair, a Pair beats a Colour, and so on.',
			'The lowest cards are best: 2-3-5 of mixed suits is a great hand.'
		]
	},
	'ak47-1': {
		win: 'Best hand wins, and A, K, 4 and 7 are jokers.',
		points: [
			'Any Ace, King, 4 or 7 counts as whatever card you need.',
			'Two jokers plus any card is already a Trail.'
		]
	},
	'joker-1': {
		win: 'Best hand wins, with one wild rank.',
		points: [
			'After the deal one card is shown face up.',
			'Every card of that rank is a joker for everyone.'
		]
	},
	'lowest-joker-1': {
		win: 'Best hand wins. Your lowest card is a joker.',
		points: [
			'The lowest card in your own hand counts as any card you need.',
			'Each player has their own joker.'
		]
	},
	'999-1': {
		win: 'Make the number closest to 999.',
		points: [
			'Line your cards up as a 3-digit number, highest first.',
			'Ace = 1, and 10, J, Q, K = 0. So 9-9-9 is perfect.'
		]
	},
	'2-card-1': {
		win: 'Best 2-card hand wins.',
		points: [
			'You get only 2 cards.',
			'A pair beats everything else; otherwise the higher card wins.'
		]
	},
	'4-card-1': {
		win: 'Your best 3 out of 4 cards play.',
		points: ['You get 4 cards. The game picks your best 3 for you.', BEST]
	},
	'highest-joker-1': {
		win: 'Best hand wins. Your highest card is a joker.',
		points: ['The highest card in your own hand counts as any card you need.']
	},
	'one-eyed-jack-1': {
		win: 'Best hand wins. The one-eyed Jacks are jokers.',
		points: ['J♥ and J♠ count as any card you need.', 'J♦ and J♣ are normal Jacks.']
	},
	'color-joker-1': {
		win: 'Best hand wins. One colour is wild.',
		points: ['A card is shown face up: red or black.', 'Every card of that colour is a joker.']
	},
	'lallan-kallan-1': {
		win: 'Best hand wins. The odd colour is your joker.',
		points: [
			'If you have two red and one black (or the other way), the odd one is a joker.',
			'All one colour? No joker.'
		]
	},
	'pot-blind-1': {
		win: 'Best hand wins, but nobody looks.',
		points: ['Everyone plays blind the whole hand.', 'Cards are only turned over at the Show.']
	},
	'discard-one-1': {
		win: 'Best 3 of your 4 cards win.',
		points: [FOUR, BLIND4]
	},
	'folding-joker-1': {
		win: 'Best hand wins. The card you fold becomes your joker.',
		points: [
			'You get 4 cards. After you look, fold one.',
			'Cards in your hand with the same rank as the folded card are jokers.',
			'Stay blind and your 4th card is the joker.'
		]
	},
	'muflis-4-1': {
		win: 'The worst hand wins, with 4 cards.',
		points: [FOUR, 'Lowest hand wins, like Muflis.', BLIND4]
	},
	'joker-4-1': {
		win: 'Best hand wins, 4 cards, one wild rank.',
		points: [FOUR, 'A face-up card sets the joker rank for everyone.', BLIND4]
	},
	'lowest-joker-4-1': {
		win: 'Best hand wins, 4 cards, your lowest is a joker.',
		points: [FOUR, 'The lowest card in the 3 you keep is a joker.', BLIND4]
	},
	'highest-joker-4-1': {
		win: 'Best hand wins, 4 cards, your highest is a joker.',
		points: [FOUR, 'The highest card in the 3 you keep is a joker.', BLIND4]
	},
	'color-joker-4-1': {
		win: 'Best hand wins, 4 cards, one colour is wild.',
		points: [FOUR, 'A face-up card picks red or black; that colour is wild.', BLIND4]
	},
	'chatai-1': {
		win: 'Best hand wins. The mat in the middle gives you jokers.',
		points: [
			'Nine cards lie face down on the mat.',
			'After you pay your chaal, tap a mat card to open it. Blind players open cards too.',
			'Every open card is a joker: any card of that rank counts as anything.',
			'When all nine are open, pick one row, column or diagonal and lock it. Only those three are your jokers.',
			'Lock your line before you ask for a Show. Once locked, it can’t change.'
		]
	},
	'running-1': {
		win: 'Best hand wins, but watch the third card.',
		points: [
			'Three cards lie face down on the table.',
			'At ₹200 of pot the first opens: the ranks just above and below it are jokers (a 7 makes 6s and 8s wild).',
			'At ₹400 the second opens: its rank and the ranks above and below are jokers too. Aces wrap.',
			'At ₹600 the third opens: anyone who has seen their cards and holds its suit is out.',
			'Blind players may still Show, but can’t win holding that suit.',
			'Equal hands: the higher card wins, then the suit: ♠, ♥, ♣, ♦.'
		]
	},
	'rotating-joker-1': {
		win: 'Best hand wins, with three jokers on the table.',
		points: [
			'Three cards lie open on the table. Their ranks are jokers for everyone.',
			'When someone packs, their three cards become the new jokers.',
			'At the Show, the jokers on the table at that moment count.'
		]
	},
	'revolving-joker-1': {
		win: 'Best hand wins, with three jokers on the table.',
		points: [
			'Three cards lie open on the table. Their ranks are jokers for everyone.',
			'Every time someone packs, three fresh jokers replace them.'
		]
	},
	'kiss-miss-bliss-1': {
		win: 'Best hand wins. Make your own joker from two cards.',
		points: [
			'You get 5 cards. After you look, tap two that make a pair type:',
			'Kiss: next to each other (2-3). Miss: one gap (8-10). Bliss: the same rank (K-K).',
			'Those two become one joker. Then throw cards away until you keep three.',
			'No pair? Throw two cards away and play the natural three.',
			'Stay blind and your first three cards play, with no joker.'
		]
	},
	'kissing-missing-1': {
		win: 'Best hand wins. Make your own joker from two cards.',
		points: [
			'You get 4 cards. After you look, tap two that make a Kiss (2-3) or a Miss (8-10).',
			'Those two become one joker, leaving you three cards.',
			'No pair? Throw one card away and play the natural three.',
			'Stay blind and your first three cards play, with no joker.'
		]
	}
};
