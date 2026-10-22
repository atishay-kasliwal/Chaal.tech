import { decide as decideHeuristic } from './strategy.mjs';
import { decideCharacter, CHARACTER_POLICY } from './character.mjs';
import { decideCharacterV2, CHARACTER_POLICY_V2 } from './character-v2.mjs';
import { decideCharacterV3, CHARACTER_POLICY_V3 } from './character-v3.mjs';
import { decideCharacterV4, CHARACTER_POLICY_V4 } from './character-v4.mjs';
import { decideCharacterV5, CHARACTER_POLICY_V5 } from './character-v5.mjs';
import { decideCharacterV6, CHARACTER_POLICY_V6 } from './character-v6.mjs';
import { decideCharacterV7, CHARACTER_POLICY_V7 } from './character-v7.mjs';
import {
	decideCharacterV8,
	CHARACTER_POLICY_V8,
	decideCharacterV9,
	CHARACTER_POLICY_V9
} from './character-v8.mjs';
import { LEGACY_POLICY } from './identity.mjs';
export { DNA_POLICIES } from './dna-policies.mjs';

/**
 * Policy registry: the decision code a style's `policy` names. Every published policy stays here
 * forever so recorded hands keep replaying with the code that played them.
 */
export const POLICIES = Object.freeze({
	[LEGACY_POLICY]: (view, botId, random, style) =>
		decideHeuristic(view, botId, random, style.tendencies),
	[CHARACTER_POLICY]: decideCharacter,
	[CHARACTER_POLICY_V2]: decideCharacterV2,
	// Phase 2: decides with the bot's mind (server/bots/mind.mjs); the others ignore it.
	[CHARACTER_POLICY_V3]: decideCharacterV3,
	// Phase 3 candidates only (offline); no published style uses it until one is approved.
	[CHARACTER_POLICY_V4]: decideCharacterV4,
	// Phase 3.1 candidates only (offline) until a reviewer approves one.
	[CHARACTER_POLICY_V5]: decideCharacterV5,
	// Phase 4 challengers only (offline) until a reviewer approves one.
	[CHARACTER_POLICY_V6]: decideCharacterV6,
	[CHARACTER_POLICY_V7]: decideCharacterV7,
	// Phase 4.1 C1, approved 2026-10-22: a canonical published policy.
	[CHARACTER_POLICY_V8]: decideCharacterV8,
	[CHARACTER_POLICY_V9]: decideCharacterV9
});

/** Policies that read a mind: bots on these styles keep one (server/bots/mind.mjs). */
export const MIND_POLICIES = Object.freeze(
	new Set([
		CHARACTER_POLICY_V3,
		CHARACTER_POLICY_V4,
		CHARACTER_POLICY_V5,
		CHARACTER_POLICY_V6,
		CHARACTER_POLICY_V7,
		CHARACTER_POLICY_V8,
		CHARACTER_POLICY_V9
	])
);
/** Which mind rules (server/bots/mind.mjs MIND_VERSIONS) a mind-keeping policy's bots follow. */
export const MIND_RULES = Object.freeze({
	[CHARACTER_POLICY_V3]: 1,
	[CHARACTER_POLICY_V4]: 2,
	[CHARACTER_POLICY_V5]: 3,
	[CHARACTER_POLICY_V6]: 4,
	[CHARACTER_POLICY_V7]: 1,
	[CHARACTER_POLICY_V8]: 1,
	[CHARACTER_POLICY_V9]: 1
});

/** A decider for one style, or null when this code cannot play it. `mind` is ignored by policies
 * that have none. */
export function deciderFor(style) {
	const policy = style && POLICIES[style.policy];
	return policy
		? (view, botId, random, mind = null) => policy(view, botId, random, style, mind)
		: null;
}
