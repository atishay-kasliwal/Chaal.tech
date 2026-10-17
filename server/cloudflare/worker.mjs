import { clubHistory } from '../club/history.mjs';
import { roomName } from '../engine.mjs';
import {
	issueClubToken,
	verifyClubToken,
	issueGameToken,
	verifyGameToken,
	roomCodeFor,
	tokenFromWebSocketProtocols
} from './security.mjs';
import { RoomDurableObject } from './room-object.mjs';
import { ClubDirectory, clubDirectory } from './club-directory.mjs';
import {
	ClubError,
	withClubDatabase,
	claimMembership,
	memberById,
	assertActive,
	publicProfile,
	updateProfile,
	activeRoster
} from '../club/members.mjs';
import { verifyGoogleCredential } from '../club/google.mjs';
import {
	clubSettings,
	saveClubSettings,
	adminMembers,
	addMember,
	setMemberPaused,
	setMemberRole,
	betaDecision,
	sendDueBeta,
	sendDueBetaToAll,
	resetGameNight,
	saveLineup,
	decideGameNight
} from '../club/admin.mjs';
import { openPoll, publicPoll, saveAvailability, pollSummary } from '../club/availability.mjs';
import { sendAddedEmail } from '../club/beta-emails.mjs';

export { RoomDurableObject, ClubDirectory };

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
	const configured =
		typeof env.ALLOWED_ORIGINS === 'string'
			? env.ALLOWED_ORIGINS.split(',')
					.map((value) => value.trim())
					.filter(Boolean)
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

/** A game credential: the stable player plus the member it was issued to. */
async function authenticatedPlayer(request, env) {
	return verifyGameToken(bearer(request), env.SESSION_SECRET);
}

/** Trusted identity for the room object. Only the Worker sets these headers. */
function identityHeaders(headers, player) {
	headers.set('x-chaal-player-id', player.playerId);
	headers.set('x-chaal-member-id', player.memberId);
	headers.set('x-chaal-nickname', encodeURIComponent(player.nickname));
	headers.set('x-chaal-character', player.characterId);
	headers.set('x-chaal-auth-exp', String(player.expiresAt));
	return headers;
}

/** The signed-in member, read fresh from the guest list. Fails closed when the list is unreachable. */
async function signedInMember(request, env, db) {
	const club = await verifyClubToken(bearer(request), env.SESSION_SECRET);
	if (!club) throw new ClubError('Sign in to continue.', 'SIGN_IN', 401);
	const member = assertActive(await memberById(db, club.memberId));
	if ((member.sessionVersion ?? 1) !== club.version)
		throw new ClubError('Sign in again to continue.', 'SIGN_IN', 401);
	return member;
}

/** The signed-in member, only if they are an owner. */
async function signedInOwner(request, env, db) {
	const member = await signedInMember(request, env, db);
	if (member.role !== 'owner')
		throw new ClubError('Only club owners can do that.', 'FORBIDDEN', 403);
	return member;
}

function betaSettings(env) {
	return {
		apiKey: env.RESEND_API_KEY,
		from: env.BETA_FROM || env.INVITE_FROM || 'Chaal <invites@chaal.tech>',
		formUrl: env.BETA_FORM_URL,
		appUrl: env.PUBLIC_APP_URL || 'https://chaal.tech',
		// Signs each person's game-night link.
		secret: env.SESSION_SECRET
	};
}

/** Everything the Admin page shows, read fresh. */
async function adminState(env, db) {
	const [members, settings, beta, poll, lobby] = await Promise.all([
		adminMembers(db),
		clubSettings(db),
		betaDecision(db, betaSettings(env).appUrl),
		pollSummary(db, env.SESSION_SECRET, betaSettings(env).appUrl),
		clubDirectory(env)
			.fetch('https://club.internal/lobby')
			.then((result) => result.json())
	]);
	return { members, settings, beta, poll, tables: lobby.tables ?? [], online: lobby.online ?? [] };
}

