/**
 * The engine build that recorded hands name (docs/archive/ANALYTICS_OPERATIONS.md). Set at deploy time by
 * scripts/deploy-backend.mjs as ENGINE_BUILD: a git commit, `-dirty-…` only when explicitly
 * allowed. `dev` and `test` exist for local wrangler and the test suite. Anything else is invalid:
 * the Worker then refuses game traffic and /health reports 503, so it cannot run unidentified.
 */
export const BUILD_PATTERN = /^(?:[0-9a-f]{7,40}(?:-dirty-[0-9a-z]{4,16})?|dev|test)$/;

export function engineBuild(env) {
	const id = env?.ENGINE_BUILD;
	return typeof id === 'string' && BUILD_PATTERN.test(id) ? id : null;
}
