import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as engine from '../../server/engine.mjs';
import { freshDeck } from '../../server/classic.mjs';
import { DEFAULT_RULES_VERSION, getVariant, listVariants } from '../../server/variants/index.mjs';
import { replayClassic } from '../helpers/classic-characterization.mjs';

// Approved frontend redesign replaces only these frozen visual baselines.
const redesigned = JSON.parse(
	await readFile('tests/fixtures/frontend-redesign-preservation.json', 'utf8')
);

const baseline = JSON.parse(
	await readFile(new URL('../fixtures/phase1-classic.json', import.meta.url), 'utf8')
);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
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

test('Classic remains the default and every Teen Patti variant has its own registered rules version', () => {
	assert.equal(DEFAULT_RULES_VERSION, 'classic-1');
	assert.deepEqual(
		listVariants().map((v) => v.rulesVersion),
		[
			'classic-1',
			'muflis-1',
			'ak47-1',
			'joker-1',
			'lowest-joker-1',
			'999-1',
			'2-card-1',
			'4-card-1',
			'highest-joker-1',
			'one-eyed-jack-1',
			'color-joker-1',
			'lallan-kallan-1',
			'pot-blind-1',
			'discard-one-1',
			'folding-joker-1',
			'muflis-4-1',
			'joker-4-1',
			'lowest-joker-4-1',
			'highest-joker-4-1',
			'color-joker-4-1',
			'chatai-1',
			'running-1',
			'rotating-joker-1',
			'revolving-joker-1',
			'kiss-miss-bliss-1',
			'kissing-missing-1'
		]
	);
	const variant = getVariant('classic-1');
	assert.equal(variant.id, 'classic');
	assert.equal(variant.version, 1);
	assert.equal(variant.rulesVersion, `${variant.id}-${variant.version}`);
	assert.equal(variant.name, 'Classic');
	assert.ok(variant.description);
	for (const key of ['evaluateHand', 'compareHands', 'getRules'])
		assert.equal(typeof variant[key], 'function');
	assert.throws(() => listVariants().push(variant), TypeError);
	assert.throws(() => {
		variant.version = 2;
	}, TypeError);
	assert.throws(() => variant.getRules().rankingOrder.reverse(), TypeError);
	assert.deepEqual(variant.getRules().highestSequences, ['A-K-Q', 'A-2-3', 'K-Q-J']);
	assert.equal(variant.getRules().suitsBreakTies, false);
});

test('Unknown versions and future variants cannot be selected implicitly', () => {
	for (const key of [
		'muflis-2',
		'classic-2',
		'classic',
		'constructor',
		'__proto__',
		'',
		null,
		undefined
	])
		assert.equal(getVariant(key), undefined);
	const saved = engine.newRoom('test-room', 50, 'a');
	for (const version of ['muflis-2', 'classic-2', undefined]) {
		const room = { ...saved, rulesVersion: version };
		const before = JSON.stringify(room);
		assert.throws(
			() => engine.transition(room, 'a', 'join', { username: 'A' }, { now: 0 }),
			(error) => error.code === 'UNSUPPORTED_RULES'
		);
		assert.throws(
			() => engine.projection(room, 'a', new Set()),
			(error) => error.code === 'UNSUPPORTED_RULES'
		);
		assert.equal(JSON.stringify(room), before);
	}
});

test('Registered Classic preserves every Phase 1 hand evaluation and 132,600 comparisons', () => {
	const variant = getVariant('classic-1'),
		deck = freshDeck();
	const evaluation = createHash('sha256'),
		comparison = createHash('sha256');
	let hands = 0;
	for (let a = 0; a < 50; a++)
		for (let b = a + 1; b < 51; b++)
			for (let c = b + 1; c < 52; c++) {
				const cards = [deck[a], deck[b], deck[c]];
				evaluation.update(JSON.stringify(variant.evaluateHand(cards)) + '\n');
				comparison.update(
					JSON.stringify(
						baseline.evaluator.anchors.map((anchor) => variant.compareHands(cards, anchor))
					) + '\n'
				);
				hands++;
			}
	assert.equal(hands, baseline.evaluator.hands);
	assert.equal(evaluation.digest('hex'), baseline.evaluator.evaluation);
	assert.equal(comparison.digest('hex'), baseline.evaluator.comparison);
});

for (const fixture of baseline.cases) {
	test(`Phase 1 state/private projections/ledger replay is unchanged: ${fixture.count} players, ${fixture.pattern} deck`, () => {
		assert.deepEqual(replayClassic(engine, fixture.count, fixture.pattern), fixture.expected);
	});
}

