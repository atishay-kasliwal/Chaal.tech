import test from 'node:test';
import assert from 'node:assert/strict';
import { listVariants } from '../../server/variants/index.mjs';
import { playing } from '../../server/engine.mjs';
import { PROFILES } from '../../server/bots/strategy.mjs';
import { LEGACY_STYLES, STYLES, identityForLevel } from '../../server/bots/identity.mjs';
import {
	finishCapture,
	replayHand,
	recordCommitSafely,
	buildHandRecords,
	stepRecorder,
	abandonOpenHand
} from '../../server/analytics/recorder.mjs';
import { stateHash } from '../../server/analytics/recorder.mjs';
import {
	teenPattiTable,
	dealTeenPatti,
	playTeenPatti,
	holdemTable,
	playHoldem,
	blackjackTable,
	playBlackjack,
	rummyTable,
	playRummy
} from './helpers/drivers.mjs';

/**
 * Acceptance: every recorded hand replays to the identical state at every step, every input is
 * kept, and the derived outcome agrees with the room's own result and chip movements.
 */
function assertRecordedExactly(sim, { expectHands } = {}) {
	assert.deepEqual(sim.failures, [], 'the recorder never throws');
	const failures = sim.rows.filter((row) => row.payload.type === 'failure');
	assert.deepEqual(failures.map((row) => row.payload.reason), [], 'no failure rows');
	const captures = sim.captures();
	if (expectHands !== undefined) assert.equal(captures.length, expectHands, 'one capture per hand');
	const records = [];
	for (const capture of captures) {
		const finished = finishCapture(capture);
		assert.ok(finished.ok, finished.failure?.detail?.message);
		const { public: record, private: privates, sealed } = finished.records;
		const steps = capture.hand.steps;

		// 1. Deterministic replay: every state hash matches the committed state.
		const states = replayHand(capture.hand.preDeal, steps, { bots: capture.hand.bots });
		steps.forEach((step, i) => assert.equal(stateHash(JSON.stringify(states[i + 1])), step.h, `step ${i}`));
		const last = sim.log.find((entry) => entry.rev === steps.at(-1).rev);
		assert.ok(last, 'the final step is a real commit');

		// 2. Completeness: the steps are exactly the commits from the deal to the end, in order.
		const first = sim.log.findIndex((entry) => entry.rev === steps[0].rev);
		const committed = sim.log.slice(first, first + steps.length);
		assert.deepEqual(steps.map((s) => s.rev), committed.map((c) => c.rev), 'no commit is missing');
		assert.deepEqual(steps.map((s) => s.action), committed.map((c) => c.action));

		// 3. Chip movements per event equal the live balance changes.
		for (const event of record.events.filter((e) => e.sub === undefined))
			assert.deepEqual(event.chips, committed[event.i].chips, `chips at event ${event.i}`);

		// 4. Winners and nets agree with the final state; human/bot pots are zero-sum.
		const final = states.at(-1);
		const result = final.result;
		if (result && record.gameType !== 'blackjack' && record.outcome.reason !== 'abandoned') {
			const total = record.outcome.players.reduce((sum, p) => sum + p.net, 0);
			assert.equal(total, 0, 'nets sum to zero');
		}
		for (const p of record.outcome.players) {
			const seat = record.seats.find((s) => s.p === p.p);
			assert.ok(seat, 'every outcome has a seat');
			if (p.exit === 'won') assert.ok(record.outcome.winners.some((w) => w.p === p.p));
			const flowsIn = record.flows.filter((f) => f.to === p.p).reduce((s, f) => s + f.amt, 0);
			const flowsOut = record.flows.filter((f) => f.from === p.p).reduce((s, f) => s + f.amt, 0);
			if (result) assert.ok(Math.abs(flowsIn - flowsOut - p.net) < 0.05 * (record.seats.length + 1), `flows explain ${p.p}`);
		}

		// 5. Tiers are complete and consistent.
		assert.equal(privates.length, record.seats.length, 'one private record per participant');
		assert.equal(sealed.steps.length, steps.length);
		assert.equal(record.verified.replay, 'exact');
		assert.equal(record.events.filter((e) => e.sub === undefined).length, steps.length, 'one event per input');
		records.push({ record, privates, sealed, states });
	}
	return records;
}

