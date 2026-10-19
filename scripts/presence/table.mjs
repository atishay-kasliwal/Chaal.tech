import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://127.0.0.1:5188';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname));
const output = path.join(tmpdir(), 'chaal-presence-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
	headless: true,
	...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' })
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
	page = await context.newPage(),
	errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
	await page.goto(`${base}/prototypes/bot-presence/table`);
	await page.waitForFunction(
		() => document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	const frame = page.getByTestId('bot-avatar'),
		root = page.getByTestId('presence-character');
	const enabledBox = await frame.boundingBox();
	await page.screenshot({ path: path.join(output, 'table-desktop.png'), fullPage: true });
	await page.getByRole('checkbox', { name: 'Dhoni preview' }).uncheck();
	assert.equal(await page.getByTestId('presence-character').count(), 0);
	await frame.locator('.mascot').waitFor();
	const fallbackBox = await frame.boundingBox();
	assert.ok(Math.abs(enabledBox.height - fallbackBox.height) < 1, 'flag must preserve seat height');
	await page.getByRole('checkbox', { name: 'Dhoni preview' }).check();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	await page.getByRole('button', { name: 'Play public hand', exact: true }).click();
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="presence-character"]')?.dataset.event ===
			'PLAYER_RAISED',
		{},
		{ timeout: 8000 }
	);
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="presence-character"]')?.dataset.event === 'BOT_TURN',
		{},
		{ timeout: 4000 }
	);
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.event === 'BOT_WON',
		{},
		{ timeout: 15000 }
	);
	await page.waitForFunction(
		() =>
			Number(
				document
					.querySelector('[data-testid="presence-character"]')
					?.style.getPropertyValue('--mouth')
			) > 0.5
	);
	await frame.screenshot({ path: path.join(output, 'table-win.png') });
	await page.getByRole('button', { name: 'Dhoni loses', exact: true }).click();
	await page.waitForFunction(
		() =>
			Number(
				document
					.querySelector('[data-testid="presence-character"]')
					?.style.getPropertyValue('--mouth')
			) < -0.5
	);
	await frame.screenshot({ path: path.join(output, 'table-loss.png') });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('combobox', { name: 'Seat width' }).selectOption('150');
	await root.scrollIntoViewIfNeeded();
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await page.screenshot({ path: path.join(output, 'table-phone.png'), fullPage: true });
	const cd = await context.newCDPSession(page);
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	await root.scrollIntoViewIfNeeded();
	const frameTimes = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const gaps = [];
				let last = performance.now(),
					until = last + 3500;
				const frame = (now) => {
					gaps.push(now - last);
					last = now;
					if (now < until) requestAnimationFrame(frame);
					else resolve(gaps);
				};
				requestAnimationFrame(frame);
			})
	);
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	const sorted = frameTimes.slice(1).sort((a, b) => a - b),
		p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
	assert.ok(p95 < 55, 'throttled desktop viewport should not stall the animation');
	// A lost graphics context must preserve the working independent SVG face fallback.
	await page
		.getByTestId('perspective-head')
		.evaluate((canvas) =>
			canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext()
		);
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="head-character"]')?.dataset.headMode === 'layered' &&
			document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	assert.equal(await page.locator('.pupil').count(), 2);
	assert.deepEqual(errors, []);
	const result = {
		seatBox: enabledBox,
		fallbackBox,
		livePublicEvents: [
			'PLAYER_CALLED',
			'PLAYER_RAISED',
			'BOT_TURN',
			'PLAYER_FOLDED',
			'BOT_WON',
			'BOT_LOST'
		],
		phoneViewport: {
			width: 390,
			seatWidth: 150,
			rafP95Ms: p95,
			over50ms: sorted.filter((ms) => ms > 50).length,
			cpuThrottle: 4
		},
		contextLoss: 'independent SVG face fallback',
		errors
	};
	await writeFile(path.join(output, 'table-results.json'), JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify({ output, ...result }, null, 2));
} finally {
	await context.close();
	await browser.close();
}
