import { deciderFor } from '../bots/policies.mjs';
import { stream } from './seeds.mjs';

/**
 * Phase 4 event study (brief §9): what a bot does after emotionally significant events, measured
 * two ways for one watched seat.
 *
 * 1. Visible behaviour, from public results only (identical bookkeeping for champion and
 *    challenger): facing a raise after looking, does it fold to a player it caught bluffing in the
 *    last few hands, compared with a raise from anyone else? And does it pack less after a big loss?
 * 2. Attribution (offline only): each decision is decided again from the same view, mind and draws
 *    with the event quirks removed from the style. The difference in move probabilities is exactly
 *    what the event reactions did, free of outcome noise.
 */
export const EVENT_QUIRK_IDS = Object.freeze([
	'remembersYou',
	'remembersYouRead',
	'stubbornStreak',
	'onToYou'
]);
const BIG = 20;
const AGES = [
	[1, 2],
	[3, 4],
	[5, 8]
];
const ageBucket = (age) => AGES.findIndex(([a, b]) => age >= a && age <= b);

export function eventStudy(seat, style) {
	const bare =
		style && EVENT_QUIRK_IDS.some((id) => style.tendencies.quirks.some((q) => q.id === id))
			? deciderFor({
					...style,
					tendencies: {
						...style.tendencies,
						quirks: style.tendencies.quirks.filter((q) => !EVENT_QUIRK_IDS.includes(q.id))
					}
				})
			: null;
	const full = bare ? deciderFor(style) : null;
	const c = {
		// Facing a raise after looking, by who raised: caught bluffing 1-2, 3-4, 5-8 hands ago, or other.
		face: [0, 1, 2, 3].map(() => ({ n: 0, pack: 0 })),
		// Seen decisions under pressure in the 4 hands after a big loss, and otherwise.
		afterLoss: { n: 0, pack: 0 },
		calm: { n: 0, pack: 0 },
		// Attribution: summed probability change from the event quirks, where they acted.
		attr: { n: 0, acted: 0, pack: 0, call: 0, raise: 0, show: 0 },
		events: { caught: 0, bluffedOff: 0, bigLoss: 0 }
	};
	const caughtAt = {}; // seat -> hand index
	let lossAt = -99;
	let h = 0;
	let k = 0;
	return {
		decision({ view, actor, move, row, mind }) {
			if (row.seat !== seat) return;
			if (!row.blind && row.name !== 'see' && !row.forced) {
				if (row.facing) {
					const raiser = move.trace?.facing;
					const rs = raiser ? Number(String(raiser).split('-').at(-1)) : null;
					const age = rs != null && caughtAt[rs] != null ? h - caughtAt[rs] : null;
					const b = age != null ? ageBucket(age) : -1;
					const cell = c.face[b >= 0 ? b : 3];
					cell.n++;
					if (row.name === 'pack') cell.pack++;
				}
				if (row.facing || (move.trace?.pressure ?? 0) > 0) {
					const cell = h - lossAt <= 4 && h > lossAt ? c.afterLoss : c.calm;
					cell.n++;
					if (row.name === 'pack') cell.pack++;
				}
			}
			if (bare && mind && !row.forced) {
				// Same view, same mind, same draws: with and without the event quirks.
				const seed = stream(7, 'attr', seat, h, k++).seed.join(':');
				const r1 = stream(seed).random;
				const r2 = stream(seed).random;
				const a = full(view, actor.id, r1, mind)?.trace?.probs;
				const z = bare(view, actor.id, r2, mind)?.trace?.probs;
				if (a && z) {
					c.attr.n++;
					const d = (m) => (a[m] ?? 0) - (z[m] ?? 0);
					if (Math.abs(d('pack')) + Math.abs(d('chaal')) + Math.abs(d('show')) > 1e-4)
						c.attr.acted++;
					c.attr.pack += d('pack');
					c.attr.call += d('chaal');
					c.attr.raise += d('raise');
					c.attr.show += d('show');
				}
			}
		},
		hand(hand) {
			const me = hand.seats.find((s) => s.seat === seat);
			if (me) {
				const seenRaisers = new Set(
					hand.decisions.filter((d) => !d.blind && d.name === 'raise').map((d) => d.seat)
				);
				const weak = hand.seats.filter(
					(s) => s.seat !== seat && seenRaisers.has(s.seat) && s.shownP !== null && s.shownP < 0.5
				);
				if (me.showdown && me.won)
					for (const s of weak) {
						caughtAt[s.seat] = h;
						c.events.caught++;
					}
				const mine = hand.decisions.filter((d) => d.seat === seat);
				if (!me.showdown && mine.at(-1)?.name === 'pack' && weak.length) c.events.bluffedOff++;
				if (me.net <= -BIG) {
					lossAt = h;
					c.events.bigLoss++;
				}
			}
			h++;
			k = 0;
		},
		result: () => c
	};
}

/** Add two event-study results. */
export function addEvents(a, b) {
	if (!a) return structuredClone(b);
	const add = (x, y) => {
		for (const [key, v] of Object.entries(y))
			if (typeof v === 'number') x[key] = (x[key] ?? 0) + v;
			else if (Array.isArray(v)) v.forEach((e, i) => add(x[key][i], e));
			else add(x[key], v);
		return x;
	};
	return add(structuredClone(a), b);
}
