import test from 'node:test';
import assert from 'node:assert/strict';
import { blackjackEv, holdemClass, holdemEquity, holdemShare, teenPattiEquity, teenPattiEquityVariance, strengthModelFor } from '../../server/analytics/intel/strength.mjs';
import { compare, skillLuck } from '../../server/analytics/intel/skill-luck.mjs';
import { improvement } from '../../server/analytics/intel/improvement.mjs';
import { TP_STRENGTH } from '../../server/analytics/intel/tp-strength.mjs';
import { listVariants } from '../../server/variants/index.mjs';
import { simulateTeenPatti, factsFor, seeded, DAY, T0 } from './helpers/intel.mjs';

const c = (rank, suit = 'spades') => ({ rank, suit });

/* ---------------------------------------- exact and estimated models ---------------------------------------- */

test('Blackjack EV is exact for this table’s rules: classic textbook decisions fall out', () => {
	assert.equal(blackjackEv([c(5), c(6)], 6).best, blackjackEv([c(5), c(6)], 6).double, '11 against a 6 doubles');
	const twenty = blackjackEv([c(10), c(10, 'hearts')], 10);
	assert.ok(twenty.stand > 0.4 && twenty.stand > twenty.hit + 1, '20 stands, hitting is a disaster');
	const sixteen = blackjackEv([c(10), c(6)], 10);
	assert.ok(Math.abs(sixteen.stand - sixteen.hit) < 0.02, '16 against a 10 is a near coin flip, as basic strategy says');
	assert.ok(blackjackEv([c(10), c(6)], 6).stand > blackjackEv([c(10), c(6)], 6).hit, '16 against a 6 stands');
	assert.equal(blackjackEv([c(10), c(6), c(2)], 6).double, null, 'no doubling on three cards');
	assert.ok(blackjackEv([c(14), c(7)], 9).hit > blackjackEv([c(14), c(7)], 9).stand, 'soft 18 against a 9 hits');
});

test('Teen Patti equity orders hands correctly, inverts for Muflis, and has a fair average', () => {
	const trail = teenPattiEquity('classic-1', [c(14), c(14, 'hearts'), c(14, 'clubs')], 2).equity;
	const high = teenPattiEquity('classic-1', [c(9), c(5, 'hearts'), c(3, 'clubs')], 2).equity;
	const worst = teenPattiEquity('classic-1', [c(5), c(3, 'hearts'), c(2, 'clubs')], 2).equity;
	assert.ok(trail > 0.99 && trail > high && high > worst);
	assert.ok(teenPattiEquity('muflis-1', [c(5), c(3, 'hearts'), c(2, 'clubs')], 2).equity > 0.99, 'lowest wins in Muflis');
	assert.equal(teenPattiEquity('joker-1', [c(5), c(3, 'hearts'), c(2, 'clubs')], 2), null, 'joker variants have no card-only model');
	assert.equal(strengthModelFor('kiss-miss-bliss-1'), null);
	// Averaged over the whole deck an honest hand is worth exactly a fair share: sample a lot of hands.
	const rng = seeded(5);
	let sum = 0;
	for (let i = 0; i < 4000; i++) {
		const deck = Array.from({ length: 52 }, (_, k) => ({ rank: (k % 13) + 2, suit: ['spades', 'hearts', 'clubs', 'diamonds'][Math.floor(k / 13)] }));
		for (let k = 51; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [deck[k], deck[j]] = [deck[j], deck[k]]; }
		sum += teenPattiEquity('classic-1', deck.slice(0, 3), 3).equity;
	}
	assert.ok(Math.abs(sum / 4000 - 0.25) < 0.02, `mean equity ${sum / 4000} ≈ fair share 0.25`);
	assert.ok(teenPattiEquityVariance('classic-1', 3) > 0);
});

