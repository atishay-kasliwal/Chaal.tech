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
		selectionLabel: 'Muflis — lowest hand wins',
		tableLabel: 'Muflis · lowest Classic hand wins',
		description: 'Lowest Classic hand wins; equal Show hands lose for the requester.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'ak47-1',
		selectionLabel: 'AK47 — A, K, 4 and 7 are wild',
		tableLabel: 'AK47 · A, K, 4 and 7 are wild',
		description: 'Aces, Kings, 4s and 7s are wild. Best Classic hand wins.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'joker-1',
		selectionLabel: 'Joker — one revealed rank is wild',
		tableLabel: 'Joker · one revealed rank is wild',
		description: 'The next undealt card reveals the rank that is wild for this hand.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'lowest-joker-1',
		selectionLabel: 'Lowest Joker — lowest rank is wild',
		tableLabel: 'Lowest Joker · each hand’s lowest rank is wild',
		description: 'All cards of the lowest rank in each player’s hand are wild.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: '999-1',
		selectionLabel: '999 — highest three-digit value wins',
		tableLabel: '999 · highest three-digit value wins',
		description: 'Arrange values high to low; 10/J/Q/K=0 and Ace=1. Closest to 999 wins.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: '2-card-1',
		selectionLabel: '2 Card — pairs beat high card',
		tableLabel: '2 Card · pairs beat high card',
		description: 'Two cards per player. A pair beats every high-card hand.',
		cardsPerPlayer: 2
	},
	{
		rulesVersion: '4-card-1',
		selectionLabel: '4 Card — best three of four',
		tableLabel: '4 Card · best three of four',
		description: 'Deal four cards and use the best three-card Teen Patti hand.',
		cardsPerPlayer: 4
	}
] as const;

export type RulesVersion = (typeof VARIANT_CATALOG)[number]['rulesVersion'];

export const VARIANT_BY_VERSION = Object.fromEntries(
	VARIANT_CATALOG.map((variant) => [variant.rulesVersion, variant])
) as Record<(typeof VARIANT_CATALOG)[number]['rulesVersion'], (typeof VARIANT_CATALOG)[number]>;
