import test from 'node:test';
import assert from 'node:assert/strict';
import {
	priorFromRates,
	priorFromSession,
	teenPattiPrior,
	combineCounters,
	seedMinds,
	SEED_CAP,
	LTM_VERSION,
	ltmRosterKey,
	memoryBotIds,
	priorsForTable
} from '../../server/bots/memory/prior.mjs';
import { emptyMind, seedPrior, beliefs, updateMind } from '../../server/bots/mind.mjs';
import { estimate, DAY } from '../../server/bots/memory/model.mjs';
import { botSeatPayload } from '../../server/bots/runner.mjs';
import { finishCapture } from '../../server/analytics/recorder.mjs';
import { runTable } from '../../server/sim/table.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti } from './helpers/drivers.mjs';

/* Phase 5: long-term memory as a returning-player prior (docs/bots/PHASE5_REPORT.md). */

const NOW = 1_800_000_000_000;
const counter = (action, n, k, hands, ago = 0) => ({
	action,
	n,
	k,
	hands,
	rn: n,
	rk: k,
	lastObserved: NOW - ago,
	lastHand: null
});
const doc = (variant, playerId, metrics) => ({
	botId: 'ms-dhoni',
	game: 'teen-patti',
	variant,
	models: [{ playerId, hands: 40, metrics }]
});

test('a prior is bounded: at most SEED_CAP pseudo-observations per belief, none without evidence', () => {
	const p = priorFromRates(
		{
			foldToRaise: { rate: 0.8, confidence: 5 },
			givesUp: { rate: 0.4, confidence: 1 },
			raiseShare: { rate: 0.5, confidence: 1 }
		},
		NOW
	);
	assert.equal(p.v, LTM_VERSION);
	assert.equal(p.counts.facing, SEED_CAP);
	assert.equal(p.counts.facingPack, 8);
	assert.equal(p.counts.packs + p.counts.raises + p.counts.chaals, SEED_CAP);
	assert.equal(priorFromRates({}, NOW), null);
	assert.equal(priorFromRates({ foldToRaise: { rate: 0.5, confidence: 0 } }, NOW), null);
});

test('memory across variants combines, fades with time, and stays weak with little evidence', () => {
	const a = counter('fold', 30, 21, 20);
	const b = counter('fold', 20, 14, 12, 7 * DAY);
	const c = combineCounters([a, b], NOW);
	assert.equal(c.n, 50);
	assert.equal(c.k, 35);
	assert.equal(c.hands, 32);
	const e = estimate(c, NOW);
	assert.ok(e.confidence > 0 && e.confidence < 0.3, String(e.confidence));
	const docs = [
		doc('classic-1', 'p1', {
			'pressure:fold': a,
			'all:fold': counter('fold', 60, 18, 20),
			'all:raise': counter('raise', 60, 12, 20),
			'all:call': counter('call', 60, 30, 20)
		}),
		doc('ak47-1', 'p1', { 'pressure:fold': b })
	];
	const prior = teenPattiPrior(docs, 'p1', NOW);
	assert.ok(prior.counts.facing > 0 && prior.counts.facing <= SEED_CAP);
	assert.ok(prior.counts.facingPack / prior.counts.facing > 0.55, 'they fold to raises often');
	assert.equal(teenPattiPrior(docs, 'someone-else', NOW), null);
	// Old memory counts for less than fresh memory of the same play.
	const stale = teenPattiPrior(
		docs.map((d) => structuredClone(d)),
		'p1',
		NOW + 120 * DAY
	);
	assert.ok(stale.weight.foldToRaise < prior.weight.foldToRaise);
});

test('seeding: once per session, moves beliefs toward the memory, and new evidence overrides it', () => {
	const prior = priorFromRates({ foldToRaise: { rate: 0.9, confidence: 1 } }, NOW);
	const mind = emptyMind(1);
	seedPrior(mind, 'p1', 'human', prior);
	const before = beliefs(mind, 'p1').foldToRaise;
	assert.ok(before.p > 0.5 && before.n === SEED_CAP);
	seedPrior(mind, 'p1', 'human', prior);
	assert.equal(beliefs(mind, 'p1').foldToRaise.n, SEED_CAP, 'a second seed is ignored');
	// The session then sees this player never fold to a raise.
	const m = mind.others.p1.model;
	for (let i = 0; i < 40; i++) {
		m.facing = m.facing * 0.985 + 1;
		m.facingPack *= 0.985;
	}
	assert.ok(beliefs(mind, 'p1').foldToRaise.p < 0.25, 'new evidence overrides the memory');
	void updateMind;
});

