import { wildVariant } from './wild-family.mjs';

const oneEyed = (card) => card.rank === 11 && (card.suit === 'hearts' || card.suit === 'spades');

/** The two one-eyed jacks (J♥ and J♠, drawn in profile) are wild. */
export const oneEyedJack = wildVariant({
	id: 'one-eyed-jack',
	name: 'One-Eyed Jack',
	description: 'The Jack of Hearts and Jack of Spades are wild.',
	rules: { wildCards: 'J♥ and J♠ are wild; J♦ and J♣ are ordinary Jacks.' },
	wildFor: () => oneEyed
});
