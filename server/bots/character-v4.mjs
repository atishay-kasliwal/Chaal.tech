import { characterPolicy, TRAITS, MOODS } from './character-v3.mjs';
import { confidence, PRIORS } from './mind.mjs';
import { DNA_POLICY_V4 } from './dna-policies.mjs';

/**
 * Policy tp-character@4 (BOT_BRAIN.md §29, Phase 3 candidate): the tp-character@3 graph with three
 * rule changes found by the Phase 3 investigations. No published style uses it until a reviewer
 * approves a Phase 3 candidate; tp-character@3 is unchanged.
 *
 * 1. Blind preference never makes packing unseen cards more attractive than looking. In @3 it
 *    discouraged looking but not packing, so a blind-loving style facing an expensive blind raise
 *    sometimes packed instead of looking (the adaptive style against maniacs, Phase 3 study).
 * 2. Pressure is weighted by how much a bettor's aggression means. A player who bets after looking
 *    counts less when this bot believes they raise far more than most (their bets carry less
 *    information), in proportion to adaptability and confidence: an adaptive style learns maniacs.
 * 3. Moods act on the decisions a style actually makes:
 *    - frustration makes a style more like itself: it amplifies the personality (a curious caller
 *      calls more, a patient rock releases more, an aggressive player raises more) instead of
 *      pushing everyone toward raising;
 *    - suspicion lifts calls and shows whenever seen players are pushing, not only facing a raise.
 *
 * Its mind (server/bots/mind.mjs, mind@2) also forgets faster for adaptable styles and makes a
 * suspicious style more suspicious after being bluffed.
 */
export const CHARACTER_POLICY_V4 = DNA_POLICY_V4;

const clamp01 = (x) => Math.min(1, Math.max(0, x));

const TRAITS_V4 = {
	...TRAITS,
	blindPreference: (sit, x) =>
		sit.seen ? null : { see: -1.4 * x, chaal: 0.15 * x, ...(x > 0 ? { pack: -1.4 * x } : {}) }
};

const MOODS_V4 = {
	...MOODS,
	// Frustration acts through amplify() below.
	frustration: () => null,
	suspicion: (sit, dev, m) =>
		sit.seen && (m.facing || m.pressure > 0) ? { chaal: 0.3 * dev, show: 0.25 * dev } : null
};

/** Seen players still in who bet after looking, each weighted by how informative their bets are. */
function weightedPressure(c, hand, alive, about) {
	const adapt = c.style.tendencies.dna.adaptability ?? 0.5;
	let pressure = 0;
	for (const id of hand.seenBettors) {
		if (id === c.botId || !alive.has(id)) continue;
		const b = about(id)?.beliefs.aggression;
		const loose = b
			? confidence(b.n) * clamp01((b.p - PRIORS.aggression) / (1 - PRIORS.aggression))
			: 0;
		pressure += 1 - 0.8 * adapt * loose;
	}
	return Math.round(pressure * 1000) / 1000;
}

/** Frustration (seen decisions): the personality's own pull, amplified by how frustrated. */
function amplify(c) {
	const dev = c.moodDev.frustration;
	if (!c.sit.seen || dev < 0.02) return;
	const persona = {};
	for (const { f, d } of c.extra)
		if (f.startsWith('dna.'))
			for (const [a, v] of Object.entries(d)) persona[a] = (persona[a] ?? 0) + v;
	const k = 1.5 * dev;
	const d = Object.fromEntries(Object.entries(persona).map(([a, v]) => [a, v * k]));
	if (Object.values(d).some((v) => Math.abs(v) > 1e-6))
		c.extra.push({ f: 'state.frustration', d, sign: 1 });
}

const V4 = characterPolicy(
	CHARACTER_POLICY_V4,
	Object.freeze({ traits: TRAITS_V4, moods: MOODS_V4, pressure: weightedPressure, amplify })
);
export const CHARACTER_GRAPH_V4 = V4.graph;
export const decideCharacterV4 = V4.decide;
