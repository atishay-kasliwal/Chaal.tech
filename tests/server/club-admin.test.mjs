import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MEMBERS, ensureIndexes } from '../../server/club/members.mjs';
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	clubSettings,
	saveClubSettings,
	adminMembers,
	addMember,
	setMemberPaused,
	setMemberRole,
	sendDueBeta,
	decideGameNight,
	betaDecision,
	saveLineup
} from '../../server/club/admin.mjs';

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('club-admin-test');
await ensureIndexes(db);
const members = db.collection(MEMBERS);

test.after(async () => {
	await client.close();
	await mongo.stop();
});

const idOf = async (email) => String((await members.findOne({ email }))._id);

test('settings default sensibly, keep the boot within 1/20 of the chips, and reject bad saves', async () => {
	assert.deepEqual(await clubSettings(db), { ...DEFAULT_SETTINGS, lineup: [] });
	assert.equal(
		normalizeSettings({ table: { chips: 1000, boot: 100, potLimit: 0 } }).table.boot,
		50
	);
	const wanted = {
		table: { chips: 5000, boot: 100, potLimit: 0 },
		look: { felt: 'onyx', cardBack: 'crimson' }
	};
	assert.deepEqual(await saveClubSettings(db, wanted, 'owner'), wanted);
	assert.deepEqual(await clubSettings(db), { ...wanted, lineup: [] });
	await assert.rejects(
		saveClubSettings(db, { ...wanted, table: { chips: 10, boot: 5, potLimit: 0 } }, 'owner'),
		/Starting chips/
	);
	await assert.rejects(
		saveClubSettings(db, { ...wanted, look: { felt: 'pink', cardBack: 'navy' } }, 'owner'),
		/Unknown table look/
	);
});

test('owners add members, pause and restore them, and can never lose the last owner', async () => {
	await addMember(db, { email: 'Boss@Example.com', nickname: 'Boss', role: 'owner' });
	await addMember(db, { email: 'raju@example.com', nickname: 'Raju' });
	await assert.rejects(addMember(db, { email: 'not-an-email' }), /valid email/);
	const boss = await idOf('boss@example.com');
	const raju = await idOf('raju@example.com');
	const list = await adminMembers(db);
	assert.deepEqual(
		list.map(({ email, role, status, signedIn }) => ({ email, role, status, signedIn })),
		[
			{ email: 'boss@example.com', role: 'owner', status: 'invited', signedIn: false },
			{ email: 'raju@example.com', role: 'member', status: 'invited', signedIn: false }
		]
	);
	assert.ok(!('googleSub' in list[0]) && !('sessionVersion' in list[0]));

	await setMemberPaused(db, raju, true, { actorId: boss });
	const paused = await members.findOne({ email: 'raju@example.com' });
	assert.equal(paused.status, 'suspended');
	assert.equal(paused.sessionVersion, 1);
	await setMemberPaused(db, raju, false, { actorId: boss });
	assert.equal((await members.findOne({ email: 'raju@example.com' })).status, 'invited');

	await assert.rejects(setMemberPaused(db, boss, true, { actorId: boss }), /yourself/);
	await assert.rejects(setMemberRole(db, boss, 'member'), /last owner/);
	await setMemberRole(db, raju, 'owner');
	await setMemberRole(db, boss, 'member');
	assert.equal((await members.findOne({ email: 'boss@example.com' })).role, 'member');
	await assert.rejects(setMemberRole(db, raju, 'king'), /Unknown role/);
});

test('beta emails need the email key, and the game night is set once', async () => {
	const raju = await idOf('raju@example.com');
	await assert.rejects(sendDueBeta(db, raju, { appUrl: 'https://chaal.tech' }), /RESEND_API_KEY/);
	const label = await decideGameNight(db, '2026-10-24 21:00', 'https://chaal.tech');
	assert.match(label, /24/);
	assert.match((await betaDecision(db, 'https://chaal.tech')).label, /24/);
	await assert.rejects(
		decideGameNight(db, '2026-10-31 21:00', 'https://chaal.tech'),
		/already set/
	);
	await assert.rejects(decideGameNight(db, 'someday', 'https://chaal.tech'), /date and time/);
});

test('owners set the lineup for the night; unknown games are refused', async () => {
	assert.deepEqual(await saveLineup(db, ['classic-1', 'muflis-1', 'folding-joker-1'], 'owner'), [
		'classic-1',
		'muflis-1',
		'folding-joker-1'
	]);
	assert.deepEqual((await clubSettings(db)).lineup, ['classic-1', 'muflis-1', 'folding-joker-1']);
	await assert.rejects(saveLineup(db, ['poker'], 'owner'), /Unknown game/);
	await assert.rejects(saveLineup(db, 'classic-1', 'owner'), /up to/);
	await saveLineup(db, [], 'owner');
	assert.deepEqual((await clubSettings(db)).lineup, []);
});
