import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../server/cloudflare/worker.mjs';

/** The Worker cannot run unidentified: without a valid ENGINE_BUILD it is unhealthy and refuses play. */
const call = (path, env, init) => worker.fetch(new Request(`https://game.test${path}`, init), env);
const env = { SESSION_SECRET: 'x'.repeat(40), ALLOWED_ORIGINS: 'https://chaal.tech' };

test('without a valid ENGINE_BUILD the Worker reports unhealthy and refuses game traffic', async () => {
	for (const build of [undefined, '', 'unknown', 'main']) {
		const health = await call('/health', { ...env, ENGINE_BUILD: build });
		assert.equal(health.status, 503);
		assert.equal((await health.json()).ok, false);
		assert.equal((await call('/ready', { ...env, ENGINE_BUILD: build })).status, 503);
		const session = await call('/session', { ...env, ENGINE_BUILD: build }, { method: 'POST' });
		assert.equal(session.status, 503);
	}
});

test('with a commit build id the Worker reports it on /health', async () => {
	const health = await call('/health', { ...env, ENGINE_BUILD: '05066112abcd' });
	assert.equal(health.status, 200);
	assert.deepEqual(await health.json(), { ok: true, service: 'chaal-game', engineBuild: '05066112abcd' });
});
