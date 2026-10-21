import { strength } from '../bots/brain.mjs';
import { wrap, has } from './baselines.mjs';
import { CHARACTER_POLICY_V4 } from '../bots/character-v4.mjs';

/**
 * Synthetic human archetypes (BOT_BRAIN.md §29, Phase 3): opponents that play like kinds of
 * people, for population play and matchup matrices. Simulation only, never seated in a room.
 *
 * Most are simple rules on the shared base brain with some randomness (people are not
 * deterministic). Two are competent players on the character policy with neutral DNA, so the
 * characters also meet opponents who think the way they do. `stack` (in boots) overrides the
 * starting stack for the short-stacked and the rich; automatic rebuys still top up anyone broke.
 *
 * Each archetype states what it should look like; scripts/sim/phase3.mjs measures every one and
 * reports whether it does (validation).
 */

const pick = (cands, ...names) => names.find((n) => has(cands, n)) ?? cands[0];
const pressure = (sit) => sit.seenBetters > 0;
/** Look after `rounds` blind bets (with some spread); until then bet blind, raising with `raise`. */
function blind(sit, cands, random, { rounds, raise = 0 }) {
	if (has(cands, 'see') && sit.rounds >= rounds + (random() < 0.3 ? 1 : 0))
		return { name: 'see', reason: 'look' };
	if (random() < raise && has(cands, 'raise')) return { name: 'raise', reason: 'blind-raise' };
	return { name: pick(cands, 'chaal', 'see', 'pack'), reason: 'blind' };
}
/** Seen play by thresholds on strength against the field; bluff raises with weak hands. */
function seen(sit, cands, random, { call, raise, show = 0.6, bluff = 0, fold = 0, folds = 1 }) {
	const s = strength(sit, random).multi;
	if (has(cands, 'show') && s >= show) return { name: 'show', reason: 'show' };
	if (s >= raise && has(cands, 'raise')) return { name: 'raise', reason: 'value' };
	if (s < call && random() < bluff && has(cands, 'raise'))
		return { name: 'raise', reason: 'bluff' };
	if (pressure(sit) && s < fold && random() < folds) return { name: 'pack', reason: 'respect' };
	if (s >= call && has(cands, 'chaal')) return { name: 'chaal', reason: 'call' };
	return { name: has(cands, 'pack') ? 'pack' : cands[0], reason: 'weak' };
}
/** Hand number from a simulated hand id (`s<table>-<hand>`): scenario archetypes only. */
const handIndex = (sit) => Number(String(sit.view.handId ?? '').split('-')[1] ?? 0);
const avgOthers = (sit) => {
	const others = sit.view.usersList.filter((u) => u.id !== sit.me.id && u.balance != null);
	return others.reduce((s, u) => s + u.balance, 0) / Math.max(others.length, 1);
};

