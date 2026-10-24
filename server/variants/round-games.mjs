import { evaluateHand, compareHands } from '../classic.mjs';

/**
 * Games with their own rhythm. The engine counts laps (one bet from each player still in) and
 * acts on the flags: `lap: { double, keep }` doubles the stake and knocks out the lowest hand
 * while more than `keep` players remain; `noShow` removes the Show; `banker` + `bankoAt` give
 * the dealer the ties and a showdown of everyone against them.
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
const lapState = () => ({ state: { bets: 0, laps: 0, out: [] }, cardsConsumed: 0 });

export const knockout = Object.freeze({
	...base,
	id: 'knockout',
	version: 1,
	rulesVersion: 'knockout-1',
	name: 'Knockout',
	description:
		'After every lap of betting the lowest hand is knocked out and shown, until two players are left.',
	prepareHand: lapState,
	lap: Object.freeze({ keep: 2 }),
	getRules: () =>
		rules({
			knockout:
				'After every lap of bets (one from each player still in) the lowest hand is knocked out and its cards are shown. Equal lowest hands are knocked out together, unless that would leave fewer than two players. With two left, play on to a Show.'
		})
});

export const suddenDeath = Object.freeze({
	...base,
	id: 'sudden-death',
	version: 1,
	rulesVersion: 'sudden-death-1',
	name: 'Sudden Death',
	description:
		'The stake doubles every lap and the lowest hand is knocked out, so hands end fast.',
	prepareHand: lapState,
	lap: Object.freeze({ double: true, keep: 2 }),
	getRules: () =>
		rules({
			suddenDeath:
				'After every lap of bets the stake doubles and the lowest hand is knocked out and shown. With two players left, play on to a Show at the higher stakes.'
		})
});

export const survivor = Object.freeze({
	...base,
	id: 'survivor',
	version: 1,
	rulesVersion: 'survivor-1',
	name: 'Survivor',
	description:
		'No Show. After every lap of betting the lowest hand is knocked out, until one player remains.',
	prepareHand: lapState,
	noShow: true,
	lap: Object.freeze({ keep: 1 }),
	getRules: () =>
		rules({
			survivor:
				'There is no Show. After every lap of bets the lowest hand is knocked out and shown. Equal hands stay in. The last player left takes the pot.'
		})
});

/** Pot size, in boots, at which everyone shows against the banker. */
export const BANKO_BOOTS = 20;

export const banko = Object.freeze({
	...base,
	id: 'banko',
	version: 1,
	rulesVersion: 'banko-1',
	name: 'Banko',
	description:
		'The dealer is the banker. Equal hands go to the banker, and a big pot sends everyone against the banker.',
	banker: true,
	prepareHand: () => ({ state: {}, cardsConsumed: 0 }),
	bankoAt: BANKO_BOOTS,
	getRules: () =>
		rules({
			banko: `The dealer is the banker. At a Show, equal hands go to the banker. When the pot reaches ${BANKO_BOOTS} boots with three or more players in and the banker among them, everyone shows: players who beat the banker split the pot, otherwise the banker takes it.`
		})
});

export const ROUND_GAMES = Object.freeze([knockout, suddenDeath, survivor, banko]);
