/** Local-only review and browser QA. No backend, credentials or game mutation.
 * Usage: node scripts/presence/browser.mjs [http://127.0.0.1:5188]
 * Screenshots and optional video are written outside the checkout. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const base = process.argv[2] || 'http://127.0.0.1:5188';
const host = new URL(base);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname))
	throw new Error('Prototype QA is local only');
const output = path.join(tmpdir(), 'chaal-presence-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
	headless: true,
	...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' })
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage(),
	errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const root = page.getByTestId('presence-character').first();
const read = () =>
	root.evaluate((el) => ({
		phase: el.dataset.phase,
		blinks: Number(el.dataset.blinks),
		eyes: Number(el.style.getPropertyValue('--eye-x')),
		head: el.style.getPropertyValue('--portrait-x'),
		breath: el.style.getPropertyValue('--breath-scale')
	}));
const clock = () =>
	page.getByTestId('clock-stats').evaluate((el) => ({
		clients: Number(el.dataset.clients),
		frames: Number(el.dataset.frames),
		rateLimit: 30,
		updateMeanMs: Number(el.dataset.updateMean),
		updateP95Ms: Number(el.dataset.updateP95)
	}));
const results = {};
try {
	await page.goto(`${base}/prototypes/bot-presence`);
	await page.waitForFunction(() =>
		document.querySelector('[data-testid="presence-character"]')?.hasAttribute('data-phase')
	);
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'eyes'
	);
	const leading = await read();
	assert.ok(leading.eyes > 0);
	assert.equal(parseFloat(leading.head), 0);
	results.eyeLead = 'verified command ordering; portrait has no independent eye artwork';
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'hold'
	);
	assert.notEqual(parseFloat((await read()).head), 0);
	const rendered = await root.locator('.portrait').evaluate((el) => {
		const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
		return { xPixels: m.m41, rotationDegrees: (Math.atan2(m.m12, m.m11) * 180) / Math.PI };
	});
	assert.ok(
		Math.abs(rendered.xPixels) > 6,
		'rendered portrait must visibly move, not just its debug meters'
	);
	assert.ok(Math.abs(rendered.rotationDegrees) > 1.5);
	results.renderedPortraitMotion = rendered;
	await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
	await page.getByRole('button', { name: 'Call', exact: true }).click();
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() =>
			Math.abs(
				parseFloat(
					document
						.querySelector('[data-testid="presence-character"]')
						.style.getPropertyValue('--portrait-x')
				)
			) < 0.0001
	);
	results.interruption = 'new event replaces active choreography; neutral reached';
	await page.getByRole('button', { name: /^(Play a hand|Restart hand)/ }).click();
	await page.waitForTimeout(15500);
	await page
		.locator('.public-moment')
		.getByText(/^Dhoni (wins|loses)$/, { exact: true })
		.waitFor();
	assert.ok((await read()).blinks >= 1);
	results.simulatedHand = 'call, raise, bot turn, pack and public result received through adapter';
	await page.getByRole('button', { name: 'Lose', exact: true }).click();
	await page.getByRole('button', { name: 'Pause movement', exact: true }).click();
	const before = await read();
	await page.waitForTimeout(500);
	assert.deepEqual(await read(), before);
	assert.equal(await root.getAttribute('data-motion'), 'paused');
	results.pause = 'transforms remain stationary';
	await page.getByRole('button', { name: 'Resume', exact: true }).click();
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.motion === 'paused'
	);
	const reduced = await read();
	await page.waitForTimeout(350);
	assert.deepEqual(await read(), reduced);
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.getByRole('button', { name: 'Compare original', exact: true }).click();
	assert.equal(await root.getAttribute('data-renderer'), 'legacy');
	await root.locator('.mascot').waitFor();
	assert.equal(await root.locator('.mascot').count(), 1);
	await page.getByRole('button', { name: 'Compare original', exact: true }).click();
	results.reducedMotionAndFallback = 'verified';
	await page.setViewportSize({ width: 1440, height: 1800 });
	await page.getByRole('checkbox', { name: 'Test six copies of this prototype' }).check();
	await page.waitForFunction(
		() => document.querySelectorAll('[data-testid="presence-character"]').length === 6
	);
	await page.waitForFunction(
		() => document.querySelector('[data-testid="subscriber-count"]')?.textContent === '6'
	);
	const breaths = await page
		.getByTestId('presence-character')
		.evaluateAll((nodes) => nodes.map((n) => n.style.getPropertyValue('--breath-scale')));
	assert.ok(new Set(breaths).size >= 5, 'independent breathing phases');
	const cd = await context.newCDPSession(page);
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	await page.waitForTimeout(7000);
	results.sixCopies4xCPU = await clock();
	assert.equal(results.sixCopies4xCPU.clients, 6);
	assert.ok(results.sixCopies4xCPU.updateP95Ms < 10);
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	// Simulate browser visibility notifications; all subscribers share one suspended RAF loop.
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.waitForTimeout(1100);
	const stopped = await clock();
	await page.waitForTimeout(1100);
	assert.equal((await clock()).frames, stopped.frames);
	await page.evaluate(() => {
		delete document.hidden;
		document.dispatchEvent(new Event('visibilitychange'));
	});
	results.background = 'shared animation clock suspends';
	await page.getByRole('checkbox', { name: 'Test six copies of this prototype' }).uncheck();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: /^(Play a hand|Restart hand)/ }).scrollIntoViewIfNeeded();
	await page.getByRole('combobox', { name: 'Trigger public event' }).selectOption('PLAYER_RAISED');
	await page.waitForTimeout(1200);
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await page.getByRole('combobox', { name: 'Trigger public event' }).selectOption('BOT_TURN');
	await page.waitForTimeout(7000);
	results.mobile390px4xCPU = await clock();
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	// Offscreen instances should unsubscribe entirely.
	await page.locator('footer').scrollIntoViewIfNeeded();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="subscriber-count"]')?.textContent === '0'
	);
	results.offscreen = 'zero animation subscribers';
	assert.deepEqual(errors, []);
	results.consoleErrors = errors;
	if (process.env.PRESENCE_RECORD === '1') {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`${base}/prototypes/bot-presence`);
		await page.waitForFunction(() =>
			document.querySelector('[data-testid="presence-character"]')?.hasAttribute('data-phase')
		);
		await page.getByRole('button', { name: /^(Play a hand|Restart hand)/ }).click();
		const frames = path.join(output, 'frames');
		await mkdir(frames, { recursive: true });
		const start = performance.now();
		for (let i = 0; i < 120; i++) {
			await page.screenshot({
				path: path.join(frames, `${String(i).padStart(4, '0')}.jpg`),
				type: 'jpeg',
				quality: 80
			});
			const wait = (i + 1) * 100 - (performance.now() - start);
			if (wait > 0) await page.waitForTimeout(wait);
		}
		const rendered = spawnSync(
			'ffmpeg',
			[
				'-y',
				'-loglevel',
				'error',
				'-framerate',
				'10',
				'-i',
				path.join(frames, '%04d.jpg'),
				'-c:v',
				'libx264',
				'-pix_fmt',
				'yuv420p',
				'-movflags',
				'+faststart',
				path.join(output, 'presence-demo.mp4')
			],
			{ encoding: 'utf8' }
		);
		assert.equal(rendered.status, 0, rendered.stderr);
		results.recording = 'presence-demo.mp4 · 12-second screen capture at 10 fps';
	}
	await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
	console.log(JSON.stringify({ output, ...results }, null, 2));
} finally {
	await context.close();
	await browser.close();
}
