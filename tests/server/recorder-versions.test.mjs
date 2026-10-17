import test from 'node:test';
import assert from 'node:assert/strict';
import { listVariants } from '../../server/variants/index.mjs';
import { GAME_VERSIONS, replayUnavailable } from '../../server/games/versions.mjs';
import { finishCapture, replayHand, semanticHash } from '../../server/analytics/recorder.mjs';
import { BUILD_PATTERN, engineBuild } from '../../server/cloudflare/build.mjs';
import { buildId } from '../../scripts/deploy-backend.mjs';
import { readCorpus, corpusKey } from '../../scripts/replay-corpus.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti } from './helpers/drivers.mjs';

/* --------------------------------------- replay corpus --------------------------------------- */

const corpus = readCorpus();

test('every hand in the replay corpus still replays (exactly, or compatibly)', () => {
	assert.ok(corpus.hands.length >= 29);
	for (const capture of corpus.hands) {
		const key = corpusKey(capture.hand.versions);
		const unavailable = replayUnavailable(capture.hand.versions);
		assert.equal(
			unavailable,
			null,
			`${key}: this code no longer implements a version that recorded hands use. Keep the old implementation replayable, or accept that those hands become unavailable.`
		);
		const finished = finishCapture(capture);
		assert.ok(
			finished.ok,
			`${key}: a code change altered recorded hands (${finished.failure?.detail?.message}). Do not change an existing game or variant version: add a new version (GAME_VERSIONS, or a new rulesVersion) and keep the old one.`
		);
		assert.ok(['exact', 'compatible'].includes(finished.records.public.verified.replay));
		for (const trace of finished.records.sealed.botTrace) assert.equal(trace.verified, 'reproduced', `${key}: bot decision`);
	}
});

test('the corpus covers every game and variant version this code implements', () => {
	const covered = new Set(corpus.hands.map((h) => corpusKey(h.hand.versions)));
	for (const variant of listVariants())
		assert.ok(
			covered.has(`teen-patti@${GAME_VERSIONS['teen-patti']}|${variant.rulesVersion}|${variant.id}@${variant.version}`),
			`no corpus hand for ${variant.rulesVersion}: run npm run analytics:corpus`
		);
	for (const game of Object.keys(GAME_VERSIONS).filter((g) => g !== 'teen-patti'))
		assert.ok([...covered].some((key) => key.startsWith(`${game}@${GAME_VERSIONS[game]}|`)), `no corpus hand for ${game}`);
});

/* -------------------------------------- recorded versions ------------------------------------- */

function oneHand(seed = 1, options = {}) {
	const sim = teenPattiTable({ seed, bots: ['hard'], ...options });
	dealTeenPatti(sim);
	playTeenPatti(sim);
	return { sim, capture: sim.captures()[0] };
}

test('every hand records its engine, game, rules, variant, recorder and bot policy versions', () => {
	const { capture } = oneHand(3);
	const { records } = finishCapture(capture);
	assert.deepEqual(records.public.versions, {
		engine: 'test-build',
		recorder: 2,
		game: 'teen-patti',
		gameVersion: 1,
		rulesVersion: 'classic-1',
		variant: { id: 'classic', version: 1 }
	});
	assert.deepEqual(records.sealed.versions, records.public.versions);
	assert.equal(records.public.seats.find((s) => s.bot).bot.policy, 'tp-heuristic@1');
});

test('a hand this code cannot replay is reported unavailable, kept raw, and never approximated', () => {
	const { capture } = oneHand(5);
	const cases = [
		[{ gameVersion: 99 }, /game-version-unavailable:teen-patti@99/],
		[{ rulesVersion: 'classic-9' }, /rules-unavailable:classic-9/],
		[{ variant: { id: 'classic', version: 2 } }, /variant-version-unavailable:classic@2/],
		[{ engine: null }, /engine-build-missing/],
		[{ game: 'baccarat' }, /game-unavailable:baccarat/]
	];
	for (const [change, reason] of cases) {
		const old = structuredClone(capture);
		Object.assign(old.hand.versions, change);
		const result = finishCapture(old);
		assert.equal(result.ok, false);
		assert.equal(result.failure.reason, 'replay-unavailable');
		assert.match(result.failure.detail.unavailable, reason);
		assert.equal(result.raw.status, 'replay-unavailable', 'the inputs are kept for code that can replay them');
		assert.deepEqual(result.raw.capture.hand.steps, old.hand.steps);
	}
});

test('a refactor that changes bookkeeping but not the game replays as "compatible"; a rule change does not', () => {
	const { capture } = oneHand(7);
	const refactored = structuredClone(capture);
	// As if the old engine stored an extra field in every snapshot: exact hashes differ.
	for (const step of refactored.hand.steps) step.h = `${step.h.slice(0, 15)}0`;
	const result = finishCapture(refactored);
	assert.ok(result.ok);
	assert.equal(result.records.public.verified.replay, 'compatible');

	const changed = structuredClone(refactored);
	changed.hand.steps[2].s = 'ffffffffffffffff'; // the game itself differs at step 2
	const mismatch = finishCapture(changed);
	assert.equal(mismatch.ok, false);
	assert.equal(mismatch.failure.reason, 'replay-mismatch');
	assert.equal(mismatch.failure.detail.step, 2);
	assert.equal(mismatch.raw.status, 'replay-mismatch');
});

