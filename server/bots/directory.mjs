/** Permanent global characters, immutable publications, club availability. */
import { ClubError } from '../club/members.mjs';
import { BOT_CHARACTERS } from '../../shared/bot-characters.mjs';
import { CHARACTER_SEEDS } from './characters.mjs';
import { LEGACY_BOTS } from './identity.mjs';
import { CHARACTER_POLICY, characterHash, configErrors, runtimeStyle } from './config.mjs';
import { validateStyle } from './validation.mjs';
import { identityForStyle } from './identity.mjs';
import { playerRecords } from '../analytics/data.mjs';
import { publicMemory } from './memory/diagnostics.mjs';
import { ADAPTIVE_POLICY, defaultMemory } from './memory/adaptive.mjs';
import { rivalry, rivalries } from '../analytics/compute/rivals.mjs';
import { momentIndexFor, recallRelationship } from './memory/moments.mjs';

const fail = (message, status = 400) => new ClubError(message, 'INVALID_BOT_REQUEST', status);
const statuses = ['draft', 'active', 'disabled', 'retired'];
const fields = ['name', 'description', 'personality', 'avatar'];
export const DEFAULT_BOT_IDS = CHARACTER_SEEDS.map((seed) => seed.bot._id);

function ownerOnly(member) {
	if (member?.role !== 'owner' || member.status === 'suspended')
		throw fail('Only owners manage bots', 403);
}
function cleanId(id) {
	if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(id) || id.startsWith('legacy-'))
		throw fail('Use a unique lowercase character slug');
	return id;
}
function cleanIdentity(input) {
	if (typeof input?.name !== 'string' || !input.name.trim() || input.name.trim().length > 24)
		throw fail('Name must be 1–24 characters');
	if (typeof input.description !== 'string' || input.description.length > 400)
		throw fail('Description must be at most 400 characters');
	const personality = input.personality;
	if (
		typeof personality?.title !== 'string' ||
		personality.title.length > 60 ||
		!Array.isArray(personality.traits) ||
		personality.traits.length > 4 ||
		personality.traits.some((t) => typeof t !== 'string' || !t.trim() || t.length > 24)
	)
		throw fail('Add a short style title and up to four traits');
	if (!BOT_CHARACTERS.some((art) => art.mascotId === input.avatar?.mascotId))
		throw fail('Choose approved character artwork');
	return {
		name: input.name.trim(),
		description: input.description.trim(),
		personality: {
			title: personality.title.trim(),
			traits: personality.traits.map((t) => t.trim())
		},
		avatar: { mascotId: input.avatar.mascotId }
	};
}
function draftConfig(input) {
	const config = {
		policy: input?.policy,
		...(input?.memory !== undefined ? { memory: structuredClone(input.memory) } : {}),
		tendencies: input?.tendencies,
		supportedGames: input?.supportedGames,
		supportedVariants: input?.supportedVariants,
		difficulty: { declared: input?.difficulty?.declared, measured: null }
	};
	config.configHash = characterHash(config);
	const errors = configErrors(config);
	if (errors.length) throw fail(errors.join('; '));
	if (input.source !== undefined && !['manual', 'ai-assisted'].includes(input.source))
		throw fail('Unknown draft source');
	return {
		...config,
		source: input.source ?? 'manual',
		notes: typeof input.notes === 'string' ? input.notes.slice(0, 1000) : ''
	};
}

export async function enabledBotIds(db) {
	const settings = await db.collection('club_settings').findOne({ _id: 'club' });
	return Array.isArray(settings?.botIds) ? settings.botIds : DEFAULT_BOT_IDS;
}

function publicBot(bot, style, enabled) {
	return {
		botId: bot._id,
		slug: bot.slug ?? bot._id,
		name: bot.name,
		avatar: bot.avatar ?? null,
		description: bot.description,
		personality: bot.personality,
		status: bot.status,
		available: enabled && bot.status === 'active' && !!style,
		style: style
			? {
					styleId: style._id,
					version: style.version,
					supportedGames: style.supportedGames,
					difficulty: style.difficulty,
					publishedAt: style.publishedAt,
					validation: {
						simulationHands: style.validation?.simulation?.hands ?? 0,
						predictability: style.validation?.predictability?.status ?? 'not-measured'
					}
				}
			: null
	};
}

