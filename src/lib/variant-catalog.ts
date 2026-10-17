export const VARIANT_CATALOG = [
	{
		rulesVersion: 'classic-1',
		selectionLabel: 'Classic',
		tableLabel: 'Classic · highest hand wins',
		description: 'Highest Classic hand wins.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'muflis-1',
		selectionLabel: 'Muflis: lowest hand wins',
		tableLabel: 'Muflis · lowest Classic hand wins',
		description: 'Lowest Classic hand wins; equal Show hands lose for the requester.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'ak47-1',
		selectionLabel: 'AK47: A, K, 4 and 7 are wild',
		tableLabel: 'AK47 · A, K, 4 and 7 are wild',
		description: 'Aces, Kings, 4s and 7s are wild. Best Classic hand wins.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'joker-1',
		selectionLabel: 'Joker: one revealed rank is wild',
		tableLabel: 'Joker · one revealed rank is wild',
		description: 'The next undealt card reveals the rank that is wild for this hand.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'lowest-joker-1',
		selectionLabel: 'Lowest Joker: lowest rank is wild',
		tableLabel: 'Lowest Joker · each hand’s lowest rank is wild',
		description: 'All cards of the lowest rank in each player’s hand are wild.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: '999-1',
		selectionLabel: '999: highest three-digit value wins',
		tableLabel: '999 · highest three-digit value wins',
		description: 'Arrange values high to low; 10/J/Q/K=0 and Ace=1. Closest to 999 wins.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: '2-card-1',
		selectionLabel: '2 Card: pairs beat high card',
		tableLabel: '2 Card · pairs beat high card',
		description: 'Two cards per player. A pair beats every high-card hand.',
		cardsPerPlayer: 2
	},
	{
		rulesVersion: '4-card-1',
		selectionLabel: '4 Card: best three of four',
		tableLabel: '4 Card · best three of four',
		description: 'Deal four cards and use the best three-card Teen Patti hand.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'highest-joker-1',
		selectionLabel: 'Highest Joker: your highest card is wild',
		tableLabel: 'Highest Joker · your highest rank is wild',
		description: 'All cards of the highest rank in your own hand are wild for you.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'one-eyed-jack-1',
		selectionLabel: 'One-Eyed Jack: J♥ and J♠ are wild',
		tableLabel: 'One-Eyed Jack · J♥ and J♠ are wild',
		description: 'The two one-eyed Jacks (hearts and spades) are wild. J♦ and J♣ are normal.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'color-joker-1',
		selectionLabel: 'Color Joker: one colour is wild',
		tableLabel: 'Color Joker · an open card picks the wild colour',
		description: 'An open card picks red or black. Every card of that colour is wild.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'lallan-kallan-1',
		selectionLabel: 'Lallan Kallan: odd colour out is wild',
		tableLabel: 'Lallan Kallan · odd-coloured card is wild',
		description:
			'Two cards of one colour and one of the other? The odd-coloured card is your joker.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'pot-blind-1',
		selectionLabel: 'Pot Blind: nobody looks',
		tableLabel: 'Pot Blind · everyone plays blind',
		description: 'Nobody can see their cards. Everyone bets blind until the Show.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'discard-one-1',
		selectionLabel: 'Discard One: get four, throw one',
		tableLabel: 'Discard One · look, then throw one away',
		description:
			'Get four cards. After you look, throw one away and play three. Stay blind and your first three count.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'folding-joker-1',
		selectionLabel: 'Folding Joker: your folded card is the joker',
		tableLabel: 'Folding Joker · fold one, its rank is wild for you',
		description:
			'Get four cards. Fold one face down: cards of its rank in your hand are wild. Stay blind and your fourth card is the joker.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'muflis-4-1',
		selectionLabel: 'Muflis 4: four cards, lowest wins',
		tableLabel: 'Muflis 4 · throw one, lowest three wins',
		description: 'Get four, throw one. The lowest three-card hand wins.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'joker-4-1',
		selectionLabel: 'Joker 4: four cards, common joker',
		tableLabel: 'Joker 4 · throw one, revealed rank is wild',
		description: 'Get four, throw one. A revealed card sets the wild rank for everyone.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'lowest-joker-4-1',
		selectionLabel: 'Lowest Joker 4: four cards, lowest is wild',
		tableLabel: 'Lowest Joker 4 · throw one, your lowest rank is wild',
		description: 'Get four, throw one. The lowest rank in the three you keep is wild.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'highest-joker-4-1',
		selectionLabel: 'Highest Joker 4: four cards, highest is wild',
		tableLabel: 'Highest Joker 4 · throw one, your highest rank is wild',
		description: 'Get four, throw one. The highest rank in the three you keep is wild.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'color-joker-4-1',
		selectionLabel: 'Color Joker 4: four cards, a colour is wild',
		tableLabel: 'Color Joker 4 · throw one, a colour is wild',
		description: 'Get four, throw one. An open card picks red or black; that colour is wild.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'chatai-1',
		selectionLabel: 'Chatai 3×3: open the mat, pick a line',
		tableLabel: 'Chatai 3×3 · open cards are jokers, then lock a line',
		description:
			'Nine cards face down on the mat. Pay, open one: open cards are jokers. All nine open? Lock one line as your jokers.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'running-1',
		selectionLabel: 'Running: table cards open with the pot',
		tableLabel: 'Running · cards open at ₹200, ₹400, ₹600',
		description:
			'Three table cards open as the pot grows. The first two set jokers; the third card’s suit knocks players out.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'rotating-joker-1',
		selectionLabel: 'Rotating Joker: packed cards become jokers',
		tableLabel: 'Rotating Joker · a pack hands its cards to the table',
		description:
			'Three jokers open on the table. When someone packs, their cards are the new jokers.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'revolving-joker-1',
		selectionLabel: 'Revolving Joker: fresh jokers on every pack',
		tableLabel: 'Revolving Joker · each pack deals new jokers',
		description: 'Three jokers open on the table. Every pack deals three fresh jokers.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'kiss-miss-bliss-1',
		selectionLabel: 'Kiss-Miss-Bliss: make a joker from five',
		tableLabel: 'Kiss-Miss-Bliss · two cards become one joker',
		description:
			'Get five. Two cards next to each other, one apart or the same become one joker. Keep three.',
		cardsPerPlayer: 5
	},
	{
		rulesVersion: 'kissing-missing-1',
		selectionLabel: 'Kissing-Missing: make a joker from four',
		tableLabel: 'Kissing-Missing · Kiss or Miss makes a joker',
		description:
			'Get four. Two cards next to each other or one apart become one joker. Keep three.',
		cardsPerPlayer: 4
	}
] as const;

export type RulesVersion = (typeof VARIANT_CATALOG)[number]['rulesVersion'];

export const VARIANT_BY_VERSION = Object.fromEntries(
	VARIANT_CATALOG.map((variant) => [variant.rulesVersion, variant])
) as Record<(typeof VARIANT_CATALOG)[number]['rulesVersion'], (typeof VARIANT_CATALOG)[number]>;
