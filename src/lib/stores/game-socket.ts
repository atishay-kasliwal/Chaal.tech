type Handler = (...args: unknown[]) => void;
type Reply = { ok: boolean; error?: string; code?: string; roomName?: string };
type Pending = {
	resolve: (value: Reply) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};
type WireEvent = { type: 'event'; event: string; args?: unknown[] };
type WireAck = { type: 'ack'; id: string; result: Reply };
export type GameSession = { token: string; playerId: string; expiresAt?: number; member?: unknown };
/** Thrown when the club sign-in itself is gone (signed out, suspended, expired). */
export class SignInRequired extends Error {
	constructor(
		message: string,
		readonly code: string
	) {
		super(message);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** The small event/ack surface used by the existing room UI, carried over native WebSockets. */
export class GameSocket {
	connected = false;
	private ws: WebSocket | null = null;
	private roomName = '';
	private intentionalClose = true;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempt = 0;
	private listeners = new Map<string, Set<Handler>>();
	private pending = new Map<string, Pending>();
	private session: GameSession | null = null;
	private sessionRequest: Promise<GameSession> | null = null;
	private renewTimer: ReturnType<typeof setTimeout> | null = null;

	/** `getToken` returns the club sign-in; it is exchanged for short-lived game credentials. */
	constructor(
		private readonly endpoint: string,
		private readonly getToken: () => string | undefined,
		private readonly onSession: (session: GameSession) => void
	) {}

	/** A game credential with at least a minute left, fetched fresh when needed. */
	async gameToken(): Promise<string> {
		const current = this.session;
		if (current && (current.expiresAt ?? Infinity) - Date.now() > 60_000) return current.token;
		return (await this.renewSession()).token;
	}

	private renewSession(): Promise<GameSession> {
		this.sessionRequest ??= this.fetchSession().finally(() => (this.sessionRequest = null));
		return this.sessionRequest;
	}

	private async fetchSession(): Promise<GameSession> {
		const clubToken = this.getToken();
		if (!clubToken) throw new SignInRequired('Sign in to play', 'SIGN_IN');
		const response = await fetch(`${this.endpoint}/session`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clubToken}` },
			body: '{}'
		});
		const session = await response.json().catch(() => ({}));
		if (response.status === 401 || response.status === 403)
			throw new SignInRequired(
				session.error || 'Sign in again to continue',
				session.code || 'SIGN_IN'
			);
		if (!response.ok || typeof session.token !== 'string' || typeof session.playerId !== 'string')
			throw new Error(session.error || 'Could not start a player session');
		this.session = session;
		this.onSession(session);
		this.scheduleRenewal();
		return session;
	}

	/** Renew a minute before expiry and hand the new credential to the open socket. */
	private scheduleRenewal() {
		if (this.renewTimer) clearTimeout(this.renewTimer);
		const expiresAt = this.session?.expiresAt;
		if (!expiresAt || this.intentionalClose) return;
		this.renewTimer = setTimeout(
			() => {
				this.renewTimer = null;
				if (this.intentionalClose) return;
				void this.renewSession()
					.then((session) => {
						const socket = this.ws;
						if (socket?.readyState === WebSocket.OPEN)
							socket.send(
								JSON.stringify({
									type: 'event',
									id: crypto.randomUUID(),
									event: 'renewAuth',
									args: [session.token]
								})
							);
					})
					.catch((error) => {
						if (error instanceof SignInRequired) return this.signInRequired(error);
						// Offline for a moment: retry; if the credential lapses the server asks us to reconnect.
						this.renewTimer = setTimeout(() => this.scheduleRenewal(), 15_000);
					});
			},
			Math.max(5_000, expiresAt - Date.now() - 60_000)
		);
	}

	/** Signed out or switched account: nothing from the previous member may be reused. */
	forgetSession() {
		this.clearRoom();
		this.session = null;
	}

	private signInRequired(error: SignInRequired) {
		this.disconnect();
		this.session = null;
		this.dispatch('signInRequired', error);
	}

	on(event: string, handler: Handler) {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event)?.add(handler);
		return this;
	}

	private dispatch(event: string, ...args: unknown[]) {
		for (const handler of this.listeners.get(event) ?? []) handler(...args);
	}

	connect(roomName = this.roomName) {
		if (roomName !== this.roomName) {
			const wasConnected = this.connected;
			this.ws?.close(1000, 'Switching rooms');
			this.ws = null;
			this.connected = false;
			if (wasConnected) this.dispatch('disconnect');
		}
		this.roomName = roomName;
		this.intentionalClose = false;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		void this.open();
	}

	private async open() {
		if (!this.endpoint) {
			this.dispatch('connect_error', new Error('Game service URL is not configured'));
			return;
		}
		try {
			// Every connection starts from a fresh membership check.
			const session = await this.renewSession();
			if (this.intentionalClose) return;
			if (!this.roomName) {
				this.connected = true;
				this.dispatch('connect');
				return;
			}
			const socketUrl = new URL(`/socket/${encodeURIComponent(this.roomName)}`, this.endpoint);
			socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
			const socket = new WebSocket(socketUrl, ['chaal.v1', `chaal-auth.${session.token}`]);
			this.ws = socket;
			socket.addEventListener('open', () => {
				if (this.ws !== socket || this.intentionalClose) return socket.close();
				this.reconnectAttempt = 0;
				this.connected = true;
				this.dispatch('connect');
			});
			socket.addEventListener('message', (message) => this.receive(socket, message.data));
			socket.addEventListener('error', () => {
				if (this.ws === socket) this.dispatch('connect_error', new Error('Game connection failed'));
			});
			socket.addEventListener('close', (event) => {
				if (this.ws !== socket) return;
				this.ws = null;
				this.connected = false;
				this.rejectPending(new Error('Game connection closed'));
				if (event.code === 4001) this.dispatch('sessionReplaced');
				// 4003: the credential lapsed (e.g. the laptop slept). Reconnect with a fresh one.
				if (event.code === 4003) this.session = null;
				this.dispatch('disconnect');
				if (!this.intentionalClose && event.code !== 4001) this.scheduleReconnect();
			});
		} catch (error) {
			this.connected = false;
			if (error instanceof SignInRequired) return this.signInRequired(error);
			this.dispatch(
				'connect_error',
				error instanceof Error ? error : new Error('Game connection failed')
			);
			if (!this.intentionalClose) this.scheduleReconnect();
		}
	}

	private receive(socket: WebSocket, data: unknown) {
		if (this.ws !== socket || typeof data !== 'string') return;
		let packet: unknown;
		try {
			packet = JSON.parse(data);
		} catch {
			socket.close(1007, 'Invalid server response');
			return;
		}
		if (isRecord(packet) && packet.type === 'event' && typeof packet.event === 'string') {
			const event = packet as WireEvent;
			this.dispatch(event.event, ...(Array.isArray(event.args) ? event.args : []));
		} else if (isRecord(packet) && packet.type === 'ack' && typeof packet.id === 'string') {
			const ack = packet as WireAck;
			const pending = this.pending.get(ack.id);
			if (!pending) return;
			clearTimeout(pending.timer);
			this.pending.delete(ack.id);
			pending.resolve(ack.result ?? { ok: false, error: 'Invalid game response' });
		}
	}

	private scheduleReconnect() {
		if (this.reconnectTimer || this.intentionalClose) return;
		const delay = Math.min(500 * 2 ** this.reconnectAttempt++, 5000);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.open();
		}, delay);
	}

	disconnect() {
		this.intentionalClose = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		if (this.renewTimer) clearTimeout(this.renewTimer);
		this.renewTimer = null;
		const socket = this.ws;
		this.ws = null;
		this.connected = false;
		this.rejectPending(new Error('Game connection closed'));
		socket?.close(1000, 'Client left room');
	}

	clearRoom() {
		this.roomName = '';
		this.disconnect();
	}

	timeout(milliseconds: number) {
		return {
			emitWithAck: (event: string, ...args: unknown[]) => this.request(event, args, milliseconds)
		};
	}

	emitWithAck(event: string, ...args: unknown[]): Promise<Reply> {
		return this.request(event, args, 8000);
	}

	private async request(event: string, args: unknown[], timeout: number): Promise<Reply> {
		let meta: Record<string, unknown> | undefined;
		const tail = args.at(-1);
		if (tail && typeof tail === 'object' && 'commandId' in tail)
			meta = args.pop() as Record<string, unknown>;
		if (event === 'createRoom' && !this.roomName) {
			try {
				const token = await this.gameToken();
				const response = await fetch(`${this.endpoint}/rooms`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({ event, args, meta })
				});
				return await response.json();
			} catch (error) {
				if (error instanceof SignInRequired) {
					this.signInRequired(error);
					return { ok: false, code: error.code, error: error.message };
				}
				return { ok: false, error: 'Could not create the room. Check your connection and retry.' };
			}
		}
		const socket = this.ws;
		if (!socket || socket.readyState !== WebSocket.OPEN)
			return { ok: false, error: 'Reconnecting — wait before playing' };
		const id = crypto.randomUUID();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error('Game action timed out'));
			}, timeout);
			this.pending.set(id, { resolve, reject, timer });
			try {
				socket.send(JSON.stringify({ type: 'event', id, event, args, ...(meta ? { meta } : {}) }));
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error instanceof Error ? error : new Error('Could not send game action'));
			}
		});
	}

	private rejectPending(error: Error) {
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(error);
			this.pending.delete(id);
		}
	}
}