const RULES = {
	/** Looks at once, calls too much, rarely raises, gives up to pressure, makes random mistakes. */
	'human-beginner': {
		expect: 'looks early, calls a lot, rarely raises, folds to pressure, noisy',
		rule: (sit, cands, random) => {
			if (random() < 0.12)
				return { name: cands[Math.floor(random() * cands.length)], reason: 'mistake' };
			if (!sit.seen) return blind(sit, cands, random, { rounds: 0 });
			return seen(sit, cands, random, {
				call: 0.15,
				raise: 0.85,
				show: 0.4,
				fold: 0.5,
				folds: 0.6
			});
		}
	},
	'human-conservative': {
		expect: 'looks within a round, continues with decent hands, raises good ones, respects raises',
		rule: (sit, cands, random) => {
			if (!sit.seen) return blind(sit, cands, random, { rounds: 1 });
			return seen(sit, cands, random, { call: 0.42, raise: 0.8, show: 0.6, fold: 0.6, folds: 0.8 });
		}
	},
	'human-very-conservative': {
		expect: 'looks at once, plays only strong hands, folds to almost any raise',
		rule: (sit, cands, random) => {
			if (!sit.seen) return blind(sit, cands, random, { rounds: 0 });
			return seen(sit, cands, random, {
				call: 0.6,
				raise: 0.88,
				show: 0.7,
				fold: 0.78,
				folds: 0.95
			});
		}
	},
	'human-aggressive': {
		expect: 'some blind raising, raises medium hands, some bluffs, rarely folds to pressure',
		rule: (sit, cands, random) => {
			if (!sit.seen) return blind(sit, cands, random, { rounds: 1, raise: 0.35 });
			return seen(sit, cands, random, { call: 0.25, raise: 0.45, show: 0.65, bluff: 0.15 });
		}
	},
	'human-maniac': {
		expect: 'raises blind for rounds, raises almost anything after looking',
		rule: (sit, cands, random) => {
			if (!sit.seen) return blind(sit, cands, random, { rounds: 2, raise: 0.8 });
			return seen(sit, cands, random, { call: 0.08, raise: 0.18, show: 0.75, bluff: 0.6 });
		}
	},
	'human-bluffer': {
		expect: 'ordinary values, bluff-raises weak hands often, gives up when raised back',
		rule: (sit, cands, random) => {
			if (!sit.seen) return blind(sit, cands, random, { rounds: 1, raise: 0.2 });
			return seen(sit, cands, random, {
				call: 0.35,
				raise: 0.7,
				show: 0.6,
				bluff: 0.4,
				fold: 0.5,
				folds: 0.9
			});
		}
	},
	'human-station': {
		expect: 'looks after a round, calls nearly everything, rarely raises, shows late',
		rule: (sit, cands, random) => {
			if (!sit.seen) return blind(sit, cands, random, { rounds: 1 });
			const s = strength(sit, random).multi;
			if (has(cands, 'show') && sit.rounds >= 4 && random() < 0.5)
				return { name: 'show', reason: 'curious' };
			if (s >= 0.9 && has(cands, 'raise') && random() < 0.5)
				return { name: 'raise', reason: 'monster' };
			if (s < 0.04 && random() < 0.5) return { name: pick(cands, 'pack'), reason: 'hopeless' };
			return { name: pick(cands, 'chaal', 'show', 'pack'), reason: 'call' };
		}
	},
	/** Each hand plays as one of the other rule archetypes, chosen at random. */
	'human-unpredictable': {
		expect: 'changes style from hand to hand: high variety, no stable pattern',
		rule: (sit, cands, random) => {
			const styles = [
				'human-beginner',
				'human-conservative',
				'human-aggressive',
				'human-maniac',
				'human-station'
			];
			// The style is fixed for the hand: derived from the public hand id, not the move's draw.
			let h = 0;
			for (const ch of `${sit.view.handId}:${sit.me.id}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
			return RULES[styles[h % styles.length]].rule(sit, cands, random);
		}
	},
	'human-short-desperate': {
		stack: 25,
		expect: 'when short against the table: shoves pressure with any half-decent hand',
		rule: (sit, cands, random) => {
			const short = sit.me.balance < 0.5 * avgOthers(sit);
			if (!sit.seen)
				return blind(sit, cands, random, { rounds: short ? 0 : 1, raise: short ? 0.3 : 0 });
			return short
				? seen(sit, cands, random, { call: 0.15, raise: 0.3, show: 0.45, bluff: 0.25 })
				: seen(sit, cands, random, { call: 0.4, raise: 0.8, fold: 0.55, folds: 0.7 });
		}
	},
	/** Scenario only (Dhoni adaptation study): very conservative for 100 hands, then a maniac. */
	'human-switch': {
		scenario: true,
		expect: 'very conservative for 100 hands, then a maniac',
		rule: (sit, cands, random) =>
			RULES[handIndex(sit) < 100 ? 'human-very-conservative' : 'human-maniac'].rule(
				sit,
				cands,
				random
			)
	},
	/** Scenario only: starts very tight and drifts to aggressive over 200 hands. */
	'human-drift': {
		scenario: true,
		expect: 'starts very conservative and becomes aggressive gradually',
		rule: (sit, cands, random) =>
			RULES[
				random() < Math.min(1, handIndex(sit) / 200)
					? 'human-aggressive'
					: 'human-very-conservative'
			].rule(sit, cands, random)
	},
	'human-rich-bully': {
		stack: 300,
		expect:
			'when much richer than the table: blind raises and raises medium hands to push people out',
		rule: (sit, cands, random) => {
			const rich = sit.me.balance > 1.5 * avgOthers(sit);
			if (!sit.seen)
				return blind(sit, cands, random, { rounds: rich ? 2 : 1, raise: rich ? 0.5 : 0.15 });
			return rich
				? seen(sit, cands, random, { call: 0.2, raise: 0.4, show: 0.7, bluff: 0.3 })
				: seen(sit, cands, random, { call: 0.35, raise: 0.7, bluff: 0.08 });
		}
	}
};

const neutral = (over = {}) => ({
	aggression: 0.5,
	blindAggression: 0.5,
	bluffAffinity: 0.5,
	blindPreference: 0.5,
	showPreference: 0.5,
	curiosity: 0.5,
	patience: 0.5,
	riskTolerance: 0.5,
	discipline: 0.6,
	lossSensitivity: 0.5,
	winElation: 0.5,
	pressureResistance: 0.5,
	ego: 0.5,
	moodRecovery: 0.5,
	revenge: 0.5,
	suspicion: 0.5,
	sociality: 0.5,
	adaptability: 0.5,
	memoryWeight: 0.5,
	...over
});
const policyStyle = (id, dna) =>
	Object.freeze({
		_id: id,
		policy: CHARACTER_POLICY_V4,
		tendencies: { dna, quirks: [], tempo: { thinkMs: [2000, 3000] } }
	});

/** Competent players on the character policy, no personality to speak of. */
export const ARCHETYPE_STYLES = Object.freeze({
	'human-balanced': policyStyle('human-balanced', neutral()),
	'human-expert': policyStyle(
		'human-expert',
		neutral({
			discipline: 0.85,
			patience: 0.6,
			bluffAffinity: 0.55,
			adaptability: 0.9,
			pressureResistance: 0.8
		})
	)
});

export const ARCHETYPES = Object.freeze({
	...Object.fromEntries(Object.entries(RULES).map(([id, a]) => [id, wrap(a.rule)])),
	...Object.fromEntries(Object.keys(ARCHETYPE_STYLES).map((id) => [id, null]))
});
/** Archetypes for population play (scenario-only ones excluded). */
export const ARCHETYPE_IDS = Object.freeze(
	Object.keys(ARCHETYPES).filter((id) => !RULES[id]?.scenario)
);
export const SCENARIO_IDS = Object.freeze(Object.keys(RULES).filter((id) => RULES[id].scenario));
export const ARCHETYPE_EXPECT = Object.freeze({
	...Object.fromEntries(Object.entries(RULES).map(([id, a]) => [id, a.expect])),
	'human-balanced': 'competent and balanced, no strong tendency, adapts a little',
	'human-expert': 'disciplined, selective, mixes bluffs, adapts to opponents'
});
export const ARCHETYPE_STACKS = Object.freeze(
	Object.fromEntries(
		Object.entries(RULES)
			.filter(([, a]) => a.stack)
			.map(([id, a]) => [id, a.stack])
	)
);
