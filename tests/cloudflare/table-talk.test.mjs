import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';
import { migrateAnalytics } from '../../server/analytics/store.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { TALK_LINES } from '../../shared/talk-lines.mjs';
import { createSession, openPlayer, post, members, closeClub } from './club-helper.mjs';

/* Phase 6 table talk against the real Worker. The test runner sets BOT_TALK_CHANCE=1, so every
 * notable moment speaks (the one-per-hand and cooldown limits still hold). */
const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
test.after(async () => {
	await mongo.close();
	await closeClub();
});
const ALL_LINES = new Set(
	Object.values(TALK_LINES).flatMap((byCue) => Object.values(byCue).flat())
);
const pattern = (line) =>
	new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{name\\}', '.+')}$`);
const PATTERNS = [...ALL_LINES].map(pattern);
/** True when the text is one of the table talk lines (a `{name}` filled with any name). */
const spoken = (text) => PATTERNS.some((p) => p.test(text));

test('real Worker: a character says a line from its list when a hand ends, beside the room update', async (t) => {
	await migrateAnalytics(db);
	await seedCharacters(db);
	const session = await createSession({ nickname: 'Talk host' });
	const made = await post('/rooms', {
		token: session.token,
		body: {
			event: 'createRoom',
			args: ['', 1000, 'classic-1', 'teen-patti', { boot: 10, autoReady: true }],
			meta: { commandId: randomUUID() }
		}
	});
	assert.equal(made.body.ok, true, JSON.stringify(made.body));
	const host = openPlayer(session, made.body.roomName);
	t.after(() => host.ws.close());
	const talk = [];
	host.ws.addEventListener('message', (event) => {
		const packet = JSON.parse(event.data);
		if (packet.type === 'event' && packet.event === 'botTalk') talk.push(packet.args[0]);
	});
	await host.open;
	await host.send('joinRoom', ['Talk host', made.body.roomName], false);
	await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.usersList.length === 1);
	for (const [index, id] of ['rohit-sharma', 'virat-kohli'].entries()) {
		assert.equal((await host.send('addBot', [id])).ok, true);
		await host.waitFor(
			(p) => p.event === 'roomData' && p.args?.[0]?.usersList.length === index + 2
		);
	}
	const start = await host.send('start', [made.body.roomName, 0, 3, 'classic-1', 'selected']);
	assert.equal(start.ok, true, JSON.stringify(start));
	await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.revision >= start.revision);
	// The person packs at once; the two characters play the hand out between them.
	for (let i = 0; i < 60 && host.view.isStarted && !host.view.gameShow; i++) {
		const view = host.view;
		if (view.usersList[view.currentPlayer]?.id === session.playerId) {
			const packed = await host.send('play', [true, 0]);
			assert.equal(packed.ok, true, JSON.stringify(packed));
			await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.revision >= packed.revision);
		} else
			await host.waitFor((p) => p.event === 'roomData' && p.args?.[0]?.revision > view.revision);
	}
	assert.ok(host.view.gameShow, 'the hand ended');
	const bots = host.view.usersList.filter((u) => u.bot);
	for (let i = 0; i < 20 && !talk.some((l) => l.handId === host.view.result.handId); i++)
		await new Promise((resolve) => setTimeout(resolve, 250));
	assert.ok(talk.length >= 1, 'a character spoke');
	assert.ok(talk.length <= 2, 'at most a blind raise and the hand end');
	for (const line of talk) {
		assert.equal(line.roomName, made.body.roomName);
		assert.ok(
			bots.some((b) => b.id === line.playerId && b.botId === line.botId),
			line.playerId
		);
		assert.ok(spoken(line.text), line.text);
		assert.doesNotMatch(JSON.stringify(line), /cards|rank|suit|seed/);
	}
	const end = talk.find((l) => l.handId === host.view.result.handId && l.cue !== 'BLIND_RAISE');
	if (talk.every((l) => l.cue === 'BLIND_RAISE'))
		assert.ok(true, 'the table cooldown held the hand-end line back after a blind raise');
	else assert.ok(end && end.delayMs > 0, 'a hand-end line waits for the result to land');
});

