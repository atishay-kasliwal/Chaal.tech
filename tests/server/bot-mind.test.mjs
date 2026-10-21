import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, playing } from '../../server/engine.mjs';
import { observe, OBSERVATION_VERSION } from '../../server/bots/observe.mjs';
import {
	emptyMind,
	updateMind,
	beliefs,
	confidence,
	MOOD_BASELINE,
	PRIORS
} from '../../server/bots/mind.mjs';
import { decideCharacterV3, CAPS } from '../../server/bots/character-v3.mjs';
import { CHARACTER_STYLES } from '../../server/bots/dna-styles.mjs';
import { botSeatPayload, nextBotMove, updateMinds } from '../../server/bots/runner.mjs';
import { runTable } from '../../server/sim/table.mjs';
import { versioned } from '../../server/sim/population.mjs';
import { seeded, shuffled } from './helpers/table-sim.mjs';

const humans = new Set(['host']);
const ctx = { now: 1000, turnMs: 60000, connected: humans };
const c = (rank, suit) => ({ rank, suit });
const NEUTRAL = Object.fromEntries(
	[
		'lossSensitivity',
		'winElation',
		'pressureResistance',
		'ego',
		'moodRecovery',
		'revenge',
		'suspicion'
	].map((t) => [t, 0.5])
);

function table(ids, { human = true } = {}) {
	let room = newRoom('mind-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	ids.forEach((id, i) => {
		room = transition(
			room,
			'host',
			'addBot',
			botSeatPayload(room, id, `bot-mind-${i}`, () => 0),
			ctx
		);
	});
	if (!human) room = transition(room, 'host', 'leave', {}, ctx);
	return room;
}
const deal = (room, deck = freshDeck()) =>
	transition(
		room,
		room.hostId ?? 'host',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck, handId: `h${room.revision}`, requireReady: true }
	);

/* ---------------------------------------- observations ---------------------------------------- */

test('observations: deal, look, bet, raise, pack and result, from the bot own view only', () => {
	let room = table(['gg', 'virat-kohli']);
	const bot = 'bot-mind-0';
	let prev = projection(room, bot, humans);
	room = deal(room);
	let next = projection(room, bot, humans);
	const dealt = observe(prev, next);
	assert.equal(dealt[0].k, 'deal');
	assert.equal(dealt[0].seats.length, 3);
	const actor = room.currentPlayerId;
	prev = next;
	room = transition(room, actor, 'see', {}, ctx);
	next = projection(room, bot, humans);
	assert.deepEqual(observe(prev, next), [{ k: 'see', who: actor, committed: 1 }]);
	prev = next;
	const legal = projection(room, actor, humans).legalActions;
	room = transition(room, actor, 'bet', { amount: legal.maxBet }, ctx);
	next = projection(room, bot, humans);
	const [bet] = observe(prev, next);
	assert.equal(bet.k, 'bet');
	assert.equal(bet.raised, true);
	assert.equal(bet.blind, false);
	while (playing(room)) {
		prev = projection(room, bot, humans);
		room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
		const events = observe(prev, projection(room, bot, humans));
		assert.ok(events.some((e) => e.k === 'pack'));
		if (!playing(room)) {
			const result = events.find((e) => e.k === 'result');
			assert.ok(result && result.winners.length === 1);
			// Nobody showed: no cards were revealed to the bot.
			assert.deepEqual(result.revealed, {});
		}
	}
	assert.equal(OBSERVATION_VERSION, 'obs@1');
});

test('hidden cards never reach a mind: swapping unrevealed cards leaves every mind identical', () => {
	const run = (deck) => {
		let room = table(['rohit-sharma', 'virat-kohli', 'gg', 'samay-raina'], { human: true });
		let minds = updateMinds({}, null, room);
		const random = seeded(77);
		for (let h = 0; h < 4; h++) {
			const before = room;
			room = deal(room, deck(h));
			minds = updateMinds(minds, before, room);
			while (playing(room)) {
				const prev = room;
				const move =
					room.currentPlayerId === 'host'
						? { botId: 'host', action: 'pack', payload: {} }
						: nextBotMove(room, humans, random, { minds });
				room = transition(room, move.botId, move.action, move.payload, ctx);
				minds = updateMinds(minds, prev, room);
			}
		}
		return minds;
	};
	const base = (h) => shuffled(freshDeck(), seeded(100 + h));
	// The host (seat 0) packs at once every hand, so its cards are never shown: swap them.
	const swapped = (h) => {
		const deck = base(h);
		for (let i = 0; i < 3; i++) [deck[i * 5], deck[45 + i]] = [deck[45 + i], deck[i * 5]];
		return deck;
	};
	assert.deepEqual(run(swapped), run(base));
});

