import { chromium } from 'playwright';
import parser from 'socket.io-msgpack-parser';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.PHASE10_TEEN_PATTI_BASE_URL || 'http://127.0.0.1:5176';
const directory = 'visual-baselines/phase10/table';
const variants = new Map([
	['classic-1', 3],
	['muflis-1', 3],
	['ak47-1', 3],
	['joker-1', 3],
	['lowest-joker-1', 3],
	['999-1', 3],
	['2-card-1', 2],
	['4-card-1', 4]
]);
const report = { capturedAt: new Date().toISOString(), checks: [], screenshots: [], errors: [] };
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({
	executablePath:
		process.env.PHASE10_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true
});
const contexts = [];

function watch(page, index, views) {
	page.on('websocket', (ws) => {
		const decoder = new parser.Decoder();
		decoder.on('decoded', (packet) => {
			if (packet.data?.[0] === 'roomData') views.set(index, packet.data[1]);
		});
		ws.on('framereceived', (frame) => {
			if (typeof frame.payload !== 'string') {
				try {
					decoder.add(frame.payload);
				} catch {
					/* Ignore non-game websocket packets. */
				}
			}
		});
	});
}

async function until(check, label) {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out: ${label}`);
}

try {
	const room = `round-choice-${Date.now().toString(36)}`;
	const pages = [];
	const views = new Map();
	for (let index = 0; index < 2; index++) {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		contexts.push(context);
		const page = await context.newPage();
		pages.push(page);
		page.on('pageerror', (error) => report.errors.push(String(error)));
		watch(page, index, views);
		if (index === 0) {
			await page.goto(`${base}/create-room`, { waitUntil: 'networkidle' });
			assert.equal(
				await page.locator('#variant').count(),
				0,
				'room creation should not require choosing a variant'
			);
			await page.locator('#roomName').fill(room);
			await page.locator('#create-room-btn').click();
		} else await page.goto(`${base}/${room}`, { waitUntil: 'networkidle' });
		await page.locator('#username').fill(`round-player-${index + 1}`);
		await page
			.getByRole('group', { name: 'Player Name' })
			.getByRole('button', { name: 'Join', exact: true })
			.click();
		await until(
			() => views.get(index)?.usersList.some((player) => player.id === views.get(index).selfId),
			`player ${index + 1} joined`
		);
	}
	assert.equal(views.get(0).rulesVersion, 'classic-1');
	for (const page of pages) await page.getByTestId('ready-toggle').click();
	await pages[0].getByRole('button', { name: 'Start Game', exact: true }).click();
	await until(() => views.get(0)?.isStarted, 'first Classic hand started');
	assert.equal(views.get(0).rulesVersion, 'classic-1');
	const seats = views.get(0).usersList.map(({ id, seatNumber }) => [id, seatNumber]);

	const actorId = views.get(0).usersList[views.get(0).currentPlayer].id;
	const actorPage = pages[views.get(0).usersList.findIndex((player) => player.id === actorId)];
	actorPage.once('dialog', (dialog) => dialog.accept());
	await actorPage
		.locator('.table-seat.self')
		.getByRole('button', { name: 'Pack', exact: true })
		.click();
	await until(() => views.get(0)?.gameShow, 'first hand settled');
	const controls = pages[0].getByTestId('next-round-controls');
	await controls.getByRole('button', { name: 'Random variant', exact: true }).click();
	await pages[0].getByRole('button', { name: 'I’m ready', exact: true }).click();
	await pages[1].getByRole('button', { name: 'I’m ready', exact: true }).click();
	await pages[0].getByTestId('next-round-start').waitFor({ state: 'visible' });
	await pages[0].getByTestId('next-round-start').click();
	await until(
		() => views.get(0)?.isStarted && views.get(0).handId !== null && views.get(0).result === null,
		'random next hand started'
	);
	const randomVersion = views.get(0).rulesVersion;
	assert.ok(variants.has(randomVersion), `server returned unknown variant ${randomVersion}`);
	assert.ok(
		views
			.get(0)
			.usersList.every((player) => player.cardsInHand.length === variants.get(randomVersion))
	);
	const self = pages[0].locator('.table-seat.self');
	await self.getByRole('button', { name: 'See', exact: true }).click();
	await until(
		() => views.get(0)?.usersList.find((player) => player.id === views.get(0).selfId)?.isBlind === false,
		'private cards revealed to their owner'
	);
	const visibleCards = await self.locator('[data-testid="card-fan"] playing-card').evaluateAll((cards) =>
		cards.map((card) => {
			const rect = card.getBoundingClientRect();
			return { width: rect.width, height: rect.height, rank: card.getAttribute('rank') };
		})
	);
	assert.equal(visibleCards.length, variants.get(randomVersion));
	assert.ok(visibleCards.every((card) => card.width >= 28 && card.height >= 40 && card.rank !== '0'));
	assert.deepEqual(
		views.get(0).usersList.map(({ id, seatNumber }) => [id, seatNumber]),
		seats
	);
	const pageFit = await pages[0].evaluate(() => ({
		width: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
		height: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
		documentHeight: document.documentElement.scrollHeight,
		viewportHeight: document.documentElement.clientHeight,
		scene: (() => { const r = document.querySelector('[data-testid="table-scene"]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; })(),
		center: (() => { const r = document.querySelector('[data-testid="table-center"]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; })(),
		seats: [...document.querySelectorAll('.table-seat')].map((el) => { const r = el.getBoundingClientRect(); return { position: el.dataset.position, top: r.top, bottom: r.bottom, height: r.height }; })
	}));
	assert.equal(pageFit.width, true);
	assert.equal(pageFit.height, true, JSON.stringify(pageFit));
	await pages[0].evaluate(() => window.scrollTo(0, 0));
	await pages[0].screenshot({ path: `${directory}/teen-patti-random-next-hand-desktop.png` });
	report.screenshots.push('teen-patti-random-next-hand-desktop');
	report.checks.push(
		`Created a Classic room without variant selection, completed a hand, chose Random variant, and server started ${randomVersion} with the correct card count. The owner revealed and saw all cards while seat identities stayed unchanged.`
	);
	assert.deepEqual(report.errors, []);
} catch (error) {
	report.errors.push(String(error));
	process.exitCode = 1;
	console.error(error);
} finally {
	for (const context of contexts) await context.close().catch(() => {});
	await browser.close();
	await fs.writeFile(
		`${directory}/teen-patti-browser-report.json`,
		JSON.stringify(report, null, 2) + '\n'
	);
	console.log(JSON.stringify(report, null, 2));
}
