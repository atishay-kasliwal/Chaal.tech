/**
 * Deploy the game Worker with a verifiable engine build id, then prove production runs it.
 *   npm run deploy:backend [-- --allow-dirty]
 *
 * The build id is the git commit. A dirty tree is refused (hands would name a commit that does
 * not contain the code that played them) unless --allow-dirty, which stamps `<sha>-dirty-<time>`.
 * After deploying, /health must report exactly this id, or the script fails.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { BUILD_PATTERN } from '../server/cloudflare/build.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export function buildId({ sha, dirty, allowDirty, now = Date.now() }) {
	if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`Not a git commit: ${sha}`);
	if (dirty && !allowDirty)
		throw new Error('Uncommitted changes: commit them, or pass --allow-dirty to deploy an unreproducible build.');
	const id = dirty ? `${sha}-dirty-${now.toString(36)}` : sha;
	if (!BUILD_PATTERN.test(id)) throw new Error(`Invalid build id ${id}`);
	return id;
}

async function main() {
	const allowDirty = process.argv.includes('--allow-dirty');
	const id = buildId({
		sha: git('rev-parse', '--short=12', 'HEAD'),
		dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
		allowDirty
	});
	console.log(`Deploying chaal-game with ENGINE_BUILD=${id}`);
	const deploy = spawnSync('npx', ['wrangler', 'deploy', '--config', 'wrangler.game.toml', '--var', `ENGINE_BUILD:${id}`], {
		stdio: 'inherit'
	});
	if (deploy.status !== 0) process.exit(deploy.status ?? 1);
	const base = (process.env.GAME_SERVER_URL || 'https://chaal-game.s6-backend-spike.workers.dev').replace(/\/+$/, '');
	for (let attempt = 1; attempt <= 12; attempt++) {
		try {
			const health = await (await fetch(`${base}/health`)).json();
			if (health.engineBuild === id) {
				console.log(`Production reports ENGINE_BUILD=${id}.`);
				return;
			}
			console.log(`Waiting for the new build (health reports ${health.engineBuild ?? health.error ?? 'nothing'})...`);
		} catch (error) {
			console.log(`Health check failed (${error.message}); retrying...`);
		}
		await new Promise((resolve) => setTimeout(resolve, 5000));
	}
	console.error(`Production never reported ENGINE_BUILD=${id}. Check ${base}/health before playing.`);
	process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
