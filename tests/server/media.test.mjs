import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TokenVerifier } from 'livekit-server-sdk';
import { createMediaService } from '../../server/media.mjs';
import { MediaController } from '../../src/lib/media/controller.ts';
import { attachTrack } from '../../src/lib/media/attach.ts';

test('Signed media grant is room/identity scoped, short lived and camera/microphone only', async () => {
	const created = [],
		removed = [];
	const service = createMediaService(
		{ url: 'wss://media.example.test', apiKey: 'test-key', apiSecret: 'test-secret' },
		{
			async createRoom(options) {
				created.push(options);
			},
			async removeParticipant(...args) {
				removed.push(args);
			}
		}
	);
	const issued = await service.issue({
		roomName: 'test-room',
		playerId: 'server-player-id',
		username: 'alice',
		seatNumber: 2
	});
	const claims = await new TokenVerifier('test-key', 'test-secret').verify(issued.token);
	assert.equal(claims.sub, 'server-player-id');
	assert.equal(claims.video.room, 'test-room');
	assert.equal(claims.video.roomJoin, true);
	assert.equal(claims.video.canPublishData, false);
	assert.equal(claims.video.canUpdateOwnMetadata, false);
	assert.deepEqual(claims.video.canPublishSources, ['camera', 'microphone']);
	assert.equal(claims.video.roomAdmin, undefined);
	assert.equal(claims.video.roomCreate, undefined);
	assert.ok(claims.exp - Math.floor(Date.now() / 1000) <= 60);
	assert.deepEqual(JSON.parse(claims.metadata), {
		roomId: 'test-room',
		playerId: 'server-player-id',
		seatNumber: 2
	});
	assert.equal(created[0].maxParticipants, 6);
	assert.equal(issued.identity, 'server-player-id');
	assert.equal(issued.roomName, 'test-room');
	await service.remove('test-room', 'server-player-id');
	assert.deepEqual(removed, [['test-room', 'server-player-id', undefined]]);
});

test('Cloud removal can revoke tokens issued before the room membership ended', async () => {
	let removed;
	const service = createMediaService(
		{
			url: 'wss://example.livekit.cloud',
			apiKey: 'test-key',
			apiSecret: 'test-secret',
			revokeTokens: true
		},
		{
			async createRoom() {},
			async removeParticipant(...args) {
				removed = args;
			}
		}
	);
	await service.remove('private-room', 'departed-player');
	assert.equal(removed[0], 'private-room');
	assert.equal(removed[1], 'departed-player');
	assert.equal(typeof removed[2].revokeTokenTs, 'bigint');
	assert.ok(removed[2].revokeTokenTs <= BigInt(Math.floor(Date.now() / 1000)));
});

test('LiveKit Cloud automatically enables revocation even if the optional flag is omitted', async () => {
	let removed;
	const service = createMediaService(
		{ url: 'wss://project.livekit.cloud', apiKey: 'test-key', apiSecret: 'test-secret' },
		{
			async createRoom() {},
			async removeParticipant(...args) {
				removed = args;
			}
		}
	);
	await service.remove('private-room', 'departed-player');
	assert.equal(typeof removed[2].revokeTokenTs, 'bigint');
});

test('Media is optional and incomplete or unsafe configuration fails explicitly', () => {
	assert.equal(createMediaService(), null);
	for (const options of [
		{ url: 'ws://localhost:7880' },
		{ url: 'https://example.com', apiKey: 'key', apiSecret: 'secret' },
		{ url: 'wss://user:password@example.com', apiKey: 'key', apiSecret: 'secret' }
	])
		assert.throws(() => createMediaService(options));
	assert.throws(
		() =>
			createMediaService({
				url: 'wss://example.com',
				apiKey: 'key',
				apiSecret: 'secret',
				revokeTokens: 'true'
			}),
		/LIVEKIT_REVOKE_TOKENS/
	);
});

