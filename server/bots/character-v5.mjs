import { characterPolicy } from './character-v3.mjs';
import { RULES_V4 } from './character-v4.mjs';
import { QUIRKS_V5 } from './quirks.mjs';
import { DNA_POLICY_V5 } from './dna-policies.mjs';

/**
 * Policy tp-dna@5 (Phase 3.1, BOT_BRAIN.md): tp-dna@4 with two additions, and nothing else.
 *
 * 1. Recall of the bot's own recent events (mind@3 stamps each cue with its hand), as weights that
 *    are 1 in the hand right after the event and fade to 0 over four hands:
 *    - `bigLoss`: a big loss this session (or, at half weight, a run of three losses);
 *    - `caughtBluff`: this bot caught someone bluffing.
 * 2. The event quirks (quirks.mjs QUIRKS_V5) that read them: `stubbornStreak` and `onToYou`.
 *
 * A style that lists neither quirk decides exactly as on tp-dna@4 (tests/server/bot-phase31.test.mjs).
 */
export const CHARACTER_POLICY_V5 = DNA_POLICY_V5;

const FADE = 4;
const recency = (mind, cueName) => {
	let w = 0;
	for (const c of mind?.cues ?? [])
		if (c.cue === cueName && Number.isInteger(c.n)) {
			const age = mind.hands - c.n - 1;
			if (age >= 0 && age < FADE) w = Math.max(w, 1 - age / FADE);
		}
	return w;
};

export function recallEvents(c, mind) {
	const losingRun = (mind?.self?.streak ?? 0) <= -3 ? 0.5 : 0;
	return {
		self: mind?.self ?? null,
		events: {
			bigLoss: Math.max(recency(mind, 'BIG_LOSS'), losingRun),
			caughtBluff: recency(mind, 'CAUGHT_THEIR_BLUFF')
		}
	};
}

const V5 = characterPolicy(
	CHARACTER_POLICY_V5,
	Object.freeze({ ...RULES_V4, quirks: QUIRKS_V5, recall: recallEvents })
);
export const CHARACTER_GRAPH_V5 = V5.graph;
export const decideCharacterV5 = V5.decide;
