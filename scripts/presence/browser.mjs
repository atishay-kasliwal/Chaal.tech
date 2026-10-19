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
import { verifyEyeAssets } from './assets.mjs';
import { verifyBreathing } from './breathing.mjs';
import { verifyMouth } from './mouth.mjs';
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
		blinkStage: el.dataset.blinkStage,
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
	if (await page.getByRole('button', { name: 'Compare flat head', exact: true }).count())
		await page.getByRole('button', { name: 'Compare flat head', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="facial-eyes"]')?.dataset.artReady === 'true'
	);
	await page.waitForFunction(
		() => document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	// Freeze only breathing for the existing pixel-isolation checks below.
	await page.getByRole('button', { name: 'Compare still body', exact: true }).click();
	await page.waitForFunction(() => {
		const el = document.querySelector('[data-testid="breathing-body"]');
		return el && new DOMMatrixReadOnly(getComputedStyle(el).transform).m22 === 1;
	});
	const neutralHeadImage = await root.screenshot({ path: path.join(output, 'head-neutral.png') });
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	const leadingHead = await page.waitForFunction(() => {
		const root = document.querySelector('[data-testid="presence-character"]');
		if (root?.dataset.phase !== 'eyes') return null;
		const pupil = root.querySelector('.pupil').transform.baseVal.consolidate().matrix.e;
		const matrix = new DOMMatrixReadOnly(
			getComputedStyle(root.querySelector('[data-testid="moving-head"]')).transform
		);
		return pupil > 0 ? { pupil, x: matrix.m41, roll: Math.atan2(matrix.m12, matrix.m11) } : null;
	});
	const firstPose = await leadingHead.jsonValue();
	assert.equal(firstPose.x, 0);
	assert.equal(firstPose.roll, 0);
	const leading = await read();
	assert.ok(leading.eyes > 0);
	assert.equal(parseFloat(leading.head), 0);
	const pupilX = await root
		.locator('.pupil')
		.first()
		.evaluate((node) => node.transform.baseVal.consolidate().matrix.e);
	assert.ok(pupilX > 0, 'the painted pupil itself moves during the eye phase');
	results.eyeLead = 'painted pupils move before the isolated head begins moving';
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'hold'
	);
	assert.equal(
		await root.locator('.face').evaluate((el) => getComputedStyle(el).transform),
		'none'
	);
	const headMatrix = await root.getByTestId('moving-head').evaluate((el) => {
		const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
		return { x: m.m41, rotationDegrees: (Math.atan2(m.m12, m.m11) * 180) / Math.PI };
	});
	assert.ok(headMatrix.x > 0.5 && headMatrix.rotationDegrees > 0.8);
	assert.equal(
		await root.getByTestId('breathing-body').evaluate((el) => getComputedStyle(el).transform),
		'matrix(1, 0, 0, 1, 0, 0)'
	);
	assert.ok(
		(await root
			.locator('.pupil')
			.first()
			.evaluate((node) => node.transform.baseVal.consolidate().matrix.e)) > 3
	);
	assert.ok(
		Number(
			(await root.locator('.brow').last().getAttribute('transform')).match(
				/translate\(0 ([^)]+)\)/
			)[1]
		) < -0.8
	);
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="presence-character"]')?.dataset.blinkStage === 'open'
	);
	const glanceHeadImage = await root.screenshot({ path: path.join(output, 'head-glance.png') });
	const headPixels = await page.evaluate(
		async ({ before, after }) => {
			const load = async (s) => {
				const i = new Image();
				i.src = `data:image/png;base64,${s}`;
				await i.decode();
				return i;
			};
			const [a, b] = await Promise.all([load(before), load(after)]),
				c = document.createElement('canvas');
			c.width = a.width;
			c.height = a.height;
			const ctx = c.getContext('2d');
			ctx.drawImage(a, 0, 0);
			const first = ctx.getImageData(0, 0, c.width, c.height).data;
			ctx.clearRect(0, 0, c.width, c.height);
			ctx.drawImage(b, 0, 0);
			const second = ctx.getImageData(0, 0, c.width, c.height).data;
			let hair = 0,
				shoulders = 0,
				neckGaps = 0;
			for (let y = 0; y < c.height; y++)
				for (let x = 0; x < c.width; x++) {
					const i = (y * c.width + x) * 4,
						px = (x / c.width) * 360,
						py = (y / c.height) * 360;
					const changed = first.slice(i, i + 3).some((v, j) => Math.abs(v - second[i + j]) > 3);
					if (changed && py >= 28 && py <= 90) hair++;
					if (changed && py >= 225 && py <= 250) shoulders++;
					if (
						px >= 157 &&
						px <= 206 &&
						py >= 211 &&
						py <= 229 &&
						second[i + 1] > second[i] + 4 &&
						second[i + 1] > second[i + 2]
					)
						neckGaps++;
				}
			return { hair, shoulders, neckGaps };
		},
		{ before: neutralHeadImage.toString('base64'), after: glanceHeadImage.toString('base64') }
	);
	assert.ok(headPixels.hair > 100, 'actual hair/head pixels must move');
	assert.equal(headPixels.shoulders, 0, 'shirt and shoulders must remain fixed');
	assert.equal(headPixels.neckGaps, 0, 'no felt-colored holes should open at the neck joint');
	results.headFollow = { ...headMatrix, pixels: headPixels };
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="presence-character"]')?.dataset.blinkStage === 'open'
	);
	const open = await root.screenshot({ path: path.join(output, 'eyes-open.png') });
	const openAperture = await root.locator('.layers clipPath path').first().getAttribute('d');
	await page.getByRole('button', { name: 'Slow blink', exact: true }).click();
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="presence-character"]')?.dataset.blinkStage === 'half'
	);
	await root.screenshot({ path: path.join(output, 'eyes-half.png') });
	assert.notEqual(
		await root.locator('.layers clipPath path').first().getAttribute('d'),
		openAperture
	);
	await page.waitForFunction(
		() =>
			Number(
				document
					.querySelector('[data-testid="presence-character"]')
					?.style.getPropertyValue('--blink')
			) > 0.97
	);
	const closed = await root.screenshot({ path: path.join(output, 'eyes-closed.png') });
	const closedAperture = await root.locator('.layers clipPath path').first().getAttribute('d');
	const apertureYs = closedAperture
		.match(/-?\d+(?:\.\d+)?/g)
		.map(Number)
		.filter((_, i) => i % 2);
	assert.ok(
		Math.max(...apertureYs) - Math.min(...apertureYs) < 2,
		'the painted iris is fully covered at closure'
	);
	const pixelChanges = await page.evaluate(
		async ({ open, closed }) => {
			const load = (src) =>
				new Promise((resolve) => {
					const img = new Image();
					img.onload = () => resolve(img);
					img.src = `data:image/png;base64,${src}`;
				});
			const [a, b] = await Promise.all([load(open), load(closed)]);
			const canvas = document.createElement('canvas');
			canvas.width = a.width;
			canvas.height = a.height;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(a, 0, 0);
			const before = ctx.getImageData(0, 0, a.width, a.height).data;
			ctx.clearRect(0, 0, a.width, a.height);
			ctx.drawImage(b, 0, 0);
			const after = ctx.getImageData(0, 0, a.width, a.height).data;
			let inside = 0,
				outside = 0;
			for (let y = 0; y < a.height; y++)
				for (let x = 0; x < a.width; x++) {
					const at = (y * a.width + x) * 4;
					if (before.slice(at, at + 4).some((v, i) => Math.abs(v - after[at + i]) > 3)) {
						const px = (x / a.width) * 360,
							py = (y / a.height) * 360;
						if (px >= 131 && px <= 231 && py >= 114 && py <= 155) inside++;
						else outside++;
					}
				}
			return { inside, outside };
		},
		{ open: open.toString('base64'), closed: closed.toString('base64') }
	);
	assert.ok(pixelChanges.inside > 400, 'actual eye pixels must change');
	assert.equal(pixelChanges.outside, 0, 'head, hair, mouth and shoulders must stay still');
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="presence-character"]')?.dataset.blinkStage === 'open'
	);
	results.visibleBlink = {
		sequence: 'continuous aperture closes and reopens over painted eyelids',
		pixelChanges
	};
	await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
	await page.getByRole('button', { name: 'Call', exact: true }).click();
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	results.interruption = 'new event replaces active choreography; neutral reached';
	const neutralHead = await root
		.getByTestId('moving-head')
		.evaluate((el) => getComputedStyle(el).transform);
	assert.equal(neutralHead, 'matrix(1, 0, 0, 1, 0, 0)');
	results.mouth = await verifyMouth(page, root, output);
	await page.getByRole('button', { name: 'Compare face only', exact: true }).click();
	assert.equal(await root.getAttribute('data-renderer'), 'facial-eyes');
	await page.getByRole('button', { name: 'Enable head follow', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	await page.locator('.other-seat.left').click();
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	await page.waitForFunction(() => {
		const el = document.querySelector('[data-testid="moving-head"]');
		if (!el) return false;
		const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
		return (Math.atan2(m.m12, m.m11) * 180) / Math.PI < -0.8;
	});
	await root.screenshot({ path: path.join(output, 'head-left.png') });
	await page.locator('.other-seat.right').click();
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	await page.getByRole('button', { name: /^(Play a hand|Restart hand)/ }).click();
	await page
		.locator('.public-moment')
		.getByText(/^Dhoni (wins|loses)$/, { exact: true })
		.waitFor({ timeout: 22000 });
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
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	results.bodyBreathing = await verifyBreathing(page, root, output);
	await page.setViewportSize({ width: 1440, height: 2600 });
	await page.getByRole('checkbox', { name: 'Test six copies of this prototype' }).check();
	await page.waitForFunction(
		() => document.querySelectorAll('[data-testid="presence-character"]').length === 6
	);
	await page.waitForFunction(
		() => document.querySelector('[data-testid="subscriber-count"]')?.textContent === '6'
	);
	const maskIds = await page
		.locator('[data-testid="presence-character"] svg [id]')
		.evaluateAll((nodes) => nodes.map((node) => node.id));
	assert.equal(
		new Set(maskIds).size,
		maskIds.length,
		'six copies need independent clip and mask IDs'
	);
	const blinkSchedules = new Set();
	for (let i = 0; i < 115; i++) {
		blinkSchedules.add(
			await page
				.getByTestId('presence-character')
				.evaluateAll((nodes) => nodes.map((n) => n.dataset.blinkStage).join(','))
		);
		await page.waitForTimeout(100);
	}
	assert.ok(
		[...blinkSchedules].some((sample) => new Set(sample.split(',')).size > 1),
		'copies must not all blink together'
	);
	results.independentBlinks = 'different visible eyelid stages across six copies';
	const breathScales = await page
		.getByTestId('breathing-body')
		.evaluateAll((nodes) =>
			nodes.map((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m22)
		);
	assert.equal(breathScales.length, 6);
	assert.ok(new Set(breathScales.map((v) => v.toFixed(5))).size >= 3);
	results.independentBreaths = { scaleY: breathScales };
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
	await root.scrollIntoViewIfNeeded();
	await page.waitForTimeout(7000);
	results.mobile390px4xCPU = await clock();
	assert.equal(results.mobile390px4xCPU.clients, 1);
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	// Offscreen instances should unsubscribe entirely.
	await page.locator('footer').scrollIntoViewIfNeeded();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="subscriber-count"]')?.textContent === '0'
	);
	results.offscreen = 'zero animation subscribers';
	assert.deepEqual(errors, []);
	results.consoleErrors = errors;
	results.artFallback = await verifyEyeAssets(browser, base);
	if (process.env.PRESENCE_RECORD === '1') {
		const recording = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
			recordVideo: { dir: path.join(output, 'capture'), size: { width: 1440, height: 1000 } }
		});
		const capture = await recording.newPage();
		await capture.goto(`${base}/prototypes/bot-presence`);
		await capture.waitForFunction(() =>
			document.querySelector('[data-testid="presence-character"]')?.hasAttribute('data-phase')
		);
		await capture.getByRole('button', { name: 'Neutral', exact: true }).click();
		await capture.waitForTimeout(1000);
		await capture.getByRole('button', { name: 'Watch a glance', exact: true }).click();
		await capture.waitForTimeout(1400);
		await capture.getByRole('button', { name: 'Blink now', exact: true }).click();
		await capture.waitForTimeout(1600);
		await capture.getByRole('button', { name: 'Slow blink', exact: true }).click();
		await capture.waitForTimeout(2300);
		await capture.getByRole('button', { name: 'Blink now', exact: true }).click();
		await capture.waitForTimeout(2000);
		await capture.locator('.other-seat.left').click();
		await capture.getByRole('button', { name: 'Raise', exact: true }).click();
		await capture.waitForTimeout(2800);
		await capture.getByRole('button', { name: 'Win', exact: true }).click();
		await capture.waitForTimeout(4100);
		await capture.getByRole('button', { name: 'Lose', exact: true }).click();
		await capture.waitForTimeout(4800);
		await capture.getByRole('button', { name: 'Neutral', exact: true }).click();
		await capture.waitForTimeout(3000);
		const video = capture.video();
		await recording.close();
		const rendered = spawnSync(
			'ffmpeg',
			[
				'-y',
				'-loglevel',
				'error',
				'-i',
				await video.path(),
				'-c:v',
				'libx264',
				'-pix_fmt',
				'yuv420p',
				'-movflags',
				'+faststart',
				path.join(output, 'dhoni-complete.mp4')
			],
			{ encoding: 'utf8' }
		);
		assert.equal(rendered.status, 0, rendered.stderr);
		results.recording =
			'dhoni-complete.mp4 · public attention, painted mouth expressions and independent breathing';
	}
	await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
	console.log(JSON.stringify({ output, ...results }, null, 2));
} finally {
	await context.close();
	await browser.close();
}
