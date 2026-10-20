import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const base =
	process.env.REDESIGN_BASE ||
	(process.argv.includes('--release') ? 'http://127.0.0.1:4401' : 'http://127.0.0.1:4400');
const apiOrigin = process.argv.includes('--release')
	? 'https://chaal-game.s6-backend-spike.workers.dev'
	: 'https://chaal-visual-qa.example.com';
const pass = process.env.REDESIGN_PASS || (process.argv.includes('--cards') ? 'cards' : 'final');
const tableOnly =
	process.env.REDESIGN_TABLE_ONLY === 'true' || process.argv.includes('--table-only');
const output = `/tmp/chaal-redesign-qa/${tableOnly ? 'table-polish' : pass}`;
await fs.mkdir(output, { recursive: true });
const fixture = JSON.parse(await fs.readFile('src/routes/test-stats/fixture.json', 'utf8'));
const member = {
	memberId: 'qa-1',
	playerId: 'qa-player',
	nickname: 'atishay',
	characterId: 'ace',
	role: 'owner',
	reducedMotion: false,
	onboarded: true
};
const settings = {
	table: { chips: 1000, boot: 10, potLimit: 128 },
	look: { felt: 'emerald', cardBack: 'navy' },
	mascotSize: 144
};
const members = ['atishay', 'raju', 'pinky', 'tinku'].map((nickname, i) => ({
	...member,
	memberId: `qa-${i + 1}`,
	playerId: `qa-player-${i}`,
	nickname,
	role: i ? 'member' : 'owner',
	email: `qa-${i}@example.com`,
	status: 'active',
	signedIn: true,
	betaSteps: [],
	betaOptOut: false,
	joined: true
}));
const standings = members.map((m, i) => ({
	rank: i + 1,
	nickname: m.nickname,
	net: 300 - i * 150,
	wins: 12 - i * 2,
	hands: 40 + i * 3,
	isYou: !i,
	characterId: m.characterId
}));
const slots = Array.from({ length: 48 }, (_, i) =>
	new Date(Date.UTC(2026, 9, 24, 0) + i * 3600000).toISOString()
);
const browser = await chromium.launch({
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true
});
const report = { pass, checks: [], pages: [], errors: [], blockedWrites: [] };
async function setup(width, auth = true, reduced = false) {
	const context = await browser.newContext({
		viewport: { width, height: width < 600 ? 844 : 1000 },
		reducedMotion: reduced ? 'reduce' : 'no-preference'
	});
	if (auth)
		await context.addInitScript(
			({ member, settings }) => {
				localStorage.setItem('chaal-club-session-v1', 'visual-qa-only');
				localStorage.setItem('chaal-club-member-v1', JSON.stringify(member));
				localStorage.setItem('chaal-club-settings-v1', JSON.stringify(settings));
			},
			{ member, settings }
		);
	await context.route(`${apiOrigin}/**`, async (route) => {
		const u = new URL(route.request().url());
		let body = {};
		if (u.pathname === '/club/heartbeat')
			return route.fulfill({ json: { ok: true }, headers: { 'access-control-allow-origin': '*' } });
		if (u.pathname === '/session')
			return route.fulfill({
				json: {
					token: 'visual-game-only',
					playerId: 'qa-player',
					member,
					expiresAt: Date.now() + 3600000
				},
				headers: { 'access-control-allow-origin': '*' }
			});
		if (route.request().method() !== 'GET' && route.request().method() !== 'OPTIONS') {
			report.blockedWrites.push(u.pathname);
			return route.fulfill({ status: 403, json: { error: 'Visual QA blocks writes' } });
		}
		if (u.pathname === '/me') body = { member, settings, members };
		else if (u.pathname === '/club')
			body = { members, online: ['qa-1', 'qa-2'], tables: [], nights: [] };
		else if (u.pathname === '/club/history')
			body = {
				leaderboard: standings,
				hands: [],
				personal: { net: 300, wins: 12, hands: 40 },
				total: 0,
				hasMore: false
			};
		else if (u.pathname === '/admin')
			body = {
				members,
				online: ['qa-1', 'qa-2'],
				tables: [],
				settings,
				beta: null,
				poll: null,
				analytics: {
					totals: { hands: 100, nights: 5, players: 4 },
					variants: { 'classic-1': 100 },
					members: []
				}
			};
		else if (u.pathname === '/settings') body = { settings };
		else if (u.pathname.startsWith('/poll/'))
			body = { name: 'Atishay', slots, picked: [], savedAt: null };
		else if (u.pathname.startsWith('/analytics/'))
			body = fixture[u.pathname + u.search] || fixture[u.pathname] || {};
		return route.fulfill({
			json: body,
			headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
		});
	});
	await context.route('**/socket.io/**', (route) =>
		route.fulfill({
			status: 200,
			body: '0{"sid":"qa","upgrades":[],"pingInterval":25000,"pingTimeout":20000}',
			headers: { 'access-control-allow-origin': '*' }
		})
	);
	await context.addInitScript(() => {
		window.__qaVitals = { lcp: 0, cls: 0 };
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) window.__qaVitals.lcp = entry.startTime;
		}).observe({ type: 'largest-contentful-paint', buffered: true });
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries())
				if (!entry.hadRecentInput) window.__qaVitals.cls += entry.value;
		}).observe({ type: 'layout-shift', buffered: true });
	});
	const p = await context.newPage();
	p.setDefaultTimeout(10000);
	p.on('pageerror', (e) => report.errors.push(String(e)));
	return { context, p };
}
async function capture(p, name) {
	await p.evaluate(() => document.fonts.ready);
	await p.waitForTimeout(700);
	const data = await p.evaluate(() => ({
		vitals: window.__qaVitals,
		title: document.title,
		clippedTableElements: [
			...document.querySelectorAll(
				'.table-cards .mat,.table-cards .mat-actions,.table-cards .tray,.my-cards .tp-card,.my-cards .pick'
			)
		]
			.filter((el) => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
			})
			.map((el) => el.className),
		h1: [...document.querySelectorAll('h1')].map((e) => e.textContent),
		overflow: document.documentElement.scrollWidth > innerWidth + 1,
		offenders: [...document.querySelectorAll('body *')]
			.filter((e) => {
				const r = e.getBoundingClientRect();
				return (
					r.width > 0 &&
					(r.right > innerWidth + 2 || r.left < -2) &&
					getComputedStyle(e).position !== 'fixed'
				);
			})
			.slice(0, 8)
			.map((e) => ({
				tag: e.tagName,
				cls: typeof e.className === 'string' ? e.className : '',
				width: Math.round(e.getBoundingClientRect().width)
			}))
	}));
	await p.screenshot({ path: `${output}/${name}.png`, fullPage: true });
	await p.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
	const axe = await p.evaluate(async () => {
		const r = await window.axe.run(document, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
		});
		return r.violations.map((v) => ({
			id: v.id,
			impact: v.impact,
			nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })).slice(0, 8)
		}));
	});
	report.pages.push({ name, ...data, axe });
	console.log(
		name,
		JSON.stringify({ overflow: data.overflow, h1: data.h1, violations: axe.map((a) => a.id) })
	);
}
if (process.argv.includes('--card-gallery')) {
	const gallery = [];
	try {
		for (const width of [320, 390, 1440]) {
			const { context, p } = await setup(width);
			await p.goto(base, { waitUntil: 'domcontentloaded' });
			await capture(p, `gallery-${width}-home`);
			await p.goto(base + '/games', { waitUntil: 'domcontentloaded' });
			const ids = await p
				.locator('.game-list a')
				.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href').slice(1)));
			assert.equal(ids.length, 29);
			for (const id of ids) {
				if (width < 600) await p.locator('.mobile-picker select').selectOption(id);
				else await p.locator(`.game-list a[href="#${id}"]`).click();
				await p.waitForFunction((id) => document.querySelector('.game-guide')?.id === id, id);
				await p.waitForFunction(() =>
					[...document.querySelectorAll('.stage img')].every(
						(img) => img.complete && img.naturalWidth > 0
					)
				);
				const geometry = await p.locator('.stage').evaluate((stage) => {
					const r = stage.getBoundingClientRect();
					return [...stage.querySelectorAll('.demo-card img')].map((img) => {
						const a = img.getBoundingClientRect();
						return {
							left: a.left - r.left,
							right: a.right - r.left,
							width: r.width,
							ok: a.left >= r.left - 1 && a.right <= r.right + 1
						};
					});
				});
				gallery.push({ width, id, geometry });
				if (width === 390)
					await p.locator('.stage').screenshot({ path: `${output}/gallery-${id}.png` });
			}
			await capture(p, `gallery-${width}-games`);
			await p.getByRole('button', { name: /Replay .* example/ }).click();
			report.checks.push(`${width}: all 29 game hands load, fit their panel and replay`);
			await p.goto(base + '/club', { waitUntil: 'domcontentloaded' });
			await capture(p, `gallery-${width}-club`);
			await p.getByRole('button', { name: /Pick hand A:/ }).click();
			await capture(p, `gallery-${width}-warmup-answer`);
			await context.close();
		}
	} finally {
		await fs.writeFile(
			`${output}/gallery-report.json`,
			JSON.stringify({ ...report, gallery }, null, 2)
		);
		await browser.close();
	}
	assert.deepEqual(report.errors, []);
	assert.equal(
		gallery.filter((g) => g.geometry.some((c) => !c.ok)).length,
		0,
		'All card fans stay inside their stage'
	);
	assert.equal(
		report.pages.filter((p) => p.overflow || p.axe.length).length,
		0,
		'No overflow or accessibility violations on refined screens'
	);
	console.log(`Verified ${gallery.length} game hands across three widths.`);
	process.exit(0);
}
try {
	for (const width of tableOnly ? [320, 390, 768, 1440] : [1440, 390]) {
		const { context, p } = await setup(width);
		const prefix = tableOnly ? `${width}` : width === 390 ? 'm' : 'd';
		for (const [path, name] of [
			['/', 'home'],
			['/games', 'games'],
			['/club', 'club'],
			['/create-room', 'setup'],
			['/stats', 'stats'],
			['/admin', 'admin'],
			['/availability/qa?for=visual', 'availability'],
			['/test-table', 'table'],
			['/test-cards', 'cards'],
			['/test-chips', 'chips'],
			['/test-decks', 'decks'],
			['/test-mascots', 'mascots'],
			['/test-stats', 'stats-preview'],
			['/missing/route', '404']
		]) {
			if (tableOnly && name !== 'table') continue;
			if (process.argv.includes('--stats-only') && name !== 'stats') continue;
			await p.goto(base + path, { waitUntil: 'domcontentloaded' });
			await capture(p, `${prefix}-${name}`);
			if (name === 'home') {
				if (width === 1440) {
					await p.screenshot({ path: `${output}/d-home-fan-rest.png` });
					await p.locator('.card-fan').hover();
					await p.waitForTimeout(600);
					await p.screenshot({ path: `${output}/d-home-fan-hover.png` });
					await p.getByRole('button', { name: 'Pull up a chair' }).hover();
					await p.waitForTimeout(300);
					await p.screenshot({ path: `${output}/d-home-cta-hover.png` });
				}
				const button = p.getByRole('button', { name: 'Pull up a chair' });
				await button.click();
				await p.getByRole('dialog').waitFor();
				await p.waitForTimeout(250);
				assert.ok(
					await p.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)),
					'Dialog takes keyboard focus'
				);
				for (let n = 0; n < 18; n++) await p.keyboard.press('Tab');
				assert.ok(
					await p.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)),
					'Dialog traps keyboard focus'
				);
				await capture(p, `${prefix}-start-modal`);
				await p.keyboard.press('Escape');
				await p.getByRole('dialog').waitFor({ state: 'hidden' });
				report.checks.push(`${prefix}: dialog opens, takes and traps focus, Escape closes`);
			}
			if (name === 'table' && (width === 390 || (tableOnly && width === 320))) {
				for (let scene = 2; scene <= 8; scene++) {
					await p.goto(`${base}/test-table?scene=${scene}`, { waitUntil: 'domcontentloaded' });
					await capture(p, `${prefix}-table-scene-${scene}`);
				}
			}
			if (name === 'games') {
				await p.getByRole('searchbox').fill('blackjack');
				assert.equal(await p.locator('.game-list a').count(), 1);
				await p.getByRole('searchbox').fill('');
				await p.getByRole('button', { name: 'Poker', exact: true }).click();
				assert.equal(await p.locator('.game-list a').count(), 1);
				report.checks.push(`${prefix}: games search and category filters`);
			}
			if (name === 'club')
				for (const tab of ['Leaderboard', 'History', 'Friends']) {
					await p.getByRole('button', { name: tab, exact: false }).first().click();
					await capture(p, `${prefix}-club-${tab.toLowerCase()}`);
				}
			if (name === 'stats')
				for (const tab of await p.locator('.sections button').allTextContents()) {
					await p.getByRole('button', { name: tab, exact: true }).click();
					await capture(p, `${prefix}-stats-${tab.toLowerCase()}`);
				}
			if (name === 'admin')
				for (const tab of [
					'Analytics',
					'Live tables',
					'Lineup',
					'Table defaults',
					'Look',
					'Game night'
				]) {
					await p.getByRole('button', { name: tab, exact: true }).click();
					await capture(p, `${prefix}-admin-${tab.toLowerCase().replaceAll(' ', '-')}`);
				}
		}
		if (width === 390 && !tableOnly) {
			await p.goto(base);
			await p.getByRole('button', { name: 'Menu' }).click();
			assert.ok(await p.getByRole('link', { name: 'The games', exact: true }).first().isVisible());
			await capture(p, 'm-menu');
			await p.keyboard.press('Escape');
			report.checks.push('mobile menu opens and Escape closes');
		}
		await context.close();
	}
	const { context, p } = await setup(390, false, true);
	await p.goto(base);
	await capture(p, 'r-home');
	await p.keyboard.press('Tab');
	assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Skip to content');
	report.checks.push('skip link is first keyboard target');
	await p.screenshot({ path: `${output}/k-skip-link.png` });
	await p.goto(base + '/club');
	await capture(p, 'm-signed-out');
	await context.close();
} finally {
	await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
	await browser.close();
}
assert.deepEqual(report.errors, [], 'No page JavaScript errors');
assert.equal(report.pages.filter((p) => p.overflow).length, 0, 'No page overflow');
assert.equal(report.blockedWrites.length, 0, 'No server writes');
assert.equal(
	report.pages.filter((p) => p.clippedTableElements?.length).length,
	0,
	'Table board, hand and controls stay within viewport'
);
console.log(`Report: ${output}/report.json`);