/* --------------------------------------- state and memory --------------------------------------- */

function viewFor(self, extra = {}) {
	return {
		boot: 10,
		rulesVersion: 'classic-1',
		handId: 'h1',
		usersList: [
			{ id: self, balance: 1000, handBet: 0, cardsInHand: [c(0, ''), c(0, ''), c(0, '')], ...extra }
		]
	};
}
const dealEvent = (self, others = ['p1', 'p2'], stack = 1000) => ({
	k: 'deal',
	hand: 'h1',
	seats: [self, ...others],
	stacks: Object.fromEntries([self, ...others].map((id) => [id, stack - 10])),
	bets: Object.fromEntries([self, ...others].map((id) => [id, 10])),
	boot: 10
});
function bigLoss(dna) {
	let mind = updateMind(emptyMind(), [dealEvent('me')], { self: 'me', view: viewFor('me'), dna });
	mind = updateMind(
		mind,
		[
			{
				k: 'result',
				reason: 'show',
				winners: [{ id: 'p1', amount: 900 }],
				bets: { me: 400, p1: 400, p2: 10 },
				revealed: {}
			}
		],
		{ self: 'me', view: viewFor('me', { balance: 600, handBet: 400 }), dna }
	);
	return mind;
}

test('state transitions: a big loss frustrates by loss sensitivity and breeds rivalry by ego and revenge', () => {
	const touchy = bigLoss({ ...NEUTRAL, lossSensitivity: 1, ego: 1, revenge: 1 });
	const calm = bigLoss({ ...NEUTRAL, lossSensitivity: 0, ego: 0, revenge: 0 });
	assert.ok(touchy.mood.frustration > calm.mood.frustration + 0.2);
	assert.ok(touchy.others.p1.rel.rivalry > calm.others.p1.rel.rivalry);
	assert.equal(touchy.self.net, -40);
	assert.equal(touchy.others.p1.recent.beatMe, 0);
	assert.equal(
		calm.mood.frustration,
		Math.round((MOOD_BASELINE.frustration + calm.form.frustration) * 10000) / 10000,
		"no loss sensitivity, no frustration beyond tonight's form"
	);
});

test('state bounds and decay: moods stay in [0, 1] and drift back to baseline hand by hand', () => {
	let mind = bigLoss({ ...NEUTRAL, lossSensitivity: 1, ego: 1, revenge: 1 });
	for (let i = 0; i < 5; i++) mind = bigLoss({ ...NEUTRAL, lossSensitivity: 1 });
	for (const v of Object.values(mind.mood)) assert.ok(v >= 0 && v <= 1);
	const peak = mind.mood.frustration;
	const fast = { ...NEUTRAL, moodRecovery: 1 };
	const slow = { ...NEUTRAL, moodRecovery: 0 };
	let a = mind;
	let b = mind;
	for (let i = 0; i < 3; i++) {
		a = updateMind(a, [dealEvent('me')], { self: 'me', view: viewFor('me'), dna: fast });
		b = updateMind(b, [dealEvent('me')], { self: 'me', view: viewFor('me'), dna: slow });
	}
	assert.ok(a.mood.frustration < b.mood.frustration && b.mood.frustration < peak);
	assert.ok(Math.abs(a.mood.frustration - (MOOD_BASELINE.frustration + a.form.frustration)) < 0.1);
});

test('night form: drawn once per session from public ids, replayable, smaller for the disciplined', () => {
	const at = (hand, discipline) =>
		updateMind(emptyMind(), [{ ...dealEvent('me'), hand }], {
			self: 'me',
			view: viewFor('me'),
			dna: { ...NEUTRAL, discipline }
		}).form;
	assert.deepEqual(at('h1', 0.5), at('h1', 0.5), 'same session, same form');
	assert.notDeepEqual(at('h1', 0.5), at('h2', 0.5), 'another night, another form');
	const spread = (d) =>
		Array.from({ length: 40 }, (_, i) => at(`n${i}`, d)).reduce(
			(s, f) => s + Math.abs(f.confidence),
			0
		);
	assert.ok(spread(0.9) < spread(0.2));
	let mind = updateMind(emptyMind(), [{ ...dealEvent('me'), hand: 'h1' }], {
		self: 'me',
		view: viewFor('me'),
		dna: NEUTRAL
	});
	const form = mind.form;
	mind = updateMind(mind, [{ ...dealEvent('me'), hand: 'h2' }], {
		self: 'me',
		view: viewFor('me'),
		dna: NEUTRAL
	});
	assert.deepEqual(mind.form, form, 'form is kept for the session');
});

