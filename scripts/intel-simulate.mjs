/**
 * Validate the Phase 5 methodology itself, not just its code (docs/archive/ANALYTICS_PHASE5.md, "Validation").
 * Everything is seeded and runs on the real evaluators, with known ground truth:
 *   - honest dealing and honest play must rarely look hot, cold or skilled
 *   - real skill and real luck must be found, and kept apart
 *   - surprise detection and the fairness center must not cry wolf, and must catch what is real
 *   - bots: exploitability and style comparison on identical deals
 *   node scripts/intel-simulate.mjs [trials=120]
 */
import { skillLuck, compare } from '../server/analytics/intel/skill-luck.mjs';
import { teenPattiEquity } from '../server/analytics/intel/strength.mjs';
import { nightSurprises } from '../server/analytics/intel/surprise.mjs';
import { fairnessCenter } from '../server/analytics/intel/fairness.mjs';
import { exploitProfile, compareStyles } from '../server/bots/exploit-sim.mjs';
import { CHARACTER_SEEDS } from '../server/bots/characters.mjs';
import { freshDeck } from '../server/classic.mjs';
import { simulateTeenPatti, factsFor, seeded, shuffle, T0, DAY } from '../tests/server/helpers/intel.mjs';

const trials = Number(process.argv[2] ?? 120);
const rate = (k, n) => Math.round((k / n) * 1000) / 1000;
const out = {};

/* 1. Skill versus luck ------------------------------------------------------------------- */
{
	const run = (opts, n) => {
		let cardsFlag = 0;
		let playAbove = 0;
		let playBelow = 0;
		let identity = 0;
		for (let t = 0; t < n; t++) {
			const sim = simulateTeenPatti({ hands: 240, seed: 9000 + t, ...opts(t) });
			const g = skillLuck({ facts: factsFor(sim.records, 'me'), owns: sim.ownsByHand }).games['teen-patti'];
			if (['above', 'below'].includes(g.cards.verdict)) cardsFlag++;
			if (g.play.verdict === 'above') playAbove++;
			if (g.play.verdict === 'below') playBelow++;
			if (Math.abs(g.cards.actual + g.play.difference - g.outcome.actual) < 0.05) identity++;
		}
		return { trials: n, cardsCalledHotOrCold: rate(cardsFlag, n), playCalledAbove: rate(playAbove, n), playCalledBelow: rate(playBelow, n), cardsPlusPlayEqualsOutcome: rate(identity, n) };
	};
	out.skillLuck = {
		honestPlayHonestDeal: run(() => ({}), trials),
		skilledFolder: run(() => ({ packRule: (cards) => teenPattiEquity('classic-1', cards, 3).equity < 0.12 }), trials),
		recklessFolder: run(() => ({ packRule: (cards) => teenPattiEquity('classic-1', cards, 3).equity > 0.4 }), trials)
	};
	// Luck of the cards without skill: the viewer is dealt the better of two hands.
	let hot = 0;
	let playFlag = 0;
	for (let t = 0; t < trials; t++) {
		const rng = seeded(40000 + t);
		const ids = ['me', 'p1', 'p2', 'p3'];
		const records = [];
		const owns = [];
		const sim = simulateTeenPatti({ hands: 0 });
		void sim;
		for (let i = 0; i < 240; i++) {
			const deck = shuffle(freshDeck(), rng);
			const a = deck.slice(0, 3);
			const b = deck.slice(12, 15);
			const mine = teenPattiEquity('classic-1', a, 3).equity >= teenPattiEquity('classic-1', b, 3).equity ? a : b;
			const hands = { me: mine, p1: deck.slice(3, 6), p2: deck.slice(6, 9), p3: deck.slice(9, 12) };
			let best = 'me';
			const better = (x, y) => teenPattiEquity('classic-1', x, 3).equity > teenPattiEquity('classic-1', y, 3).equity;
			for (const id of ids) if (better(hands[id], hands[best])) best = id;
			const { hand } = await import('../tests/server/helpers/records.mjs');
			const seats = ids.map((id) => ({ p: id, net: id === best ? 90 : -30, contributed: 30, exit: id === best ? 'won' : 'lost' }));
			records.push(hand({ id: `lucky${t}-${i}`, at: T0 + Math.floor(i / 20) * DAY + (i % 20) * 60_000, night: `room:l${Math.floor(i / 20)}`, seats, winners: [best], boot: 10, pot: 120 }));
			owns.push({ handId: records.at(-1)._id, p: 'me', gameType: 'teen-patti', rulesVersion: 'classic-1', dealt: mine, final: mine });
		}
		const g = skillLuck({ facts: factsFor(records, 'me'), owns: new Map(owns.map((o) => [o.handId, o])) }).games['teen-patti'];
		if (g.cards.verdict === 'above') hot++;
		if (g.play.verdict === 'above' || g.play.verdict === 'below') playFlag++;
	}
	out.skillLuck.luckyCardsNoSkill = { trials, cardsCalledAbove: rate(hot, trials), playCalledEither: rate(playFlag, trials) };
}

