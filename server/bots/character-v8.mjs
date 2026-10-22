import { characterPolicy, TRAITS, MOODS, countPressure } from './character-v3.mjs';
import { DNA_POLICY_V8, DNA_POLICY_V9 } from './dna-policies.mjs';

/**
 * Policies tp-dna@8 (C1) and tp-dna@9 (C2) (Phase 4.1 challengers, offline only): tp-dna@3 exactly, plus one base factor for
 * repeated BLIND raises, and nothing for seen aggression.
 *
 * Phase 4 found that four players who raise every blind bet beat Dhoni (he keeps paying an escalating
 * stake on unseen cards), and that the first fix (look more as the blind stake grows, whoever raised
 * it) broke against a tight player who later bluffs: seen bluff-raises also grow the stake, so he looked
 * early and then folded seen hands to the bluffs. The difference this factor keeps:
 *  - a raise by a player who is still blind says nothing about their cards: it is pure cost escalation,
 *    so it is a reason to find out what you hold before paying more;
 *  - a raise after looking is evidence about cards, already weighed by the reads (and Dhoni's suspicion
 *    of bluffers); it adds nothing here.
 * Only opponents still in the hand who raised while blind count (from this bot's own observations).
 */
export const CHARACTER_POLICY_V8 = DNA_POLICY_V8;

/** Opponents still in this hand who have raised only while blind. */
function blindRaisers(sit, c) {
	const hand = c.mind?.hand;
	if (!hand || hand.id !== c.view.handId || hand.over) return 0;
	const alive = new Set(sit.opponents.map((u) => u.id));
	return hand.raisers.filter((id) => alive.has(id) && !hand.seenRaisers.includes(id)).length;
}

/** C1: from the second distinct blind raiser on, +0.2 to look for each (at most +0.6). */
export function repeatedBlindRaises(sit, cands, c) {
	if (sit.seen || !cands.includes('see')) return [];
	const n = blindRaisers(sit, c);
	return n >= 2 ? [{ f: 'base.blind-raises', d: { see: Math.min(0.6, 0.2 * (n - 1)) } }] : [];
}

/** C2: every blind raiser, weighted by what staying blind now costs (stake over four boots). */
export function blindRaiseCost(sit, cands, c) {
	if (sit.seen || !cands.includes('see')) return [];
	const n = blindRaisers(sit, c);
	if (!n) return [];
	const price = Math.min(1, sit.cost / (4 * sit.boot));
	return [{ f: 'base.blind-raises', d: { see: Math.min(0.6, 0.15 * n * price) } }];
}

const rules = (base) =>
	Object.freeze({ traits: TRAITS, moods: MOODS, pressure: countPressure, base });
const C1 = characterPolicy(CHARACTER_POLICY_V8, rules(repeatedBlindRaises));
export const decideCharacterV8 = C1.decide;
export const CHARACTER_POLICY_V9 = DNA_POLICY_V9;
const C2 = characterPolicy(CHARACTER_POLICY_V9, rules(blindRaiseCost));
export const decideCharacterV9 = C2.decide;
