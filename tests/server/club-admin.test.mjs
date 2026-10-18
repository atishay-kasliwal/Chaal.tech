import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MEMBERS, ensureIndexes, markSeen } from '../../server/club/members.mjs';
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
	assert.deepEqual(await clubSettings(db), { ...DEFAULT_SETTINGS, lineup: [], lineupHands: 1 });
	assert.equal(
		normalizeSettings({ table: { chips: 1000, boot: 100, potLimit: 0 } }).table.boot,
		50
	);
	const wanted = {
		table: { chips: 5000, boot: 100, potLimit: 0 },
		look: { felt: 'onyx', cardBack: 'crimson' },
		mascotSize: 100
	};
	assert.deepEqual(await saveClubSettings(db, wanted, 'owner'), wanted);
	assert.deepEqual(await clubSettings(db), { ...wanted, lineup: [], lineupHands: 1 });
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

test('a lineup can hold Mystery slots and play each game for a few hands', async () => {
	await saveLineup(db, ['classic-1', 'mystery', 'muflis-1'], 'owner', new Date(), 3);
	const settings = await clubSettings(db);
	assert.deepEqual(settings.lineup, ['classic-1', 'mystery', 'muflis-1']);
	assert.equal(settings.lineupHands, 3);
	await saveLineup(db, ['classic-1'], 'owner', new Date(), 0);
	assert.equal((await clubSettings(db)).lineupHands, 0);
	await assert.rejects(saveLineup(db, ['classic-1'], 'owner', new Date(), 7), /1, 2 or 3 hands/);
	await saveLineup(db, [], 'owner');
});

test('owners can link and clear a known mascot without changing membership', async () => {
	const { setMemberMascot } = await import('../../server/club/admin.mjs');
	await addMember(db, { email: 'mascot@example.com', nickname: 'Mascot friend' });
	const id = await idOf('mascot@example.com');
	await setMemberMascot(db, id, 'adityaraj');
	assert.equal((await adminMembers(db)).find((m) => m.memberId === id).mascotId, 'adityaraj');
	await assert.rejects(setMemberMascot(db, id, '../private'), /Unknown mascot/);
	await assert.rejects(setMemberMascot(db, 'not-a-member', 'mradul'), /Unknown member/);
	await setMemberMascot(db, id, null);
	const member = await members.findOne({ email: 'mascot@example.com' });
	assert.equal(member.mascotId, null);
	assert.equal(member.status, 'invited');
	assert.equal(member.role, 'member');
});

test('last seen is written at most once every ten minutes', async () => {
	await members.insertOne({ email: 'seen@example.com', playerId: 'pseen', status: 'active', role: 'member' });
	const member = await members.findOne({ playerId: 'pseen' });
	const day = Date.UTC(2026, 9, 10, 12);
	const seen = new Date(day);
	await markSeen(db, member, seen);
	await markSeen(db, { ...member, lastSeenAt: seen }, new Date(day + 60_000));
	assert.equal((await members.findOne({ _id: member._id })).lastSeenAt.getTime(), day);
});

test('mascot size persists, rejects invalid values and survives older clients saving settings', async () => {
	const saved = await clubSettings(db);
	for (const mascotSize of [60, 125, 160]) {
		await saveClubSettings(db, { ...saved, mascotSize }, 'owner');
		assert.equal((await clubSettings(db)).mascotSize, mascotSize);
	}
	for (const mascotSize of [0, 59, 161, 102, 120.5, '120', null]) {
		await assert.rejects(saveClubSettings(db, { ...saved, mascotSize }, 'owner'), /Mascot size/);
	}
	const { mascotSize: ignored, ...legacy } = saved;
	void ignored;
	await saveClubSettings(db, legacy, 'owner');
	assert.equal((await clubSettings(db)).mascotSize, 160);
	assert.equal(normalizeSettings({ mascotSize: -1 }).mascotSize, 100);
});
