/** Versioned character policy contract. No database, memory or privileged room state. */
import { canonicalJson, fingerprint64 } from '../analytics/hash.mjs';

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

export function characterHash(style) {
	return fingerprint64(
		canonicalJson({
			policy: style.policy,
			tendencies: style.tendencies,
			supportedGames: style.supportedGames,
			supportedVariants: style.supportedVariants
		})
	);
}

export function configErrors(style) {
	const errors = [];
	if (style?.policy !== CHARACTER_POLICY) errors.push('Unsupported policy');
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
	for (const key of Object.keys(profile))
		if (!Object.hasOwn(RANGES, key)) errors.push(`Unknown tendency: ${key}`);
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
			'difficulty'
		].map((key) => [key, structuredClone(style[key])])
	);
}