test('every Teen Patti variant records hands that replay exactly, with humans and bots', () => {
	const variants = listVariants();
	assert.equal(variants.length, 26);
	for (const [index, variant] of variants.entries()) {
		for (const seed of [index * 7 + 1, index * 7 + 2]) {
			const sim = teenPattiTable({ seed, rulesVersion: variant.rulesVersion, bots: seed % 2 ? ['hard'] : ['easy', 'normal'] });
			dealTeenPatti(sim, variant.rulesVersion);
			playTeenPatti(sim);
			dealTeenPatti(sim, variant.rulesVersion);
			playTeenPatti(sim, { packBias: 0.05 });
			const records = assertRecordedExactly(sim, { expectHands: 2 });
			for (const { record } of records) assert.equal(record.rulesVersion, variant.rulesVersion);
		}
	}
});

test("Hold'em hands with all-ins and side pots replay exactly", () => {
	for (const seed of [3, 4, 5, 6, 7, 8]) {
		const sim = holdemTable({ seed, players: ['a', 'b', 'c', 'd'], stacks: [1000, 300, 120, 700] });
		playHoldem(sim, { allInBias: 0.3 });
		playHoldem(sim);
		const records = assertRecordedExactly(sim, { expectHands: 2 });
		for (const { record } of records) {
			assert.equal(record.gameType, 'texas-holdem');
			assert.ok(record.events.some((e) => e.decision?.street), 'streets are recorded');
			assert.ok(record.table.board.length <= 5);
		}
	}
});

test('Blackjack hands, including doubles and timeouts, replay exactly', () => {
	for (const seed of [11, 12, 13, 14]) {
		const sim = blackjackTable({ seed, players: ['a', 'b', 'c'] });
		playBlackjack(sim, { timeoutBias: 0.2 });
		playBlackjack(sim);
		const records = assertRecordedExactly(sim, { expectHands: 2 });
		for (const { record } of records)
			assert.ok(record.flows.every((f) => f.from === 'dealer' || f.to === 'dealer'), 'Blackjack is against the dealer');
	}
});

test('Indian Rummy rounds replay exactly, including a recycled stock and players leaving', () => {
	const sim = rummyTable({ seed: 21, players: ['a', 'b'] });
	playRummy(sim, { turns: 260 });
	const [{ record, sealed }] = assertRecordedExactly(sim, { expectHands: 1 });
	assert.ok(sealed.steps.some((s) => s.ctx.recycledDeck), 'the recycled stock is part of the replay input');
	assert.ok(record.events.some((e) => e.a === 'leave'));
	const short = rummyTable({ seed: 22 });
	playRummy(short, { turns: 6 });
	assertRecordedExactly(short, { expectHands: 1 });
});

test('timeouts while disconnected are system events with the connection state kept', () => {
	const sim = teenPattiTable({ seed: 31 });
	dealTeenPatti(sim);
	const absent = sim.room.currentPlayerId;
	sim.connected.delete(absent);
	sim.timeout();
	sim.connected.add(absent);
	playTeenPatti(sim);
	const [{ record }] = assertRecordedExactly(sim, { expectHands: 1 });
	const timeout = record.events.find((e) => e.a === 'timeout');
	assert.equal(timeout.kind, 'system');
	assert.equal(timeout.cause, 'timeout');
	assert.equal(timeout.decision, undefined, 'a timeout is not a decision');
	assert.ok(!timeout.connected.includes(absent));
	assert.equal(record.outcome.players.find((p) => p.p === absent).exit, 'timeout');
});

test('pot-limit forced shows and Running knock-outs are recorded as consequences', () => {
	const capped = teenPattiTable({ seed: 41, options: { potLimit: 64 } });
	dealTeenPatti(capped);
	playTeenPatti(capped, { packBias: 0 });
	const [{ record }] = assertRecordedExactly(capped, { expectHands: 1 });
	assert.match(record.outcome.reason, /pot-limit/);
	assert.ok(record.events.some((e) => e.a === 'result' && /pot-limit/.test(e.cause)));
	assert.ok(record.shown.length >= 2, 'a forced show reveals the contenders');

	let knocked = false;
	for (let seed = 50; seed < 90 && !knocked; seed++) {
		const sim = teenPattiTable({ seed, rulesVersion: 'running-1', humans: ['a', 'b', 'c', 'd'] });
		dealTeenPatti(sim, 'running-1');
		playTeenPatti(sim, { packBias: 0 });
		const [{ record: running }] = assertRecordedExactly(sim, { expectHands: 1 });
		knocked = running.events.some((e) => e.a === 'knock-out');
	}
	assert.ok(knocked, 'some Running hand knocks a player out');
});

