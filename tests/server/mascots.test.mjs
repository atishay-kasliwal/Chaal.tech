import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MASCOT_IDS } from '../../server/club/mascots.mjs';
import { MASCOT_NAMES, SHEET_CELLS } from '../../src/lib/mascots/catalog.ts';

test('every linked mascot and advertised expression sheet ships with the app', async () => {
	const manifest = JSON.parse(
		await readFile(new URL('../../static/mascots/manifest.json', import.meta.url), 'utf8')
	);
	assert.deepEqual(Object.keys(MASCOT_NAMES).sort(), [...MASCOT_IDS].sort());
	assert.deepEqual(Object.keys(manifest).sort(), [...MASCOT_IDS].sort());
	const expected = ['directions', ...Object.keys(SHEET_CELLS)].sort();
	for (const id of MASCOT_IDS) {
		assert.deepEqual([...manifest[id].signature].sort(), expected);
		for (const sheet of expected) {
			const bytes = await readFile(
				new URL(`../../static/mascots/${id}/signature/${sheet}.webp`, import.meta.url)
			);
			assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
			assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
			assert.ok(bytes.length > 1000, `${id}/${sheet} contains a real atlas`);
		}
	}
});

test('expression names map to nine unique cells per atlas', () => {
	const expressions = Object.values(SHEET_CELLS).flat();
	for (const cells of Object.values(SHEET_CELLS)) assert.equal(cells.length, 9);
	assert.equal(new Set(expressions).size, expressions.length);
});
