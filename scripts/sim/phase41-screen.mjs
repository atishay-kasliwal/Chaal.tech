/**
 * Phase 4.1 screen: Dhoni and his blind-raise challengers against the strategies that matter, on
 * matched tables (100-hand sessions), before the full eight gates.
 *   node scripts/sim/phase41-screen.mjs [tables]
 */
import { availableParallelism } from 'node:os';
import { runPool } from './pool.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { combine, measure } from '../../server/sim/evaluate.mjs';
import { ci, paired } from '../../server/sim/p4stats.mjs';
import { DHONI_CHALLENGERS, DHONI41_CHALLENGERS } from '../../server/sim/challengers.mjs';

const T = Number(process.argv[2] ?? 160);
const heroes = {
	dhoni: 'ms-dhoni@3',
	rejected: { id: DHONI_CHALLENGERS[0].id, style: DHONI_CHALLENGERS[0].style },
	c1: { id: DHONI41_CHALLENGERS[0].id, style: DHONI41_CHALLENGERS[0].style },
	c2: { id: DHONI41_CHALLENGERS[1].id, style: DHONI41_CHALLENGERS[1].style }
};
const xs = [
	'always-raise',
	'value-then-bluff',
	'raise-often',
	'bluff-a-lot',
	'loose-then-value',
	'sudden-change'
];
const specs = [];
for (const x of xs)
	for (const [key, hero] of Object.entries(heroes))
		for (let t = 0; t < T; t++)
			specs.push({
				seed: 48,
				table: 800 + t,
				hands: 100,
				seats: [
					hero,
					...[1, 2, 3, 4].map((i) => ({ id: `a${i}`, adversary: EXPLOITS[x].g, target: 0 }))
				],
				matched: true,
				summary: { seats: [0] },
				meta: { key, x }
			});
const res = (await runPool(specs, Math.max(1, availableParallelism() - 1))).map((r) => ({
	...r,
	...r.meta
}));
const of = (k, x) =>
	res
		.filter((r) => r.key === k && r.x === x)
		.sort((a, b) => a.table - b.table)
		.map((r) => r.seats[0]);
const b = (s) => (s.total.net / s.hands) * 100;
const f = (c) => `${Math.round(c.mean)} ± ${Math.round(c.ci)}`;
for (const x of xs) {
	const base = of('dhoni', x).map(b);
	const line = Object.keys(heroes)
		.filter((k) => k !== 'dhoni')
		.map((k) => `${k} ${f(paired(of(k, x).map(b), base))}`)
		.join(' | ');
	const m = (k) => measure(combine(of(k, x))).blindRounds.toFixed(2);
	console.log(
		`${x.padEnd(17)} dhoni ${f(ci(base))} | vs dhoni: ${line} | blind rounds ${Object.keys(heroes)
			.map((k) => `${k} ${m(k)}`)
			.join(' ')}`
	);
}
