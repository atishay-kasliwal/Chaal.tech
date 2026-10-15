import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, roomCodeFor, tokenFromWebSocketProtocols, verifySession } from '../../server/cloudflare/security.mjs';

const secret = 'unit-test-secret-that-is-long-enough-for-hmac';

test('Cloudflare guest sessions are signed, stable and expire after one year', async () => {
	const now = 1_800_000_000_000;
	const session = await issueSession(secret, now);
	const [payload, signature] = session.token.split('.');
	const altered = `${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
	assert.equal(await verifySession(session.token, secret, now + 1000), session.playerId);
	assert.equal(await verifySession(session.token, secret, now + 366 * 24 * 60 * 60 * 1000), null);
	assert.equal(await verifySession(altered, secret, now), null);
	assert.equal(await verifySession(session.token, 'short', now), null);
});

test('retry-safe room codes are secret-derived and stable for one create command', async () => {
	const first = await roomCodeFor(secret, '6e5b4615-4cbb-4f51-8d93-6e45f8c87c0d', '9bc7131b-0f61-4ec4-8d5d-708d8f5d4925');
	assert.match(first, /^[a-f0-9]{32}$/);
	assert.equal(first, await roomCodeFor(secret, '6e5b4615-4cbb-4f51-8d93-6e45f8c87c0d', '9bc7131b-0f61-4ec4-8d5d-708d8f5d4925'));
	assert.notEqual(first, await roomCodeFor(secret, '6e5b4615-4cbb-4f51-8d93-6e45f8c87c0d', '0bc7131b-0f61-4ec4-8d5d-708d8f5d4925'));
});

test('WebSocket auth is carried separately from the negotiated application protocol', () => {
	assert.equal(tokenFromWebSocketProtocols('chaal.v1, chaal-auth.abc.def-123'), 'abc.def-123');
	assert.equal(tokenFromWebSocketProtocols('chaal.v1'), null);
});
