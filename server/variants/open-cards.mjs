import { evaluateHand, compareHands } from '../classic.mjs';

/**
 * Classic ranking with some cards dealt face up. The first `openCount` cards of every hand lie
 * open for the whole table from the deal; the engine publishes them beside the hidden rest
 * (`openCards` in the projection). Cards stay in dealt order, so the open ones are always first.
 */
const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);

function openGame({ id, name, description, open, openText, extra = {} }) {
	return Object.freeze({
		id,
		version: 1,
		rulesVersion: `${id}-1`,
		name,
		description,
		evaluateHand,
		compareHands,
		openCount: typeof open === 'function' ? open : () => open,
		getRules: () =>
			Object.freeze({ rankingOrder: CLASSIC_ORDER, suitsBreakTies: false, openCards: openText }),
		...extra
	});
}

export const openCard = openGame({
	id: 'open-card',
	name: 'Open Card',
	description: 'One of your three cards lies face up for everyone. The other two stay hidden.',
	open: 1,
	openText: 'Your first card is dealt face up. The other two stay hidden until a Show.'
});

export const oneHidden = openGame({
	id: 'one-hidden',
	name: 'One Hidden',
	description: 'Two of your three cards lie face up for everyone. Only one stays hidden.',
	open: 2,
	openText: 'Your first two cards are dealt face up. Only the third stays hidden until a Show.'
});

/** Stud: one card up from the deal, the second turns up when the pot reaches this amount. */
export const STUD_SECOND_CARD_AT = 100;

export const stud = openGame({
	id: 'stud',
	name: 'Stud Teen Patti',
	description:
		'One card is dealt face up. A second turns up when the pot reaches ₹100. The third stays hidden.',
	open: (state) => state?.up ?? 1,
	openText:
		'Your first card is face up from the deal. Your second turns face up when the pot reaches ₹100. The third stays hidden until a Show.',
	extra: {
		prepareHand: () => ({ state: { up: 1 }, cardsConsumed: 0 }),
		afterPot: (state, pot) => {
			if (pot >= STUD_SECOND_CARD_AT && state.up < 2) state.up = 2;
		}
	}
});

export const OPEN_CARD_GAMES = Object.freeze([openCard, oneHidden, stud]);
