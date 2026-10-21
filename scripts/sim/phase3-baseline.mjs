/**
 * Phase 3 baseline (BOT_BRAIN.md §29): the frozen Phase 2 characters (@3), the same DNA on policy
 * tp-character@4 (the policy fixes alone), and every human archetype, measured in the Phase 3
 * population with matched tables. Measurement only; grounds the target bands.
 *
 *   node scripts/sim/phase3-baseline.mjs [--seed 31] [--tables 60] [--adapt 8]
 *
 * Writes .sim/phase3/baseline-<seed>.json.
 */
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runPool } from './pool.mjs';
import { CHARACTER_IDS } from '../../server/sim/population.mjs';
import { ARCHETYPE_IDS } from '../../server/sim/archetypes.mjs';
import {
	opponents,
	seatsFor,
	ADAPT_TYPES,
	combine,
	measure,
	ci
} from '../../server/sim/evaluate.mjs';
import { ancestorGenome, candidateStyle } from '../../server/sim/candidates.mjs';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const SEED = arg('seed', 31);
const TABLES = arg('tables', 60);
const ADAPT = arg('adapt', 8);
const HANDS = 200;

const heroes = [];
for (const c of CHARACTER_IDS) {
	heroes.push({ key: `${c}@3`, character: c, member: `${c}@3` });
	const style = candidateStyle(c, ancestorGenome(c), {
		id: `${c}@4-c000`,
		parent: `${c}@3`,
		generation: 0
	});
	heroes.push({ key: style._id, character: c, member: { id: style._id, style } });
}
for (const a of ARCHETYPE_IDS) heroes.push({ key: a, character: null, member: a, archetype: true });

const specs = [];
for (const h of heroes) {
	for (let t = 0; t < TABLES; t++) {
		const { seats, heroSeat } = seatsFor(h.member, opponents(SEED, 'eval', t, h.character), t);
		specs.push({
			run: 'pop',
			key: h.key,
			table: t,
			seed: SEED,
			hands: HANDS,
			seats,
			matched: true,
			summary: { seats: [heroSeat] }
		});
	}
	if (h.archetype) continue;
	for (const type of ADAPT_TYPES)
		for (let t = 0; t < ADAPT; t++)
			specs.push({
				run: `adapt:${type}`,
				key: h.key,
				table: 5000 + t,
				seed: SEED,
				hands: HANDS,
				seats: [h.member, type, type, type, type],
				matched: true,
				summary: { seats: [0] }
			});
}

const started = performance.now();
let last = 0;
const results = await runPool(specs, Math.max(1, availableParallelism() - 1), (d, n) => {
	if (performance.now() - last > 30000 || d === n) {
		last = performance.now();
		console.log(`  ${d}/${n} tables`);
	}
});
const seconds = (performance.now() - started) / 1000;
const hands = specs.reduce((s, x) => s + x.hands, 0);

const out = { seed: SEED, tables: TABLES, adapt: ADAPT, hands, seconds, heroes: {} };
for (const h of heroes) {
	const pop = results.filter((r) => r.key === h.key && r.run === 'pop');
	const byType = {};
	for (const type of ADAPT_TYPES) {
		const rs = results.filter((r) => r.key === h.key && r.run === `adapt:${type}`);
		if (rs.length) byType[type] = combine(rs.map((r) => r.seats[0]));
	}
	const perTable = pop.map((r) => (r.seats[0].total.net / r.seats[0].hands) * 100);
	out.heroes[h.key] = {
		character: h.character,
		measures: measure(
			combine(pop.map((r) => r.seats[0])),
			Object.keys(byType).length ? byType : null
		),
		boots: ci(perTable),
		perTable
	};
}
mkdirSync(new URL('../../.sim/phase3/', import.meta.url), { recursive: true });
writeFileSync(
	new URL(`../../.sim/phase3/baseline-${SEED}.json`, import.meta.url),
	JSON.stringify(out)
);
console.log(`${hands} hands in ${seconds.toFixed(0)} s`);
