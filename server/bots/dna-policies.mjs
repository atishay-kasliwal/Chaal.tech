/**
 * Names of the DNA character policies (docs/BOT_BRAIN.md): personality as data on a shared base
 * brain, with a per-session mind from `tp-dna@3`. A leaf module, so the engine's style validation
 * can know them without loading the deciders.
 *
 * These were built as `tp-character@1` to `@4` on the private-club line. They were renamed when the
 * line became canonical on main (docs/bots/CANONICAL.md), because main had already published a
 * different policy as `tp-character@1`. Only the names changed: decisions, traces and minds are
 * byte-identical (tests/server/bot-baseline.test.mjs, and the golden digests).
 */
export const DNA_POLICY_V1 = 'tp-dna@1';
export const DNA_POLICY_V2 = 'tp-dna@2';
export const DNA_POLICY_V3 = 'tp-dna@3';
export const DNA_POLICY_V4 = 'tp-dna@4';
/** Phase 3.1: tp-dna@4 plus recent-event recall and the event quirks (mind@3). Candidates only until approved. */
export const DNA_POLICY_V5 = 'tp-dna@5';
/** Phase 4: tp-dna@3 plus event memory (mind@4) and event quirks. Challengers only until approved. */
export const DNA_POLICY_V6 = 'tp-dna@6';
/** Phase 4: tp-dna@3 plus the cost of staying blind as a base-brain factor. Challengers only. */
export const DNA_POLICY_V7 = 'tp-dna@7';
export const DNA_POLICIES = Object.freeze(
	new Set([
		DNA_POLICY_V1,
		DNA_POLICY_V2,
		DNA_POLICY_V3,
		DNA_POLICY_V4,
		DNA_POLICY_V5,
		DNA_POLICY_V6
	])
);
/** The names these policies had before the rename, for reading older reports and league files. */
export const FORMER_NAMES = Object.freeze({
	[DNA_POLICY_V1]: 'tp-character@1',
	[DNA_POLICY_V2]: 'tp-character@2',
	[DNA_POLICY_V3]: 'tp-character@3',
	[DNA_POLICY_V4]: 'tp-character@4'
});
