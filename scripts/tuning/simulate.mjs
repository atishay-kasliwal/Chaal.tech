/**
 * Tuning loop: simulation (docs/bots/TUNING_LOOP.md). The same matched tables the Phase 4 gates
 * play (scripts/sim/phase4-gates.mjs): a population run with 50-hand windows for identity, the fixed
 * exploit suite, and repeated nights for variety, on the simulator's process pool. Every table is
 * seeded from (seed, table, hand, step), so the same budget always plays the same hands, and a
 * candidate meets exactly the tables its canonical style met.
 *
 * The baseline (canonical, the other four canonical characters, and the stateless reference
 * `<character>@2` that the event bands are measured against) is played once per run; each candidate
 * then plays only its own tables.
 */
import { availableParallelism } from 'node:os';
import { runPool } from '../sim/pool.mjs';
import { opponents, seatsFor, combine, measure } from '../../server/sim/evaluate.mjs';
import { featureVector } from '../../server/sim/fingerprint.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { runTable } from '../../server/sim/table.mjs';
import { mean } from '../../server/sim/p4stats.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';

/** Budgets. `smoke` is for tests and the mock run; `real` is the default for a real run. */
export const BUDGETS = Object.freeze({
	smoke: Object.freeze({
		seeds: [61],
		tables: 4,
		hands: 50,
		exploitTables: 2,
		exploitHands: 50,
		exploits: ['always-raise', 'call-everything', 'value-then-bluff'],
		nights: 3,
		nightHands: 50,
		perf: false
	}),
	real: Object.freeze({
		seeds: [61],
		tables: 120,
		hands: 200,
		exploitTables: 32,
		exploitHands: 200,
		exploits: Object.keys(EXPLOITS),
		nights: 30,
		nightHands: 200,
		perf: true
	})
});

/** Total hands a budget plays: for the baseline, and for each candidate. */
export function budgetHands(b) {
	const pop = b.seeds.length * b.tables * b.hands;
	const hero =
		pop +
		b.seeds.length * b.exploits.length * b.exploitTables * b.exploitHands +
		b.seeds.length * b.nights * b.nightHands;
	return { baseline: hero + 5 * pop, candidate: hero };
}

/** A canonical character as a seat: its frozen reference style, decided as candidates are. */
export const canonicalMember = (c) => ({ id: CANONICAL_STYLES[c]._id, style: CANONICAL_STYLES[c] });

const advSeats = (g, label) =>
	[1, 2, 3, 4].map((i) => ({ id: `${label}#${i}`, adversary: g, target: 0 }));

/**
 * Table specs for one hero. `full` adds the exploit suite and the nights (the hero under test);
 * otherwise only the population run (identity classes and the reference).
 */
export function heroSpecs(character, key, memberOf, budget, { full = true, seatCharacter } = {}) {
	const specs = [];
	const ch = seatCharacter ?? character;
	budget.seeds.forEach((seed, si) => {
		for (let t = 0; t < budget.tables; t++) {
			const pop = seatsFor(memberOf, opponents(seed, 'gates', t, ch), t);
			specs.push({
				seed,
				table: 100 + t,
				hands: budget.hands,
				seats: pop.seats,
				matched: true,
				summary: { seats: [pop.heroSeat], windows: budget.hands >= 50 ? [50] : [] },
				meta: { key, run: 'pop', si, t }
			});
		}
		if (!full) return;
		for (const x of budget.exploits)
			for (let t = 0; t < budget.exploitTables; t++)
				specs.push({
					seed,
					table: 5000 + t,
					hands: budget.exploitHands,
					seats: [memberOf, ...advSeats(EXPLOITS[x].g, x)],
					matched: true,
					summary: { seats: [0] },
					meta: { key, run: 'x', si, t, x }
				});
		const field = opponents(seed, 'night', 0, character);
		for (let i = 0; i < budget.nights; i++)
			specs.push({
				seed,
				decisionSeed: seed * 1000 + i,
				table: 9000,
				hands: budget.nightHands,
				seats: [memberOf, ...field],
				matched: true,
				summary: { seats: [0] },
				meta: { key, run: 'night', si, t: i }
			});
	});
	return specs;
}