test('lending mid-hand, leaving mid-hand and hidden balances are captured', () => {
	const sim = teenPattiTable({ seed: 61, humans: ['a', 'b', 'c', 'd'] });
	// d arrives short of chips from earlier play (moved, not created).
	sim.patchRoom((room) => {
		const d = room.players.find((p) => p.id === 'd');
		room.players.find((p) => p.id === 'a').balance += d.balance - 60;
		d.balance = 60;
	});
	sim.act('b', 'setBalanceHidden', { hidden: true });
	dealTeenPatti(sim);
	sim.act('d', 'requestChips', { to: 'a', amount: sim.view('d').chipRequestAmounts?.[0] ?? 100 }, {});
	sim.act('a', 'answerChipRequest', { from: 'd', accept: true });
	const leaver = sim.room.players.find((p) => p.id === 'c');
	sim.act(leaver.id, 'leave');
	playTeenPatti(sim);
	const [{ record, sealed }] = assertRecordedExactly(sim, { expectHands: 1 });
	const loan = record.events.find((e) => e.raw === 'answerChipRequest');
	assert.ok(loan.chips.a < 0 && loan.chips.d > 0, 'the loan moves chips between friends');
	const borrower = record.outcome.players.find((p) => p.p === 'd');
	const finalBalance = sim.room.players.find((p) => p.id === 'd').balance;
	assert.equal(borrower.net, finalBalance - 60 - loan.chips.d, 'a loan is not a result');
	assert.equal(record.outcome.players.find((p) => p.p === 'c').exit, 'leave');
	assert.equal(record.seats.find((s) => s.p === 'b').stack, null, 'a hidden balance stays hidden');
	assert.equal(sealed.hiddenStacks['start:b'], 1000, 'and is kept in the sealed tier');
	const observer = record.observers.find((o) => o.p === 'c');
	assert.notEqual(observer.until, null, 'a player who left stopped observing');
});

test('ending the night mid-hand records a stopped hand; "after this hand" ends after it', () => {
	const now = teenPattiTable({ seed: 71 });
	dealTeenPatti(now);
	now.act(now.room.currentPlayerId, 'bet', { amount: now.view(now.room.currentPlayerId).legalActions.minBet });
	now.act('a', 'endNight', { mode: 'now' }, { ctx: { canEnd: true }, kind: 'system', cause: 'admin-end' });
	const [{ record }] = assertRecordedExactly(now, { expectHands: 1 });
	assert.equal(record.outcome.reason, 'night-ended');
	assert.ok(record.outcome.players.every((p) => p.net === 0), 'bets were refunded');
	assert.ok(now.rows.some((row) => row.payload.event?.a === 'night-ended'));

	const later = teenPattiTable({ seed: 72 });
	dealTeenPatti(later);
	later.act('a', 'endNight', { mode: 'after-hand' }, { ctx: { canEnd: true } });
	playTeenPatti(later);
	const [{ record: finished }] = assertRecordedExactly(later, { expectHands: 1 });
	assert.notEqual(finished.outcome.reason, 'night-ended');
	assert.ok(later.room.ended);
});

test('host recovery and deck seals change state outside transition() and still replay', () => {
	const sim = teenPattiTable({ seed: 81 });
	dealTeenPatti(sim);
	sim.hostRecovery('b');
	playTeenPatti(sim);
	const [{ sealed }] = assertRecordedExactly(sim, { expectHands: 1 });
	assert.ok(sealed.steps.some((s) => s.action === 'hostRecovery'));

	// A tampered seal patch is caught by the replay check.
	const capture = structuredClone(sim.captures()[0]);
	capture.hand.steps.find((s) => s.action === 'hostRecovery').payload.hostId = 'c';
	const tampered = finishCapture(capture);
	assert.equal(tampered.ok, false);
	assert.equal(tampered.failure.reason, 'replay-mismatch');
});

test('random picks inside transition() are logged draw by draw', () => {
	const sim = teenPattiTable({ seed: 91 });
	dealTeenPatti(sim);
	playTeenPatti(sim);
	const chooser = sim.room.chooser?.playerId;
	if (chooser) sim.act(chooser, 'chooseNext', { choice: 'random' });
	dealTeenPatti(sim, sim.room.upNext?.rulesVersion ?? sim.room.rulesVersion);
	playTeenPatti(sim);
	assertRecordedExactly(sim, { expectHands: 2 });
	const pickEvent = sim.rows.find((row) => row.payload.event?.a === 'chooseNext');
	if (chooser) assert.ok(pickEvent, 'the pick is a night event');
});

