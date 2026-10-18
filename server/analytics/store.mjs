/**
 * MongoDB side of the hand recorder: schema (validators that keep each tier to its own fields),
 * indexes, the immutable bot identity registry, the outbox writer, and recorder health.
 *
 * Two kinds of access, kept apart (docs/ANALYTICS_OPERATIONS.md):
 * - Migration (`migrateAnalytics`, run by `npm run analytics:migrate` with an admin connection)
 *   creates collections, validators and indexes and publishes bot styles.
 * - Runtime (`archiveRecorderRow`, the Worker's account) only reads and writes documents. It
 *   refuses to write until the schema is migrated, so a missing migration never creates
 *   unvalidated collections; rows simply wait in the room's outbox, visibly.
 *
 * Write order for a hand is sealed → private → public. The public record is written last, so its
 * presence means the hand is complete; a failure part-way leaves no public record and the outbox
 * row stays queued to retry (every write is an idempotent upsert keyed by a deterministic id).
 */
import { finishCapture } from './recorder.mjs';
import { updateMemoryForHand } from '../bots/memory/store.mjs';
import { recordAdaptationReport } from '../bots/memory/diagnostics.mjs';
import { LEGACY_BOTS, STYLES } from '../bots/identity.mjs';

export const SCHEMA_VERSION = 2;
export const COLLECTIONS = Object.freeze({
	records: 'hand_records',
	private: 'hand_private',
	sealed: 'hand_sealed',
	nights: 'night_events',
	failures: 'recorder_failures',
	status: 'recorder_status',
	bots: 'bots',
	styles: 'bot_styles',
	meta: 'analytics_meta'
});

export class IdentityConflict extends Error {
	constructor(message) {
		super(message);
		this.name = 'IdentityConflict';
	}
}
export class NotReady extends Error {}
export class SchemaNotReady extends Error {
	constructor(found) {
		super(`Analytics schema is at version ${found}, needs ${SCHEMA_VERSION}: run npm run analytics:migrate`);
		this.name = 'SchemaNotReady';
	}
}

const PUBLIC_FIELDS = [
	'_id', 'v', 'recorder', 'engine', 'versions', 'room', 'handId', 'nightId', 'handNo', 'prevHandId',
	'gameType', 'rulesVersion', 'startedAt', 'completedAt', 'practice', 'config', 'pick', 'seal',
	'seats', 'firstActor', 'buttonSeat', 'observers', 'table', 'events', 'outcome', 'shown', 'flows',
	'verified', 'complete', 'lateShown'
];
const SEAT_FIELDS = ['p', 'kind', 'seat', 'order', 'stack', 'hidden', 'connected', 'bot'];
const PRIVATE_FIELDS = [
	'_id', 'handId', 'p', 'room', 'completedAt', 'gameType', 'rulesVersion', 'dealt', 'final',
	'seenAt', 'label', 'equity'
];
const SEALED_FIELDS = [
	'_id', 'recorder', 'engine', 'versions', 'status', 'hand', 'finalHash', 'codec', 'z', 'size', 'storedAt'
];
const props = (fields) => Object.fromEntries(fields.map((field) => [field, {}]));

/**
 * Storage-enforced tiers: the public collection cannot hold a deck, replay inputs, hidden stacks
 * or bot traces, and a seat cannot carry cards. Unknown fields are rejected outright.
 */
export const VALIDATORS = Object.freeze({
	[COLLECTIONS.records]: {
		$jsonSchema: {
			bsonType: 'object',
			required: ['_id', 'v', 'versions', 'room', 'handId', 'nightId', 'gameType', 'seats', 'events', 'outcome', 'verified', 'complete'],
			additionalProperties: false,
			properties: {
				...props(PUBLIC_FIELDS),
				complete: { enum: [true] },
				seats: {
					bsonType: 'array',
					items: { bsonType: 'object', additionalProperties: false, properties: props(SEAT_FIELDS) }
				}
			}
		}
	},
	[COLLECTIONS.private]: {
		$jsonSchema: {
			bsonType: 'object',
			required: ['_id', 'handId', 'p', 'dealt'],
			additionalProperties: false,
			properties: props(PRIVATE_FIELDS)
		}
	},
	[COLLECTIONS.sealed]: {
		$jsonSchema: {
			bsonType: 'object',
			required: ['_id', 'status', 'codec', 'z'],
			additionalProperties: false,
			properties: { ...props(SEALED_FIELDS), codec: { enum: ['gzip-json'] }, z: { bsonType: 'binData' } }
		}
	},
	[COLLECTIONS.styles]: {
		$jsonSchema: {
			bsonType: 'object',
			required: ['_id', 'botId', 'version', 'policy', 'tendencies', 'supportedGames', 'configHash'],
			properties: { version: { bsonType: ['int', 'long', 'double'], minimum: 1 } }
		}
	}
});

