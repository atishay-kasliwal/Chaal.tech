import test from 'node:test';
import assert from 'node:assert/strict';
import {
	issueClubToken,
	verifyClubToken,
	issueGameToken,
	verifyGameToken,
	roomCodeFor,
	tokenFromWebSocketProtocols,
	verifySession
} from '../../server/cloudflare/security.mjs';
import { hmacSha256 } from '../../server/random.mjs';

const secret = 'unit-test-secret-that-is-long-enough-for-hmac';
const playerId = '6e5b4615-4cbb-4f51-8d93-6e45f8c87c0d';
const memberId = '66f0c0ffee0000000000abcd';

test('game credentials are signed, carry the member binding and expire after five minutes', async () => {
	const now = 1_800_000_000_000;
	const session = await issueGameToken(secret, { playerId, memberId, nickname: 'Raju', characterId: 'tiger' }, now);
	const [payload, signature] = session.token.split('.');
	const altered = `${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
	assert.deepEqual(await verifyGameToken(session.token, secret, now + 1000), {
		playerId, memberId, nickname: 'Raju', characterId: 'tiger', expiresAt: now + 5 * 60 * 1000
	});
	assert.equal(await verifySession(session.token, secret, now + 1000), playerId);
	assert.equal(await verifySession(session.token, secret, now + 5 * 60 * 1000), null);
	assert.equal(await verifySession(altered, secret, now), null);
	assert.equal(await verifySession(session.token, 'short', now), null);
});

test('club sign-ins and old guest sessions are not game credentials', async () => {
	const now = 1_800_000_000_000;
	const club = await issueClubToken(secret, { memberId, version: 3 }, now);
	assert.deepEqual(await verifyClubToken(club, secret, now + 1000), { memberId, version: 3 });
	assert.equal(await verifyClubToken(club, secret, now + 31 * 24 * 60 * 60 * 1000), null);
	assert.equal(await verifySession(club, secret, now), null);
	// The anonymous one-year guest token had only sub/iat/exp; it must not open the club.
	const content = Buffer.from(JSON.stringify({ sub: playerId, iat: now / 1000, exp: now / 1000 + 3600 })).toString('base64url');
	const legacy = `${content}.${Buffer.from(await hmacSha256(secret, content)).toString('base64url')}`;
	assert.equal(await verifySession(legacy, secret, now), null);
	assert.equal(await verifyClubToken(legacy, secret, now), null);
	const game = await issueGameToken(secret, { playerId, memberId, nickname: 'Raju', characterId: 'tiger' }, now);
	assert.equal(await verifyClubToken(game.token, secret, now), null);
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
