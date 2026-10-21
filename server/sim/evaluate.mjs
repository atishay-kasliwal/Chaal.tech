import { stream } from './seeds.mjs';
import { metrics } from './fingerprint.mjs';
import { addSummaries, addCounters } from './summary.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { ARCHETYPE_IDS } from './archetypes.mjs';

/**
 * Phase 3 evaluation (BOT_BRAIN.md §29): who sits at the table, matched comparison of a candidate
 * with its ancestor, and the measurements the target bands are judged on.
 */

/**
 * The population: every published character version (Phase 2 current, Phase 1.1, Phase 1), the
 * legacy bots, the sim baselines and the human archetypes, plus candidates under evaluation passed
 * in by the caller. Weights make the current characters and the human archetypes the most common
 * opponents, while older versions stay present so a candidate cannot fit only the latest ones.
 */
export const POOL = Object.freeze([
	...CHARACTER_IDS.flatMap((c) => [
		{ id: `${c}@3`, character: c, w: 3 },
		{ id: `${c}@2`, character: c, w: 1 },
		{ id: `${c}@1`, character: c, w: 0.5 }
	]),
	...['legacy-easy', 'legacy-normal', 'legacy-hard'].map((id) => ({ id, w: 1.5 })),
	{ id: 'baseline-rock', w: 1 },
	{ id: 'baseline-station', w: 1 },
	{ id: 'baseline-aggressive', w: 1 },
	{ id: 'baseline-random', w: 0.5 },
	...ARCHETYPE_IDS.map((id) => ({ id, w: 1.5 }))
]);

/**
 * Four opponents for a hero of `character` at table t: weighted, without replacement, never the
 * hero's own character (any version) and at most one version of any other character. Depends only
 * on (seed, label, t, character), so a candidate and its ancestor meet exactly the same tables.
 * `extra` adds members (e.g. other characters' current candidates) to the pool.
 */
export function opponents(seed, label, t, character, extra = []) {
	const random = stream(seed, 'population', label, t).random;
	const pool = [...POOL, ...extra].filter((m) => m.character !== character);
	const out = [];
	const used = new Set();
	while (out.length < 4) {
		const open = pool.filter((m) => !out.includes(m) && !(m.character && used.has(m.character)));
		const total = open.reduce((s, m) => s + m.w, 0);
		let r = random() * total;
		const m = open.find((x) => (r -= x.w) < 0) ?? open.at(-1);
		out.push(m);
		if (m.character) used.add(m.character);
	}
	return out.map((m) => m.member ?? m.id);
}

/** Seats for a hero at table t: the hero's seat rotates with t, the opponents fill the rest. */
export function seatsFor(hero, field, t) {
	const seats = field.slice();
	const heroSeat = t % 5;
	seats.splice(heroSeat, 0, hero);
	return { seats, heroSeat };
}

/** Opponent types for the adaptation study (one type in all four other seats). */
export const ADAPT_TYPES = Object.freeze([
	'human-very-conservative',
	'human-station',
	'human-maniac',
	'human-bluffer',
	'human-switch',
	'human-drift'
]);

/* ------------------------------------------ measuring ------------------------------------------ */

/** Sum seat summaries (any number of tables) for one hero. */
export const combine = (summaries) => summaries.reduce((a, b) => addSummaries(a, b), null);

const minus = (a, b) => (a == null || b == null ? null : a - b);

/**
 * Flat measurements from a combined summary: the fingerprint, decision quality, and how behaviour
 * changes after events. `adapt` (optional) maps an opponent type to that type's combined summary.
 */
