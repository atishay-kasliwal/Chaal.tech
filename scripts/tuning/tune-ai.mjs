/**
 * AI-assisted tuning loop for one character's DNA (docs/bots/TUNING_LOOP.md). Offline only:
 * proposes, validates, simulates and gates candidates, writes a report to .sim/tuning/<run-id>/
 * and stops. Never publishes, never touches the database or the canonical configs.
 *
 *   npm run bots:tune-ai -- --character gg --mock                 (offline, smoke budget, about a minute)
 *   npm run bots:tune-ai -- --character gg                        (Claude, needs ANTHROPIC_API_KEY, real budget)
 *
 * Options: --proposer claude|mock (--mock), --model, --effort, --drafts N, --max-rounds K, --seed S,
 * --budget smoke|real, --seeds 61,62, --tables, --hands, --exploit-tables, --exploit-hands,
 * --exploits a,b, --nights, --night-hands, --perf / --no-perf, --threads, --run-id, --out,
 * --mock-invalid N.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, runTuning } from './run.mjs';
import { budgetHands } from './simulate.mjs';

let o;
try {
	o = parseArgs(process.argv.slice(2));
} catch (error) {
	console.error(error.message);
	process.exit(2);
}
if (o.proposer === 'claude' && !process.env.ANTHROPIC_API_KEY) {
	console.error('ANTHROPIC_API_KEY is not set (environment or .env). Use --mock to run offline.');
	process.exit(2);
}
const h = budgetHands(o.budget);
console.log(
	`tuning ${o.character} with the ${o.proposer} proposer${o.model ? ` (${o.model})` : ''}: ${o.drafts} draft(s), up to ${o.maxRounds} round(s); ${h.baseline.toLocaleString('en-US')} baseline hands + ${h.candidate.toLocaleString('en-US')} per candidate`
);
const { runId, state, seconds } = await runTuning(o);
const out = state.output;
const timingFile = join(out.dir, 'timing.json');
writeFileSync(
	timingFile,
	JSON.stringify({ ...JSON.parse(readFileSync(timingFile, 'utf8')), seconds }, null, '\t') + '\n'
);
console.log(`trace: ${state.trace.join(' > ')}`);
console.log(
	`${runId}: ${out.candidates} candidate(s) simulated, ${out.rejected} draft(s) rejected, passing every gate: ${out.passed.length ? out.passed.join(', ') : 'none'} (${seconds.toFixed(0)} s)`
);
console.log(`report: ${join(out.dir, 'report.md')}`);
