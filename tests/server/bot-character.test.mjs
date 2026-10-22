import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { freshDeck } from '../../server/classic.mjs';
import { listVariants, getVariant } from '../../server/variants/index.mjs';
import { newRoom, transition, projection, playing, invariant } from '../../server/engine.mjs';
import { defineGraph, runGraph, toMermaid } from '../../server/bots/graph.mjs';
import { decideCharacter, CHARACTER_GRAPH, NOISE } from '../../server/bots/character.mjs';
import { decideCharacterV2 } from '../../server/bots/character-v2.mjs';
import {
	decideCharacterV3,
	CHARACTER_GRAPH_V3,
	CHARACTER_REASONS_V3
} from '../../server/bots/character-v3.mjs';
import {
	CHARACTER_STYLES,
	CHARACTER_STYLES_V1,
	CHARACTER_STYLES_V2,
	STYLES
} from '../../server/bots/dna-styles.mjs';
import { identityForSeat } from '../../server/bots/identity.mjs';
import { configErrors } from '../../server/bots/config.mjs';
import {
	CHARACTER_DNA_V1,
	CHARACTER_DNA_V2,
	CHARACTER_DNA_V3
} from '../../server/bots/dna-characters.mjs';
import {
	botSeatPayload,
	botDelay,
	thinkingContext,
	nextBotMove,
	BOT_NAMES
} from '../../server/bots/runner.mjs';
import { CAST, CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { finishCapture } from '../../server/analytics/recorder.mjs';
import { runTable, reproduceHand } from '../../server/sim/table.mjs';
import { stream } from '../../server/sim/seeds.mjs';
import { seatHandStats, sum, metrics } from '../../server/sim/fingerprint.mjs';
import { identifiability } from '../../server/sim/identify.mjs';
import { seeded, shuffled } from './helpers/table-sim.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti } from './helpers/drivers.mjs';

const humans = new Set(['host']);
/** A hand without wall-clock timings, which differ between runs by nature. */
const timeless = (hand) => ({
	...hand,
	mindMs: 0,
	decisions: hand.decisions.map((d) => ({ ...d, ms: 0 }))
});
const ctx = { now: 1000, turnMs: 60000, connected: humans };

function characterTable(ids, { human = true } = {}) {
	let room = newRoom('char-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	ids.forEach((id, i) => {
		room = transition(
			room,
			'host',
			'addBot',
			botSeatPayload(room, id, `bot-char-${i}`, Math.random),
			ctx
		);
	});
	if (!human) room = transition(room, 'host', 'leave', {}, ctx);
	return room;
}

/* ---------------------------------------- graph ---------------------------------------- */

test('decision graph: named nodes run in order, can stop early, and draw as Mermaid', () => {
	const g = defineGraph('t', [
		{ id: 'a', label: 'first', run: (s) => s.seen.push('a') },
		{ id: 'b', run: (s) => ((s.done = s.stop), s.seen.push('b')) },
		{ id: 'c', run: (s) => s.seen.push('c') }
	]);
	assert.deepEqual(runGraph(g, { seen: [] }).path, ['a', 'b', 'c']);
	assert.deepEqual(runGraph(g, { seen: [], stop: true }).path, ['a', 'b']);
	assert.throws(
		() =>
			defineGraph('dup', [
				{ id: 'a', run() {} },
				{ id: 'a', run() {} }
			]),
		/Duplicate/
	);
	const mermaid = toMermaid(CHARACTER_GRAPH, ['perceive', 'assess']);
	for (const node of CHARACTER_GRAPH.nodes) assert.ok(mermaid.includes(`${node.id}[`), node.id);
	assert.ok(
		mermaid.includes('class perceive visited') && !mermaid.includes('class choose visited')
	);
});

/* -------------------------------------- identities -------------------------------------- */