test('browser: a bot line shows as a bubble on its seat, desktop and phone, and Bot chat turns it off', async (t) => {
	assert.ok(process.env.CHAAL_BROWSER_URL, 'browser server supplied by test runner');
	await migrateAnalytics(db);
	await seedCharacters(db);
	const session = await createSession({ nickname: 'Talk viewer' });
	await members.updateOne({ email: session.email }, { $set: { role: 'owner' } });
	const profile = await post('/me', {
		token: session.clubToken,
		body: { profile: { nickname: 'Talk viewer', characterId: 'owl' }, onboard: true }
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
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const output = process.env.CHAAL_BROWSER_OUTPUT || '/tmp/chaal-table-talk';
	await mkdir(output, { recursive: true });
	await page.goto(`${process.env.CHAAL_BROWSER_URL}/create-room`);
	await page.getByTestId('play-bots').click();
	await page.getByTestId('bot-avatar').first().waitFor({ timeout: 30000 });
	await page.getByTestId('bot-chat-toggle').waitFor();
	assert.equal(await page.getByTestId('bot-chat-toggle').getAttribute('aria-pressed'), 'true');
	// Every bot seat keeps a polite live region mounted for its lines.
	const slots = await page.getByTestId('talk-slot').count();
	assert.ok(slots >= 1);
	assert.equal(await page.getByTestId('talk-slot').first().getAttribute('aria-live'), 'polite');

	await page.getByTestId('deal-first').click();
	// Pack whenever it is our turn; the characters finish the hand and one of them speaks. (A hello
	// on the first deal is a different, client-side line: wait for a table talk line.)
	const lineShowing = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('[data-testid="talk-bubble"]')].map((b) =>
				// The visible text, without the screen-reader name prefix.
				[...b.childNodes]
					.filter((n) => n.nodeType === Node.TEXT_NODE)
					.map((n) => n.textContent)
					.join('')
					.trim()
			)
		);
	const nextLine = async (atResult = false) => {
		// Let any line on screen go first, then play on (packing) until a new one shows.
		for (let i = 0; i < 40 && (await lineShowing()).some(spoken); i++)
			await page.waitForTimeout(250);
		for (let i = 0; i < 600; i++) {
			const text = (await lineShowing()).find(spoken);
			if (text && (!atResult || (await page.getByTestId('next-round-controls').isVisible())))
				return text;
			const pack = page.getByTestId('game-actions').locator('.act.pack');
			if (await pack.isEnabled({ timeout: 200 }).catch(() => false))
				await pack.click({ timeout: 1000 }).catch(() => {});
			const deal = page.getByTestId('next-round-start');
			if (await deal.isEnabled({ timeout: 200 }).catch(() => false))
				await deal.click({ timeout: 1000 }).catch(() => {});
			await page.waitForTimeout(250);
		}
		return null;
	};
	assert.ok(await nextLine(), 'a table talk line showed on a seat (desktop)');
	const bubble = page.getByTestId('talk-bubble').first();
	assert.match(
		(await bubble.textContent()).trim(),
		/^\S[^:]*: \S.+$/,
		'the bubble names who is talking for screen readers'
	);
	await page.screenshot({ path: `${output}/table-talk-desktop.png` });
	await checkPlacement(page, 'desktop');
	await page.setViewportSize({ width: 390, height: 844 });
	assert.ok(await nextLine(), 'a table talk line showed on a seat (phone)');
	await page.screenshot({ path: `${output}/table-talk-phone.png` });
	await checkPlacement(page, 'phone');
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	// A hand-end line, with the shown cards and the result on the felt.
	assert.ok(await nextLine(true), 'a hand-end line (phone)');
	await page.screenshot({ path: `${output}/table-talk-phone-result.png` });
	await checkPlacement(page, 'phone result');
	await page.setViewportSize({ width: 1440, height: 1000 });
	assert.ok(await nextLine(true), 'a hand-end line (desktop)');
	await page.screenshot({ path: `${output}/table-talk-desktop-result.png` });
	await checkPlacement(page, 'desktop result');

	// Bot chat off: the bubble goes at once, the choice is kept on this device.
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.getByTestId('bot-chat-toggle').click();
	assert.equal(await page.getByTestId('bot-chat-toggle').getAttribute('aria-pressed'), 'false');
	assert.equal(await page.getByTestId('talk-bubble').count(), 0);
	assert.equal(await page.evaluate(() => localStorage.getItem('chaal-bot-chat-v1')), 'off');
	await page.getByTestId('bot-chat-toggle').click();
	assert.equal(await page.evaluate(() => localStorage.getItem('chaal-bot-chat-v1')), 'on');

	// Trick tables (dev practice harnesses, ?talk: every character holds a line): same bubble, placed
	// beside each seat tile without covering cards or buttons.
	for (const [route, seats] of [
		['test-325', 2],
		['test-pakad', 3],
		['test-29', 3]
	])
		for (const [width, height] of [
			[1440, 1000],
			[390, 844]
		]) {
			await page.setViewportSize({ width, height });
			await page.goto(`${process.env.CHAAL_BROWSER_URL}/${route}?talk`);
			await page.waitForFunction(
				(n) => document.querySelectorAll('[data-testid="talk-bubble"]').length === n,
				seats,
				{ timeout: 20000 }
			);
			await page.waitForTimeout(500); // the bubbles finish fading in
			await page.screenshot({ path: `${output}/table-talk-${route}-${width}.png` });
			await checkPlacement(page, `${route} ${width}`);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		}
	assert.deepEqual(errors, []);
});

/**
 * The bubble sits inside the viewport and covers no card and no button. Sampled with
 * elementsFromPoint, so what a tile clips away (a mascot's sprite cell) does not count.
 */
async function checkPlacement(page, label) {
	const problems = await page.evaluate(() => {
		const out = [];
		for (const bubble of document.querySelectorAll('[data-testid="talk-bubble"]')) {
			const box = bubble.getBoundingClientRect();
			if (box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight)
				out.push(`outside the viewport: ${JSON.stringify(box)}`);
			for (const fx of [0.05, 0.5, 0.95])
				for (const fy of [0.1, 0.5, 0.9]) {
					const x = box.left + box.width * fx;
					const y = box.top + box.height * fy;
					for (const element of document.elementsFromPoint(x, y)) {
						const hit = element.closest('.tp-card, .hand-card, button');
						if (hit && !bubble.contains(hit))
							out.push(
								`covers ${hit.className || hit.tagName} at ${Math.round(x)},${Math.round(y)}`
							);
					}
				}
		}
		// Two bubbles never sit on each other.
		const boxes = [...document.querySelectorAll('[data-testid="talk-bubble"]')].map((b) =>
			b.getBoundingClientRect()
		);
		for (let i = 0; i < boxes.length; i++)
			for (let j = i + 1; j < boxes.length; j++) {
				const [a, b] = [boxes[i], boxes[j]];
				if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
					out.push('two bubbles overlap');
			}
		return [...new Set(out)];
	});
	assert.deepEqual(problems, [], label);
}
