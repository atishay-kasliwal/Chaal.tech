import { liveLeagueLock } from './lock.mjs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newYorkClock } from './schedule-time.mjs';
import { publishReport } from './publish.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = new URL('../../data/league/', import.meta.url);
await mkdir(dir, { recursive: true });
const clock = newYorkClock();
if (!clock.due) process.exit(0);
const id = `daily-${clock.day}`;
const marker = new URL(`${id}.published`, dir);
if (
	await stat(marker).then(
		() => true,
		() => false
	)
)
	process.exit(0);
const lock = new URL('run.lock', dir);
if (await liveLeagueLock(lock)) process.exit(0);
// Report publication can retry without replaying a completed million-hand competition.
if (
	!process.env.MONGODB_ADMIN_URI &&
	!process.env.MONGODB_URI &&
	!(process.env.LEAGUE_PUBLISH_KEY && process.env.LEAGUE_PUBLISH_URL)
)
	throw new Error('League publishing credentials are missing.');
const reportFile = new URL(`${id}.json`, dir);
let report = await readFile(reportFile, 'utf8').then(JSON.parse, (e) => {
	if (e.code === 'ENOENT') return null;
	throw e;
});
if (!report) {
	const code = await new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			['scripts/league/run.mjs', '--seed', clock.day, '--hands', '1000000'],
			{ cwd: root, stdio: 'inherit' }
		);
		child.once('error', reject);
		child.once('exit', resolve);
	});
	if (code !== 0) throw new Error(`League competition failed (${code}); no result published.`);
	report = JSON.parse(await readFile(reportFile, 'utf8'));
}
await publishReport(report);
await writeFile(marker, report.completedAt);
console.log(`${id} published at ${new Date().toISOString()}`);
