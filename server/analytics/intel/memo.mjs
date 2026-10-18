/**
 * A small cache for club-wide computations only, keyed by the head of the hand history. A new hand
 * changes the head, so nothing is ever stale by more than one request; per-player analytics are not
 * cached at all (measured cheap, see scripts/analytics-benchmark.mjs and docs/ANALYTICS_PHASE5.md).
 */
import { COLLECTIONS } from '../store.mjs';

const cache = new Map();
const TTL = 5 * 60_000;
const MAX = 40;

export async function historyHead(db) {
	const [last] = await db.collection(COLLECTIONS.records).find({}, { projection: { completedAt: 1 } }).sort({ completedAt: -1 }).limit(1).toArray();
	const count = await db.collection(COLLECTIONS.records).estimatedDocumentCount();
	return `${count}:${last?.completedAt ?? 0}`;
}

export async function cachedByHead(db, key, compute, now = Date.now()) {
	const head = await historyHead(db);
	const hit = cache.get(key);
	if (hit && hit.head === head && now - hit.at < TTL) return hit.value;
	const value = await compute();
	cache.set(key, { head, at: now, value });
	while (cache.size > MAX) cache.delete(cache.keys().next().value);
	return value;
}
export const clearMemo = () => cache.clear();