function fakeSDK({ cameraDenied = false, microphoneDenied = false, connectGate } = {}) {
	const events = Object.fromEntries(
		[
			'ParticipantConnected',
			'ParticipantDisconnected',
			'TrackSubscribed',
			'TrackUnsubscribed',
			'TrackMuted',
			'TrackUnmuted',
			'LocalTrackPublished',
			'LocalTrackUnpublished',
			'ConnectionQualityChanged',
			'ActiveSpeakersChanged',
			'AudioPlaybackStatusChanged',
			'TrackStreamStateChanged',
			'Reconnecting',
			'Reconnected',
			'Disconnected'
		].map((name) => [name, name])
	);
	const instances = [];
	class FakeRoom extends EventEmitter {
		constructor(options) {
			super();
			this.options = options;
			this.remoteParticipants = new Map();
			this.canPlaybackAudio = true;
			this.disconnects = 0;
			const publications = new Map();
			this.localParticipant = {
				identity: 'player',
				isSpeaking: false,
				connectionQuality: 'excellent',
				isCameraEnabled: false,
				isMicrophoneEnabled: false,
				trackPublications: publications,
				getTrackPublication: (source) => publications.get(source),
				setCameraEnabled: async (enabled) => device('camera', enabled, cameraDenied),
				setMicrophoneEnabled: async (enabled) => device('microphone', enabled, microphoneDenied)
			};
			const device = async (kind, enabled, denied) => {
				if (enabled && denied)
					throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
				const publication = publications.get(kind) || {
					track: {
						stopped: 0,
						stop() {
							this.stopped++;
						}
					}
				};
				publication.isMuted = !enabled;
				publications.set(kind, publication);
				this.localParticipant[kind === 'camera' ? 'isCameraEnabled' : 'isMicrophoneEnabled'] =
					enabled;
				return publication;
			};
			instances.push(this);
		}
		async connect() {
			await connectGate;
		}
		async disconnect() {
			this.disconnects++;
		}
		async startAudio() {
			this.canPlaybackAudio = true;
		}
	}
	return {
		sdk: {
			Room: FakeRoom,
			RoomEvent: events,
			Track: { Source: { Camera: 'camera', Microphone: 'microphone' } }
		},
		instances
	};
}
const credentials = () =>
	Promise.resolve({
		ok: true,
		url: 'ws://localhost:7880',
		token: 'test',
		identity: 'player',
		roomName: 'room'
	});

for (const denial of ['camera', 'microphone'])
	test(`${denial} denial leaves other media usable and reports a separate device error`, async () => {
		const { sdk } = fakeSDK({
			cameraDenied: denial === 'camera',
			microphoneDenied: denial === 'microphone'
		});
		const controller = new MediaController('room', 'player', credentials, async () => sdk);
		await controller.connect();
		assert.equal(controller.state.cameraOn, false);
		assert.equal(controller.state.microphoneOn, false);
		await controller.setDevice(denial, true);
		assert.match(controller.state[`${denial}Error`], /Permission denied/);
		const other = denial === 'camera' ? 'microphone' : 'camera';
		await controller.setDevice(other, true);
		assert.equal(controller.state[`${other}On`], true);
		assert.equal(controller.state.status, 'connected');
		controller.disconnect();
	});

test('Audio-only, mute, camera off, reconnect state, degraded quality and autoplay recovery remain separate', async () => {
	const { sdk, instances } = fakeSDK();
	const controller = new MediaController('room', 'player', credentials, async () => sdk);
	await controller.connect();
	await controller.setDevice('camera', true);
	await controller.audioOnly();
	assert.equal(controller.state.cameraOn, false);
	assert.equal(controller.state.microphoneOn, true);
	await controller.setDevice('microphone', false);
	assert.equal(controller.state.microphoneOn, false);
	instances[0].emit('Reconnecting');
	assert.equal(controller.state.status, 'reconnecting');
	instances[0].emit('Reconnected');
	assert.equal(controller.state.status, 'connected');
	instances[0].localParticipant.connectionQuality = 'poor';
	instances[0].emit('ConnectionQualityChanged');
	assert.equal(controller.state.participants[0].quality, 'poor');
	instances[0].canPlaybackAudio = false;
	instances[0].emit('AudioPlaybackStatusChanged');
	assert.equal(controller.state.audioBlocked, true);
	await controller.startAudio();
	assert.equal(controller.state.audioBlocked, false);
	controller.disconnect();
});

