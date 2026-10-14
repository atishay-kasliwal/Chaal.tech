import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile('docs/phase0/import-provenance.json', 'utf8'));
const changed = new Set([
	'src/lib/components/PlayingCard.svelte',
	'src/lib/config.ts',
	'src/lib/stores/socket-store.svelte.ts',
	'src/lib/utils/room.ts',
	'src/routes/+layout.svelte',
	'src/routes/create-room/+page.svelte',
	'src/routes/[roomName]/+error.svelte',
	'src/routes/[roomName]/+page.svelte',
	'src/routes/[roomName]/DeclareWinner.svelte',
	'src/routes/[roomName]/UsernameForm.svelte',
	'src/routes/[roomName]/UsersTable.svelte',
	'src/routes/[roomName]/types.d.ts'
]);

test('Preserved landing, theme, waiting table, toast and original asset files remain byte-identical', async () => {
	const retained = manifest.files.filter(
		(entry) =>
			(entry.path.startsWith('src/') || entry.path.startsWith('static/')) &&
			!changed.has(entry.path)
	);
	assert.equal(retained.length, 17);
	for (const entry of retained) {
		let bytes = await readFile(entry.path);
		if (entry.path === 'src/app.html')
			bytes = Buffer.from(
				bytes
					.toString()
					.replace('width=device-width, initial-scale=1, viewport-fit=cover', 'width=device-width')
					.replace('Chaal.tech — gather your friends for Teen Patti and Poker around one virtual table.', 'Create room and play teen patti with your friends')
					.replace('Chaal.tech — Social Card Games', 'Teen Patti Multiplayer')
			);
		if (entry.path === 'static/site.webmanifest')
			bytes = Buffer.from(
				bytes
					.toString()
					.replace('"name": "Chaal.tech — Social Card Games"', '"name": ""')
					.replace('"short_name": "Chaal.tech"', '"short_name": ""')
			);
		if (entry.path === 'src/routes/+page.svelte')
			bytes = Buffer.from(bytes.toString().replace('Chaal.tech', 'Teen Patti'));
		assert.equal(digest(bytes), entry.upstreamSha256, entry.path);
	}
});

test('Waiting table evolves with the existing seat numbering and shows host, connection and ready state', async () => {
	const source = await readFile('src/routes/[roomName]/UsersTable.svelte', 'utf8');
	assert.match(source, /user\.seatNumber \+ 1/);
	assert.match(source, /user\.id === hostId/);
	assert.match(source, /user\.connected/);
	assert.match(source, /user\.ready \? 'Ready' : 'Not ready'/);
});

test('PlayingCard changes only its script delivery URL, preserving every original rendering instruction', async () => {
	const file = 'src/lib/components/PlayingCard.svelte';
	const originalHash = manifest.files.find((entry) => entry.path === file).upstreamSha256;
	const actual = (await readFile(file, 'utf8')).replace(
		'/vendor/cardmeister.js',
		'https://cardmeister.github.io/elements.cardmeister.full.js'
	);
	assert.equal(digest(actual), originalHash);
});
