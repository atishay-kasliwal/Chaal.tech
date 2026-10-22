/**
 * Clean decision timing in a fresh process (nothing else in memory): legacy, v2 and v3 character
 * decisions, and v3 mind upkeep per commit, with p50 / p95 / p99. Prints JSON.
 *   node scripts/sim/bench.mjs [--hands 600]
 */
import { performance } from 'node:perf_hooks';
import { runTable } from '../../server/sim/table.mjs';
import { versioned, CHARACTER_IDS } from '../../server/sim/population.mjs';
import { ancestorGenome, candidateStyle } from '../../server/sim/candidates.mjs';
import { readFileSync, existsSync } from 'node:fs';

const i = process.argv.indexOf('--hands');
const HANDS = i > 0 ? Number(process.argv[i + 1]) : 600;
const pct = (xs, p) => {
	const s = xs.slice().sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const stats = (xs) => ({
	n: xs.length,
	p50: pct(xs, 0.5),
	p95: pct(xs, 0.95),
	p99: pct(xs, 0.99),
	max: Math.max(...xs)
});

// v4: Phase 3 candidates (--candidates <json of { character: genome }>), else the v3 DNA on tp-dna@4.
const ci = process.argv.indexOf('--candidates');
const pi = process.argv.indexOf('--policy');
const policy = pi > 0 ? process.argv[pi + 1] : undefined;
const chosen =
	ci > 0 && existsSync(process.argv[ci + 1])
		? JSON.parse(readFileSync(process.argv[ci + 1], 'utf8'))
		: {};
const v4 = CHARACTER_IDS.map((c) => {
	const style = candidateStyle(c, chosen[c] ?? ancestorGenome(c), {
		id: `${c}@4-bench`,
		parent: `${c}@3`,
		generation: 0,
		...(policy && chosen[c] ? { policy } : {})
	});
	return { id: style._id, style };
});
const groups = {
	legacy: ['legacy-easy', 'legacy-normal', 'legacy-hard', 'legacy-normal', 'legacy-hard'],
	v2: versioned(2),
	v3: versioned(3),
	v4
};
// Warm up the JIT on every policy first, as a long-lived room would be.
for (const seats of Object.values(groups)) runTable({ seed: 1, table: 1, seats, hands: 100 });

const out = { node: process.version, hands: HANDS };
for (const [group, seats] of Object.entries(groups)) {
	const decisions = [];
	const upkeep = [];
	const t0 = performance.now();
	runTable({ seed: 2, table: 2, seats, hands: HANDS }, (h) => {
		for (const d of h.decisions) decisions.push(d.ms);
		if (h.decisions.length) upkeep.push(h.mindMs / (h.decisions.length + 1));
	});
	const ms = performance.now() - t0;
	out[group] = {
		handsPerSec: Math.round((HANDS / ms) * 1000),
		decision: stats(decisions),
		...(group === 'v3' || group === 'v4' ? { mindUpkeepPerCommit: stats(upkeep) } : {})
	};
}
out.rssMb = Math.round(process.memoryUsage().rss / 2 ** 20);
console.log(JSON.stringify(out, null, 1));
