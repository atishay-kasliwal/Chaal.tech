import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { baseURL, createSession, createRoom, openPlayer, closeClub } from './club-helper.mjs';

test.after(closeClub);

/* A player whose connection drops is shown away to the others at once, then back when they return. */
test('a dropped player shows as away immediately and back on reconnect', async (t) => {
	assert.ok(baseURL, 'the test runner must set CHAAL_CF_TEST_URL');
	const [hostSession, guestSession] = await Promise.all([createSession(), createSession()]);
	const created = await createRoom(hostSession, randomUUID());
	const name = created.result.roomName;
	const host = openPlayer(hostSession, name);
	const guest = openPlayer(guestSession, name);
	t.after(() => {
		host.ws.close();
		guest.ws.close();
	});
	await Promise.all([host.open, guest.open]);
	assert.equal((await host.send('joinRoom', ['Host', name], false)).ok, true);
	assert.equal((await guest.send('joinRoom', ['Guest', name], false)).ok, true);
	const guestId = guestSession.playerId;
	await host.waitFor(
		(p) => p.args?.[0]?.usersList?.find((u) => u.id === guestId)?.connected === true
	);
	guest.ws.close();
	await host.waitFor(
		(p) => p.args?.[0]?.usersList?.find((u) => u.id === guestId)?.connected === false
	);
	const back = openPlayer(guestSession, name);
	t.after(() => back.ws.close());
	await back.open;
	assert.equal((await back.send('resumeRoom', [name], false)).ok, true);
	await host.waitFor(
		(p) => p.args?.[0]?.usersList?.find((u) => u.id === guestId)?.connected === true
	);
});
