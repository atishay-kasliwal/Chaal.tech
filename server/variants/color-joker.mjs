import { wildVariant, isRed } from './wild-family.mjs';

/** An open card names a colour; every card of that colour is wild for everyone. */
export const colorJoker = wildVariant({
	id: 'color-joker',
	name: 'Color Joker',
	description: 'An open card picks red or black. Every card of that colour is wild.',
	rules: {
		wildSource: 'colour-of-next-undealt-card',
		wildCards: 'All cards matching the colour of the revealed card are wild.'
	},
	wildFor: (_cards, handState) => {
		if (handState?.wildColor !== 'red' && handState?.wildColor !== 'black')
			throw new Error('Color Joker requires the revealed colour');
		return (card) => (isRed(card) ? 'red' : 'black') === handState.wildColor;
	},
	prepareHand: ({ remainingDeck }) => {
		if (!remainingDeck.length) throw new Error('No card remains for the Color Joker indicator');
		const indicator = remainingDeck[0];
		return {
			state: { wildColor: isRed(indicator) ? 'red' : 'black', indicator },
			cardsConsumed: 1
		};
	}
});
