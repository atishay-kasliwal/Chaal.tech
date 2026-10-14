import { chromium } from 'playwright';
import parser from 'socket.io-msgpack-parser';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';


const base = process.env.PHASE5_BASE_URL || 'http://127.0.0.1:5174',
	directory = 'visual-baselines/phase5/layout';
const playerCounts = process.env.PHASE5_ONLY_SIX === 'true' ? [6] : [2, 3, 4, 5, 6];
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
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out: ${label}`);
}
async function capture(page, name) {
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
	report.screenshots.push(name);
	console.log(`Captured ${name}`);
}
async function geometry(page, expected, desktop = true) {
	const positions = await page.getByTestId('table-scene').evaluate((scene) => {
		const rect = (element) => {
			const r = element.getBoundingClientRect();
			return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
		};
		return {
			center: rect(scene.querySelector('[data-testid="table-center"]')),
			seats: [...scene.querySelectorAll('.table-seat')].map((el) => ({
				id: el.dataset.playerId,
				position: el.dataset.position,
				self: el.classList.contains('self'),
				...rect(el)
			})),
			overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
			viewport: innerWidth,
			offenders: [...document.querySelectorAll('body *')]
				.filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
				.slice(0, 12)
				.map((el) => ({
					tag: el.tagName,
					cls: el.className,
					right: el.getBoundingClientRect().right
				}))
		};
	});
	assert.equal(positions.seats.length, expected);
	assert.equal(
		positions.overflow,
		false,
		JSON.stringify({ width: positions.viewport, offenders: positions.offenders })
	);
	const intersects = (a, b) =>
		Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
		Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
	for (const a of positions.seats) {
		assert.ok(a.width > (desktop ? 150 : 80));
		assert.equal(intersects(a, positions.center), false, `${a.position} intersects center`);
		for (const b of positions.seats)
			if (a !== b) assert.equal(intersects(a, b), false, `${a.position} intersects ${b.position}`);
	}
	const self = positions.seats.find((s) => s.self);
	assert.ok(self);
	assert.equal(self.position, 'bottom');
	assert.ok(self.y >= positions.center.bottom - 1);
	if (desktop)
		assert.ok(
			Math.abs(self.x + self.width / 2 - positions.center.x - positions.center.width / 2) < 2
		);
	return positions;
}
try {
	for (const count of playerCounts) {
		const pages = [],
			views = new Map(),
			room = `layout-${count}-${Date.now().toString(36)}`;
		for (let i = 0; i < count; i++) {
			const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
			contexts.push(context);
			const page = await context.newPage();
			pages.push(page);
			page.on('pageerror', (error) => report.errors.push(String(error)));
			page.on('websocket', (ws) => {
				const decoder = new parser.Decoder();
				decoder.on('decoded', (packet) => {
					if (packet.data?.[0] === 'roomData') views.set(i, packet.data[1]);
				});
				ws.on('framereceived', (frame) => {
					if (typeof frame.payload !== 'string')
						try {
							decoder.add(frame.payload);
						} catch {
							/* Non-game frame. */
						}
				});
			});
			if (i === 0) {
				await page.goto(`${base}/create-room`, { waitUntil: 'networkidle' });
				await page.locator('#roomName').fill(room);
				await page.locator('#create-room-btn').click();
			} else await page.goto(`${base}/${room}`, { waitUntil: 'networkidle' });
			await page.locator('#username').fill(`friend-${i + 1}-`.padEnd(24, 'x'));
			await page
				.getByRole('group', { name: 'Player Name' })
				.getByRole('button', { name: 'Join', exact: true })
				.click();
			await until(() => views.get(i)?.usersList.some((p) => p.id === views.get(i).selfId), 'join');
		}
		for (let i = 0; i < pages.length; i++) {
			const playerId = views.get(i).selfId;
			const revision = views.get(0).revision;
			await pages[i].getByTestId('ready-toggle').click();
			await until(
				() =>
					views.get(0).revision > revision &&
						views.get(0).usersList.find((user) => user.id === playerId)?.ready === true,
					`player ${i + 1} ready`
			);
		}
		await until(
			() => views.get(0)?.usersList.filter((user) => user.connected && !user.hasLeft).every((user) => user.ready),
			'all players ready'
		);
		await pages[0].getByRole('button', { name: 'Start Game', exact: true }).click();
		await until(() => views.get(0)?.isStarted, 'start');
		for (let i = 0; i < count; i++) {
			await pages[i].getByTestId('table-scene').waitFor();
			const positions = await geometry(pages[i], count);
			assert.equal(positions.seats.find((s) => s.self).id, views.get(i).selfId);
			assert.ok(views.get(i).usersList.every((p) => p.cardsInHand.every((c) => c.rank === 0)));
		}
		await capture(pages[0], `${count}-players-desktop`);
		await pages[0].getByRole('button', { name: 'See', exact: true }).click();
		await until(
			() => !views.get(0).usersList.find((p) => p.id === views.get(0).selfId).isBlind,
			'see'
		);
		const turn = pages[1].getByRole('button', { name: 'Blind', exact: true });
		await turn.focus();
		await pages[1].keyboard.press('Enter');
		await until(() => views.get(0).pot === count + 1, 'keyboard bet');
		assert.equal(views.get(0).usersList.find((p) => p.id === views.get(1).selfId).handBet, 2);
		assert.equal(
			views.get(0).usersList.reduce((sum, p) => sum + p.handBet, 0),
			views.get(0).pot
		);
		assert.equal(await pages[1].getByRole('button', { name: 'Blind', exact: true }).count(), 0);
		const before = await pages[0]
			.getByTestId('table-scene')
			.locator('.table-seat')
			.evaluateAll((elements) => elements.map((el) => [el.dataset.playerId, el.dataset.position]));
		const current = views.get(0).usersList[views.get(0).currentPlayer].id;
		const actor = pages[views.get(0).usersList.findIndex((p) => p.id === current)];
		actor.once('dialog', (dialog) => dialog.accept());
		await actor.getByRole('button', { name: 'Pack', exact: true }).click();
		await until(() => views.get(0).usersList.find((p) => p.id === current).isPacked, 'pack');
		assert.deepEqual(
			await pages[0]
				.getByTestId('table-scene')
				.locator('.table-seat')
				.evaluateAll((elements) =>
					elements.map((el) => [el.dataset.playerId, el.dataset.position])
				),
			before
		);
		const packed = pages[0]
			.getByTestId('player-seat')
			.filter({ has: pages[0].getByText('Packed', { exact: true }) });
		assert.equal(
			await packed
				.getByText('Packed', { exact: true })
				.evaluate((el) => !!el.closest('[data-testid="card-fan"]')),
			true
		);
		if (count === 6) {
			const saved = views.get(0),
				ownSeat = saved.usersList.find((p) => p.id === saved.selfId).seatNumber;
			await pages[0].reload({ waitUntil: 'networkidle' });
			await pages[0].getByTestId('table-scene').waitFor();
			await until(() => views.get(0).selfId === saved.selfId, 'resume');
			assert.equal(views.get(0).handId, saved.handId);
			assert.equal(views.get(0).usersList.find((p) => p.id === saved.selfId).seatNumber, ownSeat);
			await geometry(pages[0], count);
			await capture(pages[0], '6-players-packed-refresh');
		}
		for (const width of [1280, 1100, 800, 390]) {
			await pages[0].setViewportSize({ width, height: 1000 });
			await geometry(pages[0], count, width >= 1100);
		}
		await capture(pages[0], `${count}-players-narrow-fallback`);
		report.checks.push(
			`${count} players: every viewer bottom, no overlapping seats/center, long names, keyboard bet, stable positions on Pack, widths 1440/1280/1100/800/390`
		);
		for (const page of pages) await page.context().close();
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
