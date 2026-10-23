import test from 'node:test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { migrateAnalytics } from '../../server/analytics/store.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';
import {
	baseURL,
	origin,
	createSession,
	openPlayer,
	post,
	members,
	closeClub
} from './club-helper.mjs';

const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
test.after(async () => {
	await mongo.close();
	await closeClub();
});
const get = async (path, token) => {
	const response = await fetch(`${baseURL}${path}`, {
		headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
	});
	return { response, body: await response.json() };
};

test('real Worker enforces bot directory/owner permissions, character seating and club availability', async (t) => {
	await migrateAnalytics(db);
	await seedCharacters(db);
	const hostSession = await createSession({ nickname: 'Bot host' });
	const guestSession = await createSession({ nickname: 'Bot guest' });
	await members.updateOne({ email: hostSession.email }, { $set: { role: 'owner' } });
	assert.equal((await get('/bots')).response.status, 401);
	assert.equal((await get('/admin/bots', guestSession.clubToken)).response.status, 403);
	assert.equal(
		(
			await post('/admin/bots', {
				token: guestSession.clubToken,
				body: { action: 'availability', botIds: [] }
			})
		).response.status,
		403
	);
	const directory = await get('/bots', hostSession.clubToken);
	assert.equal(directory.body.bots.length, 5);
	assert.doesNotMatch(JSON.stringify(directory.body), /tendencies|configHash|botTrace|preDeal/);
	const created = await post('/rooms', {
		token: hostSession.token,
		body: {
			event: 'createRoom',
			args: ['', 1000, 'classic-1', 'teen-patti', { boot: 10, autoReady: true }],
			meta: { commandId: randomUUID() }
		}
	});
	assert.equal(created.body.ok, true, JSON.stringify(created.body));
	const host = openPlayer(hostSession, created.body.roomName);
	const guest = openPlayer(guestSession, created.body.roomName);
	t.after(() => {
		host.ws.close();
		guest.ws.close();
	});
	await Promise.all([host.open, guest.open]);
	await host.send('joinRoom', ['Host', created.body.roomName], false);
	await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList.length === 1);
	await guest.send('joinRoom', ['Guest', created.body.roomName], false);
	await guest.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList.length === 2);
	assert.equal((await guest.send('addBot', ['gg'])).ok, false);
	await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList.length === 2);
	for (const [index, id] of ['rohit-sharma', 'virat-kohli', 'gg'].entries()) {
		const added = await host.send('addBot', [id]);
		assert.equal(added.ok, true, JSON.stringify(added));
		await host.waitFor(
			(p) => p.event === 'roomData' && p.args?.[0]?.usersList.length === index + 3
		);
	}
	assert.equal((await host.send('addBot', ['gg'])).ok, false);
	assert.equal(new Set(host.view.usersList.filter((u) => u.bot).map((u) => u.botId)).size, 3);
	assert.doesNotMatch(JSON.stringify(host.view), /tendencies|configHash|validation|botTrace/);
	const disabled = await post('/admin/bots', {
		token: hostSession.clubToken,
		body: { action: 'availability', botIds: [] }
	});
	assert.equal(disabled.response.status, 200);
	assert.equal((await get('/bots', guestSession.clubToken)).body.bots.length, 0);
	assert.equal((await host.send('addBot', ['ms-dhoni'])).ok, false);
	assert.equal(host.view.usersList.filter((u) => u.bot).length, 3, 'existing seats stay intact');
	await post('/admin/bots', {
		token: hostSession.clubToken,
		body: { action: 'availability', botIds: directory.body.bots.map((bot) => bot.botId) }
	});
});

