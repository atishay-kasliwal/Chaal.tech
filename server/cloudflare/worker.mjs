import { roomName } from '../engine.mjs';
import { issueSession, verifySession, roomCodeFor, tokenFromWebSocketProtocols } from './security.mjs';
import { RoomDurableObject } from './room-object.mjs';

export { RoomDurableObject };

const DEFAULT_ORIGINS = [
	'https://chaal.tech',
	'https://www.chaal.tech',
	'https://chaal-tech.pages.dev',
	'http://localhost:5173',
	'http://127.0.0.1:5173',
	'http://localhost:5174',
	'http://127.0.0.1:5174'
];

function response(body, status = 200, origin = null, env = {}) {
	const headers = new Headers({
		'Content-Type': 'application/json',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff'
	});
	if (origin && allowedOrigins(env).includes(origin)) {
		headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Access-Control-Allow-Credentials', 'true');
		headers.set('Vary', 'Origin');
	}
	return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigins(env) {
	const configured = typeof env.ALLOWED_ORIGINS === 'string'
		? env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
		: [];
	return configured.length ? configured : DEFAULT_ORIGINS;
}

function originAllowed(request, env, requireOrigin = false) {
	const origin = request.headers.get('Origin');
	return origin ? allowedOrigins(env).includes(origin) : !requireOrigin;
}

function bearer(request) {
	const value = request.headers.get('Authorization') ?? '';
	return value.startsWith('Bearer ') ? value.slice(7) : null;
}

async function authenticatedPlayer(request, env) {
	return verifySession(bearer(request), env.SESSION_SECRET);
}

function roomStub(env, name) {
	return env.ROOMS.get(env.ROOMS.idFromName(name));
}

async function jsonBody(request) {
	try {
		const text = await request.text();
		if (text.length > 8192) return null;
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const origin = request.headers.get('Origin');
		if (origin && !originAllowed(request, env)) return response({ error: 'Origin not allowed' }, 403);
		if (request.method === 'OPTIONS') {
			if (!originAllowed(request, env, true)) return response({ error: 'Origin not allowed' }, 403);
			const result = new Response(null, { status: 204, headers: {
				'Access-Control-Allow-Origin': origin,
				'Access-Control-Allow-Credentials': 'true',
				'Vary': 'Origin'
			} });
			result.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			result.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
			result.headers.set('Access-Control-Max-Age', '86400');
			return result;
		}
		if (url.pathname === '/health' && request.method === 'GET')
			return response({ ok: true, service: 'chaal-game' }, 200, origin, env);
		if (url.pathname === '/ready' && request.method === 'GET')
			return response({ ok: true, storage: 'durable-objects' }, 200, origin, env);
		if (url.pathname === '/session' && request.method === 'POST') {
			if (!env.SESSION_SECRET) return response({ error: 'Game service is not configured' }, 503, origin, env);
			const previousToken = bearer(request);
			const existingPlayer = await verifySession(previousToken, env.SESSION_SECRET);
			if (existingPlayer) return response({ token: previousToken, playerId: existingPlayer }, 200, origin, env);
			try {
				return response(await issueSession(env.SESSION_SECRET), 200, origin, env);
			} catch {
				return response({ error: 'Game service is not configured' }, 503, origin, env);
			}
		}
		if (url.pathname === '/rooms' && request.method === 'POST') {
			const playerId = await authenticatedPlayer(request, env);
			if (!playerId) return response({ error: 'Invalid session' }, 401, origin, env);
			const body = await jsonBody(request);
			if (!body || body.event !== 'createRoom' || !Array.isArray(body.args) || !body.meta?.commandId)
				return response({ error: 'Invalid room request' }, 400, origin, env);
			try {
				const name = await roomCodeFor(env.SESSION_SECRET, playerId, body.meta.commandId);
				const stub = roomStub(env, name);
				const internal = new Request('https://room.internal/create', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'x-chaal-player-id': playerId },
					body: JSON.stringify({ name, args: body.args, meta: body.meta })
				});
				const result = await stub.fetch(internal);
				const data = await result.json();
				return response(data, result.status, origin, env);
			} catch {
				return response({ error: 'Game service unavailable' }, 503, origin, env);
			}
		}

		const roomMatch = /^\/room\/([^/]+)$/.exec(url.pathname);
		if (roomMatch && request.method === 'GET') {
			try {
				const name = roomName(decodeURIComponent(roomMatch[1]));
				const result = await roomStub(env, name).fetch('https://room.internal/room');
				const data = await result.json();
				return response(data, result.status, origin, env);
			} catch {
				return response({ error: 'Invalid room name' }, 400, origin, env);
			}
		}

		const socketMatch = /^\/socket\/([^/]+)$/.exec(url.pathname);
		if (socketMatch && request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
			// Browsers always send Origin; non-browser clients may omit it but still need a signed token.
			if (!originAllowed(request, env)) return response({ error: 'Origin not allowed' }, 403, origin, env);
			const token = tokenFromWebSocketProtocols(request.headers.get('Sec-WebSocket-Protocol'));
			const playerId = await verifySession(token, env.SESSION_SECRET);
			if (!playerId) return response({ error: 'Invalid session' }, 401, origin, env);
			try {
				const name = roomName(decodeURIComponent(socketMatch[1]));
				const headers = new Headers(request.headers);
				headers.set('x-chaal-player-id', playerId);
				headers.set('Sec-WebSocket-Protocol', 'chaal.v1');
				return await roomStub(env, name).fetch(new Request(request, { headers }));
			} catch {
				return response({ error: 'Invalid room name' }, 400, origin, env);
			}
		}
		return response({ error: 'Not found' }, 404, origin, env);
	}
};