test('late reveals after a hand amend the public record with who saw them', () => {
	const sim = teenPattiTable({ seed: 101 });
	dealTeenPatti(sim);
	const folder = sim.room.currentPlayerId;
	sim.act(folder, 'pack');
	playTeenPatti(sim);
	sim.act(folder, 'reveal');
	const reveal = sim.rows.find((row) => row.payload.type === 'reveal');
	assert.ok(reveal);
	assert.equal(reveal.payload.entry.p, folder);
	assert.ok(!reveal.payload.entry.observedBy.includes(folder));
	assert.equal(reveal.payload.entry.cards.length, 3);
});

test('session identity: one night id, numbered hands chained to the previous one', () => {
	const sim = teenPattiTable({ seed: 111 });
	for (let n = 0; n < 3; n++) {
		dealTeenPatti(sim);
		playTeenPatti(sim);
	}
	const records = assertRecordedExactly(sim, { expectHands: 3 }).map((r) => r.record);
	assert.equal(new Set(records.map((r) => r.nightId)).size, 1);
	assert.deepEqual(records.map((r) => r.handNo), [1, 2, 3]);
	assert.equal(records[0].prevHandId, null);
	assert.equal(records[1].prevHandId, records[0]._id);
	assert.equal(records[2].prevHandId, records[1]._id);
	const nightEvents = sim.rows.filter((row) => row.payload.type === 'night-event');
	assert.ok(nightEvents.every((row) => row.payload.nightId === records[0].nightId));
	assert.ok(nightEvents.some((row) => row.payload.event.a === 'join'));
});

test('decisions carry the legal options, stakes and context needed for P(action | state)', () => {
	const sim = teenPattiTable({ seed: 121, bots: ['hard'] });
	dealTeenPatti(sim);
	playTeenPatti(sim, { packBias: 0.05 });
	const [{ record, sealed }] = assertRecordedExactly(sim, { expectHands: 1 });
	const decisions = record.events.filter((e) => e.decision);
	assert.ok(decisions.length >= 2);
	for (const e of decisions) {
		assert.ok(e.decision.legal && typeof e.decision.legal === 'object');
		assert.ok(Number.isInteger(e.decision.potBefore));
		assert.ok(['none', 'call', 'raise'].includes(e.decision.facing));
		assert.ok(Number.isInteger(e.decision.live));
	}
	const bet = decisions.find((e) => e.raw === 'bet');
	if (bet) assert.ok(bet.decision.stakeMultiple >= 1 && bet.decision.stakeMultiple <= 2);
	const botEvents = record.events.filter((e) => e.kind === 'bot');
	assert.equal(sealed.botTrace.length, botEvents.length, 'one trace per bot decision');
	for (const trace of sealed.botTrace) {
		assert.equal(trace.styleId, 'legacy-hard@1');
		assert.ok(trace.reason, 'every bot decision has a reason category');
		assert.equal(trace.verified, 'reproduced');
		assert.equal(trace.rngSeed.length, 4, 'one 128-bit seed per decision');
		assert.ok(Number.isInteger(trace.rngDraws));
	}
});

/* ---------------------------------- historical identity ---------------------------------- */

const PINNED = { easy: '8d72f3225771b158', normal: '732ba0c28529c663', hard: 'f4eb565a5fcba071' };

test('legacy styles are pinned: editing a bot profile requires publishing a new style', () => {
	// The pinned values. If this fails, PROFILES changed: publish legacy-*@2 instead of editing @1.
	assert.equal(LEGACY_STYLES.easy.configHash, PINNED.easy);
	assert.equal(LEGACY_STYLES.normal.configHash, PINNED.normal);
	assert.equal(LEGACY_STYLES.hard.configHash, PINNED.hard);
	for (const level of ['easy', 'normal', 'hard'])
		assert.deepEqual(LEGACY_STYLES[level].tendencies, { ...PROFILES[level] });
	assert.ok(Object.isFrozen(STYLES['legacy-hard@1']));
});

