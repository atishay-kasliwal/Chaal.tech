/**
 * Reference definitions of the DNA characters (docs/BOT_BRAIN.md, docs/bots/CANONICAL.md): every
 * version of each character's style on the `tp-dna` policies, frozen in code.
 *
 * These are references, not publications. A live table only seats a style published through the
 * bot directory (server/bots/directory.mjs, immutable `<botId>@<n>` versions in the database); the
 * DNA publish script copies a reference there and refuses unless its configuration hash matches.
 * The simulator, the golden tests and the reports seat these references directly, through the same
 * validated embedded-style path the engine uses for published styles.
 *
 * A reference's `_id` is `<botId>@<version>` within this family (v1 to v3); the published database
 * version of the same configuration gets the bot's next directory version. The two are told apart by
 * `policy` (tp-dna@n) and `configHash`, which every recorded seat carries.
 */
import { CHARACTER_DNA_V1, CHARACTER_DNA_V2, CHARACTER_DNA_V3 } from './dna-characters.mjs';
import { CHARACTER_POLICY } from './character.mjs';
import { CHARACTER_POLICY_V2 } from './character-v2.mjs';
import { CHARACTER_POLICY_V3 } from './character-v3.mjs';
import { CAST } from '../../src/lib/bots/cast.js';
import { styleConfigHash, LEGACY_STYLES, STYLES as LEGACY_STYLE_IDS } from './identity.mjs';
export { LEGACY_STYLES };

const VERSIONS = {
	1: { dna: CHARACTER_DNA_V1, policy: CHARACTER_POLICY },
	2: { dna: CHARACTER_DNA_V2, policy: CHARACTER_POLICY_V2 },
	3: { dna: CHARACTER_DNA_V3, policy: CHARACTER_POLICY_V3 }
};

function referenceStyle(botId, version) {
	const { dna, quirks, tempo } = VERSIONS[version].dna[botId];
	const config = {
		policy: VERSIONS[version].policy,
		tendencies: { dna: { ...dna }, quirks: quirks.map((q) => ({ ...q })), tempo: { ...tempo } },
		supportedGames: ['teen-patti']
	};
	return Object.freeze({
		_id: `${botId}@${version}`,
		botId,
		version,
		parent: version > 1 ? `${botId}@${version - 1}` : null,
		status: 'published',
		reference: 'dna',
		...config,
		supportedVariants: ['*'],
		difficulty: { declared: null },
		configHash: styleConfigHash(config),
		source: 'manual'
	});
}

const family = (version) =>
	Object.freeze(Object.fromEntries(CAST.map(({ id }) => [id, referenceStyle(id, version)])));

/** Every reference version of each character, by character id. */
export const CHARACTER_STYLES_V1 = family(1);
export const CHARACTER_STYLES_V2 = family(2);
export const CHARACTER_STYLES_V3 = family(3);
/** Phase 2 (tp-dna@3): the approved reference for Rohit, Virat, Samay and Dhoni. */
export const CHARACTER_STYLES = CHARACTER_STYLES_V3;

/** Legacy styles and every DNA reference, by style id (the simulator's and reports' catalogue). */
export const STYLES = Object.freeze({
	...LEGACY_STYLE_IDS,
	...Object.fromEntries(
		[CHARACTER_STYLES_V1, CHARACTER_STYLES_V2, CHARACTER_STYLES_V3].flatMap((f) =>
			Object.values(f).map((s) => [s._id, s])
		)
	)
});

/** The style a seated bot plays: the style it sat down with, or its legacy level's. */
export function styleForSeat(bot) {
	return bot?.style ?? LEGACY_STYLES[bot?.level] ?? null;
}
