/**
 * Results analytics over canonical hand facts: summaries, filters, the overview, per-game and
 * per-variant breakdowns, and trends. Pure functions: callers load facts, these compute.
 */
import { clusteredMean, evidence, round, shrinkMean, twoSidedP, Z95 } from './stats.mjs';
import { UNITS } from './facts.mjs';

export const MIN = Object.freeze({
	/** Hands before a result per hand is shown at all. */
	hands: 20,
	/** Hands in a game or variant before it can be called best, worst or most profitable. */
	gameHands: 50,
	/** Hands with a fair share before win rate is judged against it. */
	fairHands: 20,
	/** Nights before night-level statements. */
	nights: 3
});
const DAY = 24 * 60 * 60 * 1000;

/* --------------------------------------------- filters --------------------------------------------- */

export const WINDOWS = Object.freeze(['recent-hands', 'recent-nights', '30d', 'all']);

/**
 * @param facts sorted by completedAt
 * @param filter { window, game, variant, company: all|friends|bots, opponent: subject, night }
 */
export function filterFacts(facts, filter = {}, now = Date.now()) {
	let out = facts.filter(
		(f) =>
			(!filter.game || f.gameType === filter.game) &&
			(!filter.variant || f.rulesVersion === filter.variant) &&
			(!filter.night || f.nightId === filter.night) &&
			(!filter.opponent || f.opponents.some((o) => o.subject === filter.opponent)) &&
			(filter.company === 'friends' ? !f.practice : filter.company === 'bots' ? f.practice : true)
	);
	if (filter.window === '30d') out = out.filter((f) => f.completedAt >= now - 30 * DAY);
	else if (filter.window === 'recent-hands') out = out.slice(-50);
	else if (filter.window === 'recent-nights') {
		const nights = [...new Set(out.map((f) => f.nightId))].slice(-5);
		out = out.filter((f) => nights.includes(f.nightId));
	}
	return out;
}

/* --------------------------------------------- summary --------------------------------------------- */

