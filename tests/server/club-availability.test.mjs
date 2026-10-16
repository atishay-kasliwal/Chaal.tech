import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MEMBERS } from '../../server/club/members.mjs';
import {
	openPoll,
	publicPoll,
	saveAvailability,
	pollSummary,
	pollNights,
	pollSlots,
	personalToken,
	personalLink
} from '../../server/club/availability.mjs';

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('availability-test');
test.after(async () => {
	await client.close();
	await mongo.stop();
});

const secret = 'test-secret-for-poll-links';
// 16 Oct 2026, 10:00 in India.
const now = new Date('2026-10-16T04:30:00Z');
const nine = '2026-10-17T15:30:00.000Z'; // 9 PM India = 11:30 AM US Eastern, Sat 17 Oct
const ten = '2026-10-17T16:30:00.000Z';
const add = async (email, nickname, extra = {}) =>
	String(
		(
			await db
				.collection(MEMBERS)
				.insertOne({
					email,
					nickname,
					status: 'invited',
					role: 'member',
					createdAt: new Date(),
					...extra
				})
		).insertedId
	);
const raju = await add('raju@example.com', 'Raju');
const priya = await add('priya@example.com', 'Priya');
await add('gone@example.com', 'Gone', { status: 'suspended' });

test('a poll covers every hour of the next two India days', async () => {
	const poll = await openPoll(db, now);
	assert.deepEqual(poll.days, ['2026-10-17', '2026-10-18']);
	assert.equal(pollNights(poll), 'Sat, 17 Oct or Sun, 18 Oct');
	assert.equal(pollSlots(poll).length, 48);
	assert.ok(pollSlots(poll).includes(nine));
	assert.match(await personalLink(secret, poll, raju), /\/availability\/[0-9a-f]{24}\?for=/);
});

test('a personal link greets the person, saves their hours, and cannot be forged', async () => {
	const poll = await openPoll(db, now);
	const token = await personalToken(secret, poll, raju);
	const page = await publicPoll(db, secret, poll.key, token);
	assert.equal(page.name, 'Raju');
	assert.deepEqual(page.picked, []);

	await saveAvailability(db, secret, poll.key, token, [nine, ten]);
	assert.deepEqual((await publicPoll(db, secret, poll.key, token)).picked, [nine, ten]);
	await saveAvailability(db, secret, poll.key, token, [nine]);
	assert.deepEqual((await publicPoll(db, secret, poll.key, token)).picked, [nine]);

	const forged = `${priya}.${token.split('.')[1]}`;
	await assert.rejects(publicPoll(db, secret, poll.key, forged), /from your email/);
	await assert.rejects(publicPoll(db, secret, poll.key, undefined), /from your email/);
	await assert.rejects(publicPoll(db, secret, '0'.repeat(24), token), /expired/);
	await assert.rejects(saveAvailability(db, secret, poll.key, token, []), /at least one/);
	await assert.rejects(
		saveAvailability(db, secret, poll.key, token, ['2030-01-01T00:00:00.000Z']),
		/not in this poll/
	);
});

test('the owner sees who answered, who is waiting, and the best hours', async () => {
	const poll = await openPoll(db, now);
	await saveAvailability(db, secret, poll.key, await personalToken(secret, poll, raju), [nine]);
	await saveAvailability(db, secret, poll.key, await personalToken(secret, poll, priya), [
		nine,
		ten
	]);
	const summary = await pollSummary(db, secret, 'https://chaal.tech');
	assert.deepEqual(
		summary.people.map(({ name, slots }) => [name, slots?.length ?? null]),
		[
			['Raju', 1],
			['Priya', 2]
		]
	);
	assert.deepEqual(
		summary.best.map((entry) => [entry.slot, entry.free]),
		[
			[nine, ['Raju', 'Priya']],
			[ten, ['Priya']]
		]
	);
	assert.ok(
		summary.people.every((person) => person.link.startsWith('https://chaal.tech/availability/'))
	);

	// A new poll starts fresh; old links stop working.
	const old = await personalToken(secret, poll, raju);
	const fresh = await openPoll(db, new Date(now.getTime() + 1000));
	await assert.rejects(publicPoll(db, secret, poll.key, old), /expired/);
	assert.ok((await pollSummary(db, secret)).people.every((person) => person.slots === null));
	assert.ok(fresh.key !== poll.key);
});
