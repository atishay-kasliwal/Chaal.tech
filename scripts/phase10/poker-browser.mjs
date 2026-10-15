import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { watchRoomData } from '../game-frames.mjs';

const base = process.env.PHASE10_BASE_URL || 'http://127.0.0.1:5174';
const directory = 'visual-baselines/phase10/poker';
const report = { capturedAt: new Date().toISOString(), checks: [], screenshots: [], errors: [] };
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({
	executablePath:
		process.env.PHASE10_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true
});
const contexts = [];

async function until(check, label, timeout = 20000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out: ${label}`);
}

async function capture(page, name) {
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
	report.screenshots.push(name);
}

function observeRoom(page, index, views) {
	page.on('websocket', (ws) => {
		watchRoomData(ws, (snapshot) => views.set(index, snapshot));
	});
}

try {
	const count = 6;
	let room = '';
	const pages = [];
	const views = new Map();
	for (let index = 0; index < count; index++) {
		const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
		contexts.push(context);
		const page = await context.newPage();
		pages.push(page);
		page.on('pageerror', (error) => report.errors.push(String(error)));
		observeRoom(page, index, views);
		if (index === 0) {
			await page.goto(`${base}/create-room`, { waitUntil: 'networkidle' });
			await page.locator('#gameType').selectOption('texas-holdem');
			await page.locator('#create-room-btn').click();
			await page.waitForURL((url) => /^\/[a-f0-9]{32}$/.test(url.pathname));
			room = new URL(page.url()).pathname.slice(1);
		} else await page.goto(`${base}/${room}`, { waitUntil: 'networkidle' });
		await page.locator('#username').fill(`poker-friend-${index + 1}`);
		await page
			.getByRole('group', { name: 'Player Name' })
			.getByRole('button', { name: 'Join', exact: true })
			.click();
		await until(
			() => views.get(index)?.usersList.some((p) => p.id === views.get(index).selfId),
			`player ${index + 1} joined`
		);
		assert.equal(views.get(index).gameType, 'texas-holdem');
	}
	for (const page of pages) await page.getByTestId('ready-toggle').click();
	await until(
		() =>
			views.get(0)?.usersList.filter((p) => p.connected && !p.hasLeft).length === 6 &&
			views.get(0).usersList.every((p) => p.ready),
		'six players ready'
	);
	await pages[0].getByRole('button', { name: 'Start Game', exact: true }).click();
	await until(() => views.get(0)?.isStarted, 'Hold’em hand started');

	for (let index = 0; index < count; index++) {
		await pages[index].getByTestId('table-scene').waitFor();
		const view = views.get(index);
		assert.equal(view.usersList.length, 6);
		assert.equal(view.usersList.find((p) => p.id === view.selfId).cardsInHand.length, 2);
		for (const opponent of view.usersList.filter((p) => p.id !== view.selfId))
			assert.deepEqual(opponent.cardsInHand, [
				{ rank: 0, suit: '' },
				{ rank: 0, suit: '' }
			]);
		const layout = await pages[index].locator('[data-testid="table-scene"]').evaluate((scene) => {
			const rect = (element) => {
				const r = element.getBoundingClientRect();
				return {
					x: r.x,
					y: r.y,
					right: r.right,
					bottom: r.bottom,
					width: r.width,
					height: r.height
				};
			};
			return {
				center: rect(scene.querySelector('[data-testid="table-center"]')),
				seats: [...scene.querySelectorAll('.table-seat')].map((element) => ({
					self: element.classList.contains('self'),
					id: element.dataset.playerId,
					position: element.dataset.position,
					...rect(element)
				})),
				overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
				verticalOverflow:
					document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
			};
		});
		assert.equal(layout.seats.length, 6);
		assert.equal(layout.seats.find((seat) => seat.self)?.id, view.selfId);
		assert.equal(layout.seats.find((seat) => seat.self)?.position, 'bottom');
		assert.equal(new Set(layout.seats.map((seat) => seat.id)).size, 6);
		assert.equal(layout.overflow, false);
		assert.equal(layout.verticalOverflow, false, 'desktop table should fit without page scrolling');
		const renderedCards = await pages[index]
			.locator('.table-seat.self [data-testid="hole-card"]')
			.evaluateAll((cards) =>
				cards.map((card) => ({
					faceDown: card.getAttribute('data-face-down'),
					width: card.getBoundingClientRect().width,
					height: card.getBoundingClientRect().height
				}))
			);
		assert.equal(renderedCards.length, 2);
		assert.ok(
			renderedCards.every(
				(card) => card.faceDown === 'false' && card.width >= 50 && card.height >= 70
			)
		);
		const hiddenCards = await pages[index]
			.locator('.table-seat:not(.self) [data-testid="hole-card"]')
			.evaluateAll((cards) =>
				cards.every((card) => card.getAttribute('data-face-down') === 'true')
			);
		assert.equal(hiddenCards, true, 'opponents’ hole cards must remain hidden in the UI');
	}
	await capture(pages[0], 'six-players-desktop');

	for (let actionNumber = 0; actionNumber < 24 && !views.get(0)?.result; actionNumber++) {
		const snapshot = views.get(0);
		const actorId = snapshot.usersList[snapshot.currentPlayer]?.id;
		assert.ok(actorId, 'active hand has a current player');
		const actorIndex = snapshot.usersList.findIndex((p) => p.id === actorId);
		const actorPage = pages[actorIndex];
		await until(
			() =>
				views.get(actorIndex)?.revision === snapshot.revision &&
				views.get(actorIndex)?.selfId === actorId,
			'acting browser received its current view'
		);
		const actorView = views.get(actorIndex);
		const self = actorView.usersList.find((p) => p.id === actorView.selfId);
		const firstAction = actionNumber === 0;
		if (firstAction) {
			await actorPage.setViewportSize({ width: 390, height: 844 });
			await actorPage.getByTestId('poker-mobile-actions').waitFor({ state: 'visible' });
			const mobileFit = await actorPage.evaluate(() => ({
				width: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
				height: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1
			}));
			assert.deepEqual(mobileFit, { width: true, height: true });
			await capture(actorPage, 'six-players-mobile-active-seat');
		}
		const mobile = await actorPage.locator('[data-testid="poker-mobile-actions"]').isVisible();
		const controls = actorPage.locator(
			mobile ? '[data-testid="poker-mobile-actions"]' : '[data-testid="poker-actions"]'
		);
		if (actorView.legalActions.call) await controls.getByRole('button', { name: /^Call/ }).click();
		else {
			assert.equal(actorView.legalActions.check, true, `player ${self.username} can call or check`);
			await controls.getByRole('button', { name: 'Check', exact: true }).click();
		}
		await until(
			() => views.get(0)?.revision > snapshot.revision || views.get(0)?.result,
			`action ${actionNumber + 1} committed`
		);
	}
	assert.ok(views.get(0)?.result, 'six-player hand reaches a showdown');
	assert.equal(views.get(0).board.length, 5);
	assert.equal(views.get(0).pot, 0);
	for (const view of views.values()) {
		assert.ok(view.usersList.every((p) => p.cardsInHand.length === 2));
		assert.ok(
			view.usersList.every((p) => p.folded || p.cardsInHand.every((card) => card.rank > 0))
		);
	}
	await capture(pages[0], 'six-players-showdown');
	report.checks.push(
		'Six independent browsers created a Hold’em room, readied, played all streets, preserved private hole cards, verified six stable seats, mobile controls, and reached showdown.'
	);
	assert.deepEqual(report.errors, []);
} catch (error) {
	report.errors.push(String(error));
	process.exitCode = 1;
	console.error(error);
} finally {
	for (const context of contexts) await context.close().catch(() => {});
	await browser.close();
	await fs.writeFile(`${directory}/browser-report.json`, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
}
