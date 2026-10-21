/** Phase 4 diagnostic: why Dhoni loses to four always-raise maniacs. Matched tables, 100-hand sessions. */
import { availableParallelism } from 'node:os';
import { runPool } from './pool.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { combine, measure } from '../../server/sim/evaluate.mjs';
import { ci, paired } from '../../server/sim/p4stats.mjs';
import { noReads } from './phase4-adapt.mjs';
import { DHONI_CHALLENGERS } from '../../server/sim/challengers.mjs';

const T = Number(process.argv[2] ?? 200);
const c = DHONI_CHALLENGERS[0];
const heroes = {
	dhoni: 'ms-dhoni@3',
	noreads: noReads('ms-dhoni'),
	balanced: 'human-balanced',
	blindcost: { id: c.id, style: c.style }
};
const g = EXPLOITS['always-raise'].g;
const specs = [];
for (const [key, hero] of Object.entries(heroes))
	for (let t = 0; t < T; t++)
		specs.push({
			seed: 46,
			table: 500 + t,
			hands: 100,
			seats: [hero, ...[1, 2, 3, 4].map((i) => ({ id: `m${i}`, adversary: g, target: 0 }))],
			matched: true,
			summary: { seats: [0] },
			meta: { key }
		});
const res = (await runPool(specs, Math.max(1, availableParallelism() - 1))).map((r) => ({
	...r,
	...r.meta
}));
const of = (k) =>
	res
		.filter((r) => r.key === k)
		.sort((a, b) => a.table - b.table)
		.map((r) => r.seats[0]);
const b = (s) => (s.total.net / s.hands) * 100;
for (const k of Object.keys(heroes)) {
	const m = measure(combine(of(k)));
	const c = ci(of(k).map(b));
	console.log(
		k.padEnd(9),
		`${Math.round(c.mean)} ± ${Math.round(c.ci)}`,
		[
			'blindRounds',
			'seenFoldToRaise',
			'continueMid',
			'continueBorder',
			'valueRaise',
			'showRate',
			'badActionRate'
		]
			.map((x) => `${x} ${m[x]?.toFixed(3)}`)
			.join(' ')
	);
}
const p = paired(of('dhoni').map(b), of('noreads').map(b));
console.log('dhoni - noreads', `${Math.round(p.mean)} ± ${Math.round(p.ci)}`);
const q = paired(of('blindcost').map(b), of('dhoni').map(b));
console.log('blindcost - dhoni', `${Math.round(q.mean)} ± ${Math.round(q.ci)}`);
