import { characterPolicy, TRAITS, MOODS, countPressure } from './character-v3.mjs';
import { DNA_POLICY_V7 } from './dna-policies.mjs';

/**
 * Policy tp-dna@7 (Phase 4 challenger, offline only): tp-dna@3 exactly, plus one base-brain factor.
 *
 * The Phase 4 exploit search found that four players who raise every blind bet beat Dhoni badly,
 * and the diagnostic showed why: he stays blind into the escalating stake (0.92 blind bets a hand,
 * against 0.53 for a neutral player). tp-dna@3 counts pressure to look only from players who bet
 * after looking, so blind raisers add none. This factor makes looking more attractive as the blind
 * stake climbs past the opening chaal, the same for every character; personality (blindPreference,
 * Rohit's blind pride) still pulls the other way, bounded as before.
 */
export const CHARACTER_POLICY_V7 = DNA_POLICY_V7;

/** Look: +0.25 per doubling of the blind stake beyond two boots, at most +0.6. */
export function blindCost(sit, cands) {
	if (sit.seen || !cands.includes('see')) return [];
	const doublings = Math.log2(Math.max(sit.cost, 1) / (2 * sit.boot));
	if (doublings <= 0) return [];
	return [{ f: 'base.blind-cost', d: { see: Math.min(0.6, 0.25 * doublings) } }];
}

export const RULES_V7 = Object.freeze({
	traits: TRAITS,
	moods: MOODS,
	pressure: countPressure,
	base: blindCost
});
const V7 = characterPolicy(CHARACTER_POLICY_V7, RULES_V7);
export const CHARACTER_GRAPH_V7 = V7.graph;
export const decideCharacterV7 = V7.decide;
