/**
 * Reference definitions of the DNA characters (docs/BOT_BRAIN.md, docs/bots/CANONICAL.md): every
 * version of each character's style on the `tp-dna` policies, frozen in code.
 *
 * These are references, not publications. A live table only seats a style published through the
 * bot directory (server/bots/directory.mjs, immutable `<botId>@<n>` versions in the database); the
 * DNA publish script copies a reference there and refuses unless its configuration hash matches.
 * The simulator, the golden tests and the reports seat these references directly, through the same
 * validated embedded-style path the engine uses for published styles.
 *
 * A reference's `_id` is `<botId>@<version>` within this family (v1 to v3); the published database
 * version of the same configuration gets the bot's next directory version. The two are told apart by
 * `policy` (tp-dna@n) and `configHash`, which every recorded seat carries.
 */
import { CHARACTER_DNA_V1, CHARACTER_DNA_V2, CHARACTER_DNA_V3 } from './dna-characters.mjs';
import { CHARACTER_POLICY } from './character.mjs';
import { CHARACTER_POLICY_V2 } from './character-v2.mjs';
import { CHARACTER_POLICY_V3 } from './character-v3.mjs';
import { CHARACTER_POLICY_V4 } from './character-v4.mjs';
import { CHARACTER_POLICY_V8 } from './character-v8.mjs';
import { CAST } from '../../src/lib/bots/cast.js';
import { styleConfigHash, LEGACY_STYLES, STYLES as LEGACY_STYLE_IDS } from './identity.mjs';
export { LEGACY_STYLES };

const VERSIONS = {
	1: { dna: CHARACTER_DNA_V1, policy: CHARACTER_POLICY },
	2: { dna: CHARACTER_DNA_V2, policy: CHARACTER_POLICY_V2 },
	3: { dna: CHARACTER_DNA_V3, policy: CHARACTER_POLICY_V3 }
};

function referenceStyle(botId, version) {
	const { dna, quirks, tempo } = VERSIONS[version].dna[botId];
	const config = {
		policy: VERSIONS[version].policy,
		tendencies: { dna: { ...dna }, quirks: quirks.map((q) => ({ ...q })), tempo: { ...tempo } },
		supportedGames: ['teen-patti']
	};
	return Object.freeze({
		_id: `${botId}@${version}`,
		botId,
		version,
		parent: version > 1 ? `${botId}@${version - 1}` : null,
		status: 'published',
		reference: 'dna',
		...config,
		supportedVariants: ['*'],
		difficulty: { declared: null },
		configHash: styleConfigHash(config),
		source: 'manual'
	});
}

const family = (version) =>
	Object.freeze(Object.fromEntries(CAST.map(({ id }) => [id, referenceStyle(id, version)])));

/** Every reference version of each character, by character id. */
export const CHARACTER_STYLES_V1 = family(1);
export const CHARACTER_STYLES_V2 = family(2);
export const CHARACTER_STYLES_V3 = family(3);
/** Phase 2 (tp-dna@3): the approved reference for Rohit, Virat, Samay and Dhoni. */
export const CHARACTER_STYLES = CHARACTER_STYLES_V3;

/**
 * GG, Phase 3 candidate `gg@4-c034` (docs/bots/PHASE3_REPORT.md): the approved GG on tp-dna@4.
 * A crossover of two generation-0 mutants of the Phase 2 GG (c007: curiosity, riskTolerance,
 * pressureResistance; c008: showPreference, ego) with one further mutation (moodRecovery), chosen by
 * the league as "more faithful and not weaker" and validated over 2.1M hands. Copied exactly from
 * the league record (docs/bots/phase3/league-41.json); tests/server/bot-canonical.test.mjs checks
 * it against that file and against the configuration hash it was measured under (`formerHash`, with
 * the policy's former name tp-character@4).
 */
const GG_C034_CONFIG = {
	policy: CHARACTER_POLICY_V4,
	tendencies: {
		dna: {
			aggression: 0.42,
			blindAggression: 0.3,
			bluffAffinity: 0.2,
			blindPreference: 0.42,
			showPreference: 0.411,
			curiosity: 0.177,
			patience: 0.85,
			riskTolerance: 0.34,
			discipline: 0.78,
			lossSensitivity: 0.7,
			winElation: 0.3,
			pressureResistance: 0.35,
			ego: 0.302,
			moodRecovery: 0.591,
			revenge: 0.1,
			suspicion: 0.5,
			sociality: 0.4,
			adaptability: 0.3,
			memoryWeight: 0.5
		},
		quirks: [{ id: 'survivalMode', strength: 0.6 }],
		tempo: { thinkMs: [2400, 4200] }
	},
	supportedGames: ['teen-patti']
};
export const GG_C034 = Object.freeze({
	_id: 'gg@4',
	botId: 'gg',
	version: 4,
	parent: 'gg@3',
	status: 'published',
	reference: 'dna',
	...GG_C034_CONFIG,
	supportedVariants: ['*'],
	difficulty: { declared: null },
	configHash: styleConfigHash(GG_C034_CONFIG),
	source: 'phase3',
	phase3: Object.freeze({
		candidate: 'gg@4-c034',
		league: 'docs/bots/phase3/league-41.json',
		searchSeed: 41,
		validationSeed: 51,
		generation: 2,
		lineage: ['gg@3', 'gg@4-c007 × gg@4-c008', 'gg@4-c034 (moodRecovery)'],
		formerPolicy: 'tp-character@4',
		formerHash: 'af244057d0c062cc'
	})
});

