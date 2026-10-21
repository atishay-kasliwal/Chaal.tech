import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, playing } from '../../server/engine.mjs';
import { emptyMind, updateMind, MOOD_BASELINE } from '../../server/bots/mind.mjs';
import { decideCharacterV3, CAPS } from '../../server/bots/character-v3.mjs';
import { decideCharacterV4, CHARACTER_POLICY_V4 } from '../../server/bots/character-v4.mjs';
import { CHARACTER_STYLES, STYLES } from '../../server/bots/dna-styles.mjs';
import { POLICIES, deciderFor } from '../../server/bots/policies.mjs';
import { nextBotMove, updateMinds } from '../../server/bots/runner.mjs';
import { runTable } from '../../server/sim/table.mjs';
import { sum, metrics } from '../../server/sim/fingerprint.mjs';
import { seatSummarizer } from '../../server/sim/summary.mjs';
import { seatHandStats } from '../../server/sim/fingerprint.mjs';
import { ancestorGenome, candidateStyle, mutate, REGIONS } from '../../server/sim/candidates.mjs';
import { opponents } from '../../server/sim/evaluate.mjs';
import { seeded, shuffled } from './helpers/table-sim.mjs';

/* Phase 3 (docs/BOT_BRAIN.md §29): policy tp-character@4, mind@2, and the offline machinery. */

const humans = new Set(['host']);
const ctx = { now: 1000, turnMs: 60000, connected: humans };
const c = (rank, suit) => ({ rank, suit });
const candidate = (id) =>
	candidateStyle(id, ancestorGenome(id), { id: `${id}@4-test`, parent: `${id}@3`, generation: 0 });
const withDna = (style, dna) => ({
	...style,
	tendencies: { ...style.tendencies, dna: { ...style.tendencies.dna, ...dna } }
});

function spot({ cards, blind = false, raiser = false, cost = null } = {}) {
	let room = newRoom('spot-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	for (const [i, id] of ['bot-hero', 'bot-opp-a', 'bot-opp-b'].entries())
		room = transition(room, 'host', 'addBot', { botId: id, name: `B${i}`, level: 'normal' }, ctx);
	room = transition(
		room,
		'host',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck: freshDeck(), handId: 'h1', requireReady: true }
	);
	const hero = room.players.find((p) => p.id === 'bot-hero');
	if (cards) hero.cards = cards;
	hero.isBlind = blind;
	room.currentPlayerId = hero.id;
	if (cost) room.stake = cost;
	const view = projection(room, hero.id, humans);
	const mind = emptyMind(2);
	mind.hand = {
		id: room.handId,
		raisers: [],
		seenRaisers: [],
		seenBettors: [],
		lastRaiser: null,
		acted: true,
		raised: false,
		packed: false,
		blind,
		raiseAt: -1,
		lastAct: { 'bot-hero': 1 },
		n: 3,
		start: 1000
	};
	if (raiser)
		Object.assign(mind.hand, {
			lastRaiser: 'bot-opp-a',
			raisers: ['bot-opp-a'],
			seenRaisers: ['bot-opp-a'],
			seenBettors: ['bot-opp-a'],
			raiseAt: 2
		});
	return { view, mind };
}
const maniacModel = {
	hands: 60,
	blindBets: 30,
	sees: 40,
	seeAt: 40,
	chaals: 10,
	raises: 50,
	packs: 5,
	facing: 10,
	facingPack: 1,
	showdowns: 10,
	raiseShown: 3,
	weakShown: 7,
	wins: 10,
	aggr: 0.8
};
const subject = (model) => ({
	kind: 'bot',
	model,
	rel: { rivalry: 0, annoyance: 0, respect: 0.3, fear: 0 },
	recent: { beatMe: 99, caughtBluffing: 0, bluffedMe: 0, wonOf5: [] }
});

test('candidates are offline only: no published style uses tp-character@4, published characters stay @3', () => {
	assert.ok(POLICIES[CHARACTER_POLICY_V4]);
	assert.ok(!Object.values(STYLES).some((s) => s.policy === CHARACTER_POLICY_V4));
	for (const s of Object.values(CHARACTER_STYLES)) assert.equal(s.policy, 'tp-character@3');
	const style = candidate('gg');
	assert.equal(style.status, 'candidate');
	assert.equal(STYLES[style._id], undefined);
});

test('mutations stay inside each character identity region', () => {
	const random = seeded(5);
	for (const [id, region] of Object.entries(REGIONS)) {
		let genome = ancestorGenome(id);
		for (let i = 0; i < 40; i++) genome = mutate(id, genome, random, { sigma: 0.2, count: 4 });
		for (const [gene, [lo, hi]] of Object.entries(region)) {
			assert.ok(
				genome.dna[gene] >= lo - 1e-9 && genome.dna[gene] <= hi + 1e-9,
				`${id} ${gene} ${genome.dna[gene]}`
			);
		}
	}
});