const b100 = (s) => (s.total.net / Math.max(s.hands, 1)) * 100;
const order = (a, b) => a.si - b.si || a.t - b.t;

/** Mean and 99th percentile decision time, in this process with the default JIT (as the game runs). */
export function timing(memberOf) {
	const ms = [];
	for (let t = 0; t < 3; t++)
		for (const hand of runTable({
			seed: 77,
			table: t,
			hands: 150,
			seats: [memberOf, 'human-balanced', 'gg@4', 'human-station', 'human-maniac']
		}))
			for (const d of hand.decisions) if (d.seat === 0) ms.push(d.ms);
	ms.sort((a, b) => a - b);
	return { mean: mean(ms), p99: ms[Math.floor(0.99 * (ms.length - 1))], n: ms.length };
}

/**
 * Per-hero statistics from pool results, small enough to keep in the graph state: per-table
 * boots/100 in a fixed order (so candidate and canonical pair table by table), the combined
 * population summary (measured and judged against the bands), identity windows, exploit results
 * and night halves.
 */
export function heroStats(results, key) {
	const mine = results.filter((r) => r.meta.key === key);
	const pop = mine.filter((r) => r.meta.run === 'pop').sort((a, b) => order(a.meta, b.meta));
	const xs = {};
	for (const r of mine.filter((r) => r.meta.run === 'x').sort((a, b) => order(a.meta, b.meta)))
		(xs[r.meta.x] ??= []).push(b100(r.seats[0]));
	const nights = mine
		.filter((r) => r.meta.run === 'night')
		.sort((a, b) => order(a.meta, b.meta))
		.map((r) => r.seats[0].halves.map((h) => featureVector(h)));
	return {
		key,
		pop: pop.map((r) => b100(r.seats[0])),
		summary: combine(pop.map((r) => r.seats[0])),
		// Identity windows: tables keep their parity (train even, test odd) across seeds.
		windows: pop.flatMap((r) =>
			(r.seats[0].windows?.[50] ?? []).map((t) => ({
				table: r.meta.si * 100000 + 100 + r.meta.t,
				member: key,
				t
			}))
		),
		x: xs,
		nights,
		hands: mine.reduce((s, r) => s + (r.seats[0]?.hands ?? 0), 0)
	};
}

const threadsFor = (n) => Math.max(1, Math.min(n ?? availableParallelism() - 1, 64));

/** Play the baseline: canonical (in full), the other canonical characters, and the reference. */
export async function runBaseline(character, budget, { threads } = {}) {
	const champion = canonicalMember(character);
	const others = CHARACTER_IDS.filter((x) => x !== character);
	const specs = [
		...heroSpecs(character, champion.id, champion, budget),
		...others.flatMap((x) =>
			heroSpecs(character, CANONICAL_STYLES[x]._id, canonicalMember(x), budget, {
				full: false,
				seatCharacter: x
			})
		),
		...heroSpecs(character, `${character}@2`, `${character}@2`, budget, { full: false })
	];
	const results = await runPool(specs, threadsFor(threads));
	const stats = heroStats(results, champion.id);
	return {
		champion: stats,
		others: Object.fromEntries(
			others.map((x) => [x, heroStats(results, CANONICAL_STYLES[x]._id).windows])
		),
		otherKeys: others.map((x) => CANONICAL_STYLES[x]._id),
		reference: measure(heroStats(results, `${character}@2`).summary),
		measured: measure(stats.summary),
		perf: budget.perf ? timing(champion) : null,
		tables: specs.length,
		hands: specs.reduce((s, x) => s + x.hands, 0)
	};
}

/** Play every candidate's tables (one pool for all of them). */
export async function runCandidates(character, candidates, budget, { threads } = {}) {
	const specs = candidates.flatMap((c) =>
		heroSpecs(character, c.key, { id: c.key, style: c.style }, budget)
	);
	const results = specs.length ? await runPool(specs, threadsFor(threads)) : [];
	return {
		stats: Object.fromEntries(
			candidates.map((c) => [
				c.key,
				{
					...heroStats(results, c.key),
					perf: budget.perf ? timing({ id: c.key, style: c.style }) : null
				}
			])
		),
		tables: specs.length,
		hands: specs.reduce((s, x) => s + x.hands, 0)
	};
}
