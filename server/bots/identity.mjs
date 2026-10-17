/**
 * Permanent bot identities and their immutable style versions (docs/ANALYTICS_SPEC.md §15.3).
 *
 * A bot is a character (`botId`); a style is one published version of how it plays
 * (`styleId` = `${botId}@${version}`). A style never changes once published: its `configHash`
 * covers the policy and every tendency, and is stored on every bot seat the recorder writes, so
 * an old hand always resolves to exactly the behaviour that played it.
 *
 * Phase 1 ships only the legacy bots: today's easy / normal / hard levels, each with style @1.
 * Character bots arrive later as new bots with their own styles; nothing here is ever edited.
 */
import { PROFILES } from './strategy.mjs';
import { canonicalJson, fingerprint64 } from '../analytics/hash.mjs';

/** The decision code a style's tendencies are interpreted by (server/bots/strategy.mjs decide). */
export const LEGACY_POLICY = 'tp-heuristic@1';

export function styleConfigHash({ policy, tendencies, supportedGames }) {
	return fingerprint64(canonicalJson({ policy, tendencies, supportedGames }));
}

function legacyStyle(level) {
	const config = {
		policy: LEGACY_POLICY,
		tendencies: { ...PROFILES[level] },
		supportedGames: ['teen-patti']
	};
	return Object.freeze({
		_id: `legacy-${level}@1`,
		botId: `legacy-${level}`,
		version: 1,
		parent: null,
		status: 'published',
		...config,
		supportedVariants: ['*'],
		difficulty: { declared: level },
		configHash: styleConfigHash(config),
		source: 'manual'
	});
}

export const LEGACY_STYLES = Object.freeze(
	Object.fromEntries(['easy', 'normal', 'hard'].map((level) => [level, legacyStyle(level)]))
);

export const LEGACY_BOTS = Object.freeze(
	Object.values(LEGACY_STYLES).map((style) =>
		Object.freeze({
			_id: style.botId,
			name: `${style.difficulty.declared[0].toUpperCase()}${style.difficulty.declared.slice(1)} bot`,
			description: 'The original table bot, before character bots.',
			personality: {},
			status: 'active',
			currentStyle: style._id
		})
	)
);

/** Every published style the running code can play, by styleId. */
export const STYLES = Object.freeze(
	Object.fromEntries(Object.values(LEGACY_STYLES).map((style) => [style._id, style]))
);

/** The identity frozen onto a bot seat when it joins a table. */
export function identityForStyle(style) {
	return {
		botId: style.botId,
		styleId: style._id,
		styleVersion: style.version,
		configHash: style.configHash,
		policy: style.policy
	};
}

/** Today a table adds a bot by level; that resolves to the legacy bot's current style. */
export function identityForLevel(level) {
	const style = LEGACY_STYLES[level];
	return style ? identityForStyle(style) : null;
}

/** Identity only; the full configuration lives exclusively in sealed room/replay state. */
export function identityForSeat(bot) {
	return bot?.style ? identityForStyle(bot.style) : identityForLevel(bot?.level);
}
