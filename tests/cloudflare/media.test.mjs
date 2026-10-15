import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { RoomDurableObject } from '../../server/cloudflare/room-object.mjs';

function readClaims(token) {
	const [header, claims, signature] = token.split('.');
	const content = `${header}.${claims}`;
	return {
		claims: JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')),
		signature,
		content
	};
}

test('Cloudflare issues identity-bound LiveKit credentials and configures a six-seat media room', async () => {
	const secret = 'livekit-worker-test-secret';
	const object = Object.create(RoomDurableObject.prototype);
	object.env = {
		LIVEKIT_URL: 'wss://media.example.test',
		LIVEKIT_API_KEY: 'api-key',
		LIVEKIT_API_SECRET: secret
	};
	const originalFetch = globalThis.fetch;
	const calls = [];
	globalThis.fetch = async (url, options) => {
		calls.push({ url: String(url), options });
		return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
	};
	try {
		const credential = await object.issueLiveKitToken('room-abc', {
			id: 'player-123',
			username: 'friend',
			seatNumber: 4
		});
		assert.equal(credential.url, 'wss://media.example.test');
		assert.equal(credential.identity, 'player-123');
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, 'https://media.example.test/twirp/livekit.RoomService/CreateRoom');
		assert.deepEqual(JSON.parse(calls[0].options.body), {
			name: 'room-abc', maxParticipants: 6, emptyTimeout: 300, departureTimeout: 30
		});

		const create = readClaims(calls[0].options.headers.Authorization.slice('Bearer '.length));
		assert.equal(create.claims.iss, 'api-key');
		assert.deepEqual(create.claims.video, { roomCreate: true });
		assert.equal(create.signature, createHmac('sha256', secret).update(create.content).digest('base64url'));

		const participant = readClaims(credential.token);
		assert.equal(participant.claims.sub, 'player-123');
		assert.equal(participant.claims.name, 'friend');
		assert.equal(participant.claims.video.roomJoin, true);
		assert.equal(participant.claims.video.room, 'room-abc');
		assert.deepEqual(participant.claims.video.canPublishSources, ['camera', 'microphone']);
		assert.equal(participant.claims.video.canPublishData, false);
		assert.deepEqual(JSON.parse(participant.claims.metadata), {
			roomId: 'room-abc', playerId: 'player-123', seatNumber: 4
		});
		assert.equal(participant.signature, createHmac('sha256', secret).update(participant.content).digest('base64url'));
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('Cloudflare refuses unsafe LiveKit URLs before making server API requests', async () => {
	const object = Object.create(RoomDurableObject.prototype);
	object.env = { LIVEKIT_URL: 'https://user:password@media.example.test/path?token=secret' };
	assert.throws(() => object.liveKitHttpUrl(), /LiveKit URL is invalid/);
});
