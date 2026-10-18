import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateKeyPair, exportJWK } from 'jose';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testSecret = 'cloudflare-worker-test-secret-0123456789abcdef';

async function freePort() {
	const server = createServer();
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
	await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	return address.port;
}

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options });
		let stdout = '';
		let stderr = '';
		child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
		child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
		child.once('error', reject);
		child.once('close', (code, signal) => resolve({ code: code ?? 1, signal, stdout, stderr }));
	});
}

const [port, inspectorPort, frontendPort] = await Promise.all([freePort(), freePort(), freePort()]);
const browserURL = `http://127.0.0.1:${frontendPort}`;
const endpoint = `http://127.0.0.1:${port}`;
const wrangler = path.join(root, 'node_modules/.bin/wrangler');
// A throwaway guest list and a stand-in for Google's signing key: the real sign-in path, offline.
const mongo = await MongoMemoryServer.create();
const clientId = 'chaal-test.apps.googleusercontent.com';
const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
const publicJwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
const privateJwk = { ...(await exportJWK(privateKey)), kid: 'test-key', alg: 'RS256' };
const varsDir = await mkdtemp(path.join(tmpdir(), 'chaal-cf-test-'));
const varsFile = path.join(varsDir, 'test.vars');
await writeFile(varsFile, [
	`SESSION_SECRET=${testSecret}`,
	`MONGODB_URI=${mongo.getUri()}`,
	'MONGODB_DB=chaal-cf-test',
	`GOOGLE_CLIENT_ID=${clientId}`,
	'ALLOW_TEST_SIGN_IN=true',
	'ENGINE_BUILD=test',
	`ALLOWED_ORIGINS=http://localhost:5173,${browserURL}`,
	`TEST_GOOGLE_JWKS='${JSON.stringify({ keys: [publicJwk] })}'`
].join('\n'), { mode: 0o600 });
const worker = spawn(wrangler, [
	'dev', '--config', 'wrangler.game.toml', '--local', '--ip', '127.0.0.1',
	'--port', String(port), '--inspector-port', String(inspectorPort),
	'--env-file', varsFile, '--persist-to', path.join(varsDir, 'state'), '--log-level', 'error'
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const frontend = spawn(path.join(root, 'node_modules/.bin/vite'), ['dev', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {
 cwd: root, env: {...process.env, VITE_SERVER_URL: endpoint, VITE_GOOGLE_CLIENT_ID: clientId}, stdio: ['ignore','pipe','pipe']
});
let frontendOutput = '';
frontend.stdout.on('data', chunk => {frontendOutput += chunk.toString();});
frontend.stderr.on('data', chunk => {frontendOutput += chunk.toString();});
let workerOutput = '';
worker.stdout.on('data', (chunk) => { workerOutput += chunk.toString(); });
worker.stderr.on('data', (chunk) => { workerOutput += chunk.toString(); });

async function stopWorker() {
	if (worker.exitCode !== null || worker.signalCode !== null) return;
	worker.kill('SIGTERM');
	await Promise.race([
		new Promise((resolve) => worker.once('close', resolve)),
		new Promise((resolve) => setTimeout(() => { worker.kill('SIGKILL'); resolve(); }, 3000))
	]);
}

try {
	let ready = false;
	for (let attempt = 0; attempt < 120; attempt++) {
		if (worker.exitCode !== null) break;
		try {
			const [response, ui] = await Promise.all([fetch(`${endpoint}/health`), fetch(`${browserURL}/bots`)]);
			if (response.ok && ui.ok) {
				ready = true;
				break;
			}
		} catch {
			// Wrangler has not bound the local port yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	if (!ready) throw new Error(`Cloudflare Worker did not become ready.\n${workerOutput}\n${frontendOutput}`);
	const files = (await readdir(path.join(root, 'tests/cloudflare')))
		.filter((name) => name.endsWith('.test.mjs'))
		.map((name) => path.join('tests/cloudflare', name));
	const result = await run(process.execPath, ['--test', '--test-concurrency=1', ...files], {
		env: {
			...process.env,
			CHAAL_CF_TEST_URL: endpoint,
			CHAAL_BROWSER_URL: browserURL,
			CHAAL_CF_TEST_SECRET: testSecret,
			CHAAL_CF_TEST_MONGO: mongo.getUri(),
			CHAAL_CF_TEST_CLIENT_ID: clientId,
			CHAAL_CF_TEST_GOOGLE_KEY: JSON.stringify(privateJwk)
		}
	});
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	if (result.code !== 0) {
		if (workerOutput.trim()) process.stderr.write(`\nWrangler output:\n${workerOutput}\n${frontendOutput}`);
		process.exitCode = result.code;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Cloudflare Worker tests failed');
	process.exitCode = 1;
} finally {
	frontend.kill('SIGTERM');
	await stopWorker();
	await mongo.stop();
	await rm(varsDir, { recursive: true, force: true });
}
