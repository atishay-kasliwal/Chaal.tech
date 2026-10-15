/* global WebSocketPair */

import { createGameRoom, listGameTypes } from '../games/index.mjs';
import { newRoom, roomName, transition, projection, movements, playing, GameError } from '../engine.mjs';
import { shuffledDeck } from '../classic.mjs';
import { freshRummyDeck } from '../rummy/rummy.mjs';
import { getVariant, listVariants } from '../variants/index.mjs';
import { secureRandomInt, toHex } from '../random.mjs';
import { inviteEmails, planInvites, inviteMessage, sendWithResend } from './invites.mjs';
import { nextBotMove, botDue, pickBotName, botDelay, humansPresent, botMoveText } from '../bots/runner.mjs';

const secureRandom = () => secureRandomInt(0x1_0000_0000) / 0x1_0000_0000;

/** Seats at every table; the engine allows seat numbers 0–5. */
const MAX_PLAYERS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const SMALL_ROOM_RETENTION_MS = 30 * DAY_MS;
const ROOM_RETENTION_MS = 365 * DAY_MS;
const UUID_PATTERN = /^[a-f0-9-]{36}$/;
const knownEvents = new Set([
	'joinRoom', 'ready', 'start', 'seeCards', 'discardCard', 'play', 'show', 'pokerAction',
	'blackjackBet', 'blackjackAction', 'rummyAction', 'leaveRoom', 'addBot', 'removeBot', 'setPotLimit'
]);

const hash = async (value) => {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return toHex(new Uint8Array(digest));
};

const fingerprint = async (event, args, meta) => hash(JSON.stringify({
	event,
	args,
	revision: meta?.expectedRevision,
	handId: meta?.handId
}));

const randomHandId = () => crypto.randomUUID();
const shuffle = (cards) => {
	const deck = structuredClone(cards);
	for (let index = deck.length - 1; index > 0; index--) {
		const other = secureRandomInt(index + 1);
		[deck[index], deck[other]] = [deck[other], deck[index]];
	}
	return deck;
};
const productionDeck = (gameType) =>
	gameType === 'rummy' ? shuffle(freshRummyDeck()) : shuffledDeck();

function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
	});
}

function first(cursor) {
	return cursor.toArray()[0] ?? null;
}

