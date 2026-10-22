/** Derived cache only. Hand records are authoritative. Runtime never creates schema. */
import { observeHand, MEMORY_VERSION, contextId } from './observations.mjs';
import { emptyMemory, accumulate } from './model.mjs';
import { momentIndexFor, momentsFrom } from './moments.mjs';

export const MEMORY_COLLECTION = 'bot_memory';
export const MEMORY_STATUS = 'bot_memory_status';
export const DIAGNOSTICS_COLLECTION = 'bot_adaptation_reports';
export const PUBLIC_MEMORY_PROJECTION = {
	_id: 1,
	gameType: 1,
	rulesVersion: 1,
	startedAt: 1,
	completedAt: 1,
	nightId: 1,
	handNo: 1,
	seats: 1,
	observers: 1,
	config: 1,
	outcome: 1,
	flows: 1,
	'events.i': 1,
	'events.t': 1,
	'events.p': 1,
	'events.a': 1,
	'events.raw': 1,
	'events.kind': 1,
	'events.cause': 1,
	'events.connected': 1,
	'events.observedBy': 1,
	'events.sub': 1,
	'events.players': 1,
	'events.decision': 1,
	'events.payload.amount': 1,
	'events.payload.botId': 1,
	'shown.p': 1,
	'shown.at': 1,
	'shown.observedBy': 1,
	'lateShown.p': 1,
	'lateShown.t': 1,
	'lateShown.observedBy': 1
};
export async function migrateMemory(db) {
	const names = new Set(
		(await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
	);
	for (const name of [MEMORY_COLLECTION, MEMORY_STATUS, DIAGNOSTICS_COLLECTION]) {
		if (!names.has(name)) await db.createCollection(name);
	}
	await db.command({
		collMod: MEMORY_COLLECTION,
		validator: {
			$jsonSchema: {
				bsonType: 'object',
				required: ['_id', 'schema', 'botId', 'game', 'revision', 'through', 'models'],
				additionalProperties: false,
				properties: Object.fromEntries(
					[
						'_id',
						'schema',
						'botId',
						'game',
						'variant',
						'revision',
						'through',
						'head',
						'hands',
						'models',
						'episodes',
						'recent',
						'styles',
						'updatedAt'
					].map((k) => [k, k === 'schema' ? { enum: [MEMORY_VERSION] } : {}])
				)
			}
		},
		validationLevel: 'strict',
		validationAction: 'error'
	});
	await db
		.collection(MEMORY_COLLECTION)
		.createIndex({ botId: 1, game: 1, variant: 1 }, { unique: true });
	await db.collection(DIAGNOSTICS_COLLECTION).createIndex({ botId: 1, at: -1 });
	await db
		.collection(MEMORY_STATUS)
		.updateOne(
			{ _id: 'schema' },
			{ $set: { version: MEMORY_VERSION, migratedAt: Date.now() } },
			{ upsert: true }
		);
}
export async function memoryReady(db) {
	return (
		(await db.collection(MEMORY_STATUS).findOne({ _id: 'schema' }))?.version === MEMORY_VERSION
	);
}
const newer = (a, b) => !b || a.at > b.at || (a.at === b.at && a.id > b.id);

async function buildContext(db, botId, game, variant, before = Infinity) {
	let model = emptyMemory(botId, game, variant);
	const cursor = db
		.collection('hand_records')
		.find(
			{
				complete: true,
				'seats.bot.botId': botId,
				gameType: game,
				rulesVersion: variant,
				...(Number.isFinite(before) ? { completedAt: { $lt: before } } : {})
			},
			{ projection: PUBLIC_MEMORY_PROJECTION }
		)
		.sort({ completedAt: 1, _id: 1 });
	for await (const record of cursor) {
		const observation = observeHand(record, botId, before);
		if (observation) model = accumulate(model, observation);
	}
	return model;
}

/** Atomic document CAS per bot/game/variant. Concurrent tables cannot overwrite newer memory.
 * Normal path: one read + one replacement, no historical query. Retries/late arrivals rebuild
 * the affected context, which also makes archival retries idempotent without an unbounded log.
 */
async function updateContext(db, botId, game, variant, observation = null) {
	const collection = db.collection(MEMORY_COLLECTION);
	const id = contextId(botId, game, variant);
	for (let attempt = 0; attempt < 8; attempt++) {
		const old = await collection.findOne({ _id: id });
		const base = old?.schema === MEMORY_VERSION ? old : emptyMemory(botId, game, variant);
		const next =
			observation && newer({ at: observation.at, id: observation.handId }, base.head)
				? accumulate(base, observation)
				: await buildContext(db, botId, game, variant);
		next.revision = (old?.revision ?? 0) + 1;
		next.updatedAt = Date.now();
		// Leave headroom under Mongo's document limit; fail visibly without affecting game play.
		if (JSON.stringify(next).length > 8_000_000) throw new Error('MEMORY_CONTEXT_CAPACITY');
		if (!old) {
			try {
				await collection.insertOne(next);
				return next;
			} catch (e) {
				if (e.code !== 11000) throw e;
			}
		} else if (
			(await collection.replaceOne({ _id: id, revision: old.revision }, next)).modifiedCount
		)
			return next;
	}
	throw new Error('MEMORY_UPDATE_CONTENTION');
}

/** Called AFTER the immutable public hand/reveal has been stored. A failure keeps the recorder
 * outbox row queued; the game is never on this path. Missing schema leaves history ready for an
 * explicit migration/rebuild instead of quietly creating unvalidated memory collections. */
export async function updateMemoryForHand(db, handId) {
	if (!(await memoryReady(db))) return { status: 'not-migrated' };
	const start = performance.now();
	const record = await db
		.collection('hand_records')
		.findOne({ _id: handId, complete: true }, { projection: PUBLIC_MEMORY_PROJECTION });
	if (!record) return { status: 'no-hand' };
	const bots = [
		...new Set(record.seats.filter((s) => s.kind === 'bot' && s.bot?.botId).map((s) => s.bot.botId))
	];
	for (const botId of bots) {
		try {
			const observation = observeHand(record, botId);
			if (observation)
				await updateContext(db, botId, record.gameType, record.rulesVersion ?? null, observation);
			// Moment memory is a separate, optional store: its failure never holds back the statistical memory.
			if (observation)
				await momentIndexFor(db)
					.upsert(momentsFrom(observation))
					.catch(() => {});
			await db.collection(MEMORY_STATUS).updateOne(
				{ _id: botId },
				{
					$set: {
						status: 'ready',
						schema: MEMORY_VERSION,
						lastUpdated: Date.now(),
						lastHandId: handId,
						lastError: null,
						updateMs: performance.now() - start
					}
				},
				{ upsert: true }
			);
		} catch (error) {
			await db
				.collection(MEMORY_STATUS)
				.updateOne(
					{ _id: botId },
					{
						$set: {
							status: 'retrying',
							lastError: error.code === 11000 ? 'CONFLICT' : 'MEMORY_UPDATE_FAILED',
							lastErrorAt: Date.now()
						},
						$inc: { errors: 1 }
					},
					{ upsert: true }
				)
				.catch(() => {});
			throw error;
		}
	}
	return { status: 'updated', bots: bots.length, updateMs: performance.now() - start };
}

/** Explicit operator rebuild. Uses only PUBLIC records with this bot dealt in. Atomic context
 * replacement preserves existing memory for live readers until a replacement is complete. */
export async function rebuildMemory(db, { botId } = {}) {
	if (!(await memoryReady(db))) throw new Error('Run bots:memory:migrate before rebuilding');
	if (typeof botId !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(botId))
		throw new Error('A single botId is required');
	const contexts = await db
		.collection('hand_records')
		.aggregate([
			{ $match: { complete: true, 'seats.bot.botId': botId } },
			{ $group: { _id: { game: '$gameType', variant: '$rulesVersion' } } }
		])
		.toArray();
	// Also clear derived contexts whose authoritative source was removed by an operator.
	for (const cached of await db
		.collection(MEMORY_COLLECTION)
		.find({ botId }, { projection: { game: 1, variant: 1 } })
		.toArray())
		if (
			!contexts.some(
				(c) => c._id.game === cached.game && (c._id.variant ?? null) === cached.variant
			)
		)
			contexts.push({ _id: cached });
	const start = performance.now();
	let hands = 0;
	for (const { _id } of contexts)
		hands += (await updateContext(db, botId, _id.game, _id.variant ?? null)).hands;
	await db.collection(MEMORY_STATUS).updateOne(
		{ _id: botId },
		{
			$set: {
				status: 'ready',
				schema: MEMORY_VERSION,
				rebuiltAt: Date.now(),
				lastError: null,
				rebuildMs: performance.now() - start
			}
		},
		{ upsert: true }
	);
	return { botId, contexts: contexts.length, hands, elapsedMs: performance.now() - start };
}
