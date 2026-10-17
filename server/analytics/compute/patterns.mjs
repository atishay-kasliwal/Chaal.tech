/**
 * Behaviour from recorded action sequences (docs/ANALYTICS_PHASE2.md, "Patterns").
 *
 * Every rate counts only opportunities: a fold rate's denominator is the decisions where
 * folding was legal (from the decision's recorded legal options), a raise rate's where raising
 * was. Voluntary decisions are kept apart from timeouts, forced shows, knock-outs and other
 * automatic actions. Only public information is used, so the same code can describe a bot or
 * pool a whole club for baselines.
 */
import { subjectOf } from './facts.mjs';
import { benjaminiHochberg, proportionTest, round, shrinkRate, wilson, evidence } from './stats.mjs';

export const MIN_OPPORTUNITIES = 20;
const BETTING = new Set(['fold', 'call', 'raise', 'check', 'show']);
const HOUR = 60 * 60 * 1000;

/** The options a player had, in one vocabulary across games. */
function options(game, legal = {}) {
	if (game === 'teen-patti')
		return {
			fold: !!legal.pack,
			call: !!legal.bet,
			raise: !!legal.bet && Number(legal.maxBet) > Number(legal.minBet),
			check: false,
			show: !!legal.show,
			see: !!legal.see
		};
	if (game === 'texas-holdem')
		return { fold: !!legal.fold, call: !!legal.call, raise: !!legal.raise, check: !!legal.check, show: false, see: false };
	if (game === 'blackjack') return { hit: !!legal.hit, stand: !!legal.stand, double: !!legal.double };
	if (game === 'rummy') return { drawDiscard: !!legal.drawDiscard, declare: !!legal.declare };
	return {};
}

/**
 * Every decision one seat made in one hand, with its context. `context` carries per-hand facts
 * the record does not hold per event (night position, previous result).
 */
export function decisionsIn(record, seatId, context = {}) {
	const game = record.gameType;
	const seats = new Map(record.seats.map((s) => [s.p, s]));
	const self = seats.get(seatId);
	if (!self) return { decisions: [], timeouts: [], hand: null };
	const unit = context.unit ?? 1;
	const out = [];
	const timeouts = [];
	const exited = new Set();
	let lastRaise = null;
	let blindDecisions = 0;
	let sawAtDecision = null;
	let showRequested = false;
	for (const e of record.events ?? []) {
		if (e.sub !== undefined) {
			if (e.a === 'knock-out') for (const p of e.players ?? []) exited.add(p);
			continue;
		}
		if (e.p === seatId) {
			if (e.a === 'timeout') timeouts.push({ i: e.i, connected: (e.connected ?? []).includes(seatId) });
			else if (e.decision && e.kind !== 'system') {
				const d = e.decision;
				const live = [...seats.keys()].filter((p) => p !== seatId && !exited.has(p));
				const decision = {
					handId: record._id,
					at: record.completedAt,
					i: e.i,
					game,
					variant: record.rulesVersion ?? null,
					action: e.a,
					betting: BETTING.has(e.a),
					options: options(game, d.legal),
					facing: d.facing ?? 'none',
					facingFrom: d.facing === 'raise' && lastRaise ? subjectOf(seats.get(lastRaise.p) ?? { p: lastRaise.p }) : null,
					largeRaise: game === 'texas-holdem' && d.facing === 'raise' && lastRaise?.size >= 0.75,
					blind: d.blind ?? null,
					stakeMultiple: d.stakeMultiple ?? null,
					betToPot: game === 'texas-holdem' && e.a === 'raise' && d.potBefore ? e.payload?.amount / d.potBefore : null,
					potUnits: d.potBefore !== null && d.potBefore !== undefined ? d.potBefore / unit : null,
					stackUnits: d.stackBefore !== null && d.stackBefore !== undefined ? d.stackBefore / unit : null,
					live: live.map((p) => subjectOf(seats.get(p))),
					relOrder: record.seats.length > 1 && self.order !== null && self.order !== undefined ? self.order / (record.seats.length - 1) : null,
					nightHour: context.nightStart ? (record.startedAt - context.nightStart) / HOUR : null,
					nightHalf: context.nightHalf ?? null,
					after: context.after ?? null,
					lossStreak: context.lossStreak ?? 0
				};
				if (game === 'teen-patti' && decision.betting && decision.blind) blindDecisions++;
				if (e.a === 'show') showRequested = true;
				out.push(decision);
			}
			if (e.a === 'see' && sawAtDecision === null) sawAtDecision = blindDecisions;
		}
		if (['fold', 'timeout', 'leave'].includes(e.a)) exited.add(e.p);
		if (e.a === 'raise') lastRaise = { p: e.p, size: game === 'texas-holdem' && e.decision?.potBefore ? e.payload?.amount / e.decision.potBefore : null };
	}
	const result = record.outcome?.players?.find((p) => p.p === seatId);
	return {
		decisions: out,
		timeouts,
		hand: {
			handId: record._id,
			game,
			blindDecisions,
			sawBeforeBetting: sawAtDecision === 0,
			stayedBlind: game === 'teen-patti' && sawAtDecision === null && blindDecisions > 0,
			showRequested,
			showWon: showRequested && result?.exit === 'won',
			turns: out.filter((d) => d.betting).length + timeouts.length
		}
	};
}

