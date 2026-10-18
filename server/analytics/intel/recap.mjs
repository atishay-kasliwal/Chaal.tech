/**
 * The post-night recap (docs/ANALYTICS_PHASE5.md, "Recap"). Two layers, one definition of every
 * number (compute/facts.mjs):
 *
 *   shared    what anyone who was at the table is entitled to: results, biggest swing, biggest pot,
 *             closest pair, variant of the night, a bot moment. From public hand records only.
 *   personal  one player's own view: their night against their own history, their cards hot or cold,
 *             what was surprising for them. May use that player's own private cards, never anyone
 *             else's.
 *
 * Both layers become ranked candidates; only the 3 to 6 most worth saying are shown.
 */
import { handFacts, subjectOf } from '../compute/facts.mjs';
import { round } from '../compute/stats.mjs';
import { boots, gameName, plural, signedBoots, variant, variantName } from './language.mjs';
import { rankInsights } from './ranking.mjs';

const MIN = 60_000;

/** Public, table-wide facts for one night. `records` are the night's public hand summaries. */
export function sharedNight(records, names = {}) {
	const nameOf = (s) => names[s]?.name ?? (s.startsWith('bot:') ? 'a bot' : 'a friend');
	const complete = records.filter((r) => r.outcome?.pot !== null && r.outcome?.pot !== undefined);
	const players = new Map();
	const swings = [];
	const pots = [];
	const pair = new Map();
	for (const record of complete) {
		const facts = handFacts(record);
		for (const f of facts.values()) {
			const p = players.get(f.subject) ?? { subject: f.subject, kind: f.kind, hands: 0, units: 0, points: 0, wins: 0, fair: 0 };
			p.hands++;
			if (f.stake) p.units += f.units;
			else p.points += f.net;
			p.wins += f.won;
			p.fair += f.fairShare ?? 0;
			players.set(f.subject, p);
			if (f.stake && f.units > 0) swings.push({ subject: f.subject, kind: f.kind, units: f.units, handId: record._id, gameType: record.gameType });
		}
		const first = [...facts.values()][0];
		if (record.gameType !== 'blackjack' && record.gameType !== 'rummy' && first)
			pots.push({ handId: record._id, units: record.outcome.pot / first.unit, gameType: record.gameType, winner: record.outcome.winners?.[0] ? subjectOf(record.seats.find((s) => s.p === record.outcome.winners[0].p) ?? { p: '', kind: 'human' }) : null });
		for (const flow of record.flows ?? []) {
			const a = record.seats.find((s) => s.p === flow.from);
			const b = record.seats.find((s) => s.p === flow.to);
			if (!a || !b || a.kind !== 'human' || b.kind !== 'human') continue;
			const [x, y] = [subjectOf(a), subjectOf(b)].sort();
			const k = `${x}|${y}`;
			const g = pair.get(k) ?? { a: x, b: y, net: 0, hands: new Set() };
			const unit = first?.unit || 1;
			g.net += (subjectOf(b) === x ? 1 : -1) * (flow.amt / unit); // from x's side
			g.hands.add(record._id);
			pair.set(k, g);
		}
	}
	const list = [...players.values()].map((p) => ({ ...p, units: round(p.units, 1), points: round(p.points, 0), wins: round(p.wins, 1), nameHint: nameOf(p.subject) }));
	const humans = list.filter((p) => p.kind === 'human').sort((a, b) => b.units - a.units);
	const variants = new Map();
	for (const r of complete) {
		const key = r.gameType === 'teen-patti' ? `teen-patti|${r.rulesVersion}` : r.gameType;
		variants.set(key, (variants.get(key) ?? 0) + 1);
	}
	const topVariant = [...variants.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
	const closest = [...pair.values()].filter((g) => g.hands.size >= 8).sort((a, b) => Math.abs(a.net) - Math.abs(b.net))[0] ?? null;
	const bots = list.filter((p) => p.kind === 'bot').sort((a, b) => b.units - a.units);
	const bigPot = pots.sort((a, b) => b.units - a.units)[0] ?? null;
	const bigSwing = swings.sort((a, b) => b.units - a.units)[0] ?? null;
	return {
		hands: complete.length,
		stopped: records.length - complete.length,
		startedAt: Math.min(...records.map((r) => r.startedAt)),
		endedAt: Math.max(...records.map((r) => r.completedAt)),
		durationMinutes: Math.round((Math.max(...records.map((r) => r.completedAt)) - Math.min(...records.map((r) => r.startedAt))) / MIN),
		humans,
		bots,
		winner: humans.filter((h) => h.hands >= 5 && h.units > 0)[0] ?? null,
		tied: humans.length > 1 && humans[0].units === humans[1].units,
		bigPot,
		bigSwing,
		closest: closest ? { a: closest.a, b: closest.b, net: round(closest.net, 1), hands: closest.hands.size } : null,
		variant: topVariant ? { key: topVariant[0], hands: topVariant[1], share: round(topVariant[1] / complete.length, 2) } : null,
		games: Object.fromEntries([...new Set(complete.map((r) => r.gameType))].map((g) => [g, complete.filter((r) => r.gameType === g).length])),
		botMoment: bots[0] && bots[0].units > 0 ? bots[0] : null
	};
}

/** Candidates from the shared layer. `scope` social/club; confidence is 1 because these are counts. */
export function sharedCandidates(night, nightId, names = {}) {
	const nameOf = (s) => names[s]?.name ?? (s.startsWith('bot:') ? 'a bot' : 'a friend');
	const out = [];
	const base = { scope: 'social', confidence: 1, at: night.endedAt, nightId };
	if (night.winner && !night.tied)
		out.push({ ...base, id: `night:winner:${nightId}`, topic: 'result', magnitude: Math.min(1, night.winner.units / 25), text: variant(nightId, [`${nameOf(night.winner.subject)} had the best night: ${signedBoots(night.winner.units)} over ${plural(night.winner.hands, 'hand')}.`, `Top of the table: ${nameOf(night.winner.subject)}, ${signedBoots(night.winner.units)}.`]), evidence: { nightId, hands: [] } });
	if (night.bigSwing && night.bigSwing.units >= 8)
		out.push({ ...base, id: `night:swing:${nightId}`, topic: 'swing', magnitude: Math.min(1, night.bigSwing.units / 40), text: `Biggest swing: ${nameOf(night.bigSwing.subject)} won ${boots(night.bigSwing.units)} in one ${gameName(night.bigSwing.gameType)} hand.`, evidence: { nightId, hands: [night.bigSwing.handId] } });
	if (night.bigPot && night.bigPot.units >= 12)
		out.push({ ...base, id: `night:pot:${nightId}`, topic: 'pot', magnitude: Math.min(1, night.bigPot.units / 60), text: `Biggest pot of the night: ${boots(night.bigPot.units)}${night.bigPot.winner ? `, taken by ${nameOf(night.bigPot.winner)}` : ''}.`, evidence: { nightId, hands: [night.bigPot.handId] } });
	if (night.closest && Math.abs(night.closest.net) <= 5)
		out.push({ ...base, id: `night:close:${[night.closest.a, night.closest.b].join('|')}:${nightId}`, topic: 'pair', magnitude: 0.6, text: `${nameOf(night.closest.a)} and ${nameOf(night.closest.b)} finished almost level after ${plural(night.closest.hands, 'hand')} together.`, evidence: { nightId, hands: [] } });
	if (night.variant && night.variant.share >= 0.5 && night.hands >= 10)
		out.push({ ...base, id: `night:variant:${night.variant.key}:${nightId}`, topic: 'variant', magnitude: 0.4, text: `The night belonged to ${variantName(night.variant.key.split('|')[1]) ?? gameName(night.variant.key)}: ${night.variant.hands} of ${night.hands} hands.`, evidence: { nightId, hands: [] } });
	if (night.botMoment)
		out.push({ ...base, id: `night:bot:${night.botMoment.subject}:${nightId}`, topic: 'bot', magnitude: Math.min(1, night.botMoment.units / 20), text: `${nameOf(night.botMoment.subject)} finished ${signedBoots(night.botMoment.units)} on the night.`, evidence: { nightId, hands: [] } });
	return out;
}

/** Put it together for one viewer. `personal` are candidates from surprise.mjs and records. */
export function buildRecap({ nightId, viewer, shared, viewerFacts, personal = [], recordsBroken = [], shown = new Map(), names = {}, now = Date.now(), skillNight = null }) {
	const mine = viewerFacts.filter((f) => f.nightId === nightId && f.complete);
	const units = mine.filter((f) => f.stake).reduce((s, f) => s + f.units, 0);
	const candidates = [
		...sharedCandidates(shared, nightId, names),
		...personal,
		...recordsBroken.map((r) => ({ id: `record:${r.id}:${nightId}`, topic: 'record', scope: 'personal', confidence: 1, magnitude: 0.8, at: shared.endedAt, text: `New personal record: ${r.label.toLowerCase()}, ${r.value} ${r.unit}${r.previous ? ` (it was ${r.previous})` : ''}.`, evidence: { nightId, hands: r.handId ? [r.handId] : [] } }))
	].map((c) => ({ ...c, at: c.at ?? shared.endedAt }));
	const highlights = rankInsights(candidates, { shown, now, limit: 6, min: 3 }).map(({ id, topic, scope, text, evidence, components }) => ({ id, topic, scope, text, evidence, why: components }));
	return {
		nightId,
		startedAt: shared.startedAt,
		endedAt: shared.endedAt,
		minutes: shared.durationMinutes,
		hands: shared.hands,
		results: { humans: shared.humans.map((p) => ({ subject: p.subject, hands: p.hands, units: p.units, you: p.subject === viewer })), bots: shared.bots.map((p) => ({ subject: p.subject, hands: p.hands, units: p.units })) },
		you: { hands: mine.length, units: round(units, 1), luck: skillNight?.luck ?? null },
		highlights,
		empty: highlights.length === 0 ? 'A short night: play a few more hands together and the recap fills in.' : null
	};
}
