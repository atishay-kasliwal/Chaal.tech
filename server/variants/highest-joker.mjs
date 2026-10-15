import { wildVariant } from './wild-family.mjs';

/** Every card of the highest rank in your own hand is wild for you. */
export const highestJoker = wildVariant({
	id: 'highest-joker',
	name: 'Highest Joker',
	description: "Each player's highest rank is wild for that player's hand.",
	rules: {
		wildSource: 'highest-rank-in-player-hand',
		wildCards: 'All cards of the highest rank in each hand are wild.'
	},
	wildFor: (cards) => {
		const highest = Math.max(...cards.map(({ rank }) => rank));
		return (card) => card.rank === highest;
	}
});