test('the five DNA characters: reference versions v1 to v3 stay frozen on tp-dna@1 to @3', () => {
	assert.deepEqual(CHARACTER_IDS, ['rohit-sharma', 'virat-kohli', 'gg', 'samay-raina', 'ms-dhoni']);
	for (const id of CHARACTER_IDS) {
		const v1 = CHARACTER_STYLES_V1[id];
		const v2 = CHARACTER_STYLES_V2[id];
		const v3 = CHARACTER_STYLES[id];
		assert.equal(v3._id, `${id}@3`);
		assert.equal(v3.parent, `${id}@2`);
		assert.equal(v3.policy, 'tp-dna@3');
		assert.deepEqual(v3.tendencies.dna, CHARACTER_DNA_V3[id].dna);
		assert.ok(Object.isFrozen(v3) && STYLES[v3._id] === v3);
		assert.equal(v1._id, `${id}@1`);
		assert.equal(v1.policy, 'tp-dna@1');
		assert.deepEqual(v1.tendencies.dna, CHARACTER_DNA_V1[id].dna);
		assert.equal(v2._id, `${id}@2`);
		assert.equal(v2.parent, `${id}@1`);
		assert.equal(v2.policy, 'tp-dna@2');
		assert.deepEqual(v2.tendencies.dna, CHARACTER_DNA_V2[id].dna);
		assert.notEqual(v1.configHash, v2.configHash);
		for (const style of [v1, v2]) {
			assert.ok(Object.isFrozen(style));
			assert.equal(STYLES[style._id], style);
		}
	}
	// Character names are not in the legacy random-name pool.
	for (const { name } of CAST) assert.ok(!BOT_NAMES.includes(name));
});

test('personality is data: the shared policy never mentions a character', () => {
	for (const file of [
		'character.mjs',
		'character-v2.mjs',
		'character-v3.mjs',
		'character-v4.mjs',
		'mind.mjs',
		'observe.mjs',
		'brain.mjs',
		'quirks.mjs',
		'graph.mjs',
		'policies.mjs'
	])
		for (const { id, name } of CAST) {
			const source = readFileSync(new URL(`../../server/bots/${file}`, import.meta.url), 'utf8');
			assert.ok(
				!source.includes(`'${id}'`) && !source.includes(`"${id}"`),
				`${file} mentions ${id}`
			);
			assert.ok(!new RegExp(`\\b${name}\\b`).test(source), `${file} mentions ${name}`);
		}
});

/* ----------------------------------------- seats ----------------------------------------- */

test('a DNA style sits down like any published style: embedded, validated, one per character', () => {
	let room = characterTable(['rohit-sharma', 'gg']);
	const rohit = room.players.find((p) => p.bot?.style?.botId === 'rohit-sharma');
	assert.deepEqual(rohit.bot.style, CHARACTER_STYLES['rohit-sharma']);
	assert.equal(rohit.username, 'Rohit');
	assert.deepEqual(identityForSeat(rohit.bot), {
		botId: 'rohit-sharma',
		styleId: 'rohit-sharma@3',
		styleVersion: 3,
		configHash: CHARACTER_STYLES['rohit-sharma'].configHash,
		policy: 'tp-dna@3'
	});
	assert.throws(
		() =>
			transition(
				room,
				'host',
				'addBot',
				botSeatPayload(room, 'rohit-sharma', 'bot-char-dup', Math.random),
				ctx
			),
		/already at the table/
	);
	// Only a published, valid style can sit: a draft, a changed gene or an unknown tendency is refused.
	const ref = CHARACTER_STYLES['virat-kohli'];
	for (const style of [
		{ ...ref, status: 'draft' },
		{ ...ref, tendencies: { ...ref.tendencies, dna: { ...ref.tendencies.dna, aggression: 1.4 } } },
		{ ...ref, tendencies: { ...ref.tendencies, extra: 1 } },
		{ ...ref, _id: 'virat-kohli@x' }
	])
		assert.throws(() =>
			transition(
				room,
				'host',
				'addBot',
				{ botId: 'bot-char-x1', name: 'Virat', level: 'normal', style },
				ctx
			)
		);
	for (const s of Object.values(STYLES))
		if (s.policy.startsWith('tp-dna@')) assert.deepEqual(configErrors(s), [], s._id);
	// A removed character can come back; practice levels still work alongside.
	room = transition(room, 'host', 'removeBot', { botId: rohit.id }, ctx);
	room = transition(
		room,
		'host',
		'addBot',
		botSeatPayload(room, 'rohit-sharma', 'bot-char-back', Math.random),
		ctx
	);
	room = transition(
		room,
		'host',
		'addBot',
		botSeatPayload(room, 'hard', 'bot-legacy-1', () => 0),
		ctx
	);
	assert.equal(room.players.find((p) => p.id === 'bot-legacy-1').bot.level, 'hard');
	invariant(room);
});

