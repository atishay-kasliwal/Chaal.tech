import { classic } from './classic.mjs';
import { muflis } from './muflis.mjs';
import { ak47 } from './ak47.mjs';
import { joker } from './joker.mjs';
import { lowestJoker } from './lowest-joker.mjs';
import { nineNineNine } from './nine-nine-nine.mjs';
import { twoCard } from './two-card.mjs';
import { fourCard } from './four-card.mjs';

/**
 * Current variant boundary:
 * id, version, rulesVersion, name, description;
 * optional cardsPerPlayer (defaults to three);
 * evaluateHand(cards, publicHandState?) -> rank vector;
 * compareHands(leftCards, rightCards, publicHandState?) -> -1 | 0 | 1;
 * optional prepareHand({ remainingDeck }) -> public state and consumed cards;
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
	fourCard
]);
const registry = new Map(variants.map((variant) => [variant.rulesVersion, variant]));
export const DEFAULT_RULES_VERSION = classic.rulesVersion;

// An unknown saved version never silently falls back to Classic.
export function getVariant(rulesVersion) {
	return registry.get(rulesVersion);
}

export function listVariants() {
	return variants;
}
