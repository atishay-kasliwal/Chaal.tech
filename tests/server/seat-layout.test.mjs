import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { arrangeSeats } from '../../src/lib/seat-layout.ts';

// Approved frontend redesign replaces only these frozen visual baselines.
const redesigned = JSON.parse(
	await readFile('tests/fixtures/frontend-redesign-preservation.json', 'utf8')
);

const brandedFiles = new Set([
	'src/app.html',
	'static/android-chrome-192x192.png',
	'static/android-chrome-512x512.png',
	'static/apple-touch-icon.png',
	'static/favicon-16x16.png',
	'static/favicon-32x32.png',
	'static/favicon.ico',
	'static/site.webmanifest'
]);

for (let count = 2; count <= 6; count++)
	test(`${count} players: every viewer stays bottom with unique seats and physical clockwise order`, () => {
		const players = Array.from({ length: count }, (_, i) =>
			Object.freeze({ id: `player-${i}`, seatNumber: i })
		);
		const source = Object.freeze([...players].reverse());
		for (const viewer of players) {
			const before = JSON.stringify(source),
				seats = arrangeSeats(source, viewer.id);
			assert.equal(seats[0].user.id, viewer.id);
			assert.equal(seats[0].position, 'bottom');
			assert.equal(new Set(seats.map((s) => s.position)).size, count);
			assert.deepEqual(
				seats.map((s) => s.user.id),
				[...players.slice(viewer.seatNumber), ...players.slice(0, viewer.seatNumber)].map(
					(p) => p.id
				)
			);
			assert.equal(JSON.stringify(source), before);
		}
	});

test('Sparse seats and turn/pack/presence changes never assign different identities to positions', () => {
	const players = [
		{ id: 'a', seatNumber: 0 },
		{ id: 'c', seatNumber: 2 },
		{ id: 'f', seatNumber: 5 }
	];
	const first = arrangeSeats(players, 'c');
	const changed = arrangeSeats(
		players.map((p, i) => ({ ...p, isPacked: i === 1, connected: i !== 2, active: i === 0 })),
		'c'
	);
	assert.deepEqual(
		changed.map((s) => [s.user.id, s.user.seatNumber, s.position]),
		first.map((s) => [s.user.id, s.user.seatNumber, s.position])
	);
	assert.equal(first[0].user.seatNumber, 2);
	assert.deepEqual(arrangeSeats([], 'absent'), []);
});

test('Phase 5 module baselines remain intact except approved room layout and variant changes', async () => {
	const baseline = JSON.parse(await readFile('tests/fixtures/phase4-preservation.json', 'utf8'));
	for (const [file, hash] of Object.entries(baseline)) {
		if (redesigned[file]) {
			assert.equal(
				createHash('sha256')
					.update(await readFile(file))
					.digest('hex'),
				redesigned[file],
				file
			);
			continue;
		}
		if (
			brandedFiles.has(file) ||
			file === 'src/lib/config.ts' ||
			file === 'src/lib/utils/room.ts' ||
			file === 'src/lib/stores/socket-store.svelte.ts' ||
			file === 'src/routes/+page.svelte' ||
			file === 'src/routes/[roomName]/+page.svelte' ||
			file === 'src/routes/+layout.svelte' ||
			file === 'src/lib/components/SeatVideo.svelte' ||
			file === 'src/lib/components/RoomMedia.svelte' || // Compact icon controls for the Teen Patti top bar.
			file === 'src/lib/components/TableScene.svelte' ||
			file === 'src/lib/components/PlayerSeat.svelte' ||
			file === 'src/lib/components/CardFan.svelte' ||
			file === 'src/lib/components/PokerSeat.svelte' ||
			file === 'src/routes/create-room/+page.svelte' ||
			file === 'src/routes/[roomName]/UsersTable.svelte' ||
			file === 'src/routes/[roomName]/UsernameForm.svelte' || // Seating is automatic; the name comes from the start panel.
			file === 'src/routes/[roomName]/types.d.ts' ||
			file === 'server/index.mjs' ||
			file === 'server/media.mjs' ||
			file === 'server/store.mjs' ||
			file === 'server/variants/index.mjs'
		)
			continue;
		if (file === 'server/engine.mjs') continue; // Phase 7 adds variant hand sizes and per-hand public rules state.
		let bytes = await readFile(file);
		if (file === 'src/routes/+page.svelte')
			bytes = Buffer.from(bytes.toString().replace('Chaal.tech', 'Teen Patti'));
		assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
	}
	const roomTypes = await readFile('src/routes/[roomName]/types.d.ts', 'utf8');
	assert.match(roomTypes, /variantState\?: \{ wildRank: number; indicator: Card \}/);
	const service = await readFile('server/index.mjs', 'utf8');
	assert.match(service, /'ready'/);
	assert.match(service, /requireReady: true/);
	const store = await readFile('server/store.mjs', 'utf8');
	assert.match(store, /checkReadiness\(\)/);
	assert.match(store, /wal_checkpoint\(TRUNCATE\)/);
	// The pre-extraction room template is retained as reviewable provenance.
	assert.equal(
		createHash('sha256')
			.update(await readFile('docs/phase5/phase4-room.svelte.txt'))
			.digest('hex'),
		baseline['src/routes/[roomName]/+page.svelte']
	);
	const seatVideo = await readFile('src/lib/components/SeatVideo.svelte', 'utf8');
	assert.match(seatVideo, /use:attachTrack=\{participant\.video\}/);
	assert.match(seatVideo, /object-cover/);
	// The create form lives in the shared start panel (page and pop-up).
	const createRoom = await readFile('src/lib/start/StartPanel.svelte', 'utf8');
	assert.match(createRoom, /\['', table, rulesVersion, gameType, \.\.\.tableArgs\]/);
	assert.match(createRoom, /Start with Classic Teen Patti/);
	assert.doesNotMatch(createRoom, /Game Variant/);
	const catalog = await readFile('src/lib/variant-catalog.ts', 'utf8');
	for (const version of [
		'classic-1',
		'muflis-1',
		'ak47-1',
		'joker-1',
		'lowest-joker-1',
		'999-1',
		'2-card-1',
		'4-card-1'
	])
		assert.match(catalog, new RegExp(`rulesVersion: '${version}'`));
	const roomPage = await readFile('src/routes/[roomName]/+page.svelte', 'utf8');
	assert.match(roomPage, /Choose variant/);
	assert.match(roomPage, /Random variant/);
	assert.match(roomPage, /next-round-controls/);
});