export async function botDirectory(db, member, { id } = {}) {
	const enabled = new Set(await enabledBotIds(db));
	const query = id
		? { _id: id, status: { $in: ['active', 'retired'] } }
		: { status: 'active', _id: { $in: [...enabled] } };
	const bots = await db
		.collection('bots')
		.find(query)
		.sort({ order: 1, createdAt: 1, _id: 1 })
		.toArray();
	if (id && !bots.length) throw fail('Unknown bot', 404);
	const records = member.playerId ? await playerRecords(db, member.playerId) : [];
	const history = id
		? null
		: new Map(rivalries(records, member.playerId).map((r) => [r.subject, r]));
	const list = [];
	for (const bot of bots) {
		const style = await db
			.collection('bot_styles')
			.findOne({ _id: bot.currentStyle, status: 'published' });
		if (!id && !style) continue;
		list.push({
			...publicBot(bot, style, enabled.has(bot._id)),
			memory: await publicMemory(db, bot._id, member.playerId).catch(() => ({ status: 'unavailable', contexts: [], moment: null })),
			// What this bot remembers of the viewer's moments with it, for table talk. Their own history only.
			recall: member.playerId ? await recallRelationship(momentIndexFor(db), { botId: bot._id, playerId: member.playerId }).catch(() => ({ moments: 0, mood: 'new', lastAt: null })) : { moments: 0, mood: 'new', lastAt: null },
			record: id
				? rivalry(records, member.playerId, `bot:${bot._id}`)
				: (history.get(`bot:${bot._id}`) ?? null)
		});
	}
	return id ? { bot: list[0] } : { bots: list, historyLimit: 5000 };
}

/** Called for every new seat; clients never select a level or provide policy/config. */
export async function botSeat(db, room, requestedId) {
	if (
		requestedId !== undefined &&
		requestedId !== '' &&
		(typeof requestedId !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(requestedId))
	)
		throw fail('Choose a bot character');
	const enabled = await enabledBotIds(db);
	const occupied = new Set(
		room.players.filter((p) => !p.departed && p.bot).map((p) => p.bot.style?.botId)
	);
	const candidates = requestedId
		? []
		: await db
				.collection('bots')
				.find({ _id: { $in: enabled }, status: 'active' })
				.sort({ order: 1, _id: 1 })
				.toArray();
	const id = requestedId || candidates.find((bot) => !occupied.has(bot._id))?._id;
	if (!id || !enabled.includes(id)) throw fail('That bot is not available in this club');
	if (occupied.has(id)) throw fail('That character is already at the table');
	const bot = await db.collection('bots').findOne({ _id: id, status: 'active' });
	const style =
		bot &&
		(await db
			.collection('bot_styles')
			.findOne({ _id: bot.currentStyle, botId: id, status: 'published' }));
	if (!style || configErrors(style).length) throw fail('That bot has no playable published style');
	if (!style.supportedGames.includes(room.gameType ?? 'teen-patti'))
		throw fail('This bot plays Teen Patti only');
	return {
		name: bot.name,
		level: 'normal',
		characterId: BOT_CHARACTERS.find((art) => art.mascotId === bot.avatar?.mascotId)?.id,
		mascotId: bot.avatar?.mascotId,
		style: runtimeStyle(style),
		identity: identityForStyle(style)
	};
}

export async function adminBots(db, owner) {
	ownerOnly(owner);
	return {
		bots: await db.collection('bots').find({}).sort({ order: 1, createdAt: 1, _id: 1 }).toArray(),
		styles: await db.collection('bot_styles').find({}).sort({ botId: 1, version: -1 }).toArray(),
		enabledBotIds: await enabledBotIds(db),
		artwork: BOT_CHARACTERS,
		policy: CHARACTER_POLICY,
		defaults: CHARACTER_SEEDS[0].style
	};
}