test('think time never reads cards: the room context has none, the delay takes no view or move', () => {
	const room = characterTable(['virat-kohli', 'gg']);
	const virat = room.players.find((p) => p.bot?.style?.botId === 'virat-kohli');
	const feel = thinkingContext(room, virat.id);
	assert.deepEqual(Object.keys(feel).sort(), ['bigPot', 'botId', 'facingRaise']);
	assert.equal(feel.botId, 'virat-kohli');
	for (const r of [0, 0.5, 0.999]) {
		const ms = botDelay(() => r, false, feel);
		assert.ok(ms >= 1000 && ms <= 6300);
	}
	assert.equal(botDelay.length, 1);
});

/* ---------------------------------------- policy ---------------------------------------- */

for (const variant of listVariants())
	test(`characters finish every hand legally, chips conserved: ${variant.name}`, () => {
		for (let seed = 1; seed <= 2; seed++) {
			const hands = runTable({
				seed,
				table: 0,
				seats: CHARACTER_IDS,
				hands: 4,
				rulesVersion: variant.rulesVersion
			});
			assert.equal(hands.length, 4);
			for (const hand of hands) {
				const total = hand.seats.reduce((s, x) => s + x.net, 0);
				assert.ok(Math.abs(total) < 1e-9, 'a hand moves chips between seats only');
			}
		}
	});

test('character decisions: legal, deterministic, probabilities sum to 1, reasons from the fixed list', () => {
	const hands = runTable({ seed: 5, table: 1, seats: CHARACTER_IDS, hands: 30, traces: true });
	let checked = 0;
	for (const hand of hands)
		for (const d of hand.decisions) {
			const t = d.move.trace;
			assert.ok(CHARACTER_REASONS_V3.includes(d.move.reason), d.move.reason);
			assert.ok(Array.isArray(t.path) && t.path[0] === 'perceive');
			if (!t.probs) continue;
			checked++;
			const total = Object.values(t.probs).reduce((s, p) => s + p, 0);
			assert.ok(Math.abs(total - 1) < 0.01, `probs sum ${total}`);
			for (const r of t.secondary) assert.ok(CHARACTER_REASONS_V3.includes(r));
			assert.deepEqual(
				t.path,
				CHARACTER_GRAPH_V3.nodes.map((n) => n.id)
			);
		}
	assert.ok(checked > 100);
	assert.deepEqual(
		timeless(reproduceHand({ seed: 5, table: 1, seats: CHARACTER_IDS }, 17)),
		timeless(hands[17])
	);
});

