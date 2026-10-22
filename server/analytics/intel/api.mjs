/**
 * Member-facing intelligence routes (docs/archive/ANALYTICS_PHASE5.md). Same contract as analytics/api.mjs:
 * the viewer is the signed-in member, responses are purpose-built, and every number is computed by the
 * canonical modules (compute/*, intel/*). This file only loads, composes and authorises; it does not
 * define a metric.
 */
import { factsFor } from '../compute/facts.mjs';
import { filterFacts } from '../compute/performance.mjs';
import { collectDecisions } from '../compute/patterns.mjs';
import { rivalries, rivalry } from '../compute/rivals.mjs';
import { hands as handList } from '../compute/history.mjs';
import { clubRecords as loadClubRecords, integrityCounts, clubCardCounts, nightRecords, ownPrivate, playerRecords, subjectNames } from '../data.mjs';
import { COLLECTIONS } from '../store.mjs';
import { skillLuck, playRows, blackjackCosts } from './skill-luck.mjs';
import { improvement } from './improvement.mjs';
import { rivalryBoard, rivalryPage } from './rivalry.mjs';
import { personalRecords, recordsBroken, clubRecords } from './records.mjs';
import { achievements } from './achievements.mjs';
import { nightSurprises } from './surprise.mjs';
import { buildRecap, sharedNight } from './recap.mjs';
import { loadShown, markShown, rankInsights } from './ranking.mjs';
import { fairnessCenter } from './fairness.mjs';
import { clubTimeline } from './timeline.mjs';
import { cachedByHead } from './memo.mjs';
import { enabledBotIds } from '../../bots/directory.mjs';
import { publicMemory } from '../../bots/memory/diagnostics.mjs';
import { ClubError } from '../../club/members.mjs';

export const INTEL_ROUTES = Object.freeze(['skill', 'records', 'recap', 'fairness', 'timeline', 'club', 'evidence']);
/** Routes that describe a specific opponent. Not available while the viewer is in a live hand. */
export const OPPONENT_ROUTES = Object.freeze(['rivals', 'rival', 'patterns', 'insights']);

/** True while this member is connected to a table whose hand is in progress (from the lobby's public summary). */
export const inLiveHand = (tables, memberId) => (tables ?? []).some((table) => table.isStarted && (table.connectedMembers ?? []).includes(String(memberId)));

const fail = (message, status = 400, code = 'INVALID_ANALYTICS') => new ClubError(message, code, status);

function pick(names, subjects) {
	const out = {};
	for (const s of subjects) if (names[s]) out[s] = { name: names[s].name, kind: names[s].kind, characterId: names[s].characterId ?? null, mascotId: names[s].mascotId ?? null };
	return out;
}

/** Everything one viewer's routes share, loaded once per request. */
async function context(db, viewer, { decisions = true } = {}) {
	const [summary, full, owns, names] = await Promise.all([playerRecords(db, viewer), decisions ? playerRecords(db, viewer, { full: true }) : [], ownPrivate(db, viewer), subjectNames(db)]);
	const facts = factsFor(summary, viewer);
	const factsByHand = new Map(facts.map((f) => [`${f.handId}|${viewer}`, f]));
	return {
		summary,
		full,
		fullById: new Map(full.map((r) => [r._id, r])),
		ownsByHand: new Map(owns.map((o) => [o.handId, o])),
		facts,
		factsByHand,
		names
	};
}
const decisionsOf = (records, viewer, factsByHand) => collectDecisions(records, (r) => (r.seats.some((s) => s.p === viewer) ? [viewer] : []), factsByHand);

/** The club's public hands for club-wide views, cached against the head of the history. */
const clubHands = (db) => cachedByHead(db, 'club-hands', () => loadClubRecords(db, { limit: 20000 }));