test('Hold’em classes and equity: AA beats 72o, suited beats offsuit, shares average a fair share', () => {
	assert.equal(holdemClass([c(14), c(14, 'hearts')]), 'AAp');
	assert.equal(holdemClass([c(13), c(14)]), 'AKs');
	assert.equal(holdemClass([c(7), c(2, 'hearts')]), '72o');
	assert.ok(holdemEquity([c(14), c(14, 'hearts')]) > 0.84 && holdemEquity([c(7), c(2, 'hearts')]) < 0.36);
	assert.ok(holdemEquity([c(14), c(13)]) > holdemEquity([c(14), c(13, 'hearts')]));
	assert.ok(holdemShare([c(14), c(14, 'hearts')], 6) > 1 / 6 && holdemShare([c(7), c(2, 'hearts')], 6) < 1 / 6);
});

/* ---------------------------------------- the decomposition ---------------------------------------- */

test('cards + play = outcome exactly, and every comparison carries an interval', () => {
	const { records, ownsByHand } = simulateTeenPatti({ hands: 80, seed: 3 });
	const { games } = skillLuck({ facts: factsFor(records, 'me'), owns: ownsByHand });
	const tp = games['teen-patti'];
	assert.equal(tp.model, 'estimated');
	assert.ok(Math.abs(tp.cards.actual + tp.play.difference - tp.outcome.actual) < 0.05);
	for (const k of ['cards', 'play', 'outcome']) assert.ok(tp[k].low !== null && tp[k].high !== null && tp[k].low < tp[k].high);
	assert.ok(tp.limitations.length >= 2, 'limitations are documented in the output');
	assert.equal(strengthModelFor('classic-1').k, 3);
});

test('play well and lose: strong cards with poor showdown luck read as cards above, play below', () => {
	const hot = compare({ actual: 9, expected: 0, variance: 4, n: 60 });
	assert.equal(hot.verdict, 'above');
	const cold = compare({ actual: -9, expected: 0, variance: 4, n: 60 });
	assert.equal(cold.verdict, 'below');
	assert.equal(compare({ actual: 9, expected: 0, variance: 4, n: 10 }).verdict, 'insufficient', 'ten hands never say hot or cold');
	assert.equal(compare({ actual: 1, expected: 0, variance: 4, n: 60 }).verdict, 'as-expected');
});

test('methodology check: with no skill and honest dealing, "hot", "cold" and "play" calls are rare', () => {
	let flagged = 0;
	let trials = 60;
	for (let t = 0; t < trials; t++) {
		const { records, ownsByHand } = simulateTeenPatti({ hands: 120, seed: 1000 + t });
		const tp = skillLuck({ facts: factsFor(records, 'me'), owns: ownsByHand }).games['teen-patti'];
		if (tp.cards.verdict === 'above' || tp.cards.verdict === 'below') flagged++;
		if (tp.play.verdict === 'above' || tp.play.verdict === 'below') flagged++;
	}
	// Two tests per trial at 5%: about 6 expected of 120. Allow a generous but meaningful ceiling.
	assert.ok(flagged <= 16, `false-positive rate too high: ${flagged} of ${trials * 2}`);
});

test('packing hands that are worth less than nothing counts as good play, on identical deals', () => {
	let better = 0;
	for (let t = 0; t < 12; t++) {
		const smart = simulateTeenPatti({ hands: 200, seed: 2000 + t, packRule: (cards) => teenPattiEquity('classic-1', cards, 3).equity < 0.12 });
		const flat = simulateTeenPatti({ hands: 200, seed: 2000 + t });
		const s = skillLuck({ facts: factsFor(smart.records, 'me'), owns: smart.ownsByHand }).games['teen-patti'];
		const f = skillLuck({ facts: factsFor(flat.records, 'me'), owns: flat.ownsByHand }).games['teen-patti'];
		if (s.play.difference > f.play.difference) better++;
		assert.equal(s.decisions.packedStrongHands.k, 0, 'the careful player never packs a strong hand');
	}
	assert.equal(better, 12);
});

test('packing a strong hand is costly: play drops and the signal shows', () => {
	const reckless = simulateTeenPatti({ hands: 200, seed: 77, packRule: (cards) => teenPattiEquity('classic-1', cards, 3).equity > 0.4 });
	const flat = simulateTeenPatti({ hands: 200, seed: 77 });
	const r = skillLuck({ facts: factsFor(reckless.records, 'me'), owns: reckless.ownsByHand }).games['teen-patti'];
	const f = skillLuck({ facts: factsFor(flat.records, 'me'), owns: flat.ownsByHand }).games['teen-patti'];
	assert.ok(r.play.difference < f.play.difference);
	assert.ok(r.decisions.packedStrongHands.k > 0);
});

