/* global WebSocketPair */

import { createGameRoom, listGameTypes } from '../games/index.mjs';
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
} from '../engine.mjs';
import { shuffledDeck } from '../classic.mjs';
import { freshRummyDeck } from '../rummy/rummy.mjs';
import { getVariant, listVariants } from '../variants/index.mjs';
import { secureRandomInt, toHex } from '../random.mjs';
import { inviteEmails, planInvites, inviteMessage, sendWithResend } from './invites.mjs';
import { verifyGameToken } from './security.mjs';
import { clubDirectory } from './club-directory.mjs';
import { trackClubHand, archiveHands } from '../club/history.mjs';
import { withClubDatabase, ClubError, invitableEmails, emailsForMembers, memberRole, membersForPlayers } from '../club/members.mjs';
import { saveNight, nightEmail } from '../club/nights.mjs';
import { botSeat } from '../bots/directory.mjs';
import { ADAPTIVE_POLICY } from '../bots/memory/adaptive.mjs';
import { decisionScope, loadMemory, timedMemory } from '../bots/memory/provider.mjs';
import { clubSettings } from '../club/admin.mjs';
import { nextBotMove, botDue, botDelay, humansPresent, botMoveText } from '../bots/runner.mjs';
import { recordCommitSafely, stepRecorder, botRandom, abandonOpenHand } from '../analytics/recorder.mjs';
import { archiveRecorderRow, isRecorderRow, writeRoomStatus } from '../analytics/store.mjs';
import { engineBuild } from './build.mjs';


const secureRandom = () => secureRandomInt(0x1_0000_0000) / 0x1_0000_0000;
const randomUint32 = () => secureRandomInt(0x1_0000_0000);

/** Seats at every table; the engine allows seat numbers 0–5. */
const MAX_PLAYERS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const SMALL_ROOM_RETENTION_MS = 30 * DAY_MS;
/** A table with one or no players (bots count) for this long closes itself. */
const IDLE_CLOSE_MS = 5 * 60 * 1000;
const ROOM_RETENTION_MS = 365 * DAY_MS;
const UUID_PATTERN = /^[a-f0-9-]{36}$/;
const knownEvents = new Set([
	'joinRoom', 'ready', 'start', 'seeCards', 'discardCard', 'play', 'show', 'pokerAction',
	'blackjackBet', 'blackjackAction', 'rummyAction', 'leaveRoom', 'addBot', 'removeBot', 'setPotLimit',
	'setBalanceHidden', 'showCards', 'chooseNext', 'openPick', 'tableAction', 'prepareStart', 'cutDeck', 'endNight', 'requestChips', 'cancelChipRequest', 'answerChipRequest'
]);

/**
 * Seal the next hand's deck as soon as a cut opens: shuffle it, give every position a secret, and
 * publish one fingerprint over the fingerprints of all 52 positions. After the hand, the secrets
 * of the cards that were shown prove they sat exactly there before anyone cut.
 */
async function sealDeck(room) {
	if (!room.cut || room.seal) return undefined;
	const deck = shuffledDeck();
	const salts = deck.map(() => toHex(crypto.getRandomValues(new Uint8Array(16))));
	const leaves = await Promise.all(
		deck.map((card, index) => hash(`${index}|${card.rank}|${card.suit}|${salts[index]}`))
	);
	room.seal = { deck, salts, leaves, commitment: await hash(leaves.join('')) };
	// Returned so the hand recorder can replay this change, which happens outside transition().
	return room.seal;
}

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