test('blind preference never makes packing unseen cards more attractive than looking (tp-character@4)', () => {
	const s = spot({ blind: true, raiser: true });
	const style = withDna(candidate('ms-dhoni'), { blindPreference: 0.95 });
	const v4 = decideCharacterV4(s.view, 'bot-hero', seeded(2), style, s.mind);
	const f = Object.fromEntries(v4.trace.factors)['dna.blindPreference'];
	assert.equal(f.pack, f.see, 'pack is discouraged exactly as much as looking');
	const v3 = decideCharacterV3(
		s.view,
		'bot-hero',
		seeded(2),
		{ ...style, policy: 'tp-character@3' },
		{ ...s.mind, v: 'mind@1' }
	);
	assert.ok((v4.trace.probs.pack ?? 0) <= (v3.trace.probs.pack ?? 0) + 1e-12);
});

test('a maniac betting after looking counts as less pressure, by adaptability (tp-character@4)', () => {
	const s = spot({ cards: [c(12, 'hearts'), c(9, 'spades'), c(4, 'clubs')], raiser: true });
	s.mind.others['bot-opp-a'] = subject(maniacModel);
	const adaptive = decideCharacterV4(
		s.view,
		'bot-hero',
		seeded(3),
		withDna(candidate('ms-dhoni'), { adaptability: 1 }),
		s.mind
	);
	const rigid = decideCharacterV4(
		s.view,
		'bot-hero',
		seeded(3),
		withDna(candidate('ms-dhoni'), { adaptability: 0 }),
		s.mind
	);
	assert.equal(rigid.trace.pressure, 1);
	assert.ok(adaptive.trace.pressure < 0.8, `${adaptive.trace.pressure}`);
	assert.ok((adaptive.trace.probs.pack ?? 0) <= (rigid.trace.probs.pack ?? 0));
});

test('frustration makes a character more like itself: the curious lean to calling, the patient to releasing', () => {
	const s = spot({ cards: [c(11, 'hearts'), c(7, 'spades'), c(3, 'clubs')] });
	const tilted = { ...s.mind, mood: { ...MOOD_BASELINE, frustration: 0.7 } };
	const state = (id, mind) =>
		decideCharacterV4(s.view, 'bot-hero', seeded(4), candidate(id), mind).trace.state;
	// Mood contributions relative to packing (packing is 0): calling more attractive for the
	// curious caller, less attractive for the patient rock; none without frustration.
	assert.ok(state('samay-raina', tilted).chaal > 0);
	assert.ok(state('gg', tilted).chaal < 0);
	assert.equal(state('gg', s.mind).chaal, 0);
	const t = decideCharacterV4(s.view, 'bot-hero', seeded(4), candidate('gg'), tilted).trace;
	assert.ok(t.factors.some(([f]) => f === 'state.frustration'));
});

test('bounded on tp-character@4: no mind state turns a monster into a fold or junk into a raise', () => {
	for (const cards of [
		[c(14, 'hearts'), c(14, 'spades'), c(14, 'clubs')],
		[c(2, 'hearts'), c(3, 'spades'), c(5, 'clubs')]
	]) {
		const s = spot({ cards, raiser: true });
		const wild = structuredClone(s.mind);
		wild.mood = { confidence: 1, frustration: 1, fear: 1, suspicion: 1, excitement: 1 };
		wild.others['bot-opp-a'] = {
			...subject({ ...maniacModel, facingPack: 10, packs: 60 }),
			rel: { rivalry: 1, annoyance: 1, respect: 0, fear: 0 },
			recent: { beatMe: 0, caughtBluffing: 5, bluffedMe: 5, wonOf5: [] }
		};
		for (const id of ['virat-kohli', 'samay-raina', 'ms-dhoni', 'gg', 'rohit-sharma']) {
			const { trace } = decideCharacterV4(s.view, 'bot-hero', seeded(1), candidate(id), wild);
			assert.equal(trace.best, trace.baseBest, `${id}: ${JSON.stringify(trace.probs)}`);
			for (const g of Object.keys(CAPS))
				for (const v of Object.values(trace[g])) assert.ok(Math.abs(v) <= CAPS[g] + 1e-9);
		}
	}
});

test('mind@2: being bluffed makes a suspicious style more suspicious; adaptable styles forget faster; mind@1 unchanged', () => {
	const deal = {
		k: 'deal',
		hand: 'h1',
		seats: ['me', 'p1'],
		stacks: { me: 990, p1: 990 },
		bets: { me: 10, p1: 10 },
		boot: 10
	};
	const view = {
		boot: 10,
		rulesVersion: 'classic-1',
		handId: 'h1',
		usersList: [
			{ id: 'me', balance: 980, handBet: 20, cardsInHand: [c(0, ''), c(0, ''), c(0, '')] }
		]
	};
	const events = [
		deal,
		{ k: 'bet', who: 'p1', blind: false, raised: true, amount: 40 },
		{ k: 'pack', who: 'me' },
		{
			k: 'result',
			winners: [{ id: 'p1' }],
			bets: { me: 20, p1: 50 },
			revealed: { p1: [c(2, 'hearts'), c(5, 'spades'), c(9, 'clubs')] }
		}
	];
	const dna = { suspicion: 1, adaptability: 0.5 };
	const two = updateMind(emptyMind(2), events, { self: 'me', view, dna, rules: 2 });
	const one = updateMind(emptyMind(1), events, { self: 'me', view, dna, rules: 1 });
	assert.equal(two.v, 'mind@2');
	assert.ok(
		two.mood.suspicion > one.mood.suspicion,
		`${two.mood.suspicion} vs ${one.mood.suspicion}`
	);
	const forget = (adaptability) => {
		let m = updateMind(emptyMind(2), events, { self: 'me', view, dna: { adaptability }, rules: 2 });
		m = updateMind(m, [{ ...deal, hand: 'h2' }], {
			self: 'me',
			view,
			dna: { adaptability },
			rules: 2
		});
		return m.others.p1.model.raises;
	};
	assert.ok(forget(1) < forget(0.5));
});

