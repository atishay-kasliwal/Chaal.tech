/**
 * Tuning loop: what the proposer is told about a character (docs/bots/TUNING_LOOP.md). The canonical
 * style, its identity bands, the allowed bounds, and the weaknesses the project has measured,
 * split into the ones that are the character (keep) and the ones worth tuning.
 *
 * Weaknesses come from docs/archive/bots/PHASE4_REPORT.md (sections 1 and 11, seed 44/45),
 * docs/archive/bots/PHASE41_REPORT.md and docs/ROADMAP.md. They are a summary for the proposer, not a
 * measurement: the loop measures the canonical style itself before proposing (the baseline node).
 */
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';
import { TARGETS } from '../../server/sim/targets.mjs';
import { SHORT } from '../../server/sim/league.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { boundsFor } from './bounds.mjs';

export const WEAKNESSES = Object.freeze({
	'rohit-sharma': {
		keep: [
			'Blind pride: under pressure he looks at round 4.9 on average and keeps blind-raising; a pure calling station beats him (gap 1,022 ± 564 boots/100). This is Rohit.'
		],
		tune: [
			'Worst matchup human-rich-bully -902 ± 209 boots/100 (x4 at the table).',
			'Worst fixed exploit pressure-after-loss -727 ± 153 boots/100.',
			'Largest bad-action category: monster hands not raised 1.18%.',
			'Feels faint in 3 2 5 (cross-game evaluation); Teen Patti tuning must not make him less recognizable.'
		]
	},
	'virat-kohli': {
		keep: [
			'Tilt after a painful loss (seen-raise rate 41% to 50-51% for two hands, recovers in about seven). This is Virat.'
		],
		tune: [
			'Worst matchup human-rich-bully -1,141 ± 169 boots/100.',
			'Worst fixed exploit call-everything -1,018 ± 466 boots/100.',
			'Largest bad-action category: very weak hands called 3.44%.'
		]
	},
	gg: {
		keep: ['Reads by style and leaves value on the table out of caution. This is GG.'],
		tune: [
			'Packs 4.55% of strong hands ("big pots make him careful"): his largest bad-action category.',
			'Worst scenario: maniac -332 ± 146 boots/100; worst fixed exploit always-raise -409 ± 18.',
			'A bluffer who switches gear mid-session gains 1,196 ± 438 on him relative to a neutral player (GG still wins +266).'
		]
	},
	'samay-raina': {
		keep: [
			'Calls too much and rarely takes the initiative (a caller, not a raiser). This is Samay; making him lead would need memory across nights, not tuning.'
		],
		tune: [
			'Does not raise 6.14% of monster hands (largest bad-action category).',
			'A passive player who folds to pressure gains 360 ± 120 on him (raw -709 ± 105).',
			'Worst fixed exploit never-raise -678 ± 94 boots/100.'
		]
	},
	'ms-dhoni': {
		keep: [
			'Balanced and adaptive by design; recognizable through adaptation, not exaggerated DNA.'
		],
		tune: [
			'The always-raise exploit is fixed in canonical ms-dhoni@4 (tp-dna@8, Phase 4.1 C1); do not undo it.',
			'Largest bad-action category: monster hands not raised 3.03%.',
			'Worst matchup baseline-aggressive -929 ± 314 boots/100.',
			'Feels faint in 3 2 5 (cross-game evaluation).'
		]
	}
});

/** Everything about one character the proposer and the report need, all plain data. */
export function characterContext(character) {
	if (!CHARACTER_IDS.includes(character))
		throw new Error(`Unknown character ${character}. One of: ${CHARACTER_IDS.join(', ')}`);
	const canonical = CANONICAL_STYLES[character];
	return {
		character,
		name: SHORT[character],
		canonical: {
			_id: canonical._id,
			policy: canonical.policy,
			configHash: canonical.configHash,
			dna: { ...canonical.tendencies.dna },
			quirks: canonical.tendencies.quirks.map((q) => ({ ...q })),
			tempo: { ...canonical.tendencies.tempo }
		},
		bands: TARGETS[character].map((b) => ({
			key: b.key,
			min: b.min,
			max: b.max,
			core: b.core,
			why: b.why
		})),
		bounds: boundsFor(character, canonical),
		weaknesses: WEAKNESSES[character]
	};
}
