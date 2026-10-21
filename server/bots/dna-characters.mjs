/**
 * The character bots' personalities: version 1 (policy tp-character@1) and version 2 (policy
 * tp-character@2, docs/BOT_BRAIN.md §27). Data only: the shared policy
 * (server/bots/character.mjs) reads these numbers and never asks which character it is playing.
 *
 * DNA traits are in [0, 1], 0.5 = typical. Policy tp-character@1 uses aggression, bluffAffinity,
 * blindPreference, patience, curiosity, showPreference, riskTolerance and discipline. The feeling
 * and social traits (lossSensitivity ... memoryWeight) are part of each personality now so the
 * character is fully described, and are read from BOT_BRAIN.md phase 2 on.
 *
 * Published styles are immutable: change a character by adding version 2, never by editing these.
 * The weaknesses are tendencies, not stupidity: each one is still a capable player.
 */
/** Version 1, as first measured (docs/bots/PHASE1_REPORT.md). Published: never edit. */
export const CHARACTER_DNA_V1 = Object.freeze({
	// Plays blind for ages and loves a big blind hit. Proud of it; doesn't like being made to look.
	'rohit-sharma': {
		description:
			'Stays blind longer than anyone and loves a blind raise. Hard to push into looking.',
		dna: {
			aggression: 0.62,
			bluffAffinity: 0.5,
			blindPreference: 0.95,
			showPreference: 0.35,
			curiosity: 0.45,
			patience: 0.5,
			riskTolerance: 0.65,
			discipline: 0.45,
			lossSensitivity: 0.5,
			winElation: 0.75,
			pressureResistance: 0.7,
			ego: 0.8,
			moodRecovery: 0.5,
			revenge: 0.4,
			suspicion: 0.4,
			sociality: 0.6,
			adaptability: 0.2,
			memoryWeight: 0.4
		},
		quirks: [{ id: 'blindPride', strength: 0.8 }],
		tempo: { thinkMs: [1800, 3200] }
	},
	// Pressure all the time: raises, bluffs, and plays hot after a beating.
	'virat-kohli': {
		description:
			'Raises and bluffs more than anyone. Emotional: big losses make him hotter, not quieter.',
		dna: {
			aggression: 0.9,
			bluffAffinity: 0.8,
			blindPreference: 0.5,
			showPreference: 0.65,
			curiosity: 0.5,
			patience: 0.15,
			riskTolerance: 0.85,
			discipline: 0.2,
			lossSensitivity: 0.95,
			winElation: 0.8,
			pressureResistance: 0.8,
			ego: 0.85,
			moodRecovery: 0.3,
			revenge: 0.9,
			suspicion: 0.5,
			sociality: 0.8,
			adaptability: 0.2,
			memoryWeight: 0.5
		},
		quirks: [
			{ id: 'tiltSpiral', strength: 0.8 },
			{ id: 'revengeRaise', strength: 0.8 }
		],
		tempo: { thinkMs: [1200, 2400] }
	},
	// Solid and careful. When GG raises, believe it.
	gg: {
		description:
			'Tight and patient. Rarely bluffs, so a raise from GG means something. Big pots make him careful.',
		dna: {
			aggression: 0.32,
			bluffAffinity: 0.15,
			blindPreference: 0.25,
			showPreference: 0.55,
			curiosity: 0.25,
			patience: 0.9,
			riskTolerance: 0.2,
			discipline: 0.75,
			lossSensitivity: 0.7,
			winElation: 0.3,
			pressureResistance: 0.35,
			ego: 0.2,
			moodRecovery: 0.6,
			revenge: 0.1,
			suspicion: 0.5,
			sociality: 0.4,
			adaptability: 0.3,
			memoryWeight: 0.5
		},
		quirks: [{ id: 'survivalMode', strength: 0.7 }],
		tempo: { thinkMs: [2400, 4200] }
	},
	// Has to see it. Calls wide, asks for shows, and is hard to bluff twice.
	'samay-raina': {
		description:
			'Curious and suspicious: calls wide and asks for the show. Hard to bluff more than once.',
		dna: {
			aggression: 0.35,
			bluffAffinity: 0.25,
			blindPreference: 0.45,
			showPreference: 0.75,
			curiosity: 0.9,
			patience: 0.3,
			riskTolerance: 0.5,
			discipline: 0.45,
			lossSensitivity: 0.4,
			winElation: 0.6,
			pressureResistance: 0.6,
			ego: 0.4,
			moodRecovery: 0.6,
			revenge: 0.3,
			suspicion: 0.9,
			sociality: 0.7,
			adaptability: 0.4,
			memoryWeight: 0.6
		},
		quirks: [{ id: 'bluffCatcher', strength: 0.8 }],
		tempo: { thinkMs: [2000, 3800] }
	},
	// Calm, balanced, patient. The one who adapts.
	'ms-dhoni': {
		description:
			'Calm and balanced. Patient with weak hands, mixes his bluffs, and adapts to how you play.',
		dna: {
			aggression: 0.55,
			bluffAffinity: 0.5,
			blindPreference: 0.5,
			showPreference: 0.5,
			curiosity: 0.45,
			patience: 0.75,
			riskTolerance: 0.5,
			discipline: 0.85,
			lossSensitivity: 0.2,
			winElation: 0.3,
			pressureResistance: 0.9,
			ego: 0.3,
			moodRecovery: 0.9,
			revenge: 0.2,
			suspicion: 0.6,
			sociality: 0.5,
			adaptability: 0.95,
			memoryWeight: 0.8
		},
		quirks: [{ id: 'readsTable', strength: 1 }],
		tempo: { thinkMs: [2200, 3600] }
	}
});

