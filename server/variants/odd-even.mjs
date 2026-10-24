import { wildVariant } from './wild-family.mjs';

// Ace plays high (14) so it counts as even here; the 2-14 range keeps parity simple.
const isOdd = ({ rank }) => rank % 2 === 1;

/**
 * Odd/Even: look at the parity of your ranks. With two odd and one even (or the other way),
 * the odd-one-out card is your joker. All odd or all even: no joker.
 */
export const oddEven = wildVariant({
	id: 'odd-even',
	name: 'Odd/Even',
	description: 'If one of your cards is the odd or even rank out, that card is wild for you.',
	rules: {
		wildSource: 'odd-parity-card-in-player-hand',
		wildCards:
			'Two odd ranks + one even rank: the even card is wild (and vice versa). Ace counts as 14, so it is even. All the same parity: no joker.'
	},
	wildFor: (cards) => {
		const odds = cards.filter(isOdd).length;
		if (odds === 0 || odds === cards.length) return () => false;
		const outIsOdd = odds === 1;
		return (card) => isOdd(card) === outIsOdd;
	}
});
