/**
 * A small process pool for simulations: table specs go out one at a time from a shared queue, so
 * one slow table never holds up a fixed batch. Workers are child processes with Maglev off: V8's
 * Maglev compiler intermittently stalled a simulation worker for minutes (Node 26, 2026-10-19),
 * while the other JIT tiers run the same tables steadily, and V8 flags are per process. Clean
 * timing is measured in the parent with the default JIT, which is what the live game uses.
 */
import { fork } from 'node:child_process';

export function runPool(specs, threads, onProgress = () => {}) {
	return new Promise((resolve, reject) => {
		const results = [];
		let next = 0;
		let done = 0;
		const workers = Array.from({ length: Math.min(threads, specs.length) }, () => {
			const worker = fork(new URL('./worker.mjs', import.meta.url), [], {
				execArgv: ['--no-maglev'],
				serialization: 'advanced'
			});
			const feed = () => {
				if (next < specs.length) worker.send(specs[next++]);
				else worker.send(null);
			};
			worker.on('message', (result) => {
				results.push(result);
				onProgress(++done, specs.length);
				feed();
			});
			worker.once('error', reject);
			feed();
			return worker;
		});
		let exited = 0;
		for (const w of workers)
			w.once('exit', () => {
				if (++exited === workers.length) resolve(results);
			});
	});
}
