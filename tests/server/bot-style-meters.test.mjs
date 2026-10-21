import test from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';
import { METERS, STYLE_METERS } from '../../src/lib/bots/style-meters.js';

test('Bots page style meters match each canonical character DNA', () => {
	assert.deepEqual(Object.keys(STYLE_METERS).sort(), Object.keys(CANONICAL_STYLES).sort());
	for (const [id, style] of Object.entries(CANONICAL_STYLES))
		for (const m of METERS)
			assert.ok(
				Math.abs(STYLE_METERS[id][m.key] - style.tendencies.dna[m.trait]) <= 0.005,
				`${id} ${m.key}: page ${STYLE_METERS[id][m.key]}, DNA ${style.tendencies.dna[m.trait]}`
			);
});
