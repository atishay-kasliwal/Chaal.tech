/**
 * Warehouse-ready export (docs/ANALYTICS_PHASE5.md, "Export"). One row per seat per completed hand,
 * from the canonical facts, as plain JSON lines. Owners only, never on a member request. No cards, no
 * deck, no seal, no bot internals: only what the public hand record already holds. Product usage
 * analytics (GA4) is a separate system and is never mixed in here.
 */
import { handFacts } from '../compute/facts.mjs';

export const EXPORT_SCHEMA = 'chaal.seat-hand@1';

export function exportRows(record) {
	const rows = [];
	for (const f of handFacts(record).values()) {
		if (!f.complete) continue;
		rows.push({
			schema: EXPORT_SCHEMA,
			handId: f.handId,
			nightId: f.nightId,
			room: f.room,
			handNo: f.handNo,
			game: f.gameType,
			variant: f.rulesVersion,
			startedAt: f.startedAt,
			completedAt: f.completedAt,
			subject: f.subject,
			kind: f.kind,
			botId: f.botId,
			styleId: record.seats.find((s) => s.p === f.seatId)?.bot?.styleId ?? null,
			players: f.players,
			order: f.order,
			net: f.net,
			unit: f.unit,
			units: f.units,
			won: f.won,
			fairShare: f.fairShare,
			potUnits: f.potUnits,
			exit: f.exit,
			practice: f.practice
		});
	}
	return rows;
}
export const toNdjson = (rows) => rows.map((r) => JSON.stringify(r)).join('\n');
