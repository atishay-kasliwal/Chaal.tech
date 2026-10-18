/**
 * Owner analytics and variant health (docs/ANALYTICS_PHASE5.md, "Owner analytics"). Built from the
 * club's public hand summaries only: no private cards, no per-player strategy. Everything is a count
 * or a duration with its sample size. Popularity is reported as popularity; nothing here turns it
 * into a quality score.
 */
import { evidence, round } from '../compute/stats.mjs';
import { gameName, variantName } from './language.mjs';

const DAY = 86_400_000;
const MIN = 60_000;
const variantKey = (r) => (r.gameType === 'teen-patti' ? `teen-patti|${r.rulesVersion ?? 'unknown'}` : r.gameType);
export const labelOf = (key) => (key.startsWith('teen-patti|') ? `Teen Patti · ${variantName(key.split('|')[1]) ?? 'Unknown'}` : gameName(key));
const median = (xs) => {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const month = (at) => new Date(at).toISOString().slice(0, 7);
const humansOf = (r) => r.seats.filter((s) => s.kind === 'human').map((s) => s.p);

function nightsOf(records) {
	const nights = new Map();
	for (const r of records) {
		const n = nights.get(r.nightId) ?? { nightId: r.nightId, start: r.startedAt, end: r.completedAt, hands: 0, players: new Set(), games: {}, bots: new Set() };
		n.start = Math.min(n.start, r.startedAt);
		n.end = Math.max(n.end, r.completedAt);
		n.hands++;
		humansOf(r).forEach((p) => n.players.add(p));
		n.games[r.gameType] = (n.games[r.gameType] ?? 0) + 1;
		r.seats.filter((s) => s.kind === 'bot').forEach((s) => n.bots.add(s.bot?.botId ?? 'unknown'));
		nights.set(r.nightId, n);
	}
	return [...nights.values()].sort((a, b) => a.start - b.start);
}

/** Retention: of the people who played in a month, how many played in the next one. */
function retention(records) {
	const byMonth = new Map();
	for (const r of records) for (const p of humansOf(r)) {
		const m = month(r.completedAt);
		if (!byMonth.has(m)) byMonth.set(m, new Set());
		byMonth.get(m).add(p);
	}
	const months = [...byMonth.keys()].sort();
	const cohorts = months.slice(0, -1).map((m, i) => {
		const players = byMonth.get(m);
		const next = byMonth.get(months[i + 1]);
		const back = [...players].filter((p) => next.has(p)).length;
		return { month: m, players: players.size, returned: back, rate: players.size ? round(back / players.size, 2) : null };
	});
	return { cohorts, note: cohorts.length ? null : 'Retention appears after a second month of play.' };
}

/** People who keep turning up together: the most common groups of three or more across nights. */
function groups(nights) {
	const counts = new Map();
	for (const n of nights) {
		const players = [...n.players].sort();
		if (players.length < 3 || players.length > 8) continue;
		const key = players.join('|');
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, nightsTogether]) => ({ players: k.split('|'), nights: nightsTogether }));
}

export function clubOverview(records, { now = Date.now(), names = {} } = {}) {
	if (!records.length) return { empty: true };
	const complete = records.filter((r) => r.outcome?.pot !== null && r.outcome?.pot !== undefined);
	const nights = nightsOf(records);
	const players = new Set(records.flatMap(humansOf));
	const active = (days) => new Set(records.filter((r) => r.completedAt >= now - days * DAY).flatMap(humansOf)).size;
	const gameHands = {};
	for (const r of records) gameHands[r.gameType] = (gameHands[r.gameType] ?? 0) + 1;
	const sessionByGame = Object.keys(gameHands).map((game) => {
		const lasting = nights.filter((n) => n.games[game] / n.hands >= 0.6);
		return { game, nights: lasting.length, avgMinutes: lasting.length ? Math.round(lasting.reduce((s, n) => s + (n.end - n.start) / MIN, 0) / lasting.length) : null, evidence: evidence(lasting.length, 3) };
	});
	const keys = new Map();
	for (const r of records) {
		const k = variantKey(r);
		const v = keys.get(k) ?? { key: k, hands: 0, last30: 0, prev30: 0 };
		v.hands++;
		if (r.completedAt >= now - 30 * DAY) v.last30++;
		else if (r.completedAt >= now - 60 * DAY) v.prev30++;
		keys.set(k, v);
	}
	const variants = [...keys.values()].sort((a, b) => b.hands - a.hands).map((v) => ({
		...v,
		label: labelOf(v.key),
		share: round(v.hands / records.length, 3),
		// Needs both months to hold at least 20 hands before calling anything a trend.
		trend: v.last30 + v.prev30 < 20 ? null : v.prev30 === 0 ? 'new' : v.last30 > v.prev30 * 1.3 ? 'growing' : v.last30 < v.prev30 * 0.7 ? 'declining' : 'steady'
	}));
	const bots = new Map();
	for (const r of records) for (const s of r.seats) if (s.kind === 'bot') {
		const id = s.bot?.botId ?? 'unknown';
		const b = bots.get(id) ?? { botId: id, name: names[`bot:${id}`]?.name ?? id, hands: 0, nights: new Set() };
		b.hands++;
		b.nights.add(r.nightId);
		bots.set(id, b);
	}
	return {
		empty: false,
		range: { from: Math.min(...records.map((r) => r.startedAt)), to: Math.max(...records.map((r) => r.completedAt)) },
		hands: complete.length,
		stopped: records.length - complete.length,
		nights: nights.length,
		players: players.size,
		active: { days7: active(7), days30: active(30) },
		avgNightMinutes: Math.round(nights.reduce((s, n) => s + (n.end - n.start) / MIN, 0) / nights.length),
		avgPlayersPerNight: round(nights.reduce((s, n) => s + n.players.size, 0) / nights.length, 1),
		games: Object.entries(gameHands).map(([game, hands]) => ({ game, hands, share: round(hands / records.length, 3) })).sort((a, b) => b.hands - a.hands),
		sessionByGame,
		variants,
		bots: [...bots.values()].map((b) => ({ botId: b.botId, name: b.name, hands: b.hands, nights: b.nights.size, nightShare: round(b.nights.size / nights.length, 2) })).sort((a, b) => b.hands - a.hands),
		retention: retention(records),
		groups: groups(nights).map((g) => ({ ...g, names: g.players.map((p) => names[p]?.name ?? 'A friend') }))
	};
}