export async function manageBot(db, owner, body, now = new Date()) {
	ownerOnly(owner);
	const actor = String(owner._id);
	if (body?.action === 'availability') {
		if (
			!Array.isArray(body.botIds) ||
			body.botIds.length > 100 ||
			new Set(body.botIds).size !== body.botIds.length ||
			body.botIds.some((id) => typeof id !== 'string')
		)
			throw fail('Choose available bots');
		const active = await db
			.collection('bots')
			.countDocuments({ _id: { $in: body.botIds }, status: 'active' });
		if (active !== body.botIds.length) throw fail('Only active bots can be enabled');
		await db
			.collection('club_settings')
			.updateOne(
				{ _id: 'club' },
				{ $set: { botIds: body.botIds, botsUpdatedAt: now, botsUpdatedBy: actor } },
				{ upsert: true }
			);
		return;
	}
	if (body?.action === 'create') {
		const id = cleanId(body.botId);
		try {
			await db.collection('bots').insertOne({
				_id: id,
				slug: id,
				...cleanIdentity(body.identity),
				status: 'draft',
				currentStyle: null,
				nextVersion: 0,
				currentVersion: 0,
				createdAt: now,
				updatedAt: now,
				createdBy: actor
			});
		} catch (error) {
			if (error.code === 11000) throw fail('That character slug already exists', 409);
			throw error;
		}
		return;
	}
	const id = cleanId(body?.botId);
	const bot = await db.collection('bots').findOne({ _id: id });
	if (!bot) throw fail('Unknown bot', 404);
	if (body.action === 'adaptive-draft') {
		const current = await db.collection('bot_styles').findOne({ _id: bot.currentStyle, status: 'published' });
		if (!current) throw fail('Publish a base character style first');
		return manageBot(db, owner, { action: 'draft', botId: id, config: {
			...current, policy: ADAPTIVE_POLICY, memory: current.memory ?? defaultMemory(current.tendencies),
			notes: 'Persistent observer-scoped memory. Bounded adaptation; existing seats keep their frozen policy.'
		} }, now);
	}
	if (body.action === 'identity') {
		if (bot.status !== 'draft') throw fail('Only draft identities can be edited');
		const identity = cleanIdentity(body.identity);
		await db
			.collection('bots')
			.updateOne(
				{ _id: id, status: 'draft' },
				{ $set: { ...Object.fromEntries(fields.map((f) => [f, identity[f]])), updatedAt: now } }
			);
	} else if (body.action === 'status') {
		if (!statuses.includes(body.status)) throw fail('Unknown status');
		if (bot.status === 'retired' && body.status !== 'retired')
			throw fail('Retirement is permanent. Create a new character instead.');
		if (body.status === 'draft' && bot.status !== 'draft')
			throw fail('Published identities cannot return to draft');
		if (
			body.status === 'active' &&
			!(await db.collection('bot_styles').findOne({ _id: bot.currentStyle, status: 'published' }))
		)
			throw fail('Publish a validated style first');
		await db.collection('bots').updateOne(
			{ _id: id, status: bot.status },
			{
				$set: {
					status: body.status,
					updatedAt: now,
					...(body.status === 'retired' ? { retiredAt: now, retiredBy: actor } : {})
				}
			}
		);
	} else if (body.action === 'draft') {
		if (bot.status === 'retired') throw fail('Retired characters cannot receive new styles');
		const config = draftConfig(body.config);
		const updated = await db
			.collection('bots')
			.findOneAndUpdate(
				{ _id: id, status: { $ne: 'retired' } },
				{ $inc: { nextVersion: 1 } },
				{ returnDocument: 'after' }
			);
		if (!updated) throw fail('Character changed. Refresh and try again.', 409);
		const version = updated.nextVersion;
		await db.collection('bot_styles').insertOne({
			_id: `${id}@${version}`,
			botId: id,
			version,
			parent: bot.currentStyle,
			...config,
			status: 'draft',
			revision: 0,
			createdAt: now,
			createdBy: actor
		});
	} else if (['edit-style', 'validate', 'publish'].includes(body.action)) {
		if (
			typeof body.styleId !== 'string' ||
			!body.styleId.startsWith(`${id}@`) ||
			!/^.+@[1-9][0-9]*$/.test(body.styleId)
		)
			throw fail('Choose a style version');
		const style = await db.collection('bot_styles').findOne({ _id: body.styleId, botId: id });
		// Resume the pointer write if a previous publication succeeded before the connection
		// failed. The published document is never edited, and retries cannot roll back a newer style.
		if (body.action === 'publish' && style?.status === 'published') {
			if (bot.status === 'retired') throw fail('Retired characters cannot publish styles');
			if (
				configErrors(style).length ||
				!style.validation?.passed ||
				style.validation.configHash !== style.configHash
			)
				throw fail('Published validation does not match this configuration');
			await db
				.collection('bots')
				.updateOne(
					{ _id: id, status: { $ne: 'retired' }, currentVersion: { $lt: style.version } },
					{ $set: { currentStyle: style._id, currentVersion: style.version, updatedAt: now } }
				);
			return;
		}
		if (!style || style.status !== 'draft')
			throw fail('Published styles are immutable. Create a new draft.');
		const match = { _id: style._id, status: 'draft', revision: style.revision };
		let result;
		if (body.action === 'edit-style') {
			if (body.revision !== style.revision)
				throw fail('Draft changed. Reload before editing.', 409);
			result = await db.collection('bot_styles').updateOne(match, {
				$set: { ...draftConfig(body.config), validation: null, updatedAt: now },
				$inc: { revision: 1 }
			});
		} else if (body.action === 'validate') {
			const validation = { ...validateStyle(style), at: now, by: actor };
			result = await db.collection('bot_styles').updateOne(match, { $set: { validation } });
		} else {
			if (bot.status === 'retired') throw fail('Retired characters cannot publish styles');
			if (
				configErrors(style).length ||
				!style.validation?.passed ||
				style.validation.configHash !== style.configHash
			)
				throw fail('Validate this exact draft before publishing');
			result = await db
				.collection('bot_styles')
				.updateOne(match, { $set: { status: 'published', publishedAt: now, publishedBy: actor } });
			if (!result.matchedCount) throw fail('Draft changed. Validate again.', 409);
			// A racing publication can advance, never move currentStyle back to an older version.
			await db
				.collection('bots')
				.updateOne(
					{ _id: id, status: { $ne: 'retired' }, currentVersion: { $lt: style.version } },
					{ $set: { currentStyle: style._id, currentVersion: style.version, updatedAt: now } }
				);
		}
		if (!result.matchedCount) throw fail('Draft changed. Refresh and try again.', 409);
	} else throw fail('Unknown bot action');
}

