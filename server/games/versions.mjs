/**
 * What a recorded hand must be replayed with (docs/ANALYTICS_OPERATIONS.md, "Versioning").
 *
 * A hand records its game, game version, rules version and variant version. Replay runs only
 * when this code still implements exactly those versions; otherwise it is reported unavailable,
 * never approximated with newer behaviour.
 *
 * Changing how an existing game or variant plays is a new version: bump GAME_VERSIONS (or add a
 * new rulesVersion for a variant) and keep the old implementation if old hands must stay
 * replayable. tests/server/recorder-versions.test.mjs (the replay corpus) fails if a change alters recorded hands.
 */
import { getVariant } from '../variants/index.mjs';

/** The engine version of each game as implemented by this code. */
export const GAME_VERSIONS = Object.freeze({
	'teen-patti': 1,
	'texas-holdem': 1,
	blackjack: 1,
	rummy: 1,
	'three-two-five': 1,
	'ten-pakad': 1
});

/** Game versions this code can replay exactly (the current one, plus any kept older ones). */
export const REPLAYABLE_GAME_VERSIONS = Object.freeze({
	'teen-patti': Object.freeze([1]),
	'texas-holdem': Object.freeze([1]),
	blackjack: Object.freeze([1]),
	rummy: Object.freeze([1]),
	'three-two-five': Object.freeze([1]),
	'ten-pakad': Object.freeze([1])
});

/** Every version a hand dealt in this room state is played under. */
export function handVersions(room, { engine, recorder }) {
	const game = room.gameType ?? 'teen-patti';
	const variant = game === 'teen-patti' ? getVariant(room.rulesVersion) : null;
	return {
		engine: engine ?? null,
		recorder,
		game,
		gameVersion: GAME_VERSIONS[game] ?? null,
		rulesVersion: room.rulesVersion ?? null,
		variant: variant ? { id: variant.id, version: variant.version } : null
	};
}

/** Null when this code can replay the hand exactly; otherwise why it cannot. */
export function replayUnavailable(versions) {
	if (!versions) return 'versions-not-recorded';
	if (!versions.engine) return 'engine-build-missing';
	const supported = REPLAYABLE_GAME_VERSIONS[versions.game];
	if (!supported) return `game-unavailable:${versions.game}`;
	if (!supported.includes(versions.gameVersion))
		return `game-version-unavailable:${versions.game}@${versions.gameVersion}`;
	if (versions.game === 'teen-patti') {
		const variant = getVariant(versions.rulesVersion);
		if (!variant) return `rules-unavailable:${versions.rulesVersion}`;
		if (
			versions.variant &&
			(variant.id !== versions.variant.id || variant.version !== versions.variant.version)
		)
			return `variant-version-unavailable:${versions.variant.id}@${versions.variant.version}`;
	}
	return null;
}
