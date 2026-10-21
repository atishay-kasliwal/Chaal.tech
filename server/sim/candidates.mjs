import { CHARACTER_DNA_V3 } from '../bots/dna-characters.mjs';
import { CHARACTER_POLICY_V4 } from '../bots/character-v4.mjs';
import { styleConfigHash } from '../bots/identity.mjs';

/**
 * Phase 3 candidates (BOT_BRAIN.md §29): unpublished styles on tp-dna@4, each a descendant of
 * a frozen Phase 2 style (@3) with its ancestry recorded. Offline only: nothing here is ever
 * seated in a room or added to the published registry (server/bots/identity.mjs). A reviewer
 * turns an approved candidate into a new immutable version by hand.
 *
 * The search space is DNA and quirk strengths (data), inside each character's identity region:
 * bounds that keep Rohit blind, Virat loose, GG tight, Samay curious and Dhoni balanced. Dhoni's
 * decision traits are held near balanced on purpose: he should become recognizable through
 * adaptation, not through exaggerated static DNA.
 */
export const DECISION_GENES = Object.freeze([
	'aggression',
	'blindAggression',
	'bluffAffinity',
	'blindPreference',
	'showPreference',
	'curiosity',
	'patience',
	'riskTolerance',
	'discipline'
]);
export const FEELING_GENES = Object.freeze([
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
]);

/** Identity regions: [min, max] per gene. Genes not listed may move ±0.15 from the ancestor. */
export const REGIONS = Object.freeze({
	'rohit-sharma': {
		blindPreference: [0.8, 1],
		blindAggression: [0.6, 0.9],
		aggression: [0.45, 0.75],
		winElation: [0.6, 1],
		ego: [0.6, 1],
		discipline: [0.4, 0.65]
	},
	'virat-kohli': {
		aggression: [0.8, 1],
		bluffAffinity: [0.65, 0.95],
		blindAggression: [0.45, 0.75],
		discipline: [0.1, 0.4],
		lossSensitivity: [0.75, 1],
		revenge: [0.7, 1],
		patience: [0.05, 0.35],
		moodRecovery: [0.1, 0.45]
	},
	gg: {
		patience: [0.7, 0.95],
		discipline: [0.7, 0.92],
		bluffAffinity: [0.05, 0.3],
		curiosity: [0.1, 0.35],
		aggression: [0.3, 0.55],
		blindPreference: [0.25, 0.5],
		riskTolerance: [0.15, 0.4]
	},
	'samay-raina': {
		curiosity: [0.8, 1],
		showPreference: [0.55, 0.85],
		suspicion: [0.75, 1],
		patience: [0.1, 0.4],
		aggression: [0.3, 0.5],
		bluffAffinity: [0.1, 0.35],
		discipline: [0.3, 0.55],
		lossSensitivity: [0.3, 0.75]
	},
	'ms-dhoni': {
		adaptability: [0.85, 1],
		discipline: [0.6, 0.85],
		aggression: [0.45, 0.65],
		blindAggression: [0.4, 0.6],
		bluffAffinity: [0.4, 0.6],
		blindPreference: [0.4, 0.6],
		showPreference: [0.4, 0.65],
		curiosity: [0.35, 0.55],
		patience: [0.55, 0.8],
		lossSensitivity: [0.1, 0.35],
		pressureResistance: [0.75, 1],
		moodRecovery: [0.7, 1]
	}
});

const clamp = (x, [a, b]) => Math.min(b, Math.max(a, x));
const round = (x) => Math.round(x * 1000) / 1000;
const regionOf = (character, gene, ancestor) =>
	REGIONS[character][gene] ?? [Math.max(0, ancestor - 0.15), Math.min(1, ancestor + 0.15)];

/** The frozen Phase 2 ancestor of a character, as a genome. */
export function ancestorGenome(character) {
	const a = CHARACTER_DNA_V3[character];
	return {
		dna: { ...a.dna },
		quirks: a.quirks.map((q) => ({ ...q })),
		tempo: { ...a.tempo }
	};
}

/** A mutated copy: `count` genes moved by a normal step of `sigma`, kept in the region. */
export function mutate(
	character,
	genome,
	random,
	{ sigma = 0.07, count = 3, quirkSigma = 0.1 } = {}
) {
	const ancestor = CHARACTER_DNA_V3[character].dna;
	const genes = [...DECISION_GENES, ...FEELING_GENES];
	const dna = { ...genome.dna };
	const changed = [];
	for (let i = 0; i < count; i++) {
		const g = genes[Math.floor(random() * genes.length)];
		const gauss = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
		dna[g] = round(clamp(dna[g] + sigma * gauss, regionOf(character, g, ancestor[g])));
		changed.push(g);
	}
	const quirks = genome.quirks.map((q) => {
		if (random() > 0.3) return { ...q };
		const gauss = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
		changed.push(`quirk.${q.id}`);
		return { ...q, strength: round(clamp(q.strength + quirkSigma * gauss, [0.3, 1])) };
	});
	return { dna, quirks, tempo: { ...genome.tempo }, changed: [...new Set(changed)] };
}

/** Uniform crossover of two genomes of the same character. */
export function crossover(a, b, random) {
	const dna = Object.fromEntries(
		Object.keys(a.dna).map((g) => [g, random() < 0.5 ? a.dna[g] : b.dna[g]])
	);
	const quirks = a.quirks.map((q, i) => (random() < 0.5 ? { ...q } : { ...b.quirks[i] }));
	return { dna, quirks, tempo: { ...a.tempo } };
}

/** An unpublished candidate style with its ancestry. */
export function candidateStyle(character, genome, { id, parent, generation, changed = [] }) {
	const config = {
		policy: CHARACTER_POLICY_V4,
		tendencies: { dna: genome.dna, quirks: genome.quirks, tempo: genome.tempo },
		supportedGames: ['teen-patti']
	};
	return Object.freeze({
		_id: id,
		botId: character,
		status: 'candidate',
		ancestor: `${character}@3`,
		parent,
		generation,
		changed,
		...config,
		configHash: styleConfigHash(config)
	});
}

/** Distance of a genome from its ancestor (largest gene change), for the report. */
export function drift(character, genome) {
	const a = CHARACTER_DNA_V3[character].dna;
	return Object.entries(genome.dna)
		.map(([g, v]) => [g, round(v - a[g])])
		.filter(([, d]) => Math.abs(d) >= 0.01)
		.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
}