/** Explicit operator migration, never run on a member request. Does not rewrite any hands. */
export async function seedCharacters(db, now = new Date()) {
	for (const seed of CHARACTER_SEEDS) {
		const validation = validateStyle(seed.style);
		if (!validation.passed)
			throw new Error(`Seed ${seed.bot._id}: ${validation.errors.join('; ')}`);
		const style = {
			...seed.style,
			status: 'published',
			validation,
			publishedAt: now,
			publishedBy: 'seed-phase3',
			createdAt: now
		};
		await db
			.collection('bot_styles')
			.updateOne({ _id: style._id }, { $setOnInsert: style }, { upsert: true });
		const stored = await db.collection('bot_styles').findOne({ _id: style._id });
		if (stored.configHash !== style.configHash || stored.status !== 'published')
			throw new Error(`Existing seed style differs: ${style._id}`);
		await db
			.collection('bots')
			.updateOne(
				{ _id: seed.bot._id },
				{ $setOnInsert: { ...seed.bot, createdAt: now, updatedAt: now, createdBy: 'seed-phase3' } },
				{ upsert: true }
			);
	}
	// Legacy records and styles stay exactly resolvable; only new-seat availability changes.
	await db
		.collection('bots')
		.updateMany(
			{ _id: { $in: LEGACY_BOTS.map((bot) => bot._id) }, status: 'active' },
			{ $set: { status: 'retired', retiredAt: now } }
		);
}
