import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const [port, inspectorPort] = await Promise.all([freePort(), freePort()]);
const endpoint = `http://127.0.0.1:${port}`;
const wrangler = path.join(root, 'node_modules/.bin/wrangler');
const worker = spawn(wrangler, [
	'dev', '--config', 'wrangler.game.toml', '--local', '--ip', '127.0.0.1',
	'--port', String(port), '--inspector-port', String(inspectorPort),
	'--var', `SESSION_SECRET:${testSecret}`, '--log-level', 'error'
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
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
			const response = await fetch(`${endpoint}/health`);
			if (response.ok) {
				ready = true;
				break;
			}
		} catch {
			// Wrangler has not bound the local port yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	if (!ready) throw new Error(`Cloudflare Worker did not become ready.\n${workerOutput}`);
	const files = (await readdir(path.join(root, 'tests/cloudflare')))
		.filter((name) => name.endsWith('.test.mjs'))
		.map((name) => path.join('tests/cloudflare', name));
	const result = await run(process.execPath, ['--test', ...files], {
		env: { ...process.env, CHAAL_CF_TEST_URL: endpoint }
	});
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	if (result.code !== 0) {
		if (workerOutput.trim()) process.stderr.write(`\nWrangler output:\n${workerOutput}`);
		process.exitCode = result.code;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Cloudflare Worker tests failed');
	process.exitCode = 1;
} finally {
	await stopWorker();
}
