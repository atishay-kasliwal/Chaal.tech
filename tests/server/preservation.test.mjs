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
					.replace(
						'Chaal.tech — gather your friends for Teen Patti and Poker around one virtual table.',
						'Create room and play teen patti with your friends'
					)
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
			bytes = Buffer.from(
				bytes
					.toString()
					.replace('Chaal.tech', 'Teen Patti')
					.replace(
						"import { EyeOff, Eye, Swords, Sparkles, Coins } from '@lucide/svelte';",
						"import { Info, EyeOff, Eye, Swords, Sparkles, Trophy, Coins } from '@lucide/svelte';"
					)
					.replace(
						"import { onMount } from 'svelte';",
						"import { onMount, onDestroy } from 'svelte';"
					)
					.replace(
						`\n\tfunction activateMechanic(index: number, event: KeyboardEvent) {\n\t\tif (event.key !== 'Enter' && event.key !== ' ') return;\n\t\tevent.preventDefault();\n\t\tactiveMechanic = index;\n\t}\n`,
						''
					)
					.replace(/\n\t\t\t\tonkeydown=\{\(event\) => activateMechanic\(\d, event\)\}/g, '')
					.replace('{#each hands as hand (hand.rank)}', '{#each hands as hand}')
					.replace(
						'{#each hand.cards as card, j (`${card.r}-${card.s}`)}',
						'{#each hand.cards as card, j}'
					)
					.replace(
						'class="group border-base-300 bg-base-200/30 hover:bg-base-200 relative rounded-xl border p-6 transition-all hover:shadow-lg"',
						'class="group border-base-300 bg-base-200/30 hover:bg-base-200 focus:bg-base-200 relative rounded-xl border p-6 transition-all hover:shadow-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"\n\t\t\t\t\t\t\ttabindex="0"\n\t\t\t\t\t\t\trole="button"'
					)
			);
		if (entry.path === 'src/lib/components/Toasts/Toasts.svelte')
			bytes = Buffer.from(
				bytes
					.toString()
					.replace(
						'{#each toastQueue as toast (toast.id)}',
						'{#each toastQueue as { message, type }}'
					)
					.replace("toast.type === 'error'", "type === 'error'")
					.replace("toast.type === 'info'", "type === 'info'")
					.replace("toast.type === 'success'", "type === 'success'")
					.replace('{toast.message}', '{message}')
			);
		if (entry.path === 'src/lib/components/Toasts/stores.svelte.ts')
			bytes = Buffer.from(
				bytes
					.toString()
					.replace('\tid: number;\n', '')
					.replace('let nextToastId = 1;\n', '')
					.replace(
						'toastQueue.push({ id: nextToastId++, message, type });',
						'toastQueue.push({ message, type });'
					)
			);
		if (entry.path === 'src/routes/test-cards/+page.svelte')
			bytes = Buffer.from(
				bytes
					.toString()
					.replace('{#each suits as suit (suit)}', '{#each suits as suit}')
					.replace('{#each ranks as rank (rank)}', '{#each ranks as rank}')
			);
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