test('a bot seat keeps the identity it sat down with, and replay never re-interprets it', () => {
	const sim = teenPattiTable({ seed: 131, bots: ['normal'] });
	dealTeenPatti(sim);
	playTeenPatti(sim);
	const [capture] = sim.captures();
	const [botId] = Object.keys(capture.hand.bots);
	assert.deepEqual(
		{ ...capture.hand.bots[botId] },
		identityForLevel('normal'),
		'the seat resolved to botId, styleId, version, configHash and policy at add time'
	);
	const [{ record }] = assertRecordedExactly(sim, { expectHands: 1 });
	const seat = record.seats.find((s) => s.kind === 'bot');
	assert.deepEqual(seat.bot, { botId: 'legacy-normal', styleId: 'legacy-normal@1', styleVersion: 1, configHash: LEGACY_STYLES.normal.configHash, policy: 'tp-heuristic@1' });

	// A hand recorded under a style this code no longer has still replays its game exactly; its
	// bot decisions are reported as unverifiable rather than re-run with different behaviour.
	const foreign = structuredClone(capture);
	foreign.hand.bots[botId] = { ...foreign.hand.bots[botId], styleId: 'legacy-normal@7', configHash: 'ffffffffffffffff' };
	const result = finishCapture(foreign);
	assert.ok(result.ok, 'the game replays without the bot code');
	assert.ok(result.records.sealed.botTrace.every((t) => t.verified === 'policy-unavailable'));
	assert.equal(result.records.public.verified.botDecisions, 'partial');
});

/* ------------------------------------ failure safety ------------------------------------ */

test('a recorder error never changes the game and is reported, not partially recorded', () => {
	const sim = teenPattiTable({ seed: 141 });
	dealTeenPatti(sim);
	const before = JSON.stringify(sim.room);
	// A step the recorder cannot serialise (BigInt): recording fails, the commit does not.
	const broken = { actor: 'a', action: 'see', payload: { bad: 1n }, ctx: {}, kind: 'player' };
	const out = recordCommitSafely(sim.state, {
		before: JSON.parse(before),
		after: JSON.parse(before),
		afterJson: before,
		step: broken,
		now: sim.now
	});
	assert.ok(out.error);
	assert.equal(out.rows[0].payload.type, 'failure');
	assert.equal(out.rows[0].payload.reason, 'recorder-error');
	assert.equal(out.state.hand.failed, true);
	sim.state = out.state;
	sim.rows.push(...out.rows);
	playTeenPatti(sim);
	assert.equal(sim.captures().length, 0, 'the failed hand is never written partially');
	// The next hand records normally.
	dealTeenPatti(sim);
	playTeenPatti(sim);
	assert.equal(sim.captures().length, 1);
	assert.ok(finishCapture(sim.captures()[0]).ok);
});

test('the recorder does not mutate the snapshots it is given', () => {
	const sim = teenPattiTable({ seed: 151, bots: ['hard'] });
	const freeze = (value) => {
		if (value && typeof value === 'object') {
			Object.freeze(value);
			Object.values(value).forEach(freeze);
		}
		return value;
	};
	const recorder = stepRecorder({ now: sim.now, turnMs: 30000, connected: new Set(['a', 'b', 'c']) });
	const before = freeze(structuredClone(sim.room));
	const after = freeze(structuredClone(sim.room));
	assert.doesNotThrow(() =>
		recordCommitSafely(sim.state, { before, after, afterJson: JSON.stringify(after), step: recorder.step('a', 'ready', { ready: true }), now: sim.now })
	);
});

test('a capture that does not replay becomes a failure, with the step that diverged', () => {
	const sim = teenPattiTable({ seed: 161 });
	dealTeenPatti(sim);
	playTeenPatti(sim);
	const capture = structuredClone(sim.captures()[0]);
	capture.hand.steps[1].payload = { amount: 999999 };
	const result = finishCapture(capture);
	assert.equal(result.ok, false);
	assert.equal(result.failure.reason, 'replay-mismatch');
	assert.equal(result.failure.detail.step, 1);
	assert.throws(() => buildHandRecords(capture.hand), /replay|diverged|failed/i);
});

test('a table closing mid-hand files an explicit failure for the open hand', () => {
	const sim = teenPattiTable({ seed: 171 });
	dealTeenPatti(sim);
	assert.ok(playing(sim.room));
	const rows = abandonOpenHand(sim.state, sim.room.name, sim.now);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].payload.reason, 'room-closed-mid-hand');
});
