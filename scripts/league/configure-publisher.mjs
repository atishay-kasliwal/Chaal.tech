import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv.includes('--configure'))
	throw new Error(
		'Use --configure to create a league-only publishing credential on the game Worker.'
	);
const file = new URL('../../.env', import.meta.url);
let env = await readFile(file, 'utf8').catch((e) => {
	if (e.code === 'ENOENT') return '';
	throw e;
});
const existing = env.match(/^LEAGUE_PUBLISH_KEY=([a-f0-9]{64})$/m)?.[1];
const key = existing ?? randomBytes(32).toString('hex');
const code = await new Promise((resolve, reject) => {
	const child = spawn(
		new URL('../../node_modules/.bin/wrangler', import.meta.url).pathname,
		['secret', 'put', 'LEAGUE_PUBLISH_KEY', '--config', 'wrangler.game.toml'],
		{ cwd: root, stdio: ['pipe', 'inherit', 'inherit'] }
	);
	child.once('error', reject);
	child.once('exit', resolve);
	child.stdin.end(`${key}\n`);
});
if (code !== 0)
	throw new Error('Publisher credential setup failed; local configuration was not changed.');
for (const [name, value] of Object.entries({
	LEAGUE_PUBLISH_KEY: key,
	LEAGUE_PUBLISH_URL: 'https://chaal-game.s6-backend-spike.workers.dev/admin/bots/league'
})) {
	const line = new RegExp(`^${name}=.*$`, 'm');
	env = line.test(env)
		? env.replace(line, `${name}=${value}`)
		: `${env.trimEnd()}\n${name}=${value}\n`;
}
await writeFile(file, env, { mode: 0o600 });
console.log('League-only publisher configured. Credential saved in ignored local .env.');
