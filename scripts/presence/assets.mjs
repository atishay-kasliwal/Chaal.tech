import assert from 'node:assert/strict';

/** Local asset failures must leave an intact face, never empty sockets. */
export async function verifyEyeAssets(browser, base) {
	assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
	const context = await browser.newContext();
	const flat = async (page) => {
		await page.waitForFunction(() =>
			document.querySelector('[data-testid="presence-character"]')?.hasAttribute('data-phase')
		);
		if (await page.getByRole('button', { name: 'Compare flat head', exact: true }).count())
			await page.getByRole('button', { name: 'Compare flat head', exact: true }).click();
	};
	let release;
	const pending = new Promise((resolve) => {
		release = resolve;
	});
	try {
		const loading = await context.newPage();
		await loading.route('**/prototypes/dhoni-parts/iris-left-v1.webp', async (route) => {
			await pending;
			await route.continue();
		});
		await loading.goto(`${base}/prototypes/bot-presence`, { waitUntil: 'domcontentloaded' });
		await flat(loading);
		await loading.waitForFunction(() =>
			document.querySelector('[data-testid="presence-character"]')?.hasAttribute('data-phase')
		);
		assert.equal(await loading.getByTestId('facial-eyes').getAttribute('data-art-ready'), 'false');
		assert.equal(
			await loading.locator('.features').evaluate((el) => getComputedStyle(el).opacity),
			'0'
		);
		release();
		await loading.waitForFunction(
			() => document.querySelector('[data-testid="facial-eyes"]')?.dataset.artReady === 'true'
		);
		assert.equal(
			await loading.locator('.features').evaluate((el) => getComputedStyle(el).opacity),
			'1'
		);
		await loading.close();

		const failed = await context.newPage();
		await failed.route('**/prototypes/dhoni-parts/iris-left-v1.webp', (route) =>
			route.abort('failed')
		);
		await failed.goto(`${base}/prototypes/bot-presence`, { waitUntil: 'domcontentloaded' });
		await failed.waitForFunction(
			() =>
				document.querySelector('[data-testid="presence-character"]')?.dataset.renderer ===
				'blink-frames'
		);
		assert.equal(await failed.getByTestId('facial-eyes').count(), 0);
		assert.equal(await failed.getByTestId('presence-character').locator('.face').count(), 1);
		await failed.close();

		const neckFailed = await context.newPage();
		await neckFailed.route('**/prototypes/dhoni-parts/neck-v1.webp', (route) =>
			route.abort('failed')
		);
		await neckFailed.goto(`${base}/prototypes/bot-presence`, { waitUntil: 'domcontentloaded' });
		await neckFailed.waitForFunction(
			() =>
				document.querySelector('[data-testid="presence-character"]')?.dataset.renderer ===
				'facial-eyes'
		);
		await neckFailed.waitForFunction(
			() => document.querySelector('[data-testid="facial-eyes"]')?.dataset.artReady === 'true'
		);
		assert.equal(await neckFailed.getByTestId('moving-head').count(), 0);
		assert.equal(await neckFailed.locator('.pupil').count(), 2);
		await neckFailed.close();
		const mouthFailed = await context.newPage();
		await mouthFailed.route('**/prototypes/dhoni-parts/mouth-smile-v1.webp', (route) =>
			route.abort('failed')
		);
		await mouthFailed.goto(`${base}/prototypes/bot-presence`, { waitUntil: 'domcontentloaded' });
		await flat(mouthFailed);
		await mouthFailed.waitForFunction(
			() => document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
		);
		await mouthFailed.waitForFunction(
			() =>
				document.querySelector('[data-testid="mouth-parts"]')?.dataset.mode === 'original-fallback'
		);
		assert.equal(
			await mouthFailed.getByTestId('mouth-parts').getAttribute('data-mode'),
			'original-fallback'
		);
		assert.equal(
			await mouthFailed.getByTestId('presence-character').getAttribute('data-renderer'),
			'head-parts'
		);
		assert.equal(await mouthFailed.locator('.pupil').count(), 2);
		return {
			loading: 'approved original stays visible until all parts load',
			missingArt: 'previous painted-blink renderer remains available',
			missingNeck: 'working eye/brow prototype remains available without head motion',
			missingMouth: 'original mouth remains intact while eyes, brows, head and breathing continue'
		};
	} finally {
		release();
		await context.close();
	}
}
