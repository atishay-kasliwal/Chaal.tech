import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import {
	competitionSpecs,
	summarizeCompetition,
	ROSTER
} from '../../server/league/competition.mjs';
import { createSession, post, closeClub } from './club-helper.mjs';
const url = process.env.CHAAL_CF_TEST_URL;
const mongo = new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db = mongo.db('chaal-cf-test');
const key = 'league-integration-test-key-0123456789abcdef';
test.after(async () => {
	await mongo.close();
	await closeClub();
});
const upload = async (report, token = key) =>
	fetch(`${url}/admin/bots/league`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
		body: JSON.stringify(report)
	});
function fixture(seed, day, flip = false) {
	const rows = competitionSpecs({ hands: 1000, seed }).map((s) => ({
		block: s.block,
		rotation: s.rotation,
		hands: 100,
		rows: s.ids.map((id) => {
			const i = ROSTER.findIndex((c) => c.id === id);
			return {
				id,
				net: (flip ? [-3, -2, 0, 1, 4] : [4, 1, 0, -2, -3])[i],
				wins: 20,
				decisions: 100,
				raises: 20,
				folds: 10
			};
		})
	}));
	return {
		...summarizeCompetition(rows, {
			hands: 1000,
			seed,
			startedAt: `2026-10-${day}T11:00:00Z`,
			completedAt: `2026-10-${day}T11:01:00Z`
		}),
		commit: '0'.repeat(40)
	};
}
test('league API requires membership, accepts only scoped validated publications and preserves history', async () => {
	const anonymous = await fetch(`${url}/bots/league`);
	assert.equal(anonymous.status, 401);
	const session = await createSession({ nickname: 'League Reader' });
	const report = fixture(9100, '24');
	assert.equal((await upload(report, 'invalid')).status, 403);
	assert.equal((await upload(report, 'é'.repeat(key.length))).status, 403);
	assert.equal((await upload({ ...report, hands: 13 })).status, 400);
	assert.equal(
		(
			await upload({
				...report,
				standings: report.standings.map((s, i) => (i === 0 ? { ...s, net: 999 } : s))
			})
		).status,
		400
	);
	assert.equal((await upload(report)).status, 200);
	assert.equal((await upload(report)).status, 200);
	assert.equal((await upload({ ...report, completedAt: '2026-10-24T12:00:00Z' })).status, 400);
	assert.equal(await db.collection('bot_league_runs').countDocuments({ _id: report.id }), 1);
	const body = await fetch(`${url}/bots/league`, {
		headers: { authorization: `Bearer ${session.clubToken}` }
	}).then((r) => r.json());
	assert.equal(body.schedule.timeZone, 'America/New_York');
	assert.equal(body.reports.find((r) => r.id === report.id).winner, 'rohit-sharma');
	assert.equal(body.reports.find((r) => r.id === report.id)._id, undefined);
});
test('league page switches players and competition history inline on desktop and phone', async (t) => {
	await upload(fixture(9200, '25', true));
	const session = await createSession({ nickname: 'League Viewer' });
	const profile = await post('/me', {
		token: session.clubToken,
		body: { profile: { nickname: 'League Viewer', characterId: 'owl' }, onboard: true }
	});
	const browser = await chromium.launch({
		headless: true,
		...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' })
	});
	t.after(() => browser.close());
	for (const width of [1440, 390]) {
		const context = await browser.newContext({ viewport: { width, height: 900 } });
		await context.addInitScript(
			({ token, member }) => {
				localStorage.setItem('chaal-club-session-v1', token);
				localStorage.setItem('chaal-club-member-v1', JSON.stringify(member));
			},
			{ token: session.clubToken, member: profile.body.member }
		);
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(`${process.env.CHAAL_BROWSER_URL}/bots`);
		await page.getByRole('heading', { name: 'Dhoni takes the table.' }).waitFor();
		await page.locator('.player-tabs').getByRole('button', { name: /Virat/ }).click();
		assert.equal(await page.locator('.dossier-copy h3').innerText(), 'Virat.');
		await page.getByRole('button', { name: 'How we score' }).click();
		assert.equal(await page.locator('#league-method').isVisible(), true);
		await page.locator('.history-list button').filter({ hasText: 'Oct 24' }).click();
		await page.getByRole('heading', { name: 'Rohit takes the table.' }).waitFor();
		await page.getByRole('button', { name: 'Return to the latest result' }).click();
		await page.getByRole('heading', { name: 'Dhoni takes the table.' }).waitFor();
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		assert.deepEqual(errors, []);
		await context.close();
	}
});
