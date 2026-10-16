/** Render three native SVG viewports from each generated triptych into independent court assets. */
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
		const source = new URL(`../design/decks/${deck.id}/court-master-v1.png`, import.meta.url);
		const buffer = await readFile(source);
		const width = buffer.readUInt32BE(16),
			height = buffer.readUInt32BE(20);
		const panelWidth = width / 3,
			exportWidth = 512,
			exportHeight = Math.round((exportWidth * height) / panelWidth);
		const output = new URL(`../static/cards/${deck.id}/artwork/`, import.meta.url);
		await mkdir(output, { recursive: true });
		const page = await browser.newPage({
			viewport: { width: exportWidth, height: exportHeight },
			deviceScaleFactor: 1
		});
		for (const [index, rank] of ['jack', 'queen', 'king'].entries()) {
			await page.setContent(
				`<style>html,body{margin:0;background:transparent}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="${index * panelWidth} 0 ${panelWidth} ${height}" preserveAspectRatio="none"><image href="data:image/png;base64,${buffer.toString('base64')}" width="${width}" height="${height}"/></svg>`
			);
			await page.evaluate(async () => {
				const image = document.querySelector('image');
				const img = new Image();
				img.src = image.getAttribute('href');
				await img.decode();
			});
			await page.screenshot({
				path: fileURLToPath(new URL(`${rank}.png`, output)),
				omitBackground: true
			});
		}
		await page.close();
		console.log(deck.id + ': three court panels rendered.');
	}
} finally {
	await browser.close();
}
