/**
 * Phase 4 driver (docs/bots/PHASE4_REPORT.md): measurement calibration, the fixed exploit suite,
 * exploit search, character studies, challengers and the league. Every stage writes its result to
 * .sim/phase4/<stage>-<seed>.json; scripts/sim/phase4-report.mjs reads them.
 *
 *   node scripts/sim/phase4.mjs <stage> [--seed N] [--scale X]
 *
 * All comparisons are matched (brief §4): the same decks, seats, opponents and decision streams per
 * seat, so swapping one bot for another changes nothing else until its own choices differ.
 */
import { performance } from 'node:perf_hooks';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { runPool } from './pool.mjs';
import { STAGES as BASE } from './phase4-stages.mjs';
import { adapt } from './phase4-adapt.mjs';

import { exploits, search } from './phase4-exploit.mjs';

import { samay } from './phase4-samay.mjs';

import { variation } from './phase4-variation.mjs';

import { gates } from './phase4-gates.mjs';
import { league } from './phase4-league.mjs';

const STAGES = { ...BASE, adapt, exploits, search, samay, variation, gates, league };

const args = process.argv.slice(2);
const stage = args[0];
const opt = (name, dflt) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : dflt;
};
const SEED = Number(opt('seed', 44));
const SCALE = Number(opt('scale', 1));
const threads = Math.max(1, availableParallelism() - 1);
const DIR = '.sim/phase4';
mkdirSync(DIR, { recursive: true });

export const totals = { hands: 0, decisions: 0, seconds: 0, maxRssMb: 0 };
/** Run specs on the pool, tallying scale. */
export async function run(specs, label = '') {
	const t0 = performance.now();
	let last = 0;
	const results = await runPool(specs, threads, (done, all) => {
		const now = performance.now();
		if (now - last > 30000) {
			last = now;
			console.log(`  ${label} ${done}/${all} tables (${((now - t0) / 1000).toFixed(0)} s)`);
		}
	});
	totals.seconds += (performance.now() - t0) / 1000;
	totals.hands += specs.reduce((s, x) => s + x.hands, 0);
	for (const r of results) {
		totals.decisions += r.decisions;
		totals.maxRssMb = Math.max(totals.maxRssMb, r.rssMb ?? 0);
	}
	return results;
}
export const load = (name) => {
	const f = `${DIR}/${name}.json`;
	return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
export const save = (name, data) =>
	writeFileSync(`${DIR}/${name}.json`, JSON.stringify({ ...data, totals }, null, '\t'));

if (!STAGES[stage]) {
	console.error(`Unknown stage ${stage}. Stages: ${Object.keys(STAGES).join(', ')}`);
	process.exit(1);
}
const t0 = performance.now();
await STAGES[stage]({ SEED, SCALE, run, load, save, args, opt });
console.log(
	`${stage}: ${totals.hands.toLocaleString()} hands, ${totals.decisions.toLocaleString()} decisions in ${((performance.now() - t0) / 1000).toFixed(0)} s`
);
