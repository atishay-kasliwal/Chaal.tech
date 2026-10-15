/**
 * Renders the PNGs used by the light beta emails (email clients drop SVG):
 *   static/email/logo-light.png   Chaal logo with dark wordmark, for light backgrounds
 *   static/email/beta-cards.png   fanned A♠ K♥ Q♣ illustration
 *   static/email/icon-calendar.png, static/email/icon-seats.png
 * Run: node scripts/email-assets/render-beta-assets.mjs
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = (name) => path.join(root, 'static/email', name);

const logo = (await readFile(path.join(root, 'static/brand/chaal-logo.svg'), 'utf8'))
	.replace('fill="#f4ead2" font-family', 'fill="#121a16" font-family')
	.replace('fill="#d5b56d" font-family', 'fill="#5f6863" font-family');

const card = (rank, suit, color, transform) => `
<div class="card" style="transform:${transform}">
	<div class="index" style="color:${color}"><span class="rank">${rank}</span><span class="suit">${suit}</span></div>
</div>`;

const cards = `
<div class="stage">
	${card('A', '♠', '#151a17', 'translate(44px,66px) rotate(-14deg)')}
	${card('K', '♥', '#b8402f', 'translate(128px,38px) rotate(-3deg)')}
	${card('Q', '♣', '#151a17', 'translate(206px,70px) rotate(12deg)')}
	<i class="spark" style="left:78px;top:34px;transform:rotate(-58deg)"></i>
	<i class="spark" style="left:56px;top:58px;transform:rotate(-24deg);width:22px"></i>
	<i class="spark" style="left:372px;top:22px;transform:rotate(-55deg)"></i>
	<i class="spark" style="left:380px;top:52px;transform:rotate(-22deg);width:22px"></i>
	<i class="spark" style="left:70px;top:328px;transform:rotate(-55deg)"></i>
	<i class="spark" style="left:50px;top:312px;transform:rotate(-22deg);width:20px"></i>
</div>`;

const icon = (paths) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#151a17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const calendar = icon(
	'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>'
);
const seats = icon(
	'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="6.5" r="2.8"/><path d="M15.5 13.2a5.4 5.4 0 0 1 6 5.3"/>'
);

const page = (body, width, height) => `<!doctype html><html><head><style>
html,body{margin:0;background:transparent}
.wrap{width:${width}px;height:${height}px;position:relative}
.stage{position:relative;width:${width}px;height:${height}px}
.card{position:absolute;width:150px;height:212px;border-radius:16px;background:linear-gradient(160deg,#fffdf8,#f4efe3);
	border:2px solid #e3dccb;box-shadow:0 10px 24px rgba(60,48,20,.14),0 2px 4px rgba(60,48,20,.08);transform-origin:50% 100%}
.index{position:absolute;left:16px;top:12px;display:flex;flex-direction:column;align-items:center;font-family:Georgia,'Times New Roman',serif;line-height:1}
.rank{font-size:46px;font-weight:700}
.suit{font-size:38px;margin-top:2px}
.spark{position:absolute;display:block;width:28px;height:5px;border-radius:3px;background:#e8b955}
</style></head><body><div class="wrap">${body}</div></body></html>`;

const browser = await chromium.launch();
const shots = [
	{
		name: 'logo-light.png',
		html: page(logo.replace('<svg ', '<svg width="520" height="128" '), 520, 128),
		w: 520,
		h: 128
	},
	{ name: 'beta-cards.png', html: page(cards, 420, 380), w: 420, h: 380 },
	{ name: 'icon-calendar.png', html: page(calendar, 56, 56), w: 56, h: 56 },
	{ name: 'icon-seats.png', html: page(seats, 56, 56), w: 56, h: 56 }
];
for (const shot of shots) {
	const tab = await browser.newPage({
		viewport: { width: shot.w, height: shot.h },
		deviceScaleFactor: 2
	});
	await tab.setContent(shot.html);
	await tab.screenshot({ path: out(shot.name), omitBackground: true });
	await tab.close();
	console.log(`wrote static/email/${shot.name}`);
}
await browser.close();
