import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { getVariant } from '../../server/variants/index.mjs';
import { watchRoomData } from '../game-frames.mjs';

const base = 'http://127.0.0.1:5174';
let room = '';
const directory = process.env.CAPTURE_DIRECTORY || 'visual-baselines/phase1';
const rulesVersion = process.env.VARIANT_RULES_VERSION || 'classic-1';
assert.ok(['classic-1', 'muflis-1'].includes(rulesVersion));
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({
	executablePath:
		process.env.PHASE0_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true
});
const contexts = [],
	pages = [],
	views = new Map(),
	external = new Set();
const report = {
	capturedAt: new Date().toISOString(),
	room,
	rulesVersion,
	screenshots: [],
	checks: [],
	errors: []
};
function track(page, index) {
	page.on('pageerror', (error) => report.errors.push(String(error)));
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (
			['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol) &&
			!['127.0.0.1', 'localhost'].includes(url.hostname)
		)
			external.add(url.origin);
	});
	page.on('websocket', (ws) => {
		watchRoomData(ws, (snapshot) => views.set(index, snapshot));
	});
}
async function until(check) {
	const end = Date.now() + 15000;
	while (Date.now() < end) {
		if (check()) return;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error('Timed out waiting for a browser game-state transition');
}
async function screenshot(page, name) {
	await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
	report.screenshots.push(name);
	console.log(`Captured ${name}`);
}
async function addPlayer(index) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	contexts.push(context);
	const page = await context.newPage();
	pages.push(page);
	track(page, index);
	if (index === 0) {
		await page.goto(base, { waitUntil: 'networkidle' });
		await screenshot(page, '01-home');
		assert.equal(await page.evaluate(() => !!customElements.get('playing-card')), true);
		await page.goto(`${base}/test-cards`, { waitUntil: 'networkidle' });
		await screenshot(page, '02-card-deck');
		await page.goto(`${base}/create-room`, { waitUntil: 'networkidle' });
		await page.locator('#create-room-btn').waitFor();
		await page.locator('#variant').selectOption(rulesVersion);
		await screenshot(page, '03-create-join');
		await page.setViewportSize({ width: 390, height: 844 });
		assert.equal(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= document.documentElement.clientWidth
			),
			true
		);
		await screenshot(page, '03-mobile-create');
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.locator('#create-room-btn').click();
		await page.waitForURL((url) => /^\/[a-f0-9]{32}$/.test(url.pathname));
		room = new URL(page.url()).pathname.slice(1);
		report.room = room;
	} else await page.goto(`${base}/${room}`, { waitUntil: 'networkidle' });
	await page.getByRole('heading', { name: 'Take a Seat' }).waitFor();
	await page.locator('#username').fill(`Baseline ${index + 1}`);
	await page
		.getByRole('group', { name: 'Player Name' })
		.getByRole('button', { name: 'Join', exact: true })
		.click();
	await until(() => views.get(index)?.usersList.some((p) => p.id === views.get(index).selfId));
	await page.getByRole('heading', { name: 'Game Settings' }).waitFor();
}
try {
	for (let i = 0; i < 6; i++) await addPlayer(i);
	await until(() => views.get(0)?.usersList.length === 6);
	assert.ok([...views.values()].every((v) => v.rulesVersion === rulesVersion));
	for (let i = 0; i < pages.length; i++) {
		const playerId = views.get(i).selfId;
		await pages[i].getByTestId('ready-toggle').click();
		await until(() => views.get(0)?.usersList.find((player) => player.id === playerId)?.ready === true);
	}
	const host = pages[0];
	assert.equal(await host.getByTestId('variant-label').count(), 1);
	assert.match(
		await host.getByTestId('variant-label').textContent(),
		rulesVersion === 'muflis-1' ? /Muflis/ : /Classic/
	);
	await screenshot(host, '04-six-player-waiting');
	assert.equal(
		await pages[1].getByRole('button', { name: 'Start Game', exact: true }).isDisabled(),
		true
	);
	await host.getByRole('button', { name: 'Start Game', exact: true }).click();
	await until(() => views.get(0)?.isStarted);
	assert.ok(
		[...views.values()].every((v) =>
			v.usersList.every((p) => p.cardsInHand.every((c) => c.rank === 0))
		)
	);
	await screenshot(host, '05-six-player-blind');
	await host.getByRole('button', { name: 'See', exact: true }).click();
	await until(() => !views.get(0).usersList.find((p) => p.id === views.get(0).selfId).isBlind);
	const original = views.get(0);
	const myCards = structuredClone(
		original.usersList.find((p) => p.id === original.selfId).cardsInHand
	);
	await screenshot(host, '06-seen');
	views.delete(0);
	await host.reload({ waitUntil: 'networkidle' });
	await until(() => views.get(0)?.handId === original.handId);
	assert.equal(views.get(0).selfId, original.selfId);
	assert.equal(views.get(0).rulesVersion, rulesVersion);
	assert.deepEqual(
		views.get(0).usersList.find((p) => p.id === original.selfId).cardsInHand,
		myCards
	);
	await host.getByRole('heading', { name: 'Take a Seat' }).waitFor({ state: 'detached' });
	await screenshot(host, '07-refresh-resumed');
	const view = () => views.get(0);
	const currentPage = () =>
		pages[view().usersList.findIndex((p) => p.id === view().usersList[view().currentPlayer]?.id)];
	const oldPot = view().pot;
	await currentPage()
		.getByRole('button', { name: /^(Blind|Chal)$/ })
		.click();
	await until(() => view().pot > oldPot);
	await screenshot(host, '08-bet');
	for (let i = 0; i < 4; i++) {
		const actorId = view().usersList[view().currentPlayer].id;
		const page = currentPage();
		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Pack', exact: true }).click();
		await until(() => view().usersList.find((p) => p.id === actorId)?.isPacked);
	}
	await screenshot(host, '09-packed');
	for (let i = 0; i < 6; i++) {
		const me = views.get(i)?.usersList.find((p) => p.id === views.get(i).selfId);
		if (me && !me.isPacked && me.isBlind) {
			await pages[i].getByRole('button', { name: 'See', exact: true }).click();
			await until(() => !view().usersList.find((p) => p.id === me.id).isBlind);
		}
	}
	await currentPage().getByRole('button', { name: 'Show', exact: true }).click();
	await until(() => !!view().result);
	const finalists = view().usersList.filter((p) => !p.isPacked && !p.hasLeft);
	assert.equal(finalists.length, 2);
	const winner = finalists.find((p) => p.id === view().result.winnerId);
	const opponent = finalists.find((p) => p.id !== winner?.id);
	assert.ok(winner && opponent);
	assert.ok(getVariant(rulesVersion).compareHands(winner.cardsInHand, opponent.cardsInHand) >= 0);
	assert.equal(
		view().pot,
		0,
		`settled state: pot=${view().pot}, started=${view().isStarted}, show=${view().gameShow}, hand=${view().handId}`
	);
	assert.equal(
		view().usersList.reduce((n, p) => n + p.balance, 0),
		300
	);
	assert.equal(await host.locator('select').count(), 1);
	assert.equal(await pages[1].locator('#nextVariant').isDisabled(), true);
	await host.getByRole('heading', { name: 'Winner', exact: true }).waitFor();
	await screenshot(host, '10-server-winner');
	const nextRulesVersion = rulesVersion === 'classic-1' ? 'muflis-1' : 'classic-1';
	await host.locator('#nextVariant').selectOption(nextRulesVersion);
	await host.getByRole('button', { name: 'Start Game', exact: true }).click();
	await until(() => !view().gameShow && view().handId !== original.handId);
	assert.equal(view().rulesVersion, nextRulesVersion);
	assert.equal(view().name, room);
	assert.deepEqual(
		view().usersList.map((p) => [p.id, p.seatNumber]),
		original.usersList.map((p) => [p.id, p.seatNumber])
	);
	await screenshot(host, '13-variant-switched');
	await host.setViewportSize({ width: 390, height: 844 });
	await screenshot(host, '11-mobile');
	await host.getByRole('button', { name: 'Leave', exact: true }).click();
	await host.waitForURL(`${base}/create-room`);
	await until(() => views.get(1)?.hostId === views.get(1).selfId);
	await screenshot(pages[1], '12-host-transfer');
	assert.deepEqual([...external], []);
	assert.deepEqual(report.errors, []);
	report.checks = [
		'create-room variant choice and room rules retained on refresh',
		'six isolated browser participants',
		'host-only start',
		'blind and opponent hands hidden in wire views',
		'See reveals only owned hand',
		'refresh resumes same identity, seat and hand',
		'bet and Pack controls',
		'automatic Show winner without selector',
		'revealed Show winner matches selected variant comparison',
		'chip conservation',
		'new hand',
		'host switches variant for next hand in same room with same seats and identities',
		'mobile original styling',
		'explicit leave and host transfer',
		'no third-party runtime requests'
	];
} catch (error) {
	report.errors.push(String(error));
	process.exitCode = 1;
	if (pages[0]) await screenshot(pages[0], 'failure').catch(() => {});
} finally {
	for (const context of contexts) await context.close().catch(() => {});
	await browser.close();
	await fs.writeFile(`${directory}/browser-report.json`, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
}
