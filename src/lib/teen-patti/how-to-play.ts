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
	'odd-even-1': {
		win: 'Best hand wins. The odd one out is your joker.',
		points: [
			'Two odd ranks and one even (or the other way): the odd one out is a joker.',
			'Ace counts as 14, so it is even.',
			'All the same? No joker.'
		]
	},
	'best-of-five-1': {
		win: 'Best 3 of your 5 cards win.',
		points: ['You get 5 cards. After you look, throw two away and play the best 3.', BLIND4]
	},
	'worst-of-four-1': {
		win: 'The worst hand wins, with 4 cards.',
		points: [
			'You get 4 cards and cannot throw any away.',
			'Your lowest 3-card hand counts, picked for you. The lowest hand wins.'
		]
	},
	'hukum-1': {
		win: 'Best hand wins. Trump cards break the tie inside a hand type.',
		points: [
			'An open card names the trump suit.',
			'Two hands of the same type? The one with more trump cards wins, even with lower ranks.',
			'A better hand type always wins, trump or not.'
		]
	},
	'red-black-1': {
		win: 'Best hand wins. All red or all black is a new hand.',
		points: [
			'Three red cards or three black cards (not one suit, not a sequence) beat a Pair.',
			'A Colour (one suit) still beats it.',
			'A pair stays a pair, even if all three cards are one colour.'
		]
	},
	'progressive-joker-1': {
		win: 'Best hand wins. Jokers appear as the pot grows.',
		points: [
			'A hidden card turns over when the pot reaches ₹100: its rank is wild.',
			'At ₹200 the ranks either side of it are wild too.',
			'At ₹400 every card of its suit is wild.'
		]
	},
	'open-card-1': {
		win: 'Best hand wins. One card of each hand is face up.',
		points: [
			'Your first card is dealt face up, so everyone sees it.',
			'The other two stay hidden until a Show.',
			'Use the open cards to read your rivals.'
		]
	},
	'one-hidden-1': {
		win: 'Best hand wins. Two cards of each hand are face up.',
		points: [
			'Your first two cards are dealt face up.',
			'Only the third stays hidden until a Show.'
		]
	},
	'stud-1': {
		win: 'Best hand wins. Cards turn face up as the pot grows.',
		points: [
			'One card is face up from the deal.',
			'A second turns face up when the pot reaches ₹100.',
			'The third stays hidden until a Show.'
		]
	},
	'draw-1': {
		win: 'Best hand wins. You may swap one card.',
		points: [
			'After you look, you can throw one card away and take a new one from the deck.',
			'Once per hand. Everyone sees who drew, never what.',
			'Blind players cannot draw: look first.'
		]
	},
	'trade-one-1': {
		win: 'Best hand wins. You may trade one card with a rival.',
		points: [
			'After you look, once per hand: give one of your cards to a rival.',
			'You take the card in the same place in their hand, without seeing it first.',
			'A rival who traded with you is told.'
		]
	},
	'pass-the-card-1': {
		win: 'Best hand wins. Everyone passes one card.',
		points: [
			'Pick one card to pass. Blind players can pass without looking.',
			'When every player still in has picked, each passes their card to the next seat.',
			'If the hand ends first, nothing is passed.'
		]
	},
	'high-low-1': {
		win: 'The Show says whether the high or the low hand wins.',
		points: [
			'Whoever asks for the Show chooses Show high or Show low.',
			'High: the better hand wins. Low: the weaker hand wins.',
			'Equal hands lose for the player who asked.'
		]
	},
	'split-pot-1': {
		win: 'Best and worst hands share a big pot.',
		points: [
			'When three or more players are in and the pot reaches 20 boots, all show.',
			'The best hand takes half the pot and the worst hand takes the other half.',
			'With two players left it is a normal Show.'
		]
	},
	'faceoff-1': {
		win: 'Best hand wins. You can knock players out one by one.',
		points: [
			'On your turn, pay the Show fee and challenge one player.',
			'Both hands are shown and the weaker one is out. Equal hands go against you.',
			'The hand carries on with everyone else.'
		]
	},
	'buying-joker-1': {
		win: 'Best hand wins. You can pay to get a joker.',
		points: [
			'One joker rank is hidden. Pay 5 boots into the pot to learn it.',
			'That rank is wild in your hand only.',
			'Everyone sees who bought, never what the rank is.'
		]
	},
	'buying-joker-2': {
		win: 'Best hand wins. You can pay to get a joker.',
		points: [
			'One joker rank is hidden. Pay 5 boots into the pot to learn it.',
			'That rank is wild in your hand only.',
			'Everyone sees who bought, never what the rank is.'
		]
	},
	'auction-1': {
		win: 'Best hand wins. The highest bidder gets the joker.',
		points: [
			'Everyone makes one sealed bid for a hidden joker.',
			'When all have bid, the highest bid is paid into the pot and wins it.',
			'The rank is wild in the winner’s hand only. Nobody bidding means no joker.'
		]
	},
	'auction-2': {
		win: 'Best hand wins. The highest bidder gets the joker.',
		points: [
			'Everyone makes one sealed bid for a hidden joker.',
			'When all have bid, the highest bid is paid into the pot and wins it.',
			'The rank is wild in the winner’s hand only. Nobody bidding means no joker.'
		]
	},
	'knockout-1': {
		win: 'Last hands standing. The lowest hand goes every lap.',
		points: [
			'After every lap of bets, the lowest hand is knocked out and shown.',
			'Equal lowest hands go together, unless that would leave fewer than two.',
			'With two players left, play on to a Show.'
		]
	},
	'sudden-death-1': {
		win: 'Hands end fast. The stake doubles every lap.',
		points: [
			'After every lap the stake doubles and the lowest hand is knocked out.',
			'With two players left, play on to a Show at the higher stakes.'
		]
	},
	'survivor-1': {
		win: 'Be the last player standing.',
		points: [
			'There is no Show.',
			'After every lap of bets the lowest hand is knocked out and shown.',
			'The last player left takes the pot.'
		]
	},
	'banko-1': {
		win: 'Beat the banker. The dealer is the banker.',
		points: [
			'Equal hands at a Show go to the banker.',
			'When the pot reaches 20 boots with three or more players in, all show.',
			'Players who beat the banker split the pot. Otherwise the banker takes it.'
		]
	},
	'community-1': {
		win: 'Best three cards from your two and the shared cards.',
		points: [
			'You get 2 cards. Three shared cards lie in the middle.',
			'One shared card is open from the deal, the next at ₹100 of pot and the last at ₹200.',
			'Your hand is the best three of your two and the open shared cards.'
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
	'folding-joker-2': {
		win: 'Best hand wins. Every folded rank becomes a joker for everyone.',
		points: [
			'You get 4 cards. After you look, fold one.',
			'Every rank folded by any player or bot is wild for the whole table.',
			'Blind players use the shared jokers too. Their fourth card adds no joker until folded.'
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
