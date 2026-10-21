import { sum } from './fingerprint.mjs';

/**
 * Compact per-seat summaries of a simulated table (Phase 3, BOT_BRAIN.md §29), so millions of
 * hands can be measured without keeping every hand. A worker folds each finished hand into the
 * summary of each seat it watches; the parent adds summaries together.
 *
 * Per seat: total counters; counters by session phase; counters for the hands that follow events
 * (big loss / win, a blind win, catching a bluff, being bluffed off a pot, heavy pressure); even and
 * odd hands (for the night effect); optional k-hand windows (identifiability); and the seat's
 * public action sequences as n-grams. Everything is public behaviour except the judge's quality
 * counters, which the fingerprint already keeps apart.
 */
export const SUMMARY_VERSION = 'sum@1';

/** Counters the identification features need (windows and halves keep only these). */
const SLIM = [
	'hands',
	'blindBets',
	'blindRaises',
	'see',
	'decisions',
	'seenChaal',
	'seenRaise',
	'seenPack',
	'blindPack',
	'show',
	'showOk',
	'facing',
	'facingPack',
	'firstSeen',
	'stay',
	'showdown'
];
const slim = (t) => Object.fromEntries(SLIM.map((k) => [k, t[k] ?? 0]));

/** Add counter objects (missing keys count as 0). Returns a new object. */
export function addCounters(a, b) {
	if (!a) return { ...b };
	if (!b) return { ...a };
	const out = { ...a };
	for (const [k, v] of Object.entries(b)) if (typeof v === 'number') out[k] = (out[k] ?? 0) + v;
	return out;
}

export const PHASES = Object.freeze([
	[0, 25],
	[25, 50],
	[50, 100],
	[100, 150],
	[150, Infinity]
]);
export const EVENTS = Object.freeze([
	'bigLoss',
	'bigWin',
	'blindWin',
	'caughtBluff',
	'bluffedOff',
	'pressured'
]);
/** Boots: a result this large is an event (as in the Phase 2 report). */
const BIG = 20;
/** Hands after an event that count as "after" it. */
const AFTER = 3;

/** One public token per decision: b/B blind chaal/raise, L look, c/r seen chaal/raise, s/S show
 * seen/blind, p/x pack seen/blind. */
function token(d) {
	if (d.name === 'see') return 'L';
	if (d.name === 'chaal') return d.blind ? 'b' : 'c';
	if (d.name === 'raise') return d.blind ? 'B' : 'r';
	if (d.name === 'show') return d.blind ? 'S' : 's';
	if (d.name === 'pack') return d.blind ? 'x' : 'p';
	return null;
}

export function seatSummarizer(seat, { windows = [] } = {}) {
	const s = {
		version: SUMMARY_VERSION,
		member: null,
		hands: 0,
		total: null,
		phases: PHASES.map(() => null),
		after: Object.fromEntries([...EVENTS, 'base'].map((e) => [e, null])),
		events: Object.fromEntries(EVENTS.map((e) => [e, 0])),
		halves: [null, null],
		windows: Object.fromEntries(windows.map((k) => [k, []])),
		// Bigram counts per 50-hand window (sequence-based identification), when 50 is a window.
		windowGrams: [],
		grams: {},
		shapes: {}
	};
	const recent = [];
	const open = Object.fromEntries(windows.map((k) => [k, null]));
	const gramK = windows.includes(50) ? 50 : null;
	let openGrams = {};

	return {
		/** `hand` from runTable; `stats` this seat's seatHandStats record (or undefined if not dealt). */
		add(hand, stats) {
			if (!stats) return;
			s.member = stats.member;
			const t = sum([stats]);
			const i = s.hands++;
			s.total = addCounters(s.total, t);
			const phase = PHASES.findIndex(([a, b]) => i >= a && i < b);
			s.phases[phase] = addCounters(s.phases[phase], t);
			s.halves[i % 2] = addCounters(s.halves[i % 2], slim(t));
			// The hands after an event: any event in the previous AFTER hands.
			const prior = new Set(recent.flat());
			if (!prior.size) s.after.base = addCounters(s.after.base, t);
			for (const e of prior) s.after[e] = addCounters(s.after[e], t);
			for (const k of windows) {
				open[k] = addCounters(open[k], slim(t));
				if (open[k].hands === k) {
					s.windows[k].push(open[k]);
					open[k] = null;
				}
			}
			// This hand's public sequence and events.
			const mine = hand.decisions.filter((d) => d.seat === seat);
			const tokens = mine.map(token).filter(Boolean).join('');
			const text = `^${tokens}$`;
			for (const n of [2, 3])
				for (let j = 0; j + n <= text.length; j++) {
					const g = text.slice(j, j + n);
					s.grams[g] = (s.grams[g] ?? 0) + 1;
				}
			if (gramK) {
				for (let j = 0; j + 2 <= text.length; j++) {
					const g = text.slice(j, j + 2);
					openGrams[g] = (openGrams[g] ?? 0) + 1;
				}
				if ((i + 1) % gramK === 0) {
					s.windowGrams.push(openGrams);
					openGrams = {};
				}
			}
			const shape = tokens.length > 6 ? `${tokens.slice(0, 6)}…` : tokens;
			s.shapes[shape] = (s.shapes[shape] ?? 0) + 1;
			const me = hand.seats.find((x) => x.seat === seat);
			const seenRaisers = new Set(
				hand.decisions.filter((d) => !d.blind && d.name === 'raise').map((d) => d.seat)
			);
			const weakShown = hand.seats.filter(
				(x) => x.seat !== seat && seenRaisers.has(x.seat) && x.shownP !== null && x.shownP < 0.5
			);
			const events = [];
			if (stats.net <= -BIG) events.push('bigLoss');
			if (stats.net >= BIG) events.push('bigWin');
			if (me?.won && !tokens.includes('L') && !/[crsp]/.test(tokens)) events.push('blindWin');
			if (me?.showdown && me.won && weakShown.length) events.push('caughtBluff');
			if (!me?.showdown && /[px]$/.test(tokens) && weakShown.length) events.push('bluffedOff');
			if (mine.filter((d) => d.facing).length >= 2) events.push('pressured');
			for (const e of events) s.events[e]++;
			recent.push(events);
			if (recent.length > AFTER) recent.shift();
		},
		result: () => s
	};
}

/** Add two seat summaries of the same member (windows are concatenated). */
export function addSummaries(a, b) {
	if (!a) return b;
	if (!b) return a;
	const merge = (x, y) =>
		Object.fromEntries(
			[...new Set([...Object.keys(x), ...Object.keys(y)])].map((k) => [
				k,
				(x[k] ?? 0) + (y[k] ?? 0)
			])
		);
	return {
		...a,
		hands: a.hands + b.hands,
		total: addCounters(a.total, b.total),
		phases: a.phases.map((p, i) => addCounters(p, b.phases[i])),
		after: Object.fromEntries(
			Object.keys(a.after).map((e) => [e, addCounters(a.after[e], b.after[e])])
		),
		events: merge(a.events, b.events),
		halves: a.halves.map((h, i) => addCounters(h, b.halves[i])),
		windows: Object.fromEntries(
			Object.keys(a.windows).map((k) => [k, [...a.windows[k], ...(b.windows[k] ?? [])]])
		),
		windowGrams: [...(a.windowGrams ?? []), ...(b.windowGrams ?? [])],
		grams: merge(a.grams, b.grams),
		shapes: merge(a.shapes, b.shapes)
	};
}
