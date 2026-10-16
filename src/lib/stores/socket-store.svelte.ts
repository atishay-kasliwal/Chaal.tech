import { browser } from '$app/env';
import { serverConfigError, serverURL } from '#lib/config.js';
import { GameSocket, SignInRequired } from './game-socket.js';
import { club } from '#lib/club/club.svelte.js';

interface Reply {
	ok: boolean;
	error?: string;
	code?: string;
	roomName?: string;
}
/** Anonymous guest sessions from before the private club. Removed on sight. */
const legacySessionKey = 'teen-patti-session-v1';

class SocketStore {
	connected = $state(false);
	playerId = $state('');
	roomData = $state<RoomData | null>(null);
	error = $state('');
	/** Set when the server closed this table (nobody else there for 5 minutes). */
	tableClosed = $state('');
	private roomName = '';
	socket: GameSocket;

	constructor() {
		// The game credential stays in memory; only the club sign-in is kept on the device.
		this.socket = new GameSocket(
			serverURL,
			() => club.token,
			(session) => {
				this.playerId = session.playerId;
			}
		);
		if (browser) {
			try {
				localStorage.removeItem(legacySessionKey);
			} catch {
				/* Nothing stored. */
			}
		}
		club.onSignOut(() => {
			this.roomName = '';
			this.roomData = null;
			this.playerId = '';
			this.connected = false;
			this.error = '';
			this.socket.forgetSession();
		});
		this.socket.on('signInRequired', (error: unknown) => {
			this.connected = false;
			club.expire(error instanceof SignInRequired ? error : undefined);
		});
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
		this.socket.on('tableClosed', (value: unknown) => {
			const text = (value as { text?: string } | undefined)?.text;
			this.tableClosed = text || 'This table closed.';
			this.connected = false;
		});
		this.socket.on('sessionReplaced', () => {
			this.error = 'You continued in another tab or device. Reconnect here to take over.';
			this.connected = false;
		});
	}

	/** A members-only HTTP call to the game service, with a fresh game credential. */
	async authorizedFetch(path: string, init: RequestInit = {}) {
		let token: string;
		try {
			token = await this.socket.gameToken();
		} catch (error) {
			if (error instanceof SignInRequired) club.expire(error);
			throw error;
		}
		const headers = new Headers(init.headers);
		headers.set('Authorization', `Bearer ${token}`);
		return fetch(`${serverURL}${path}`, { ...init, headers });
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
		this.tableClosed = '';
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
