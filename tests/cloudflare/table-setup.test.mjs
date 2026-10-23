import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';
import { migrateAnalytics } from '../../server/analytics/store.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { createSession, post, members, closeClub } from './club-helper.mjs';

const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
test.after(async () => {
	await mongo.close();
	await closeClub();
});

/* A new table opens on "Setting up your table" while its bots sit down, then the table itself:
 * no waiting-room caption, no lineup cards on the felt, Start the night in reach. */
for (const [label, viewport] of [
	['desktop', { width: 1440, height: 900 }],
	['phone', { width: 390, height: 844 }]
])
	test(`table setup screen, then the table (${label})`, async (t) => {
		await migrateAnalytics(db);
		await seedCharacters(db);
		const session = await createSession({ nickname: 'Setup Tester' });
		await members.updateOne({ email: session.email }, { $set: { role: 'owner' } });
		const profile = await post('/me', {
			token: session.clubToken,
			body: { profile: { nickname: 'Setup Tester', characterId: 'owl' }, onboard: true }
		});
		const browser = await chromium.launch({
			headless: true,
			...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' })
		});
		t.after(() => browser.close());
		const context = await browser.newContext({ viewport });
		await context.addInitScript(
			({ token, member }) => {
				localStorage.setItem('chaal-club-session-v1', token);
				localStorage.setItem('chaal-club-member-v1', JSON.stringify(member));
			},
			{ token: session.clubToken, member: profile.body.member }
		);
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
		const out =
			process.env.CHAAL_BROWSER_OUTPUT || new URL('../../.sim/screens', import.meta.url).pathname;
		mkdirSync(out, { recursive: true });

		await page.goto(`${process.env.CHAAL_BROWSER_URL}/create-room?game=teen-patti`);
		await page.getByTestId('play-bots').click();
		const setup = page.getByRole('status').filter({ hasText: 'Setting up your table' });
		await setup.waitFor({ timeout: 20000 });
		await page.waitForTimeout(700);
		await page.screenshot({ path: `${out}/table-setup-${label}-loading.png` });
		assert.match(await setup.innerText(), /Shuffling the deck/);

		// Then the table: the setup screen is gone and the host can start.
		await setup.waitFor({ state: 'detached', timeout: 20000 });
		await page.getByTestId(label === 'phone' ? 'mobile-deal-first' : 'deal-first').waitFor({
			timeout: 10000
		});
		await page.waitForTimeout(600);
		await page.screenshot({ path: `${out}/table-setup-${label}-table.png` });
		assert.equal(await page.locator('.lobby-eyebrow, .night-game').count(), 0);
		assert.equal(await page.getByText('Waiting for friends to join').count(), 0);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
			false
		);
		assert.deepEqual(errors, []);
	});
