/**
 * Phase 4.1 port check: canonical Dhoni (ms-dhoni@4) against the measured C1 challenger and the
 * Phase 4 champion, on the Phase 4.1 screen's matched tables (seed 48). The port must be 0 ± 0 against
 * C1 on every strategy (the exploit and every counter-exploit), and reproduce C1's screen result
 * against ms-dhoni@3.
 *   node scripts/sim/phase41-canonical.mjs [tables]
 */
import { availableParallelism } from 'node:os';
import { runPool } from './pool.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { ci, paired } from '../../server/sim/p4stats.mjs';
import { DHONI41_CHALLENGERS } from '../../server/sim/challengers.mjs';
import { MS_DHONI_C1 } from '../../server/bots/dna-styles.mjs';

const T = Number(process.argv[2] ?? 160);
const heroes = {
	dhoni3: 'ms-dhoni@3',
	c1: { id: DHONI41_CHALLENGERS[0].id, style: DHONI41_CHALLENGERS[0].style },
	canonical: { id: MS_DHONI_C1._id, style: MS_DHONI_C1 }
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
		.map((r) => (r.seats[0].total.net / r.seats[0].hands) * 100);
const f = (c) => `${Math.round(c.mean)} ± ${Math.round(c.ci)}`;
let identical = true;
for (const x of xs) {
	const vsC1 = paired(of('canonical', x), of('c1', x));
	if (vsC1.mean !== 0 || vsC1.ci !== 0) identical = false;
	console.log(
		`${x.padEnd(17)} dhoni@3 ${f(ci(of('dhoni3', x)))} | canonical vs dhoni@3 ${f(paired(of('canonical', x), of('dhoni3', x)))} | c1 vs dhoni@3 ${f(paired(of('c1', x), of('dhoni3', x)))} | canonical vs c1 ${f(vsC1)}`
	);
}
console.log(identical ? 'PORT IDENTICAL TO C1 ON EVERY STRATEGY' : 'PORT DIFFERS FROM C1');
process.exitCode = identical ? 0 : 1;
