/**
 * Tuning loop: what a proposed DNA draft may change, and the check every draft passes before it is
 * simulated (docs/bots/TUNING_LOOP.md). No LLM code here: the same rules bind the mock proposer, a
 * Claude proposal and a hand-written draft.
 *
 * A draft is a small, explained edit of the canonical style of one character:
 *   { id, rationale, weakness, dna: [{ gene, value }], quirks: [{ id, strength }], exploitTarget }
 * `dna` and `quirks` list only what changes, as absolute new values. The policy, tempo, games and
 * variants never change: a policy change is code, and goes through a Phase 4 style challenger.
 */
import { configErrors } from '../../server/bots/config.mjs';
import { validateStyle } from '../../server/bots/validation.mjs';
import { styleConfigHash } from '../../server/bots/identity.mjs';
import { REGIONS } from '../../server/sim/candidates.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';

/**
 * Limits on one draft. These are tuning-loop rules (new, documented in TUNING_LOOP.md), chosen to
 * keep every candidate a small step from canonical, in the spirit of the Phase 4 challengers
 * ("the smallest stated change") and the Phase 3 mutation step (sigma 0.07, 3 genes).
 */
export const LIMITS = Object.freeze({
	/** Genes plus quirks changed in one draft. */
	maxChanges: 4,
	/** Largest change of one gene. */
	maxGeneStep: 0.1,
	/** Genes outside a character's identity region may move this far from canonical. */
	freeGeneRadius: 0.15,
	/** Quirk strengths stay in the Phase 3 search range. */
	quirkRange: [0.3, 1],
	maxQuirkStep: 0.2,
	/** Smallest change that counts as a change (smaller ones are rounding). */
	minStep: 0.005,
	rationaleChars: [10, 1200]
});

const round3 = (x) => Math.round(x * 1000) / 1000;

/** The allowed range of every gene and quirk of a character, around its canonical style. */
export function boundsFor(character, canonical) {
	const dna = canonical.tendencies.dna;
	const genes = Object.fromEntries(
		Object.entries(dna).map(([gene, value]) => {
			const region = REGIONS[character]?.[gene] ?? [
				value - LIMITS.freeGeneRadius,
				value + LIMITS.freeGeneRadius
			];
			const lo = Math.max(0, region[0], value - LIMITS.maxGeneStep);
			const hi = Math.min(1, region[1], value + LIMITS.maxGeneStep);
			return [
				gene,
				{
					value,
					region: [round3(Math.max(0, region[0])), round3(Math.min(1, region[1]))],
					min: round3(Math.min(lo, value)),
					max: round3(Math.max(hi, value)),
					identity: Boolean(REGIONS[character]?.[gene])
				}
			];
		})
	);
	const quirks = Object.fromEntries(
		canonical.tendencies.quirks.map((q) => [
			q.id,
			{
				strength: q.strength,
				min: round3(Math.max(LIMITS.quirkRange[0], q.strength - LIMITS.maxQuirkStep)),
				max: round3(Math.min(LIMITS.quirkRange[1], q.strength + LIMITS.maxQuirkStep))
			}
		])
	);
	return { genes, quirks, limits: LIMITS, exploits: Object.keys(EXPLOITS) };
}