export function measure(s, adapt = null) {
	const m = metrics(s.total);
	const after = Object.fromEntries(
		Object.entries(s.after).map(([e, t]) => [e, t ? metrics(t) : null])
	);
	const base = after.base;
	const weakCalls = (s.total.weakContinue ?? 0) - (s.total.weakRaise ?? 0);
	const graded = (s.total.strongN ?? 0) + (s.total.monsterN ?? 0) + (s.total.weakN ?? 0);
	const out = {
		hands: s.hands,
		bootsPer100: m.bootsPer100,
		blindRounds: m.blindRounds,
		blindRaiseRate: m.blindRaiseRate,
		lookAtOnce: m.lookTiming[0],
		neverLooked: m.lookTiming[4],
		seenRaiseRate: m.seenRaiseRate,
		aggression: m.aggression,
		chaalRate: m.chaalRate,
		packRate: m.packRate,
		showRate: m.showRate,
		stayAfterSeeing: m.stayAfterSeeing,
		seenFoldToRaise: m.seenFoldToRaise,
		blindFoldToRaise: m.blindFoldToRaise,
		seeUnderPressure: m.seeUnderPressure,
		continueWeak: m.continueByStrength[0],
		continueMid: m.continueByStrength[1],
		continueBorder: m.continueByStrength[2],
		thinRaise: m.thinRaise,
		valueRaise: m.valueRaise,
		entropy: m.entropy,
		strongPackRate: m.strongPackRate,
		weakCallRate: s.total.weakN ? weakCalls / s.total.weakN : null,
		weakRaiseRate: m.weakRaiseRate,
		monsterNoRaiseRate: m.monsterNoRaiseRate,
		bigOverrideRate: m.bigOverrideRate,
		// Bad actions: strong hands packed, monsters not raised, very weak hands called (a very weak
		// raise is a bluff, judged as personality, not counted here).
		badActionRate: graded
			? ((s.total.strongPack ?? 0) + (s.total.monsterNoRaise ?? 0) + weakCalls) / graded
			: null,
		stateOverrideRate: m.stateOverrideRate,
		memoryOverrideRate: m.memoryOverrideRate,
		// After events (the next 3 hands) minus hands with no event in the previous 3.
		lossAggressionDelta: minus(after.bigLoss?.aggression, base?.aggression),
		lossSeenRaiseDelta: minus(after.bigLoss?.seenRaiseRate, base?.seenRaiseRate),
		lossPackDelta: minus(after.bigLoss?.seenPackRate, base?.seenPackRate),
		winSeenRaiseDelta: minus(after.bigWin?.seenRaiseRate, base?.seenRaiseRate),
		blindWinBlindRaiseDelta: minus(after.blindWin?.blindRaiseRate, base?.blindRaiseRate),
		blindWinBlindRoundsDelta: minus(after.blindWin?.blindRounds, base?.blindRounds),
		caughtBluffFoldDelta: minus(after.caughtBluff?.seenFoldToRaise, base?.seenFoldToRaise),
		caughtBluffPackDelta: minus(after.caughtBluff?.seenPackRate, base?.seenPackRate),
		bluffedOffFoldDelta: minus(after.bluffedOff?.seenFoldToRaise, base?.seenFoldToRaise),
		pressuredPackDelta: minus(after.pressured?.seenPackRate, base?.seenPackRate),
		events: s.events
	};
	if (adapt) {
		Object.assign(out, adaptation(adapt));
		// Folding to a maniac's raises vs folding to raises in general: below zero means the
		// maniac's aggression is (rightly) taken as less informative.
		out.callIndex = minus(out.seenFoldToRaise, out.foldVsManiacLate);
	}
	return out;
}

/** Reactions to events that a stateless policy also shows (a big loss leaves anyone short). */
export const EVENT_KEYS = Object.freeze([
	'lossAggressionDelta',
	'lossSeenRaiseDelta',
	'lossPackDelta',
	'winSeenRaiseDelta',
	'blindWinBlindRaiseDelta',
	'blindWinBlindRoundsDelta',
	'caughtBluffFoldDelta',
	'caughtBluffPackDelta',
	'bluffedOffFoldDelta',
	'pressuredPackDelta'
]);

/**
 * Add `<key>X` = the reaction beyond the same character's stateless version (@2) on the same
 * tables: what the mind adds, with table context removed.
 */
export function withReference(m, ref) {
	const out = { ...m };
	for (const k of EVENT_KEYS) out[`${k}X`] = minus(m[k], ref?.[k]);
	return out;
}

/** Early (hands 1 to 50) vs late (101 to 200) against each opponent type, and exploitation indexes. */
export function adaptation(byType) {
	const early = (s) => metrics(addCounters(s.phases[0], s.phases[1]));
	const late = (s) => metrics(addCounters(s.phases[3], s.phases[4]));
	const at = (type, when, k) => (byType[type] ? when(byType[type])[k] : null);
	const rock = 'human-very-conservative';
	const station = 'human-station';
	const maniac = 'human-maniac';
	return {
		bluffVsFolderEarly: at(rock, early, 'thinRaise'),
		bluffVsFolderLate: at(rock, late, 'thinRaise'),
		bluffVsCallerEarly: at(station, early, 'thinRaise'),
		bluffVsCallerLate: at(station, late, 'thinRaise'),
		valueVsCallerEarly: at(station, early, 'valueRaise'),
		valueVsCallerLate: at(station, late, 'valueRaise'),
		foldVsManiacEarly: at(maniac, early, 'seenFoldToRaise'),
		foldVsManiacLate: at(maniac, late, 'seenFoldToRaise'),
		foldVsFolderLate: at(rock, late, 'seenFoldToRaise'),
		// Exploitation: bluff folders more than callers; fold to a maniac less than to a rock.
		bluffIndex: minus(at(rock, late, 'thinRaise'), at(station, late, 'thinRaise')),
		bluffGrowth: minus(at(rock, late, 'thinRaise'), at(rock, early, 'thinRaise')),
		blindFoldVsManiacLate: at(maniac, late, 'blindFoldToRaise'),
		valueGrowthVsCaller: minus(at(station, late, 'valueRaise'), at(station, early, 'valueRaise')),
		bootsByType: Object.fromEntries(
			Object.entries(byType).map(([t, s]) => [
				t,
				{ early: early(s).bootsPer100, late: late(s).bootsPer100 }
			])
		)
	};
}

/** Mean and 95% interval over per-table values. */
export function ci(xs) {
	const n = xs.length;
	const mean = xs.reduce((s, x) => s + x, 0) / Math.max(n, 1);
	const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(n - 1, 1));
	return { mean, ci: (1.96 * sd) / Math.sqrt(Math.max(n, 1)), n };
}
