import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import parser from 'socket.io-msgpack-parser';
import { createGameServer } from '../../server/index.mjs';
import { freshDeck } from '../../server/classic.mjs';
import { getVariant } from '../../server/variants/index.mjs';
import { freshRummyDeck } from '../../server/rummy/rummy.mjs';

const cardsPerPlayer = (rulesVersion) =>
	rulesVersion === '2-card-1' ? 2 : rulesVersion === '4-card-1' ? 4 : 3;

async function client(url, token) {
	const socket = io(url, {
		parser,
		autoConnect: false,
		reconnection: false,
		transports: ['websocket'],
		auth: token ? { token } : {}
	});
	const c = { socket, view: null, token, id: null };
	socket.on('roomData', (view) => {
		c.view = view;
	});
	await new Promise((resolve, reject) => {
		socket.once('connect_error', reject);
		socket.once('session', (session) => {
			c.token = session.token;
			c.id = session.playerId;
			resolve();
		});
		socket.connect();
	});
	c.send = (event, args = [], meta = {}) =>
		socket.timeout(2000).emitWithAck(event, ...args, {
			commandId: randomUUID(),
			expectedRevision: c.view?.revision,
			handId: c.view?.handId,
			...meta
		});
	return c;
}
async function setup(t, count = 2, options = {}, rulesVersion = 'classic-1') {
	const { autoReady = true, gameType = 'teen-patti', ...serverOptions } = options;
	const app = createGameServer({
		database: ':memory:',
		turnMs: 600000,
		roomCodeFactory: (requestedName) => requestedName,
		...serverOptions
	});
	const address = await app.listen(0);
	const url = `http://127.0.0.1:${address.port}`;
	const clients = [];
	t.after(async () => {
		for (const c of clients) c.socket.disconnect();
		await app.close();
	});
	for (let i = 0; i < count; i++) clients.push(await client(url));
	assert.equal(
		(await clients[0].send('createRoom', ['test-room', 50, rulesVersion, gameType])).ok,
		true
	);
	for (let i = 0; i < count; i++)
		assert.equal((await clients[i].send('joinRoom', [`Player ${i}`, 'test-room'])).ok, true);
	if (autoReady)
		for (const c of clients) {
			assert.equal((await c.send('ready', [true])).ok, true);
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	return { app, url, clients };
}
const pause = () => new Promise((r) => setTimeout(r, 30));
async function waitFor(predicate, timeoutMs = 2000) {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error('Timed out waiting for condition');
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

test('Texas Hold’em uses the shared room transport while keeping opponent hole cards private', async (t) => {
	const { app, clients } = await setup(t, 2, { gameType: 'texas-holdem' });
	assert.equal(app.store.room('test-room').gameType, 'texas-holdem');
	assert.equal((await clients[0].send('start', ['test-room', 0, 3, 'texas-holdem-1'])).ok, true);
	await pause();
	for (const c of clients) {
		const opponents = c.view.usersList.filter((p) => p.id !== c.id);
		assert.deepEqual(opponents[0].cardsInHand, [
			{ rank: 0, suit: '' },
			{ rank: 0, suit: '' }
		]);
	}
	for (let i = 0; i < 20 && !app.store.room('test-room').gameShow; i++) {
		const room = app.store.room('test-room');
		const actor = clients.find((c) => c.id === room.currentPlayerId);
		const actorState = room.players.find((p) => p.id === actor.id);
		const action = actorState.streetBet < room.currentBet ? 'call' : 'check';
		assert.equal((await actor.send('pokerAction', [action])).ok, true);
		await pause();
	}
	const finished = app.store.room('test-room');
	assert.equal(finished.gameShow, true);
	assert.equal(finished.board.length, 5);
	assert.equal(
		finished.players.reduce((sum, p) => sum + p.balance, 0),
		finished.issuedChips
	);
	for (const c of clients)
		assert.ok(c.view.usersList.find((p) => p.id === c.id).cardsInHand.length === 2);
});

test('Blackjack and Indian Rummy use the shared room transport and keep private cards isolated', async (t) => {
	const blackjack = await setup(t, 2, { gameType: 'blackjack' });
	assert.equal((await blackjack.clients[0].send('start', ['test-room'])).ok, true);
	await pause();
	for (const c of blackjack.clients) {
		const opponent = c.view.usersList.find((player) => player.id !== c.id);
		assert.ok(opponent.cardsInHand.every((card) => card.rank === 0));
		assert.equal(c.view.dealerCards[1].rank, 0);
	}
	const actor = blackjack.clients.find(
		(c) => c.id === blackjack.app.store.room('test-room').currentPlayerId
	);
	assert.equal((await actor.send('blackjackAction', ['stand'])).ok, true);
	const blackjackLedger = blackjack.app.store.db
		.prepare("SELECT entries FROM ledger WHERE room='test-room' ORDER BY id DESC LIMIT 1")
		.get();
	assert.equal(
		JSON.parse(blackjackLedger.entries).reduce((sum, entry) => sum + entry.delta, 0),
		0
	);

	const rummy = await setup(t, 2, {
		gameType: 'rummy',
		deckFactory: (gameType) => (gameType === 'rummy' ? freshRummyDeck() : freshDeck())
	});
	assert.equal((await rummy.clients[0].send('start', ['test-room'])).ok, true);
	await pause();
	for (const c of rummy.clients) {
		const opponent = c.view.usersList.find((player) => player.id !== c.id);
		assert.equal(opponent.cardsInHand.length, 13);
		assert.ok(opponent.cardsInHand.every((card) => card.rank === 0));
	}
	const rummyRoom = rummy.app.store.room('test-room');
	const turn = rummy.clients.find((c) => c.id === rummyRoom.currentPlayerId);
	assert.equal((await turn.send('rummyAction', ['draw-stock'])).ok, true);
	await pause();
	assert.equal(turn.view.usersList.find((player) => player.id === turn.id).cardsInHand.length, 14);
	const rummyLedger = rummy.app.store.db
		.prepare("SELECT entries FROM ledger WHERE room='test-room' ORDER BY id DESC LIMIT 1")
		.get();
	assert.equal(
		JSON.parse(rummyLedger.entries).reduce((sum, entry) => sum + entry.delta, 0),
		0
	);
});

test('Lobby cannot be started by the host until all connected players have confirmed readiness', async (t) => {
	const {
		clients: [host, guest]
	} = await setup(t, 2, { autoReady: false });
	assert.equal((await host.send('start', ['test-room', 0, 3])).ok, false);
	assert.equal((await host.send('ready', [true])).ok, true);
	await pause();
	assert.equal((await host.send('start', ['test-room', 0, 3])).ok, false);
	assert.equal((await guest.send('ready', [true])).ok, true);
	await pause();
	assert.equal((await host.send('start', ['test-room', 0, 3])).ok, true);
});

test('Random Teen Patti mode chooses a registered variant on the server and derives its card count', async (t) => {
	const { app, clients } = await setup(t, 2, {
		variantRandomInt: (_min, max) => max - 1
	});
	const [host] = clients;
	const started = await host.send('start', ['test-room', 0, 3, 'classic-1', 'random']);
	assert.equal(started.ok, true);
	const room = app.store.room('test-room');
	assert.equal(room.rulesVersion, 'discard-one-1'); // Last registered variant; deals four.
	assert.ok(room.players.every((player) => player.cards.length === 4));
});

test('Liveness remains separate from database readiness, and service shutdown is repeatable', async (t) => {
	const { app, url } = await setup(t, 2);
	assert.equal((await fetch(`${url}/health`)).status, 200);
	assert.deepEqual(await (await fetch(`${url}/ready`)).json(), { ok: true });
	const check = app.store.checkReadiness;
	app.store.checkReadiness = () => {
		throw new Error('private database error');
	};
	const unavailable = await fetch(`${url}/ready`);
	assert.equal(unavailable.status, 503);
	assert.deepEqual(await unavailable.json(), { ok: false });
	assert.equal((await fetch(`${url}/health`)).status, 200);
	app.store.checkReadiness = check;
	await app.close();
	await app.close();
});

test('Six media credentials use server-owned seats; outsiders, wrong rooms and departed players are denied', async (t) => {
	let now = 1000;
	const issued = [],
		removed = [];
	const media = {
		async issue(request) {
			issued.push(request);
			return {
				token: 'signed-test-token',
				url: 'ws://localhost:7880',
				identity: request.playerId,
				roomName: request.roomName
			};
		},
		async remove(...args) {
			removed.push(args);
		}
	};
	const { app, url, clients } = await setup(t, 6, { media, clock: () => now });
	const before = app.store.room('test-room');
	for (const c of clients) {
		const reply = await c.socket.timeout(1000).emitWithAck('mediaToken', 'test-room');
		assert.equal(reply.ok, true);
		assert.equal(reply.identity, c.id);
		assert.equal(reply.roomName, 'test-room');
	}
	assert.deepEqual(
		issued.map((p) => p.seatNumber),
		[0, 1, 2, 3, 4, 5]
	);
	assert.deepEqual(
		issued.map((p) => p.playerId),
		clients.map((c) => c.id)
	);
	assert.deepEqual(app.store.room('test-room'), before);
	const stranger = await client(url);
	t.after(() => stranger.socket.disconnect());
	assert.equal(
		(await stranger.socket.timeout(1000).emitWithAck('mediaToken', 'test-room')).code,
		'FORBIDDEN'
	);
	now += 3000;
	assert.equal(
		(await clients[0].socket.timeout(1000).emitWithAck('mediaToken', 'other-room')).code,
		'FORBIDDEN'
	);
	await clients[1].send('leaveRoom');
	now += 3000;
	assert.equal(
		(await clients[1].socket.timeout(1000).emitWithAck('mediaToken', 'test-room')).code,
		'FORBIDDEN'
	);
	await pause();
	assert.ok(removed.some(([room, id]) => room === 'test-room' && id === clients[1].id));
});

for (const reason of ['leave', 'takeover'])
	test(`Pending media token is fenced by ${reason}`, async (t) => {
		let release, started;
		const gate = new Promise((resolve) => {
				release = resolve;
			}),
			begin = new Promise((resolve) => {
				started = resolve;
			});
		const removed = [];
		const media = {
			async issue(request) {
				started();
				await gate;
				return {
					token: 'must-not-deliver',
					url: 'ws://localhost:7880',
					identity: request.playerId,
					roomName: request.roomName
				};
			},
			async remove(...args) {
				removed.push(args);
			}
		};
		const { clients, url } = await setup(t, 2, { media });
		const a = clients[0];
		const reply = a.socket
			.timeout(2000)
			.emitWithAck('mediaToken', 'test-room')
			.catch(() => ({ ok: false }));
		await begin;
		if (reason === 'leave') await a.send('leaveRoom');
		else {
			const replacement = await client(url, a.token);
			t.after(() => replacement.socket.disconnect());
		}
		release();
		const result = await reply;
		assert.equal(result.ok, false);
		assert.equal(result.token, undefined);
		await pause();
		assert.ok(removed.some(([, id]) => id === a.id));
	});

test('Media request failures/rate limits do not change a hand or prevent bets', async (t) => {
	let release, begin;
	const started = new Promise((resolve) => {
			begin = resolve;
		}),
		gate = new Promise((resolve) => {
			release = resolve;
		});
	const media = {
		async issue() {
			begin();
			await gate;
			throw new Error('injected media outage');
		},
		async remove() {}
	};
	const { app, clients } = await setup(t, 2, { media });
	const [a, b] = clients;
	await a.send('start', ['test-room', 0, 3]);
	const before = app.store.room('test-room');
	const pending = a.socket.timeout(2000).emitWithAck('mediaToken', 'test-room');
	await started;
	for (let i = 0; i < 3; i++)
		assert.equal(
			(await a.socket.timeout(1000).emitWithAck('mediaToken', 'test-room')).code,
			'RATE_LIMIT'
		);
	release();
	assert.equal((await pending).code, 'MEDIA_UNAVAILABLE');
	assert.deepEqual(app.store.room('test-room'), before);
	assert.equal((await b.send('play', [false, 1])).ok, true);
	assert.equal(app.store.room('test-room').pot, 3);
});

test('Unconfigured media returns a clear error without affecting the existing game', async (t) => {
	const { app, clients } = await setup(t, 2);
	const before = app.store.room('test-room');
	assert.equal(
		(await clients[0].socket.timeout(1000).emitWithAck('mediaToken', 'test-room')).code,
		'MEDIA_UNAVAILABLE'
	);
	assert.deepEqual(app.store.room('test-room'), before);
	assert.equal((await clients[0].send('start', ['test-room', 0, 3])).ok, true);
});

test('Concurrent next-hand variant choices commit once and cannot change an active hand', async (t) => {
	const { app, clients } = await setup(t, 2);
	const [a, b] = clients;
	const meta = { expectedRevision: a.view.revision, handId: a.view.handId };
	const replies = await Promise.all([
		a.send('start', ['test-room', 0, 3, 'muflis-1'], meta),
		a.send('start', ['test-room', 0, 3, 'classic-1'], meta)
	]);
	assert.equal(replies.filter((r) => r.ok).length, 1);
	assert.equal(replies.filter((r) => r.code === 'STALE_STATE').length, 1);
	const started = app.store.room('test-room');
	assert.equal(started.pot, 2);
	await pause();
	assert.equal((await a.send('start', ['test-room', 0, 3, 'classic-1'])).ok, false);
	await pause();
	assert.deepEqual(app.store.room('test-room'), started);
	await b.send('play', [true]);
	await pause();
	await a.send('ready', [true]);
	await pause();
	await b.send('ready', [true]);
	await pause();
	const other = started.rulesVersion === 'classic-1' ? 'muflis-1' : 'classic-1';
	assert.equal((await a.send('start', ['test-room', 0, 3, other])).ok, true);
	assert.equal(app.store.room('test-room').rulesVersion, other);
	assert.equal(app.store.room('test-room').issuedChips, 100);
});

test('Room variant is validated, creation retries are idempotent and joins cannot change it', async (t) => {
	const { app, clients } = await setup(t, 2);
	const [a, b] = clients;
	await a.send('leaveRoom');
	for (const version of [null, {}, 'muflis-2', '__proto__']) {
		const reply = await a.send('createRoom', ['invalid-room', 50, version]);
		assert.equal(reply.code, 'UNSUPPORTED_RULES');
		assert.equal(app.store.room('invalid-room'), null);
	}
	assert.equal((await a.send('createRoom', ['legacy-room', 50])).ok, true);
	assert.equal(app.store.room('legacy-room').rulesVersion, 'classic-1');
	const meta = { commandId: randomUUID() };
	assert.equal((await a.send('createRoom', ['muflis-room', 50, 'muflis-1'], meta)).ok, true);
	assert.equal((await a.send('createRoom', ['muflis-room', 50, 'muflis-1'], meta)).ok, true);
	assert.equal(
		(await a.send('createRoom', ['muflis-room', 50, 'classic-1'], meta)).code,
		'COMMAND_CONFLICT'
	);
	await a.send('joinRoom', ['A', 'muflis-room']);
	await b.send('leaveRoom');
	await b.send('joinRoom', ['B', 'muflis-room', 'classic-1']);
	assert.equal(b.view.rulesVersion, 'muflis-1');
	assert.equal((await b.send('start', ['muflis-room', 0, 3, 'classic-1'])).code, 'FORBIDDEN');
	await a.send('start', ['muflis-room', 0, 3]);
	assert.equal((await a.send('start', ['muflis-room', 0, 3, 'classic-1'])).ok, false);
	assert.equal(app.store.room('muflis-room').rulesVersion, 'muflis-1');
});

test('Production room creation issues a private random invite code and ignores the requested name', async (t) => {
	const app = createGameServer({ database: ':memory:', turnMs: 600000 });
	const address = await app.listen(0);
	const url = `http://127.0.0.1:${address.port}`;
	const host = await client(url);
	const guest = await client(url);
	t.after(async () => {
		host.socket.disconnect();
		guest.socket.disconnect();
		await app.close();
	});

	const created = await host.send('createRoom', ['guessable-name', 50]);
	assert.equal(created.ok, true);
	assert.match(created.roomName, /^[a-f0-9]{32}$/);
	assert.notEqual(created.roomName, 'guessable-name');
	assert.ok(app.store.room(created.roomName));
	assert.equal((await guest.send('joinRoom', ['Uninvited', 'guessable-name'])).ok, false);
	assert.equal(app.store.room('guessable-name'), null);
	const response = await fetch(`${url}/room/guessable-name`);
	assert.equal(response.status, 404);
});

for (const rulesVersion of [
	'classic-1',
	'muflis-1',
	'ak47-1',
	'joker-1',
	'lowest-joker-1',
	'999-1',
	'2-card-1',
	'4-card-1'
])
	test(`Real six-client transport isolates cards and HTTP never returns deck or player identities (${rulesVersion})`, async (t) => {
		const { url, clients } = await setup(t, 6, {}, rulesVersion);
		const a = clients[0];
		assert.equal(a.view.rulesVersion, rulesVersion);
		assert.equal((await a.send('start', ['test-room', 0, cardsPerPlayer(rulesVersion)])).ok, true);
		await pause();
		for (const c of clients)
			assert.ok(c.view.usersList.every((p) => p.cardsInHand.every((card) => card.rank === 0)));
		if (rulesVersion === 'joker-1')
			for (const c of clients) assert.deepEqual(c.view.variantState, a.view.variantState);
		const publicRoom = await (await fetch(`${url}/room/test-room`)).json();
		assert.deepEqual(
			Object.keys(publicRoom).sort(),
			['gameShow', 'isStarted', 'maxPlayers', 'name', 'playerCount'].sort()
		);
		assert.equal((await a.send('seeCards')).ok, true);
		await pause();
		assert.ok(a.view.usersList.find((p) => p.id === a.id).cardsInHand.every((c) => c.rank > 0));
		assert.ok(
			clients[1].view.usersList.find((p) => p.id === a.id).cardsInHand.every((c) => c.rank === 0)
		);
		const forged = await a.socket.timeout(1000).emitWithAck('confirmWin', a.id, 'test-room');
		assert.equal(forged.code, 'FORBIDDEN');
		assert.equal(a.view.result, null);
	});

test('Concurrent duplicate command debits once, payload reuse and stale/wrong-turn actions are rejected', async (t) => {
	const { app, clients } = await setup(t, 3);
	const [a, b, c] = clients;
	await a.send('start', ['test-room', 0, 3]);
	await pause();
	const meta = {
		commandId: randomUUID(),
		expectedRevision: b.view.revision,
		handId: b.view.handId
	};
	const results = await Promise.all([
		b.send('play', [false, 1], meta),
		b.send('play', [false, 1], meta)
	]);
	assert.ok(results.every((r) => r.ok));
	assert.equal(app.store.room('test-room').pot, 4);
	assert.equal(app.store.room('test-room').players.find((p) => p.id === b.id).balance, 48);
	assert.equal(app.store.room('test-room').players.find((p) => p.id === b.id).handBet, 2);
	assert.equal((await b.send('play', [false, 2], meta)).code, 'COMMAND_CONFLICT');
	assert.equal(
		(await c.send('play', [true], { expectedRevision: meta.expectedRevision, handId: meta.handId }))
			.code,
		'STALE_STATE'
	);
	assert.equal((await a.send('play', [false, 1])).code, 'OUT_OF_TURN');
	assert.equal(app.store.room('test-room').pot, 4);
});

test('Two different concurrent commands for one revision have one effect', async (t) => {
	const { app, clients } = await setup(t, 3);
	const [a, b] = clients;
	await a.send('start', ['test-room', 0, 3]);
	await pause();
	const meta = { expectedRevision: b.view.revision, handId: b.view.handId };
	const results = await Promise.all([
		b.send('play', [false, 1], meta),
		b.send('play', [true], meta)
	]);
	assert.equal(results.filter((r) => r.ok).length, 1);
	assert.equal(results.filter((r) => r.code === 'STALE_STATE').length, 1);
	assert.equal(app.store.room('test-room').revision, meta.expectedRevision + 1);
	assert.equal(app.store.room('test-room').pot, 4);
});

test('Active-room admission, membership, six-seat cap and host authorization', async (t) => {
	const { clients, url } = await setup(t, 6);
	const a = clients[0],
		b = clients[1];
	const stranger = await client(url);
	t.after(() => stranger.socket.disconnect());
	assert.equal((await stranger.send('joinRoom', ['Extra', 'test-room'])).ok, false);
	assert.equal((await b.send('start', ['test-room', 0, 3])).code, 'FORBIDDEN');
	await a.send('start', ['test-room', 0, 3]);
	assert.equal((await stranger.send('joinRoom', ['Extra', 'test-room'])).ok, false);
	assert.equal(
		(await stranger.socket.timeout(1000).emitWithAck('resumeRoom', 'test-room')).ok,
		false
	);
	assert.equal(stranger.view, null);
	assert.equal((await a.send('show', ['other-room'])).code, 'FORBIDDEN');
});

test('Session takeover fences old socket; resume keeps player, seat and private visibility', async (t) => {
	const { clients, url } = await setup(t, 2);
	const a = clients[0];
	await a.send('start', ['test-room', 0, 3]);
	await a.send('seeCards');
	const previous = a.view;
	const replacement = await client(url, a.token);
	t.after(() => replacement.socket.disconnect());
	assert.equal(replacement.id, a.id);
	assert.equal(
		(await replacement.socket.timeout(1000).emitWithAck('resumeRoom', 'test-room')).ok,
		true
	);
	await pause();
	assert.equal(a.socket.connected, false);
	assert.equal(
		replacement.view.usersList.find((p) => p.id === a.id).seatNumber,
		previous.usersList.find((p) => p.id === a.id).seatNumber
	);
	assert.deepEqual(
		replacement.view.usersList.find((p) => p.id === a.id).cardsInHand,
		previous.usersList.find((p) => p.id === a.id).cardsInHand
	);
	assert.ok(
		replacement.view.usersList.find((p) => p.id !== a.id).cardsInHand.every((c) => c.rank === 0)
	);
});

test('A host who resumes during the grace period keeps ownership', async (t) => {
	const { app, url, clients } = await setup(t, 3, { hostGraceMs: 100 });
	const [host] = clients;
	host.socket.disconnect();
	await pause();
	const recovered = await client(url, host.token);
	t.after(() => recovered.socket.disconnect());
	const resumed = await recovered.socket.timeout(1000).emitWithAck('resumeRoom', 'test-room');
	assert.equal(resumed.ok, true);
	await new Promise((resolve) => setTimeout(resolve, 120));
	assert.equal(app.store.room('test-room').hostId, host.id);
});

test('A permanently disconnected host passes ownership clockwise to a connected seated player', async (t) => {
	const { app, clients } = await setup(t, 3, { hostGraceMs: 60 });
	const [host, next] = clients;
	host.socket.disconnect();
	await waitFor(() => app.store.room('test-room').hostId === next.id);
	assert.equal(app.store.room('test-room').hostId, next.id);
	assert.equal(next.view.hostId, next.id);
	assert.equal(next.view.legalActions.start, true);
});

test('An explicit host leave during a hand transfers ownership immediately and keeps the hand running', async (t) => {
	const { app, clients } = await setup(t, 3);
	const [host, next] = clients;
	assert.equal((await host.send('start', ['test-room', 0, 3])).ok, true);
	await pause();
	assert.equal((await host.send('leaveRoom')).ok, true);
	assert.equal(app.store.room('test-room').hostId, next.id);
	assert.equal(app.store.room('test-room').isStarted, true);
});

for (const rulesVersion of [
	'classic-1',
	'muflis-1',
	'ak47-1',
	'joker-1',
	'lowest-joker-1',
	'999-1',
	'2-card-1',
	'4-card-1'
])
	test(`Durable restart restores same hand/session and an unacknowledged command cannot debit twice (${rulesVersion})`, async (t) => {
		const dir = await mkdtemp(path.join(tmpdir(), 'teenpatti-restart-'));
		const database = path.join(dir, 'game.sqlite');
		let app = createGameServer({
			database,
			turnMs: 600000,
			roomCodeFactory: (requestedName) => requestedName
		});
		let address = await app.listen(0);
		let url = `http://127.0.0.1:${address.port}`;
		const clients = [];
		t.after(async () => {
			for (const c of clients) c.socket.disconnect();
			await app.close();
			await rm(dir, { recursive: true, force: true });
		});
		const a = await client(url),
			b = await client(url);
		clients.push(a, b);
		await a.send('createRoom', ['test-room', 50, rulesVersion]);
		await a.send('joinRoom', ['A', 'test-room']);
		await b.send('joinRoom', ['B', 'test-room']);
		await a.send('ready', [true]);
		await pause();
		await b.send('ready', [true]);
		await pause();
		await a.send('start', ['test-room', 0, cardsPerPlayer(rulesVersion)]);
		await pause();
		const meta = {
			commandId: randomUUID(),
			expectedRevision: b.view.revision,
			handId: b.view.handId
		};
		await b.send('play', [false, 1], meta);
		const saved = app.store.room('test-room');
		a.socket.disconnect();
		b.socket.disconnect();
		await app.close();
		app = createGameServer({
			database,
			turnMs: 600000,
			roomCodeFactory: (requestedName) => requestedName
		});
		address = await app.listen(0);
		url = `http://127.0.0.1:${address.port}`;
		const restored = await client(url, b.token);
		clients.push(restored);
		await restored.socket.timeout(1000).emitWithAck('resumeRoom', 'test-room');
		assert.equal(restored.view.handId, saved.handId);
		assert.equal(restored.view.rulesVersion, rulesVersion);
		assert.deepEqual(restored.view.variantState, saved.variantState);
		assert.equal(restored.view.usersList.find((p) => p.id === b.id).balance, 48);
		assert.equal(restored.view.usersList.find((p) => p.id === b.id).handBet, 2);
		assert.equal((await restored.send('play', [false, 1], meta)).ok, true);
		assert.equal(app.store.room('test-room').pot, 3);
		assert.deepEqual(app.store.room('test-room').deck, saved.deck);
		const ledgers = app.store.db.prepare('SELECT entries FROM ledger').all();
		assert.ok(
			ledgers.every((row) => JSON.parse(row.entries).reduce((n, e) => n + e.delta, 0) === 0)
		);
	});

test('Timeout auto-packs and settles once, with no disclosure of the blind winner', async (t) => {
	let now = 1000;
	const { app, clients } = await setup(t, 2, { clock: () => now, turnMs: 100 });
	const a = clients[0];
	await a.send('start', ['test-room', 0, 3]);
	now = 1101;
	await new Promise((resolve) => setTimeout(resolve, 350));
	assert.equal(app.store.room('test-room').result.winnerId, a.id);
	assert.equal(app.store.room('test-room').pot, 0);
	assert.ok(a.view.usersList.every((p) => p.cardsInHand.every((c) => c.rank === 0)));
});

for (const rulesVersion of [
	'classic-1',
	'muflis-1',
	'ak47-1',
	'joker-1',
	'lowest-joker-1',
	'999-1',
	'2-card-1',
	'4-card-1'
])
	test(`Server comparison beats a client-picked wrong winner and settles exactly once (${rulesVersion})`, async (t) => {
		const handA = [
			{ rank: 4, suit: 'hearts' },
			{ rank: 5, suit: 'spades' },
			{ rank: 6, suit: 'hearts' },
			{ rank: 9, suit: 'diamonds' }
		];
		const handB = [
			{ rank: 6, suit: 'spades' },
			{ rank: 7, suit: 'hearts' },
			{ rank: 8, suit: 'clubs' },
			{ rank: 10, suit: 'diamonds' }
		];
		const count = cardsPerPlayer(rulesVersion);
		handA.length = count;
		handB.length = count;
		const prefix = handA.flatMap((c, i) => [c, handB[i]]);
		const keys = new Set(prefix.map((c) => `${c.rank}:${c.suit}`));
		const deck = [...prefix, ...freshDeck().filter((c) => !keys.has(`${c.rank}:${c.suit}`))];
		const { app, clients } = await setup(t, 2, { deckFactory: () => deck }, rulesVersion);
		const [a, b] = clients;
		await a.send('start', ['test-room', 0, count]);
		await pause();
		const meta = {
			commandId: randomUUID(),
			expectedRevision: b.view.revision,
			handId: b.view.handId
		};
		const replies = await Promise.all([
			b.send('show', ['test-room'], meta),
			b.send('show', ['test-room'], meta)
		]);
		assert.ok(replies.every((r) => r.ok));
		const room = app.store.room('test-room');
		const comparison = getVariant(rulesVersion).compareHands(handA, handB, room.variantState);
		const winner = comparison > 0 ? a : comparison < 0 ? b : a;
		assert.equal(room.result.winnerId, winner.id);
		if (rulesVersion === 'classic-1' || rulesVersion === 'muflis-1')
			assert.equal(
				room.players.find((p) => p.id === winner.id).balance,
				rulesVersion === 'classic-1' ? 51 : 52
			);
		else
			assert.ok(
				room.players.find((p) => p.id === winner.id).balance >
					room.players.find((p) => p.id !== winner.id).balance
			);
		const balancesAfterShow = room.players.map(({ id, balance }) => [id, balance]);
		assert.equal(
			room.players.reduce((n, p) => n + p.balance, 0),
			100
		);
		assert.equal((await b.send('show', ['test-room'])).ok, false);
		assert.deepEqual(
			app.store.room('test-room').players.map(({ id, balance }) => [id, balance]),
			balancesAfterShow
		);
	});

test('Untrusted browser origins and invalid session tokens are rejected', async (t) => {
	const { url } = await setup(t, 2);
	const res = await fetch(`${url}/room/test-room`, {
		headers: { Origin: 'https://untrusted.example' }
	});
	assert.equal(res.status, 403);
	await assert.rejects(() => client(url, 'a'.repeat(64)), /Invalid session/);
});

test('A failed ledger write rolls back room and receipt, allowing the same command to retry safely', async (t) => {
	const { app, clients } = await setup(t, 2);
	const [a, b] = clients;
	await a.send('start', ['test-room', 0, 3]);
	await pause();
	const before = app.store.room('test-room');
	const meta = {
		commandId: randomUUID(),
		expectedRevision: b.view.revision,
		handId: b.view.handId
	};
	app.store.db.exec(
		"CREATE TRIGGER fail_ledger BEFORE INSERT ON ledger BEGIN SELECT RAISE(ABORT,'test interruption'); END"
	);
	assert.equal((await b.send('play', [false, 1], meta)).code, 'SERVER_ERROR');
	assert.deepEqual(app.store.room('test-room'), before);
	assert.equal(app.store.receipt(b.id, meta.commandId), null);
	app.store.db.exec('DROP TRIGGER fail_ledger');
	assert.equal((await b.send('play', [false, 1], meta)).ok, true);
	assert.equal(app.store.room('test-room').pot, 3);
});

test('Unavailable storage returns safe errors and does not crash snapshot recovery', async (t) => {
	const { app, url, clients } = await setup(t, 2);
	const original = app.store.room.bind(app.store);
	app.store.room = () => {
		throw new Error('injected database read failure');
	};
	try {
		assert.equal((await clients[0].send('seeCards')).code, 'SERVER_ERROR');
		const unavailable = await fetch(`${url}/room/test-room`);
		assert.equal(unavailable.status, 503);
		assert.deepEqual(await unavailable.json(), { error: 'Room service unavailable' });
	} finally {
		app.store.room = original;
	}
	assert.equal(
		(await clients[0].socket.timeout(1000).emitWithAck('resumeRoom', 'test-room')).ok,
		true
	);
	assert.equal((await fetch(`${url}/health`)).status, 200);
});

test('An unsupported saved rules version fails closed without blocking other room timeouts', async (t) => {
	let now = 1000;
	const { app, clients } = await setup(t, 2, { clock: () => now, turnMs: 100 });
	await clients[0].send('start', ['test-room', 0, 3]);
	const original = app.store.rooms.bind(app.store);
	const unsupported = {
		...app.store.room('test-room'),
		name: 'unsupported-room',
		rulesVersion: 'classic-999'
	};
	// Put the unreadable saved hand first, independently of SQLite's row ordering.
	app.store.rooms = () => [unsupported, ...original()];
	now = 1101;
	await new Promise((resolve) => setTimeout(resolve, 350));
	assert.equal(app.store.room('test-room').result.winnerId, clients[0].id);
	assert.equal(app.store.room('test-room').pot, 0);
	assert.equal(unsupported.rulesVersion, 'classic-999');
	assert.equal(unsupported.result, null);
});