test('memory and confidence: tendencies come from observed actions and small samples stay near the prior', () => {
	let mind = updateMind(emptyMind(), [dealEvent('me', ['p1'])], {
		self: 'me',
		view: viewFor('me'),
		dna: NEUTRAL
	});
	assert.equal(beliefs(mind, 'p1').foldToRaise.n, 0);
	assert.equal(beliefs(mind, 'p1').foldToRaise.p, PRIORS.foldToRaise);
	for (let i = 0; i < 20; i++) {
		mind = updateMind(
			mind,
			[
				dealEvent('me', ['p1']),
				{ k: 'bet', who: 'me', amount: 20, boots: 2, blind: false, raised: true },
				{ k: 'pack', who: 'p1' }
			],
			{
				self: 'me',
				view: viewFor('me'),
				dna: NEUTRAL
			}
		);
	}
	const b = beliefs(mind, 'p1');
	assert.ok(b.foldToRaise.p > 0.75, `${b.foldToRaise.p}`);
	assert.ok(b.foldToRaise.n > 15 && b.foldToRaise.n < 20, 'old observations decay');
	assert.ok(confidence(2) < 0.2 && confidence(30) > 0.7);
	assert.equal(mind.others.p1.kind, 'human');
});

test('session reset: minds belong to seated mind-keeping bots and start empty', () => {
	let room = table(['gg', 'hard']);
	let minds = updateMinds({}, null, room);
	assert.deepEqual(Object.keys(minds), ['bot-mind-0'], 'legacy bots keep no mind');
	assert.equal(minds['bot-mind-0'].hands, 0);
	room = transition(room, 'host', 'removeBot', { botId: 'bot-mind-0' }, ctx);
	assert.deepEqual(updateMinds(minds, null, room), {});
});

/* ---------------------------------------- decisions ---------------------------------------- */

