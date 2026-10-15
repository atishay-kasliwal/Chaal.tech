import { browser } from '$app/env';
import { serverConfigError, serverURL } from '#lib/config.js';
import { GameSocket } from './game-socket.js';

interface Reply {
	ok: boolean;
	error?: string;
	code?: string;
	roomName?: string;
}
const sessionKey = 'teen-patti-session-v1';

class SocketStore {
	connected = $state(false);
	playerId = $state('');
	roomData = $state<RoomData | null>(null);
	error = $state('');
	private roomName = '';
	private token: string | undefined;
	socket: GameSocket;

	constructor() {
		this.socket = new GameSocket(serverURL, () => this.token, (session) => {
			this.token = session.token;
			this.playerId = session.playerId;
			try {
				localStorage.setItem(sessionKey, session.token);
			} catch {
				/* Refresh recovery requires browser storage. */
			}
		});
		if (browser) {
			try {
				this.token = localStorage.getItem(sessionKey) || undefined;
			} catch {
				/* Memory-only session if storage is unavailable. */
			}
		}
		this.socket.on('connect', () => {
			this.connected = true;
			this.error = '';
			if (this.roomName) this.resume();
		});
		this.socket.on('roomData', (value: unknown) => {
			if (!value || typeof value !== 'object') return;
			const snapshot = value as RoomData;
			if (snapshot.name !== this.roomName) return;
			// The owned server sends complete recipient views. Replacement clears old hands.
			this.roomData = snapshot;
			this.playerId = snapshot.selfId;
		});
		this.socket.on('disconnect', () => {
			this.connected = false;
		});
		this.socket.on('connect_error', (error: unknown) => {
			this.error = error instanceof Error ? error.message : 'Game connection failed';
		});
		this.socket.on('sessionReplaced', () => {
			this.error = 'This player is connected in another tab. Reconnect here to take over.';
			this.connected = false;
		});
	}

	connect() {
		if (!serverURL) {
			this.error = serverConfigError;
			return;
		}
		if (!this.socket.connected) this.socket.connect(this.roomName);
	}
	disconnect() {
		this.socket.disconnect();
		this.connected = false;
	}

	enterRoom(name: string) {
		if (this.roomName !== name) this.roomData = null;
		this.roomName = name;
		if (!serverURL) {
			this.error = serverConfigError;
			return;
		}
		this.socket.connect(name);
	}

	private resume() {
		void this.socket
			.timeout(8000)
			.emitWithAck('resumeRoom', this.roomName)
			.then((reply: Reply) => {
				if (!reply.ok && reply.code !== 'NOT_MEMBER')
					this.error = reply.error || 'Could not restore the room';
			})
			.catch(() => {
				this.error = 'Could not restore the room. Reconnect to try again.';
			});
	}

	async command(event: string, args: unknown[] = [], needsState = true): Promise<Reply> {
		if (!this.connected) return { ok: false, error: 'Reconnecting — wait before playing' };
		const snapshot = this.roomData;
		if (needsState && !snapshot) return { ok: false, error: 'Waiting for the room state' };
		const meta = {
			commandId: crypto.randomUUID(),
			expectedRevision: needsState ? snapshot?.revision : undefined,
			handId: needsState ? snapshot?.handId : undefined
		};
		// Retry only the same command ID. A lost acknowledgement cannot double a bet.
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const reply = await this.socket.timeout(8000).emitWithAck(event, ...args, meta);
				if (reply.ok && event === 'leaveRoom') {
					this.roomName = '';
					this.roomData = null;
					this.socket.clearRoom();
				}
				return reply;
			} catch {
				if (!this.connected) break;
			}
		}
		return {
			ok: false,
			error: 'No acknowledgement. Reconnect and review the current state before playing.'
		};
	}
}

export const socket = new SocketStore();
