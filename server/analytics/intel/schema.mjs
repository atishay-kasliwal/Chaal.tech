/** Operator migration for the Phase 5 derived collections: indexes only, never run on a request. */
export const INTEL_COLLECTIONS = Object.freeze({ shown: 'insight_shown', evolution: 'bot_evolution' });

export async function migrateIntel(db) {
	await db.collection(INTEL_COLLECTIONS.shown).createIndex({ playerId: 1, updatedAt: -1 });
	await db.collection(INTEL_COLLECTIONS.evolution).createIndex({ botId: 1, createdAt: -1 });
	await db.collection(INTEL_COLLECTIONS.evolution).createIndex({ botId: 1, 'finding.id': 1, status: 1 });
	// The history reads Phase 5 relies on: a player's hands by time, a night's hands, and the club by time.
	await db.collection('hand_records').createIndex({ nightId: 1, completedAt: 1 });
	await db.collection('hand_records').createIndex({ completedAt: -1 });
	await db.collection('hand_private').createIndex({ p: 1, completedAt: -1 });
}
