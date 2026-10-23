import { open, readFile, unlink } from 'node:fs/promises';

/** A dead runner must not prevent every future daily competition. Never clear a live PID. */
export async function liveLeagueLock(file) {
	const lock = await readFile(file, 'utf8').then(JSON.parse, (e) => {
		if (e.code === 'ENOENT') return null;
		throw e;
	});
	if (!lock) return false;
	if (!Number.isSafeInteger(lock.pid) || lock.pid < 1)
		throw new Error('Invalid league lock; inspect it before clearing it.');
	try {
		process.kill(lock.pid, 0);
		return true;
	} catch (e) {
		if (e.code === 'ESRCH') return false;
		throw e;
	}
}
export async function acquireLeagueLock(file) {
	try {
		return await open(file, 'wx');
	} catch (e) {
		if (e.code !== 'EEXIST') throw e;
	}
	if (await liveLeagueLock(file)) throw new Error('A league competition is already running.');
	await unlink(file).catch((e) => {
		if (e.code !== 'ENOENT') throw e;
	});
	return open(file, 'wx');
}
