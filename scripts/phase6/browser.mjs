import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { watchRoomData } from '../game-frames.mjs';

const base = process.env.PHASE6_BASE_URL || 'http://127.0.0.1:5174',
	directory = 'visual-baselines/phase10/table';
const playerCounts = process.env.PHASE6_ONLY_SIX === 'true' ? [6] : [2, 3, 4, 5, 6];
const report = { capturedAt: new Date().toISOString(), checks: [], screenshots: [], errors: [] };
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true
});
const contexts = [];

async function until(check, label) {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out: ${label}`);
}

async function capture(page, name) {
	await page
		.locator('.toast .alert')
		.last()
		.waitFor({ state: 'detached', timeout: 5000 })
		.catch(() => {});
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	await page.screenshot({ path: `${directory}/${name}.png` });
	report.screenshots.push(name);
	console.log(`Captured ${name}`);
}

async function mobileGeometry(page, count) {
	const data = await page.evaluate(() => {
		const rect = (selector) => {
			const r = document.querySelector(selector).getBoundingClientRect();
			return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
		};
		const seats = [...document.querySelectorAll('.table-seat')].map((seat) => {
			const r = seat.getBoundingClientRect();
			return {
				self: seat.classList.contains('self'),
				position: seat.dataset.position,
				x: r.x,
				y: r.y,
				right: r.right,
				bottom: r.bottom,
				width: r.width,
				height: r.height
			};
		});
		const ownedCards = [...document.querySelectorAll('.table-seat.self [data-testid="card-fan"] playing-card')].map((card) => {
			const r = card.getBoundingClientRect();
			return { top: r.top, bottom: r.bottom };
		});
		const bar = rect('[data-testid="mobile-action-bar"]');
		const center = rect('[data-testid="table-center"]');
		const focal = rect('[data-testid="table-center"] .bg-base-200');
		const scene = rect('[data-testid="table-scene"]');
		return {
			width: innerWidth,
			height: innerHeight,
			overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
			verticalOverflow:
				document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
			scrollHeight: document.documentElement.scrollHeight,
			seats,
			ownedCards,
			bar,
			center,
			focal,
			scene,
			verticalOffenders: [...document.querySelectorAll('body *')]
				.map((el) => ({ el, rect: el.getBoundingClientRect() }))
				.filter(({ rect: r }) => r.bottom > innerHeight + 1 && r.height > 1)
				.slice(0, 8)
				.map(({ el, rect: r }) => ({
					tag: el.tagName,
					cls: String(el.className),
					top: r.top,
					bottom: r.bottom,
					height: r.height
				})),
			active: !!document.querySelector('.table-seat.self .turn-marker')
		};
	});
	assert.equal(data.seats.length, count);
	assert.equal(data.overflow, false, `horizontal overflow at ${data.width}px`);
	assert.equal(
		data.verticalOverflow,
		false,
		`page scrolls vertically at ${data.width}x${data.height}px: ${JSON.stringify(data)}`
	);
	const self = data.seats.find((seat) => seat.self);
	assert.ok(self);
	assert.ok(
		self.y >= data.focal.bottom - 1,
		`your seat should follow the central pot: ${JSON.stringify({ self, center: data.center, focal: data.focal, scene: data.scene, bar: data.bar })}`
	);
	assert.equal(data.bar.width > 0, true);
	assert.ok(data.bar.y >= 0 && data.bar.bottom <= data.height);
	assert.ok(
		self.bottom <= data.bar.y + 1,
		`fixed actions must not cover your seat: ${JSON.stringify({ self, bar: data.bar, scene: data.scene })}`
	);
	if (data.ownedCards.length) {
		assert.ok(
			Math.max(...data.ownedCards.map((card) => card.bottom)) <= data.bar.y + 1,
			`fixed actions must not cover your cards: ${JSON.stringify({ cards: data.ownedCards, bar: data.bar })}`
		);
	}
	for (const seat of data.seats) assert.ok(seat.width > 80);
	return data;
}

try {
	for (const count of playerCounts) {
		const pages = [],
			views = new Map();
		let room = '';
		for (let index = 0; index < count; index++) {
			const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
			contexts.push(context);
			const page = await context.newPage();
			pages.push(page);
			page.on('pageerror', (error) => report.errors.push(String(error)));
			page.on('websocket', (ws) => {
				watchRoomData(ws, (snapshot) => views.set(index, snapshot));
			});
			if (index === 0) {
				await page.goto(`${base}/create-room`, { waitUntil: 'networkidle' });
				await page.locator('#create-room-btn').click();
				await page.waitForURL((url) => /^\/[a-f0-9]{32}$/.test(url.pathname));
				room = new URL(page.url()).pathname.slice(1);
			} else await page.goto(`${base}/${room}`, { waitUntil: 'networkidle' });
			await page.locator('#username').fill(`mobile-${index + 1}`);
			await page
				.getByRole('group', { name: 'Player Name' })
				.getByRole('button', { name: 'Join', exact: true })
				.click();
			await until(
				() => views.get(index)?.usersList.some((p) => p.id === views.get(index).selfId),
				'join'
			);
		}
		for (const page of pages) await page.getByTestId('ready-toggle').click();
		await pages[0].getByRole('button', { name: 'Start Game', exact: true }).click();
		await until(() => views.get(0)?.isStarted, 'start');
		for (let index = 0; index < count; index++) {
			await pages[index].getByTestId('mobile-action-bar').waitFor({ state: 'visible' });
			const geometry = await mobileGeometry(pages[index], count);
		assert.ok(geometry.seats.find((seat) => seat.self).y >= geometry.focal.bottom - 1);
			assert.equal(
				await pages[index].locator('.table-seat.self [data-testid="game-actions"]').isVisible(),
				false
			);
			assert.equal(
				await pages[index].locator('.table-center [data-game-action="teen-patti"]').isVisible(),
				false
			);
		}
		if (count === 6) {
			await pages[0]
				.getByTestId('mobile-action-bar')
				.getByRole('button', { name: 'See', exact: true })
				.click();
			await until(
				() => !views.get(0).usersList.find((player) => player.id === views.get(0).selfId).isBlind,
				'private cards marked seen'
			);
			const ownCards = await pages[0]
				.locator('.table-seat.self [data-testid="card-fan"] playing-card')
				.evaluateAll((cards) =>
					cards.map((card) => {
						const bounds = card.getBoundingClientRect();
						return { width: bounds.width, height: bounds.height };
					})
				);
			assert.equal(ownCards.length, 3);
			assert.ok(ownCards.every((card) => card.width >= 18 && card.height >= 25));
		}
		const previousPot = views.get(0).pot;
		const actorIndex = views
			.get(0)
			.usersList.findIndex((p) => p.id === views.get(0).usersList[views.get(0).currentPlayer].id);
		await pages[actorIndex]
			.getByTestId('mobile-action-bar')
			.getByRole('button', { name: 'Blind', exact: true })
			.click();
		await until(() => views.get(0).pot > previousPot, 'mobile action accepted');
		if (count === 2 || count === 6) await capture(pages[0], `${count}-players-mobile-390`);
		if (count === 6) {
			for (const width of [320, 360, 430]) {
				await pages[0].setViewportSize({ width, height: 844 });
				await mobileGeometry(pages[0], count);
			}
			await pages[0].setViewportSize({ width: 844, height: 390 });
			await mobileGeometry(pages[0], count);
			await capture(pages[0], '6-players-mobile-landscape');
		}
		report.checks.push(
			`${count} players: compact portrait seats, your seat immediately below the table, visible fixed controls, no overflow, mobile bet accepted`
		);
		for (const context of pages.map((page) => page.context())) await context.close();
	}
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
