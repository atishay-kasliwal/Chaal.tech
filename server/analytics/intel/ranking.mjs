/**
 * Insight ranking (docs/archive/ANALYTICS_PHASE5.md, "Ranking"). Many analytics can produce something to say;
 * this decides what is worth saying now. Each candidate carries plain components and the score is a
 * fixed, documented weighted sum, so "why am I seeing this" always has an answer:
 *
 *   confidence      how sure the underlying test is (also a hard floor)
 *   magnitude       how big the departure or fact is
 *   novelty         not shown to this player recently, and not shown many times
 *   relevance       about this player's own game
 *   recency         the more recent the better
 *   social          involves other people at the table
 *   actionability   something a player could do with it
 *
 * Repetition is penalised hard inside a cooldown, and one topic never fills the whole recap.
 */
const WEIGHTS = Object.freeze({ confidence: 0.26, magnitude: 0.22, novelty: 0.16, relevance: 0.12, recency: 0.1, social: 0.08, actionability: 0.06 });
export const COOLDOWN_DAYS = 14;
export const MIN_CONFIDENCE = 0.45;
const DAY = 86_400_000;
const clamp01 = (x) => Math.max(0, Math.min(1, x ?? 0));

export function scoreInsight(c, shown, now) {
	const seen = shown.get(c.id);
	const topicSeen = c.topic ? [...shown.entries()].filter(([id, s]) => s.topic === c.topic && now - s.lastShown < COOLDOWN_DAYS * DAY && id !== c.id).length : 0;
	const novelty = seen ? (now - seen.lastShown < COOLDOWN_DAYS * DAY ? 0 : 1 / (1 + seen.count)) : topicSeen ? 0.5 : 1;
	const ageDays = Math.max(0, (now - (c.at ?? now)) / DAY);
	const components = {
		confidence: clamp01(c.confidence),
		magnitude: clamp01(c.magnitude),
		novelty,
		relevance: clamp01(c.relevance ?? (c.scope === 'personal' ? 1 : 0.6)),
		recency: clamp01(1 - ageDays / 30),
		social: clamp01(c.social ?? (c.scope === 'social' ? 1 : c.scope === 'club' ? 0.7 : 0.2)),
		actionability: clamp01(c.actionability ?? 0.2)
	};
	const score = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * components[k], 0);
	return { score, components };
}

/**
 * @param candidates insight objects with id, topic, scope, confidence, magnitude, text
 * @param shown Map id → { lastShown, count, topic }
 * @returns the best `limit` (at most two per topic), highest first, each with its components
 */
export function rankInsights(candidates, { shown = new Map(), now = Date.now(), limit = 5, min = 3, perTopic = 2 } = {}) {
	const scored = candidates
		.filter((c) => c.text && clamp01(c.confidence) >= MIN_CONFIDENCE)
		.map((c) => ({ ...c, ...scoreInsight(c, shown, now) }))
		// Inside the cooldown a repeat is almost never worth showing; it can only fill an otherwise empty recap.
		.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
	const chosen = [];
	const topics = new Map();
	for (const c of scored) {
		if (chosen.length >= limit) break;
		const fresh = c.components.novelty >= 0.5;
		if (!fresh && chosen.length >= min) continue;
		const used = topics.get(c.topic ?? c.id) ?? 0;
		if (used >= perTopic) continue;
		topics.set(c.topic ?? c.id, used + 1);
		chosen.push(c);
	}
	return chosen;
}

/* ------------------------------------ remembering what was shown ------------------------------------ */

export const SHOWN = 'insight_shown';
const KEEP = 20;

/**
 * What this player has already been shown. `exclude` hides one context's own showing, so rebuilding a
 * recap that was already delivered ranks it exactly as it was the first time.
 */
export async function loadShown(db, playerId, { exclude = null } = {}) {
	const rows = await db.collection(SHOWN).find({ playerId }).sort({ updatedAt: -1 }).limit(400).toArray();
	const out = new Map();
	for (const r of rows) {
		const shows = (r.shows ?? []).filter((s) => s.key !== exclude);
		if (shows.length) out.set(r.insightId, { lastShown: Math.max(...shows.map((s) => s.at)), count: shows.length, topic: r.topic ?? null });
	}
	return out;
}

/** Idempotent per context: refreshing the same recap never counts as showing it again. */
export async function markShown(db, playerId, insights, contextKey, now = Date.now()) {
	for (const i of insights) {
		const _id = `${playerId}|${i.id}`;
		const existing = await db.collection(SHOWN).findOne({ _id }, { projection: { shows: 1 } });
		if (existing?.shows?.some((s) => s.key === contextKey)) continue;
		await db.collection(SHOWN).updateOne({ _id }, { $set: { playerId, insightId: i.id, topic: i.topic ?? null, updatedAt: now }, $push: { shows: { $each: [{ key: contextKey, at: now }], $slice: -KEEP } } }, { upsert: true });
	}
}
