import { evaluateHand, compareHands } from '../classic.mjs';

const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);

/**
 * Draw Teen Patti: after you look, you may once per hand throw one card away and take the next
 * card from the deck. Standing pat (index -1) uses the draw up without changing the hand. Blind
 * players cannot draw: you must look first. The table sees who has drawn, never what.
 *
 * Table moves: { kind: 'draw', index } with index -1 to keep your hand.
 */
export const STAND_PAT = -1;

export const drawTeenPatti = Object.freeze({
	id: 'draw',
	version: 1,
	rulesVersion: 'draw-1',
	name: 'Draw Teen Patti',
	description: 'After you look, swap one card for a new one from the deck, once per hand.',
	evaluateHand,
	compareHands,
	prepareHand: () => ({ state: { drawn: {} }, cardsConsumed: 0 }),
	publicState: (state) => ({ drawn: Object.keys(state.drawn) }),
	tableOptions: (state, player) =>
		player.isPacked || player.isBlind || state.drawn[player.id] || player.cards.length !== 3
			? []
			: [...player.cards.map((_, index) => ({ kind: 'draw', index })), { kind: 'draw', index: STAND_PAT }],
	tableAction: (state, player, payload, { deck }) => {
		if (payload?.kind !== 'draw') throw new Error('Unknown table move');
		if (player.isBlind) throw new Error('Look at your cards first');
		if (state.drawn[player.id]) throw new Error('You already drew this hand');
		const { index } = payload;
		if (index !== STAND_PAT && !(Number.isInteger(index) && index >= 0 && index < player.cards.length))
			throw new Error('Choose one of your cards to replace');
		if (index !== STAND_PAT) {
			if (!deck.length) throw new Error('No cards left to draw');
			player.cards[index] = deck.shift();
		}
		state.drawn[player.id] = true;
	},
	getRules: () =>
		Object.freeze({
			rankingOrder: CLASSIC_ORDER,
			suitsBreakTies: false,
			draw: 'After you look, throw one card away and take a new one from the deck, once per hand. Blind players cannot draw.'
		})
});
