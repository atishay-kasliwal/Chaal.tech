import { chromium } from 'playwright';
import parser from 'socket.io-msgpack-parser';
import { RoomServiceClient } from 'livekit-server-sdk';
import { getVariant } from '../../server/variants/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5174';
const directory = process.env.CAPTURE_DIRECTORY || 'visual-baselines/phase4';
const room = `media-${Date.now().toString(36)}`;
const admin = new RoomServiceClient('http://127.0.0.1:7880', 'devkey', 'secret', {
	requestTimeout: 4
});
const report = {
	capturedAt: new Date().toISOString(),
	room,
	checks: [],
	screenshots: [],
	errors: []
};
const contexts = [],
	pages = [],
	views = new Map();
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true,
	args: [
		'--use-fake-device-for-media-stream',
		'--use-fake-ui-for-media-stream',
		'--autoplay-policy=no-user-gesture-required'
	]
});
async function until(check, label = 'state', timeout = 25000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Timed out waiting for ${label}`);
}
async function capture(page, name) {
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(150);
	await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
	report.screenshots.push(name);
	console.log(`Captured ${name}`);
}
const panel = (page) => page.getByTestId('room-media');
async function connect(page) {
	await panel(page).getByRole('button', { name: 'Join camera/audio', exact: true }).click();
	await panel(page).getByText('Media connected', { exact: true }).waitFor({ timeout: 20000 });
}
async function camera(page) {
	await panel(page).getByRole('button', { name: 'Camera on', exact: true }).click();
	await panel(page).getByRole('button', { name: 'Camera off', exact: true }).waitFor();
}
async function mic(page) {
	await panel(page).getByRole('button', { name: 'Unmute mic', exact: true }).click();
	await panel(page).getByRole('button', { name: 'Mute mic', exact: true }).waitFor();
}
try {
	for (let i = 0; i < 6; i++) {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
			permissions: ['camera', 'microphone']
		});
		contexts.push(context);
		await context.addInitScript(
			({ cameraDenied, microphoneDenied }) => {
				window.__cameraDenied = cameraDenied;
				window.__microphoneDenied = microphoneDenied;
				window.__mediaTracks = [];
				window.__mediaRequests = 0;
				const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
				navigator.mediaDevices.getUserMedia = async (constraints) => {
					window.__mediaRequests++;
					if (
						(constraints.video && window.__cameraDenied) ||
						(constraints.audio && window.__microphoneDenied)
					)
						throw new DOMException('Test denied', 'NotAllowedError');
					const stream = await original(constraints);
					window.__mediaTracks.push(...stream.getTracks());
					return stream;
				};
			},
			{ cameraDenied: i === 4, microphoneDenied: i === 5 }
		);
		const page = await context.newPage();
		pages.push(page);
		page.on('pageerror', (error) => report.errors.push(String(error)));
		page.on('websocket', (ws) => {
			if (!ws.url().includes(':8080')) return;
			const decoder = new parser.Decoder();
			decoder.on('decoded', (packet) => {
				if (packet.data?.[0] === 'roomData') views.set(i, packet.data[1]);
			});
			ws.on('framereceived', (frame) => {
				if (typeof frame.payload !== 'string')
					try {
						decoder.add(frame.payload);
					} catch {
						/* Non-game frame. */
					}
			});
		});
		if (i === 0) {
			await page.goto(`${base}/create-room`, { waitUntil: 'networkidle' });
			await page.locator('#roomName').fill(room);
			await page.locator('#variant').selectOption('muflis-1');
			await page.locator('#create-room-btn').click();
		} else await page.goto(`${base}/${room}`, { waitUntil: 'networkidle' });
		await page.locator('#username').fill(`Media ${i + 1}`);
		await page
			.getByRole('group', { name: 'Player Name' })
			.getByRole('button', { name: 'Join', exact: true })
			.click();
		await until(
			() => views.get(i)?.usersList.some((p) => p.id === views.get(i).selfId),
			'game join'
		);
		assert.equal(await page.evaluate(() => window.__mediaRequests), 0);
		await connect(page);
		assert.equal(await page.evaluate(() => window.__mediaRequests), 0);
		if (i === 4) {
			await panel(page).getByRole('button', { name: 'Camera on', exact: true }).click();
			await panel(page)
				.getByText(/Camera: Permission denied/)
				.waitFor();
			await mic(page);
			await capture(page, '01-camera-denied-audio-works');
			await page.evaluate(() => (window.__cameraDenied = false));
			await camera(page);
		} else {
			await camera(page);
			if (i === 5) {
				await panel(page).getByRole('button', { name: 'Unmute mic', exact: true }).click();
				await panel(page)
					.getByText(/Microphone: Permission denied/)
					.waitFor();
				await capture(page, '02-microphone-denied-video-works');
				await page.evaluate(() => (window.__microphoneDenied = false));
			}
			await mic(page);
		}
		console.log(`Joined media player ${i + 1}`);
	}
	await until(async () => {
		const participants = await admin.listParticipants(room);
		return (
			participants.length === 6 &&
			participants.every((p) => p.tracks.filter((t) => !t.muted).length === 2)
		);
	}, 'six real camera/microphone publishers');
	const liveRoom = (await admin.listRooms([room]))[0];
	assert.equal(liveRoom.maxParticipants, 6);
	assert.deepEqual(
		(await admin.listParticipants(room)).map((p) => p.identity).sort(),
		[...views.values()].map((v) => v.selfId).sort()
	);
	await capture(pages[0], '03-six-media-lobby');
	await pages[0].getByRole('button', { name: 'Start Game', exact: true }).click();
	await until(() => views.get(0)?.isStarted, 'start with media');
	for (let i = 0; i < 6; i++) {
		await until(
			() =>
				pages[i]
					.locator('[data-testid="seat-video"] video')
					.evaluateAll(
						(videos) => videos.length === 6 && videos.every((video) => video.videoWidth > 0)
					),
			'six received video streams',
			40000
		);
		await until(
			async () => (await pages[i].locator('audio[data-player-audio]').count()) === 5,
			'five unique remote audio elements'
		);
		const audioIds = await pages[i]
			.locator('audio[data-player-audio]')
			.evaluateAll((elements) => elements.map((e) => e.dataset.playerAudio));
		assert.equal(new Set(audioIds).size, 5);
		assert.ok(views.get(i).usersList.every((p) => p.cardsInHand.every((c) => c.rank === 0)));
	}
	await capture(pages[0], '04-six-video-game');
	await panel(pages[0]).getByRole('button', { name: 'Audio only', exact: true }).click();
	await panel(pages[0]).getByRole('button', { name: 'Camera on', exact: true }).waitFor();
	await capture(pages[0], '05-audio-only');
	await panel(pages[0]).getByRole('button', { name: 'Mute mic', exact: true }).click();
	await until(
		() =>
			pages[1]
				.locator('audio[data-player-audio]')
				.count()
				.then((n) => n === 4),
		'remote mute'
	);
	await camera(pages[0]);
	await mic(pages[0]);
	const prior = views.get(0);
	await pages[0].reload({ waitUntil: 'networkidle' });
	await until(() => views.get(0)?.handId === prior.handId, 'refresh preserves hand');
	assert.equal(views.get(0).selfId, prior.selfId);
	assert.equal(await pages[0].evaluate(() => window.__mediaRequests), 0);
	await connect(pages[0]);
	await camera(pages[0]);
	await mic(pages[0]);
	await capture(pages[0], '06-refresh-media-rejoined');
	await admin.removeParticipant(room, views.get(1).selfId);
	await panel(pages[1])
		.getByText(/Media disconnected/)
		.waitFor({ timeout: 15000 });
	await until(
		() => pages[1].evaluate(() => window.__mediaTracks.every((t) => t.readyState === 'ended')),
		'removed participant track cleanup'
	);
	const oldPot = views.get(0).pot;
	await pages[1].getByRole('button', { name: 'Blind', exact: true }).click();
	await until(() => views.get(0).pot === oldPot + 1, 'bet during media interruption');
	await capture(pages[1], '07-media-interrupted-game-bet');
	await connect(pages[1]);
	await mic(pages[1]);
	await panel(pages[2]).getByRole('button', { name: 'Leave media', exact: true }).click();
	await until(
		() => pages[2].evaluate(() => window.__mediaTracks.every((t) => t.readyState === 'ended')),
		'leave media releases capture'
	);
	assert.equal(views.get(2).isStarted, true);
	await connect(pages[2]);
	await camera(pages[2]);
	await mic(pages[2]);
	const view = () => views.get(0),
		currentPage = () =>
			pages[view().usersList.findIndex((p) => p.id === view().usersList[view().currentPlayer]?.id)];
	for (let i = 0; i < 4; i++) {
		const actor = view().usersList[view().currentPlayer].id,
			page = currentPage();
		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Pack', exact: true }).click();
		await until(() => view().usersList.find((p) => p.id === actor).isPacked, 'pack with media');
	}
	await currentPage().getByRole('button', { name: 'Show', exact: true }).click();
	await until(() => !!view().result, 'server show with media');
	const finalists = view().usersList.filter((p) => !p.isPacked),
		winner = finalists.find((p) => p.id === view().result.winnerId),
		other = finalists.find((p) => p.id !== winner.id);
	assert.ok(getVariant('muflis-1').compareHands(winner.cardsInHand, other.cardsInHand) >= 0);
	assert.equal(
		view().usersList.reduce((sum, p) => sum + p.balance, 0),
		300
	);
	assert.equal(
		view().usersList.reduce((sum, p) => sum + p.handBet, 0),
		view().result.amount
	);
	await capture(pages[0], '08-winner-with-media');
	await pages[0].setViewportSize({ width: 390, height: 844 });
	await capture(pages[0], '09-mobile-existing-grid');
	const hostId = view().selfId;
	await pages[0].getByRole('button', { name: 'Leave', exact: true }).click();
	await pages[0].waitForURL(`${base}/create-room`);
	await until(
		() => pages[0].evaluate(() => window.__mediaTracks.every((t) => t.readyState === 'ended')),
		'leave game releases capture'
	);
	await until(
		async () => !(await admin.listParticipants(room)).some((p) => p.identity === hostId),
		'server removes departed media participant'
	);
	assert.deepEqual(report.errors, []);
	report.checks = [
		'six real LiveKit identities match game seats',
		'six camera and microphone publishers',
		'six decoded videos and five unique remote audio elements per browser',
		'camera denial with working microphone',
		'microphone denial with working camera',
		'no capture before explicit device actions',
		'audio-only/camera-off/mute',
		'refresh keeps game identity/hand and requires fresh media consent',
		'media interruption and reconnect while game bets continue',
		'leave media stops capture without leaving game',
		'server-owned Muflis Show and chip conservation with media',
		'mobile uses existing grid',
		'leaving game stops capture and removes media participant'
	];
} catch (error) {
	report.errors.push(String(error));
	process.exitCode = 1;
	if (pages[0]) await capture(pages[0], 'failure').catch(() => {});
	console.error(error);
} finally {
	for (const context of contexts) await context.close().catch(() => {});
	await browser.close();
	await fs.writeFile(`${directory}/browser-report.json`, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
}