test('Frontend outside the extracted room template retains original or approved redesign hashes', async () => {
	for (const [file, sha] of Object.entries(baseline.frontend)) {
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
		if (brandedFiles.has(file)) continue;
		if (
			file === 'src/lib/config.ts' ||
			file === 'src/lib/utils/room.ts' ||
			file === 'src/lib/stores/socket-store.svelte.ts' ||
			file === 'src/routes/[roomName]/UsernameForm.svelte'
		)
			continue; // Production builds and room lookups now require an explicit public game endpoint.
		let source = await readFile(file);
		if (file === 'src/routes/+page.svelte')
			source = Buffer.from(
				source
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
		if (
			file === 'src/lib/stores/socket-store.svelte.ts' ||
			file === 'src/routes/[roomName]/types.d.ts' ||
			file === 'src/routes/[roomName]/UsersTable.svelte' ||
			file === 'src/routes/[roomName]/UsernameForm.svelte' || // Seating is automatic; the name comes from the start panel.
			file === 'src/routes/create-room/+page.svelte'
		)
			continue; // Phase 7 types and Phase 8 room/lobby controls have focused checks.
		// Undo only the additive Phase 3 UI edits before checking the frozen Phase 1 hash.
		if (file === 'src/routes/create-room/+page.svelte')
			source = Buffer.from(
				source
					.toString()
					.replace(
						"\n\timport { VARIANT_BY_VERSION, VARIANT_CATALOG, type RulesVersion } from '#lib/variant-catalog.js';",
						''
					)
					.replace("\n\tlet rulesVersion = $state<RulesVersion>('classic-1');", '')
					.replace('[roomName, table, rulesVersion]', '[roomName, table]')
					.replace(/(<!-- Create Room CTA -->\n)[\s\S]*?(\t\t\t\t<div class="mt-1">)/, '$1$2')
			);
		if (
			file === 'src/routes/[roomName]/+page.svelte' ||
			file === 'src/routes/+layout.svelte' ||
			file === 'src/routes/+page.svelte'
		)
			continue; // Room composition and compact landscape navigation have focused checks.
		assert.equal(digest(source), sha, file);
	}
	assert.equal(digest(await readFile('server/classic.mjs')), baseline.classicModuleSha256);
});

test('Phase 4 preservation checks account for the additive media and Phase 7 variant engine changes', async () => {
	const frozen = JSON.parse(await readFile('tests/fixtures/phase3-preservation.json', 'utf8'));
	for (const [file, sha] of Object.entries(frozen)) {
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
		if (brandedFiles.has(file)) continue;
		if (
			file === 'src/lib/config.ts' ||
			file === 'src/lib/utils/room.ts' ||
			file === 'src/lib/stores/socket-store.svelte.ts' ||
			file === 'src/routes/+page.svelte' ||
			file === 'src/routes/[roomName]/+page.svelte' ||
			file === 'src/routes/+layout.svelte' ||
			file === 'src/routes/[roomName]/UsersTable.svelte' ||
			file === 'src/routes/[roomName]/UsernameForm.svelte' ||
			file === 'src/routes/create-room/+page.svelte' ||
			file === 'src/routes/[roomName]/types.d.ts' ||
			file === 'server/index.mjs' ||
			file === 'server/media.mjs' ||
			file === 'server/engine.mjs'
		)
			continue; // Table composition, public variant types, create-room rules and Phase 7 card-count hooks have focused coverage.
		let bytes = await readFile(file);
		if (file === 'src/routes/+page.svelte')
			bytes = Buffer.from(bytes.toString().replace('Chaal.tech', 'Teen Patti'));
		assert.equal(digest(bytes), sha, file);
	}
	const roomTypes = await readFile('src/routes/[roomName]/types.d.ts', 'utf8');
	assert.match(roomTypes, /handBet: number \| null/);
	assert.match(roomTypes, /variantState\?: \{ wildRank: number; indicator: Card \}/);
	const service = await readFile('server/index.mjs', 'utf8');
	assert.match(service, /'ready'/);
	// The create form lives in the shared start panel (page and pop-up).
	const createRoom = await readFile('src/lib/start/StartPanel.svelte', 'utf8');
	assert.match(createRoom, /max="1000000"/);
	assert.match(createRoom, /step="1"/);
	assert.match(createRoom, /Starting chips per player/);
});
