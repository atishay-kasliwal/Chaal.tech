import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicServerOrigin } from '../../scripts/public-server-origin.mjs';
import { pagesAssetExclusions } from '../../scripts/pages-asset-routes.mjs';
import { readdirSync, statSync } from 'node:fs';

test('Pages serves every prototype asset statically while the review pages reach the app Worker', () => {
	const exclusions = pagesAssetExclusions();
	const bypassesWorker = (path) =>
		exclusions.some((rule) =>
			rule.endsWith('*') ? path.startsWith(rule.slice(0, -1)) : path === rule
		);
	for (const page of ['/prototypes/bot-presence', '/prototypes/bot-presence/table']) {
		assert.equal(bypassesWorker(page), false, `${page} must reach the SvelteKit Worker`);
	}
	const root = new URL('../../static/prototypes/', import.meta.url);
	for (const asset of readdirSync(root, { recursive: true })) {
		if (!statSync(new URL(asset, root)).isFile()) continue;
		assert.equal(bypassesWorker(`/prototypes/${asset}`), true, `${asset} must bypass the Worker`);
	}
	assert.equal(bypassesWorker('/cards/back-navy.svg'), true);
	assert.equal(bypassesWorker('/mascots/manifest.json'), true);
	assert.equal(bypassesWorker('/games'), false);
	assert.equal(bypassesWorker('/a-room-code'), false);
	assert.ok(exclusions.length + 4 < 100, 'leave room for the adapter rules and catch-all include');
});

test('production game server URL accepts a public HTTPS origin', () => {
	assert.equal(isPublicServerOrigin('https://api.chaal.tech'), true);
	assert.equal(isPublicServerOrigin('https://api.chaal.tech:8443'), true);
	assert.equal(isPublicServerOrigin('https://api.chaal.tech.'), true);
});

test('production game server URL rejects missing, local, IP, and non-origin values', () => {
	for (const value of [
		undefined,
		'',
		'http://api.chaal.tech',
		'https://localhost',
		'https://localhost.',
		'https://game.localhost',
		'https://127.0.0.1',
		'https://0.0.0.0',
		'https://[::1]',
		'https://[::ffff:127.0.0.1]',
		'https://192.0.2.10',
		'https://[2001:4860:4860::8888]',
		'https://user:secret@api.chaal.tech',
		'https://api.chaal.tech/v1',
		'https://api.chaal.tech?debug=1',
		'https://api.chaal.tech#section'
	]) {
		assert.equal(isPublicServerOrigin(value), false, `Expected ${String(value)} to be rejected`);
	}
});
