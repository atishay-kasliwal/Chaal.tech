/**
 * Analytics API: request → validated filter → data → computation → purpose-built response.
 * Never returns MongoDB documents. The viewer is always the signed-in member (enforced by the
 * Worker); a player sees their own analytics, rivalries with people they sat with, and hands
 * they were at, filtered to what they were entitled to see.
 */
import { factsFor, GAMES, handFacts } from './compute/facts.mjs';
import { filterFacts, games, overview, results, fairShare, windows, WINDOWS } from './compute/performance.mjs';
import { collectDecisions, coreRates, situational, styleChange, clubPrior } from './compute/patterns.mjs';
import { ownCards, deckFairness } from './compute/cards.mjs';
import { rivalries, rivalry } from './compute/rivals.mjs';
import { nights, hands, handDetail } from './compute/history.mjs';
import { insights } from './compute/insights.mjs';
import { playerRecords, recordById, ownPrivate, subjectNames, clubRecords } from './data.mjs';
import { ClubError } from '../club/members.mjs';

/** A ClubError, so the Worker's club error handling returns it with its status. */
export class AnalyticsError extends ClubError {
	constructor(message, status = 400) {
		super(message, 'INVALID_ANALYTICS', status);
	}
}

export const ROUTES = Object.freeze(['overview', 'games', 'cards', 'patterns', 'rivals', 'rival', 'insights', 'nights', 'hands', 'hand', 'trends']);

/** Only known values pass; anything else is an error, never silently widened. */
export function parseFilter(params) {
	const get = (k) => params.get?.(k) ?? params[k] ?? undefined;
	const filter = {};
	const window = get('window');
	if (window) {
		if (!WINDOWS.includes(window)) throw new AnalyticsError('Unknown time window');
		filter.window = window;
	}
	const game = get('game');
	if (game) {
		if (!GAMES.includes(game)) throw new AnalyticsError('Unknown game');
		filter.game = game;
	}
	const variant = get('variant');
	if (variant) {
		if (!/^[a-z0-9-]{1,40}$/.test(variant)) throw new AnalyticsError('Unknown variant');
		filter.variant = variant;
	}
	const company = get('company');
	if (company) {
		if (!['all', 'friends', 'bots'].includes(company)) throw new AnalyticsError('Unknown company filter');
		filter.company = company;
	}
	const opponent = get('opponent');
	if (opponent) {
		if (!/^(bot:)?[a-z0-9-]{1,64}$/i.test(opponent)) throw new AnalyticsError('Unknown opponent');
		filter.opponent = opponent;
	}
	const night = get('night');
	if (night) {
		if (night.length > 160) throw new AnalyticsError('Unknown night');
		filter.night = night;
	}
	return filter;
}

/* Club-wide pooled behaviour, the prior individual pattern rates shrink toward (anonymous). */
let priorCache = { at: 0, prior: null };
async function clubPriorCached(db, now) {
	if (priorCache.prior && now - priorCache.at < 10 * 60_000) return priorCache.prior;
	// The latest 600 hands give a stable club average without a large transfer per isolate.
	const records = await clubRecords(db, { full: true, limit: 600 });
	const set = collectDecisions(records, (r) => r.seats.filter((s) => s.kind === 'human').map((s) => s.p));
	priorCache = { at: now, prior: clubPrior(set) };
	return priorCache.prior;
}

function pick(names, subjects) {
	const out = {};
	for (const s of subjects) if (names[s]) out[s] = { name: names[s].name, kind: names[s].kind, characterId: names[s].characterId ?? null, mascotId: names[s].mascotId ?? null };
	return out;
}

async function patternsFor(db, viewer, filter, now) {
	const records = await playerRecords(db, viewer, { full: true });
	const facts = factsFor(records, viewer);
	const keep = new Set(filterFacts(facts, filter, now).map((f) => f.handId));
	const chosen = records.filter((r) => keep.has(r._id));
	const factsByHand = new Map(facts.map((f) => [`${f.handId}|${viewer}`, f]));
	const set = collectDecisions(chosen, (r) => (r.seats.some((s) => s.p === viewer) ? [viewer] : []), factsByHand);
	const prior = await clubPriorCached(db, now);
	return { records, facts, chosen, set, prior };
}

/**
 * @param member the signed-in member document (from the Worker's fresh guest-list check)
 * @param route one of ROUTES
 * @param params URLSearchParams
 */