test('characters decide from their own view only: hidden cards never change a decision or trace', () => {
	for (const version of listVariants().map((v) => v.rulesVersion)) {
		const variant = getVariant(version);
		const deckA = shuffled(freshDeck(), seeded(11));
		const deckB = deckA.slice();
		const n = variant.cardsPerPlayer ?? 3;
		// Seat 0 (the host) receives every sixth card at a six-seat table: swap them with deep cards.
		for (let i = 0; i < n; i++) [deckB[i * 6], deckB[40 + i]] = [deckB[40 + i], deckB[i * 6]];
		const start = (deck) =>
			transition(
				characterTable(CHARACTER_IDS),
				'host',
				'start',
				{ cutAt: 0, cardsToDeal: n, rulesVersion: version },
				{ ...ctx, deck, handId: 'h', requireReady: true }
			);
		const a = start(deckA);
		const b = start(deckB);
		for (const bot of a.players.filter((p) => p.bot)) {
			assert.deepEqual(bot.cards, b.players.find((p) => p.id === bot.id).cards, version);
			const versions = [
				[decideCharacter, CHARACTER_STYLES_V1[bot.bot.style.botId]],
				[decideCharacterV2, CHARACTER_STYLES_V2[bot.bot.style.botId]],
				// No mind: hidden-card safety of the v3 decision itself (minds have their own tests).
				[decideCharacterV3, CHARACTER_STYLES[bot.bot.style.botId]]
			];
			// Look first so the decision uses the bot's own (seen) cards and hand strength.
			const seenA = {
				...a,
				players: a.players.map((p) => (p.id === bot.id ? { ...p, isBlind: false } : p))
			};
			const seenB = {
				...b,
				players: b.players.map((p) => (p.id === bot.id ? { ...p, isBlind: false } : p))
			};
			for (const [ra, rb] of [
				[a, b],
				[seenA, seenB]
			])
				for (const [decide, style] of versions)
					for (let seed = 1; seed <= 3; seed++)
						assert.deepEqual(
							decide(projection(ra, bot.id, humans), bot.id, seeded(seed), style),
							decide(projection(rb, bot.id, humans), bot.id, seeded(seed), style),
							`${version} ${style._id}`
						);
		}
	}
});

test('irreducible noise is tiny and labelled: almost every move has a cause', () => {
	assert.ok(NOISE <= 0.002);
	const hands = runTable({ seed: 9, table: 2, seats: CHARACTER_IDS, hands: 200 });
	const decisions = hands.flatMap((h) => h.decisions);
	const noisy = decisions.filter((d) => d.reason === 'noise').length;
	assert.ok(noisy / decisions.length < 0.005, `${noisy} of ${decisions.length}`);
});

test('a character decision stays inside the performance budget', () => {
	const room = characterTable(CHARACTER_IDS, { human: false });
	let r = transition(
		{ ...room, hostId: room.players.find((p) => p.bot && !p.departed).id },
		room.players.find((p) => p.bot && !p.departed).id,
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{
			...ctx,
			connected: new Set(),
			deck: shuffled(freshDeck(), seeded(3)),
			handId: 'perf',
			requireReady: true
		}
	);
	const times = [];
	const random = seeded(4);
	for (let i = 0; i < 300 && playing(r); i++) {
		const t0 = performance.now();
		const move = nextBotMove(r, new Set(), random);
		times.push(performance.now() - t0);
		r = transition(r, move.botId, move.action, move.payload, { ...ctx, connected: new Set() });
	}
	times.sort((x, y) => x - y);
	const mean = times.reduce((s, t) => s + t, 0) / times.length;
	assert.ok(mean < 1, `mean ${mean.toFixed(3)} ms`);
});

/* ---------------------------------------- recorder ---------------------------------------- */

test('character decisions are recorded with their trace and replay exactly from the seed', () => {
	const sim = teenPattiTable({ seed: 77, humans: ['a'] });
	sim.act('a', 'addBot', botSeatPayload(sim.room, 'virat-kohli', 'bot-test-virat', Math.random));
	sim.act('a', 'addBot', botSeatPayload(sim.room, 'ms-dhoni', 'bot-test-dhoni', Math.random));
	for (let hand = 0; hand < 3; hand++) {
		dealTeenPatti(sim);
		playTeenPatti(sim, { packBias: 0.1 });
	}
	const captures = sim.captures();
	assert.ok(captures.length >= 3);
	let traced = 0;
	for (const capture of captures) {
		const finished = finishCapture(capture);
		assert.ok(finished.ok, finished.failure?.detail?.message);
		for (const t of finished.records.sealed.botTrace) {
			assert.equal(t.verified, 'reproduced');
			assert.ok(['virat-kohli@3', 'ms-dhoni@3'].includes(t.styleId));
			assert.equal(t.policy, 'tp-dna@3');
			if (t.trace?.factors) {
				traced++;
				assert.deepEqual(t.probs, t.trace.probs);
			}
		}
	}
	assert.ok(traced > 0, 'some decisions carry utilities and factors');
});

