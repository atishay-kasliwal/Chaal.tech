import { hmacSha256, toHex } from '../random.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

/** A signed-in club member on this device. Membership is rechecked each time it is exchanged. */
export const CLUB_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
/** What the game itself accepts. Short, so suspension and sign-out take effect within minutes. */
export const GAME_TOKEN_LIFETIME_SECONDS = 5 * 60;
const MEMBER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PLAYER_ID_PATTERN = /^[a-f0-9-]{36}$/;

async function verifySigned(token, secret, now) {
	if (!validSecret(secret) || typeof token !== 'string' || token.length > 2048) return null;
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
		if (!Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
		return payload;
	} catch {
		return null;
	}
}

export async function issueClubToken(secret, { memberId, version }, now = Date.now()) {
	if (!validSecret(secret)) throw new Error('SESSION_SECRET must contain at least 32 bytes');
	const iat = Math.floor(now / 1000);
	return signedPayload({ typ: 'club', mid: memberId, sv: version, iat, exp: iat + CLUB_TOKEN_LIFETIME_SECONDS }, secret);
}

export async function verifyClubToken(token, secret, now = Date.now()) {
	const payload = await verifySigned(token, secret, now);
	if (payload?.typ !== 'club' || !MEMBER_ID_PATTERN.test(payload.mid ?? '') || !Number.isSafeInteger(payload.sv))
		return null;
	return { memberId: payload.mid, version: payload.sv };
}

/** The game credential: the stable player ID plus the profile fields the table may show. */
export async function issueGameToken(secret, { playerId, memberId, nickname, characterId }, now = Date.now()) {
	if (!validSecret(secret)) throw new Error('SESSION_SECRET must contain at least 32 bytes');
	const iat = Math.floor(now / 1000);
	const exp = iat + GAME_TOKEN_LIFETIME_SECONDS;
	const token = await signedPayload(
		{ typ: 'game', sub: playerId, mid: memberId, name: nickname, chr: characterId, iat, exp },
		secret
	);
	return { token, playerId, expiresAt: exp * 1000 };
}

export async function verifyGameToken(token, secret, now = Date.now()) {
	const payload = await verifySigned(token, secret, now);
	if (payload?.typ !== 'game' || !PLAYER_ID_PATTERN.test(payload.sub ?? '') || !MEMBER_ID_PATTERN.test(payload.mid ?? ''))
		return null;
	return {
		playerId: payload.sub,
		memberId: payload.mid,
		nickname: typeof payload.name === 'string' ? payload.name.slice(0, 24) : '',
		characterId: typeof payload.chr === 'string' ? payload.chr.slice(0, 32) : '',
		expiresAt: payload.exp * 1000
	};
}

/** Only game credentials are sessions now; the old anonymous guest tokens are not accepted. */
export async function verifySession(token, secret, now = Date.now()) {
	return (await verifyGameToken(token, secret, now))?.playerId ?? null;
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
