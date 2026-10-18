import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
	baseURL,
	origin,
	secret,
	members,
	closeClub,
	googleToken,
	post,
	createSession,
	createRoom,
	openPlayer
} from './club-helper.mjs';
import { issueGameToken } from '../../server/cloudflare/security.mjs';

test.after(closeClub);

const get = async (path, token) => {
	const response = await fetch(`${baseURL}${path}`, {
		headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
	});
	return { response, body: await response.json() };
};

test('only invited, verified Google accounts for this app get into the club', async () => {
	const stranger = await post('/auth/google', {
		body: { credential: await googleToken({ email: 'stranger@example.com' }) }
	});
	assert.equal(stranger.response.status, 403);
	assert.equal(stranger.body.code, 'NOT_INVITED');
	assert.equal('clubToken' in stranger.body, false);

	await members.insertOne({ email: 'aud@example.com', status: 'invited' });
	const otherApp = await post('/auth/google', {
		body: { credential: await googleToken({ email: 'aud@example.com', audience: 'someone-else' }) }
	});
	assert.equal(otherApp.response.status, 401);
	const unverified = await post('/auth/google', {
		body: { credential: await googleToken({ email: 'aud@example.com', verified: false }) }
	});
	assert.equal(unverified.response.status, 401);
	const noOrigin = await fetch(`${baseURL}/auth/google`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ credential: await googleToken({ email: 'aud@example.com' }) })
	});
	assert.equal(noOrigin.status, 403);
	assert.equal(
		await members.countDocuments({ email: 'aud@example.com', googleSub: { $exists: true } }),
		0
	);
});

test('members-only endpoints reject anonymous, forged and expired credentials', async () => {
	const { token, clubToken, playerId } = await createSession();
	const created = await createRoom({ token }, randomUUID());
	assert.equal(created.response.status, 200);
	const room = created.result.roomName;

	assert.equal((await get(`/room/${room}`)).response.status, 401);
	assert.equal(
		(await get(`/room/${room}`, clubToken)).response.status,
		401,
		'a club sign-in is not a game credential'
	);
	assert.equal((await get(`/room/${room}`, token)).response.status, 200);
	assert.equal((await get('/club')).response.status, 401);
	assert.equal((await post('/session', { token: 'forged.token' })).response.status, 401);

	const expired = await issueGameToken(
		secret,
		{ playerId, memberId: 'x', nickname: 'x', characterId: 'tiger' },
		Date.now() - 10 * 60 * 1000
	);
	assert.equal((await get(`/room/${room}`, expired.token)).response.status, 401);
	const refused = openPlayer(expired, room);
	await assert.rejects(refused.open, /WebSocket failed to open/);
});

test('suspension and a new session version stop renewals', async () => {
	const session = await createSession();
	await members.updateOne({ email: session.email }, { $set: { status: 'suspended' } });
	const suspended = await post('/session', { token: session.clubToken });
	assert.equal(suspended.response.status, 403);
	assert.equal(suspended.body.code, 'SUSPENDED');
	await members.updateOne(
		{ email: session.email },
		{ $set: { status: 'active' }, $inc: { sessionVersion: 1 } }
	);
	assert.equal((await post('/session', { token: session.clubToken })).response.status, 401);
	// Signing in again restores the same player, so seats and chips carry over.
	const member = await members.findOne({ email: session.email });
	const again = await post('/auth/google', {
		body: { credential: await googleToken({ email: session.email, sub: member.googleSub }) }
	});
	assert.equal(again.response.status, 200);
	assert.equal(again.body.member.playerId, session.playerId);
});

test('the table seats members under their club nickname and renews credentials in place', async (t) => {
	const host = await createSession({ nickname: 'Raju' });
	const created = await createRoom(host, randomUUID());
	const room = created.result.roomName;
	const player = openPlayer(host, room);
	t.after(() => player.ws.close());
	await player.open;
	assert.equal((await player.send('joinRoom', ['Somebody Else', room], false)).ok, true);
	const view = await player.waitFor(
		(packet) => packet.event === 'roomData' && packet.args[0]?.usersList?.length === 1
	);
	assert.equal(view.usersList[0].username, 'raju');

	const fresh = await post('/session', { token: host.clubToken });
	assert.equal((await player.send('renewAuth', [fresh.body.token], false)).ok, true);
	const other = await createSession();
	const stolen = await player.send('renewAuth', [other.token], false);
	assert.equal(stolen.ok, false);
	assert.equal(stolen.code, 'SIGN_IN');
});

