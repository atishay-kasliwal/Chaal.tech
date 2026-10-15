import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { SignJWT, importJWK } from 'jose';

export const baseURL = process.env.CHAAL_CF_TEST_URL;
export const origin = 'http://localhost:5173';
export const secret = process.env.CHAAL_CF_TEST_SECRET;

const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
export const members = mongo.db('chaal-cf-test').collection('members');
export const closeClub = () => mongo.close();

const googleKey = await importJWK(JSON.parse(process.env.CHAAL_CF_TEST_GOOGLE_KEY), 'RS256');

/** An ID token as Google would sign it for this app (or not, with overrides). */
export function googleToken({
	email,
	sub = randomUUID(),
	audience = process.env.CHAAL_CF_TEST_CLIENT_ID,
	verified = true,
	givenName = 'Friend'
}) {
	return new SignJWT({ email, email_verified: verified, given_name: givenName })
		.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
		.setIssuer('https://accounts.google.com')
		.setAudience(audience)
		.setSubject(sub)
		.setIssuedAt()
		.setExpirationTime('10m')
		.sign(googleKey);
}

export async function post(path, { token, body = {}, headers = {} } = {}) {
	const response = await fetch(`${baseURL}${path}`, {
		method: 'POST',
		headers: {
			Origin: origin,
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...headers
		},
		body: JSON.stringify(body)
	});
	return { response, body: await response.json() };
}

/** Invite a friend in the database, sign them in with Google and get a game credential. */
export async function createSession({
	nickname = 'Friend',
	email = `${randomUUID()}@example.com`
} = {}) {
	await members.insertOne({
		email,
		nickname,
		status: 'invited',
		role: 'member',
		createdAt: new Date()
	});
	const signIn = await post('/auth/google', { body: { credential: await googleToken({ email }) } });
	assert.equal(signIn.response.status, 200, JSON.stringify(signIn.body));
	const session = await post('/session', { token: signIn.body.clubToken });
	assert.equal(session.response.status, 200, JSON.stringify(session.body));
	return { ...session.body, clubToken: signIn.body.clubToken, email };
}

export async function createRoom(session, commandId) {
	const body = {
		event: 'createRoom',
		args: ['', 50, 'classic-1', 'teen-patti'],
		meta: { commandId }
	};
	const response = await fetch(`${baseURL}/rooms`, {
		method: 'POST',
		headers: {
			Origin: origin,
			Authorization: `Bearer ${session.token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	return { response, result: await response.json(), body };
}

export function openPlayer(session, roomName) {
	const url = new URL(`/socket/${roomName}`, baseURL);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	const ws = new WebSocket(url, ['chaal.v1', `chaal-auth.${session.token}`]);
	const pending = new Map();
	const waiters = [];
	const player = { ws, session, view: null };
	ws.addEventListener('message', (event) => {
		const packet = JSON.parse(event.data);
		if (packet.type === 'ack') {
			const callback = pending.get(packet.id);
			if (callback) {
				pending.delete(packet.id);
				callback(packet.result);
			}
		}
		if (packet.type === 'event') {
			if (packet.event === 'roomData') player.view = packet.args[0];
			for (const waiter of [...waiters])
				if (waiter(packet)) waiters.splice(waiters.indexOf(waiter), 1);
		}
	});
	player.open = new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', () => reject(new Error('WebSocket failed to open')), {
			once: true
		});
	});
	player.waitFor = (predicate) => {
		if (predicate({ type: 'event', event: 'roomData', args: [player.view] }))
			return Promise.resolve(player.view);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('Timed out waiting for room state')), 8000);
			waiters.push((packet) => {
				if (!predicate(packet)) return false;
				clearTimeout(timer);
				resolve(packet.args?.[0]);
				return true;
			});
		});
	};
	player.send = (event, args = [], stateful = true) => {
		const id = randomUUID();
		const meta = {
			commandId: randomUUID(),
			...(stateful ? { expectedRevision: player.view?.revision, handId: player.view?.handId } : {})
		};
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`Timed out waiting for ${event}`));
			}, 8000);
			pending.set(id, (result) => {
				clearTimeout(timer);
				resolve(result);
			});
			ws.send(JSON.stringify({ type: 'event', id, event, args, meta }));
		});
	};
	return player;
}
