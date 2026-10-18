/**
 * Owner-only intelligence (docs/ANALYTICS_PHASE5.md). Club analytics, variant health, bot
 * intelligence and data quality are read from the club's public hand history and the bots' derived
 * caches. Nothing here reads a private card. The Worker authorises the owner before calling.
 */
import { clubRecords as loadClubRecords, subjectNames } from '../data.mjs';
import { COLLECTIONS } from '../store.mjs';
import { clubOverview, variantHealth } from './club.mjs';
import { clubRecords } from './records.mjs';
import { dataQuality } from './quality.mjs';
import { exportRows } from './export.mjs';
import { cachedByHead } from './memo.mjs';
import { analyzeBots, exploitFindings } from '../../bots/intel.mjs';
import { EVOLUTIONS, evolve, listEvolutions } from '../../bots/evolution.mjs';
import { DIAGNOSTICS_COLLECTION, MEMORY_COLLECTION } from '../../bots/memory/store.mjs';

export const adminClubIntel = (db, now = Date.now()) =>
	cachedByHead(db, 'admin-club', async () => {
		const [records, names] = await Promise.all([loadClubRecords(db, { limit: 20000 }), subjectNames(db)]);
		return { generatedAt: now, overview: clubOverview(records, { now, names }), variants: variantHealth(records, { now }), records: clubRecords(records, names), names: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, { name: v.name, kind: v.kind }])) };
	}, now);

/** Everything the bot pages need: usage, performance, predictability, exploitability, lineage. */
export const adminBotIntel = (db, now = Date.now()) =>
	cachedByHead(db, 'admin-bots', async () => {
		const [records, decisionRecords, bots, styles, names, reports, memories, evolutions] = await Promise.all([
			loadClubRecords(db, { limit: 12000 }),
			loadClubRecords(db, { full: true, limit: 1200 }),
			db.collection(COLLECTIONS.bots).find({}).sort({ order: 1, createdAt: 1 }).toArray(),
			db.collection(COLLECTIONS.styles).find({}).sort({ botId: 1, version: 1 }).toArray(),
			subjectNames(db),
			db.collection(DIAGNOSTICS_COLLECTION).find({}).sort({ at: -1 }).limit(4000).toArray().catch(() => []),
			db.collection(MEMORY_COLLECTION).find({}, { projection: { botId: 1, models: 1 } }).toArray().catch(() => []),
			listEvolutions(db).catch(() => [])
		]);
		const analysis = analyzeBots({ records, decisionRecords, bots, styles, reports, memories, names, evolutions, now });
		return { generatedAt: now, sample: { hands: records.length, decisionHands: decisionRecords.length }, bots: analysis, evolutions: evolutions.map(publicEvolution) };
	}, now);

const publicEvolution = (e) => ({ id: e._id, botId: e.botId, status: e.status, finding: e.finding && { id: e.finding.id, title: e.finding.title, why: e.finding.why }, changes: e.changes ?? null, draftStyleId: e.draftStyleId ?? null, comparison: e.comparison ?? null, review: e.review ?? null, createdAt: e.createdAt, updatedAt: e.updatedAt, history: e.history });

export async function adminEvolve(db, owner, body, now = Date.now()) {
	await evolve(db, owner, body, {
		findings: async (botId) => {
			const intel = await adminBotIntel(db, now);
			return intel.bots.find((b) => b.botId === botId)?.exploitability ?? [];
		}
	}, now);
	return { evolutions: (await listEvolutions(db)).map(publicEvolution) };
}

export const adminQuality = (db, now = Date.now()) => dataQuality(db, { now });

/** A bounded export for spot checks. Bulk exports use scripts/analytics-export.mjs. */
export async function adminExport(db, { since = 0, limit = 2000 } = {}) {
	const records = await loadClubRecords(db, { since, limit: Math.min(limit, 5000) });
	return { rows: records.flatMap(exportRows) };
}
export { exploitFindings, EVOLUTIONS };
