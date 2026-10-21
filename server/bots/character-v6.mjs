import { characterPolicy, TRAITS, MOODS, countPressure } from './character-v3.mjs';
import { recallEvents } from './character-v5.mjs';
import { QUIRKS_V6 } from './quirks.mjs';
import { DNA_POLICY_V6 } from './dna-policies.mjs';

/**
 * Policy tp-dna@6 (Phase 4 challengers, offline only): tp-dna@3 exactly, the champions' policy,
 * plus memory of events and the quirks that read it. Nothing else changes, so a challenger on it
 * differs from its tp-dna@3 champion only in its event-driven reactions (a surgical challenger).
 * A style that lists none of the event quirks decides exactly as on tp-dna@3
 * (tests/server/bot-phase4.test.mjs).
 *
 * Recall adds, beside tp-dna@5's own recent events (`m.events`), `m.suspect`: for each opponent, how
 * fresh this bot's evidence is that they bluff (mind@4 keeps the hand of the last catch and of the
 * last time they bluffed it off a pot). 1 in the hand after, fading to 0 over eight hands; 0.7 for
 * being bluffed off; a second catch this session adds a quarter (at most 1.5).
 */
export const CHARACTER_POLICY_V6 = DNA_POLICY_V6;

export const SUSPECT_FADE = 8;
const fresh = (mind, at) => {
	if (!Number.isInteger(at)) return 0;
	const age = mind.hands - at - 1;
	return age >= 0 && age < SUSPECT_FADE ? 1 - age / SUSPECT_FADE : 0;
};

export function recallSuspects(c, mind) {
	const suspect = {};
	for (const [id, s] of Object.entries(mind?.others ?? {})) {
		const w = Math.max(fresh(mind, s.recent.caughtAt), 0.7 * fresh(mind, s.recent.bluffedAt));
		if (w > 0)
			suspect[id] = Math.min(
				1.5,
				w * (1 + 0.25 * Math.min(2, Math.max(0, s.recent.caughtBluffing - 1)))
			);
	}
	return { ...recallEvents(c, mind), suspect };
}

export const RULES_V6 = Object.freeze({
	traits: TRAITS,
	moods: MOODS,
	pressure: countPressure,
	quirks: QUIRKS_V6,
	recall: recallSuspects
});
const V6 = characterPolicy(CHARACTER_POLICY_V6, RULES_V6);
export const CHARACTER_GRAPH_V6 = V6.graph;
export const decideCharacterV6 = V6.decide;