test('all five member mascot links round-trip through owner admin, profiles and the public roster', async () => {
	const owner = await createSession({ nickname: 'Mascot owner' });
	await members.updateOne({ email: owner.email }, { $set: { role: 'owner' } });
	for (const mascotId of ['atishay', 'adityaraj', 'mradul', 'divyansh', 'adarsh']) {
		const friend = await createSession({ nickname: `Mascot ${mascotId}` });
		const document = await members.findOne({ email: friend.email });
		const linked = await post('/admin', {
			token: owner.clubToken,
			body: { action: 'mascot', memberId: String(document._id), mascotId }
		});
		assert.equal(linked.response.status, 200, JSON.stringify(linked.body));
		const profile = await get('/me', friend.clubToken);
		assert.equal(profile.body.member.mascotId, mascotId);
		const refreshed = await get('/club/settings', friend.clubToken);
		assert.equal(refreshed.body.member.mascotId, mascotId);
		assert.equal(
			refreshed.body.members.find((m) => m.memberId === String(document._id)).mascotId,
			mascotId
		);
		assert.ok(refreshed.body.members.every((m) => !('email' in m)));
	}
});

test('character UI, live picker, bot seats, owner validation and mobile layout work against the real Worker', async (t) => {
	assert.ok(process.env.CHAAL_BROWSER_URL, 'browser server supplied by test runner');
	await migrateAnalytics(db);
	await seedCharacters(db);
	const session = await createSession({ nickname: 'Character QA' });
	await members.updateOne(
		{ email: session.email },
		{ $set: { role: 'owner', mascotId: 'atishay' } }
	);
	const profile = await post('/me', {
		token: session.clubToken,
		body: { profile: { nickname: 'Character QA', characterId: 'owl' }, onboard: true }
	});
	assert.equal(profile.response.status, 200, JSON.stringify(profile.body));
	const browser = await chromium.launch({
		headless: true,
		...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' })
	});
	t.after(() => browser.close());
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	await context.addInitScript(
		({ token, member }) => {
			localStorage.setItem('chaal-club-session-v1', token);
			localStorage.setItem('chaal-club-member-v1', JSON.stringify(member));
		},
		{ token: session.clubToken, member: profile.body.member }
	);
	let page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const url = process.env.CHAAL_BROWSER_URL;
	const output = process.env.CHAAL_BROWSER_OUTPUT || '/tmp/chaal-phase3-browser';
	await mkdir(output, { recursive: true });
	await page.goto(`${url}/bots`);
	await page.getByRole('heading', { name: 'THE CHAAL LEAGUE.' }).waitFor();
	assert.equal(await page.locator('.competitor').count(), 5);
	await page.screenshot({
		path: `${output}/bots-desktop.png`,
		fullPage: true,
		animations: 'disabled'
	});
	await page.locator('.player-tabs').getByRole('button', { name: /Rohit/ }).click();
	await page.locator('.dossier-copy').getByRole('heading', { name: 'Rohit.' }).waitFor();
	await page.screenshot({
		path: `${output}/bot-profile.png`,
		fullPage: true,
		animations: 'disabled'
	});
	await page.getByRole('link', { name: 'Take on Rohit' }).click();
	await page.getByTestId('play-bots').waitFor();
	await page.getByTestId('play-bots').click();
	await page.getByTestId('bot-avatar').waitFor({ timeout: 30000 });
	assert.equal(await page.getByTestId('bot-avatar').count(), 1);
	assert.ok(await page.getByTestId('bot-avatar').locator('.mascot').getAttribute('aria-label'));
	// Add another distinct permanent opponent through the table's Add company panel.
	await page
		.getByTestId('table-center')
		.getByRole('button', { name: 'Add company', exact: true })
		.click();
	const picker = page
		.getByRole('dialog', { name: 'invite', exact: true })
		.getByTestId('bot-picker');
	await picker.getByRole('button', { name: /Virat Kohli/ }).click();
	await page.waitForFunction(
		() => document.querySelectorAll('[data-testid="bot-avatar"]').length === 2
	);
	assert.equal(await picker.getByRole('button', { name: /Rohit Sharma/ }).isDisabled(), true);
	await page
		.getByRole('dialog', { name: 'invite', exact: true })
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await page.screenshot({
		path: `${output}/bot-seats-desktop.png`,
		fullPage: true,
		animations: 'disabled'
	});
	assert.equal(
		await page.locator('[data-bot-id="rohit-sharma"]').getAttribute('data-bot-style'),
		'rohit-sharma@1'
	);
	const tableUrl = page.url();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({
		path: `${output}/bot-seats-mobile.png`,
		fullPage: true,
		animations: 'disabled'
	});
	assert.ok(
		await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
		'mobile table fits viewport'
	);
	assert.equal(
		await page
			.getByTestId('table-center')
			.getByRole('button', { name: 'Add company', exact: true })
			.isVisible(),
		false
	);
	await page
		.getByTestId('action-dock')
		.getByRole('button', { name: 'Add company', exact: true })
		.click();
	const inviteDialog = page.getByRole('dialog', { name: 'invite', exact: true });
	await inviteDialog.getByTestId('bot-picker').waitFor();
	assert.equal(await inviteDialog.getByRole('button', { name: /Rohit Sharma/ }).isDisabled(), true);
	await page.screenshot({
		path: `${output}/bot-picker-mobile.png`,
		fullPage: true,
		animations: 'disabled'
	});
	await inviteDialog.getByRole('button', { name: 'Close', exact: true }).click();
	const tablePage = page;
	page = await context.newPage();
	page.on('pageerror', (e) => errors.push(e.message));
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${url}/bots`);
	await page.getByRole('heading', { name: 'THE CHAAL LEAGUE.' }).waitFor();
	assert.ok(
		await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
		'mobile directory fits viewport'
	);
	await page.screenshot({
		path: `${output}/bots-mobile.png`,
		fullPage: true,
		animations: 'disabled'
	});
	await page.goto(`${url}/admin/bots`);
	await page.getByRole('heading', { name: 'The character room', exact: true }).waitFor();
	await page.getByRole('button', { name: /Rohit Sharma.*active/ }).click();
	await page.getByRole('button', { name: 'Copy into next draft' }).click();
	await page.getByRole('button', { name: 'Run validation', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Run validation', exact: true }).click();
	await page.getByText('Validation passed', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'Publish immutable version', exact: true }).click();
	await page.getByRole('button', { name: /rohit-sharma@2 · published · current/ }).waitFor();
	assert.ok(
		await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
		'mobile admin fits viewport'
	);
	await page.screenshot({
		path: `${output}/bots-admin-mobile.png`,
		fullPage: true,
		animations: 'disabled'
	});
	// The same owner size control updates both human and bot mascots on open tables.
	await page.goto(`${url}/admin`);
	await page.getByRole('button', { name: 'Look', exact: true }).click();
	const slider = page.locator('#mascot-size');
	await slider.fill('135');
	await page.locator('.mascot-size-preview .mascot').first().waitFor();
	assert.equal(await page.locator('.mascot-size-preview .mascot').count(), 5);
	await page.getByRole('button', { name: 'Save look', exact: true }).click();
	await page
		.getByText('Saved. Open tables pick up mascot size changes within 15 seconds.', { exact: true })
		.waitFor();
	await tablePage.bringToFront();
	await tablePage.waitForFunction(
		() =>
			[...document.querySelectorAll('[data-bot-id] .mascot')].every((element) => {
				const avatar = element.closest('.bot-avatar');
				const expected = Math.min(
					283.5,
					avatar.getBoundingClientRect().width * 0.7 * (283.5 / 210)
				);
				return Math.abs(element.getBoundingClientRect().width - expected) < 1;
			}),
		{},
		{ timeout: 20000 }
	);
	assert.ok(await tablePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	// Publishing a new version never changes the version on a seated character.
	await page.goto(tableUrl);
	await page.getByTestId('bot-avatar').first().waitFor();
	assert.equal(
		await page.locator('[data-bot-id="rohit-sharma"]').getAttribute('data-bot-style'),
		'rohit-sharma@1'
	);
	assert.deepEqual(errors, []);
});
