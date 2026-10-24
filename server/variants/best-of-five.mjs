import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { compareVectors, validateCards } from './hand-utils.mjs';

const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);

/** Three cards play: the first three in hand. A blind player who never discards plays these too. */
const played = (cards) => {
	if (!Array.isArray(cards) || cards.length < 3 || cards.length > 5)
		throw new Error('Best of Five hands hold three to five cards');
	validateCards(cards, cards.length);
	return cards.slice(0, 3);
};

export const bestOfFive = Object.freeze({
	id: 'best-of-five',
	version: 1,
	rulesVersion: 'best-of-five-1',
	name: 'Best of Five',
	description: 'Get five, throw two. Your best three cards play under Classic ranking.',
	cardsPerPlayer: 5,
	discardTo: 3,
	played,
	evaluateHand: (cards) => evaluateClassic(played(cards)),
	compareHands: (left, right) =>
		compareVectors(evaluateClassic(played(left)), evaluateClassic(played(right))),
	getRules: () =>
		Object.freeze({
			cardsPerPlayer: 5,
			keep: 3,
			blindPlayers: 'A player who never looks plays their first three cards.',
			rankingOrder: CLASSIC_ORDER,
			suitsBreakTies: false
		})
});
