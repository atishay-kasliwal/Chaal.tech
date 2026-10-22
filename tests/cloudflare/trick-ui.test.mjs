import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';
import { migrateAnalytics } from '../../server/analytics/store.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { createSession, post, members, closeClub } from './club-helper.mjs';

// Throwaway (not committed): reproduce 3 2 5 with bots from the create screen in a browser.
const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
test.after(async () => {
	await mongo.close();
	await closeClub();
});

/* What a person does: the create screen's play-with-bots, then ready and deal, in each trick game.
 * The hand must start (cards in hand) with no page error. */
for (const [game, seats] of [
	['three-two-five', 3],
	['ten-pakad', 4],
	['twenty-nine', 4]
])
	test(`${game}: play with bots from the create screen, ready, deal`, async (t) => {
		await migrateAnalytics(db);
		await seedCharacters(db);
		const session = await createSession({ nickname: 'Trick Tester' });
		await members.updateOne({ email: session.email }, { $set: { role: 'owner' } });
		const profile = await post('/me', {
			token: session.clubToken,
			body: { profile: { nickname: 'Trick Tester', characterId: 'owl' }, onboard: true }
		});
		const browser = await chromium.launch({
			headless: true,
			...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' })
		});
		t.after(() => browser.close());
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
		await page.goto(`${process.env.CHAAL_BROWSER_URL}/create-room?game=${game}`);
		await page.getByTestId('play-bots').click();
		// Every seat filled: the person and the characters.
		await page.waitForFunction(
			(n) => document.querySelectorAll('.chip:not(.empty)').length === n,
			seats,
			{ timeout: 20000 }
		);
		await page.getByRole('button', { name: 'I’m ready' }).click();
		await page.getByRole('button', { name: 'Deal' }).click();
		await page.locator('.hand .card').first().waitFor({ timeout: 20000 });
		assert.deepEqual(errors, []);
		await page.screenshot({
			path: `${process.env.CHAAL_BROWSER_OUTPUT || '/tmp'}/trick-ui-${game}.png`
		});
	});