/**
 * Decisions for one subject across records, with night context (half of the night, the
 * previous hand's result, losing streak) attached.
 * @param seatsOf record => seat ids belonging to the subject in that record
 */
export function collectDecisions(records, seatsOf, factsByHand = new Map()) {
	const sorted = [...records].sort((a, b) => a.completedAt - b.completedAt);
	const perNight = new Map();
	for (const r of sorted) {
		if (!perNight.has(r.nightId)) perNight.set(r.nightId, []);
		perNight.get(r.nightId).push(r);
	}
	const decisions = [];
	const timeouts = [];
	const hands = [];
	for (const nightRecords of perNight.values()) {
		const nightStart = nightRecords[0].startedAt;
		let previous = null;
		let lossStreak = 0;
		nightRecords.forEach((record, index) => {
			for (const seatId of seatsOf(record)) {
				const fact = factsByHand.get(`${record._id}|${seatId}`);
				const out = decisionsIn(record, seatId, {
					unit: fact?.unit ?? record.config?.boot ?? 1,
					nightStart,
					nightHalf: index < nightRecords.length / 2 ? 'first' : 'second',
					after: previous,
					lossStreak
				});
				decisions.push(...out.decisions);
				timeouts.push(...out.timeouts);
				if (out.hand) hands.push(out.hand);
				if (fact?.complete) {
					previous = fact.won > 0 ? 'win' : 'loss';
					lossStreak = fact.won > 0 ? 0 : lossStreak + 1;
				}
			}
		});
	}
	return { decisions, timeouts, hands };
}

/* ------------------------------------------- rates ------------------------------------------- */

function rate(decisions, action, legalKey = action) {
	const opportunities = decisions.filter((d) => d.options[legalKey]);
	const k = opportunities.filter((d) => d.action === action).length;
	return { k, n: opportunities.length };
}
const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
/** Median: one all-in shove into a tiny pot must not define a "typical" raise. */
const median = (values) => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Core rates for any set of decisions: one subject, a bot, or a whole club. */
export function coreRates(set) {
	const betting = set.decisions.filter((d) => d.betting);
	const tp = betting.filter((d) => d.game === 'teen-patti');
	const holdem = betting.filter((d) => d.game === 'texas-holdem');
	const tpHands = set.hands.filter((h) => h.game === 'teen-patti');
	const raises = (list) => rate(list, 'raise');
	const holdemCalls = rate(holdem, 'call').k;
	return {
		decisions: betting.length,
		fold: rate(betting, 'fold'),
		raise: raises(betting),
		call: rate(betting, 'call'),
		check: rate(holdem, 'check'),
		show: rate(betting, 'show'),
		timeout: { k: set.timeouts.length, n: betting.length + set.timeouts.length },
		disconnectedTimeouts: set.timeouts.filter((t) => !t.connected).length,
		teenPatti: {
			stakeMultiple: round(mean(tp.filter((d) => d.action === 'raise' || d.action === 'call').map((d) => d.stakeMultiple).filter((v) => v !== null)), 2),
			blindRaise: raises(tp.filter((d) => d.blind === true)),
			seenRaise: raises(tp.filter((d) => d.blind === false)),
			blindDecisionsPerHand: round(mean(tpHands.map((h) => h.blindDecisions)), 2),
			seeFirst: { k: tpHands.filter((h) => h.sawBeforeBetting).length, n: tpHands.length },
			stayedBlind: { k: tpHands.filter((h) => h.stayedBlind).length, n: tpHands.length },
			showWon: { k: set.hands.filter((h) => h.showWon).length, n: set.hands.filter((h) => h.showRequested).length }
		},
		holdem: {
			aggressionFactor: holdemCalls ? round(rate(holdem, 'raise').k / holdemCalls, 2) : null,
			betToPot: round(median(holdem.map((d) => d.betToPot).filter((v) => v !== null)), 2)
		},
		blackjack: {
			double: rate(set.decisions.filter((d) => d.game === 'blackjack'), 'double'),
			hit: rate(set.decisions.filter((d) => d.game === 'blackjack'), 'hit')
		},
		rummy: { drawDiscard: rate(set.decisions.filter((d) => d.game === 'rummy'), 'draw', 'drawDiscard') }
	};
}

/* ------------------------------------------- comparisons ------------------------------------------- */

