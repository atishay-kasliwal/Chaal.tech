import { acquireLeagueLock } from './lock.mjs';
import { fork, execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdir, writeFile, rename, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { competitionSpecs, summarizeCompetition } from '../../server/league/competition.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i < 0 ? fallback : process.argv[i + 1];
};
const kind = arg('kind', 'daily');
if (!['daily', 'exhibition', 'benchmark'].includes(kind))
	throw new Error('Unknown competition kind');
const day = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'America/New_York',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
})
	.format(new Date())
	.replaceAll('-', '');
const seed = Number(arg('seed', day));
const hands = Number(arg('hands', kind === 'benchmark' ? 5000 : 1_000_000));
const threads = Number(arg('threads', Math.min(5, Math.max(1, availableParallelism() - 2))));
if (!Number.isInteger(threads) || threads < 1 || threads > 16)
	throw new Error('Threads must be 1 to 16');
const specs = competitionSpecs({ hands, seed });
const dir = path.join(root, 'data/league');
await mkdir(dir, { recursive: true });
const existingFile = path.join(dir, `${kind}-${seed}.json`);
if (
	await access(existingFile).then(
		() => true,
		() => false
	)
)
	throw new Error(
		'This competition is already complete. Publish its saved report, or choose a new seed.'
	);
const lock = path.join(dir, 'run.lock');
const handle = await acquireLeagueLock(lock);
await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
const children = new Set();
const stop = () => {
	for (const child of children) child.kill('SIGTERM');
};
let abortRun;
process.once('SIGINT', () => abortRun?.(new Error('Competition interrupted')));
process.once('SIGTERM', () => abortRun?.(new Error('Competition interrupted')));
try {
	const startedAt = new Date().toISOString();
	console.log(
		`League: ${hands.toLocaleString()} shared hands, ${threads} workers, ${kind}, seed ${seed}`
	);
	const results = await new Promise((resolve, reject) => {
		const rows = [];
		let next = 0,
			exited = 0,
			failed = false;
		const fail = (e) => {
			if (failed) return;
			failed = true;
			stop();
			reject(e);
		};
		abortRun = fail;
		for (let i = 0; i < Math.min(threads, specs.length); i++) {
			const worker = fork(new URL('./worker.mjs', import.meta.url), [], {
				execArgv: ['--no-maglev'],
				serialization: 'advanced'
			});
			children.add(worker);
			const feed = () => worker.send(next < specs.length ? specs[next++] : null);
			worker.on('message', (r) => {
				if (r.error) return fail(new Error(r.error));
				rows.push(r);
				if (rows.length % 100 === 0)
					console.log(
						`${rows.length}/${specs.length} tables, ${Math.round((Date.now() - Date.parse(startedAt)) / 1000)}s`
					);
				feed();
			});
			worker.once('error', fail);
			worker.once('exit', (code) => {
				children.delete(worker);
				if (code !== 0) return fail(new Error(`Worker exited ${code}`));
				if (++exited === Math.min(threads, specs.length)) {
					if (rows.length !== specs.length) return fail(new Error('Incomplete run'));
					resolve(rows);
				}
			});
			feed();
		}
	});
	const report = summarizeCompetition(results, {
		hands,
		seed,
		kind,
		startedAt,
		completedAt: new Date().toISOString()
	});
	report.commit = execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: root,
		encoding: 'utf8'
	}).trim();
	const file = path.join(dir, `${report.id}.json`);
	await writeFile(`${file}.tmp`, JSON.stringify(report, null, 2));
	await rename(`${file}.tmp`, file);
	if (process.argv.includes('--snapshot')) {
		const snapshot = path.join(root, 'shared/league-results.json');
		await writeFile(snapshot, JSON.stringify({ reports: [report] }, null, 2));
	}
	if (process.argv.includes('--publish-db')) {
		const { publishReport } = await import('./publish.mjs');
		await publishReport(report);
		console.log('Published immutable league result');
	}
	console.log(
		JSON.stringify(
			{
				file,
				hands,
				seconds: report.durationSeconds,
				handsPerSecond: Math.round(hands / report.durationSeconds),
				winner: report.winner,
				leader: report.leader,
				projectedMillionMinutes: Math.round(((1_000_000 / hands) * report.durationSeconds) / 60)
			},
			null,
			2
		)
	);
} finally {
	stop();
	await handle.close();
	await unlink(lock);
}
