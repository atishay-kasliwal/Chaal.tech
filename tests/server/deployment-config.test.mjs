import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicServerOrigin } from '../../scripts/public-server-origin.mjs';

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