test('hidden cards never reach a mind@2: swapping unrevealed cards leaves every mind identical', () => {
	const styles = ['ms-dhoni', 'samay-raina', 'virat-kohli'].map(candidate);
	const run = (deckOf) => {
		let room = newRoom('p3-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
		room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
		styles.forEach(
			(s, i) =>
				(room = transition(
					room,
					'host',
					'addBot',
					{ botId: `bot-seat-${i}`, name: `B${i}`, level: 'normal' },
					ctx
				))
		);
		const styleOf = (p) => styles[Number(p.id.split('-')[2])] ?? null;
		const deciderOf = (p) => deciderFor(styleOf(p));
		let minds = updateMinds({}, null, room, { styleOf });
		const random = seeded(77);
		for (let h = 0; h < 4; h++) {
			const before = room;
			room = transition(
				room,
				'host',
				'start',
				{ cutAt: 0, cardsToDeal: 3 },
				{ ...ctx, deck: deckOf(h), handId: `h${h}`, requireReady: true }
			);
			minds = updateMinds(minds, before, room, { styleOf });
			while (playing(room)) {
				const prev = room;
				const move =
					room.currentPlayerId === 'host'
						? { botId: 'host', action: 'pack', payload: {} }
						: nextBotMove(room, humans, random, { deciderOf, minds });
				room = transition(room, move.botId, move.action, move.payload, ctx);
				minds = updateMinds(minds, prev, room, { styleOf });
			}
		}
		return minds;
	};
	const base = (h) => shuffled(freshDeck(), seeded(300 + h));
	const swapped = (h) => {
		const deck = base(h);
		for (let i = 0; i < 3; i++) [deck[i * 4], deck[45 + i]] = [deck[45 + i], deck[i * 4]];
		return deck;
	};
	const a = run(base);
	assert.ok(Object.keys(a).length === 3 && a['bot-seat-0'].v === 'mind@2');
	assert.deepEqual(run(swapped), a);
});

test('matched play and summaries are deterministic; a changed hero leaves the opponents their own draws', () => {
	const spec = (hero) => ({
		seed: 9,
		table: 3,
		hands: 30,
		matched: true,
		seats: [hero, 'human-maniac', 'legacy-normal', 'human-station', 'human-expert']
	});
	const summarize = (hero) => {
		const s = seatSummarizer(0);
		runTable(spec(hero), (h) => s.add(h, seatHandStats(h).get(0)));
		return s.result();
	};
	assert.deepEqual(summarize('gg@3'), summarize('gg@3'));
	// The first hand's first opponent decision draws the same whoever sits in seat 0.
	const first = (hero) =>
		runTable({ ...spec(hero), hands: 1 })[0].decisions.find((d) => d.seat !== 0 && d.i < 2);
	assert.deepEqual(first('gg@3')?.draws, first('samay-raina@3')?.draws);
});

test('population tables: never the hero character, at most one version of any other, same for any hero of a character', () => {
	for (let t = 0; t < 50; t++) {
		const field = opponents(1, 'x', t, 'gg');
		assert.equal(field.length, 4);
		assert.ok(!field.some((m) => typeof m === 'string' && m.startsWith('gg@')));
		const chars = field
			.filter((m) => typeof m === 'string' && m.includes('@'))
			.map((m) => m.split('@')[0]);
		assert.equal(new Set(chars).size, chars.length);
		assert.deepEqual(opponents(1, 'x', t, 'gg'), field);
	}
});

test('archetypes play as labelled: the station rarely folds to a raise, the very conservative packs most', () => {
	const run = (hero) => {
		const hands = [];
		for (let t = 0; t < 3; t++)
			runTable(
				{
					seed: 2,
					table: t,
					hands: 80,
					seats: [hero, 'legacy-normal', 'human-maniac', 'legacy-hard', 'human-aggressive']
				},
				(h) => hands.push(seatHandStats(h).get(0))
			);
		return metrics(sum(hands.filter(Boolean)));
	};
	const station = run('human-station');
	const tight = run('human-very-conservative');
	const loose = run('human-maniac');
	assert.ok(station.seenFoldToRaise < 0.15, `${station.seenFoldToRaise}`);
	assert.ok(tight.packRate > loose.packRate);
	assert.ok(loose.raiseRate > tight.raiseRate);
});
