import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseURL = process.env.CHAAL_CF_TEST_URL;
const origin = 'http://localhost:5173';

async function createSession() {
	const response = await fetch(`${baseURL}/session`, {
		method: 'POST',
		headers: { Origin: origin, 'Content-Type': 'application/json' },
		body: '{}'
	});
	assert.equal(response.status, 200);
	return response.json();
}

async function createRoom(session, commandId) {
	const body = {
		event: 'createRoom',
		args: ['', 50, 'classic-1', 'teen-patti'],
		meta: { commandId }
	};
	const response = await fetch(`${baseURL}/rooms`, {
		method: 'POST',
		headers: {
			Origin: origin,
			Authorization: `Bearer ${session.token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	return { response, result: await response.json(), body };
}

function openPlayer(session, roomName) {
	const url = new URL(`/socket/${roomName}`, baseURL);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	const ws = new WebSocket(url, ['chaal.v1', `chaal-auth.${session.token}`]);
	const pending = new Map();
	const waiters = [];
	const player = { ws, session, view: null };
	ws.addEventListener('message', (event) => {
		const packet = JSON.parse(event.data);
		if (packet.type === 'ack') {
			const callback = pending.get(packet.id);
			if (callback) {
				pending.delete(packet.id);
				callback(packet.result);
			}
		}
		if (packet.type === 'event') {
			if (packet.event === 'roomData') player.view = packet.args[0];
			for (const waiter of [...waiters]) if (waiter(packet)) waiters.splice(waiters.indexOf(waiter), 1);
		}
	});
	player.open = new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', () => reject(new Error('WebSocket failed to open')), { once: true });
	});
	player.waitFor = (predicate) => {
		if (predicate({ type: 'event', event: 'roomData', args: [player.view] })) return Promise.resolve(player.view);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('Timed out waiting for room state')), 8000);
			waiters.push((packet) => {
				if (!predicate(packet)) return false;
				clearTimeout(timer);
				resolve(packet.args?.[0]);
				return true;
			});
		});
	};
	player.send = (event, args = [], stateful = true) => {
		const id = randomUUID();
		const meta = {
			commandId: randomUUID(),
			...(stateful ? { expectedRevision: player.view?.revision, handId: player.view?.handId } : {})
		};
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`Timed out waiting for ${event}`));
			}, 8000);
			pending.set(id, (result) => {
				clearTimeout(timer);
				resolve(result);
			});
			ws.send(JSON.stringify({ type: 'event', id, event, args, meta }));
		});
	};
	return player;
}

test('Cloudflare room service keeps private state server-side and coordinates a live hand', async (t) => {
	assert.ok(baseURL, 'the test runner must set CHAAL_CF_TEST_URL');
	const [hostSession, guestSession] = await Promise.all([createSession(), createSession()]);
	assert.notEqual(hostSession.playerId, guestSession.playerId);
	assert.match(hostSession.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

	const createCommandId = randomUUID();
	const created = await createRoom(hostSession, createCommandId);
	assert.equal(created.response.status, 200);
	assert.equal(created.result.ok, true);
	assert.match(created.result.roomName, /^[a-f0-9]{32}$/);
	const replayed = await createRoom(hostSession, createCommandId);
	assert.equal(replayed.result.roomName, created.result.roomName);

	const preview = await fetch(`${baseURL}/room/${created.result.roomName}`, { headers: { Origin: origin } });
	assert.equal(preview.status, 200);
	const publicRoom = await preview.json();
	assert.deepEqual(Object.keys(publicRoom).sort(), ['gameShow', 'isStarted', 'maxPlayers', 'name', 'playerCount'].sort());
	assert.equal(publicRoom.playerCount, 0);

	const host = openPlayer(hostSession, created.result.roomName);
	const guest = openPlayer(guestSession, created.result.roomName);
	t.after(() => {
		host.ws.close();
		guest.ws.close();
	});
	await Promise.all([host.open, guest.open]);
	assert.equal(host.ws.protocol, 'chaal.v1');
	assert.equal(guest.ws.protocol, 'chaal.v1');

	const unjoined = await host.send('resumeRoom', [created.result.roomName], false);
	assert.equal(unjoined.ok, false);
	assert.equal(unjoined.code, 'NOT_MEMBER');
	assert.equal((await host.send('joinRoom', ['Host', created.result.roomName], false)).ok, true);
	await host.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.usersList?.length === 1);
	assert.equal((await guest.send('joinRoom', ['Guest', created.result.roomName], false)).ok, true);
	await Promise.all([
		host.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.usersList?.length === 2),
		guest.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.usersList?.length === 2)
	]);

	let ready = await host.send('ready', [true]);
	assert.equal(ready.ok, true);
	await Promise.all([
		host.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.revision === ready.revision),
		guest.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.revision === ready.revision)
	]);
	ready = await guest.send('ready', [true]);
	assert.equal(ready.ok, true);
	await Promise.all([
		host.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.revision === ready.revision),
		guest.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.revision === ready.revision)
	]);

	const started = await host.send('start', [created.result.roomName, 0, 3, 'classic-1', 'selected']);
	assert.equal(started.ok, true);
	await Promise.all([
		host.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.revision === started.revision),
		guest.waitFor((packet) => packet.event === 'roomData' && packet.args?.[0]?.revision === started.revision)
	]);
	for (const [viewer, opponent] of [[host, guest], [guest, host]]) {
		const opponentState = viewer.view.usersList.find((player) => player.id === opponent.session.playerId);
		assert.equal(opponentState.cardsInHand.length, 3);
		assert.ok(opponentState.cardsInHand.every((card) => card.rank === 0 && card.suit === ''));
	}
	const afterStart = await fetch(`${baseURL}/room/${created.result.roomName}`, { headers: { Origin: origin } });
	const publicAfterStart = await afterStart.json();
	assert.equal(publicAfterStart.isStarted, true);
	assert.equal('players' in publicAfterStart, false);
	assert.equal('deck' in publicAfterStart, false);
});

test('Cloudflare worker denies an untrusted origin and invalid session on game APIs', async () => {
	assert.ok(baseURL, 'the test runner must set CHAAL_CF_TEST_URL');
	const denied = await fetch(`${baseURL}/session`, {
		method: 'POST',
		headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
		body: '{}'
	});
	assert.equal(denied.status, 403);
	const invalid = await fetch(`${baseURL}/rooms`, {
		method: 'POST',
		headers: { Origin: origin, Authorization: 'Bearer forged-token', 'Content-Type': 'application/json' },
		body: JSON.stringify({ event: 'createRoom', args: ['', 50], meta: { commandId: randomUUID() } })
	});
	assert.equal(invalid.status, 401);
});

test('Cloudflare Durable Object seats exactly six players and keeps all opponent hands private', async (t) => {
	assert.ok(baseURL, 'the test runner must set CHAAL_CF_TEST_URL');
	const sessions = await Promise.all(Array.from({ length: 7 }, () => createSession()));
	const created = await createRoom(sessions[0], randomUUID());
	assert.equal(created.result.ok, true);
	const players = sessions.map((session) => openPlayer(session, created.result.roomName));
	t.after(() => players.forEach(({ ws }) => ws.close()));
	await Promise.all(players.map(({ open }) => open));

	for (const [index, player] of players.entries()) {
		const joined = await player.send('joinRoom', [`Friend ${index + 1}`, created.result.roomName], false);
		if (index < 6) assert.equal(joined.ok, true);
		else {
			assert.equal(joined.ok, false);
			assert.equal(joined.error, 'Room is full');
		}
	}
	const seatedPlayers = players.slice(0, 6);
	await Promise.all(seatedPlayers.map((player) => player.waitFor(
		(packet) => packet.event === 'roomData' && packet.args?.[0]?.usersList?.length === 6
	)));
	for (const [index, player] of seatedPlayers.entries()) {
		const ready = await player.send('ready', [true]);
		assert.equal(ready.ok, true);
		await Promise.all(seatedPlayers.map((seated) => seated.waitFor(
			(packet) => packet.event === 'roomData' && packet.args?.[0]?.revision === ready.revision
		)));
		assert.equal(index, player.view.usersList.find((user) => user.id === player.session.playerId).seatNumber);
	}

	const started = await seatedPlayers[0].send('start', [created.result.roomName, 0, 3, 'classic-1', 'selected']);
	assert.equal(started.ok, true);
	await Promise.all(seatedPlayers.map((player) => player.waitFor(
		(packet) => packet.event === 'roomData' && packet.args?.[0]?.revision === started.revision
	)));
	for (const viewer of seatedPlayers) {
		const opponents = viewer.view.usersList.filter((user) => user.id !== viewer.session.playerId);
		assert.equal(opponents.length, 5);
		assert.ok(opponents.every((opponent) => opponent.cardsInHand.every((card) => card.rank === 0 && card.suit === '')));
		assert.equal(viewer.view.usersList.find((user) => user.id === viewer.session.playerId).cardsInHand.length, 3);
	}
});
