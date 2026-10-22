/**
 * Personal and club records (docs/archive/ANALYTICS_PHASE5.md, "Records"). Every record derives from
 * authoritative hand history through canonical facts, carries the ids needed to open its evidence,
 * and is a pure function of the slice of history it is given. That last property is what lets a
 * night recap say "record broken": compute the records before the night and after it.
 *
 * Club records are celebratory only. There is deliberately no worst, biggest-loss or easiest-opponent
 * record anywhere.
 */
import { handFacts, subjectOf } from '../compute/facts.mjs';
import { gameName, variantName } from './language.mjs';
import { round } from '../compute/stats.mjs';

const MIN = 60_000;
const rec = (id, label, value, unit, extra = {}) => ({ id, label, value, unit, ...extra });

/** Running boots across one night's hands, oldest first. */
function nightRuns(facts) {
	const nights = new Map();
	for (const f of facts.filter((x) => x.complete && x.stake)) {
		if (!nights.has(f.nightId)) nights.set(f.nightId, []);
		nights.get(f.nightId).push(f);
	}
	return [...nights.entries()].map(([nightId, list]) => {
		list.sort((a, b) => a.completedAt - b.completedAt);
		let run = 0;
		let low = 0;
		let lowAt = null;
		for (const f of list) {
			run += f.units;
			if (run < low) {
				low = run;
				lowAt = f.handId;
			}
		}
		return { nightId, hands: list.length, units: run, low, lowAt, at: list[0].startedAt, endedAt: list.at(-1).completedAt, startedAt: list[0].startedAt, last: list.at(-1).handId };
	});
}

function streaks(facts) {
	const best = {};
	for (const game of new Set(facts.map((f) => f.gameType))) {
		let run = 0;
		let night = null;
		for (const f of facts.filter((x) => x.gameType === game && x.complete).sort((a, b) => a.completedAt - b.completedAt)) {
			if (f.nightId !== night) {
				run = 0;
				night = f.nightId;
			}
			run = f.won > 0 ? run + 1 : 0;
			if (run > (best[game]?.value ?? 0)) best[game] = { value: run, handId: f.handId, nightId: f.nightId, at: f.completedAt };
		}
	}
	return best;
}

/**
 * @param facts the player's facts
 * @param set collectDecisions() output (hand-level blind runs and shows)
 * @param rivals rivalries() output
 */