/** The plain style config a draft describes: the canonical style with the draft's values. */
export function draftStyle(character, canonical, draft) {
	const dna = { ...canonical.tendencies.dna };
	for (const { gene, value } of draft.dna ?? []) dna[gene] = round3(value);
	const quirks = canonical.tendencies.quirks.map((q) => {
		const next = (draft.quirks ?? []).find((x) => x.id === q.id);
		return { id: q.id, strength: next ? round3(next.strength) : q.strength };
	});
	const config = {
		policy: canonical.policy,
		tendencies: { dna, quirks, tempo: { ...canonical.tendencies.tempo } },
		supportedGames: ['teen-patti']
	};
	const version = canonical.version + 1;
	return {
		_id: `${character}@${version}`,
		botId: character,
		version,
		parent: canonical._id,
		status: 'candidate',
		reference: 'dna',
		...config,
		supportedVariants: ['*'],
		difficulty: { declared: null },
		configHash: styleConfigHash(config),
		source: 'tuning-loop',
		tuning: { draft: draft.id, rationale: draft.rationale, weakness: draft.weakness ?? null }
	};
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Every reason a draft cannot be simulated; empty when it is valid. `seen` holds the configuration
 * hashes already accepted (a duplicate is rejected).
 */
export function draftErrors(character, canonical, draft, { seen = new Set(), hands = 8 } = {}) {
	const errors = [];
	const b = boundsFor(character, canonical);
	if (!draft || typeof draft !== 'object' || Array.isArray(draft))
		return ['Draft is not an object'];
	if (typeof draft.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,23}$/.test(draft.id))
		errors.push('id must be a short lowercase tag (a-z, 0-9, -; up to 24 characters)');
	const why = typeof draft.rationale === 'string' ? draft.rationale.trim() : '';
	if (why.length < LIMITS.rationaleChars[0] || why.length > LIMITS.rationaleChars[1])
		errors.push(
			`rationale must explain the change in ${LIMITS.rationaleChars[0]} to ${LIMITS.rationaleChars[1]} characters`
		);
	for (const key of Object.keys(draft))
		if (!['id', 'rationale', 'weakness', 'dna', 'quirks', 'exploitTarget'].includes(key))
			errors.push(`Unknown draft field: ${key} (policy, tempo and games cannot change)`);
	if (!Array.isArray(draft.dna ?? [])) errors.push('dna must be a list of { gene, value }');
	if (!Array.isArray(draft.quirks ?? [])) errors.push('quirks must be a list of { id, strength }');
	if (errors.length) return errors;
	let changes = 0;
	const genesSeen = new Set();
	for (const entry of draft.dna ?? []) {
		const g = b.genes[entry?.gene];
		if (!g) {
			errors.push(`Unknown gene: ${entry?.gene}`);
			continue;
		}
		if (genesSeen.has(entry.gene)) errors.push(`Gene listed twice: ${entry.gene}`);
		genesSeen.add(entry.gene);
		if (!finite(entry.value)) {
			errors.push(`${entry.gene} must be a number`);
			continue;
		}
		const step = Math.abs(entry.value - g.value);
		if (step < LIMITS.minStep) errors.push(`${entry.gene}: no change from canonical ${g.value}`);
		else changes++;
		if (entry.value < g.min - 1e-9 || entry.value > g.max + 1e-9)
			errors.push(
				`${entry.gene} = ${entry.value} is out of bounds [${g.min}, ${g.max}] (canonical ${g.value}, step at most ${LIMITS.maxGeneStep}${g.identity ? `, identity region ${g.region.join('-')}` : ''})`
			);
	}
	const quirksSeen = new Set();
	for (const entry of draft.quirks ?? []) {
		const q = b.quirks[entry?.id];
		if (!q) {
			errors.push(`Unknown quirk: ${entry?.id} (only this character's quirks can be tuned)`);
			continue;
		}
		if (quirksSeen.has(entry.id)) errors.push(`Quirk listed twice: ${entry.id}`);
		quirksSeen.add(entry.id);
		if (!finite(entry.strength)) {
			errors.push(`quirk ${entry.id} strength must be a number`);
			continue;
		}
		if (Math.abs(entry.strength - q.strength) < LIMITS.minStep)
			errors.push(`quirk ${entry.id}: no change from canonical ${q.strength}`);
		else changes++;
		if (entry.strength < q.min - 1e-9 || entry.strength > q.max + 1e-9)
			errors.push(
				`quirk ${entry.id} = ${entry.strength} is out of bounds [${q.min}, ${q.max}] (canonical ${q.strength})`
			);
	}
	if (changes === 0) errors.push('Draft changes nothing');
	if (changes > LIMITS.maxChanges)
		errors.push(`Draft changes ${changes} values; at most ${LIMITS.maxChanges}`);
	if (
		draft.exploitTarget != null &&
		(typeof draft.exploitTarget !== 'string' || !EXPLOITS[draft.exploitTarget])
	)
		errors.push(`exploitTarget must be one of: ${Object.keys(EXPLOITS).join(', ')}, or null`);
	if (errors.length) return errors;
	// The project's own checks: the style config contract, then a short real-engine game with
	// the hidden-card invariance check (server/bots/validation.mjs).
	const style = draftStyle(character, canonical, draft);
	errors.push(...configErrors(style).map((e) => `config: ${e}`));
	if (seen.has(style.configHash)) errors.push('Same configuration as another draft');
	if (style.configHash === canonical.configHash) errors.push('Same configuration as canonical');
	if (errors.length) return errors;
	const report = validateStyle(style, { hands });
	if (!report.passed) errors.push(...report.errors.map((e) => `validation: ${e}`));
	return errors;
}
