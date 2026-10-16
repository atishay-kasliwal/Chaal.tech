/** Raster exports from the individual SVG masters; requires Playwright Chromium or Chrome. */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DECKS } from '../src/lib/decks.ts';
let browser;
try {
	browser = await chromium.launch({ headless: true });
} catch {
	browser = await chromium.launch({ headless: true, channel: 'chrome' });
}
try {
	for (const deck of DECKS.filter(
		(d) => d.id !== 'diwali-taash' && (!process.argv[2] || d.id === process.argv[2])
	)) {
		const root = new URL(`../static/cards/${deck.id}/`, import.meta.url);
		const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
		await mkdir(new URL('png/', root), { recursive: true });
		const page = await browser.newPage({
			viewport: { width: 700, height: 1000 },
			deviceScaleFactor: 1
		});
		for (const file of [manifest.back, ...manifest.cards.map((card) => card.file)]) {
			const svg = await readFile(new URL(file, root), 'utf8');
			await page.setContent(
				`<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${svg}`
			);
			await page.evaluate(async () => {
				await document.fonts.ready;
				await Promise.all(
					Array.from(
						document.querySelectorAll('image'),
						(element) =>
							new Promise((resolve, reject) => {
								const img = new Image();
								img.onload = resolve;
								img.onerror = reject;
								img.src = element.getAttribute('href');
							})
					)
				);
			});
			await page.screenshot({
				path: fileURLToPath(new URL(`png/${file.replace('.svg', '.png')}`, root)),
				omitBackground: true
			});
		}
		await page.close();
		console.log(`${deck.name}: 53 transparent 700 × 1000 PNGs exported.`);
	}
} finally {
	await browser.close();
}