export function personalRecords({ facts, set = { hands: [] }, rivals = [] }) {
	const complete = facts.filter((f) => f.complete);
	const stake = complete.filter((f) => f.stake);
	const nights = nightRuns(facts);
	const out = [];
	const byNight = (list, key, pick) => list.reduce((a, b) => (key(b) > key(a) ? b : a), pick ?? list[0]);

	const withHands = nights.filter((n) => n.hands >= 1);
	if (withHands.length) {
		const best = byNight(withHands, (n) => n.units);
		if (best.units > 0) out.push(rec('best-night', 'Most boots won in a night', round(best.units, 1), 'boots', { nightId: best.nightId, at: best.at }));
		const rated = withHands.filter((n) => n.hands >= 10);
		if (rated.length) {
			const bestRate = byNight(rated, (n) => n.units / n.hands);
			if (bestRate.units > 0) out.push(rec('best-night-per-hand', 'Best night per hand (10+ hands)', round(bestRate.units / bestRate.hands, 2), 'boots a hand', { nightId: bestRate.nightId, at: bestRate.at, detail: `${bestRate.hands} hands` }));
		}
		const longest = byNight(withHands, (n) => n.endedAt - n.startedAt);
		if (longest.endedAt - longest.startedAt >= 10 * MIN) out.push(rec('longest-session', 'Longest session', Math.round((longest.endedAt - longest.startedAt) / MIN), 'minutes', { nightId: longest.nightId, at: longest.at }));
		const most = byNight(withHands, (n) => n.hands);
		out.push(rec('most-hands-night', 'Most hands in a night', most.hands, 'hands', { nightId: most.nightId, at: most.at }));
		const comebacks = withHands.filter((n) => n.low <= -5 && n.units >= 0).map((n) => ({ n, size: n.units - n.low }));
		if (comebacks.length) {
			const best = comebacks.reduce((a, b) => (b.size > a.size ? b : a));
			out.push(rec('biggest-comeback', 'Biggest comeback', round(best.size, 1), 'boots', { nightId: best.n.nightId, at: best.n.at, handId: best.n.lowAt, detail: `From ${round(best.n.low, 1)} to ${best.n.units >= 0 ? '+' : ''}${round(best.n.units, 1)}` }));
		}
	}
	const won = stake.filter((f) => f.won > 0 && f.potUnits !== null);
	if (won.length) {
		const pot = won.reduce((a, b) => (b.potUnits > a.potUnits ? b : a));
		out.push(rec('largest-pot', 'Largest pot won', round(pot.potUnits, 1), 'boots', { handId: pot.handId, nightId: pot.nightId, at: pot.completedAt, game: pot.gameType }));
	}
	const streak = streaks(facts);
	for (const [game, s] of Object.entries(streak))
		if (s.value >= 3) out.push(rec(`win-streak:${game}`, `Longest winning streak in ${gameName(game)}`, s.value, 'hands', { handId: s.handId, nightId: s.nightId, at: s.at, game }));
	const shows = set.hands.filter((h) => h.showWon);
	if (shows.length) out.push(rec('shows-won', 'Shows won', shows.length, 'shows', { handId: shows.at(-1).handId }));
	const blind = set.hands.reduce((a, b) => (b.blindDecisions > (a?.blindDecisions ?? 0) ? b : a), null);
	if (blind && blind.blindDecisions >= 3) out.push(rec('blind-run', 'Longest blind run in one hand', blind.blindDecisions, 'turns', { handId: blind.handId }));
	const human = [...rivals].filter((r) => r.kind === 'human').sort((a, b) => b.hands - a.hands)[0];
	if (human && human.hands >= 10) out.push(rec('most-hands-opponent', 'Most hands with one friend', human.hands, 'hands', { subject: human.subject }));
	const bot = [...rivals].filter((r) => r.kind === 'bot').sort((a, b) => b.hands - a.hands)[0];
	if (bot && bot.hands >= 10) out.push(rec('most-hands-bot', 'Most hands against one bot', bot.hands, 'hands', { subject: bot.subject }));
	return out;
}

/** Records the night improved: compare the records from before it with those including it. */
export function recordsBroken(before, after, nightId) {
	const old = new Map(before.map((r) => [r.id, r]));
	return after.filter((r) => {
		if (!r.nightId && !r.handId) return false;
		const prev = old.get(r.id);
		// Only a record with a real earlier holder can be "broken"; a first night sets everything.
		return r.nightId === nightId && !!prev && r.value > prev.value;
	}).map((r) => ({ ...r, previous: old.get(r.id)?.value ?? null }));
}

/* ------------------------------------------- club ------------------------------------------- */

/**
 * Club-wide, celebratory records from public hand records. `names` maps subject → { name }.
 * Nothing negative: biggest wins and busiest nights only.
 */
