/** Versioned character policy contract. No database, memory or privileged room state. */
import { ADAPTIVE_POLICY, FOCUS, MEMORY_OPTIONAL, MEMORY_RANGES } from './memory/adaptive.mjs';
import { MEMORY_VERSION } from './memory/observations.mjs';
import { canonicalJson, fingerprint64 } from '../analytics/hash.mjs';
import { DNA_POLICIES } from './dna-policies.mjs';

export const CHARACTER_POLICY = 'tp-character@1';
export const RANGES = Object.freeze({
	blindRounds: [0, 12],
	call: [0.05, 0.9],
	raise: [0.1, 0.99],
	show: [0.1, 0.95],
	bluff: [0, 0.4],
	randomness: [0, 0.5],
	mistake: [0, 0.35],
	pressureRead: [0, 0.4],
	shortStackCall: [0, 0.3],
	largePotCaution: [0, 0.3],
	strongRaiseChance: [0, 1],
	blindShowChance: [0, 1],
	stackRisk: [0.05, 0.8]
});

/** Optional traits: absent means "off", present must be in range. Added after v1 so old styles stay valid. */
export const OPTIONAL_RANGES = Object.freeze({ blindMatch: [0, 1] });

export function characterHash(style) {
	return fingerprint64(
		canonicalJson({
			policy: style.policy,
			tendencies: style.tendencies,
			supportedGames: style.supportedGames,
			supportedVariants: style.supportedVariants,
			...(style.policy === ADAPTIVE_POLICY ? { memory: style.memory } : {})
		})
	);
}

/** DNA styles (tp-dna@*): personality genes in [0, 1], named quirks with a strength, a think range. */
const DNA_GENES = /^[a-z][A-Za-z]{1,31}$/;
function dnaConfigErrors(style) {
	const errors = [];
	if (JSON.stringify(style?.supportedGames) !== '["teen-patti"]') errors.push('This policy supports Teen Patti only');
	if (JSON.stringify(style?.supportedVariants) !== '["*"]') errors.push('This policy requires all Teen Patti variants');
	if (style?.memory !== undefined) errors.push('DNA styles keep a per-session mind, not stored memory');
	const t = style?.tendencies;
	if (!t || typeof t !== 'object' || Array.isArray(t)) return [...errors, 'Missing tendencies'];
	for (const key of Object.keys(t)) if (!['dna', 'quirks', 'tempo'].includes(key)) errors.push(`Unknown tendency: ${key}`);
	const genes = Object.entries(t.dna ?? {});
	if (genes.length < 10) errors.push('DNA needs its personality genes');
	for (const [gene, value] of genes)
		if (!DNA_GENES.test(gene) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
			errors.push(`DNA ${gene} must be 0–1`);
	if (!Array.isArray(t.quirks) || t.quirks.length > 8) errors.push('Quirks must be a short list');
	else
		for (const q of t.quirks)
			if (typeof q?.id !== 'string' || !DNA_GENES.test(q.id) || typeof q.strength !== 'number' || q.strength < 0 || q.strength > 1)
				errors.push('Each quirk needs an id and a strength 0–1');
	const think = t.tempo?.thinkMs;
	if (!Array.isArray(think) || think.length !== 2 || !think.every((ms) => Number.isInteger(ms) && ms >= 500 && ms <= 10000) || think[0] > think[1])
		errors.push('Think time must be a range of 500–10000 ms');
	return errors;
}

export function configErrors(style) {
	if (DNA_POLICIES.has(style?.policy)) return dnaConfigErrors(style);
	const errors = [];
	if (![CHARACTER_POLICY, ADAPTIVE_POLICY].includes(style?.policy)) errors.push('Unsupported policy');
	if (
		!Array.isArray(style?.supportedGames) ||
		style.supportedGames.length !== 1 ||
		style.supportedGames[0] !== 'teen-patti'
	)
		errors.push('This policy supports Teen Patti only');
	// All current Teen Patti variants share this policy. Restricting individual variants can be
	// added as a separately versioned policy, rather than a silently ignored setting.
	if (JSON.stringify(style?.supportedVariants) !== '["*"]')
		errors.push('This policy requires all Teen Patti variants');
	if (style?.policy === ADAPTIVE_POLICY) {
		if (style.memory?.schema !== MEMORY_VERSION) errors.push('Unsupported memory schema');
		for (const [key, [min, max]] of Object.entries(MEMORY_RANGES))
			if (typeof style.memory?.[key] !== 'number' || !Number.isFinite(style.memory[key]) || style.memory[key] < min || style.memory[key] > max)
				errors.push(`Memory ${key} must be ${min}–${max}`);
		for (const [key, [min, max]] of Object.entries(MEMORY_OPTIONAL))
			if (style.memory?.[key] !== undefined && (typeof style.memory[key] !== 'number' || !Number.isFinite(style.memory[key]) || style.memory[key] < min || style.memory[key] > max))
				errors.push(`Memory ${key} must be ${min}–${max}`);
		if (style.memory?.focus !== undefined && !FOCUS.includes(style.memory.focus)) errors.push('Unknown memory focus');
		for (const key of Object.keys(style.memory ?? {}))
			if (key !== 'schema' && key !== 'focus' && !Object.hasOwn(MEMORY_RANGES, key) && !Object.hasOwn(MEMORY_OPTIONAL, key)) errors.push(`Unknown memory setting: ${key}`);
	} else if (style?.memory !== undefined) errors.push('Memory requires a new adaptive policy');
	const profile = style?.tendencies;
	if (!profile || typeof profile !== 'object' || Array.isArray(profile))
		return [...errors, 'Missing tendencies'];
	for (const [key, [min, max]] of Object.entries(RANGES)) {
		if (
			typeof profile[key] !== 'number' ||
			!Number.isFinite(profile[key]) ||
			profile[key] < min ||
			profile[key] > max
		)
			errors.push(`${key} must be ${min}–${max}`);
	}
	for (const [key, [min, max]] of Object.entries(OPTIONAL_RANGES))
		if (profile[key] !== undefined && (typeof profile[key] !== 'number' || !Number.isFinite(profile[key]) || profile[key] < min || profile[key] > max))
			errors.push(`${key} must be ${min}–${max}`);
	for (const key of Object.keys(profile))
		if (!Object.hasOwn(RANGES, key) && !Object.hasOwn(OPTIONAL_RANGES, key)) errors.push(`Unknown tendency: ${key}`);
	if (profile.raise < profile.call)
		errors.push('Raise threshold must be at least the call threshold');
	if (!['relaxed', 'balanced', 'challenging'].includes(style?.difficulty?.declared))
		errors.push('Choose a declared difficulty');
	if (style?.configHash !== characterHash(style)) errors.push('Configuration hash does not match');
	return errors;
}

/** Small, complete snapshot travels with a seat into sealed replay inputs. Never in projection. */
export function runtimeStyle(style) {
	return Object.fromEntries(
		[
			'_id',
			'botId',
			'version',
			'status',
			'policy',
			'tendencies',
			'supportedGames',
			'supportedVariants',
			'configHash',
			'difficulty',
			...(style.policy === ADAPTIVE_POLICY ? ['memory'] : [])
		].map((key) => [key, structuredClone(style[key])])
	);
}