export async function intelResponse(db, member, route, params, filter, now = Date.now()) {
	const viewer = member.playerId;

	if (route === 'club' || route === 'timeline') {
		const [records, names] = await Promise.all([clubHands(db), subjectNames(db)]);
		if (route === 'club') return { route, ...clubRecords(records, names) };
		const bots = (await db.collection(COLLECTIONS.bots).find({}, { projection: { name: 1, createdAt: 1, currentVersion: 1 } }).toArray()).filter((b) => b.createdAt).map((b) => ({ botId: b._id, name: b.name, at: new Date(b.createdAt).getTime() }));
		return { route, ...clubTimeline({ records, bots, names, now }) };
	}

	if (route === 'fairness') {
		const [owns, integrity, club] = await Promise.all([ownPrivate(db, viewer), integrityCounts(db, viewer), cachedByHead(db, 'club-cards', () => clubCardCounts(db))]);
		const keep = new Set(filterFacts(factsFor(await playerRecords(db, viewer), viewer), filter, now).map((f) => f.handId));
		return { route, filter, ...fairnessCenter({ owns: owns.filter((o) => keep.has(o.handId)), integrity, club }) };
	}

	const ctx = await context(db, viewer, { decisions: route !== 'evidence' });
	const filtered = filterFacts(ctx.facts, filter, now);

	if (route === 'skill') {
		const keep = new Set(filtered.map((f) => f.handId));
		const scoped = filtered;
		const skill = skillLuck({ facts: scoped, owns: ctx.ownsByHand, records: ctx.fullById });
		// Improvement compares the recent window with the player's own earlier history, so the time
		// window is ignored; game and variant still apply.
		const base = filterFacts(ctx.facts, { ...filter, window: undefined, from: undefined, until: undefined }, now);
		const rows = playRows({ facts: base, owns: ctx.ownsByHand, records: ctx.fullById });
		const baseIds = new Set(base.map((f) => f.handId));
		const set = decisionsOf(ctx.full.filter((r) => baseIds.has(r._id)), viewer, ctx.factsByHand);
		return {
			route,
			filter,
			skill,
			improvement: improvement({ rows, facts: base, set, bjDecisions: blackjackCosts({ facts: base, owns: ctx.ownsByHand, records: ctx.fullById }), now }),
			hands: keep.size
		};
	}

	if (route === 'records') {
		const base = filterFacts(ctx.facts, { game: filter.game, variant: filter.variant }, now);
		const baseIds = new Set(base.map((f) => f.handId));
		const records = ctx.summary.filter((r) => baseIds.has(r._id));
		const set = decisionsOf(ctx.full.filter((r) => baseIds.has(r._id)), viewer, ctx.factsByHand);
		const rivals = rivalries(records, viewer, now);
		const rows = playRows({ facts: base, owns: ctx.ownsByHand, records: ctx.fullById });
		const result = achievements({ facts: base, set, rows, botIds: await enabledBotIds(db), names: ctx.names });
		return {
			route,
			filter,
			empty: base.filter((f) => f.complete).length < 5,
			records: personalRecords({ facts: base, set, rivals }),
			achievements: result,
			names: pick(ctx.names, [...result.earned, ...result.next].map((a) => a.id.split(':')[1]).filter(Boolean))
		};
	}

	if (route === 'recap') {
		// No night chosen: the latest one this player sat in.
		const nightId = params.get?.('night') ?? params.night ?? ctx.facts.at(-1)?.nightId;
		if (!nightId) return { route, empty: true };
		if (typeof nightId !== 'string' || nightId.length > 160) throw fail('Choose a night');
		const mine = ctx.facts.filter((f) => f.nightId === nightId);
		if (!mine.length) throw fail('You were not at this night', 403);
		const records = await nightRecords(db, nightId);
		const names = ctx.names;
		const shared = sharedNight(records, names);
		const startedAt = Math.min(...mine.map((f) => f.startedAt));
		const beforeFacts = ctx.facts.filter((f) => f.completedAt < startedAt);
		const throughFacts = ctx.facts.filter((f) => f.startedAt <= Math.max(...mine.map((f) => f.completedAt)));
		const set = decisionsOf(ctx.full, viewer, ctx.factsByHand);
		// Only this night's cards are needed to say whether they ran warm or cold.
		const rows = playRows({ facts: mine, owns: ctx.ownsByHand, records: ctx.fullById });
		const skill = skillLuck({ facts: mine, owns: ctx.ownsByHand, records: ctx.fullById });
		const before = ctx.summary.filter((r) => r.completedAt < startedAt);
		const personal = nightSurprises({ nightId, facts: ctx.facts, set, rows, skillNights: skill.nights, rivalsBefore: rivalries(before, viewer, now), rivalsAfter: rivalries(ctx.summary, viewer, now), names });
		const recordsAt = (facts) => {
			const ids = new Set(facts.map((f) => f.handId));
			return { facts, set: { hands: set.hands.filter((h) => ids.has(h.handId)) } };
		};
		const broken = recordsBroken(personalRecords({ ...recordsAt(beforeFacts), rivals: rivalries(before, viewer, now) }), personalRecords({ ...recordsAt(throughFacts), rivals: rivalries(ctx.summary, viewer, now) }), nightId);
		const shown = await loadShown(db, viewer, { exclude: `recap:${nightId}` });
		const recap = buildRecap({ nightId, viewer, shared, viewerFacts: ctx.facts, personal, recordsBroken: broken, shown, names, now, skillNight: skill.nights.find((n) => n.nightId === nightId) });
		await markShown(db, viewer, recap.highlights, `recap:${nightId}`, now);
		const subjects = [...shared.humans, ...shared.bots].map((p) => p.subject);
		return { route, recap, names: pick(names, subjects) };
	}

	if (route === 'evidence') {
		const ids = (params.get?.('hands') ?? params.hands ?? '').split(',').filter(Boolean).slice(0, 12);
		if (ids.some((id) => id.length > 200)) throw fail('Unknown hand');
		// The viewer's own facts are the only source, so a hand they were not dealt into can never appear.
		const wanted = new Set(ids);
		const night = params.get?.('night') ?? params.night;
		const scope = ctx.facts.filter((f) => (wanted.size ? wanted.has(f.handId) : false) || (night && f.nightId === night && !wanted.size));
		return { route, requested: ids.length, ...handList(scope, { night: night && !wanted.size ? night : undefined, pageSize: 12 }) };
	}
	throw fail('Unknown analytics view', 404);
}

