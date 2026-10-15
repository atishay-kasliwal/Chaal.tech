import { hmacSha256, toHex } from '../random.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOKEN_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

function encodeBase64Url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64Url(value) {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validSecret(secret) {
	return typeof secret === 'string' && new TextEncoder().encode(secret).length >= 32;
}

async function signedPayload(payload, secret) {
	const content = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
	const signature = await hmacSha256(secret, content);
	return `${content}.${encodeBase64Url(signature)}`;
}

export async function issueSession(secret, now = Date.now()) {
	if (!validSecret(secret)) throw new Error('SESSION_SECRET must contain at least 32 bytes');
	const playerId = crypto.randomUUID();
	const token = await signedPayload(
		{ sub: playerId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS },
		secret
	);
	return { token, playerId };
}

export async function verifySession(token, secret, now = Date.now()) {
	if (!validSecret(secret) || typeof token !== 'string' || token.length > 1024) return null;
	const parts = token.split('.');
	if (parts.length !== 2) return null;
	try {
		const signature = await hmacSha256(secret, parts[0]);
		const presented = decodeBase64Url(parts[1]);
		if (presented.length !== signature.length) return null;
		let difference = 0;
		for (let index = 0; index < signature.length; index++) difference |= signature[index] ^ presented[index];
		if (difference !== 0) return null;
		const payload = JSON.parse(decoder.decode(decodeBase64Url(parts[0])));
		if (
			typeof payload.sub !== 'string' ||
			!/^[a-f0-9-]{36}$/.test(payload.sub) ||
			!Number.isSafeInteger(payload.exp) ||
			payload.exp <= Math.floor(now / 1000)
		)
			return null;
		return payload.sub;
	} catch {
		return null;
	}
}

export async function roomCodeFor(secret, playerId, commandId) {
	if (!validSecret(secret)) throw new Error('SESSION_SECRET must contain at least 32 bytes');
	const digest = await hmacSha256(secret, `room:${playerId}:${commandId}`);
	return toHex(digest.subarray(0, 16));
}

export function tokenFromWebSocketProtocols(header) {
	if (!header) return null;
	const authProtocol = header
		.split(',')
		.map((protocol) => protocol.trim())
		.find((protocol) => protocol.startsWith('chaal-auth.'));
	return authProtocol ? authProtocol.slice('chaal-auth.'.length) : null;
}