function byNight(facts) {
	const nights = new Map();
	for (const f of facts) {
		const night = nights.get(f.nightId) ?? { nightId: f.nightId, room: f.room, startedAt: f.startedAt, endedAt: f.completedAt, hands: 0, units: 0, wins: 0 };
		night.hands++;
		night.units += f.units;
		night.wins += f.won;
		night.startedAt = Math.min(night.startedAt, f.startedAt);
		night.endedAt = Math.max(night.endedAt, f.completedAt);
		nights.set(f.nightId, night);
	}
	return [...nights.values()].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Wins against the fair share. Variance of a win count with per-hand probability 1/n is
 * Σ p(1 − p); the z-score says whether the gap is more than luck would usually produce.
 */
export function fairShare(facts) {
	const judged = facts.filter((f) => f.complete && f.fairShare !== null);
	const wins = judged.reduce((s, f) => s + f.won, 0);
	const expected = judged.reduce((s, f) => s + f.fairShare, 0);
	const variance = judged.reduce((s, f) => s + f.fairShare * (1 - f.fairShare), 0);
	const z = variance ? (wins - expected) / Math.sqrt(variance) : 0;
	const p = variance ? twoSidedP(z) : 1;
	const level = evidence(judged.length, MIN.fairHands);
	return {
		hands: judged.length,
		wins: round(wins, 2),
		expected: round(expected, 2),
		aboveFair: round(wins - expected, 2),
		ratio: expected ? round(wins / expected, 2) : null,
		ratioLow: expected ? round(Math.max(0, wins - Z95 * Math.sqrt(variance)) / expected, 2) : null,
		ratioHigh: expected ? round((wins + Z95 * Math.sqrt(variance)) / expected, 2) : null,
		p: round(p, 4),
		evidence: level,
		verdict: level === 'insufficient' ? 'insufficient' : p < 0.05 ? (wins > expected ? 'above' : 'below') : 'about-fair'
	};
}

/** Results in stake units, judged per hand with nights as clusters. */
export function results(facts) {
	const complete = facts.filter((f) => f.complete);
	const nights = byNight(complete);
	const perHand = clusteredMean(nights.map((n) => ({ sum: n.units, n: n.hands })));
	const level = evidence(complete.length, MIN.hands);
	const total = complete.reduce((s, f) => s + f.units, 0);
	const best = nights.length ? nights.reduce((a, b) => (b.units > a.units ? b : a)) : null;
	const worst = nights.length ? nights.reduce((a, b) => (b.units < a.units ? b : a)) : null;
	return {
		hands: complete.length,
		nights: nights.length,
		units: round(total, 1),
		perHand: round(perHand.mean, 2),
		perHandLow: round(perHand.low, 2),
		perHandHigh: round(perHand.high, 2),
		perHandSe: perHand.se,
		perNight: nights.length ? round(total / nights.length, 1) : null,
		evidence: level,
		verdict:
			level === 'insufficient' || perHand.low === null
				? 'insufficient'
				: perHand.low > 0
					? 'winning'
					: perHand.high < 0
						? 'losing'
						: 'about-even',
		bestNight: best && nights.length >= MIN.nights ? { nightId: best.nightId, units: round(best.units, 1), hands: best.hands, at: best.startedAt } : null,
		worstNight: worst && nights.length >= MIN.nights ? { nightId: worst.nightId, units: round(worst.units, 1), hands: worst.hands, at: worst.startedAt } : null
	};
}

/** Running total of units, at most `points` points, for a trend line. */
export function cumulative(facts, points = 160) {
	const complete = facts.filter((f) => f.complete);
	let running = 0;
	const series = complete.map((f, i) => {
		running += f.units;
		return { i: i + 1, at: f.completedAt, units: round(running, 1) };
	});
	if (series.length <= points) return series;
	const step = series.length / points;
	return Array.from({ length: points }, (_, k) => series[Math.min(series.length - 1, Math.round((k + 1) * step) - 1)]);
}

/* --------------------------------------------- overview --------------------------------------------- */

export function overview(allFacts, filter = {}, now = Date.now()) {
	const facts = filterFacts(allFacts, filter, now);
	const stake = facts.filter((f) => f.stake);
	const rummy = facts.filter((f) => f.gameType === 'rummy');
	const games = {};
	for (const f of facts) games[f.gameType] = (games[f.gameType] ?? 0) + 1;
	const nights = byNight(stake.filter((f) => f.complete));
	const won = stake.filter((f) => f.complete && f.won > 0 && f.potUnits !== null);
	const biggestPot = won.length ? won.reduce((a, b) => (b.potUnits > a.potUnits ? b : a)) : null;
	return {
		filter,
		hands: facts.length,
		nights: new Set(facts.map((f) => f.nightId)).size,
		games,
		withBots: facts.filter((f) => f.practice).length,
		fairShare: fairShare(facts),
		results: results(stake),
		rummy: rummy.length ? { ...results(rummy), unit: UNITS.rummy.many } : null,
		cumulative: cumulative(stake),
		recentNights: nights.slice(-10).map((n) => ({ nightId: n.nightId, at: n.startedAt, units: round(n.units, 1), hands: n.hands })),
		trend: trend(allFacts.filter((f) => f.stake), filter, now),
		biggestPot: biggestPot ? { handId: biggestPot.handId, units: round(biggestPot.potUnits, 1), gameType: biggestPot.gameType, at: biggestPot.completedAt } : null
	};
}

/* ------------------------------------------- games, variants ------------------------------------------- */

function breakdown(facts, key, prior, strength) {
	const groups = new Map();
	for (const f of facts) {
		const k = key(f);
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(f);
	}
	return [...groups.entries()].map(([k, group]) => {
		const r = results(group);
		return {
			key: k,
			hands: group.length,
			nights: r.nights,
			wins: round(group.reduce((s, f) => s + f.won, 0), 2),
			fairShare: fairShare(group),
			results: r,
			// Small groups lean on the player's overall rate, so one lucky night is not a "best game".
			shrunkPerHand: r.perHand === null ? null : round(shrinkMean(r.perHand, r.hands, prior, strength), 2),
			averagePot: round(avg(group.filter((f) => f.complete && f.potUnits !== null).map((f) => f.potUnits)), 1),
			recent: results(group.slice(-30)).perHand
		};
	});
}
const avg = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

/**
 * Pick a best or worst group only when the evidence separates it from the rest; otherwise say so.
 */
function standout(groups, direction) {
	const qualified = groups.filter((g) => g.results.hands >= MIN.gameHands && g.results.perHandSe !== null);
	if (qualified.length < 2) return { key: null, reason: 'not-enough-hands' };
	const sorted = [...qualified].sort((a, b) => direction * (b.shrunkPerHand - a.shrunkPerHand));
	const [top, next] = sorted;
	const z = (top.results.perHand - next.results.perHand) / Math.sqrt(top.results.perHandSe ** 2 + next.results.perHandSe ** 2);
	const p = twoSidedP(z);
	return p < 0.05 ? { key: top.key, p: round(p, 4), margin: round(top.results.perHand - next.results.perHand, 2) } : { key: null, candidate: top.key, reason: 'too-close', p: round(p, 4) };
}

export function games(allFacts, filter = {}, now = Date.now()) {
	const facts = filterFacts(allFacts, { ...filter, game: undefined, variant: undefined }, now);
	const overallStake = results(facts.filter((f) => f.stake));
	const byGame = breakdown(facts, (f) => f.gameType, overallStake.perHand, 50).map((g) => ({
		...g,
		unit: UNITS[g.key]?.many ?? 'units'
	}));
	const stakeGames = byGame.filter((g) => UNITS[g.key]?.stake);
	const tp = facts.filter((f) => f.gameType === 'teen-patti');
	const tpResults = results(tp);
	const variants = breakdown(tp, (f) => f.rulesVersion, tpResults.perHand, 40).sort((a, b) => b.hands - a.hands);
	const mostPlayed = byGame.length ? byGame.reduce((a, b) => (b.hands > a.hands ? b : a)).key : null;
	const profitable = stakeGames.filter((g) => g.results.hands >= MIN.gameHands);
	return {
		filter,
		games: byGame.sort((a, b) => b.hands - a.hands),
		variants,
		labels: {
			mostPlayed,
			mostProfitable: profitable.length ? profitable.reduce((a, b) => (b.results.units > a.results.units ? b : a)).key : null,
			best: standout(stakeGames, 1),
			worst: standout(stakeGames, -1),
			bestVariant: standout(variants, 1),
			worstVariant: standout(variants, -1)
		}
	};
}

/* --------------------------------------------- trends --------------------------------------------- */

/** Recent results against everything before them: is the player's form changing? */
export function trend(stakeFacts, filter = {}, now = Date.now()) {
	const base = filterFacts(stakeFacts, { ...filter, window: 'all' }, now).filter((f) => f.complete);
	const recent = base.filter((f) => f.completedAt >= now - 30 * DAY);
	const earlier = base.filter((f) => f.completedAt < now - 30 * DAY);
	const a = results(recent);
	const b = results(earlier);
	if (a.evidence === 'insufficient' || b.evidence === 'insufficient' || a.perHandSe === null || b.perHandSe === null)
		return { verdict: 'insufficient', recent: a.perHand, earlier: b.perHand, recentHands: a.hands, earlierHands: b.hands };
	const diff = a.perHand - b.perHand;
	const p = twoSidedP(diff / Math.sqrt(a.perHandSe ** 2 + b.perHandSe ** 2));
	return {
		verdict: p < 0.05 ? (diff > 0 ? 'improving' : 'declining') : 'steady',
		recent: a.perHand,
		earlier: b.perHand,
		diff: round(diff, 2),
		p: round(p, 4),
		recentHands: a.hands,
		earlierHands: b.hands
	};
}

/** The same summary for each time window, side by side. */
export function windows(allFacts, filter = {}, now = Date.now()) {
	return WINDOWS.map((window) => {
		const facts = filterFacts(allFacts, { ...filter, window }, now);
		return { window, hands: facts.length, results: results(facts.filter((f) => f.stake)), fairShare: fairShare(facts) };
	});
}