/** Opponent-level extras for the existing rivals routes. */
export async function rivalExtras(db, viewer, kind, { rivals, chosen, subject, names, now }) {
	if (kind === 'board') return rivalryBoard(rivals, names);
	const detail = rivalry(chosen, viewer, subject);
	const full = (await playerRecords(db, viewer, { full: true })).filter((r) => chosen.some((c) => c._id === r._id));
	let memory = null;
	if (subject.startsWith('bot:')) {
		const m = await publicMemory(db, subject.slice(4), viewer, now).catch(() => null);
		memory = m && m.status === 'remembered' ? { familiarity: m.familiarity, moment: m.moment, hands: m.hands } : { familiarity: 'Just met', moment: null, hands: 0 };
	}
	return rivalryPage({ rival: detail, records: full, viewer, names, memory });
}

/** Rank the existing insight engine's output with everything else that is worth saying. */
export async function rankedInsights(db, viewer, list, now) {
	const shown = await loadShown(db, viewer);
	const candidates = list
		.filter((i) => i.eligible)
		.map((i) => ({
			id: i.id,
			topic: `${i.type}:${i.metric}`,
			scope: i.type === 'rival' || i.type === 'opponent-pattern' ? 'social' : 'personal',
			confidence: i.confidence?.q === null || i.confidence?.q === undefined ? 1 : Math.max(0, 1 - i.confidence.q * 8),
			magnitude: Math.min(1, (i.magnitudeRatio ?? 1) / 3),
			actionability: i.type === 'pattern' || i.type === 'opponent-pattern' ? 0.6 : 0.2,
			text: i.text,
			evidence: { hands: i.supportingHands ?? [], nightId: i.nightId ?? null, opponent: i.opponent ?? null },
			source: i
		}));
	return rankInsights(candidates, { shown, now, limit: 6, min: 3 }).map(({ source, score, components }) => ({ ...source, rank: { score: Math.round(score * 100) / 100, components } }));
}