/**
 * A rate in one situation against the same subject's rate everywhere else, with the test the
 * insight engine needs. `prior` (a club rate) shrinks small samples toward the group.
 */
function contrast(decisions, inSegment, action, legalKey, meta, prior) {
	const inside = decisions.filter(inSegment);
	const outside = decisions.filter((d) => !inSegment(d));
	const a = rate(inside, action, legalKey);
	const b = rate(outside, action, legalKey);
	const test = proportionTest(a.k, a.n, b.k, b.n);
	const interval = wilson(a.k, a.n);
	return {
		...meta,
		action,
		k: a.k,
		n: a.n,
		rate: round(interval.rate, 3),
		low: round(interval.low, 3),
		high: round(interval.high, 3),
		shrunk: round(shrinkRate(a.k, a.n, prior, 20), 3),
		baseline: { k: b.k, n: b.n, rate: b.n ? round(b.k / b.n, 3) : null },
		diff: round(test.diff, 3),
		p: round(test.p, 4),
		evidence: evidence(Math.min(a.n, b.n), MIN_OPPORTUNITIES),
		hands: [...new Set(inside.filter((d) => d.options[legalKey]).map((d) => d.handId))].slice(-10)
	};
}

const SEGMENTS = [
	['after-loss', 'After losing a hand', (d) => d.after === 'loss'],
	['after-win', 'After winning a hand', (d) => d.after === 'win'],
	['losing-streak', 'After two or more losses in a row', (d) => d.lossStreak >= 2],
	['facing-raise', 'Facing a raise', (d) => d.facing === 'raise'],
	['facing-large-raise', "Facing a big Hold'em raise", (d) => d.largeRaise],
	['blind', 'Still blind (Teen Patti)', (d) => d.blind === true],
	['early-position', 'Acting early', (d) => d.relOrder !== null && d.relOrder < 0.34],
	['late-position', 'Acting late', (d) => d.relOrder !== null && d.relOrder > 0.66],
	['short-stack', 'Short stacked (under 20 boots)', (d) => d.stackUnits !== null && d.stackUnits < 20],
	['big-pot', 'Big pot (over 20 boots)', (d) => d.potUnits !== null && d.potUnits > 20],
	['late-night', 'Second half of the night', (d) => d.nightHalf === 'second'],
	['heads-up', 'Heads-up (one opponent left)', (d) => d.live.length === 1]
];

/**
 * Every situational contrast for raise and fold, plus contrasts against each opponent present.
 * Each carries `q` and `significant` after Benjamini–Hochberg over all of them: with this many
 * comparisons, some would look notable by chance alone.
 */
export function situational(set, club = null, options = {}) {
	const tested = contrasts(set, club, options);
	const testable = tested.filter((c) => c.evidence !== 'insufficient' && c.diff !== null);
	const corrected = benjaminiHochberg(testable, 0.1);
	return tested.map((c) => {
		const index = testable.indexOf(c);
		const done = index >= 0 ? corrected[index] : null;
		return { ...c, q: done ? round(done.q, 4) : null, significant: !!done?.significant };
	});
}

function contrasts(set, club, { opponents = true } = {}) {
	const betting = set.decisions.filter((d) => d.betting);
	const out = [];
	for (const [segment, label, test] of SEGMENTS)
		for (const [action, legalKey] of [['raise', 'raise'], ['fold', 'fold']])
			out.push(contrast(betting, test, action, legalKey, { segment, label }, club?.[action] ?? null));
	if (opponents) {
		const counts = new Map();
		for (const d of betting) for (const s of d.live) counts.set(s, (counts.get(s) ?? 0) + 1);
		for (const [subject, count] of counts) {
			if (count < MIN_OPPORTUNITIES) continue;
			for (const [action, legalKey] of [['raise', 'raise'], ['fold', 'fold']])
				out.push(
					contrast(betting, (d) => d.live.includes(subject), action, legalKey, { segment: 'opponent', opponent: subject, label: 'When this opponent is in the hand' }, club?.[action] ?? null)
				);
		}
	}
	return out;
}

/** Club-wide pooled rates, the prior every individual rate is shrunk toward. */
export function clubPrior(set) {
	const core = coreRates(set);
	const r = (x) => (x.n ? x.k / x.n : null);
	return { raise: r(core.raise), fold: r(core.fold), call: r(core.call), show: r(core.show), timeout: r(core.timeout), decisions: core.decisions };
}

/** Style over time: the same core rates for recent decisions against all earlier ones. */
export function styleChange(set, now = Date.now(), recentDays = 30) {
	const cut = now - recentDays * 24 * HOUR;
	const betting = set.decisions.filter((d) => d.betting);
	return ['raise', 'fold', 'call'].map((action) =>
		contrast(betting, (d) => d.at >= cut, action, action, { segment: 'recent-30d', label: 'Last 30 days' }, null)
	);
}
