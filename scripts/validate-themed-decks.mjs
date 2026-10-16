import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DECKS } from '../src/lib/decks.ts';
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
for (const deck of DECKS) {
	const root = new URL(`../static/cards/${deck.id}/`, import.meta.url);
	const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
	assert.equal(manifest.id, deck.id);
	assert.equal(manifest.cards.length, 52);
	const identities = new Set(manifest.cards.map((c) => `${c.suit}-${c.rank}`));
	assert.equal(identities.size, 52);
	for (const suit of suits) for (const rank of ranks) assert.ok(identities.has(`${suit}-${rank}`));
	for (const card of manifest.cards) {
		const svg = await readFile(new URL(card.file, root), 'utf8');
		const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, '');
		assert.ok(svg.includes('viewBox="0 0 280 400"'));
		assert.ok(svg.includes(`${card.rank} of ${card.suit}`));
		assert.equal([...body.matchAll(/<use href="#corner"/g)].length, 2);
		if (/^\d+$/.test(card.rank))
			assert.equal(
				[...body.matchAll(/<use href="#pip"/g)].length,
				Number(card.rank),
				deck.id + '/' + card.file
			);
		// Standalone downloads must embed their illustration, not depend on remote sources.
		assert.ok(!/<image[^>]+href="(?!data:image\/png;base64,)/.test(svg));
	}
	const files = (await readdir(new URL('png/', root))).filter((f) => f.endsWith('.png'));
	assert.equal(files.length, 53);
	for (const filename of files) {
		const png = await readFile(new URL('png/' + filename, root));
		assert.equal(png.readUInt32BE(16), 700);
		assert.equal(png.readUInt32BE(20), 1000);
	}
	console.log(
		`${deck.name}: 52 unique faces, numeric pips, paired indices, embedded artwork and 53 PNGs verified.`
	);
}
