import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { migrateAnalytics } from '../../server/analytics/store.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { privacyViolations } from '../server/helpers/intel.mjs';
import { baseURL, origin, post, createSession, members, closeClub } from './club-helper.mjs';

const client = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = client.db('chaal-cf-test');
test.after(async () => {
	await client.close();
	await closeClub();
});
const get = async (path, token) => {
	const response = await fetch(`${baseURL}${path}`, { headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
	return { response, body: await response.json() };
};

test('intelligence routes work through the real Worker: members see their own, owners see the club, strangers see nothing', async () => {
	await migrateAnalytics(db);
	await seedCharacters(db);
	const owner = await createSession({ nickname: 'Intel owner' });
	const guest = await createSession({ nickname: 'Intel guest' });
	await members.updateOne({ email: owner.email }, { $set: { role: 'owner' } });

	// Members-only analytics: anonymous and forged callers are refused.
	for (const route of ['skill', 'records', 'recap', 'fairness', 'club', 'timeline', 'evidence']) {
		assert.equal((await get(`/analytics/${route}`)).response.status, 401, `${route} needs a sign-in`);
		const mine = await get(`/analytics/${route}`, guest.clubToken);
		assert.equal(mine.response.status, 200, `${route}: ${JSON.stringify(mine.body)}`);
		assert.deepEqual(privacyViolations(mine.body), [], `${route} leaks nothing private`);
	}
	assert.equal((await get('/analytics/recap?night=someone-elses-night', guest.clubToken)).response.status, 403);
	assert.equal((await get('/analytics/hands?from=yesterday', guest.clubToken)).response.status, 400);

	// Owner-only intelligence.
	for (const route of ['club', 'bots', 'quality', 'export']) {
		assert.equal((await get(`/admin/intel/${route}`)).response.status, 401);
		assert.equal((await get(`/admin/intel/${route}`, guest.clubToken)).response.status, 403, `${route} is owner-only`);
		const ok = await get(`/admin/intel/${route}`, owner.clubToken);
		assert.equal(ok.response.status, 200, `${route}: ${JSON.stringify(ok.body)}`);
		assert.deepEqual(privacyViolations(ok.body), []);
	}
	assert.equal((await post('/admin/bots/evolution', { token: guest.clubToken, body: { action: 'observe', botId: 'x', findingId: 'y' } })).response.status, 403);
	const unknown = await post('/admin/bots/evolution', { token: owner.clubToken, body: { action: 'observe', botId: 'no-such-bot', findingId: 'y' } });
	assert.equal(unknown.response.status, 404);
});