function clubFailure(error, origin, env) {
	if (error instanceof ClubError)
		return response(
			{ ok: false, code: error.code, error: error.message },
			error.status,
			origin,
			env
		);
	console.error('Club request failed:', error?.name ?? 'Error');
	return response(
		{ ok: false, code: 'CLUB_UNAVAILABLE', error: 'The club is unreachable right now. Try again.' },
		503,
		origin,
		env
	);
}

/** Lobby roster is cosmetic: a minute-old copy is fine and spares the database. */
let rosterCache = { at: 0, roster: [] };
async function roster(env) {
	if (Date.now() - rosterCache.at < 60_000) return rosterCache.roster;
	const fresh = await withClubDatabase(env, activeRoster);
	rosterCache = { at: Date.now(), roster: fresh };
	return fresh;
}

function roomStub(env, name) {
	return env.ROOMS.get(env.ROOMS.idFromName(name));
}

async function jsonBody(request, limit = 8192) {
	try {
		const text = await request.text();
		if (text.length > limit) return null;
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const origin = request.headers.get('Origin');
		if (origin && !originAllowed(request, env))
			return response({ error: 'Origin not allowed' }, 403);
		if (request.method === 'OPTIONS') {
			if (!originAllowed(request, env, true)) return response({ error: 'Origin not allowed' }, 403);
			const result = new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': origin,
					'Access-Control-Allow-Credentials': 'true',
					Vary: 'Origin'
				}
			});
			result.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			result.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
			result.headers.set('Access-Control-Max-Age', '86400');
			return result;
		}
		if (url.pathname === '/health' && request.method === 'GET')
			return response({ ok: true, service: 'chaal-game' }, 200, origin, env);
		if (url.pathname === '/ready' && request.method === 'GET')
			return response({ ok: true, storage: 'durable-objects' }, 200, origin, env);
		if (!env.SESSION_SECRET && url.pathname !== '/health' && url.pathname !== '/ready')
			return response({ error: 'Game service is not configured' }, 503, origin, env);
		if (url.pathname === '/auth/google' && request.method === 'POST') {
			// Browsers always send Origin on this POST; a missing one is not a signed-in page.
			if (!originAllowed(request, env, true))
				return response({ error: 'Origin not allowed' }, 403, origin, env);
			try {
				const body = await jsonBody(request);
				const identity = await verifyGoogleCredential(body?.credential, env);
				const member = await withClubDatabase(env, (db) => claimMembership(db, identity));
				const clubToken = await issueClubToken(env.SESSION_SECRET, {
					memberId: String(member._id),
					version: member.sessionVersion ?? 1
				});
				return response({ ok: true, clubToken, member: publicProfile(member) }, 200, origin, env);
			} catch (error) {
				return clubFailure(error, origin, env);
			}
		}
		if (url.pathname === '/me' && (request.method === 'GET' || request.method === 'POST')) {
			try {
				const body = request.method === 'POST' ? await jsonBody(request, 40_000) : null;
				const { member, settings, members } = await withClubDatabase(env, async (db) => {
					const current = await signedInMember(request, env, db);
					const updated =
						request.method === 'GET'
							? current
							: await updateProfile(db, String(current._id), body?.profile, {
									onboard: body?.onboard === true
								});
					// Club-wide table look and defaults travel with the profile.
					return { member: updated, settings: await clubSettings(db), members: await activeRoster(db) };
				});
				if (request.method === 'POST') rosterCache.at = 0;
				return response({ ok: true, member: publicProfile(member), settings, members }, 200, origin, env);
			} catch (error) {
				return clubFailure(error, origin, env);
			}
		}
		if (url.pathname === '/session' && request.method === 'POST') {
			// Exchange the club sign-in for a five-minute game credential, after a fresh membership check.
			try {
				const member = await withClubDatabase(env, (db) => signedInMember(request, env, db));
				const profile = publicProfile(member);
				const session = await issueGameToken(env.SESSION_SECRET, profile);
				return response({ ...session, member: profile }, 200, origin, env);
			} catch (error) {
				return clubFailure(error, origin, env);
			}
		}
		// Public game-night poll: anyone with the unguessable link can answer. No sign-in.
		const pollMatch = /^\/poll\/([0-9a-f]{24})$/.exec(url.pathname);
		if (pollMatch && (request.method === 'GET' || request.method === 'POST')) {
			try {
				const body = request.method === 'POST' ? await jsonBody(request) : null;
				// The personal token comes as ?for= (GET) or in the body (POST).
				const token = request.method === 'GET' ? url.searchParams.get('for') : body?.for;
				const result = await withClubDatabase(env, (db) =>
					request.method === 'GET'
						? publicPoll(db, env.SESSION_SECRET, pollMatch[1], token)
						: saveAvailability(db, env.SESSION_SECRET, pollMatch[1], token, body?.slots).then(
								(slots) => ({ saved: slots })
							)
				);
				return response({ ok: true, ...result }, 200, origin, env);
			} catch (error) {
				return clubFailure(error, origin, env);
			}
		}
		if (url.pathname === '/admin' && (request.method === 'GET' || request.method === 'POST')) {
			try {
				const body = request.method === 'POST' ? await jsonBody(request) : null;
				const result = await withClubDatabase(env, async (db) => {
					const owner = await signedInOwner(request, env, db);
					const actorId = String(owner._id);
					let notice = '';
					if (request.method === 'POST') {
						const action = body?.action;
						if (action === 'add') {
							const { added, member } = await addMember(db, body);
							const who = member.nickname || member.email;
							if (!added) notice = `Updated ${who}.`;
							else if (body.notify === false) notice = `${who} is on the guest list. No email sent.`;
							else if (!env.RESEND_API_KEY)
								notice = `${who} is on the guest list. Email isn't set up, so tell them to sign in with ${member.email}.`;
							else {
								try {
									await sendAddedEmail({
										apiKey: env.RESEND_API_KEY,
										from: betaSettings(env).from,
										member,
										host: owner.nickname,
										appUrl: betaSettings(env).appUrl
									});
									notice = `${who} is on the guest list. We emailed them how to sign in.`;
								} catch {
									notice = `${who} is on the guest list, but the email didn't send. Tell them to sign in with ${member.email}.`;
								}
							}
						}
						else if (action === 'pause' || action === 'restore')
							await setMemberPaused(db, body.memberId, action === 'pause', {
								actorId,
								apiKey: env.RESEND_API_KEY
							});
						else if (action === 'role') await setMemberRole(db, body.memberId, body.role);
						else if (action === 'settings') await saveClubSettings(db, body.settings, actorId);
						else if (action === 'lineup') {
							await saveLineup(db, body.lineup, actorId, new Date(), body.hands ?? 1);
							notice = 'Lineup saved. Every table follows it from the next hand.';
						}
						else if (action === 'beta-send') {
							const steps = await sendDueBeta(db, body.memberId, betaSettings(env));
							notice = steps.length
								? `Sent beta email day ${steps.join(', ')}.`
								: 'Nothing due for them.';
						} else if (action === 'poll-open') {
							await resetGameNight(db, { apiKey: env.RESEND_API_KEY });
							await openPoll(db);
							notice = 'Poll opened for tomorrow and the day after. Share the link.';
						} else if (action === 'beta-send-all') {
							const { reached, total } = await sendDueBetaToAll(db, betaSettings(env));
							notice = `Emails sent to ${reached} of ${total}. Anyone already up to date was skipped.`;
						} else if (action === 'beta-night')
							notice = `Beta night set for ${await decideGameNight(db, body.start, betaSettings(env).appUrl)}.`;
						else throw new ClubError('Unknown admin action', 'INVALID_ADMIN_REQUEST', 400);
					}
					return { ...(await adminState(env, db)), notice };
				});
				if (request.method === 'POST') rosterCache.at = 0;
				return response({ ok: true, ...result }, 200, origin, env);
			} catch (error) {
				return clubFailure(error, origin, env);
			}
		}
		if (url.pathname === '/club/history' && request.method === 'GET') {
			const player = await authenticatedPlayer(request, env);
			if (!player) return response({ code: 'SIGN_IN', error: 'Invalid session' }, 401, origin, env);
			const period = url.searchParams.get('period') ?? 'all';
			const page = Number(url.searchParams.get('page') ?? 0);
			if (!['all', 'month', 'today'].includes(period) || !Number.isSafeInteger(page) || page < 0 || page > 10000)
				return response({ error: 'Invalid history filter' }, 400, origin, env);
			try {
				const history = await withClubDatabase(env, (db) => clubHistory(db, { period, page, playerId: player.playerId }));
				return response({ ok: true, ...history }, 200, origin, env);
			} catch (error) { return clubFailure(error, origin, env); }
		}
		if (url.pathname === '/club' && request.method === 'GET') {
			const player = await authenticatedPlayer(request, env);
			if (!player) return response({ code: 'SIGN_IN', error: 'Invalid session' }, 401, origin, env);
			try {
				const [members, lobby] = await Promise.all([
					roster(env),
					clubDirectory(env)
						.fetch('https://club.internal/lobby')
						.then((result) => result.json())
				]);
				return response({ ok: true, members, ...lobby }, 200, origin, env);
			} catch (error) {
				return clubFailure(error, origin, env);
			}
		}
		if (
			(url.pathname === '/club/heartbeat' || url.pathname === '/club/leave') &&
			request.method === 'POST'
		) {
			const player = await authenticatedPlayer(request, env);
			if (!player) return response({ code: 'SIGN_IN', error: 'Invalid session' }, 401, origin, env);
			await clubDirectory(env).fetch(
				`https://club.internal/${url.pathname.slice('/club/'.length)}`,
				{
					method: 'POST',
					body: JSON.stringify({ memberId: player.memberId })
				}
			);
			return response({ ok: true }, 200, origin, env);
		}
		if (url.pathname === '/rooms' && request.method === 'POST') {
			const player = await authenticatedPlayer(request, env);
			if (!player) return response({ code: 'SIGN_IN', error: 'Invalid session' }, 401, origin, env);
			const playerId = player.playerId;
			const body = await jsonBody(request);
			if (
				!body ||
				body.event !== 'createRoom' ||
				!Array.isArray(body.args) ||
				!body.meta?.commandId
			)
				return response({ error: 'Invalid room request' }, 400, origin, env);
			try {
				const name = await roomCodeFor(env.SESSION_SECRET, playerId, body.meta.commandId);
				const stub = roomStub(env, name);
				const internal = new Request('https://room.internal/create', {
					method: 'POST',
					headers: identityHeaders(new Headers({ 'Content-Type': 'application/json' }), player),
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
			// Even whether a room exists is for members only.
			if (!(await authenticatedPlayer(request, env)))
				return response({ code: 'SIGN_IN', error: 'Invalid session' }, 401, origin, env);
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
		if (
			socketMatch &&
			request.method === 'GET' &&
			request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
		) {
			// Browsers always send Origin; non-browser clients may omit it but still need a signed token.
			if (!originAllowed(request, env))
				return response({ error: 'Origin not allowed' }, 403, origin, env);
			const token = tokenFromWebSocketProtocols(request.headers.get('Sec-WebSocket-Protocol'));
			const player = await verifyGameToken(token, env.SESSION_SECRET);
			if (!player) return response({ code: 'SIGN_IN', error: 'Invalid session' }, 401, origin, env);
			try {
				const name = roomName(decodeURIComponent(socketMatch[1]));
				const headers = identityHeaders(new Headers(request.headers), player);
				headers.set('Sec-WebSocket-Protocol', 'chaal.v1');
				return await roomStub(env, name).fetch(new Request(request, { headers }));
			} catch {
				return response({ error: 'Invalid room name' }, 400, origin, env);
			}
		}
		return response({ error: 'Not found' }, 404, origin, env);
	}
};