const INDEXES = {
	[COLLECTIONS.records]: [
		[{ completedAt: -1 }],
		[{ 'seats.p': 1, completedAt: -1 }],
		[{ gameType: 1, rulesVersion: 1, completedAt: -1 }],
		[{ nightId: 1, handNo: 1 }],
		[{ 'seats.bot.botId': 1, completedAt: -1 }]
	],
	[COLLECTIONS.private]: [[{ p: 1, completedAt: -1 }], [{ handId: 1 }]],
	[COLLECTIONS.sealed]: [[{ status: 1 }]],
	[COLLECTIONS.failures]: [[{ at: -1 }], [{ handId: 1 }], [{ reason: 1 }]],
	[COLLECTIONS.status]: [[{ consecutiveFailures: -1 }]],
	[COLLECTIONS.styles]: [[{ botId: 1, version: -1 }, { unique: true }]],
	[COLLECTIONS.bots]: [[{ status: 1 }]]
};

/**
 * Admin only: create or update collections, validators and indexes; publish code-defined bot
 * styles. Idempotent. Needs createCollection, collMod and createIndex on the database.
 */
export async function migrateAnalytics(db) {
	const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
	for (const name of Object.values(COLLECTIONS)) {
		const validator = VALIDATORS[name];
		if (!existing.has(name))
			await db.createCollection(name, validator ? { validator, validationLevel: 'strict', validationAction: 'error' } : {});
		else if (validator)
			await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
		for (const [keys, options] of INDEXES[name] ?? []) await db.collection(name).createIndex(keys, options ?? {});
	}
	for (const bot of LEGACY_BOTS)
		await db.collection(COLLECTIONS.bots).updateOne({ _id: bot._id }, { $setOnInsert: { ...bot, createdAt: new Date() } }, { upsert: true });
	for (const style of Object.values(STYLES)) await publishStyle(db, style);
	await db
		.collection(COLLECTIONS.meta)
		.updateOne({ _id: 'schema' }, { $set: { version: SCHEMA_VERSION, migratedAt: new Date() } }, { upsert: true });
}

/** Publish a style once; refuse any later attempt to change what a style id means. */
async function publishStyle(db, style) {
	const styles = db.collection(COLLECTIONS.styles);
	await styles.updateOne({ _id: style._id }, { $setOnInsert: { ...style, publishedAt: new Date() } }, { upsert: true });
	const stored = await styles.findOne({ _id: style._id }, { projection: { configHash: 1 } });
	if (stored.configHash !== style.configHash)
		throw new IdentityConflict(`Style ${style._id} is already published with a different configuration`);
}

const ready = new WeakSet();
/** Runtime check only: never creates or alters schema. */
export async function ensureAnalyticsSchema(db) {
	if (ready.has(db)) return;
	const meta = await db.collection(COLLECTIONS.meta).findOne({ _id: 'schema' });
	if ((meta?.version ?? 0) < SCHEMA_VERSION) throw new SchemaNotReady(meta?.version ?? 0);
	ready.add(db);
}

/** Every bot seat must resolve to a published, unchanged style before its hand is stored. */
async function verifyIdentities(db, record) {
	for (const seat of record.seats.filter((s) => s.bot)) {
		const identity = seat.bot;
		if (!identity.styleId) throw new IdentityConflict(`Bot ${seat.p} has no resolvable style`);
		const stored = await db.collection(COLLECTIONS.styles).findOne({ _id: identity.styleId });
		if (!stored) throw new IdentityConflict(`Style ${identity.styleId} is not published: run npm run analytics:migrate`);
		if (stored.configHash !== identity.configHash || stored.botId !== identity.botId || stored.version !== identity.styleVersion)
			throw new IdentityConflict(`Bot ${seat.p} does not match published style ${identity.styleId}`);
	}
}

/* ------------------------------------------------------------------------------------------ */
/* Compression for the sealed tier: read only for replay, so it is stored as gzipped JSON.     */
/* ------------------------------------------------------------------------------------------ */