function spot({ cards, blind = false, raiser = false } = {}) {
	let room = newRoom('spot-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	for (const [i, id] of ['bot-hero', 'bot-opp-a', 'bot-opp-b'].entries())
		room = transition(room, 'host', 'addBot', { botId: id, name: `B${i}`, level: 'normal' }, ctx);
	room = deal(room);
	const hero = room.players.find((p) => p.id === 'bot-hero');
	if (cards) hero.cards = cards;
	hero.isBlind = blind;
	room.currentPlayerId = hero.id;
	const view = projection(room, hero.id, humans);
	const mind = emptyMind();
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
	if (raiser) {
		mind.hand.lastRaiser = 'bot-opp-a';
		mind.hand.raisers = ['bot-opp-a'];
		mind.hand.raiseAt = 2;
	}
	return { view, mind };
}
const style = (id) => CHARACTER_STYLES[id];
const decide = (s, id, mind) => decideCharacterV3(s.view, 'bot-hero', seeded(1), style(id), mind);
const MID = [c(12, 'hearts'), c(9, 'spades'), c(4, 'clubs')];

test('memory changes decisions: a raiser caught bluffing gets called; folders get pressured', () => {
	const s = spot({ cards: MID, raiser: true });
	const plain = decide(s, 'samay-raina', s.mind);
	const caught = structuredClone(s.mind);
	caught.others['bot-opp-a'] = {
		kind: 'bot',
		model: {
			hands: 30,
			blindBets: 20,
			sees: 20,
			seeAt: 30,
			chaals: 10,
			raises: 20,
			packs: 5,
			facing: 10,
			facingPack: 3,
			showdowns: 8,
			raiseShown: 2,
			weakShown: 6,
			wins: 5,
			aggr: 0.6
		},
		rel: { rivalry: 0, annoyance: 0, respect: 0.3, fear: 0 },
		recent: { beatMe: 99, caughtBluffing: 2, bluffedMe: 0, wonOf5: [] }
	};
	const informed = decide(s, 'samay-raina', caught);
	const call = (d) => (d.trace.probs.chaal ?? 0) + (d.trace.probs.show ?? 0);
	assert.ok(call(informed) > call(plain), `${call(informed)} vs ${call(plain)}`);
	assert.ok(
		informed.trace.memoryRefs.some(([id, stat]) => id === 'bot-opp-a' && stat === 'bluffShown')
	);
	assert.ok(informed.trace.quirk.chaal > 0, 'bluffCatcher fired');
});

test('bounded: no mind state, rivalry or memory turns a monster into a fold or junk into a raise', () => {
	for (const cards of [
		[c(14, 'hearts'), c(14, 'spades'), c(14, 'clubs')],
		[c(2, 'hearts'), c(3, 'spades'), c(5, 'clubs')]
	]) {
		const s = spot({ cards, raiser: true });
		const wild = structuredClone(s.mind);
		wild.mood = { confidence: 1, frustration: 1, fear: 1, suspicion: 1, excitement: 1 };
		wild.others['bot-opp-a'] = {
			kind: 'bot',
			model: {
				hands: 50,
				blindBets: 0,
				sees: 50,
				seeAt: 0,
				chaals: 0,
				raises: 50,
				packs: 0,
				facing: 40,
				facingPack: 40,
				showdowns: 20,
				raiseShown: 0,
				weakShown: 20,
				wins: 0,
				aggr: 1
			},
			rel: { rivalry: 1, annoyance: 1, respect: 0, fear: 0 },
			recent: { beatMe: 0, caughtBluffing: 5, bluffedMe: 5, wonOf5: [] }
		};
		for (const id of ['virat-kohli', 'samay-raina', 'ms-dhoni', 'gg', 'rohit-sharma']) {
			const { trace } = decide(s, id, wild);
			assert.equal(trace.best, trace.baseBest, `${id}: ${JSON.stringify(trace.probs)}`);
			for (const g of Object.keys(CAPS))
				for (const v of Object.values(trace[g]))
					assert.ok(Math.abs(v) <= CAPS[g] + 1e-9, `${g} capped`);
		}
	}
});

test('explanations split every alternative into base, personality, state, social, memory and quirks', () => {
	const hands = runTable({ seed: 8, table: 0, seats: versioned(3), hands: 60, traces: true });
	let withState = 0;
	for (const h of hands)
		for (const d of h.decisions) {
			const t = d.move.trace;
			if (!t?.probs) continue;
			for (const [, , total, base, persona, state, social, model, quirk] of t.alternatives)
				assert.ok(Math.abs(total - (base + persona + state + social + model + quirk)) < 0.01);
			if (Object.values(t.state).some((v) => v !== 0)) withState++;
			assert.ok(t.mood && typeof t.pressure === 'number');
		}
	assert.ok(withState > 0, 'mood moved some decisions');
	assert.ok(hands.at(-1).minds['bot-seat-0'].hands === 60);
});

test('characters stay apart in fixed spots: Rohit stays blind, GG looks; Virat raises a mid hand more than Samay', () => {
	const blind = spot({ blind: true });
	const see = (id) => decide(blind, id, blind.mind).trace.probs.see;
	assert.ok(see('rohit-sharma') < see('ms-dhoni') && see('ms-dhoni') < see('gg'));
	const mid = spot({ cards: [c(13, 'hearts'), c(13, 'spades'), c(6, 'clubs')] });
	const raise = (id) => decide(mid, id, mid.mind).trace.probs.raise ?? 0;
	assert.ok(raise('virat-kohli') > raise('samay-raina'));
});

test('cues for table talk come only at the end of a hand, from the fixed vocabulary', async () => {
	const { CUES } = await import('../../server/bots/mind.mjs');
	const hands = runTable({ seed: 12, table: 0, seats: versioned(3), hands: 80, traces: true });
	let seen = 0;
	for (const h of hands)
		for (const mind of Object.values(h.minds))
			for (const c of mind.cues) {
				assert.ok(CUES.includes(c.cue), c.cue);
				seen++;
			}
	assert.ok(seen > 0);
	// Mid-hand, a mind gains no new cue: cues are appraised from the result only.
	const loss = bigLoss({ ...NEUTRAL, lossSensitivity: 1 });
	assert.equal(loss.cues.at(-1).cue, 'BIG_LOSS');
	const mid = updateMind(
		loss,
		[dealEvent('me'), { k: 'bet', who: 'p1', amount: 20, boots: 2, blind: false, raised: true }],
		{
			self: 'me',
			view: viewFor('me'),
			dna: NEUTRAL
		}
	);
	assert.deepEqual(mid.cues, loss.cues);
});
