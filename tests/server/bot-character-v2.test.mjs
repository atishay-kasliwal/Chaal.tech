import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection } from '../../server/engine.mjs';
import { decideCharacterV2, CHARACTER_POLICY_V2 } from '../../server/bots/character-v2.mjs';
import { runTable } from '../../server/sim/table.mjs';
import { versioned } from '../../server/sim/population.mjs';
import { judgeDecision } from '../../server/sim/judge.mjs';
import {
	featureVector,
	sum,
	seatHandStats,
	metrics,
	FEATURES
} from '../../server/sim/fingerprint.mjs';
import { seeded } from './helpers/table-sim.mjs';

const ctx = { now: 1000, turnMs: 60000, connected: new Set(['host']) };
const c = (rank, suit) => ({ rank, suit });
const TRAIT_NAMES = [
	'aggression',
	'blindAggression',
	'bluffAffinity',
	'blindPreference',
	'showPreference',
	'curiosity',
	'patience',
	'riskTolerance'
];
/** A style that is not a character: personality is plain data any style can carry. */
const style = (dna = {}, quirks = []) => ({
	policy: CHARACTER_POLICY_V2,
	tendencies: {
		dna: { ...Object.fromEntries(TRAIT_NAMES.map((t) => [t, 0.5])), discipline: 0.5, ...dna },
		quirks
	}
});

/**
 * One decision spot: bot-hero to act with `cards` (seen unless blind), three opponents. `seenOver`
 * opponents have looked and bet more than the hero.
 */
function spot({ cards = null, blind = false, seenOver = 0 } = {}) {
	let room = newRoom('spot-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	for (const [i, id] of ['bot-hero', 'bot-opp-a', 'bot-opp-b'].entries())
		room = transition(room, 'host', 'addBot', { botId: id, name: `B${i}`, level: 'normal' }, ctx);
	room = transition(
		room,
		'host',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck: freshDeck(), handId: 'spot', requireReady: true }
	);
	const hero = room.players.find((p) => p.id === 'bot-hero');
	if (cards) hero.cards = cards;
	hero.isBlind = blind;
	room.currentPlayerId = hero.id;
	room.players
		.filter((p) => p.id !== hero.id)
		.slice(0, seenOver)
		.forEach((p) => {
			p.isBlind = false;
			p.handBet = (hero.handBet ?? 0) + 20;
		});
	return projection(room, hero.id, ctx.connected);
}
const decide = (view, s, seed = 1) => decideCharacterV2(view, 'bot-hero', seeded(seed), s);

const TRAIL = [c(14, 'hearts'), c(14, 'spades'), c(14, 'clubs')];
const JUNK = [c(2, 'hearts'), c(3, 'spades'), c(5, 'clubs')];
const EXTREMES = [
	style({
		patience: 1,
		curiosity: 0,
		aggression: 0,
		bluffAffinity: 0,
		riskTolerance: 0,
		discipline: 0
	}),
	style({
		patience: 0,
		curiosity: 1,
		aggression: 1,
		bluffAffinity: 1,
		riskTolerance: 1,
		discipline: 0
	})
];

test('bounded personality: no style reverses an obvious decision with a monster or with junk', () => {
	for (const s of EXTREMES)
		for (const cards of [TRAIL, JUNK]) {
			const { trace } = decide(spot({ cards }), s);
			assert.equal(trace.best, trace.baseBest, JSON.stringify(trace.probs));
			assert.ok(trace.lambda < 0.5, `clear spots restrain personality (lambda ${trace.lambda})`);
		}
	// A trail is never folded, however cautious the style.
	assert.ok(decide(spot({ cards: TRAIL }), EXTREMES[0]).trace.probs.pack < 0.01);
});

test('bounded personality: blind spots are style choices, so personality is barely restrained', () => {
	const { trace } = decide(spot({ blind: true }), style({ blindPreference: 1 }));
	assert.ok(trace.lambda > 0.8, `lambda ${trace.lambda}`);
	assert.ok(trace.probs.see < 0.05, 'a blind-loving style keeps playing blind at the start');
});

test('blind aggression is a generic trait: any style can double blind', () => {
	const view = spot({ blind: true });
	const hitter = decide(view, style({ blindAggression: 1 })).trace.probs.raise;
	const caller = decide(view, style({ blindAggression: 0 })).trace.probs.raise;
	assert.ok(hitter > caller + 0.2, `${hitter} vs ${caller}`);
});

