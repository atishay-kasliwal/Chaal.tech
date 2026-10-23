import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';
import { COLLECTIONS, gzipJson } from '../../server/analytics/store.mjs';
import { finishCapture } from '../../server/analytics/recorder.mjs';
import { botSeatPayload } from '../../server/bots/runner.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti } from '../server/helpers/drivers.mjs';
import { baseURL, origin, post, createSession, members, closeClub } from './club-helper.mjs';

/* The owner decision inspector through the real Worker and the real admin page. */
const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
test.after(async () => {
	await mongo.close();
	await closeClub();
});
const get = async (path, token) => {
	const response = await fetch(`${baseURL}${path}`, { headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
	return { response, body: await response.json() };
};

/** A finished recorded hand with two character bots, stored as the recorder stores it. */
async function storeHand(room, { publicRecord = true } = {}) {
	const sim = teenPattiTable({ seed: 91, humans: ['a'] });
	sim.act('a', 'addBot', botSeatPayload(sim.room, 'virat-kohli', 'bot-insp-virat', () => 0.5));
	sim.act('a', 'addBot', botSeatPayload(sim.room, 'ms-dhoni', 'bot-insp-dhoni', () => 0.5));
	dealTeenPatti(sim);
	playTeenPatti(sim, { packBias: 0.1 });
	const finished = finishCapture(JSON.parse(JSON.stringify(sim.captures()[0]).replaceAll('sim-room', room)));
	assert.ok(finished.ok, finished.failure?.detail?.message);
	const { public: record, sealed } = finished.records;
	const { preDeal, steps, hiddenStacks, botTrace, ...meta } = sealed;
	await db.collection(COLLECTIONS.sealed).insertOne({ ...meta, codec: 'gzip-json', z: await gzipJson({ preDeal, steps, hiddenStacks, botTrace }), storedAt: new Date() });
	if (publicRecord) await db.collection(COLLECTIONS.records).insertOne({ ...record, completedAt: Date.now(), complete: true });
	return record._id;
}

test('bot inspector: owners only, finished hands only, and the admin Bots section renders it', async (t) => {
	const done = await storeHand('inspector-room');
	const unfinished = await storeHand('inspector-live', { publicRecord: false });
	const owner = await createSession({ nickname: 'Inspector owner' });
	const guest = await createSession({ nickname: 'Inspector guest' });
	await members.updateOne({ email: owner.email }, { $set: { role: 'owner' } });

	const inspect = `/admin/bots/inspect?hand=${encodeURIComponent(done)}`;
	for (const path of ['/admin/bots/hands', inspect]) {
		assert.equal((await get(path)).response.status, 401);
		const denied = await get(path, guest.clubToken);
		assert.equal(denied.response.status, 403, `${path} is owner-only`);
		assert.equal(denied.body.decisions, undefined);
	}
	const ok = await get(inspect, owner.clubToken);
	assert.equal(ok.response.status, 200, JSON.stringify(ok.body));
	assert.ok(ok.body.decisions.length > 0);
	assert.equal((await get(`/admin/bots/inspect?hand=${encodeURIComponent(unfinished)}`, owner.clubToken)).response.status, 404);

	// The admin page, as the owner.
	const profile = await post('/me', { token: owner.clubToken, body: { profile: { nickname: 'Inspector owner', characterId: 'owl' }, onboard: true } });
	const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
	t.after(() => browser.close());
	for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
		const context = await browser.newContext({ viewport });
		await context.addInitScript(
			({ token, member }) => {
				localStorage.setItem('chaal-club-session-v1', token);
				localStorage.setItem('chaal-club-member-v1', JSON.stringify(member));
			},
			{ token: owner.clubToken, member: profile.body.member }
		);
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
		await page.goto(`${process.env.CHAAL_BROWSER_URL}/admin`);
		await page.getByRole('button', { name: 'Bots', exact: true }).click();
		// The newest finished hand with bots is the one stored above.
		await page.locator('.bi-hands button').first().waitFor({ timeout: 20000 });
		await page.locator('.bi-hands button').first().click();
		await page.locator('.bi-decisions button').first().waitFor({ timeout: 20000 });
		await page.locator('.bi-detail .dg-lit').first().waitFor();
		const text = await page.locator('.bi').innerText();
		assert.ok(!text.includes('—'), 'no em dashes in the inspector');
		assert.ok(await page.locator('.bi-detail .bi-bars li').count() > 1, 'odds over the moves');
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		assert.ok(overflow <= 0, `${label}: no horizontal overflow (${overflow}px)`);
		assert.deepEqual(errors, []);
		await page.screenshot({ path: `${process.env.CHAAL_BROWSER_OUTPUT || '/tmp'}/bot-inspector-${label}.png`, fullPage: true });
		await context.close();
	}
});
