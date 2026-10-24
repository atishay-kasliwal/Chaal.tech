import { classic } from './classic.mjs';
import { muflis } from './muflis.mjs';
import { ak47 } from './ak47.mjs';
import { joker } from './joker.mjs';
import { lowestJoker } from './lowest-joker.mjs';
import { nineNineNine } from './nine-nine-nine.mjs';
import { twoCard } from './two-card.mjs';
import { fourCard } from './four-card.mjs';
import { highestJoker } from './highest-joker.mjs';
import { oneEyedJack } from './one-eyed-jack.mjs';
import { colorJoker } from './color-joker.mjs';
import { lallanKallan } from './lallan-kallan.mjs';
import { oddEven } from './odd-even.mjs';
import { bestOfFive } from './best-of-five.mjs';
import { worstOfFour } from './worst-of-four.mjs';
import { hukum } from './hukum.mjs';
import { redBlack } from './red-black.mjs';
import { progressiveJoker } from './progressive-joker.mjs';
import { potBlind } from './pot-blind.mjs';
import { discardOne } from './discard-one.mjs';
import { FOUR_CARD_VARIANTS, foldingJoker } from './four-discard.mjs';
import { drawTeenPatti } from './draw.mjs';
import { ROUND_GAMES } from './round-games.mjs';
import { JOKER_BUY_GAMES, LEGACY_JOKER_BUY_GAMES } from './joker-buy-games.mjs';
import { community } from './community.mjs';
import { SWAP_GAMES } from './swap-games.mjs';
import { SHOWDOWN_GAMES } from './showdown-games.mjs';
import { OPEN_CARD_GAMES } from './open-cards.mjs';
import { TABLE_GAMES } from './table-games.mjs';

/**
 * Current variant boundary:
 * id, version, rulesVersion, name, description;
 * optional cardsPerPlayer (defaults to three);
 * evaluateHand(cards, publicHandState?) -> rank vector;
 * compareHands(leftCards, rightCards, publicHandState?) -> -1 | 0 | 1;
 * optional prepareHand({ remainingDeck }) -> public state and consumed cards;
 * optional wildIndexes(cards, publicHandState?) -> indexes of this hand's wild cards;
 * optional allowSee: false keeps every player blind until the Show;
 * optional discardTo: after looking, players throw cards away down to this many;
	* optional onDiscard(state, { card }): publish a discarded card's variant effect;
 * optional openCount(state) -> how many of a player's first cards lie face up for everyone;
 * optional lap / noShow / banker / bankoAt (round-games.mjs) and { pays } returned by tableAction or afterPack (joker-buy-games.mjs);
 * optional declareShow / splitAt / faceoff / afterPack(state, { players }) (see swap-games.mjs, showdown-games.mjs);
 * optional table hooks for cards on the table and per-player jokers (see table-games.mjs);
 * getRules() -> immutable hand-ranking description.
 *
 * Variants receive cards only. Rooms, money, dealing, turn/tie policy, networking,
 * persistence and media remain outside this boundary. Add hooks when needed.
 */
const variants = Object.freeze([
	classic,
	muflis,
	ak47,
	joker,
	lowestJoker,
	nineNineNine,
	twoCard,
	fourCard,
	highestJoker,
	oneEyedJack,
	colorJoker,
	lallanKallan,
	oddEven,
	bestOfFive,
	worstOfFour,
	hukum,
	redBlack,
	progressiveJoker,
	potBlind,
	discardOne,
	...FOUR_CARD_VARIANTS,
	...OPEN_CARD_GAMES,
	drawTeenPatti,
	...SWAP_GAMES,
	...SHOWDOWN_GAMES,
	...JOKER_BUY_GAMES,
	...ROUND_GAMES,
	community,
	...TABLE_GAMES
]);
// Keep original Folding Joker, Buying Joker and Auction readable for saved hands and immutable replay corpora.
const registry = new Map(
	[...variants, foldingJoker, ...LEGACY_JOKER_BUY_GAMES].map((variant) => [variant.rulesVersion, variant])
);
export const DEFAULT_RULES_VERSION = classic.rulesVersion;

// An unknown saved version never silently falls back to Classic.
export function getVariant(rulesVersion) {
	return registry.get(rulesVersion);
}

export function listVariants() {
	return variants;
}