test('seedMinds is pure and only touches seated characters with a mind', () => {
	const prior = priorFromRates({ givesUp: { rate: 0.6, confidence: 0.5 } }, NOW);
	const minds = { 'bot-a': emptyMind(1) };
	const frozen = JSON.stringify(minds);
	const next = seedMinds(
		minds,
		{ 'bot-a': { p1: prior }, 'bot-gone': { p1: prior } },
		seedPrior,
		() => 'human'
	);
	assert.equal(JSON.stringify(minds), frozen);
	assert.ok(next['bot-a'].others.p1.ltm);
	assert.equal(next['bot-gone'], undefined);
	assert.equal(
		seedMinds(minds, null, seedPrior, () => 'human'),
		minds
	);
});

test('a hand dealt with seeded minds is recorded with them and replays exactly', () => {
	const sim = teenPattiTable({ seed: 91, humans: ['a'] });
	sim.act('a', 'addBot', botSeatPayload(sim.room, 'ms-dhoni', 'bot-ltm-dhoni', Math.random));
	sim.act('a', 'addBot', botSeatPayload(sim.room, 'samay-raina', 'bot-ltm-samay', Math.random));
	const prior = priorFromRates(
		{ foldToRaise: { rate: 0.85, confidence: 1 }, givesUp: { rate: 0.5, confidence: 1 } },
		NOW
	);
	sim.priors = { 'bot-ltm-dhoni': { a: prior }, 'bot-ltm-samay': { a: prior } };
	for (let hand = 0; hand < 3; hand++) {
		dealTeenPatti(sim);
		playTeenPatti(sim, { packBias: 0.1 });
	}
	const captures = sim.captures();
	assert.ok(captures.length >= 3);
	const first = captures[0].hand.steps[0];
	assert.ok(first.minds['bot-ltm-dhoni'].others.a.ltm, 'the deal records the seeded mind');
	for (const capture of captures) {
		const finished = finishCapture(capture);
		assert.ok(finished.ok, finished.failure?.detail?.message);
		for (const t of finished.records.sealed.botTrace) assert.equal(t.verified, 'reproduced');
	}
});

test('without priors nothing changes: the simulator plays exactly as before', () => {
	const spec = {
		seed: 5,
		table: 1,
		seats: ['ms-dhoni@4', 'legacy-hard', 'gg@4', 'legacy-easy'],
		hands: 20,
		matched: true
	};
	const a = runTable(spec);
	const b = runTable({ ...spec, priors: {} });
	assert.deepEqual(
		b.map((h) => h.decisions.map((d) => [d.seat, d.name])),
		a.map((h) => h.decisions.map((d) => [d.seat, d.name]))
	);
	const s = priorFromSession(a.minds['bot-seat-0'].others['bot-seat-1'].model);
	assert.ok(s === null || s.counts.facing <= SEED_CAP);
});

test('the table: who has memory, when to reload it, and priors only for people', () => {
	const style = (botId, policy) => ({ botId, policy });
	const room = {
		gameType: 'teen-patti',
		players: [
			{ id: 'a', seatNumber: 0, departed: false },
			{ id: 'bot-1', seatNumber: 1, departed: false, bot: { style: style('ms-dhoni', 'tp-dna@8') } },
			{ id: 'bot-2', seatNumber: 2, departed: false, bot: { style: style('legacy', 'tp-heuristic@1') } },
			{ id: 'b', seatNumber: null, departed: true }
		]
	};
	assert.deepEqual(memoryBotIds(room), ['ms-dhoni']);
	const key = ltmRosterKey(room);
	assert.ok(key.includes('bot-1:ms-dhoni') && key.endsWith('|,a'));
	assert.equal(ltmRosterKey({ ...room, gameType: 'three-two-five' }), null);
	assert.equal(ltmRosterKey({ ...room, players: room.players.filter((p) => p.bot) }), null);
	const docs = [
		doc('classic-1', 'a', {
			'pressure:fold': counter('fold', 80, 60, 70),
			'all:fold': counter('fold', 120, 40, 70)
		}),
		doc('classic-1', 'bot-2', { 'pressure:fold': counter('fold', 80, 10, 70) })
	];
	const priors = priorsForTable(room, docs, NOW);
	assert.deepEqual(Object.keys(priors), ['bot-1']);
	assert.deepEqual(Object.keys(priors['bot-1']), ['a'], 'people only');
	assert.deepEqual(priorsForTable(room, null, NOW), {});
});