test('Blackjack mistakes are exact: a wrong hit on 20 costs over a bet, a right stand costs nothing', () => {
	const twenty = blackjackEv([c(10), c(10, 'hearts')], 10);
	assert.ok(twenty.best - twenty.hit > 1.2);
	assert.equal(twenty.best - twenty.stand, 0);
});

/* ---------------------------------------- improvement ---------------------------------------- */

const row = (day, residual, game = 'teen-patti') => ({ fact: { completedAt: T0 + day * DAY, nightId: `n${day}`, handId: `h${day}-${residual}-${Math.random()}`, complete: true, stake: true, units: 0 }, game, residual, variance: 0.18, equity: 0.25 });
const emptySet = { decisions: [], hands: [] };

test('luck is not improvement: better results from better cards do not make a "improving" verdict', () => {
	const rows = [];
	const facts = [];
	// Earlier: 90 hands, wins as expected from cards. Recent: 60 hands, same play, but results look better.
	for (let i = 0; i < 90; i++) rows.push(row(-60 + (i % 30), i % 4 === 0 ? 0.75 : -0.25));
	for (let i = 0; i < 60; i++) rows.push(row(i % 25, i % 4 === 0 ? 0.75 : -0.25));
	for (let i = 0; i < 90; i++) facts.push({ completedAt: T0 + (-60 + (i % 30)) * DAY, nightId: `o${i % 10}`, complete: true, stake: true, units: i % 3 === 0 ? 3 : -1 });
	for (let i = 0; i < 60; i++) facts.push({ completedAt: T0 + (i % 25) * DAY, nightId: `r${i % 8}`, complete: true, stake: true, units: i % 2 === 0 ? 4 : -1 });
	const out = improvement({ rows, facts, set: emptySet, now: T0 + 30 * DAY });
	assert.notEqual(out.verdict, 'improving');
	assert.deepEqual(out.headlineDimensions, ['play-beyond-cards:teen-patti']);
});

test('real improvement shows when play beyond the cards rises, with the sample to back it', () => {
	const rows = [];
	for (let i = 0; i < 160; i++) rows.push(row(-60 + (i % 30), i % 4 === 0 ? 0.75 : -0.25)); // average residual 0
	for (let i = 0; i < 140; i++) rows.push(row(i % 25, i % 2 === 0 ? 0.75 : -0.25)); // average +0.25
	const out = improvement({ rows, facts: [], set: emptySet, now: T0 + 30 * DAY });
	assert.equal(out.verdict, 'improving');
	assert.equal(out.dimensions.find((d) => d.id === 'play-beyond-cards:teen-patti').direction, 'better');
});

test('too little history says so; style change is described, never scored', () => {
	const out = improvement({ rows: [row(1, 0.5)], facts: [], set: emptySet, now: T0 + 30 * DAY });
	assert.equal(out.verdict, 'not-enough');
	for (const d of out.dimensions.filter((d) => d.kind === 'style')) assert.ok(!['better', 'worse'].includes(d.direction));
});

test('every variant with a card-only strength model ships a generated table, and each table is a proper distribution', () => {
	const modelled = listVariants().map((v) => v.rulesVersion).filter((id) => strengthModelFor(id));
	assert.ok(modelled.length >= 5);
	for (const id of modelled) {
		const rows = TP_STRENGTH[id];
		assert.ok(rows, `${id} needs a table: run node scripts/generate-tp-strength.mjs`);
		const total = rows.reduce((s, [, , tie]) => s + tie, 0);
		assert.ok(Math.abs(total - 1) < 1e-6, `${id} probabilities sum to ${total}`);
		for (let i = 1; i < rows.length; i++) assert.ok(rows[i][1] >= rows[i - 1][1], 'ordered weakest to strongest');
	}
});