test('profile edits are limited to cosmetic fields and the lobby shows presence and tables', async (t) => {
	const friend = await createSession({ nickname: 'Pinky' });
	const saved = await post('/me', {
		token: friend.clubToken,
		body: { profile: { nickname: 'Pinky Boss', characterId: 'owl', role: 'owner' }, onboard: true }
	});
	assert.equal(saved.response.status, 200);
	assert.equal(saved.body.member.nickname, 'Pinky Boss');
	assert.equal(saved.body.member.role, 'member');
	assert.equal(saved.body.member.onboarded, true);
	assert.equal(
		(await post('/me', { token: friend.clubToken, body: { profile: { characterId: 'dragon' } } }))
			.response.status,
		400
	);
	assert.equal((await members.findOne({ email: friend.email })).role, 'member');

	const session = await post('/session', { token: friend.clubToken });
	const created = await createRoom(session.body, randomUUID());
	const player = openPlayer(session.body, created.result.roomName);
	t.after(() => player.ws.close());
	await player.open;
	assert.equal((await player.send('joinRoom', ['x', created.result.roomName], false)).ok, true);
	assert.equal((await post('/club/heartbeat', { token: session.body.token })).response.status, 200);

	let lobby;
	for (let attempt = 0; attempt < 20; attempt++) {
		lobby = (await get('/club', session.body.token)).body;
		if (
			lobby.tables?.some(
				(table) => table.name === created.result.roomName && table.connectedMembers.length
			)
		)
			break;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	const table = lobby.tables.find((entry) => entry.name === created.result.roomName);
	assert.ok(table, 'the new table is listed');
	assert.equal(table.playerCount, 1);
	assert.deepEqual(table.connectedMembers, [saved.body.member.memberId]);
	assert.ok(lobby.online.includes(saved.body.member.memberId));
	assert.ok(lobby.members.every((member) => !('email' in member) && !('googleSub' in member)));
});

test('profile photos above the old body limit persist privately and can be removed', async () => {
	const { readFile } = await import('node:fs/promises');
	const jpeg = await readFile(new URL('../fixtures/profile-photo-large.jpg', import.meta.url));
	const photoDataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
	assert.ok(photoDataUrl.length > 8192);
	const session = await createSession();
	assert.equal((await post('/me', { body: { profile: { photoDataUrl } } })).response.status, 401);
	const saved = await post('/me', {
		token: session.clubToken,
		body: { profile: { photoDataUrl } }
	});
	assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
	assert.equal(saved.body.member.photoDataUrl, photoDataUrl);
	const restored = await fetch(`${baseURL}/me`, {
		headers: { Authorization: `Bearer ${session.clubToken}`, Origin: origin }
	});
	assert.equal((await restored.json()).member.photoDataUrl, photoDataUrl);
	const invalid = await post('/me', {
		token: session.clubToken,
		body: { profile: { photoDataUrl: 'https://example.com/photo' } }
	});
	assert.equal(invalid.response.status, 400);
	const removed = await post('/me', {
		token: session.clubToken,
		body: { profile: { photoDataUrl: null } }
	});
	assert.equal(removed.body.member.photoDataUrl, null);
});

test('mascot links are owner-only and reach member profiles', async () => {
	const owner = await createSession({ nickname: 'Owner' });
	const friend = await createSession({ nickname: 'Friend' });
	const friendRow = await members.findOne({ email: friend.email });
	const action = { action: 'mascot', memberId: String(friendRow._id), mascotId: 'mradul' };
	assert.equal(
		(await post('/admin', { token: friend.clubToken, body: action })).response.status,
		403
	);
	await members.updateOne({ email: owner.email }, { $set: { role: 'owner' } });
	const saved = await post('/admin', { token: owner.clubToken, body: action });
	assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
	assert.equal(saved.body.members.find((m) => m.memberId === action.memberId).mascotId, 'mradul');
	assert.equal((await get('/me', friend.clubToken)).body.member.mascotId, 'mradul');
	assert.equal(
		(await post('/admin', { token: owner.clubToken, body: { ...action, mascotId: '../private' } }))
			.response.status,
		400
	);
	const changed = await post('/me', {
		token: friend.clubToken,
		body: { profile: { mascotId: 'adarsh' } }
	});
	assert.equal(changed.body.member.mascotId, 'mradul');
});


test('only owners resize mascots, and signed-in tables can refresh the saved size', async () => {
	const owner = await createSession({ nickname: 'Size owner' });
	const friend = await createSession({ nickname: 'Size friend' });
	assert.equal((await get('/club/settings')).response.status, 401);
	await members.updateOne({ email: owner.email }, { $set: { role: 'owner' } });
	const initial = await get('/club/settings', friend.clubToken);
	assert.equal(initial.response.status, 200);
	const body = { action: 'settings', settings: { ...initial.body.settings, mascotSize: 135 } };
	assert.equal((await post('/admin', { token: friend.clubToken, body })).response.status, 403);
	assert.equal((await post('/admin', { token: owner.clubToken, body })).response.status, 200);
	assert.equal((await get('/club/settings', friend.clubToken)).body.settings.mascotSize, 135);
	assert.equal((await post('/admin', { token: owner.clubToken, body: { ...body, settings: { ...body.settings, mascotSize: 9999 } } })).response.status, 400);
});
