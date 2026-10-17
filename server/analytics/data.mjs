/**
 * Data access for analytics: the boundary between raw hand history (MongoDB) and computation.
 * Loaders project only what each use needs; nothing here computes metrics.
 *
 * Layers (docs/ANALYTICS_PHASE2.md, "Performance"):
 *   raw      hand_records / hand_private (Phase 1, permanent)
 *   derived  compute/*.mjs, recomputed per request from raw
 *   cached   in-isolate memo for club-wide priors; pre-aggregation is a later, measured step
 */
import { COLLECTIONS } from './store.mjs';

/**
 * Enough for results, games, rivals, cards and history: no event list except the deal (which
 * holds a Blackjack player's opening bet). About a tenth of a full record.
 */
const SUMMARY = {
	room: 1,
	handId: 1,
	nightId: 1,
	handNo: 1,
	gameType: 1,
	rulesVersion: 1,
	startedAt: 1,
	completedAt: 1,
	practice: 1,
	config: 1,
	seats: 1,
	outcome: 1,
	flows: 1,
	table: 1,
	events: { $elemMatch: { a: 'deal' } }
};
/** The action sequence for patterns, without per-event chips, presence lists or timings. */
const DECISIONS = {
	seal: 0,
	verified: 0,
	observers: 0,
	shown: 0,
	lateShown: 0,
	pick: 0,
	'events.chips': 0,
	'events.connected': 0,
	'events.t': 0,
	'events.decision.ms': 0,
	'events.decision.turnStartT': 0,
	'events.decision.lastAggressor': 0
};
/** Everything public, for one hand's detail. */
const FULL = { seal: 0, verified: 0 };
/** Patterns describe current style: the most recent hands are enough and keep requests small. */
export const PATTERN_HANDS = 1500;

const DEFAULT_LIMIT = 5000;

/** The newest hands a player was dealt into, oldest first. */
export async function playerRecords(db, playerId, { full = false, since = 0, limit } = {}) {
	const list = await db
		.collection(COLLECTIONS.records)
		.find({ 'seats.p': playerId, ...(since ? { completedAt: { $gte: since } } : {}) }, { projection: full ? DECISIONS : SUMMARY })
		.sort({ completedAt: -1 })
		.limit(limit ?? (full ? PATTERN_HANDS : DEFAULT_LIMIT))
		.toArray();
	return list.reverse();
}

export async function recordById(db, handId) {
	return db.collection(COLLECTIONS.records).findOne({ _id: handId }, { projection: FULL });
}

/** The player's OWN private cards. Never call with another player's id on their behalf. */
export async function ownPrivate(db, playerId, { handId, since = 0, limit = DEFAULT_LIMIT } = {}) {
	if (handId) return db.collection(COLLECTIONS.private).findOne({ handId, p: playerId });
	return db
		.collection(COLLECTIONS.private)
		.find({ p: playerId, ...(since ? { completedAt: { $gte: since } } : {}) })
		.sort({ completedAt: -1 })
		.limit(limit)
		.toArray();
}

/** Display names for analytics subjects: members by playerId, bots by permanent id. */
export async function subjectNames(db) {
	const [members, bots] = await Promise.all([
		db
			.collection('members')
			.find({ playerId: { $type: 'string' } }, { projection: { playerId: 1, nickname: 1, characterId: 1, mascotId: 1 } })
			.toArray(),
		db.collection(COLLECTIONS.bots).find({}, { projection: { name: 1 } }).toArray()
	]);
	const names = {};
	for (const m of members) names[m.playerId] = { name: m.nickname ?? 'A friend', characterId: m.characterId ?? null, mascotId: m.mascotId ?? null, memberId: String(m._id), kind: 'human' };
	for (const b of bots) names[`bot:${b._id}`] = { name: b.name, kind: 'bot' };
	return names;
}

/** Every recent hand in the club, for club-wide priors and owner analytics. */
export async function clubRecords(db, { full = false, since = 0, limit = 20000 } = {}) {
	const list = await db
		.collection(COLLECTIONS.records)
		.find(since ? { completedAt: { $gte: since } } : {}, { projection: full ? DECISIONS : SUMMARY })
		.sort({ completedAt: -1 })
		.limit(limit)
		.toArray();
	return list.reverse();
}