test('Disconnect stops tracks, clears participants and ignores stale device/room callbacks', async () => {
	const { sdk, instances } = fakeSDK();
	const controller = new MediaController('room', 'player', credentials, async () => sdk);
	await controller.connect();
	await controller.setDevice('camera', true);
	await controller.setDevice('microphone', true);
	const tracks = [...instances[0].localParticipant.trackPublications.values()].map((p) => p.track);
	controller.disconnect();
	assert.ok(tracks.every((track) => track.stopped === 1));
	assert.equal(controller.state.status, 'off');
	assert.deepEqual(controller.state.participants, []);
	instances[0].emit('Reconnected');
	assert.equal(controller.state.status, 'off');
	await controller.connect();
	assert.equal(instances.length, 2);
	controller.disconnect();
});

test('Leave during token/connect prevents late media resurrection; identity mismatch fails closed', async () => {
	let resolveToken;
	const gate = new Promise((resolve) => {
		resolveToken = resolve;
	});
	const { sdk, instances } = fakeSDK();
	const controller = new MediaController(
		'room',
		'player',
		() => gate,
		async () => sdk
	);
	const joining = controller.connect();
	controller.disconnect();
	resolveToken(await credentials());
	await joining;
	assert.equal(instances.length, 0);
	assert.equal(controller.state.status, 'off');
	let resolveConnect;
	const connectGate = new Promise((resolve) => {
		resolveConnect = resolve;
	});
	const delayed = fakeSDK({ connectGate });
	const next = new MediaController('room', 'player', credentials, async () => delayed.sdk);
	const pending = next.connect();
	await new Promise((resolve) => setImmediate(resolve));
	next.disconnect();
	resolveConnect();
	await pending;
	assert.equal(next.state.status, 'off');
	const mismatch = new MediaController('wrong-room', 'player', credentials, async () => sdk);
	await mismatch.connect();
	assert.equal(mismatch.state.status, 'error');
	assert.match(mismatch.state.error, /identity/);
});

test('Media outage clears tracks and can be retried without a game command', async () => {
	const { sdk, instances } = fakeSDK();
	const controller = new MediaController('room', 'player', credentials, async () => sdk);
	await controller.connect();
	await controller.setDevice('camera', true);
	instances[0].emit('Disconnected');
	assert.equal(controller.state.status, 'error');
	assert.equal(controller.state.cameraOn, false);
	await controller.connect();
	assert.equal(controller.state.status, 'connected');
	assert.equal(controller.state.cameraOn, false);
	controller.disconnect();
});

test('A device permission prompt resolving after leave stops its late track', async () => {
	const { sdk, instances } = fakeSDK();
	const controller = new MediaController('room', 'player', credentials, async () => sdk);
	await controller.connect();
	let release;
	const waiting = new Promise((resolve) => {
		release = resolve;
	});
	const track = {
		stopped: false,
		stop() {
			this.stopped = true;
		}
	};
	instances[0].localParticipant.setCameraEnabled = () => waiting;
	const request = controller.setDevice('camera', true);
	controller.disconnect();
	release({ track });
	await request;
	assert.equal(track.stopped, true);
	assert.equal(controller.state.status, 'off');
	assert.equal(controller.state.cameraOn, false);
});

test('Media element attachment detaches only its own element on replacement and teardown', () => {
	const attached = [],
		detached = [],
		element = { srcObject: 'old' };
	const track = { attach: (e) => attached.push(e), detach: (e) => detached.push(e) };
	const action = attachTrack(element, track);
	action.update(track);
	assert.equal(attached.length, 1);
	action.update(undefined);
	assert.deepEqual(detached, [element]);
	action.update(track);
	action.destroy();
	assert.equal(detached.length, 2);
	assert.equal(element.srcObject, null);
});
