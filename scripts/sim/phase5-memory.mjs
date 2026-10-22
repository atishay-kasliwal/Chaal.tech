/**
 * Phase 5 gates (docs/bots/PHASE5_REPORT.md): what long-term memory does to each canonical character,
 * on matched tables. Night 1 builds what the character remembers (its last session mind, turned into
 * priors with the memory model's own rates and confidence: server/bots/memory/prior.mjs
 * priorFromSession). Night 2 is played twice on the same cards and draws, with and without those priors.
 *   node scripts/sim/phase5-memory.mjs [tables] > docs/bots/phase5/results/memory-<seed>.json
 *
 *  - same:     the same four opponents keep their habits (each strategy below): memory should help, or
 *              at least not hurt;
 *  - switched: the four come back playing a different way: stale memory must not cost much, because
 *              the seed is small and the session soon overrides it;
 *  - neutral:  a mixed field of other characters and legacy bots: strength and style unchanged.
 * Boots per 100 hands for the character in seat 0, paired (with memory minus without).
 */
import { availableParallelism } from 'node:os';
import { runPool } from './pool.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { combine, measure } from '../../server/sim/evaluate.mjs';
import { ci, paired } from '../../server/sim/p4stats.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';

const T = Number(process.argv[2] ?? 60);
const SEED = 101;
const HANDS = 100;
// Hands behind the memory (night 1): 100 is one night; 500 stands for a regular of about five nights.
const MEMORY_HANDS = Number(process.argv[3] ?? 100);
const CHARS = Object.keys(CANONICAL_STYLES);
const STRATS = Object.keys(EXPLOITS);
// Who comes back playing differently on night 2 (switched scenario).
const SWITCH = Object.fromEntries(STRATS.map((x, i) => [x, STRATS[(i + 5) % STRATS.length]]));
const NEUTRAL = ['legacy-hard', 'gg@4', 'legacy-normal', 'virat-kohli@3'];
const threads = Math.max(1, availableParallelism() - 1);

const opponents = (x) =>
	[1, 2, 3, 4].map((i) => ({ id: `a${i}`, adversary: EXPLOITS[x].g, target: 0 }));
const neutralFor = (c) =>
	NEUTRAL.filter((s) => !s.startsWith(c))
		.concat('legacy-easy')
		.slice(0, 4);
const hero = (c) => CANONICAL_STYLES[c]._id;
const spec = (c, seats, table, night, extra = {}) => ({
	seed: SEED + night,
	nightKey: SEED * 10 + night,
	table,
	hands: HANDS,
	seats: [hero(c), ...seats],
	matched: true,
	summary: { seats: [0], ...(extra.priorsOf !== undefined ? { priorsOf: 0 } : {}) },
	...(extra.priors ? { priors: extra.priors } : {}),
	meta: extra.meta
});

// Night 1: every scenario's first night, keeping the priors.
const night1 = [];
for (const c of CHARS) {
	for (const x of STRATS)
		for (let t = 0; t < T; t++)
			night1.push({
				...spec(c, opponents(x), 3000 + t, 1, { priorsOf: 0, meta: { c, s: x, t } }),
				hands: MEMORY_HANDS
			});
	for (let t = 0; t < T; t++)
		night1.push({
			...spec(c, neutralFor(c), 5000 + t, 1, { priorsOf: 0, meta: { c, s: 'neutral', t } }),
			hands: MEMORY_HANDS
		});
}
const n1 = await runPool(night1, threads);
const priorsOf = new Map(n1.map((r) => [`${r.meta.c}|${r.meta.s}|${r.meta.t}`, r.priors]));

// Night 2: with and without the priors, on the same cards.
const night2 = [];
for (const c of CHARS) {
	for (const x of STRATS)
		for (let t = 0; t < T; t++) {
			const priors = priorsOf.get(`${c}|${x}|${t}`);
			for (const mem of [false, true]) {
				night2.push(
					spec(c, opponents(x), 4000 + t, 2, {
						priors: mem ? priors : null,
						meta: { c, s: x, kind: 'same', mem, t }
					})
				);
				night2.push(
					spec(c, opponents(SWITCH[x]), 4000 + t, 2, {
						priors: mem ? priors : null,
						meta: { c, s: x, kind: 'switched', mem, t }
					})
				);
			}
		}
	for (let t = 0; t < T; t++) {
		const priors = priorsOf.get(`${c}|neutral|${t}`);
		for (const mem of [false, true])
			night2.push(
				spec(c, neutralFor(c), 6000 + t, 2, {
					priors: mem ? priors : null,
					meta: { c, s: 'neutral', kind: 'neutral', mem, t }
				})
			);
	}
}
const n2 = (await runPool(night2, threads)).map((r) => ({ ...r.meta, seat: r.seats[0] }));
const boots = (s) => (s.total.net / s.hands) * 100;
const pick = (c, s, kind, mem) =>
	n2
		.filter((r) => r.c === c && r.s === s && r.kind === kind && r.mem === mem)
		.sort((a, b) => a.t - b.t);
const f = (x) => ({ mean: Math.round(x.mean), ci: Math.round(x.ci) });

const out = {
	seed: SEED,
	tables: T,
	hands: HANDS,
	strategies: STRATS,
	switched: SWITCH,
	characters: {}
};
for (const c of CHARS) {
	const per = {};
	const same = [];
	const switched = [];
	for (const x of STRATS) {
		const d = (kind) =>
			paired(
				pick(c, x, kind, true).map((r) => boots(r.seat)),
				pick(c, x, kind, false).map((r) => boots(r.seat))
			);
		const a = d('same');
		const b = d('switched');
		per[x] = { same: f(a), switched: f(b) };
		same.push(a.mean);
		switched.push(b.mean);
	}
	const neutralWith = pick(c, 'neutral', 'neutral', true);
	const neutralWithout = pick(c, 'neutral', 'neutral', false);
	const strength = paired(
		neutralWith.map((r) => boots(r.seat)),
		neutralWithout.map((r) => boots(r.seat))
	);
	const mWith = measure(combine(neutralWith.map((r) => r.seat)));
	const mWithout = measure(combine(neutralWithout.map((r) => r.seat)));
	const style = Object.fromEntries(
		['packRate', 'aggression', 'blindRounds', 'showRate', 'weakCallRate', 'badActionRate'].map(
			(k) => [k, { with: +(mWith[k] ?? 0).toFixed(3), without: +(mWithout[k] ?? 0).toFixed(3) }]
		)
	);
	const mean = (xs) => Math.round(xs.reduce((s, v) => s + v, 0) / xs.length);
	out.characters[c] = {
		sameMean: mean(same),
		switchedMean: mean(switched),
		neutralStrength: f(strength),
		perStrategy: per,
		style
	};
	console.error(
		c,
		'same',
		mean(same),
		'switched',
		mean(switched),
		'neutral',
		JSON.stringify(f(strength)),
		JSON.stringify(style)
	);
}
console.log(JSON.stringify(out, null, '\t'));
void ci;