/* 2. Small samples ---------------------------------------------------------------------- */
out.smallSamples = Object.fromEntries([5, 10, 20, 29, 30, 60].map((n) => [`n=${n}`, compare({ actual: 3.5, expected: 0, variance: n * 0.25, n }).verdict]));

/* 3. Surprise detection ---------------------------------------------------------------- */
{
	const make = (night, usual, seed) => {
		const rng = seeded(seed);
		const decisions = [];
		const facts = [];
		const dec = (handId, raise) => ({ handId, betting: true, game: 'teen-patti', options: { raise: true, fold: true }, action: raise ? 'raise' : 'call', facing: 'none' });
		for (let h = 0; h < 40; h++) {
			facts.push({ handId: `o${h}`, nightId: `room:o${h >> 3}`, completedAt: T0 + h * 60_000, startedAt: T0 + h * 60_000 - 1, complete: true, stake: true, units: 0, potUnits: 10 });
			for (let k = 0; k < 4; k++) decisions.push(dec(`o${h}`, rng() < usual));
		}
		for (let h = 0; h < 8; h++) {
			facts.push({ handId: `n${h}`, nightId: 'room:tonight', completedAt: T0 + DAY + h * 60_000, startedAt: T0 + DAY + h * 60_000 - 1, complete: true, stake: true, units: 0, potUnits: 10 });
			for (let k = 0; k < 3; k++) decisions.push(dec(`n${h}`, rng() < night));
		}
		return nightSurprises({ nightId: 'room:tonight', facts, set: { decisions, hands: [] } }).some((s) => s.type.endsWith('night'));
	};
	const n = Math.max(trials * 10, 1200);
	let fp = 0;
	let power = 0;
	for (let t = 0; t < n; t++) {
		if (make(0.3, 0.3, 100 + t)) fp++;
		if (make(0.6, 0.3, 90_000 + t)) power++;
	}
	out.surprise = { trials: n, falsePositiveWhenNothingChanged: rate(fp, n), foundWhenRaisingDoubles: rate(power, n) };
}

/* 4. Fairness center ------------------------------------------------------------------- */
{
	const deals = (hands, seed, tilt) => {
		const rng = seeded(seed);
		return Array.from({ length: hands }, (_, i) => {
			const dealt = shuffle(freshDeck(), rng).slice(0, 3);
			return { handId: `f${i}`, gameType: 'teen-patti', rulesVersion: 'classic-1', dealt: tilt && i % tilt === 0 ? [{ rank: 14, suit: 'spades' }, ...dealt.slice(1)] : dealt, final: [] };
		});
	};
	const n = Math.max(trials, 120);
	let alarms = 0;
	let caught = 0;
	let caughtSubtle = 0;
	for (let t = 0; t < n; t++) {
		if (fairnessCenter({ owns: deals(150, 500 + t) }).you.verdict === 'unusual') alarms++;
		if (fairnessCenter({ owns: deals(150, 800 + t, 3) }).you.verdict === 'unusual') caught++;
		if (fairnessCenter({ owns: deals(300, 1500 + t, 10) }).you.verdict === 'unusual') caughtSubtle++;
	}
	out.fairness = { trials: n, falseAlarmFairDeck150Hands: rate(alarms, n), caughtAceEveryThirdHand150Hands: rate(caught, n), caughtAceEveryTenthHand300Hands: rate(caughtSubtle, n) };
}

/* 5. Bots ------------------------------------------------------------------------------ */
{
	const hands = Number(process.env.BOT_HANDS ?? 60);
	out.bots = { hands, note: 'Boots a hand the exploiter wins from each style; identical deals. Seated first, two players, Classic.', styles: {} };
	for (const seed of CHARACTER_SEEDS) {
		const profile = exploitProfile(seed.style.tendencies, { hands });
		out.bots.styles[seed.bot._id] = { strongest: profile.strongest.name, edge: profile.strongest.perHand, byStrategy: Object.fromEntries(Object.entries(profile.strategies).map(([k, v]) => [k, v.perHand])) };
	}
	const base = CHARACTER_SEEDS[0].style.tendencies;
	out.bots.identicalStyleComparison = compareStyles(base, base, { hands: 40, only: ['always-raise', 'tight-value'] }).verdict;
	const shift = compareStyles(base, { ...base, call: 0.05, bluff: 0.4, randomness: 0.5, raise: 0.99 }, { hands: 80 });
	out.bots.veryDifferentStyleComparison = { verdict: shift.verdict, distinguishableStrategies: shift.rows.filter((r) => r.distinguishable).map((r) => r.strategy) };
}

console.log(JSON.stringify(out, null, 2));
