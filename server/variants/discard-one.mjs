import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { compareVectors, validateCards } from './hand-utils.mjs';

/**
 * Deal four. After looking, a player throws one card away and plays the other three.
 * A player who never looks plays their first three dealt cards.
 */
export function playedCards(cards) {
	if (!Array.isArray(cards) || (cards.length !== 3 && cards.length !== 4))
		throw new Error('Discard One hands hold three or four cards');
	const played = cards.slice(0, 3);
	validateCards(cards, cards.length);
	return played;
}

export function evaluateHand(cards) {
	return evaluateClassic(playedCards(cards));
}

export const discardOne = Object.freeze({
	id: 'discard-one',
	version: 1,
	rulesVersion: 'discard-one-1',
	name: 'Discard One',
	description: 'Get four cards. After you look, throw one away and play the best three.',
	cardsPerPlayer: 4,
	discardTo: 3,
	evaluateHand,
	compareHands: (left, right) => compareVectors(evaluateHand(left), evaluateHand(right)),
	getRules: () =>
		Object.freeze({
			cardsPerPlayer: 4,
			keep: 3,
			blindPlayers: 'A player who never looks plays their first three cards.',
			rankingOrder: Object.freeze([
				'trail',
				'pure-sequence',
				'sequence',
				'flush',
				'pair',
				'high-card'
			]),
			suitsBreakTies: false
		})
});
