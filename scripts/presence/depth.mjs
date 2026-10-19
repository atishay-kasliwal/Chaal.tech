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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
	errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
	await page.goto(`${base}/prototypes/bot-presence`);
	await page.waitForFunction(() =>
		document.querySelector('[data-testid="presence-character"]')?.hasAttribute('data-phase')
	);
	if (await page.getByRole('button', { name: 'Enable depth turn', exact: true }).count())
		await page.getByRole('button', { name: 'Enable depth turn', exact: true }).click();
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true' &&
			Number(document.querySelector('[data-testid="perspective-head"]')?.dataset.draws) > 0
	);
	const root = page.getByTestId('presence-character').first(),
		mesh = root.getByTestId('perspective-head');
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	await root.screenshot({ path: path.join(output, 'depth-neutral.png') });
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	const early = await page.waitForFunction(() => {
		const root = document.querySelector('[data-testid="presence-character"]'),
			mesh = root?.querySelector('[data-testid="perspective-head"]');
		if (root?.dataset.phase !== 'eyes' || !mesh) return null;
		return {
			eye: Number(root.style.getPropertyValue('--eye-x')),
			yaw: Number(mesh.dataset.yaw),
			uploads: Number(mesh.dataset.uploads)
		};
	});
	const lead = await early.jsonValue();
	assert.equal(lead.yaw, 0);
	await page.waitForFunction(
		() => Number(document.querySelector('[data-testid="perspective-head"]')?.dataset.yaw) > 6
	);
	await root.screenshot({ path: path.join(output, 'depth-right.png') });
	const right = Number(await mesh.getAttribute('data-yaw'));
	assert.ok(right <= 8);
	await page.locator('.other-seat.left').click();
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	await page.waitForFunction(
		() => Number(document.querySelector('[data-testid="perspective-head"]')?.dataset.yaw) < -6
	);
	await root.screenshot({ path: path.join(output, 'depth-left.png') });
	const left = Number(await mesh.getAttribute('data-yaw'));
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() =>
			Number(document.querySelector('[data-testid="perspective-head"]')?.dataset.yaw) === 0 &&
			document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	await page.getByRole('button', { name: 'Slow blink', exact: true }).click();
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="presence-character"]')?.dataset.blinkStage === 'closed'
	);
	await root.screenshot({ path: path.join(output, 'depth-blink.png') });
	await page.waitForFunction(
		() =>
			Number(
				document
					.querySelector('[data-testid="presence-character"]')
					?.style.getPropertyValue('--blink')
			) === 0 &&
			document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	const cacheBefore = await mesh.evaluate((c) => ({
		draws: c.dataset.draws,
		uploads: c.dataset.uploads
	}));
	await page.waitForTimeout(500);
	const cacheAfter = await mesh.evaluate((c) => ({
		draws: c.dataset.draws,
		uploads: c.dataset.uploads
	}));
	assert.deepEqual(
		cacheAfter,
		cacheBefore,
		'stillness must not redraw or upload the head texture for breathing'
	);
	await page.setViewportSize({ width: 1440, height: 2600 });
	await page.getByRole('checkbox', { name: 'Test six copies of this prototype' }).check();
	await page.waitForFunction(
		() =>
			document.querySelectorAll('[data-testid="perspective-head"]').length === 6 &&
			document.querySelector('[data-testid="subscriber-count"]')?.textContent === '6'
	);
	const cd = await page.context().newCDPSession(page);
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	const gaps = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const gaps = [];
				let last = performance.now(),
					end = last + 3500;
				const tick = (now) => {
					gaps.push(now - last);
					last = now;
					if (now < end) requestAnimationFrame(tick);
					else resolve(gaps);
				};
				requestAnimationFrame(tick);
			})
	);
	const stats = await page.getByTestId('clock-stats').evaluate((el) => ({
		clients: Number(el.dataset.clients),
		jsP95Ms: Number(el.dataset.updateP95)
	}));
	await cd.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	const sorted = gaps.slice(1).sort((a, b) => a - b),
		rafP95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
	assert.ok(stats.jsP95Ms < 12 && rafP95Ms < 55);
	await page.getByRole('checkbox', { name: 'Test six copies of this prototype' }).uncheck();
	for (let i = 0; i < 2; i++) {
		await page.getByRole('button', { name: 'Compare flat head', exact: true }).click();
		await page.waitForFunction(
			() =>
				document.querySelector('[data-testid="head-character"]')?.dataset.headMode === 'layered' &&
				document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
		);
		await page.getByRole('button', { name: 'Enable depth turn', exact: true }).click();
		await page.waitForFunction(
			() =>
				document.querySelector('[data-testid="head-character"]')?.dataset.headMode ===
					'depth-mesh' &&
				document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
		);
	}
	const fallback = await browser.newPage();
	await fallback.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
			if (kind === 'webgl') return null;
			return original.call(this, kind, ...args);
		};
	});
	await fallback.goto(`${base}/prototypes/bot-presence`);
	await fallback.waitForFunction(
		() =>
			document.querySelector('[data-testid="head-character"]')?.dataset.headMode === 'layered' &&
			document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	assert.equal(await fallback.locator('.pupil').count(), 2);
	await fallback.close();
	const mouthFallback = await browser.newPage();
	await mouthFallback.route('**/prototypes/dhoni-parts/mouth-smile-v1.webp', (route) =>
		route.abort('failed')
	);
	await mouthFallback.goto(`${base}/prototypes/bot-presence`);
	await mouthFallback.waitForFunction(
		() =>
			document.querySelector('[data-testid="head-character"]')?.dataset.headMode === 'depth-mesh' &&
			document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	await mouthFallback.getByRole('button', { name: 'Win', exact: true }).click();
	await mouthFallback.waitForFunction(
		() =>
			Number(
				document
					.querySelector('[data-testid="presence-character"]')
					?.style.getPropertyValue('--mouth')
			) > 0.5
	);
	assert.equal(
		await mouthFallback.getByTestId('perspective-head').getAttribute('data-mouth-ready'),
		'false'
	);
	await mouthFallback.close();
	assert.deepEqual(errors, []);
	const result = {
		lead,
		right,
		left,
		cache: { before: cacheBefore, after: cacheAfter },
		sixMeshes4xCPU: { ...stats, rafP95Ms },
		modeSwitches: 4,
		unsupportedWebGL: 'SVG fallback',
		missingMouth: 'original mouth with depth head preserved',
		errors
	};
	await writeFile(path.join(output, 'depth-results.json'), JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify({ output, ...result }, null, 2));
} finally {
	await browser.close();
}