export class RoomDurableObject {
	constructor(ctx, env) {
		this.ctx = ctx;
		this.env = env;
		this.sql = ctx.storage.sql;
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS room_state (
				name TEXT PRIMARY KEY,
				snapshot TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS receipts (
				player_id TEXT NOT NULL,
				command_id TEXT NOT NULL,
				fingerprint TEXT NOT NULL,
				result TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				PRIMARY KEY (player_id, command_id)
			);
			CREATE TABLE IF NOT EXISTS ledger (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				room TEXT NOT NULL,
				hand_id TEXT,
				revision INTEGER NOT NULL,
				kind TEXT NOT NULL,
				entries TEXT NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS room_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
			CREATE INDEX IF NOT EXISTS receipts_created_at_idx ON receipts(created_at);
			CREATE INDEX IF NOT EXISTS ledger_created_at_idx ON ledger(created_at);
		`);
	}

	room() {
		const row = first(this.sql.exec('SELECT snapshot, updated_at FROM room_state LIMIT 1'));
		return row ? { snapshot: JSON.parse(row.snapshot), updatedAt: row.updated_at } : null;
	}

	receipt(playerId, commandId) {
		const row = first(this.sql.exec(
			'SELECT fingerprint, result FROM receipts WHERE player_id=? AND command_id=?',
			playerId,
			commandId
		));
		return row ? { fingerprint: row.fingerprint, result: JSON.parse(row.result) } : null;
	}

	commit(room, playerId, commandId, commandFingerprint, result, movement, expectedRevision) {
		const now = Date.now();
		this.ctx.storage.transactionSync(() => {
			const current = this.room();
			if (
				expectedRevision === null
					? !!current
					: !current || current.snapshot.revision !== expectedRevision
			) {
				throw new GameError('Room changed before commit', 'PERSISTENCE_CONFLICT');
			}
			this.sql.exec(
				'INSERT INTO room_state(name,snapshot,updated_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET snapshot=excluded.snapshot, updated_at=excluded.updated_at',
				room.name,
				JSON.stringify(room),
				now
			);
			this.sql.exec(
				'INSERT INTO receipts(player_id,command_id,fingerprint,result,created_at) VALUES (?,?,?,?,?)',
				playerId,
				commandId,
				commandFingerprint,
				JSON.stringify(result),
				now
			);
			if (movement)
				this.sql.exec(
					'INSERT INTO ledger(room,hand_id,revision,kind,entries,created_at) VALUES (?,?,?,?,?,?)',
					room.name,
					room.handId,
					room.revision,
					movement.kind,
					JSON.stringify(movement.entries),
					now
				);
		});
	}

	connectedPlayers() {
		return new Set(
			this.ctx.getWebSockets()
				.map((socket) => socket.deserializeAttachment())
				.filter((attachment) => attachment?.roomName)
				.map((attachment) => attachment.playerId)
		);
	}

	connectedRoom(roomNameValue) {
		return new Set(
			this.ctx.getWebSockets()
				.map((socket) => socket.deserializeAttachment())
				.filter((attachment) => attachment?.roomName === roomNameValue)
				.map((attachment) => attachment.playerId)
		);
	}

	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === '/room' && request.method === 'GET') {
			const stored = this.room();
			if (!stored) return json({ error: 'Room not found, create room instead' }, 404);
			const room = stored.snapshot;
			return json({
				name: room.name,
				isStarted: playing(room),
				gameShow: room.gameShow,
				playerCount: room.players.filter((player) => player.seatNumber !== null && !player.departed).length,
				maxPlayers: MAX_PLAYERS
			});
		}
		if (url.pathname === '/create' && request.method === 'POST') return this.createRoom(request);
		const socketMatch = /^\/socket\/([^/]+)$/.exec(url.pathname);
		if (socketMatch && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
			const stored = this.room();
			if (!stored || decodeURIComponent(socketMatch[1]) !== stored.snapshot.name)
				return json({ error: 'Room not found' }, 404);
			return this.openSocket(request);
		}
		return json({ error: 'Not found' }, 404);
	}

	async createRoom(request) {
		let body;
		try {
			body = await request.json();
		} catch {
			return json({ error: 'Invalid request' }, 400);
		}
		const playerId = request.headers.get('x-chaal-player-id');
		const { name, args = [], meta } = body ?? {};
		if (!UUID_PATTERN.test(playerId ?? '') || typeof name !== 'string' || !meta?.commandId)
			return json({ error: 'Invalid room request' }, 400);
		try {
			roomName(name);
			if (!UUID_PATTERN.test(meta.commandId)) throw new GameError('A command ID is required', 'BAD_COMMAND');
			const commandFingerprint = await fingerprint('createRoom', args, meta);
			const prior = this.receipt(playerId, meta.commandId);
			if (prior) {
				if (prior.fingerprint !== commandFingerprint)
					throw new GameError('Command ID reused with different content', 'COMMAND_CONFLICT');
				return json(prior.result);
			}
			if (this.room()) throw new GameError('Room already exists', 'ROOM_EXISTS');
			const [requestedName, table, rulesVersion, requestedGameType, options] = args;
			void requestedName;
			const gameType = requestedGameType ?? 'teen-patti';
			if (!listGameTypes().includes(gameType))
				throw new GameError('Unsupported game type', 'UNSUPPORTED_GAME');
			const room = gameType === 'teen-patti'
				? newRoom(name, table, playerId, rulesVersion, options)
				: createGameRoom(gameType, name, table, playerId);
			room.revision = 1;
			const result = { ok: true, roomName: room.name, revision: room.revision, handId: room.handId };
			this.commit(room, playerId, meta.commandId, commandFingerprint, result, null, null);
			await this.scheduleAlarm();
			return json(result);
		} catch (error) {
			const status = error instanceof GameError ? (error.code === 'ROOM_EXISTS' ? 409 : 400) : 503;
			return json({
				ok: false,
				code: error instanceof GameError ? error.code : 'SERVER_ERROR',
				error: error instanceof GameError ? error.message : 'Game service unavailable'
			}, status);
		}
	}

	openSocket(request) {
		const playerId = request.headers.get('x-chaal-player-id');
		if (!UUID_PATTERN.test(playerId ?? '')) return json({ error: 'Invalid session' }, 401);
		const stored = this.room();
		if (!stored) return json({ error: 'Room not found' }, 404);
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server, [playerId]);
		server.serializeAttachment({
			playerId,
			roomName: null,
			createdAt: Date.now(),
			windowStartedAt: Date.now(),
			windowCount: 0
		});
		for (const previous of this.ctx.getWebSockets(playerId)) {
			if (previous === server) continue;
			this.sendEvent(previous, 'sessionReplaced');
			previous.close(4001, 'Session replaced');
		}
		return new Response(null, {
			status: 101,
			headers: { 'Sec-WebSocket-Protocol': 'chaal.v1' },
			webSocket: client
		});
	}

	webSocketMessage(socket, message) {
		this.ctx.waitUntil(this.handleMessage(socket, message));
	}

	async handleMessage(socket, message) {
		if (typeof message !== 'string' || message.length > 16384) {
			socket.close(1009, 'Message too large');
			return;
		}
		let packet;
		try {
			packet = JSON.parse(message);
		} catch {
			socket.close(1007, 'Invalid message');
			return;
		}
		if (!packet || typeof packet !== 'object' || packet.type !== 'event' || typeof packet.event !== 'string')
			return;
		const attachment = socket.deserializeAttachment();
		if (!attachment?.playerId) return socket.close(1008, 'Invalid session');
		try {
			if (packet.event === 'resumeRoom') {
				const reply = await this.resume(socket, attachment, packet.args?.[0]);
				this.sendAck(socket, packet.id, reply);
				return;
			}
			if (packet.event === 'sendInvites' || packet.event === 'listInvites') {
				const reply = await this.invites(socket, attachment, packet.event, packet.args ?? []);
				this.sendAck(socket, packet.id, reply);
				return;
			}
			if (packet.event === 'mediaToken') {
				const reply = await this.mediaToken(socket, attachment, packet.args?.[0]);
				this.sendAck(socket, packet.id, reply);
				return;
			}
			if (!knownEvents.has(packet.event)) throw new GameError('Unknown action');
			const current = socket.deserializeAttachment();
			if (Date.now() - current.windowStartedAt > 60000) {
				current.windowStartedAt = Date.now();
				current.windowCount = 0;
			}
			if (++current.windowCount > 180) throw new GameError('Too many actions', 'RATE_LIMIT');
			socket.serializeAttachment(current);
			const command = await this.execute(current, packet.event, packet.args ?? [], packet.meta);
			if (command.roomName !== undefined) {
				current.roomName = command.roomName;
				socket.serializeAttachment(current);
			}
			this.sendAck(socket, packet.id, command.result);
			if (command.removeMedia) this.ctx.waitUntil(this.removeMedia(command.mediaRoomName, current.playerId));
			this.publish(command.publishRoomName, command.text);
			await this.scheduleAlarm();
		} catch (error) {
			if (!(error instanceof GameError)) console.error('Cloudflare room action failed:', error?.name ?? 'Error');
			const result = {
				ok: false,
				code: error instanceof GameError ? error.code : 'SERVER_ERROR',
				error: error instanceof GameError ? error.message : 'Game service unavailable'
			};
			this.sendAck(socket, packet.id, result);
			const current = socket.deserializeAttachment();
			if (current?.roomName) this.sendRoomView(socket, current.roomName);
		}
	}

	async resume(socket, attachment, requestedName) {
		roomName(requestedName);
		const stored = this.room();
		if (!stored || stored.snapshot.name !== requestedName)
			throw new GameError('Room not found', 'NOT_MEMBER');
		const room = stored.snapshot;
		const view = projection(room, attachment.playerId, this.connectedRoom(room.name));
		attachment.roomName = room.name;
		socket.serializeAttachment(attachment);
		const hostRecovery = this.getMeta('hostRecovery');
		if (room.hostId === attachment.playerId && hostRecovery?.hostId === attachment.playerId)
			this.deleteMeta('hostRecovery');
		else if (room.hostId && !this.connectedRoom(room.name).has(room.hostId) && !hostRecovery)
			this.setMeta('hostRecovery', { hostId: room.hostId, at: Date.now() + this.hostGraceMs() });
		this.sendEvent(socket, 'roomData', view);
		this.publish(room.name);
		await this.scheduleAlarm();
		return { ok: true };
	}

	async execute(attachment, event, args, meta) {
		if (!meta || !UUID_PATTERN.test(meta.commandId ?? ''))
			throw new GameError('A command ID is required', 'BAD_COMMAND');
		const playerId = attachment.playerId;
		const commandFingerprint = await fingerprint(event, args, meta);
		const prior = this.receipt(playerId, meta.commandId);
		if (prior) {
			if (prior.fingerprint !== commandFingerprint)
				throw new GameError('Command ID reused with different content', 'COMMAND_CONFLICT');
			return {
				result: prior.result,
				roomName: event === 'joinRoom' ? args[1] : (event === 'leaveRoom' ? null : attachment.roomName),
				publishRoomName: event === 'leaveRoom' ? attachment.roomName : (event === 'joinRoom' ? args[1] : attachment.roomName),
				text: null,
				removeMedia: event === 'leaveRoom',
				mediaRoomName: attachment.roomName
			};
		}

		const name = event === 'joinRoom' ? args[1] : attachment.roomName;
		roomName(name);
		const stored = this.room();
		const before = stored?.snapshot;
		if (!before || before.name !== name) throw new GameError('Room not found');
		let action, payload, text;
		if (event === 'joinRoom') {
			if (attachment.roomName && attachment.roomName !== name)
				throw new GameError('Leave your current room first');
			action = 'join';
			payload = { username: args[0] };
			text = before.gameType && before.gameType !== 'teen-patti'
				? null
				: `${args[0]} has joined the Game`;
		} else {
			if ((event === 'start' || event === 'show') && args[0] !== name)
				throw new GameError('Wrong room', 'FORBIDDEN');
			if (meta.expectedRevision !== before.revision || meta.handId !== before.handId)
				throw new GameError('Game state changed; review your current turn and try again', 'STALE_STATE');
			if (event === 'start') {
				action = 'start';
				if (before.gameType === 'texas-holdem') {
					payload = { cutAt: args[1], cardsToDeal: args[2], rulesVersion: args[3] };
				} else if (!before.gameType || before.gameType === 'teen-patti') {
					const mode = args[4] ?? 'selected';
					if (mode !== 'selected' && mode !== 'random')
						throw new GameError('Choose a variant or random mode', 'INVALID_ACTION');
					const availableVariants = listVariants();
					const rulesVersion = mode === 'random'
						? availableVariants[secureRandomInt(availableVariants.length)].rulesVersion
						: (args[3] ?? before.rulesVersion);
					const variant = getVariant(rulesVersion);
					if (!variant) throw new GameError('Unsupported game rules version', 'UNSUPPORTED_RULES');
					payload = { cutAt: args[1], cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion };
				} else payload = {};
				text = 'Game started';
			} else if (event === 'ready') {
				action = 'ready';
				payload = { ready: args[0] };
				text = before.gameType && before.gameType !== 'teen-patti'
					? null
					: (args[0] ? 'Player is ready' : 'Player is not ready');
			} else if (event === 'seeCards') {
				action = 'see';
				payload = {};
				text = 'Cards seen';
			} else if (event === 'addBot') {
				action = 'addBot';
				payload = {
					botId: `bot-${crypto.randomUUID()}`,
					name: pickBotName(before, secureRandom),
					level: args[0]
				};
				text = null;
			} else if (event === 'setPotLimit') {
				action = 'setPotLimit';
				payload = { potLimit: args[0] };
				text = null;
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
				payload = {};
			} else if (event === 'pokerAction') {
				if (before.gameType !== 'texas-holdem')
					throw new GameError('Poker action sent to a Teen Patti room', 'INVALID_ACTION');
				if (!['fold', 'check', 'call', 'raise'].includes(args[0]))
					throw new GameError('Unknown Poker action');
				action = args[0];
				payload = { amount: args[1] };
			} else if (event === 'blackjackBet') {
				if (before.gameType !== 'blackjack')
					throw new GameError('Blackjack wager sent to another game', 'INVALID_ACTION');
				action = 'bet';
				payload = { amount: args[0] };
			} else if (event === 'blackjackAction') {
				if (before.gameType !== 'blackjack' || !['hit', 'stand', 'double'].includes(args[0]))
					throw new GameError('Invalid Blackjack action', 'INVALID_ACTION');
				action = args[0];
				payload = {};
			} else if (event === 'rummyAction') {
				if (before.gameType !== 'rummy' || !['draw-stock', 'draw-discard', 'discard', 'declare'].includes(args[0]))
					throw new GameError('Invalid Rummy action', 'INVALID_ACTION');
				action = args[0];
				payload = { index: args[1] };
			} else if (event === 'leaveRoom') {
				action = 'leave';
				payload = {};
				text = 'Player left';
			} else throw new GameError('Unknown action');
		}

		const now = Date.now();
		const room = transition(before, playerId, action, payload, {
			now,
			turnMs: this.turnMs(),
			handId: randomHandId(),
			deck: action === 'start' ? productionDeck(before.gameType ?? 'teen-patti') : undefined,
			recycledDeck: before.gameType === 'rummy' && before.deck.length === 0 && before.discardPile.length > 1
				? shuffle(before.discardPile.slice(0, -1))
				: undefined,
			connected: this.connectedRoom(name),
			requireReady: true
		});
		const result = { ok: true, roomName: room.name, revision: room.revision, handId: room.handId };
		this.commit(room, playerId, meta.commandId, commandFingerprint, result, movements(before, room, event), before.revision);
		if (room.result && room.result.handId !== before.result?.handId)
			text = `${room.result.winnerName} won ${room.result.amount} chips`;
		return {
			result,
			roomName: event === 'leaveRoom' ? null : room.name,
			publishRoomName: room.name,
			text,
			removeMedia: event === 'leaveRoom',
			mediaRoomName: room.name
		};
	}

	sendAck(socket, id, result) {
		if (typeof id !== 'string' || id.length > 100) return;
		this.send(socket, { type: 'ack', id, result });
	}

	sendEvent(socket, event, ...args) {
		this.send(socket, { type: 'event', event, args });
	}

	send(socket, packet) {
		try {
			if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(packet));
		} catch {
			// A disconnect racing a room broadcast is normal; the close handler updates presence.
		}
	}

	sendRoomView(socket, name) {
		try {
			const room = this.room()?.snapshot;
			if (room?.name === name)
				this.sendEvent(socket, 'roomData', projection(room, socket.deserializeAttachment().playerId, this.connectedRoom(name)));
		} catch (error) {
			if (!(error instanceof GameError)) console.error('Room snapshot unavailable:', error?.name ?? 'Error');
		}
	}

	publish(name, text) {
		if (!name) return;
		const room = this.room()?.snapshot;
		if (!room || room.name !== name) return;
		const connected = this.connectedRoom(name);
		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment();
			if (attachment?.roomName !== name) continue;
			this.sendEvent(socket, 'roomData', projection(room, attachment.playerId, connected));
			if (text) this.sendEvent(socket, 'message', { text });
		}
	}

	webSocketClose(socket) {
		const attachment = socket.deserializeAttachment();
		if (!attachment?.roomName) return;
		const room = this.room()?.snapshot;
		if (room?.hostId === attachment.playerId && !this.connectedRoom(room.name).has(attachment.playerId))
			this.setMeta('hostRecovery', { hostId: attachment.playerId, at: Date.now() + this.hostGraceMs() });
		this.publish(attachment.roomName);
		this.ctx.waitUntil(this.scheduleAlarm());
	}

	webSocketError(socket) {
		try { socket.close(1011, 'Room service error'); } catch { /* Already closed. */ }
	}

	turnMs() {
		const value = Number(this.env.TURN_TIMEOUT_MS ?? 60000);
		return Number.isSafeInteger(value) && value >= 100 && value <= 3600000 ? value : 60000;
	}

	hostGraceMs() {
		const value = Number(this.env.HOST_GRACE_MS ?? 30000);
		return Number.isSafeInteger(value) && value >= 1000 && value <= 3600000 ? value : 30000;
	}

	getMeta(key) {
		const row = first(this.sql.exec('SELECT value FROM room_meta WHERE key=?', key));
		return row ? JSON.parse(row.value) : null;
	}

	setMeta(key, value) {
		this.sql.exec('INSERT INTO room_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
	}

	deleteMeta(key) {
		this.sql.exec('DELETE FROM room_meta WHERE key=?', key);
	}

	/**
	 * Bots act after a human-like pause. Plan one pending bot move per room revision,
	 * and only while a person is connected, so empty tables cost nothing.
	 */
	planBot(room) {
		const connected = this.connectedRoom(room.name);
		const planned = this.getMeta('botTurn');
		const dueBot = humansPresent(room, connected) ? botDue(room, connected) : null;
		if (!dueBot) {
			if (planned) this.deleteMeta('botTurn');
			return null;
		}
		if (planned?.revision === room.revision) return planned;
		// A bot that just looked or discarded on its own turn follows up quickly.
		const quick = planned?.botId === dueBot && planned?.handId === room.handId;
		const next = {
			revision: room.revision,
			handId: room.handId,
			botId: dueBot,
			at: Date.now() + botDelay(secureRandom, quick)
		};
		this.setMeta('botTurn', next);
		return next;
	}

	async playBot() {
		const stored = this.room();
		const planned = this.getMeta('botTurn');
		if (!stored || !planned || planned.at > Date.now()) return false;
		const before = stored.snapshot;
		if (planned.revision !== before.revision) return false;
		const connected = this.connectedRoom(before.name);
		const move = nextBotMove(before, connected, secureRandom);
		if (!move) return false;
		try {
			const room = transition(before, move.botId, move.action, move.payload, {
				now: Date.now(),
				turnMs: this.turnMs(),
				connected
			});
			const commandId = `bot:${before.handId}:${before.revision}`;
			this.commit(room, move.botId, commandId, await hash(commandId), { ok: true }, movements(before, room, `bot-${move.action}`), before.revision);
			this.publish(room.name, room.result && !before.result
				? `${room.result.winnerName} won ${room.result.amount} chips`
				: botMoveText(before, move));
			return true;
		} catch (error) {
			// A bot must never wedge a table: drop the plan; its turn timer packs it if needed.
			console.error('Bot move failed:', error?.code ?? error?.name ?? 'Error');
			this.deleteMeta('botTurn');
			return false;
		}
	}

	async scheduleAlarm() {
		const stored = this.room();
		if (!stored) {
			await this.ctx.storage.deleteAlarm();
			return;
		}
		const room = stored.snapshot;
		const deadlines = [];
		const botTurn = this.planBot(room);
		if (botTurn) deadlines.push(botTurn.at);
		if (playing(room) && Number.isSafeInteger(room.deadline)) deadlines.push(room.deadline);
		const hostRecovery = this.getMeta('hostRecovery');
		if (hostRecovery?.at) deadlines.push(hostRecovery.at);
		const connected = this.connectedRoom(room.name);
		if (connected.size === 0 && (!room.isStarted || room.gameShow)) {
			const joiners = new Set(room.players.map((player) => player.id)).size;
			deadlines.push(stored.updatedAt + (joiners < 3 ? SMALL_ROOM_RETENTION_MS : ROOM_RETENTION_MS));
		}
		if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(Date.now(), Math.min(...deadlines)));
		else await this.ctx.storage.deleteAlarm();
	}

	async alarm() {
		const stored = this.room();
		if (!stored) return;
		let room = stored.snapshot;
		let changed = false;
		let announcement;
		const now = Date.now();
		this.sql.exec('DELETE FROM receipts WHERE created_at<=?', now - 30 * DAY_MS);
		this.sql.exec('DELETE FROM ledger WHERE created_at<=?', now - ROOM_RETENTION_MS);

		if (await this.playBot()) {
			room = this.room().snapshot;
			changed = true;
		}

		if (playing(room) && room.deadline <= now) {
			try {
				const before = room;
				room = transition(before, before.currentPlayerId, 'timeout', {}, {
					now,
					turnMs: this.turnMs(),
					connected: this.connectedRoom(room.name),
					recycledDeck: before.gameType === 'rummy' && before.deck.length === 0 && before.discardPile.length > 1
						? shuffle(before.discardPile.slice(0, -1))
						: undefined
				});
				const commandId = `timeout:${before.handId}:${before.revision}`;
				this.commit(room, before.currentPlayerId, commandId, await hash(commandId), { ok: true }, movements(before, room, 'timeout'), before.revision);
				changed = true;
				announcement = room.result
					? `${room.result.winnerName} won ${room.result.amount} chips`
					: 'Turn timed out; player packed';
			} catch (error) {
				console.error('Cloudflare turn recovery failed:', error?.code ?? error?.name ?? 'Error');
			}
		}

		const recovery = this.getMeta('hostRecovery');
		if (recovery?.at <= now) {
			const active = this.connectedRoom(room.name);
			if (room.hostId === recovery.hostId && !active.has(recovery.hostId)) {
				const seats = room.players.filter((player) => player.seatNumber !== null && !player.departed)
					.sort((left, right) => left.seatNumber - right.seatNumber);
				const hostSeat = seats.find((player) => player.id === recovery.hostId)?.seatNumber ?? -1;
				const candidates = seats.filter((player) => player.id !== recovery.hostId && active.has(player.id));
				const nextHost = candidates.find((player) => player.seatNumber > hostSeat) ?? candidates[0];
				if (nextHost) {
					const before = room;
					room = { ...before, hostId: nextHost.id, revision: before.revision + 1 };
					const commandId = crypto.randomUUID();
					this.commit(room, recovery.hostId, commandId, await hash(JSON.stringify({ event: 'hostRecovery', hostId: recovery.hostId, nextHost: nextHost.id, revision: before.revision })), { ok: true, roomName: room.name, revision: room.revision, handId: room.handId }, null, before.revision);
					announcement = `${nextHost.username} is now the room host`;
					changed = true;
				}
			}
			this.deleteMeta('hostRecovery');
		}

		const latest = this.room();
		if (latest && this.connectedRoom(latest.snapshot.name).size === 0 && (!latest.snapshot.isStarted || latest.snapshot.gameShow)) {
			const joiners = new Set(latest.snapshot.players.map((player) => player.id)).size;
			const retentionMs = joiners < 3 ? SMALL_ROOM_RETENTION_MS : ROOM_RETENTION_MS;
			if (latest.updatedAt + retentionMs <= now) {
				await this.ctx.storage.deleteAll();
				return;
			}
		}
		if (changed || announcement) this.publish(room.name, announcement);
		await this.scheduleAlarm();
	}

	async mediaToken(socket, attachment, requestedRoom) {
		if (attachment.mediaBusy || Date.now() - (attachment.mediaLastRequest ?? -Infinity) < 2000)
			return { ok: false, code: 'RATE_LIMIT', error: 'Wait before retrying media' };
		attachment.mediaBusy = true;
		attachment.mediaLastRequest = Date.now();
		socket.serializeAttachment(attachment);
		try {
			const player = this.mediaMember(socket, requestedRoom, attachment.playerId);
			if (!this.env.LIVEKIT_URL || !this.env.LIVEKIT_API_KEY || !this.env.LIVEKIT_API_SECRET)
				throw new GameError('Camera and audio are not configured. You can keep playing.', 'MEDIA_UNAVAILABLE');
			const credential = await this.issueLiveKitToken(requestedRoom, player);
			this.mediaMember(socket, requestedRoom, attachment.playerId);
			return { ok: true, ...credential };
		} catch (error) {
			return {
				ok: false,
				code: error instanceof GameError ? error.code : 'MEDIA_UNAVAILABLE',
				error: error instanceof GameError ? error.message : 'Media service unavailable. You can keep playing.'
			};
		} finally {
			const current = socket.deserializeAttachment();
			if (current) {
				current.mediaBusy = false;
				socket.serializeAttachment(current);
			}
		}
	}

	inviteSettings() {
		const origin = String(this.env.PUBLIC_APP_URL ?? 'https://chaal.tech').replace(/\/+$/, '');
		return {
			apiKey: this.env.RESEND_API_KEY,
			from: this.env.INVITE_FROM ?? 'Chaal <invites@chaal.tech>',
			origin
		};
	}

	/** Email invites go through the open game socket, so only seated players can send them. */
	async invites(socket, attachment, event, [requestedRoom, emails]) {
		try {
			const player = this.mediaMember(socket, requestedRoom, attachment.playerId);
			const invited = () => (this.getMeta('invites') ?? []).map(({ email, at }) => ({ email, at }));
			if (event === 'listInvites') return { ok: true, invites: invited() };
			const settings = this.inviteSettings();
			if (!settings.apiKey)
				throw new GameError('Email invites are not set up yet. Share the link instead.', 'INVITES_UNAVAILABLE');
			const current = socket.deserializeAttachment();
			if (Date.now() - (current.inviteLast ?? -Infinity) < 5000)
				throw new GameError('Wait a few seconds before sending more invites', 'RATE_LIMIT');
			current.inviteLast = Date.now();
			socket.serializeAttachment(current);
			const plan = planInvites(this.getMeta('invites'), inviteEmails(emails), player.id, Date.now());
			if (plan.send.length) {
				const room = this.room().snapshot;
				await sendWithResend({
					apiKey: settings.apiKey,
					from: settings.from,
					emails: plan.send,
					message: inviteMessage({
						inviter: player.username,
						link: `${settings.origin}/${room.name}`,
						boot: room.boot ?? 1,
						buyIn: room.table,
						seats: MAX_PLAYERS
					})
				});
				this.setMeta('invites', plan.record);
			}
			return { ok: true, sent: plan.send, skipped: plan.skipped, invites: invited() };
		} catch (error) {
			if (!(error instanceof GameError)) console.error('Invite email failed:', error?.message ?? 'Error');
			return {
				ok: false,
				code: error instanceof GameError ? error.code : 'INVITES_UNAVAILABLE',
				error: error instanceof GameError ? error.message : 'Could not send the email right now. Share the link instead.'
			};
		}
	}

	mediaMember(socket, requestedRoom, playerId) {
		const current = socket.deserializeAttachment();
		if (current?.roomName !== requestedRoom || current?.playerId !== playerId)
			throw new GameError('Join this game room before media', 'FORBIDDEN');
		roomName(requestedRoom);
		const room = this.room()?.snapshot;
		const player = room?.players.find((entry) => entry.id === current.playerId && entry.seatNumber !== null && !entry.departed);
		if (!player) throw new GameError('No active seat in this room', 'FORBIDDEN');
		return player;
	}

	async issueLiveKitToken(roomNameValue, player) {
		await this.createLiveKitRoom(roomNameValue);
		const token = await this.liveKitJwt({
			roomJoin: true,
			room: roomNameValue,
			canPublish: true,
			canSubscribe: true,
			canPublishSources: ['camera', 'microphone'],
			canPublishData: false,
			canUpdateOwnMetadata: false
		}, {
			subject: player.id,
			name: player.username,
			metadata: JSON.stringify({ roomId: roomNameValue, playerId: player.id, seatNumber: player.seatNumber })
		});
		return { token, url: String(this.env.LIVEKIT_URL), identity: player.id, roomName: roomNameValue };
	}

	async createLiveKitRoom(roomNameValue) {
		const endpoint = this.liveKitHttpUrl();
		const token = await this.liveKitJwt({ roomCreate: true });
		const response = await fetch(`${endpoint}/twirp/livekit.RoomService/CreateRoom`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: roomNameValue,
				maxParticipants: 6,
				emptyTimeout: 300,
				departureTimeout: 30
			}),
			signal: AbortSignal.timeout(4000)
		});
		if (!response.ok) throw new Error('LiveKit room creation failed');
	}

	liveKitHttpUrl() {
		const endpoint = new URL(this.env.LIVEKIT_URL);
		if (
			!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
			endpoint.search || endpoint.hash
		) throw new Error('LiveKit URL is invalid');
		endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
		return endpoint.href.replace(/\/$/, '');
	}

	async liveKitJwt(grants, { subject, name, metadata, ttl = 60 } = {}) {
		const now = Math.floor(Date.now() / 1000);
		const header = { alg: 'HS256', typ: 'JWT' };
		const claims = {
			iss: this.env.LIVEKIT_API_KEY,
			nbf: now - 5,
			exp: now + ttl,
			video: grants,
			...(subject ? { sub: subject } : {}),
			...(name ? { name } : {}),
			...(metadata ? { metadata } : {})
		};
		const encoded = (value) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
			.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
		const content = `${encoded(header)}.${encoded(claims)}`;
		const key = await crypto.subtle.importKey(
			'raw', new TextEncoder().encode(this.env.LIVEKIT_API_SECRET),
			{ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
		);
		const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content)));
		return `${content}.${btoa(String.fromCharCode(...signature)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
	}

	async removeMedia(roomNameValue, playerId) {
		if (!this.env.LIVEKIT_URL || !this.env.LIVEKIT_API_KEY || !this.env.LIVEKIT_API_SECRET) return;
		try {
			const now = Math.floor(Date.now() / 1000);
			const token = await this.liveKitJwt({ roomAdmin: true, room: roomNameValue }, { subject: crypto.randomUUID() });
			const hostname = new URL(this.env.LIVEKIT_URL).hostname.toLowerCase();
			const revoke = this.env.LIVEKIT_REVOKE_TOKENS === 'true' || hostname.endsWith('.livekit.cloud');
			await fetch(`${this.liveKitHttpUrl()}/twirp/livekit.RoomService/RemoveParticipant`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					room: roomNameValue,
					identity: playerId,
					...(revoke ? { revokeTokenTs: String(now) } : {})
				}),
				signal: AbortSignal.timeout(4000)
			});
		} catch {
			console.error('LiveKit participant cleanup failed');
		}
	}
}
