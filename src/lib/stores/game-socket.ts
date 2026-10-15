type Handler = (...args: unknown[]) => void;
type Reply = { ok: boolean; error?: string; code?: string; roomName?: string };
type Pending = { resolve: (value: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type WireEvent = { type: 'event'; event: string; args?: unknown[] };
type WireAck = { type: 'ack'; id: string; result: Reply };

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

	constructor(
		private readonly endpoint: string,
		private readonly getToken: () => string | undefined,
		private readonly onSession: (session: { token: string; playerId: string }) => void
	) {}

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
			const headers = new Headers({ 'Content-Type': 'application/json' });
			const token = this.getToken();
			if (token) headers.set('Authorization', `Bearer ${token}`);
			const response = await fetch(`${this.endpoint}/session`, { method: 'POST', headers, body: '{}' });
			const session = await response.json();
			if (!response.ok || typeof session.token !== 'string' || typeof session.playerId !== 'string')
				throw new Error(session.error || 'Could not start a player session');
			this.onSession(session);
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
				this.dispatch('disconnect');
				if (!this.intentionalClose && event.code !== 4001) this.scheduleReconnect();
			});
		} catch (error) {
			this.connected = false;
			this.dispatch('connect_error', error instanceof Error ? error : new Error('Game connection failed'));
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
		return { emitWithAck: (event: string, ...args: unknown[]) => this.request(event, args, milliseconds) };
	}

	emitWithAck(event: string, ...args: unknown[]): Promise<Reply> {
		return this.request(event, args, 8000);
	}

	private async request(event: string, args: unknown[], timeout: number): Promise<Reply> {
		let meta: Record<string, unknown> | undefined;
		const tail = args.at(-1);
		if (tail && typeof tail === 'object' && 'commandId' in tail) meta = args.pop() as Record<string, unknown>;
		if (event === 'createRoom' && !this.roomName) {
			const token = this.getToken();
			if (!token) return { ok: false, error: 'Player session is not ready' };
			try {
				const response = await fetch(`${this.endpoint}/rooms`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({ event, args, meta })
				});
				return await response.json();
			} catch {
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