/** Feeling and social traits: unchanged from v1, read from phase 2 on. */
const feelings = (id) =>
	Object.fromEntries(
		[
			'lossSensitivity',
			'winElation',
			'pressureResistance',
			'ego',
			'moodRecovery',
			'revenge',
			'suspicion',
			'sociality',
			'adaptability',
			'memoryWeight'
		].map((trait) => [trait, CHARACTER_DNA_V1[id].dna[trait]])
	);

/**
 * Version 2 (Phase 1.1): same characters, built on the corrected policy. `blindAggression` is new
 * (raise vs chaal while blind); `aggression` now acts once cards are seen and `bluffAffinity` only
 * with weak seen hands, so no trait double-counts another.
 */
export const CHARACTER_DNA_V2 = Object.freeze({
	// Longest blind player, and now a blind hitter, who eventually looks under real pressure.
	'rohit-sharma': {
		description:
			'Stays blind longer than anyone and likes to hit blind. Real pressure makes him look, eventually.',
		dna: {
			aggression: 0.6,
			blindAggression: 0.8,
			bluffAffinity: 0.45,
			blindPreference: 0.9,
			showPreference: 0.35,
			curiosity: 0.45,
			patience: 0.5,
			riskTolerance: 0.65,
			discipline: 0.5,
			...feelings('rohit-sharma')
		},
		quirks: [{ id: 'blindPride', strength: 0.8 }],
		tempo: { thinkMs: [1800, 3200] }
	},
	// Still the most aggressive and the loosest, without raising every blind hand.
	'virat-kohli': {
		description:
			'Raises and bluffs more than anyone. Emotional: big losses make him hotter, not quieter.',
		dna: {
			aggression: 0.88,
			blindAggression: 0.7,
			bluffAffinity: 0.75,
			blindPreference: 0.5,
			showPreference: 0.55,
			curiosity: 0.5,
			patience: 0.2,
			riskTolerance: 0.8,
			discipline: 0.25,
			...feelings('virat-kohli')
		},
		quirks: [
			{ id: 'tiltSpiral', strength: 0.8 },
			{ id: 'revengeRaise', strength: 0.8 }
		],
		tempo: { thinkMs: [1200, 2400] }
	},
	// Selective and patient; a strong hand overcomes his caution; big pots still make him careful.
	gg: {
		description:
			'Selective and patient. Rarely bluffs, so a raise from GG means something. Big pots make him careful.',
		dna: {
			aggression: 0.42,
			blindAggression: 0.3,
			bluffAffinity: 0.2,
			blindPreference: 0.25,
			showPreference: 0.55,
			curiosity: 0.3,
			patience: 0.75,
			riskTolerance: 0.3,
			discipline: 0.8,
			...feelings('gg')
		},
		quirks: [{ id: 'survivalMode', strength: 0.6 }],
		tempo: { thinkMs: [2400, 4200] }
	},
	// The widest caller, who still raises a monster.
	'samay-raina': {
		description:
			'Curious and suspicious: calls wide and asks for the show, but raises a monster. Hard to bluff more than once.',
		dna: {
			aggression: 0.42,
			blindAggression: 0.4,
			bluffAffinity: 0.25,
			blindPreference: 0.45,
			showPreference: 0.7,
			curiosity: 0.85,
			patience: 0.3,
			riskTolerance: 0.5,
			discipline: 0.5,
			...feelings('samay-raina')
		},
		quirks: [{ id: 'bluffCatcher', strength: 0.8 }],
		tempo: { thinkMs: [2000, 3800] }
	},
	// Balanced, with a little more mixing. His identity (adaptation) arrives with phase 2.
	'ms-dhoni': {
		description:
			'Calm and balanced. Patient with weak hands, mixes his bluffs, and adapts to how you play.',
		dna: {
			aggression: 0.55,
			blindAggression: 0.5,
			bluffAffinity: 0.5,
			blindPreference: 0.5,
			showPreference: 0.5,
			curiosity: 0.45,
			patience: 0.7,
			riskTolerance: 0.5,
			discipline: 0.72,
			...feelings('ms-dhoni')
		},
		quirks: [{ id: 'readsTable', strength: 1 }],
		tempo: { thinkMs: [2200, 3600] }
	}
});

/**
 * Version 3 (Phase 2): v2 personalities on policy tp-character@3, which adds a mind. Changes are
 * data only, aimed at the Phase 1.1 review: Virat's aggression moves from blind doubling toward
 * seen pressure, confrontation and tilt; GG is more patient and selective once he looks, but no
 * longer always looks at once; Samay is looser around close calls (curiosity, less discipline) while the evidence bound
 * still protects very weak hands; Dhoni's adaptability now has opponent models to read, and he
 * keeps a public signature of his own whatever the table: a little more aggressive than v2, a
 * little longer blind, and he likes to finish with a show. Virat keeps some blind hitting.
 */
const v2 = (id, changes = {}, extra = {}) => ({
	...CHARACTER_DNA_V2[id],
	...extra,
	dna: { ...CHARACTER_DNA_V2[id].dna, ...changes }
});
export const CHARACTER_DNA_V3 = Object.freeze({
	'rohit-sharma': v2('rohit-sharma'),
	'virat-kohli': v2('virat-kohli', { blindAggression: 0.6, aggression: 0.92 }),
	gg: v2('gg', { blindPreference: 0.42, discipline: 0.78, patience: 0.85, curiosity: 0.2 }),
	'samay-raina': v2('samay-raina', { curiosity: 0.95, patience: 0.25, discipline: 0.4 }),
	'ms-dhoni': v2('ms-dhoni', {
		aggression: 0.62,
		bluffAffinity: 0.55,
		blindPreference: 0.6,
		showPreference: 0.62
	})
});