/**
 * The Phase 4 champions (docs/bots/phase4/champions.json): the canonical lineup of 2026-10-21, before
 * Phase 4.1. Frozen so the Phase 3.1, 4 and 4.1 harnesses (challengers, league, reports) reproduce
 * their recorded results; never edit.
 */
export const PHASE4_CHAMPIONS = Object.freeze({
	'rohit-sharma': CHARACTER_STYLES_V3['rohit-sharma'],
	'virat-kohli': CHARACTER_STYLES_V3['virat-kohli'],
	gg: GG_C034,
	'samay-raina': CHARACTER_STYLES_V3['samay-raina'],
	'ms-dhoni': CHARACTER_STYLES_V3['ms-dhoni']
});

/**
 * Dhoni, Phase 4.1 candidate C1 `ms-dhoni@8-blindraises` (docs/bots/PHASE41_REPORT.md), approved
 * 2026-10-22: Dhoni's Phase 2 DNA, quirks and tempo unchanged, on tp-dna@8 (tp-dna@3 plus pressure to
 * look from repeated blind raises). Exactly the configuration measured by the eight gates (seed 49,
 * docs/bots/phase4/results/gates-dhoni41-49.json) and the screen (seed 48);
 * tests/server/bot-canonical.test.mjs checks the configuration, its hash and every decision against
 * the challenger that produced those results (server/sim/challengers.mjs DHONI41_CHALLENGERS[0]).
 */
const MS_DHONI_C1_CONFIG = {
	policy: CHARACTER_POLICY_V8,
	tendencies: structuredClone(CHARACTER_STYLES_V3['ms-dhoni'].tendencies),
	supportedGames: ['teen-patti']
};
export const MS_DHONI_C1 = Object.freeze({
	_id: 'ms-dhoni@4',
	botId: 'ms-dhoni',
	version: 4,
	parent: 'ms-dhoni@3',
	status: 'published',
	reference: 'dna',
	...MS_DHONI_C1_CONFIG,
	supportedVariants: ['*'],
	difficulty: { declared: null },
	configHash: styleConfigHash(MS_DHONI_C1_CONFIG),
	source: 'phase4.1',
	phase41: Object.freeze({
		candidate: 'ms-dhoni@8-blindraises',
		report: 'docs/bots/PHASE41_REPORT.md',
		gates: 'docs/bots/phase4/results/gates-dhoni41-49.json',
		gateSeed: 49,
		screenSeed: 48,
		baselineCommit: 'a766e991',
		lineage: ['ms-dhoni@3', 'ms-dhoni@7-blindcost (rejected)', 'ms-dhoni@8-blindraises (C1)'],
		approved: '2026-10-22'
	})
});

/**
 * The canonical characters: Rohit, Virat and Samay on their Phase 2 reference (tp-dna@3), GG on
 * Phase 3 candidate c034 (tp-dna@4), Dhoni on Phase 4.1 C1 (tp-dna@8, approved 2026-10-22). The DNA
 * publish script (scripts/bots-publish-dna.mjs) publishes exactly these as each bot's next directory
 * version.
 */
export const CANONICAL_STYLES = Object.freeze({
	...PHASE4_CHAMPIONS,
	'ms-dhoni': MS_DHONI_C1
});

/** Legacy styles and every DNA reference, by style id (the simulator's and reports' catalogue). */
export const STYLES = Object.freeze({
	...LEGACY_STYLE_IDS,
	...Object.fromEntries([
		...[CHARACTER_STYLES_V1, CHARACTER_STYLES_V2, CHARACTER_STYLES_V3].flatMap((f) =>
			Object.values(f).map((s) => [s._id, s])
		),
		[GG_C034._id, GG_C034],
		[MS_DHONI_C1._id, MS_DHONI_C1]
	])
});

/** The style a seated bot plays: the style it sat down with, or its legacy level's. */
export function styleForSeat(bot) {
	return bot?.style ?? LEGACY_STYLES[bot?.level] ?? null;
}