export async function analyticsResponse(db, member, route, params, now = Date.now()) {
	if (!ROUTES.includes(route)) throw new AnalyticsError('Unknown analytics view', 404);
	const viewer = member.playerId;
	if (!viewer) return { route, empty: true };
	const filter = parseFilter(params);

	if (route === 'overview' || route === 'games' || route === 'trends' || route === 'nights' || route === 'hands') {
		const records = await playerRecords(db, viewer);
		const facts = factsFor(records, viewer);
		if (route === 'overview') return { route, filter, overview: overview(facts, filter, now) };
		if (route === 'games') return { route, filter, games: games(facts, filter, now) };
		if (route === 'trends') return { route, filter, windows: windows(facts, filter, now) };
		if (route === 'nights') return { route, filter, nights: nights(filterFacts(facts, filter, now)) };
		const page = Math.max(0, Math.min(10000, Number(params.get?.('page') ?? 0) || 0));
		return { route, filter, ...hands(filterFacts(facts, filter, now), { night: filter.night, page }) };
	}

	if (route === 'cards') {
		const [records, owns] = await Promise.all([playerRecords(db, viewer), ownPrivate(db, viewer)]);
		const facts = filterFacts(factsFor(records, viewer), filter, now);
		const keep = new Set(facts.map((f) => f.handId));
		const mine = owns.filter((o) => keep.has(o.handId));
		const tables = new Map(records.map((r) => [r._id, r.table]));
		return {
			route,
			filter,
			cards: ownCards(mine, new Map(facts.map((f) => [f.handId, f])), tables),
			fairness: deckFairness(mine)
		};
	}

	if (route === 'patterns') {
		const { set, prior } = await patternsFor(db, viewer, filter, now);
		const names = await subjectNames(db);
		const situations = situational(set, prior);
		return {
			route,
			filter,
			core: coreRates(set),
			club: prior,
			situations,
			styleChange: styleChange(set, now),
			names: pick(names, situations.filter((s) => s.opponent).map((s) => s.opponent))
		};
	}

	if (route === 'rivals' || route === 'rival') {
		const records = await playerRecords(db, viewer);
		const keep = new Set(filterFacts(factsFor(records, viewer), { ...filter, opponent: undefined }, now).map((f) => f.handId));
		const chosen = records.filter((r) => keep.has(r._id));
		const names = await subjectNames(db);
		if (route === 'rivals') {
			const list = rivalries(chosen, viewer);
			return { route, filter, rivals: list, names: pick(names, list.map((r) => r.subject)) };
		}
		if (!filter.opponent) throw new AnalyticsError('Choose an opponent');
		const detail = rivalry(chosen, viewer, filter.opponent);
		if (!detail) throw new AnalyticsError('You have not played with them yet', 404);
		return { route, filter, rival: detail, names: pick(names, [filter.opponent]) };
	}

	if (route === 'hand') {
		const handId = params.get?.('id') ?? params.id;
		if (typeof handId !== 'string' || handId.length > 200) throw new AnalyticsError('Unknown hand');
		const record = await recordById(db, handId);
		if (!record) throw new AnalyticsError('Unknown hand', 404);
		const own = record.seats.some((s) => s.p === viewer) ? await ownPrivate(db, viewer, { handId }) : null;
		const names = await subjectNames(db);
		const detail = handDetail(record, viewer, own, names);
		if (!detail) throw new AnalyticsError('You were not at this table', 403);
		return { route, hand: detail };
	}

	// insights: every piece, then the engine.
	const { facts, set, prior, chosen } = await patternsFor(db, viewer, filter, now);
	const names = await subjectNames(db);
	const ov = overview(facts, filter, now);
	const list = insights(
		{
			subject: viewer,
			window: filter.window ?? 'all',
			overview: ov,
			games: games(facts, filter, now),
			situational: situational(set, prior),
			styleChange: styleChange(set, now),
			rivals: rivalries(chosen, viewer),
			fairness: deckFairness(await ownPrivate(db, viewer))
		},
		names
	);
	return { route, filter, insights: list, names: pick(names, list.map((i) => i.opponent).filter(Boolean)) };
}

/**
 * Owner view: every member's results on the same normalised basis (public records only; no
 * private cards are read). Replaces the raw-chip Admin table.
 */
export async function adminAnalytics(db, params, now = Date.now()) {
	const filter = parseFilter(params);
	const records = await clubRecords(db);
	const names = await subjectNames(db);
	const bySubject = new Map();
	for (const record of records)
		for (const fact of handFacts(record).values()) {
			if (fact.kind !== 'human') continue;
			if (!bySubject.has(fact.subject)) bySubject.set(fact.subject, []);
			bySubject.get(fact.subject).push(fact);
		}
	const seen = new Map(
		(await db.collection('members').find({ playerId: { $type: 'string' } }, { projection: { playerId: 1, lastSeenAt: 1, claimedAt: 1 } }).toArray()).map((m) => [m.playerId, m.lastSeenAt ?? m.claimedAt ?? null])
	);
	const members = [...bySubject.entries()].map(([playerId, all]) => {
		const facts = filterFacts(all.sort((a, b) => a.completedAt - b.completedAt), filter, now);
		const games = {};
		for (const f of facts) games[f.gameType] = (games[f.gameType] ?? 0) + 1;
		return {
			memberId: names[playerId]?.memberId ?? null,
			playerId,
			hands: facts.length,
			nights: new Set(facts.map((f) => f.nightId)).size,
			games,
			withBots: facts.filter((f) => f.practice).length,
			fairShare: fairShare(facts),
			results: results(facts.filter((f) => f.stake)),
			lastPlayedAt: facts.at(-1)?.completedAt ?? null,
			lastSeenAt: seen.get(playerId) ?? null
		};
	});
	// Club-level counts honour only the calendar window; per-player windows apply above.
	const since = filter.window === '30d' ? now - 30 * 24 * 60 * 60 * 1000 : 0;
	const scoped = records.filter((r) => r.completedAt >= since);
	const variants = {};
	for (const r of scoped) {
		const key = r.gameType === 'teen-patti' ? `teen-patti/${r.rulesVersion}` : r.gameType;
		variants[key] = (variants[key] ?? 0) + 1;
	}
	return {
		filter,
		totals: {
			hands: scoped.length,
			nights: new Set(scoped.map((r) => r.nightId)).size,
			players: members.filter((m) => m.hands).length
		},
		variants,
		members
	};
}