test('the semantic hash sees chips, cards and turns, and ignores bookkeeping', () => {
	const { sim } = oneHand(9);
	const room = structuredClone(sim.room);
	const base = semanticHash(room);
	assert.equal(semanticHash({ ...room, revision: room.revision + 7, deadline: 1 }), base);
	const richer = structuredClone(room);
	richer.players[0].balance += 1;
	assert.notEqual(semanticHash(richer), base);
	const otherCards = structuredClone(room);
	otherCards.players[0].cards = [...otherCards.players[0].cards].reverse();
	assert.notEqual(semanticHash(otherCards), base);
});

test('bot decisions replay from one seed; a wrong seed or draw count is caught', () => {
	const { capture } = oneHand(11);
	const botStep = capture.hand.steps.findIndex((s) => s.kind === 'bot');
	assert.ok(botStep > 0);
	assert.equal(capture.hand.steps[botStep].bot.seed.length, 4);
	const wrongSeed = structuredClone(capture);
	wrongSeed.hand.steps[botStep].bot.seed = [1, 2, 3, 4];
	const wrongCount = structuredClone(capture);
	wrongCount.hand.steps[botStep].bot.draws += 1;
	const count = finishCapture(wrongCount);
	assert.equal(count.ok, false, 'a wrong draw count is always caught');
	assert.match(count.failure.detail.message, /not reproducible|draws/);
	// A different seed is caught unless it happens to produce the same move from the same draws.
	const seed = finishCapture(wrongSeed);
	if (!seed.ok) assert.match(seed.failure.detail.message, /not reproducible|draws/);
	assert.throws(() => replayHand(wrongCount.hand.preDeal, wrongCount.hand.steps, { bots: wrongCount.hand.bots }));
});

/* ----------------------------------------- build ids ----------------------------------------- */

test('the engine build id is a commit (or explicit dev/test), never "unknown"', () => {
	for (const ok of ['0506611', '05066112abcd', '05066112abcd-dirty-lx3k9a', 'dev', 'test']) assert.match(ok, BUILD_PATTERN);
	for (const bad of ['unknown', '', 'main', '05066', 'HEAD', '0506611 ', '0506611-dirty']) assert.doesNotMatch(bad, BUILD_PATTERN);
	assert.equal(engineBuild({}), null);
	assert.equal(engineBuild({ ENGINE_BUILD: 'unknown' }), null);
	assert.equal(engineBuild({ ENGINE_BUILD: '05066112abcd' }), '05066112abcd');
	assert.equal(buildId({ sha: '05066112abcd', dirty: false }), '05066112abcd');
	assert.throws(() => buildId({ sha: '05066112abcd', dirty: true }), /Uncommitted changes/);
	assert.match(buildId({ sha: '05066112abcd', dirty: true, allowDirty: true, now: 1_700_000_000_000 }), /^05066112abcd-dirty-[0-9a-z]+$/);
	assert.throws(() => buildId({ sha: 'not-a-sha', dirty: false }), /Not a git commit/);
});

test('a hand recorded without a valid build becomes an explicit failure, not "unknown"', () => {
	const sim = teenPattiTable({ seed: 13 });
	sim.engine = null;
	dealTeenPatti(sim);
	playTeenPatti(sim);
	const result = finishCapture(sim.captures()[0]);
	assert.equal(result.ok, false);
	assert.equal(result.failure.detail.unavailable, 'engine-build-missing');
});

/* --------------------------------------- observer presence ------------------------------------- */

test('a late reveal is observed only by those connected (and bots), never by absent players', () => {
	const sim = teenPattiTable({ seed: 15, bots: ['normal'] });
	dealTeenPatti(sim);
	const folder = sim.room.currentPlayerId === 'a' ? 'a' : sim.room.currentPlayerId;
	sim.act(folder, 'pack');
	playTeenPatti(sim);
	const away = ['a', 'b', 'c'].find((id) => id !== folder);
	sim.connected.delete(away);
	sim.act(folder, 'reveal');
	const reveal = sim.rows.find((row) => row.payload.type === 'reveal').payload.entry;
	assert.ok(!reveal.observedBy.includes(away), 'a disconnected player did not see it');
	assert.deepEqual(reveal.absent, [away]);
	assert.ok(reveal.observedBy.some((id) => id.startsWith('bot-')), 'seated bots are present');
	assert.ok(!reveal.observedBy.includes(folder));
});

test('cards shown during a hand list who was actually present to see them', () => {
	const sim = teenPattiTable({ seed: 17, humans: ['a', 'b', 'c'], options: { potLimit: 64 } });
	dealTeenPatti(sim);
	sim.connected.delete('c');
	playTeenPatti(sim, { packBias: 0 });
	const { records } = finishCapture(sim.captures()[0]);
	assert.ok(records.public.shown.length);
	for (const entry of records.public.shown) {
		assert.ok(!entry.observedBy.includes('c'));
		if (entry.p !== 'c') assert.ok(entry.absent.includes('c'));
	}
});