function safeDecode(value) {
	try {
		return decodeURIComponent(value ?? '');
	} catch {
		return '';
	}
}

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
		this.ensureSchema();
	}

	/** Create the room's tables. Also run after deleteAll, so a closed room answers "not found". */
	ensureSchema() {
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
			CREATE TABLE IF NOT EXISTS history_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
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

	/**
	 * `step` describes the input for the hand recorder (server/analytics/recorder.mjs). Recording
	 * runs in this transaction but can never change `room` or fail the commit: an error only
	 * abandons the current hand's recording, as an explicit failure row.
	 */
	commit(room, playerId, commandId, commandFingerprint, result, movement, expectedRevision, step) {
		const now = Date.now();
		const snapshot = JSON.stringify(room);
		this.ctx.storage.transactionSync(() => {
			const current = this.room();
			if (
				expectedRevision === null
					? !!current
					: !current || current.snapshot.revision !== expectedRevision
			) {
				throw new GameError('Room changed before commit', 'PERSISTENCE_CONFLICT');
			}
			const tracked = trackClubHand(this.getMeta('clubHand'), current?.snapshot, room, movement, now);
			if (tracked.progress) this.setMeta('clubHand', tracked.progress);
			else this.deleteMeta('clubHand');
			if (tracked.completed) this.sql.exec('INSERT OR IGNORE INTO history_outbox(id,payload) VALUES (?,?)', tracked.completed._id, JSON.stringify(tracked.completed));
			const recorded = recordCommitSafely(this.getMeta('recorder'), {
				before: current?.snapshot ?? null,
				after: JSON.parse(snapshot),
				afterJson: snapshot,
				step: step ?? { actor: playerId, action: 'unknown', payload: {}, ctx: {}, kind: 'system', cause: 'unrecorded' },
				now,
				// Null (and so an explicit failure at flush) if this isolate has no valid build id.
				engine: engineBuild(this.env)
			});
			if (recorded.error) console.error('Hand recorder error:', recorded.error?.message ?? 'Error');
			this.setMeta('recorder', recorded.state);
			for (const row of recorded.rows)
				this.sql.exec('INSERT OR IGNORE INTO history_outbox(id,payload) VALUES (?,?)', row.id, JSON.stringify(row.payload));
			this.urgentHistory = !!tracked.completed || recorded.rows.some((row) => row.payload.type !== 'night-event');
			this.sql.exec(
				'INSERT INTO room_state(name,snapshot,updated_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET snapshot=excluded.snapshot, updated_at=excluded.updated_at',
				room.name,
				snapshot,
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
		// Hands and failures go out now; between-hand events ride along or go on the next alarm.
		if (this.urgentHistory) this.ctx.waitUntil(this.flushHistory());
		this.urgentHistory = false;
	}

	/**
	 * Drain the durable outbox to MongoDB over one connection: club hands in a batch, recorder rows
	 * one by one in order. Rows queued while a flush runs are picked up by the same flush.
	 */
	async flushHistory() {
		if (!this.env.MONGODB_URI) return;
		if (this.historyFlush) {
			this.flushAgain = true;
			return this.historyFlush;
		}
		this.historyFlush = (async () => {
			try {
				await withClubDatabase(this.env, async (db) => {
					for (let round = 0; round < 25; round++) {
						this.flushAgain = false;
						const pending = this.sql.exec('SELECT id,payload FROM history_outbox ORDER BY rowid LIMIT 20').toArray()
							.map((row) => ({ id: row.id, payload: JSON.parse(row.payload) }));
						if (!pending.length) break;
						const hands = pending.filter((row) => !isRecorderRow(row.payload));
						if (hands.length) {
							await archiveHands(db, hands.map((row) => row.payload));
							for (const row of hands) this.sql.exec('DELETE FROM history_outbox WHERE id=?', row.id);
						}
						// Recorder rows in order; the first that cannot be written stops the rest until next time.
						for (const row of pending.filter((candidate) => isRecorderRow(candidate.payload))) {
							await archiveRecorderRow(db, row.payload);
							this.sql.exec('DELETE FROM history_outbox WHERE id=?', row.id);
						}
						if (pending.length < 20 && !this.flushAgain) break;
					}
					this.deleteMeta('outboxError');
					await writeRoomStatus(db, this.roomNameForStatus(), this.recorderStatus()).catch(() => {});
				});
			} catch (error) {
				// Durable outbox retries on the next alarm; the failure is logged and kept, never silent.
				const previous = this.getMeta('outboxError');
				const failure = {
					attempts: (previous?.attempts ?? 0) + 1,
					at: Date.now(),
					error: String(error?.message ?? error?.name ?? 'Error').slice(0, 300)
				};
				this.setMeta('outboxError', { ...failure, since: previous?.since ?? failure.at });
				console.error('History outbox flush failed:', failure.attempts, failure.error);
				// Best effort: if the database is reachable, say this room is stuck and why.
				await withClubDatabase(this.env, (db) => writeRoomStatus(db, this.roomNameForStatus(), this.recorderStatus()))
					.catch(() => {});
			}
		})();
		try { await this.historyFlush; } finally { this.historyFlush = null; }
	}

	roomNameForStatus() {
		return this.room()?.snapshot.name ?? this.getMeta('recorder')?.night?.id?.split(':')[0] ?? 'unknown-room';
	}

	/** Recorder counters and what is waiting in the outbox, for recorder health. */
	recorderStatus() {
		const pending = { total: 0, capture: 0, nightEvent: 0, reveal: 0, failure: 0, clubHand: 0 };
		for (const row of this.sql.exec('SELECT id FROM history_outbox').toArray()) {
			pending.total++;
			const kind = row.id.slice(0, 4);
			if (kind === 'cap:') pending.capture++;
			else if (kind === 'nev:') pending.nightEvent++;
			else if (kind === 'rev:') pending.reveal++;
			else if (kind === 'fail') pending.failure++;
			else pending.clubHand++;
		}
		const error = this.getMeta('outboxError');
		const recorder = this.getMeta('recorder');
		return {
			stats: recorder?.stats ?? { handsStarted: 0, captured: 0, failed: 0 },
			handOpen: !!recorder?.hand && !recorder.hand.failed,
			pending,
			consecutiveFailures: error?.attempts ?? 0,
			lastError: error?.error ?? null,
			failingSince: error?.since ?? null,
			engineBuild: engineBuild(this.env),
			reportedAt: new Date(),
			...(error ? {} : { lastSuccessAt: new Date() })
		};
	}

	hasPendingHistory() {
		return !!first(this.sql.exec('SELECT id FROM history_outbox LIMIT 1'));
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
		if (url.pathname === '/end' && request.method === 'POST') return this.endFromAdmin(request);
		// The lobby asks directly when a table has been quiet, in case a report was missed.
		if (url.pathname === '/lobby-summary' && request.method === 'GET') {
			const room = this.room()?.snapshot;
			return json(room ? this.lobbySummary(room) : { name: null, closed: true });
		}
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
			this.commit(room, playerId, meta.commandId, commandFingerprint, result, null, null, {
				actor: playerId,
				action: 'create',
				payload: { gameType, table, rulesVersion: room.rulesVersion ?? null, options: options ?? null },
				ctx: {},
				kind: 'player'
			});
			this.reportToLobby(room);
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
		const authExp = Number(request.headers.get('x-chaal-auth-exp'));
		if (!UUID_PATTERN.test(playerId ?? '') || !(authExp > Date.now())) return json({ error: 'Invalid session' }, 401);
		const stored = this.room();
		if (!stored) return json({ error: 'Room not found' }, 404);
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server, [playerId]);
		server.serializeAttachment({
			playerId,
			memberId: request.headers.get('x-chaal-member-id') ?? '',
			nickname: safeDecode(request.headers.get('x-chaal-nickname')).slice(0, 24),
			authExp,
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
			if (packet.event === 'renewAuth') {
				this.sendAck(socket, packet.id, await this.renewAuth(socket, packet.args?.[0]));
				return;
			}
			if (this.authExpired(socket, attachment)) return;
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
		const view = this.view(room, attachment.playerId, this.connectedRoom(room.name));
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
			// The table shows the member's club nickname, never a name the browser picked.
			const username = attachment.nickname || args[0];
			payload = { username };
			text = before.gameType && before.gameType !== 'teen-patti'
				? null
				: `${username} has joined the Game`;
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
					// A game already settled (and shown to everyone) is what gets dealt. The night's first hand
// opens the lineup (a Mystery first slot draws a game).
const lineup = await this.lineup();
const opening = !before.upNext && !before.lineupAt && !before.chooser && lineup.length > 0;
const firstGame = opening && lineup[0] === 'mystery'
	? listVariants()[secureRandomInt(listVariants().length)].rulesVersion
	: lineup[0];
const picked = before.upNext
	? { mode: 'selected', rulesVersion: before.upNext.rulesVersion }
	: opening
		? { mode: 'selected', rulesVersion: firstGame }
		: nextHandChoice(before, Date.now(), lineup.filter((v) => getVariant(v)));
					const mode = picked?.mode ?? args[4] ?? 'selected';
					if (mode !== 'selected' && mode !== 'random')
						throw new GameError('Choose a variant or random mode', 'INVALID_ACTION');
					const availableVariants = listVariants();
					const pool = picked?.pool ?? availableVariants.map((variant) => variant.rulesVersion);
					const rulesVersion = mode === 'random'
						? pool[secureRandomInt(pool.length)]
						: (picked?.rulesVersion ?? args[3] ?? before.rulesVersion);
					const variant = getVariant(rulesVersion);
					if (!variant) throw new GameError('Unsupported game rules version', 'UNSUPPORTED_RULES');
					// A sealed deck is dealt from where the cutter cut it (or a random cut if they didn't).
const cutAt = before.seal ? (before.cut?.at ?? 1 + secureRandomInt(51)) : (Number.isInteger(args[1]) && args[1] >= 0 && args[1] <= 51 ? args[1] : 1 + secureRandomInt(51));
payload = { cutAt, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion, ...(opening ? { lineupIndex: 0 } : {}) };
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
					...await withClubDatabase(this.env, db => botSeat(db, before, ['easy', 'normal', 'hard'].includes(args[0]) ? undefined : args[0])).catch(error => { if (error instanceof ClubError) throw new GameError(error.message, error.code); throw error; })
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
			} else if (event === 'endNight') {
	action = 'endNight';
	payload = { mode: args[0] };
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
				text = chipGiftText(before, args[0], playerId, args[1]);
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
		// Only club owners may end a table: checked against the guest list, not the table.
		const canEnd = action === 'endNight' ? await this.isOwner(attachment.memberId) : false;
		const recorder = stepRecorder({
			canEnd,
			now,
			turnMs: this.turnMs(),
			handId: randomHandId(),
			deck: action === 'start' ? (before.seal?.deck ?? productionDeck(before.gameType ?? 'teen-patti')) : undefined,
			recycledDeck: before.gameType === 'rummy' && before.deck.length === 0 && before.discardPile.length > 1
				? shuffle(before.discardPile.slice(0, -1))
				: undefined,
			connected: this.connectedRoom(name),
			requireReady: true,
			...(await this.pickContext())
		});
		const room = transition(before, playerId, action, payload, recorder.ctx);
		const result = { ok: true, roomName: room.name, revision: room.revision, handId: room.handId };
		const seal = await sealDeck(room);
		this.commit(room, playerId, meta.commandId, commandFingerprint, result, movements(before, room, event), before.revision,
			recorder.step(playerId, action, payload, seal ? { seal } : {}));
		if (room.ended && !before.ended) await this.afterNight(room);
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
			const attachment = socket.deserializeAttachment();
			if (room?.name === name && !this.authExpired(socket, attachment))
				this.sendEvent(socket, 'roomData', this.view(room, attachment.playerId, this.connectedRoom(name)));
		} catch (error) {
			if (!(error instanceof GameError)) console.error('Room snapshot unavailable:', error?.name ?? 'Error');
		}
	}

	publish(name, text) {
		// Keep tonight's lineup fresh; the next update carries any change.
		if (!this.lineupCache || Date.now() - this.lineupCache.at >= 15000) this.ctx.waitUntil(this.lineup());
		if (!name) return;
		const room = this.room()?.snapshot;
		if (!room || room.name !== name) return;
		const connected = this.connectedRoom(name);
		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment();
			if (attachment?.roomName !== name || this.authExpired(socket, attachment)) continue;
			this.sendEvent(socket, 'roomData', this.view(room, attachment.playerId, connected));
			if (text) this.sendEvent(socket, 'message', { text });
		}
		this.reportToLobby(room);
	}

	/** A socket outlives its credential only until the next message or update: then it must renew. */
	authExpired(socket, attachment) {
		if (attachment?.authExp > Date.now()) return false;
		try { socket.close(4003, 'Sign-in expired'); } catch { /* Already closed. */ }
		return true;
	}

	/** Swap in a fresh game credential without dropping the seat or the hand. */
	async renewAuth(socket, token) {
		const claims = await verifyGameToken(token, this.env.SESSION_SECRET);
		const current = socket.deserializeAttachment();
		if (!claims || claims.playerId !== current?.playerId)
			return { ok: false, code: 'SIGN_IN', error: 'Sign in again to continue' };
		current.authExp = claims.expiresAt;
		current.nickname = claims.nickname;
		socket.serializeAttachment(current);
		return { ok: true, expiresAt: claims.expiresAt };
	}

	/** Public table summary for the club lobby. Sent only when it changes. */
	reportToLobby(room, closed = false) {
		if (!this.env.CLUB || !room) return;
		const summary = this.lobbySummary(room, closed);
		const key = JSON.stringify(summary);
		if (key === this.lastLobbyReport) return;
		this.lastLobbyReport = key;
		this.ctx.waitUntil(
			clubDirectory(this.env)
				.fetch('https://club.internal/table', { method: 'POST', body: key })
				.catch(() => { this.lastLobbyReport = null; })
		);
	}

	lobbySummary(room, closed = false) {
		const connected = this.connectedRoom(room.name);
		const seatedPlayers = room.players.filter((player) => player.seatNumber !== null && !player.departed);
		const memberIds = [...new Set(this.ctx.getWebSockets()
			.map((socket) => socket.deserializeAttachment())
			.filter((attachment) => attachment?.roomName === room.name && attachment.memberId)
			.map((attachment) => attachment.memberId))].sort();
		const host = room.players.find((player) => player.id === room.hostId);
		const summary = closed ? { name: room.name, closed: true } : {
			name: room.name,
			gameType: room.gameType ?? 'teen-patti',
			playerCount: seatedPlayers.length,
			botCount: seatedPlayers.filter((player) => player.bot).length,
			maxPlayers: MAX_PLAYERS,
			isStarted: playing(room),
			hostName: host?.username ?? null,
			boot: room.boot ?? null,
			table: room.table,
			connectedMembers: memberIds,
			anyoneConnected: connected.size > 0
		};
		return summary;
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

	/** The club's lineup for tonight, cached for a few seconds; empty when unreachable. */
	/** What settling the next game needs: tonight's lineup and a secure random draw. */
	async pickContext() {
		const lineup = await this.lineup();
		return { lineup, lineupHands: this.lineupCache?.hands ?? 1, randomInt: secureRandomInt };
	}

	async lineup() {
		const cached = this.lineupCache;
		if (cached && Date.now() - cached.at < 15000) return cached.lineup;
		try {
			const settings = await withClubDatabase(this.env, (db) => clubSettings(db));
			this.lineupCache = { at: Date.now(), lineup: settings.lineup ?? [], hands: settings.lineupHands ?? 1 };
		} catch {
			this.lineupCache = { at: Date.now(), lineup: cached?.lineup ?? [], hands: cached?.hands ?? 1 };
		}
		return this.lineupCache.lineup;
	}

	/** A player's view of the room, with tonight's lineup when there is one. */
	view(room, playerId, connected) {
		const view = projection(room, playerId, connected);
		if (this.lineupCache?.lineup?.length) {
			view.lineup = this.lineupCache.lineup;
			view.lineupHands = this.lineupCache.hands ?? 1;
		}
		return view;
	}

	idleCloseMs() {
		const value = Number(this.env.IDLE_CLOSE_MS ?? IDLE_CLOSE_MS);
		return Number.isSafeInteger(value) && value >= 1000 ? value : IDLE_CLOSE_MS;
	}

	/** People at the table right now: connected players plus seated bots (a solo game vs bots stays open). */
	peopleAtTable(room) {
		const bots = room.players.filter((player) => player.bot && player.seatNumber !== null && !player.departed).length;
		return this.connectedRoom(room.name).size + bots;
	}

	async isOwner(memberId) {
		try {
			return (await withClubDatabase(this.env, (db) => memberRole(db, memberId))) === 'owner';
		} catch {
			return false;
		}
	}

	/**
	 * A table just ended for the night: drop it from the club's live list, save the night for the
	 * club page, thank everyone who played by email, and close the table in 30 minutes (time to
	 * read the summary and settle up).
	 */
	async afterNight(room) {
		this.reportToLobby(room, true);
		this.setMeta('endedAt', Date.now());
		const night = { table: room.name, ...room.ended, endedAt: new Date(room.ended.at || Date.now()) };
		try {
			await withClubDatabase(this.env, async (db) => {
				await saveNight(db, night);
				if (!this.env.RESEND_API_KEY) return;
				const people = await membersForPlayers(db, room.ended.players.map((p) => p.id));
				const gameName = (version) => getVariant(version)?.name ?? version;
				for (const person of people) {
					if (!person.email) continue;
					const message = nightEmail({
						playerId: person.playerId,
						name: person.nickname || room.ended.players.find((p) => p.id === person.playerId)?.name,
						night: room.ended,
						gameName,
						appUrl: this.env.APP_URL ?? 'https://chaal.tech'
					});
					await sendWithResend({
						apiKey: this.env.RESEND_API_KEY,
						from: this.env.INVITE_FROM ?? 'Chaal <invites@chaal.tech>',
						emails: [person.email],
						message
					}).catch((error) => console.error('Night email failed:', error?.message ?? 'Error'));
				}
			});
		} catch (error) {
			console.error('Saving the night failed:', error?.code ?? error?.name ?? 'Error');
		}
		await this.scheduleAlarm();
	}

	/** An owner ends a table from the Admin page (they may not be sitting at it). */
	async endFromAdmin(request) {
		const stored = this.room();
		if (!stored) return json({ ok: true, closed: true });
		const before = stored.snapshot;
		if (before.ended) return json({ ok: true });
		const body = await request.json().catch(() => ({}));
		const mode = body?.mode === 'now' ? 'now' : 'after-hand';
		const actor = before.players.find((p) => p.seatNumber !== null && !p.departed && !p.bot);
		if (!actor || before.boot === undefined) {
			await this.closeTable(before, 'An owner closed this table.');
			return json({ ok: true, closed: true });
		}
		const recorder = stepRecorder({
			now: Date.now(),
			turnMs: this.turnMs(),
			connected: this.connectedRoom(before.name),
			canEnd: true
		});
		const room = transition(before, actor.id, 'endNight', { mode }, recorder.ctx);
		const commandId = `end:${before.revision}`;
		this.commit(room, actor.id, commandId, await hash(commandId), { ok: true }, movements(before, room, 'endNight'), before.revision,
			recorder.step(actor.id, 'endNight', { mode }, { kind: 'system', cause: 'admin-end' }));
		this.publish(room.name, room.ended ? 'The table has ended for the night' : 'The table ends after this hand');
		if (room.ended) await this.afterNight(room);
		return json({ ok: true, ending: !room.ended });
	}

	/** Tell everyone still here, then close the table for good. */
	async closeTable(room, reason) {
		this.abandonRecording(room);
		await this.flushHistory();
		if (this.hasPendingHistory()) {
			await this.ctx.storage.setAlarm(Date.now() + 60_000);
			return;
		}
		for (const socket of this.ctx.getWebSockets()) {
			if (socket.deserializeAttachment()?.roomName !== room.name) continue;
			this.sendEvent(socket, 'tableClosed', { text: reason });
			try { socket.close(4004, 'Table closed'); } catch { /* Already closed. */ }
		}
		this.reportToLobby(room, true);
		await this.ctx.storage.deleteAll();
		this.ensureSchema();
	}

	/** A hand still being recorded when its table closes becomes an explicit failure row. */
	abandonRecording(room) {
		const state = this.getMeta('recorder');
		const rows = abandonOpenHand(state, room.name);
		if (!rows.length) return;
		this.ctx.storage.transactionSync(() => {
			for (const row of rows)
				this.sql.exec('INSERT OR IGNORE INTO history_outbox(id,payload) VALUES (?,?)', row.id, JSON.stringify(row.payload));
			this.setMeta('recorder', { ...state, hand: { ...state.hand, failed: true, steps: [] } });
		});
	}

	turnMs() {
		const value = Number(this.env.TURN_TIMEOUT_MS ?? 90000);
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
		// Every random draw the bot makes is logged so its decision can be replayed exactly.
		const draws = botRandom(randomUint32);
		const decisionStarted = performance.now();
		const snapshots = new Map();
		let lookupMs = 0;
		const memoryMetrics = { episodeMs: null };
		// At most one actor: off-turn table/discard work has the same priority as the runner.
		const candidates = before.players.filter(p => p.bot && !p.departed && !p.isPacked && p.cards.length);
		const actor = candidates.find(p => { const l = projection(before, p.id, connected).legalActions; return l.discard || l.table?.length; })
			?? candidates.find(p => p.id === before.currentPlayerId);
		if (actor?.bot.style?.policy === ADAPTIVE_POLICY) {
			const scope = decisionScope(projection(before, actor.id, connected), actor.id, actor.bot.style.botId, this.getMeta('recorder'), Date.now());
			const loaded = await timedMemory(() => withClubDatabase(this.env, db => loadMemory(db, scope, memoryMetrics)), scope);
			snapshots.set(actor.id, loaded.snapshot);
			lookupMs = loaded.lookupMs;
		}
		// The room may have advanced while Mongo was in flight. Never apply an old decision.
		if (this.room()?.snapshot.revision !== before.revision) return false;
		const move = nextBotMove(before, connected, draws.random, undefined, id => snapshots.get(id));
		const timings = { lookupMs, episodeMs: memoryMetrics.episodeMs, decisionMs: performance.now() - decisionStarted };
		if (!move) return false;
		try {
			const recorder = stepRecorder({
				now: Date.now(),
				turnMs: this.turnMs(),
				connected,
				...(await this.pickContext())
			});
			const room = transition(before, move.botId, move.action, move.payload, recorder.ctx);
			const commandId = `bot:${before.handId}:${before.revision}`;
			const seal = await sealDeck(room);
			this.commit(room, move.botId, commandId, await hash(commandId), { ok: true }, movements(before, room, `bot-${move.action}`), before.revision,
				recorder.step(move.botId, move.action, move.payload, {
					kind: 'bot',
					bot: { seed: draws.seed, draws: draws.draws, reason: move.reason ?? null,
						...(move.adaptive ? { memory: move.memory, adaptive: move.adaptive, timings } : {}) },
					...(seal ? { seal } : {})
				}));
			if (room.ended && !before.ended) await this.afterNight(room);
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
		if (this.hasPendingHistory()) deadlines.push(Date.now() + 60_000);
		const botTurn = this.planBot(room);
		if (botTurn) deadlines.push(botTurn.at);
		if (playing(room) && Number.isSafeInteger(room.deadline)) deadlines.push(room.deadline);
		if (!playing(room) && room.chooser && !room.upNext) deadlines.push(room.chooser.deadline);
		const endedAt = this.getMeta('endedAt');
		if (endedAt) deadlines.push(endedAt + 30 * 60 * 1000);
		const hostRecovery = this.getMeta('hostRecovery');
		if (hostRecovery?.at) deadlines.push(hostRecovery.at);
		// Start (or stop) the idle clock: one or no players for idleCloseMs() closes the table.
		if (this.peopleAtTable(room) <= 1) {
			const since = this.getMeta('lonelySince') ?? Date.now();
			if (!this.getMeta('lonelySince')) this.setMeta('lonelySince', since);
			deadlines.push(since + this.idleCloseMs());
		} else if (this.getMeta('lonelySince')) this.deleteMeta('lonelySince');
		const connected = this.connectedRoom(room.name);
		if (connected.size === 0 && (!room.isStarted || room.gameShow) && !this.hasPendingHistory()) {
			const joiners = new Set(room.players.map((player) => player.id)).size;
			deadlines.push(stored.updatedAt + (joiners < 3 ? SMALL_ROOM_RETENTION_MS : ROOM_RETENTION_MS));
		}
		if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(Date.now(), Math.min(...deadlines)));
		else await this.ctx.storage.deleteAlarm();
	}

	async alarm() {
		await this.flushHistory();
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
				const recorder = stepRecorder({
					now,
					turnMs: this.turnMs(),
					connected: this.connectedRoom(room.name),
					...(await this.pickContext()),
					recycledDeck: before.gameType === 'rummy' && before.deck.length === 0 && before.discardPile.length > 1
						? shuffle(before.discardPile.slice(0, -1))
						: undefined
				});
				room = transition(before, before.currentPlayerId, 'timeout', {}, recorder.ctx);
				const commandId = `timeout:${before.handId}:${before.revision}`;
				const seal = await sealDeck(room);
				this.commit(room, before.currentPlayerId, commandId, await hash(commandId), { ok: true }, movements(before, room, 'timeout'), before.revision,
					recorder.step(before.currentPlayerId, 'timeout', {}, { kind: 'system', cause: 'timeout', ...(seal ? { seal } : {}) }));
				if (room.ended && !before.ended) await this.afterNight(room);
				changed = true;
				announcement = room.result
					? `${room.result.winnerName} won ${room.result.amount} chips`
					: 'Turn timed out; player packed';
			} catch (error) {
				console.error('Cloudflare turn recovery failed:', error?.code ?? error?.name ?? 'Error');
			}
		}

		// A pick window that ran out with no pick: settle the next game so everyone sees it.
		if (!playing(room) && room.chooser && !room.upNext && room.chooser.deadline <= now) {
			try {
				// The committed snapshot, exactly as the recorder will replay it.
				const before = this.room().snapshot;
				const actor = before.players.find((p) => p.seatNumber !== null && !p.departed && !p.bot);
				if (actor) {
					const recorder = stepRecorder({
						now,
						turnMs: this.turnMs(),
						connected: this.connectedRoom(room.name),
						...(await this.pickContext())
					});
					room = transition(before, actor.id, 'settleNext', {}, recorder.ctx);
					const commandId = `settle:${before.chooser.handId}:${before.revision}`;
					const seal = await sealDeck(room);
					this.commit(room, actor.id, commandId, await hash(commandId), { ok: true }, null, before.revision,
						recorder.step(actor.id, 'settleNext', {}, { kind: 'system', cause: 'pick-timeout', ...(seal ? { seal } : {}) }));
					changed = true;
				}
			} catch (error) {
				console.error('Cloudflare next-game settle failed:', error?.code ?? error?.name ?? 'Error');
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
					const before = this.room().snapshot;
					room = { ...before, hostId: nextHost.id, revision: before.revision + 1 };
					const commandId = crypto.randomUUID();
					this.commit(room, recovery.hostId, commandId, await hash(JSON.stringify({ event: 'hostRecovery', hostId: recovery.hostId, nextHost: nextHost.id, revision: before.revision })), { ok: true, roomName: room.name, revision: room.revision, handId: room.handId }, null, before.revision,
						{ actor: recovery.hostId, action: 'hostRecovery', payload: { hostId: nextHost.id }, ctx: {}, kind: 'system', cause: 'host-recovery' });
					announcement = `${nextHost.username} is now the room host`;
					changed = true;
				}
			}
			this.deleteMeta('hostRecovery');
		}

		const endedAt = this.getMeta('endedAt');
		if (endedAt && endedAt + 30 * 60 * 1000 <= now && this.room()) {
			await this.closeTable(this.room().snapshot, 'This table has ended for the night. See you next time!');
			return;
		}

		const lonelySince = this.getMeta('lonelySince');
		const current = this.room();
		if (current && lonelySince && lonelySince + this.idleCloseMs() <= now && this.peopleAtTable(current.snapshot) <= 1) {
			await this.closeTable(current.snapshot, 'This table closed: nobody else was here for 5 minutes.');
			return;
		}

		const latest = this.room();
		if (latest && this.connectedRoom(latest.snapshot.name).size === 0 && (!latest.snapshot.isStarted || latest.snapshot.gameShow)) {
			const joiners = new Set(latest.snapshot.players.map((player) => player.id)).size;
			const retentionMs = joiners < 3 ? SMALL_ROOM_RETENTION_MS : ROOM_RETENTION_MS;
			if (latest.updatedAt + retentionMs <= now && !this.hasPendingHistory()) {
				this.reportToLobby(latest.snapshot, true);
				await this.ctx.storage.deleteAll();
		this.ensureSchema();
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
	async invites(socket, attachment, event, [requestedRoom, emails, memberIds]) {
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
			// Friends picked from the club list arrive as member IDs; their emails stay on the server.
			const picked = Array.isArray(memberIds) && memberIds.length
				? await withClubDatabase(this.env, (db) => emailsForMembers(db, memberIds.slice(0, 20)))
				: null;
			const requested = inviteEmails(picked ?? emails);
			const members = await withClubDatabase(this.env, (db) => invitableEmails(db, requested));
			const outsiders = requested.filter((email) => !members.includes(email));
			if (!members.length)
				throw new GameError('Only club members can be invited. Ask the club owner to add them first.', 'NOT_MEMBER_EMAIL');
			const plan = planInvites(this.getMeta('invites'), members, player.id, Date.now());
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
			return { ok: true, sent: plan.send, skipped: plan.skipped, notMembers: outsiders, invites: invited() };
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
