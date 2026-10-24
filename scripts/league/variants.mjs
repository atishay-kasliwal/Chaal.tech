/**
 * The variant league: the five canonical characters play each game side by side on the same
 * shuffled decks under five seat rotations (the Classic League's design). Matched decision draws
 * are Classic-only, so here decisions share the deck seed but are not matched per seat.
 * Simulation only: nothing here changes a bot or publishes a result.
 *
 *   node scripts/league/variants.mjs --hands 10000 --seed 20261024
 *   node scripts/league/variants.mjs --only draw-1,trade-one-1 --hands 2000
 */
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { competitionSpecs, summarizeCompetition, ROSTER } from '../../server/league/competition.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i < 0 ? fallback : process.argv[i + 1];
};
export const NEW_GAMES = [
	'odd-even-1',
	'best-of-five-2',
	'worst-of-four-1',
	'hukum-1',
	'red-black-1',
	'progressive-joker-1',
	'open-card-1',
	'one-hidden-1',
	'stud-1',
	'draw-1',
	'trade-one-1',
	'pass-the-card-1',
	'high-low-1',
	'split-pot-1',
	'faceoff-1',
	'buying-joker-2',
	'auction-2',
	'knockout-1',
	'sudden-death-1',
	'survivor-1',
	'banko-1',
	'community-1'
];
const hands = Number(arg('hands', 10000));
const seed = Number(arg('seed', 20261024));
const threads = Number(arg('threads', Math.min(5, Math.max(1, availableParallelism() - 2))));
const only = arg('only', null)?.split(',');
const games = only ?? NEW_GAMES;

function runGame(rulesVersion) {
	const specs = competitionSpecs({ hands, seed }).map((spec) => ({
		...spec,
		matched: false,
		rulesVersion
	}));
	return new Promise((resolve, reject) => {
		const rows = [];
		let next = 0,
			exited = 0,
			failed = false;
		const workers = [];
		const fail = (error) => {
			if (failed) return;
			failed = true;
			for (const w of workers) w.kill('SIGTERM');
			reject(error);
		};
		const count = Math.min(threads, specs.length);
		for (let i = 0; i < count; i++) {
			const worker = fork(new URL('./variant-worker.mjs', import.meta.url), [], {
				execArgv: ['--no-maglev'],
				serialization: 'advanced'
			});
			workers.push(worker);
			const feed = () => worker.send(next < specs.length ? specs[next++] : null);
			worker.on('message', (r) => (r.error ? fail(new Error(r.error)) : (rows.push(r), feed())));
			worker.once('error', fail);
			worker.once('exit', (code) => {
				if (code !== 0) return fail(new Error(`Worker exited ${code}`));
				if (++exited === count) resolve(rows);
			});
			feed();
		}
	});
}

const add = (into, from) => {
	for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
};
const dir = path.join(root, 'data/league');
await mkdir(dir, { recursive: true });
const report = { seed, hands, startedAt: new Date().toISOString(), games: {} };
for (const rulesVersion of games) {
	const t0 = Date.now();
	process.stdout.write(`${rulesVersion} ... `);
	try {
		const results = await runGame(rulesVersion);
		const summary = summarizeCompetition(results, {
			hands,
			seed,
			kind: 'exhibition',
			startedAt: new Date(t0).toISOString(),
			completedAt: new Date().toISOString()
		});
		const moves = Object.fromEntries(ROSTER.map((c) => [c.id, {}]));
		const reasons = {};
		let steps = 0;
		for (const r of results) {
			steps += r.steps;
			add(reasons, r.reasons);
			for (const row of r.rows) add(moves[row.id], row.moves);
		}
		report.games[rulesVersion] = {
			standings: summary.standings.map((s) => ({
				id: s.id,
				profit100: s.profit100,
				interval95: s.interval95,
				wins: s.wins
			})),
			leader: summary.leader,
			decisive: summary.decisive,
			stepsPerHand: steps / hands,
			reasons,
			moves
		};
		console.log(
			`${summary.leader} leads, ${(steps / hands).toFixed(1)} decisions a hand, ${Math.round((Date.now() - t0) / 1000)}s`
		);
	} catch (error) {
		report.games[rulesVersion] = { error: error.message };
		console.log(`FAILED: ${error.message}`);
	}
}
report.completedAt = new Date().toISOString();
const file = path.join(dir, `variants-${seed}-${hands}.json`);
await writeFile(file, JSON.stringify(report, null, 2));
console.log(`Saved ${file}`);