test('blind pride is a conditional quirk: silent without pressure, active when seen players lean in', () => {
	const proud = style({}, [{ id: 'blindPride', strength: 1 }]);
	const calm = decide(spot({ blind: true }), proud).trace;
	assert.ok(Object.values(calm.quirk).every((v) => v === 0));
	const pressed = decide(spot({ blind: true, seenOver: 2 }), proud).trace;
	assert.ok(pressed.quirk.see < 0 && pressed.quirk.raise > 0);
	assert.ok(pressed.base.see > calm.base.see, 'the base brain itself feels blind pressure');
});

test('explanations name the real conflict, say when fundamentals held, and only call weak raises bluffs', () => {
	const hands = runTable({ seed: 31, table: 0, seats: versioned(2), hands: 120, traces: true });
	let overrides = 0;
	let held = 0;
	for (const h of hands)
		for (const d of h.decisions) {
			const t = d.move.trace;
			if (!t?.probs) continue;
			const reasons = [d.move.reason, ...t.secondary];
			if (reasons.includes('bluff-raise')) assert.ok(t.s < 0.35, `a bluff with strength ${t.s}`);
			if (!t.noise && d.name !== t.baseBest) {
				overrides++;
				assert.equal(t.key, t.baseBest, 'departing from the base brain is explained against it');
			}
			if (t.secondary.includes('fundamentals-held')) {
				held++;
				assert.equal(d.name, t.baseBest);
				assert.ok(t.resisted?.length, 'and it says what was resisted');
			}
			for (const [, , total, base, persona, quirk] of t.alternatives)
				assert.ok(Math.abs(total - (base + persona + quirk)) < 0.01);
		}
	assert.ok(overrides > 0 && held > 0, `${overrides} overrides, ${held} held`);
});

test('the judge grades with an exact hand ranking and flags strong, weak and monster hands', () => {
	const rows = runTable({ seed: 3, table: 0, seats: versioned(2), hands: 40 }, null, {
		decision: judgeDecision
	})
		.flatMap((h) => h.decisions)
		.filter((d) => d.q?.p !== undefined);
	assert.ok(rows.length > 50);
	for (const d of rows) {
		assert.ok(d.q.p >= 0 && d.q.p < 1);
		if (d.q.monster) assert.ok(d.q.p >= 0.985);
		assert.ok(!(d.q.strong && d.q.weak));
	}
	const room = { rulesVersion: 'classic-1' };
	const grade = (cards, alive = 2) =>
		judgeDecision({
			room,
			view: { legalActions: { bet: true } },
			actor: { id: 'x', isBlind: false, cards },
			move: {},
			row: { name: 'chaal', alive }
		});
	assert.ok(grade(TRAIL).monster && grade(TRAIL).strong && grade(TRAIL).p > 0.99);
	assert.ok(grade(JUNK).weak && grade(JUNK).p < 0.01);
});

test('decision-quality counters and single-feature ablation', () => {
	const hand = {
		decisions: [
			{
				seat: 0,
				name: 'pack',
				blind: false,
				raiseOk: true,
				q: { strong: true, ov: true, ovAdv: 0.3, qov: false }
			},
			{
				seat: 0,
				name: 'chaal',
				blind: false,
				raiseOk: true,
				q: { strong: true, monster: true, ov: false, ovAdv: 0, qov: false }
			}
		],
		seats: [{ seat: 0, member: 'x', dealt: true, net: 0, showdown: false, won: false }]
	};
	const m = metrics(sum([seatHandStats(hand).get(0)]));
	assert.equal(m.strongPackRate, 0.5);
	assert.equal(m.strongPassiveRate, 1);
	assert.equal(m.monsterNoRaiseRate, 1);
	assert.equal(m.overrideRate, 0.5);
	assert.equal(m.bigOverrideRate, 0.5);
	assert.equal(m.meanOverriddenAdvantage, 0.3);
	const t = sum([seatHandStats(hand).get(0)]);
	assert.equal(featureVector(t).length, FEATURES.length);
	assert.equal(featureVector(t, ['blindRounds', 'showRate']).length, FEATURES.length - 2);
});
