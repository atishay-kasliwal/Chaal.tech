import { evaluateHand, compareHands } from '../classic.mjs';

/**
 * Games that change how a hand is settled. The engine owns the money; each variant switches on
 * a flag: `declareShow` (High Low), `splitAt` (Split Pot, in boots) and `faceoff` (Faceoff).
 */
const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);
const base = { evaluateHand, compareHands };
const rules = (extra) =>
	Object.freeze({ rankingOrder: CLASSIC_ORDER, suitsBreakTies: false, ...extra });

export const highLow = Object.freeze({
	...base,
	id: 'high-low',
	version: 1,
	rulesVersion: 'high-low-1',
	name: 'High Low',
	description: 'Whoever asks for the Show says whether the high or the low hand wins.',
	declareShow: true,
	getRules: () =>
		rules({
			show: 'The player who asks for the Show first says "high" or "low". High: the better hand wins. Low: the weaker hand wins. Equal hands lose for the player who asked.'
		})
});

/** Pot size, in boots, at which three or more players must show and split. */
export const SPLIT_POT_BOOTS = 20;

export const splitPot = Object.freeze({
	...base,
	id: 'split-pot',
	version: 1,
	rulesVersion: 'split-pot-1',
	name: 'Split Pot',
	description:
		'When three or more players are in and the pot grows large, all show: best hand takes half, worst hand the other half.',
	splitAt: SPLIT_POT_BOOTS,
	getRules: () =>
		rules({
			splitPot: `When the pot reaches ${SPLIT_POT_BOOTS} boots with three or more players still in, everyone shows. The best hand takes half the pot and the worst hand takes the other half. With two players left it is a normal Show.`
		})
});

export const faceoff = Object.freeze({
	...base,
	id: 'faceoff',
	version: 1,
	rulesVersion: 'faceoff-1',
	name: 'Faceoff',
	description:
		'On your turn, challenge any one player: both hands are shown and the loser is out.',
	faceoff: true,
	prepareHand: () => ({ state: { faceoffs: [] }, cardsConsumed: 0 }),
	getRules: () =>
		rules({
			faceoff:
				'On your turn, pay the Show fee and challenge one player. Both hands are shown and the weaker one packs. Equal hands go against the challenger. The hand carries on.'
		})
});

export const SHOWDOWN_GAMES = Object.freeze([highLow, splitPot, faceoff]);
