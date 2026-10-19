import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { createSession, post, members, closeClub } from './club-helper.mjs';
const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
test.after(async () => {
	await mongo.close();
	await closeClub();
});

test('opt-in Dhoni depth renderer follows real Worker hand events and preserves the unflagged seat', async (t) => {
	await seedCharacters(mongo.db('chaal-cf-test'));
	const session = await createSession({ nickname: 'Presence QA' });
	await members.updateOne({ email: session.email }, { $set: { role: 'owner' } });
	const profile = await post('/me', {
		token: session.clubToken,
		body: { profile: { nickname: 'Presence QA', characterId: 'owl' }, onboard: true }
	});
	assert.equal(profile.response.status, 200);
	const created = await post('/rooms', {
		token: session.token,
		body: {
			event: 'createRoom',
			args: ['', 1000, 'classic-1', 'teen-patti', { boot: 10, autoReady: true, potLimit: 64 }],
			meta: { commandId: randomUUID() }
		}
	});
	assert.equal(created.body.ok, true, JSON.stringify(created.body));
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
			localStorage.setItem('chaal-auto-deal-v1', 'off');
		},
		{ token: session.clubToken, member: profile.body.member }
	);
	const page = await context.newPage(),
		errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const url = `${process.env.CHAAL_BROWSER_URL}/${created.body.roomName}`;
	await page.goto(`${url}?botPresence=dhoni`);
	const picker = page.getByTestId('bot-picker').first();
	await picker.waitFor({ timeout: 30000 });
	await picker.getByRole('button', { name: /MS Dhoni/ }).click();
	const seat = page.locator('[data-testid="player-seat"][data-bot-id="ms-dhoni"]');
	await seat.getByTestId('perspective-head').waitFor({ timeout: 20000 });
	await page.waitForFunction(
		() => document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	const command = (event, args = []) =>
		page.evaluate(
			async ({ event, args }) => {
				const { socket } = await import('/src/lib/stores/socket-store.svelte.ts');
				return await socket.command(event, args);
			},
			{ event, args }
		);
	const state = () =>
		page.evaluate(async () => {
			const { socket } = await import('/src/lib/stores/socket-store.svelte.ts');
			const view = socket.roomData;
			return {
				revision: view?.revision,
				handId: view?.handId,
				gameShow: view?.gameShow,
				bet: !!view?.legalActions.bet,
				see: !!view?.legalActions.see,
				maxBet: view?.legalActions.maxBet,
				result: view?.result ? { winnerId: view.result.winnerId } : null
			};
		});
	const started = await command('start', [created.body.roomName, 0, 3, 'classic-1', 'selected']);
	assert.equal(started.ok, true, JSON.stringify(started));
	const observed = [];
	for (let tries = 0; tries < 100; tries++) {
		const view = await state();
		if (view.gameShow) break;
		if (view.bet) {
			if (view.see) {
				const seen = await command('seeCards');
				assert.equal(seen.ok, true, JSON.stringify(seen));
			}
			const next = await state();
			const played = await command('play', [false, next.maxBet]);
			assert.equal(played.ok, true, JSON.stringify(played));
			observed.push('human public bet');
			await page.waitForTimeout(200);
			break;
		}
		await page.waitForTimeout(100);
	}
	for (let tries = 0; tries < 150; tries++) {
		const view = await state();
		if (view.gameShow) break;
		if (view.bet) {
			const packed = await command('play', [true]);
			assert.equal(packed.ok, true, JSON.stringify(packed));
			observed.push('human public pack');
		}
		await page.waitForTimeout(100);
	}
	assert.equal((await state()).gameShow, true, 'real Worker hand finishes normally');
	await page.waitForFunction(() =>
		['BOT_WON', 'BOT_LOST'].includes(
			document.querySelector('[data-testid="presence-character"]')?.dataset.event
		)
	);
	const result = await page.getByTestId('presence-character').getAttribute('data-event');
	const output = join(tmpdir(), 'chaal-presence-review');
	await mkdir(output, { recursive: true });
	await page.screenshot({ path: join(output, 'live-table-desktop.png'), fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForFunction(() => {
		const actor = document.querySelector(
			'[data-testid="player-seat"][data-bot-id="ms-dhoni"] [data-testid="bot-avatar"]'
		);
		if (!actor) return false;
		const r = actor.getBoundingClientRect();
		return (
			r.left >= 0 &&
			r.right <= innerWidth &&
			r.top >= 40 &&
			r.top < innerHeight &&
			r.bottom <= innerHeight
		);
	});
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await page.screenshot({ path: join(output, 'live-table-phone.png'), fullPage: true });
	// The same real room without the preview query flag must retain its existing mascot.
	await page.goto(url);
	await seat.getByTestId('bot-avatar').waitFor();
	assert.equal(await page.getByTestId('presence-character').count(), 0);
	await seat.locator('.mascot').waitFor();
	assert.deepEqual(errors, []);
	await writeFile(
		join(output, 'live-table-results.json'),
		JSON.stringify({ observed, result, unflagged: 'existing mascot', errors }, null, 2) + '\n'
	);
});
