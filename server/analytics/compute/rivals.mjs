/**
 * Head to head (docs/ANALYTICS_PHASE2.md, "Rivals"): one viewer against each person or bot they
 * have actually sat with. Built only from public hand records the viewer was dealt into, so it
 * is information the viewer observed. Never uses an opponent's hidden cards or tendencies.
 * Bots are grouped by their permanent identity, so "you against Raju" spans every table.
 */
import { handFacts, subjectOf, UNITS } from './facts.mjs';
import { clusteredMean, evidence, round } from './stats.mjs';

export const MIN_RIVAL_HANDS = 15;

function emptyRival(subject, kind) {
	return {
		subject,
		kind,
		hands: 0,
		complete: 0,
		nights: new Map(),
		games: {},
		variants: {},
		units: 0,
		points: 0,
		you: { wins: 0, expected: 0 },
		them: { wins: 0, expected: 0 },
		contests: { won: 0, lost: 0, split: 0 },
		biggestWin: null,
		biggestLoss: null,
		lastMet: 0,
		recent: []
	};
}

/** What one hand contributed between the viewer and each opponent. */
function meetings(record, viewer) {
	const facts = handFacts(record);
	const mine = facts.get(viewer);
	if (!mine) return [];
	const out = [];
	for (const seat of record.seats) {
		if (seat.p === viewer) continue;
		const theirs = facts.get(seat.p);
		const inflow = (record.flows ?? []).filter((f) => f.from === seat.p && f.to === viewer).reduce((s, f) => s + f.amt, 0);
		const outflow = (record.flows ?? []).filter((f) => f.from === viewer && f.to === seat.p).reduce((s, f) => s + f.amt, 0);
		const chips = inflow - outflow;
		const reachedEnd = (exit) => exit === 'won' || exit === 'lost';
		out.push({
			subject: subjectOf(seat),
			kind: seat.kind,
			mine,
			theirs,
			chips,
			units: mine.complete ? chips / mine.unit : 0,
			contest: mine.complete && reachedEnd(mine.exit) && reachedEnd(theirs.exit)
		});
	}
	return out;
}

/** Every opponent the viewer has met, most-played first. `records` must all include the viewer. */
export function rivalries(records, viewer) {
	const rivals = new Map();
	for (const record of [...records].sort((a, b) => a.completedAt - b.completedAt)) {
		for (const m of meetings(record, viewer)) {
			const r = rivals.get(m.subject) ?? emptyRival(m.subject, m.kind);
			rivals.set(m.subject, r);
			r.hands++;
			r.games[record.gameType] = (r.games[record.gameType] ?? 0) + 1;
			if (record.rulesVersion && record.gameType === 'teen-patti') r.variants[record.rulesVersion] = (r.variants[record.rulesVersion] ?? 0) + 1;
			r.lastMet = Math.max(r.lastMet, record.completedAt);
			if (m.mine.complete) {
				r.complete++;
				const stake = UNITS[record.gameType]?.stake;
				if (stake) r.units += m.units;
				else r.points += m.chips;
				const night = r.nights.get(record.nightId) ?? { sum: 0, n: 0, at: record.startedAt, games: new Set() };
				if (stake) {
					night.sum += m.units;
					night.n++;
				}
				night.games.add(record.gameType);
				r.nights.set(record.nightId, night);
				if (m.mine.fairShare !== null) {
					r.you.wins += m.mine.won;
					r.you.expected += m.mine.fairShare;
					r.them.wins += m.theirs.won;
					r.them.expected += m.theirs.fairShare;
				}
				if (m.contest) {
					if (m.mine.won > 0 && m.theirs.won > 0) r.contests.split++;
					else if (m.mine.won > 0) r.contests.won++;
					else if (m.theirs.won > 0) r.contests.lost++;
				}
				if (stake && m.units > 0 && (!r.biggestWin || m.units > r.biggestWin.units)) r.biggestWin = { handId: record._id, units: round(m.units, 1), at: record.completedAt };
				if (stake && m.units < 0 && (!r.biggestLoss || m.units < r.biggestLoss.units)) r.biggestLoss = { handId: record._id, units: round(m.units, 1), at: record.completedAt };
				r.recent.push({ handId: record._id, at: record.completedAt, gameType: record.gameType, units: stake ? round(m.units, 1) : null, you: m.mine.won, them: m.theirs.won });
			}
		}
	}
	return [...rivals.values()].map(summarise).sort((a, b) => b.hands - a.hands);
}

/** The rivalry's headline, with wording no stronger than the evidence. */
function summarise(r) {
	const nights = [...r.nights.entries()].map(([nightId, n]) => ({ nightId, ...n, games: [...n.games] }));
	const perHand = clusteredMean(nights.filter((n) => n.n).map((n) => ({ sum: n.sum, n: n.n })));
	const level = evidence(r.complete, MIN_RIVAL_HANDS);
	const verdict =
		level === 'insufficient'
			? 'too-few'
			: perHand.low === null
				? 'about-even'
				: perHand.low > 0
					? 'ahead'
					: perHand.high < 0
						? 'behind'
						: 'about-even';
	return {
		subject: r.subject,
		kind: r.kind,
		hands: r.hands,
		nights: nights.length,
		games: r.games,
		variants: r.variants,
		units: round(r.units, 1),
		points: r.points ? round(r.points, 0) : null,
		perHand: round(perHand.mean, 2),
		perHandLow: round(perHand.low, 2),
		perHandHigh: round(perHand.high, 2),
		perHandSe: perHand.se,
		fair: {
			you: r.you.expected ? round(r.you.wins / r.you.expected, 2) : null,
			them: r.them.expected ? round(r.them.wins / r.them.expected, 2) : null,
			youWins: round(r.you.wins, 1),
			themWins: round(r.them.wins, 1)
		},
		contests: r.contests,
		biggestWin: r.biggestWin,
		biggestLoss: r.biggestLoss,
		lastMet: r.lastMet,
		evidence: level,
		verdict,
		recentNights: nights.slice(-8).map((n) => ({ nightId: n.nightId, at: n.at, hands: n.n, units: round(n.sum, 1), games: n.games })),
		recentHands: r.recent.slice(-10).reverse(),
		cumulative: (() => {
			let running = 0;
			return r.recent.filter((h) => h.units !== null).map((h, i) => ({ i: i + 1, at: h.at, units: round((running += h.units), 1) }));
		})()
	};
}

/** One rivalry in detail, with per-game splits. */
export function rivalry(records, viewer, subject) {
	const shared = records.filter((r) => r.seats.some((s) => subjectOf(s) === subject));
	const [all] = rivalries(shared, viewer).filter((r) => r.subject === subject);
	if (!all) return null;
	const byGame = Object.keys(all.games).map((game) => {
		const [g] = rivalries(shared.filter((r) => r.gameType === game), viewer).filter((r) => r.subject === subject);
		return { game, hands: g.hands, units: g.units, points: g.points, perHand: g.perHand, verdict: g.verdict, contests: g.contests };
	});
	return { ...all, byGame };
}
