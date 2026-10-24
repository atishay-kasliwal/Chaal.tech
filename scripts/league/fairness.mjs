/**
 * Seat fairness. In the League's design every character sits in every seat once per block (five
 * rotations over the same decks), so character skill cancels exactly and what is left in a seat's
 * total is the seat's own advantage: position, who moves when, a rule that favours one side. A
 * seat whose average block result is far from zero is a red flag. Classic is the control: it shows
 * how much seat effect an ordinary game has.
 *
 *   node scripts/league/fairness.mjs --hands 10000 --only classic-1,trade-one-1
 */
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVariants } from '../../server/variants/index.mjs';
import { competitionSpecs } from '../../server/league/competition.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i < 0 ? fallback : process.argv[i + 1];
};
const hands = Number(arg('hands', 10000));
const seed = Number(arg('seed', 20261025));
const threads = Number(arg('threads', Math.min(5, Math.max(1, availableParallelism() - 2))));
const only = arg('only', null)?.split(',');
const games = only ?? ['classic-1', ...listVariants().map((v) => v.rulesVersion).filter((v) => v !== 'classic-1')];
const SEATS = 5;

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

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
	const m = mean(xs);
	return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const out = { seed, hands, games: {} };
for (const rulesVersion of games) {
	process.stdout.write(`${rulesVersion.padEnd(22)}`);
	try {
		const results = await runGame(rulesVersion);
		const blocks = new Map();
		for (const r of results) {
			const sums = blocks.get(r.block) ?? Array(SEATS).fill(0);
			r.rows.forEach((row, seat) => (sums[seat] += row.net));
			blocks.set(r.block, sums);
		}
		const seats = Array.from({ length: SEATS }, (_, seat) => {
			const perBlock = [...blocks.values()].map((sums) => sums[seat]);
			const m = mean(perBlock);
			const se = sd(perBlock) / Math.sqrt(perBlock.length);
			return { seat, mean: m, se, z: se ? m / se : 0 };
		});
		const worst = seats.reduce((a, b) => (Math.abs(b.z) > Math.abs(a.z) ? b : a));
		out.games[rulesVersion] = { seats, worstZ: worst.z, worstSeat: worst.seat };
		console.log(
			seats.map((s) => `${s.z >= 0 ? '+' : ''}${s.z.toFixed(1)}`.padStart(6)).join(' '),
			`  worst seat ${worst.seat} z=${worst.z.toFixed(1)}`
		);
	} catch (error) {
		out.games[rulesVersion] = { error: error.message };
		console.log(`FAILED ${error.message}`);
	}
}
const dir = path.join(root, 'data/league');
await mkdir(dir, { recursive: true });
const file = path.join(dir, `fairness-${seed}-${hands}.json`);
await writeFile(file, JSON.stringify(out, null, 2));
console.log(`Saved ${file}`);
