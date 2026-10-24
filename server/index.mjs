import http from 'node:http';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import parser from 'socket.io-msgpack-parser';
import { Store } from './store.mjs';
import {
	newRoom,
	roomName,
	transition,
	projection,
	movements,
	playing,
	chipGiftText,
	nextHandChoice,
	GameError
} from './engine.mjs';
import { nextBotMove, botDue, pickBotName, botDelay, humansPresent, updateMinds } from './bots/runner.mjs';
import { CHARACTER_SEEDS } from './bots/characters.mjs';
import { runtimeStyle } from './bots/config.mjs';
import { shuffledDeck } from './classic.mjs';
import { createMediaService } from './media.mjs';
import { createGameRoom, listGameTypes } from './games/index.mjs';
import { freshRummyDeck } from './rummy/rummy.mjs';
import { getVariant, listVariants } from './variants/index.mjs';

const hash = (token) => createHash('sha256').update(token).digest('hex');
const uuid = (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const shuffle = (cards) => {
	const deck = structuredClone(cards);
	for (let i = deck.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
};
const productionDeck = (gameType) =>
	gameType === 'rummy' ? shuffle(freshRummyDeck()) : shuffledDeck();

export function createGameServer({
	database = 'data/teen-patti.sqlite',
	origins = [
		'http://127.0.0.1:5173',
		'http://localhost:5173',
		'http://127.0.0.1:5174',
		'http://localhost:5174'
	],
	turnMs = 60000,
	hostGraceMs = 30000,
	retentionSweepMs = 24 * 60 * 60 * 1000,
	deckFactory = productionDeck,
	variantRandomInt = randomInt,
	roomCodeFactory = () => randomBytes(16).toString('hex'),
	clock = Date.now,
	media = createMediaService()
} = {}) {
	if (!Number.isSafeInteger(turnMs) || turnMs < 100 || turnMs > 3600000)
		throw new Error('TURN_TIMEOUT_MS must be an integer from 100 to 3600000');
	if (!Number.isSafeInteger(hostGraceMs) || hostGraceMs < 1 || hostGraceMs > 3600000)
		throw new Error('HOST_GRACE_MS must be an integer from 1 to 3600000');
	if (
		!Number.isSafeInteger(retentionSweepMs) ||
		retentionSweepMs < 1000 ||
		retentionSweepMs > 30 * 24 * 60 * 60 * 1000
	)
		throw new Error('RETENTION_SWEEP_MS must be an integer from 1000 to 2592000000');
	if (
		!Array.isArray(origins) ||
		!origins.length ||
		origins.some((origin) => new URL(origin).origin !== origin)
	)
		throw new Error('Configure explicit allowed origins');
	const store = new Store(database, { clock });
	// Bot minds (server/bots/mind.mjs), per room, in memory: every commit is observed by the bots
	// at that table, as the Cloudflare room does with durable storage. Local play only, so minds
	// lost on a restart simply start again.
	const minds = new Map();
	const commitRoom = store.commit.bind(store);
	store.commit = (room, ...rest) => {
		const before = store.room(room.name);
		const out = commitRoom(room, ...rest);
		try {
			minds.set(room.name, updateMinds(minds.get(room.name), before, room));
		} catch (error) {
			console.error('Bot mind update failed:', error?.message ?? 'Error');
		}
		return out;
	};
	let closePromise;
	let closing = false;
	const connections = new Map();
	const admission = new Map();
	const mediaCleanup = new Map();
	const hostRecoveryTimers = new Map();
	function removeMedia(name, id) {
		if (!media || !name) return;
		const previous = mediaCleanup.get(id) || Promise.resolve();
		const pending = previous
			.then(() => media.remove(name, id))
			.catch(() => {
				console.error('Media participant cleanup failed');
			});
		mediaCleanup.set(id, pending);
		void pending.finally(() => {
			if (mediaCleanup.get(id) === pending) mediaCleanup.delete(id);
		});
	}
	const headers = {
		'Content-Type': 'application/json',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff'
	};
	const server = http.createServer((req, res) => {
		const origin = req.headers.origin;
		if (origin && !origins.includes(origin)) {
			res.writeHead(403, headers);
			res.end(JSON.stringify({ error: 'Origin not allowed' }));
			return;
		}
		if (origin) {
			res.setHeader('Access-Control-Allow-Origin', origin);
			res.setHeader('Vary', 'Origin');
		}
		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}
		if (req.method !== 'GET') {
			res.writeHead(405, headers);
			res.end(JSON.stringify({ error: 'Method not allowed' }));
			return;
		}
		let pathname;
		try {
			pathname = new URL(req.url, 'http://localhost').pathname;
		} catch {
			res.writeHead(400, headers);
			res.end(JSON.stringify({ error: 'Invalid request' }));
			return;
		}
		if (pathname === '/health') {
			res.writeHead(200, headers);
			res.end(JSON.stringify({ ok: true }));
			return;
		}
		if (pathname === '/ready') {
			try {
				const ready = store.checkReadiness();
				res.writeHead(ready ? 200 : 503, headers);
				res.end(JSON.stringify({ ok: ready }));
			} catch {
				res.writeHead(503, headers);
				res.end(JSON.stringify({ ok: false }));
			}
			return;
		}
		try {
			const match = /^\/room\/([^/]+)$/.exec(pathname);
			if (!match) {
				res.writeHead(404, headers);
				res.end(JSON.stringify({ error: 'Not found' }));
				return;
			}
			const name = roomName(decodeURIComponent(match[1]));
			const room = store.room(name);
			if (!room) {
				res.writeHead(404, headers);
				res.end(JSON.stringify({ error: 'Room not found, create room instead' }));
				return;
			}
			// Explicit allowlist: no spread of a stored room, deck, cards, balances or identities.
			res.writeHead(200, headers);
			res.end(
				JSON.stringify({
					name: room.name,
					isStarted: playing(room),
					gameShow: room.gameShow,
					playerCount: room.players.filter((p) => p.seatNumber !== null && !p.departed).length,
					maxPlayers: 6
				})
			);
		} catch (error) {
			const invalid = error instanceof GameError || error instanceof URIError;
			res.writeHead(invalid ? 400 : 503, headers);
			res.end(
				JSON.stringify({ error: invalid ? 'Invalid room name' : 'Room service unavailable' })
			);
		}
	});
	const io = new Server(server, {
		parser,
		maxHttpBufferSize: 16384,
		cors: { origin: origins },
		allowRequest: (req, done) =>
			done(null, !req.headers.origin || origins.includes(req.headers.origin))
	});
	io.use((socket, next) => {
		try {
			const address = socket.handshake.address;
			const now = clock();
			const limit = admission.get(address);
			if (!limit || now - limit.since > 60000) admission.set(address, { since: now, count: 1 });
			else if (++limit.count > 120) throw new GameError('Too many connections', 'RATE_LIMIT');
			if (admission.size > 10000)
				for (const [key, value] of admission) if (now - value.since > 60000) admission.delete(key);
			let token = socket.handshake.auth?.token;
			let playerId;
			if (token !== undefined) {
				if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
					throw new GameError('Invalid session', 'INVALID_SESSION');
				playerId = store.session(hash(token));
				if (!playerId) throw new GameError('Invalid session', 'INVALID_SESSION');
			} else {
				token = randomBytes(32).toString('hex');
				playerId = randomUUID();
				store.createSession(hash(token), playerId);
			}
			socket.data.playerId = playerId;
			socket.data.token = token;
			next();
		} catch (error) {
			const failure = new Error(error instanceof GameError ? error.message : 'Session unavailable');
			failure.data = { code: error.code || 'SERVER_ERROR' };
			next(failure);
		}
	});
	const connected = (name) =>
		new Set(
			[...connections].filter(([, socket]) => socket.data.roomName === name).map(([id]) => id)
		);
	function cleanupRetention() {
		const connectedRooms = new Set(
			[...connections.values()].map((socket) => socket.data.roomName).filter(Boolean)
		);
		return store.cleanupRetention({ now: clock(), connectedRooms });
	}
	function cancelHostRecovery(name, hostId) {
		const recovery = hostRecoveryTimers.get(name);
		if (recovery && (hostId === undefined || recovery.hostId === hostId)) {
			clearTimeout(recovery.timer);
			hostRecoveryTimers.delete(name);
		}
	}
	function scheduleHostRecovery(room) {
		if (closing || !room.hostId) return;
		const existing = hostRecoveryTimers.get(room.name);
		if (existing?.hostId === room.hostId) return;
		cancelHostRecovery(room.name);
		const hostId = room.hostId;
		const timer = setTimeout(() => {
			if (closing) return;
			if (hostRecoveryTimers.get(room.name)?.timer !== timer) return;
			hostRecoveryTimers.delete(room.name);
			try {
				const before = store.room(room.name);
				if (!before || before.hostId !== hostId || connected(room.name).has(hostId)) return;
				const seatedPlayers = before.players
					.filter((player) => player.seatNumber !== null && !player.departed)
					.sort((a, b) => a.seatNumber - b.seatNumber);
				const hostSeat = seatedPlayers.find((player) => player.id === hostId)?.seatNumber ?? -1;
				const activeConnections = connected(room.name);
				const candidates = seatedPlayers.filter(
					(player) => player.id !== hostId && activeConnections.has(player.id)
				);
				const nextHost = candidates.find((player) => player.seatNumber > hostSeat) ?? candidates[0];
				if (!nextHost) return;

				const next = { ...before, hostId: nextHost.id, revision: before.revision + 1 };
				const commandId = randomUUID();
				store.commit(
					next,
					hostId,
					commandId,
					hash(
						JSON.stringify({
							event: 'hostRecovery',
							room: room.name,
							hostId,
							nextHost: nextHost.id
						})
					),
					{ ok: true, roomName: room.name, revision: next.revision, handId: next.handId },
					null,
					before.revision
				);
				publish(room.name, `${nextHost.username} is now the room host`);
			} catch (error) {
				console.error('Host recovery failed:', error.code || error.name);
			}
		}, hostGraceMs);
		timer.unref();
		hostRecoveryTimers.set(room.name, { hostId, timer });
	}
	function emitView(socket, name) {
		try {
			const room = store.room(name);
			if (room) socket.emit('roomData', projection(room, socket.data.playerId, connected(name)));
		} catch (error) {
			if (!(error instanceof GameError))
				console.error('Snapshot unavailable:', error.code || error.name);
		}
	}
	function publish(name, text) {
		for (const socket of connections.values())
			if (socket.data.roomName === name) {
				emitView(socket, name);
				if (text) socket.emit('message', { text });
			}
	}
	function execute(socket, event, args, meta) {
		const id = socket.data.playerId;
		if (connections.get(id) !== socket)
			throw new GameError('This connection was replaced', 'REPLACED');
		if (!meta || !uuid(meta.commandId))
			throw new GameError('A command ID is required', 'BAD_COMMAND');
		const fingerprint = hash(
			JSON.stringify({ event, args, revision: meta.expectedRevision, handId: meta.handId })
		);
		const prior = store.receipt(id, meta.commandId);
		if (prior) {
			if (prior.fingerprint !== fingerprint)
				throw new GameError('Command ID reused with different content', 'COMMAND_CONFLICT');
			if (event === 'joinRoom') socket.data.roomName = args[1];
			emitView(socket, prior.result.roomName);
			return prior.result;
		}
		let room, before, action, payload, text;
		if (event === 'createRoom') {
			const [requestedName, table, rulesVersion, requestedGameType, options] = args;
			const gameType = requestedGameType ?? 'teen-patti';
			if (!listGameTypes().includes(gameType))
				throw new GameError('Unsupported game type', 'UNSUPPORTED_GAME');
			if (socket.data.roomName)
				throw new GameError('Leave your current room before creating another');
			// Room IDs are invite secrets. Never let a client choose a short or guessable ID.
			const name = roomCodeFactory(requestedName);
			roomName(name);
			if (store.room(name)) throw new GameError('Room already exists');
			if (store.db.prepare('SELECT count(*) AS count FROM rooms').get().count >= 1000)
				throw new GameError('Room capacity reached');
			room =
				gameType === 'teen-patti'
					? newRoom(name, table, id, rulesVersion, options)
					: createGameRoom(gameType, name, table, id);
			room.revision = 1;
			text = `A new Room is created :- "${name}"`;
		} else {
			const name = event === 'joinRoom' ? args[1] : socket.data.roomName;
			roomName(name);
			before = store.room(name);
			if (!before) throw new GameError('Room not found');
			if (event === 'joinRoom') {
				if (socket.data.roomName && socket.data.roomName !== name)
					throw new GameError('Leave your current room first');
				action = 'join';
				payload = { username: args[0] };
				text =
					before.gameType && before.gameType !== 'teen-patti'
						? null
						: `${args[0]} has joined the Game`;
			} else {
				if ((event === 'start' || event === 'show') && args[0] !== name)
					throw new GameError('Wrong room', 'FORBIDDEN');
				if (meta.expectedRevision !== before.revision || meta.handId !== before.handId)
					throw new GameError(
						'Game state changed; review your current turn and try again',
						'STALE_STATE'
					);
				if (event === 'start') {
					action = 'start';
					if (before.gameType === 'texas-holdem') {
						payload = { cutAt: args[1], cardsToDeal: args[2], rulesVersion: args[3] };
					} else if (!before.gameType || before.gameType === 'teen-patti') {
						const picked = before.upNext
							? { mode: 'selected', rulesVersion: before.upNext.rulesVersion }
							: nextHandChoice(before, clock());
					const mode = picked?.mode ?? args[4] ?? 'selected';
						if (mode !== 'selected' && mode !== 'random')
							throw new GameError('Choose a variant or random mode', 'INVALID_ACTION');
						const availableVariants = listVariants();
						const rulesVersion =
							mode === 'random'
								? availableVariants[variantRandomInt(0, availableVariants.length)].rulesVersion
								: (picked?.rulesVersion ?? args[3] ?? before.rulesVersion);
						const variant = getVariant(rulesVersion);
						if (!variant)
							throw new GameError('Unsupported game rules version', 'UNSUPPORTED_RULES');
						payload = {
							cutAt: args[1],
							cardsToDeal: variant.cardsPerPlayer ?? 3,
							rulesVersion
						};
					} else payload = {};
					text = 'Game started';
				} else if (event === 'ready') {
					action = 'ready';
					payload = { ready: args[0] };
					text =
						before.gameType && before.gameType !== 'teen-patti'
							? null
							: args[0]
								? 'Player is ready'
								: 'Player is not ready';
				} else if (event === 'seeCards') {
					action = 'see';
					payload = {};
					text = 'Cards seen';
				} else if (event === 'addBot') {
					action = 'addBot';
					payload = {
						botId: `bot-${randomUUID()}`,
						...(['easy', 'normal', 'hard'].includes(args[0]) ? {name: pickBotName(before, Math.random), level: args[0]} : (() => {
							const character = CHARACTER_SEEDS.find(seed => seed.bot._id === args[0]);
							if (!character) throw new GameError('Choose a bot character');
							return {name: character.bot.name, level: 'normal', mascotId: character.bot.avatar.mascotId, style: {...runtimeStyle(character.style), status: 'published'}};
						})())
					};
					text = null;
				} else if (event === 'setPotLimit') {
					action = 'setPotLimit';
					payload = { potLimit: args[0] };
					text = null;
				} else if (event === 'setBalanceHidden') {
					action = 'setBalanceHidden';
					payload = { hidden: args[0] };
					text = null;
				} else if (event === 'openPick') {
					action = 'openPick';
					payload = {};
					text = null;
				} else if (event === 'prepareStart') {
	action = 'prepareStart';
	payload = { rulesVersion: args[0] };
	text = null;
} else if (event === 'cutDeck') {
	action = 'cutDeck';
	payload = { at: args[0] };
	text = null;
} else if (event === 'tableAction') {
					// A move on the table cards: open a mat card, lock a line, make a joker.
					if (!args[0] || typeof args[0] !== 'object' || Array.isArray(args[0]))
						throw new GameError('Invalid table move');
					action = 'table';
					payload = args[0];
					text = null;
				} else if (event === 'chooseNext') {
					action = 'chooseNext';
					payload = { choice: args[0] };
					text = null;
				} else if (event === 'showCards') {
					action = 'reveal';
					payload = {};
					text = null;
				} else if (event === 'requestChips') {
					action = 'requestChips';
					payload = { to: args[0], amount: args[1] };
					text = null;
				} else if (event === 'cancelChipRequest') {
					action = 'cancelChipRequest';
					payload = {};
					text = null;
				} else if (event === 'answerChipRequest') {
					action = 'answerChipRequest';
					payload = { from: args[0], accept: args[1] };
					text = chipGiftText(before, args[0], id, args[1]);
				} else if (event === 'removeBot') {
					action = 'removeBot';
					payload = { botId: args[0] };
					text = null;
				} else if (event === 'discardCard') {
					action = 'discard';
					payload = { index: args[0] };
					text = null;
				} else if (event === 'play') {
					if (typeof args[0] !== 'boolean') throw new GameError('Invalid play action');
					action = args[0] ? 'pack' : 'bet';
					payload = { amount: args[1] };
					text = args[0] ? 'Player packed' : 'Bet accepted';
				} else if (event === 'show') {
					action = 'show';
					payload = { declare: args[1] };
				} else if (event === 'pokerAction') {
					if (before.gameType !== 'texas-holdem')
						throw new GameError('Poker action sent to a Teen Patti room', 'INVALID_ACTION');
					if (!['fold', 'check', 'call', 'raise'].includes(args[0]))
						throw new GameError('Unknown Poker action');
					action = args[0];
					payload = { amount: args[1] };
					text = null;
				} else if (event === 'blackjackBet') {
					if (before.gameType !== 'blackjack')
						throw new GameError('Blackjack wager sent to another game', 'INVALID_ACTION');
					action = 'bet';
					payload = { amount: args[0] };
					text = null;
				} else if (event === 'blackjackAction') {
					if (before.gameType !== 'blackjack' || !['hit', 'stand', 'double'].includes(args[0]))
						throw new GameError('Invalid Blackjack action', 'INVALID_ACTION');
					action = args[0];
					payload = {};
					text = null;
				} else if (event === 'rummyAction') {
					if (
						before.gameType !== 'rummy' ||
						!['draw-stock', 'draw-discard', 'discard', 'declare'].includes(args[0])
					)
						throw new GameError('Invalid Rummy action', 'INVALID_ACTION');
					action = args[0];
					payload = { index: args[1] };
					text = null;
				} else if (event === 'leaveRoom') {
					action = 'leave';
					payload = {};
					text = 'Player left';
				} else throw new GameError('Unknown action');
			}
			room = transition(before, id, action, payload, {
				now: clock(),
				turnMs,
				handId: randomUUID(),
				deck: action === 'start' ? deckFactory(before?.gameType ?? 'teen-patti') : undefined,
				recycledDeck:
					before?.gameType === 'rummy' && before.deck.length === 0 && before.discardPile.length > 1
						? shuffle(before.discardPile.slice(0, -1))
						: undefined,
				connected: connected(name),
				requireReady: true
			});
		}
		const result = { ok: true, roomName: room.name, revision: room.revision, handId: room.handId };
		store.commit(
			room,
			id,
			meta.commandId,
			fingerprint,
			result,
			movements(before, room, event),
			before?.revision ?? null
		);
		if (event === 'joinRoom') socket.data.roomName = room.name;
		if (event === 'leaveRoom') {
			removeMedia(room.name, id);
			socket.data.roomName = undefined;
		}
		if (room.result && room.result.handId !== before?.result?.handId)
			text = `${room.result.winnerName} won ${room.result.amount} chips`;
		publish(room.name, text);
		return result;
	}
	io.on('connection', (socket) => {
		const id = socket.data.playerId;
		const previous = connections.get(id);
		connections.set(id, socket);
		if (previous) {
			removeMedia(previous.data.roomName, id);
			previous.emit('sessionReplaced');
			previous.disconnect(true);
		}
		socket.emit('session', { token: socket.data.token, playerId: id });
		delete socket.data.token;
		let count = 0,
			since = clock();
		let mediaBusy = false,
			mediaLastRequest = -Infinity;
		socket.on('mediaToken', async (name, ack) => {
			if (typeof ack !== 'function') return;
			if (mediaBusy || clock() - mediaLastRequest < 2000) {
				ack({ ok: false, code: 'RATE_LIMIT', error: 'Wait before retrying media' });
				return;
			}
			mediaBusy = true;
			mediaLastRequest = clock();
			try {
				const member = () => {
					if (connections.get(id) !== socket || socket.data.roomName !== name)
						throw new GameError('Join this game room before media', 'FORBIDDEN');
					roomName(name);
					const room = store.room(name);
					const player = room?.players.find(
						(p) => p.id === id && p.seatNumber !== null && !p.departed
					);
					if (!player) throw new GameError('No active seat in this room', 'FORBIDDEN');
					return player;
				};
				member();
				if (!media)
					throw new GameError(
						'Camera and audio are not configured. You can keep playing.',
						'MEDIA_UNAVAILABLE'
					);
				await mediaCleanup.get(id);
				const player = member();
				const result = await media.issue({
					roomName: name,
					playerId: id,
					username: player.username,
					seatNumber: player.seatNumber
				});
				member(); // Recheck after the network request: leave/takeover must fence a pending token.
				ack({ ok: true, ...result });
			} catch (error) {
				ack({
					ok: false,
					code: error instanceof GameError ? error.code : 'MEDIA_UNAVAILABLE',
					error:
						error instanceof GameError
							? error.message
							: 'Media service unavailable. You can keep playing.'
				});
			} finally {
				mediaBusy = false;
			}
		});
		for (const event of [
			'createRoom',
			'joinRoom',
			'ready',
			'start',
			'seeCards',
			'discardCard',
			'addBot',
			'removeBot',
			'setPotLimit',
			'setBalanceHidden',
			'showCards',
			'chooseNext',
			'openPick',
'tableAction',
'prepareStart',
'cutDeck',
			'requestChips',
			'cancelChipRequest',
			'answerChipRequest',
			'play',
			'pokerAction',
			'blackjackBet',
			'blackjackAction',
			'rummyAction',
			'show',
			'leaveRoom'
		]) {
			socket.on(event, (...input) => {
				const ack = typeof input.at(-1) === 'function' ? input.pop() : null;
				const meta = input.pop();
				try {
					if (clock() - since > 60000) {
						count = 0;
						since = clock();
					}
					if (++count > 180) throw new GameError('Too many actions', 'RATE_LIMIT');
					const result = execute(socket, event, input, meta);
					ack?.(result);
				} catch (error) {
					if (!(error instanceof GameError))
						console.error('Game command failed:', error.code || error.name);
					const result = {
						ok: false,
						code: error instanceof GameError ? error.code : 'SERVER_ERROR',
						error: error instanceof GameError ? error.message : 'Game service unavailable'
					};
					if (ack) ack(result);
					else socket.emit('error', { message: result.error });
					if (socket.data.roomName) emitView(socket, socket.data.roomName);
				}
			});
		}
		socket.on('resumeRoom', (name, ack) => {
			if (typeof ack !== 'function') return;
			try {
				if (clock() - since > 60000) {
					count = 0;
					since = clock();
				}
				if (++count > 180) throw new GameError('Too many actions', 'RATE_LIMIT');
				if (connections.get(id) !== socket) throw new GameError('Connection replaced');
				roomName(name);
				const room = store.room(name);
				if (!room) throw new GameError('Room not found');
				const view = projection(room, id, connected(name));
				if (socket.data.roomName && socket.data.roomName !== name)
					throw new GameError('Leave your current room first');
				socket.data.roomName = name;
				if (room.hostId === id) cancelHostRecovery(name, id);
				else if (room.hostId && !connected(name).has(room.hostId)) scheduleHostRecovery(room);
				socket.emit('roomData', view);
				publish(name);
				ack({ ok: true });
			} catch (error) {
				ack({ ok: false, code: error.code || 'NOT_MEMBER', error: 'No seat to resume' });
			}
		});
		socket.on('confirmWin', (...args) => {
			const ack = args.at(-1);
			if (typeof ack === 'function')
				ack({ ok: false, code: 'FORBIDDEN', error: 'Winners are calculated by the server' });
		});
		socket.on('disconnect', () => {
			if (connections.get(id) !== socket) return;
			removeMedia(socket.data.roomName, id);
			connections.delete(id);
			if (socket.data.roomName) {
				const room = store.room(socket.data.roomName);
				if (room?.hostId === id) scheduleHostRecovery(room);
				publish(socket.data.roomName);
			}
		});
	});
	try {
		const removed = cleanupRetention();
		if (Object.values(removed).some((count) => count > 0))
			console.info('Retention cleanup completed', removed);
	} catch (error) {
		console.error('Retention cleanup failed:', error.code || error.name);
	}
	// Bots: one planned move per room revision, played after a human-like pause.
	const botPlans = new Map();
	function runBots(before) {
		const live = connected(before.name);
		const due = humansPresent(before, live) ? botDue(before, live) : null;
		const plan = botPlans.get(before.name);
		if (!due) {
			botPlans.delete(before.name);
			return;
		}
		if (plan?.revision !== before.revision) {
			const quick = plan?.botId === due && plan?.handId === before.handId;
			botPlans.set(before.name, {
				revision: before.revision,
				handId: before.handId,
				botId: due,
				at: clock() + botDelay(Math.random, quick)
			});
			return;
		}
		if (plan.at > clock()) return;
		const move = nextBotMove(before, live, Math.random, { minds: minds.get(before.name) });
		if (!move) return;
		const room = transition(before, move.botId, move.action, move.payload, {
			now: clock(),
			turnMs,
			connected: live
		});
		const commandId = `bot:${before.handId}:${before.revision}`;
		store.commit(
			room,
			move.botId,
			commandId,
			commandId,
			{ ok: true },
			movements(before, room, `bot-${move.action}`),
			before.revision
		);
		publish(
			room.name,
			room.result && !before.result
				? `${room.result.winnerName} won ${room.result.amount} chips`
				: null
		);
	}
	const timer = setInterval(() => {
		try {
			for (const before of store.rooms()) {
				try {
					runBots(before);
				} catch (error) {
					console.error('Bot move failed:', error.code || error.name);
				}
				try {
					if (!playing(before) || before.deadline > clock()) continue;
					const commandId = `timeout:${before.handId}:${before.revision}`;
					const room = transition(
						before,
						before.currentPlayerId,
						'timeout',
						{},
						{
							now: clock(),
							turnMs,
							connected: connected(before.name),
							recycledDeck:
								before.gameType === 'rummy' &&
								before.deck.length === 0 &&
								before.discardPile.length > 1
									? shuffle(before.discardPile.slice(0, -1))
									: undefined
						}
					);
					store.commit(
						room,
						before.currentPlayerId,
						commandId,
						commandId,
						{ ok: true },
						movements(before, room, 'timeout'),
						before.revision
					);
					publish(
						room.name,
						room.result
							? `${room.result.winnerName} won ${room.result.amount} chips`
							: 'Turn timed out; player packed'
					);
				} catch (error) {
					// One unsupported/corrupt saved hand must not stall other rooms' turns.
					console.error('Room turn recovery failed:', error.code || error.name);
				}
			}
		} catch (error) {
			console.error('Turn recovery failed:', error.code || error.name);
		}
	}, 250);
	timer.unref();
	const retentionTimer = setInterval(() => {
		try {
			const removed = cleanupRetention();
			if (Object.values(removed).some((count) => count > 0))
				console.info('Retention cleanup completed', removed);
		} catch (error) {
			console.error('Retention cleanup failed:', error.code || error.name);
		}
	}, retentionSweepMs);
	retentionTimer.unref();
	return {
		server,
		io,
		store,
		cleanupRetention,
		async listen(port = 8080, host = '127.0.0.1') {
			await new Promise((resolve, reject) => {
				server.once('error', reject);
				server.listen(port, host, resolve);
			});
			return server.address();
		},
		close() {
			if (!closePromise) {
				closing = true;
				clearInterval(timer);
				clearInterval(retentionTimer);
				for (const recovery of hostRecoveryTimers.values()) clearTimeout(recovery.timer);
				hostRecoveryTimers.clear();
				closePromise = new Promise((resolve, reject) => {
					io.close(() => {
						Promise.all([...mediaCleanup.values()]).then(() => {
							try {
								store.close();
								resolve();
							} catch (error) {
								reject(error);
							}
						}, reject);
					});
				});
			}
			return closePromise;
		}
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	// This server has no club sign-in. Production runs on the Cloudflare Worker only.
	if (process.env.NODE_ENV === 'production') {
		console.error('The Node game server is for local tests only; the private club runs on Cloudflare.');
		process.exit(1);
	}
	process.umask(0o077);
	const app = createGameServer({
		database: process.env.GAME_DATABASE || 'data/teen-patti.sqlite',
		origins: process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()),
		turnMs: Number(process.env.TURN_TIMEOUT_MS || 60000),
		hostGraceMs: Number(process.env.HOST_GRACE_MS || 30000),
		retentionSweepMs: Number(process.env.RETENTION_SWEEP_MS || 86400000),
		media: createMediaService({
			url: process.env.LIVEKIT_URL,
			apiKey: process.env.LIVEKIT_API_KEY,
			apiSecret: process.env.LIVEKIT_API_SECRET,
			revokeTokens: process.env.LIVEKIT_REVOKE_TOKENS === 'true'
		})
	});
	const address = await app.listen(
		Number(process.env.PORT || 8080),
		process.env.HOST || '127.0.0.1'
	);
	console.log(`Teen Patti game service listening on http://${address.address}:${address.port}`);
	for (const signal of ['SIGINT', 'SIGTERM'])
		process.once(signal, async () => {
			await app.close();
			process.exit(0);
		});
}