export function clubRecords(records, names = {}) {
	if (!records.length) return { empty: true, records: [] };
	const nameOf = (s) => names[s]?.name ?? (s?.startsWith('bot:') ? 'a bot' : 'a friend');
	const out = [];
	const pots = records.filter((r) => r.outcome?.pot !== null && r.outcome?.pot !== undefined && r.gameType !== 'rummy').map((r) => {
		const f = [...handFacts(r).values()][0];
		return { r, units: f ? r.outcome.pot / f.unit : 0 };
	});
	// Pots in boots so a small-stakes night and a big one compare fairly; Blackjack is excluded (no shared pot).
	const shared = pots.filter((p) => p.r.gameType !== 'blackjack');
	if (shared.length) {
		const top = shared.reduce((a, b) => (b.units > a.units ? b : a));
		const winner = top.r.outcome.winners?.[0]?.p;
		const seat = top.r.seats.find((s) => s.p === winner);
		out.push(rec('biggest-pot', 'Biggest pot', round(top.units, 1), 'boots', { handId: top.r._id, nightId: top.r.nightId, at: top.r.completedAt, holder: seat ? nameOf(subjectOf(seat)) : null, game: top.r.gameType }));
	}
	const nights = new Map();
	for (const r of records) {
		const n = nights.get(r.nightId) ?? { nightId: r.nightId, hands: 0, start: r.startedAt, end: r.completedAt, players: new Map() };
		n.hands++;
		n.start = Math.min(n.start, r.startedAt);
		n.end = Math.max(n.end, r.completedAt);
		for (const f of handFacts(r).values()) {
			if (f.kind !== 'human' || !f.complete || !f.stake) continue;
			n.players.set(f.subject, (n.players.get(f.subject) ?? 0) + f.units);
			
		}
		nights.set(r.nightId, n);
	}
	const list = [...nights.values()];
	const longest = list.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
	if (longest.end - longest.start >= 10 * MIN) out.push(rec('longest-night', 'Longest night', Math.round((longest.end - longest.start) / MIN), 'minutes', { nightId: longest.nightId, at: longest.start }));
	const most = list.reduce((a, b) => (b.hands > a.hands ? b : a));
	out.push(rec('most-hands-night', 'Most hands in a night', most.hands, 'hands', { nightId: most.nightId, at: most.start }));
	const close = list
		.filter((n) => n.players.size >= 3 && n.hands >= 10)
		.map((n) => ({ n, spread: Math.max(...n.players.values()) - Math.min(...n.players.values()) }))
		.sort((a, b) => a.spread - b.spread)[0];
	if (close) out.push(rec('closest-night', 'Closest night', round(close.spread, 1), 'boots between first and last', { nightId: close.n.nightId, at: close.n.start, detail: `${close.n.players.size} players, ${close.n.hands} hands` }));
	const biggestNight = list
		.filter((n) => n.players.size)
		.map((n) => ({ n, best: [...n.players.entries()].sort((a, b) => b[1] - a[1])[0] }))
		.sort((a, b) => b.best[1] - a.best[1])[0];
	if (biggestNight && biggestNight.best[1] > 0) out.push(rec('biggest-night', 'Biggest night', round(biggestNight.best[1], 1), 'boots', { nightId: biggestNight.n.nightId, at: biggestNight.n.start, holder: nameOf(biggestNight.best[0]) }));
	const count = (key) => {
		const m = new Map();
		for (const r of records) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
		return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
	};
	const game = count((r) => r.gameType);
	out.push(rec('common-game', 'Most played game', gameName(game[0]), `${game[1]} hands`));
	const tpVariants = records.filter((r) => r.gameType === 'teen-patti' && r.rulesVersion);
	if (tpVariants.length) {
		const v = (() => {
			const m = new Map();
			for (const r of tpVariants) m.set(r.rulesVersion, (m.get(r.rulesVersion) ?? 0) + 1);
			return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
		})();
		out.push(rec('common-variant', 'Most played Teen Patti variant', variantName(v[0]), `${v[1]} hands`));
	}
	// Most played rivalry among people: pairs sharing the most hands.
	const pairs = new Map();
	for (const r of records) {
		const humans = r.seats.filter((s) => s.kind === 'human').map((s) => s.p).sort();
		for (let i = 0; i < humans.length; i++)
			for (let j = i + 1; j < humans.length; j++) pairs.set(`${humans[i]}|${humans[j]}`, (pairs.get(`${humans[i]}|${humans[j]}`) ?? 0) + 1);
	}
	const topPair = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0];
	if (topPair) {
		const [a, b] = topPair[0].split('|');
		out.push(rec('common-rivalry', 'Most played rivalry', `${nameOf(a)} and ${nameOf(b)}`, `${topPair[1]} hands together`));
	}
	const botCounts = new Map();
	for (const r of records) for (const s of r.seats) if (s.kind === 'bot') botCounts.set(s.bot?.botId, (botCounts.get(s.bot?.botId) ?? 0) + 1);
	const topBot = [...botCounts.entries()].sort((a, b) => b[1] - a[1])[0];
	if (topBot) out.push(rec('top-bot', 'Bot with the most appearances', nameOf(`bot:${topBot[0]}`), `${topBot[1]} hands`));
	return { empty: false, records: out };
}
