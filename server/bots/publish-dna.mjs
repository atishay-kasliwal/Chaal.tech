/**
 * Publish the canonical DNA characters (server/bots/dna-styles.mjs CANONICAL_STYLES) as each bot's
 * next immutable directory version, through the same draft, validate and publish path the admin
 * page uses. Earlier versions are never edited. A style is published only if the drafted
 * configuration is exactly the reference (same hash, same genes); a bot already on it is skipped.
 */
import { manageBot } from './directory.mjs';
import { characterHash } from './config.mjs';
import { canonicalJson } from '../analytics/hash.mjs';
import { CANONICAL_STYLES } from './dna-styles.mjs';

/**
 * Player-facing copy for the canonical characters, matching how they now play. Applied only with
 * `descriptions: true`; the previous text is kept in the bot's `identityHistory`. Names and artwork
 * never change.
 */
export const CANONICAL_COPY = Object.freeze({
	'rohit-sharma': {
		title: 'The Blind King',
		description:
			'Loves playing blind and keeps the pressure on without looking. Win a hand blind and he gets bolder.',
		traits: ['blind', 'bold']
	},
	'virat-kohli': {
		title: 'All aggression',
		description:
			'Raises often, bluffs more than anyone and gets fiercer after a painful loss. Dangerous, not reckless.',
		traits: ['aggressive', 'fiery']
	},
	gg: {
		title: 'The rock',
		description:
			'Plays few hands and means it when he raises. Hard to pull chips from, quick to let a bad spot go.',
		traits: ['tight', 'disciplined']
	},
	'samay-raina': {
		title: 'The curious caller',
		description:
			'Hates folding once he is in. Calls to see what you have, and catches more bluffs than most.',
		traits: ['curious', 'stubborn']
	},
	'ms-dhoni': {
		title: 'Captain Cool',
		description:
			'Starts balanced, watches how you play and adjusts. Bluffs the timid and makes the callers pay.',
		traits: ['adaptive', 'calm']
	}
});

const configOf = (ref, declared) => ({
	policy: ref.policy,
	tendencies: structuredClone(ref.tendencies),
	supportedGames: [...ref.supportedGames],
	supportedVariants: [...ref.supportedVariants],
	difficulty: { declared }
});
const notesFor = (ref) =>
	ref.phase3
		? `Canonical DNA character: Phase 3 candidate ${ref.phase3.candidate} on ${ref.policy} (reference ${ref._id}, hash ${ref.configHash}; measured as ${ref.phase3.formerPolicy} ${ref.phase3.formerHash}; docs/bots/PHASE3_REPORT.md).`
		: `Canonical DNA character: Phase 2 reference ${ref._id} on ${ref.policy} (hash ${ref.configHash}; docs/bots/PHASE2_REPORT.md).`;

/** New copy for one bot, recording what it replaces. Only the title, description and traits. */
async function refreshCopy(db, owner, botId, now) {
	const copy = CANONICAL_COPY[botId];
	const bot = await db.collection('bots').findOne({ _id: botId });
	if (!bot || (bot.description === copy.description && bot.personality?.title === copy.title))
		return false;
	await db.collection('bots').updateOne(
		{ _id: botId },
		{
			$set: {
				description: copy.description,
				personality: { ...bot.personality, title: copy.title, traits: [...copy.traits] },
				updatedAt: now
			},
			$push: {
				identityHistory: {
					at: now,
					by: String(owner._id),
					reason: 'Canonical DNA characters (docs/bots/CANONICAL.md)',
					previous: { description: bot.description, personality: bot.personality ?? null }
				}
			}
		}
	);
	return true;
}

/** `publish: false` (the default) only reports the plan; `descriptions: true` also applies CANONICAL_COPY. */
export async function publishDna(
	db,
	owner,
	{ publish = false, descriptions = false, log = () => {}, now = Date.now() } = {}
) {
	const out = [];
	if (publish && descriptions)
		for (const botId of Object.keys(CANONICAL_STYLES))
			if (await refreshCopy(db, owner, botId, now)) log(`${botId}: new description`);
	for (const [botId, ref] of Object.entries(CANONICAL_STYLES)) {
		const bot = await db.collection('bots').findOne({ _id: botId });
		if (!bot || bot.status === 'retired') {
			out.push({ botId, skipped: bot ? 'retired' : 'no such bot in the directory' });
			continue;
		}
		const current = bot.currentStyle
			? await db.collection('bot_styles').findOne({ _id: bot.currentStyle })
			: null;
		const config = configOf(ref, current?.difficulty?.declared ?? 'balanced');
		const expected = characterHash(config);
		if (current?.status === 'published' && current.configHash === expected) {
			out.push({ botId, skipped: `already on ${ref._id}`, styleId: current._id });
			continue;
		}
		if (!publish) {
			out.push({
				botId,
				plan: `${current?._id ?? 'none'} -> next version, ${ref._id} (${ref.policy})`,
				configHash: expected
			});
			continue;
		}
		await manageBot(db, owner, {
			action: 'draft',
			botId,
			config: { ...config, source: 'manual', notes: notesFor(ref) }
		});
		const after = await db.collection('bots').findOne({ _id: botId });
		const styleId = `${botId}@${after.nextVersion}`;
		const drafted = await db.collection('bot_styles').findOne({ _id: styleId });
		if (
			drafted.configHash !== expected ||
			canonicalJson(drafted.tendencies) !== canonicalJson(ref.tendencies)
		)
			throw new Error(`${styleId} does not match reference ${ref._id}`);
		await manageBot(db, owner, { action: 'validate', botId, styleId });
		const validated = await db.collection('bot_styles').findOne({ _id: styleId });
		if (!validated.validation?.passed)
			throw new Error(
				`${styleId} failed validation: ${(validated.validation?.errors ?? []).join('; ')}`
			);
		await manageBot(db, owner, { action: 'publish', botId, styleId });
		log(`${botId}: published ${styleId} = ${ref._id} (${ref.policy}, ${expected})`);
		out.push({
			botId,
			styleId,
			reference: ref._id,
			policy: ref.policy,
			configHash: expected,
			previous: current?._id ?? null
		});
	}
	return out;
}