/** Health signals per variant. No combined score: each is shown with its own sample size. */
export function variantHealth(records, { now = Date.now() } = {}) {
	const sorted = [...records].sort((a, b) => a.startedAt - b.startedAt);
	const runs = [];
	let current = null;
	for (const r of sorted) {
		const key = variantKey(r);
		if (current && current.nightId === r.nightId && current.key === key) {
			current.hands++;
			current.end = r.completedAt;
		} else {
			current = { key, nightId: r.nightId, hands: 1, start: r.startedAt, end: r.completedAt };
			runs.push(current);
		}
	}
	const byKey = new Map();
	for (const r of sorted) {
		const key = variantKey(r);
		const v = byKey.get(key) ?? { key, records: [], players: new Map(), nights: new Set() };
		v.records.push(r);
		for (const p of humansOf(r)) {
			if (!v.players.has(p)) v.players.set(p, new Set());
			v.players.get(p).add(r.nightId);
		}
		v.nights.add(r.nightId);
		byKey.set(key, v);
	}
	const list = [...byKey.values()].map((v) => {
		const vr = runs.filter((x) => x.key === v.key);
		const hands = v.records.length;
		const complete = v.records.filter((r) => r.outcome?.pot !== null && r.outcome?.pot !== undefined).length;
		const returning = [...v.players.values()].filter((n) => n.size >= 2).length;
		const firstSeen = new Map([...v.players.keys()].map((p) => [p, Math.min(...v.records.filter((r) => humansOf(r).includes(p)).map((r) => r.completedAt))]));
		const eligible = [...firstSeen.values()].filter((t) => t <= now - 30 * DAY).length;
		const quick = vr.filter((x) => x.hands <= 2).length;
		const withBots = v.records.filter((r) => r.seats.some((s) => s.kind === 'bot')).length;
		const durations = v.records.map((r) => (r.completedAt - r.startedAt) / 1000);
		const level = evidence(hands, 50);
		const flags = [];
		if (vr.length >= 8 && quick / vr.length >= 0.5) flags.push('often-switched-away');
		if (hands >= 30 && complete / hands < 0.92) flags.push('many-unfinished-hands');
		if (v.players.size >= 4 && returning / v.players.size >= 0.6 && hands >= 100) flags.push('players-come-back');
		return {
			key: v.key,
			label: labelOf(v.key),
			hands,
			selections: vr.length,
			nights: v.nights.size,
			uniquePlayers: v.players.size,
			repeatPlayers: returning,
			repeatRate: v.players.size ? round(returning / v.players.size, 2) : null,
			returnWithin30Days: eligible >= 3 ? round([...firstSeen.entries()].filter(([p, t]) => t <= now - 30 * DAY && [...v.records].some((r) => r.completedAt > t + DAY && humansOf(r).includes(p))).length / eligible, 2) : null,
			avgRunHands: vr.length ? round(vr.reduce((s, x) => s + x.hands, 0) / vr.length, 1) : null,
			avgRunMinutes: vr.length ? round(vr.reduce((s, x) => s + (x.end - x.start) / MIN, 0) / vr.length, 1) : null,
			quickSwitchRate: vr.length >= 5 ? round(quick / vr.length, 2) : null,
			completionRate: hands ? round(complete / hands, 3) : null,
			withBotsRate: hands ? round(withBots / hands, 2) : null,
			medianHandSeconds: round(median(durations), 0),
			evidence: level,
			flags
		};
	}).sort((a, b) => b.hands - a.hands);
	return { variants: list, note: 'Popularity is not quality. A variant played often may simply be the default; one played rarely may be loved by a few. Use these signals to ask questions, not to rank.' };
}
