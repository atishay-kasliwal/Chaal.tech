import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import {
	MEMBERS,
	ensureIndexes,
	claimMembership,
	memberById,
	updateProfile,
	publicProfile,
	invitableEmails,
	emailsForMembers,
	activeRoster,
	assertActive
} from '../../server/club/members.mjs';
import { CHARACTER_IDS } from '../../server/club/characters.mjs';

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('club-test');
await ensureIndexes(db);
const members = db.collection(MEMBERS);

test.after(async () => {
	await client.close();
	await mongo.stop();
});
test.beforeEach(() => members.deleteMany({}));

const invite = (email, extra = {}) =>
	members.insertOne({ email, status: 'invited', role: 'member', createdAt: new Date(), ...extra });

test('an invited email is claimed once by its verified Google account, with a stable player', async () => {
	await invite('Raju@Example.com', { nickname: 'Raju' });
	const first = await claimMembership(db, {
		sub: 'google-1',
		email: 'raju@example.com',
		givenName: 'R'
	});
	assert.equal(first.status, 'active');
	assert.equal(first.nickname, 'Raju');
	assert.match(first.playerId, /^[a-f0-9-]{36}$/);
	const again = await claimMembership(db, { sub: 'google-1', email: 'raju@example.com' });
	assert.equal(again.playerId, first.playerId);
	await assert.rejects(claimMembership(db, { sub: 'google-2', email: 'raju@example.com' }), {
		code: 'WRONG_ACCOUNT'
	});
});

test('concurrent claims of one invite bind exactly one Google account', async () => {
	await invite('pair@example.com');
	const results = await Promise.allSettled(
		['a', 'b', 'c', 'd'].map((sub) => claimMembership(db, { sub, email: 'pair@example.com' }))
	);
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(await members.countDocuments({ googleSub: { $type: 'string' } }), 1);
});

test('uninvited and suspended accounts get no membership', async () => {
	await assert.rejects(claimMembership(db, { sub: 'x', email: 'stranger@example.com' }), {
		code: 'NOT_INVITED'
	});
	await invite('paused@example.com', { status: 'suspended' });
	await assert.rejects(claimMembership(db, { sub: 'y', email: 'paused@example.com' }), {
		code: 'SUSPENDED'
	});
	await invite('later@example.com');
	const member = await claimMembership(db, { sub: 'z', email: 'later@example.com' });
	await members.updateOne({ _id: member._id }, { $set: { status: 'suspended' } });
	await assert.rejects(claimMembership(db, { sub: 'z', email: 'later@example.com' }), {
		code: 'SUSPENDED'
	});
	assert.throws(() => assertActive(null), { code: 'SIGN_IN' });
});

test('a Google first name is stored as text, never read as a database expression', async () => {
	await invite('dollar@example.com');
	const member = await claimMembership(db, {
		sub: 'd',
		email: 'dollar@example.com',
		givenName: '$email'
	});
	assert.equal(member.nickname, '$email');
});

test('members edit only cosmetic fields, within limits', async () => {
	await invite('me@example.com', { role: 'member' });
	const member = await claimMembership(db, { sub: 'me', email: 'me@example.com', givenName: 'Me' });
	const id = String(member._id);
	const updated = await updateProfile(
		db,
		id,
		{
			nickname: '  Big   Boss  ',
			characterId: 'owl',
			reducedMotion: true,
			role: 'owner',
			mascotId: 'adarsh',
			status: 'active'
		},
		{ onboard: true }
	);
	assert.equal(updated.nickname, 'Big Boss');
	assert.equal(updated.role, 'member');
	assert.equal(publicProfile(updated).mascotId, null, 'members cannot pick another friend’s face');
	assert.equal(publicProfile(updated).onboarded, true);
	await assert.rejects(updateProfile(db, id, { characterId: 'dragon' }), {
		code: 'INVALID_PROFILE'
	});
	await assert.rejects(updateProfile(db, id, { nickname: '   ' }), { code: 'INVALID_PROFILE' });
	assert.equal((await updateProfile(db, id, { nickname: 'x'.repeat(40) })).nickname.length, 24);
	const profile = publicProfile(await memberById(db, id));
	assert.equal('email' in profile || 'googleSub' in profile, false);
});

test('table invites reach only people on the guest list; the roster hides emails', async () => {
	await invite('friend@example.com');
	await invite('gone@example.com', { status: 'suspended' });
	assert.deepEqual(
		await invitableEmails(db, ['friend@example.com', 'gone@example.com', 'new@example.com']),
		['friend@example.com']
	);
	await claimMembership(db, { sub: 'f', email: 'friend@example.com', givenName: 'Friend' });
	const roster = await activeRoster(db);
	assert.equal(roster.length, 1);
	assert.deepEqual(Object.keys(roster[0]).sort(), [
		'characterId',
		'joined',
		'mascotId',
		'memberId',
		'nickname',
		'photoDataUrl',
		'playerId'
	]);
});

test('only known mascots reach the table', () => {
	assert.equal(publicProfile({ _id: 'a', mascotId: 'mradul' }).mascotId, 'mradul');
	assert.equal(publicProfile({ _id: 'a', mascotId: '../../etc' }).mascotId, null);
	assert.equal(publicProfile({ _id: 'a' }).mascotId, null);
});

test('picked friends resolve to emails on the server, never suspended or unknown ones', async () => {
	await invite('picked@example.com');
	await invite('paused@example.com', { status: 'suspended' });
	const ids = await members
		.find({ email: { $in: ['picked@example.com', 'paused@example.com'] } })
		.map((member) => String(member._id))
		.toArray();
	assert.deepEqual(await emailsForMembers(db, [...ids, 'not-a-member', 42]), [
		'picked@example.com'
	]);
	assert.deepEqual(await emailsForMembers(db, []), []);
});

test('server character IDs match the client catalog', async () => {
	const source = await readFile(
		new URL('../../src/lib/club/characters.ts', import.meta.url),
		'utf8'
	);
	const clientIds = [...source.matchAll(/\{ id: '([a-z-]+)'/g)].map((match) => match[1]);
	assert.deepEqual(clientIds, CHARACTER_IDS);
});

test('a saved profile photo survives reads and roster projection and can be removed', async () => {
	const jpeg = await readFile(new URL('../fixtures/profile-photo.jpg', import.meta.url));
	const photoDataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
	await invite('photo@example.com');
	const member = await claimMembership(db, { sub: 'photo', email: 'photo@example.com' });
	const id = String(member._id);
	await updateProfile(db, id, { photoDataUrl, memberId: 'someone-else', role: 'owner' });
	const read = await memberById(db, id);
	assert.equal(publicProfile(read).photoDataUrl, photoDataUrl);
	assert.equal(read.role, 'member');
	assert.equal((await activeRoster(db))[0].photoDataUrl, photoDataUrl);
	await updateProfile(db, id, { photoDataUrl: null });
	assert.equal(publicProfile(await memberById(db, id)).photoDataUrl, null);
});
