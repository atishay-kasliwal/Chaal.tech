import { wildVariant, isRed } from './wild-family.mjs';

/**
 * Lallan Kallan: look at the colours in your hand. With two of one colour and one of
 * the other, the odd-coloured card is your joker. All one colour: no joker.
 */
export const lallanKallan = wildVariant({
	id: 'lallan-kallan',
	name: 'Lallan Kallan',
	description: 'If one of your cards is the odd colour out, that card is wild for you.',
	rules: {
		wildSource: 'odd-colour-card-in-player-hand',
		wildCards: 'Two red + one black: the black card is wild (and vice versa). One colour: no joker.'
	},
	wildFor: (cards) => {
		const reds = cards.filter(isRed).length;
		if (reds === 0 || reds === cards.length) return () => false;
		const oddIsRed = reds === 1;
		return (card) => isRed(card) === oddIsRed;
	}
});
