/** Run against a local dev server after generating/exporting all themed decks. */
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { DECKS } from '../src/lib/decks.ts';
let browser;
try {
	browser = await chromium.launch({ headless: true });
} catch {
	browser = await chromium.launch({ headless: true, channel: 'chrome' });
}
const results = [];
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
	await page.goto(`${process.env.DECK_REVIEW_URL || 'http://127.0.0.1:5173'}/test-decks`);
	await page.waitForTimeout(1000);
	for (const deck of DECKS.filter((d) => d.id !== 'diwali-taash')) {
		await page.setViewportSize({ width: 1280, height: 1100 });
		await page.getByLabel('Choose a deck').selectOption(deck.id);
		await page.waitForFunction(
			(name) => document.querySelector('h1')?.textContent === name,
			deck.name
		);
		const count = await page.locator('img.deck-card').count();
		const loaded = await page.locator('img.deck-card').evaluateAll(async (images) => {
			await Promise.all(images.map((image) => image.decode()));
			return images.every((image) => image.complete && image.naturalWidth > 0);
		});
		if (count !== 62 || !loaded) throw Error('Missing card images: ' + deck.id);
		const design = new URL(`../design/decks/${deck.id}/`, import.meta.url);
		await page.screenshot({
			path: new URL('deck-review-desktop.png', design).pathname,
			fullPage: true
		});
		await page
			.locator('.signature')
			.screenshot({ path: new URL('signature-v1.png', design).pathname });
		await page.setViewportSize({ width: 390, height: 844 });
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
		if (overflow) throw Error('Mobile overflow: ' + deck.id);
		await page.screenshot({
			path: new URL('deck-review-mobile.png', design).pathname,
			fullPage: true
		});
		const png = await readFile(new URL(`../static/cards/${deck.id}/png/back.png`, import.meta.url));
		const symmetry = await page.evaluate(
			async (source) => {
				const image = new Image();
				image.src = source;
				await image.decode();
				const canvas = document.createElement('canvas');
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext('2d');
				context.drawImage(image, 0, 0);
				const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
				let error = 0;
				for (let i = 0; i < data.length; i += 4) {
					const j = data.length - i - 4;
					for (let k = 0; k < 4; k++) error += Math.abs(data[i + k] - data[j + k]);
				}
				return { rotationMeanError: error / data.length, cornerAlpha: data[3] };
			},
			`data:image/png;base64,${png.toString('base64')}`
		);
		if (symmetry.rotationMeanError > 0.5 || symmetry.cornerAlpha !== 0)
			throw Error('Back symmetry/alpha: ' + deck.id);
		results.push({
			deck: deck.id,
			previewImages: count,
			imagesLoaded: loaded,
			mobileOverflow: overflow,
			...symmetry
		});
		console.log(
			deck.name +
				': desktop/mobile review passed; back rotation error ' +
				symmetry.rotationMeanError.toFixed(4)
		);
	}
	await writeFile(
		new URL('../design/decks/review-results.json', import.meta.url),
		JSON.stringify(results, null, 2) + '\n'
	);
} finally {
	await browser.close();
}