test('a tampered trace fails replay verification', () => {
	const sim = teenPattiTable({ seed: 78, humans: ['a'] });
	sim.act('a', 'addBot', botSeatPayload(sim.room, 'samay-raina', 'bot-test-samay', Math.random));
	dealTeenPatti(sim);
	playTeenPatti(sim, { packBias: 0 });
	const capture = structuredClone(sim.captures()[0]);
	const step = capture.hand.steps.find((s) => s.kind === 'bot' && s.bot.trace?.probs);
	assert.ok(step, 'a traced bot step');
	step.bot.trace.reason = 'tampered';
	assert.equal(finishCapture(capture).ok, false);
});

/* ------------------------------------- simulation ------------------------------------- */

test('simulation: any hand reproduces from (seed, table, hand); streams are independent', () => {
	const spec = {
		seed: 21,
		table: 3,
		seats: ['rohit-sharma', 'legacy-hard', 'baseline-station', 'gg']
	};
	const full = runTable({ ...spec, hands: 12, traces: true });
	assert.deepEqual(timeless(reproduceHand(spec, 9)), timeless(full[9]));
	assert.notDeepEqual(
		runTable({ ...spec, table: 4, hands: 1 })[0].decisions,
		runTable({ ...spec, hands: 1 })[0].decisions
	);
	const a = stream(1, 'decision', 0, 0, 0);
	const b = stream(1, 'decision', 0, 0, 1);
	assert.notEqual(a.random(), b.random());
	assert.equal(stream(1, 'x').random(), stream(1, 'x').random());
});

test('fingerprint counters follow the decisions they summarize', () => {
	const hand = {
		decisions: [
			{ seat: 0, name: 'chaal', blind: true, showOk: false, facing: false, entropy: 1 },
			{ seat: 1, name: 'raise', blind: true, showOk: false, facing: false, entropy: null },
			{ seat: 0, name: 'see', blind: true, showOk: false, facing: true, entropy: 0 },
			{ seat: 0, name: 'pack', blind: false, showOk: false, facing: true, entropy: 0 },
			{ seat: 1, name: 'show', blind: true, showOk: true, facing: false, entropy: null }
		],
		seats: [
			{ seat: 0, member: 'x', dealt: true, net: -1.5, showdown: false, won: false },
			{ seat: 1, member: 'y', dealt: true, net: 1.5, showdown: true, won: true }
		]
	};
	const stats = seatHandStats(hand);
	const x = metrics(sum([stats.get(0)]));
	assert.equal(x.blindRounds, 1);
	assert.equal(x.foldToRaise, 1);
	assert.equal(x.stayAfterSeeing, 0);
	assert.equal(x.entropy, 1 / 3);
	const y = metrics(sum([stats.get(1)]));
	assert.equal(y.blindRaiseRate, 1);
	assert.equal(y.showRate, 1);
	assert.equal(y.wonAtShowdown, 1);
	assert.equal(y.entropy, null, 'unavailable without logged probabilities');
	assert.match(y.tiltIndex, /unavailable/);
});

test('identifiability separates clearly different behaviour and reports a confusion matrix', () => {
	const fake = (member, table, blindBets) => ({
		table,
		member,
		hands: Array.from({ length: 20 }, (_, i) => ({
			member,
			net: 0,
			showdown: 0,
			won: 0,
			blindBets: blindBets + (i % 2),
			blindRaises: 0,
			seenChaal: 1,
			seenRaise: 0,
			seenPack: 0,
			blindPack: 0,
			see: 1,
			showOk: 0,
			show: 0,
			facing: 0,
			facingPack: 0,
			firstSeen: 1,
			decisions: 3,
			entropy: 0,
			entropyN: 0
		}))
	});
	const sessions = [0, 1, 2, 3].flatMap((t) => [fake('slow', t, 0), fake('blind', t, 4)]);
	const r = identifiability(sessions, 5, ['slow', 'blind']);
	assert.equal(r.accuracy, 1);
	assert.equal(r.confusion.blind.blind, 8);
	assert.equal(r.confusion.blind.slow, 0);
});