export async function gzipJson(value) {
	const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function gunzipJson(bytes) {
	// A driver Binary (exactly `position` bytes of its buffer) or plain bytes.
	const data = bytes?.buffer instanceof Uint8Array ? bytes.buffer.subarray(0, bytes.position) : bytes;
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
	return JSON.parse(await new Response(stream).text());
}

async function sealedDoc({ _id, recorder, engine, versions, status, hand, finalHash, body }) {
	const json = JSON.stringify(body).length;
	const z = await gzipJson(body);
	return { _id, recorder, engine, versions, status, hand, finalHash, codec: 'gzip-json', z, size: { json, gz: z.length }, storedAt: new Date() };
}

/** The sealed record's inputs, uncompressed. */
export async function readSealed(doc) {
	return { ...doc, ...(await gunzipJson(doc.z)) };
}

async function writeHand(db, { public: record, private: privates, sealed }) {
	await verifyIdentities(db, record);
	const { preDeal, steps, hiddenStacks, botTrace, ...meta } = sealed;
	const doc = await sealedDoc({ ...meta, body: { preDeal, steps, hiddenStacks, botTrace } });
	await db.collection(COLLECTIONS.sealed).updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
	if (privates.length)
		await db.collection(COLLECTIONS.private).bulkWrite(
			privates.map((p) => ({ updateOne: { filter: { _id: p._id }, update: { $setOnInsert: p }, upsert: true } }))
		);
	await db
		.collection(COLLECTIONS.records)
		.updateOne({ _id: record._id }, { $setOnInsert: { ...record, complete: true } }, { upsert: true });
}

/** A hand that could not be turned into records keeps its raw capture, for later rebuilding. */
async function keepRaw(db, raw) {
	const hand = raw.capture.hand;
	const doc = await sealedDoc({
		_id: raw._id,
		recorder: raw.capture.recorder,
		engine: raw.capture.engine,
		versions: hand.versions ?? null,
		status: raw.status,
		hand: { handId: hand.handId, nightId: hand.nightId, handNo: hand.handNo, startedAt: hand.startedAt },
		finalHash: hand.steps?.at(-1)?.h ?? null,
		body: { capture: raw.capture }
	});
	await db.collection(COLLECTIONS.sealed).updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
}

async function writeFailure(db, failure) {
	console.error('Hand recorder failure:', failure.reason, failure.handId ?? '', failure.detail?.message ?? '');
	const _id = `${failure.handId ?? failure.room}:${failure.reason}:${failure.at}`;
	await db.collection(COLLECTIONS.failures).updateOne({ _id }, { $setOnInsert: { _id, ...failure } }, { upsert: true });
}

/**
 * Write one recorder outbox row. Resolves when the row may be deleted; throws to keep it queued.
 */
export async function archiveRecorderRow(db, payload) {
	await ensureAnalyticsSchema(db);
	if (payload.type === 'capture') {
		const finished = finishCapture(payload);
		if (finished.ok) {
			await writeHand(db, finished.records);
			await updateMemoryForHand(db, finished.records.public._id);
			await recordAdaptationReport(db, finished.records);
		}
		else {
			if (finished.raw) await keepRaw(db, finished.raw);
			await writeFailure(db, finished.failure);
		}
	} else if (payload.type === 'failure') await writeFailure(db, payload);
	else if (payload.type === 'night-event')
		await db.collection(COLLECTIONS.nights).updateOne(
			{ _id: payload.nightId },
			{
				$setOnInsert: { room: payload.room, startedAt: payload.startedAt },
				$addToSet: { events: payload.event }
			},
			{ upsert: true }
		);
	else if (payload.type === 'reveal') {
		const updated = await db
			.collection(COLLECTIONS.records)
			.updateOne({ _id: payload.handId }, { $addToSet: { lateShown: payload.entry } });
		if (!updated.matchedCount) {
			// The hand could not be recorded at all (a failure is on file): nothing to amend.
			if (await db.collection(COLLECTIONS.failures).findOne({ handId: payload.handId })) return;
			throw new NotReady(`Hand ${payload.handId} is not stored yet`);
		}
		await updateMemoryForHand(db, payload.handId);
	} else throw new Error(`Unknown recorder row ${payload.type}`);
}

/** True for rows the recorder wrote (club_hands rows from history.mjs have no type). */
export const isRecorderRow = (payload) => typeof payload?.type === 'string';

/* ------------------------------------------------------------------------------------------ */
/* Health                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** A room reports its recorder counters and outbox after every flush attempt (best effort). */
export async function writeRoomStatus(db, room, status) {
	await db.collection(COLLECTIONS.status).updateOne({ _id: room }, { $set: { room, ...status } }, { upsert: true });
}

/**
 * Answers: how many hands were attempted, recorded, failed, waiting; the last good hand; failure
 * reasons; rooms that keep failing; and hands the leaderboard archive saw that the recorder did not.
 */
export async function recorderHealth(db, { retryAlarm = 3 } = {}) {
	const statuses = await db.collection(COLLECTIONS.status).find().toArray();
	const sum = (pick) => statuses.reduce((total, s) => total + (pick(s) ?? 0), 0);
	const [recorded, sealedUnverified, reasons, last, firstRecorded] = await Promise.all([
		db.collection(COLLECTIONS.records).countDocuments(),
		db.collection(COLLECTIONS.sealed).countDocuments({ status: { $ne: 'verified' } }),
		db
			.collection(COLLECTIONS.failures)
			.aggregate([{ $group: { _id: '$reason', count: { $sum: 1 }, lastAt: { $max: '$at' } } }, { $sort: { count: -1 } }])
			.toArray(),
		db.collection(COLLECTIONS.records).findOne({}, { sort: { completedAt: -1 }, projection: { _id: 1, completedAt: 1, gameType: 1, rulesVersion: 1 } }),
		db.collection(COLLECTIONS.records).findOne({}, { sort: { completedAt: 1 }, projection: { completedAt: 1 } })
	]);
	// The leaderboard archive (club_hands) records every finished hand independently: a hand it
	// has from the recorder era with neither a record nor a failure is unaccounted for.
	const unaccounted = firstRecorded
		? await db
				.collection('club_hands')
				.aggregate([
					{ $match: { completedAt: { $gte: firstRecorded.completedAt } } },
					{ $lookup: { from: COLLECTIONS.records, localField: '_id', foreignField: '_id', as: 'r' } },
					{ $lookup: { from: COLLECTIONS.failures, localField: '_id', foreignField: 'handId', as: 'f' } },
					{ $match: { r: { $size: 0 }, f: { $size: 0 } } },
					{ $project: { _id: 1, completedAt: 1 } },
					{ $limit: 50 }
				])
				.toArray()
		: [];
	const waitingRooms = statuses.filter((s) => (s.pending?.total ?? 0) > 0);
	return {
		attempted: sum((s) => s.stats?.handsStarted),
		captured: sum((s) => s.stats?.captured),
		recorded,
		failed: reasons.reduce((total, r) => total + r.count, 0),
		failureReasons: reasons.map((r) => ({ reason: r._id, count: r.count, lastAt: r.lastAt })),
		keptForRebuild: sealedUnverified,
		waitingForRetry: {
			hands: sum((s) => s.pending?.capture),
			rows: sum((s) => s.pending?.total),
			rooms: waitingRooms.map((s) => ({ room: s.room, pending: s.pending, lastError: s.lastError ?? null }))
		},
		repeatedlyRetrying: statuses
			.filter((s) => (s.consecutiveFailures ?? 0) >= retryAlarm)
			.map((s) => ({ room: s.room, attempts: s.consecutiveFailures, lastError: s.lastError ?? null, since: s.failingSince ?? null })),
		lastSuccessfulHand: last ? { id: last._id, completedAt: last.completedAt, gameType: last.gameType, rulesVersion: last.rulesVersion } : null,
		unaccountedHands: unaccounted.map((h) => h._id)
	};
}

/* ------------------------------------------------------------------------------------------ */
/* Replay verification of stored hands                                                         */
/* ------------------------------------------------------------------------------------------ */

/**
 * Re-verify stored hands from their sealed inputs: replay every step, re-check bot decisions
 * against their recorded style, rebuild the public record and compare it with what is stored.
 * A hand whose versions this code cannot replay is reported unavailable, never approximated.
 */
export async function verifyStoredHands(db, { filter = {}, limit = 0 } = {}) {
	const { buildHandRecords, ReplayUnavailable } = await import('./recorder.mjs');
	const { canonicalJson } = await import('./hash.mjs');
	const report = { checked: 0, reproduced: 0, compatible: 0, unavailable: [], mismatched: [], missingPublic: [], keptForRebuild: [] };
	const cursor = db.collection(COLLECTIONS.sealed).find(filter).sort({ _id: 1 });
	if (limit) cursor.limit(limit);
	for await (const doc of cursor) {
		report.checked++;
		if (doc.status !== 'verified') {
			report.keptForRebuild.push({ id: doc._id, status: doc.status });
			continue;
		}
		const stored = await db.collection(COLLECTIONS.records).findOne({ _id: doc._id });
		if (!stored) {
			report.missingPublic.push(doc._id);
			continue;
		}
		try {
			const sealed = await readSealed(doc);
			const rebuilt = buildHandRecords(
				{ ...sealed.hand, versions: sealed.versions, preDeal: sealed.preDeal, steps: sealed.steps },
				{ engine: sealed.engine, room: stored.room }
			);
			const comparable = { ...stored };
			delete comparable.complete;
			delete comparable.lateShown;
			const expected = { ...rebuilt.public, verified: { ...rebuilt.public.verified, replay: stored.verified.replay } };
			if (canonicalJson(expected) !== canonicalJson(comparable))
				report.mismatched.push({ id: doc._id, reason: 'public record differs from replay' });
			else if (rebuilt.public.verified.replay === 'compatible') report.compatible++;
			else report.reproduced++;
		} catch (error) {
			if (error instanceof ReplayUnavailable) report.unavailable.push({ id: doc._id, reason: error.reason });
			else report.mismatched.push({ id: doc._id, reason: String(error?.message ?? error) });
		}
	}
	return report;
}
