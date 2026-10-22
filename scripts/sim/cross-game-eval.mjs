/**
 * Cross-game character evaluation (docs/archive/bots/CROSS_GAME_EVAL.md): does each character keep its
 * identity across Teen Patti, 3 2 5, 10 Pakad and 29? Character identity is DNA; strategy is per game.
 *   node scripts/sim/cross-game-eval.mjs > docs/bots/cross-game/eval-81.json
 *
 * For each game, one "boldness" measure of the same meaning (taking the initiative, spending strength,
 * committing), from that game's own evaluation:
 *   Teen Patti  raise share of actions (measured here: seat 0 on matched tables against legacy bots)
 *   3 2 5       contest rate (docs/games/325-phase2/results/eval-52-p2.json)
 *   10 Pakad    early trumping + streak pressing (docs/games/10pakad/results/eval-61.json)
 *   29          bid rate (docs/games/29/results/eval-71.json)
 * and one "patience" measure (keeping strength back): Teen Patti pack rate on weak hands, 3 2 5 the
 * opposite of early trump leads, 10 Pakad the opposite of early trumping, 29 make rate of won bids.
 * The DNA predicts each character's boldness (riskTolerance + aggression + ego - discipline - patience)
 * and patience (patience + discipline - riskTolerance). Reported: each game's ranking of the five, the
 * rank agreement (Spearman) of every game with the DNA prediction, and per character how often its
 * rank in a game sits on the same side of the middle as the DNA predicts.
 */
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { runPool } from './pool.mjs';
import { combine, measure } from '../../server/sim/evaluate.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';

const SEED = 81;
const CHARS = Object.keys(CANONICAL_STYLES);
const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));

// Teen Patti: each canonical character in seat 0 against four legacy bots, matched tables.
const T = 60;
const specs = [];
for (const c of CHARS)
	for (let t = 0; t < T; t++)
		specs.push({
			seed: SEED,
			table: 900 + t,
			hands: 100,
			seats: [
				CANONICAL_STYLES[c]._id,
				'legacy-normal',
				'legacy-hard',
				'legacy-easy',
				'legacy-normal'
			],
			matched: true,
			summary: { seats: [0] },
			meta: { c }
		});
const res = (await runPool(specs, Math.max(1, availableParallelism() - 1))).map((r) => ({
	...r,
	...r.meta
}));
const tp = Object.fromEntries(
	CHARS.map((c) => [c, measure(combine(res.filter((r) => r.c === c).map((r) => r.seats[0])))])
);

const p325 = read('docs/games/325-phase2/results/eval-52-p2.json').profiles;
const pakad = read('docs/games/10pakad/results/eval-61.json').characters;
const g29 = read('docs/games/29/results/eval-71.json').characters;

const boldness = {
	'teen-patti': (c) => tp[c].aggression,
	'three-two-five': (c) => p325[c].contestRate,
	'ten-pakad': (c) => pakad[c].style.trumpEarly + pakad[c].style.pressStreak,
	'twenty-nine': (c) => g29[c].style.bidRate
};
const patience = {
	'teen-patti': (c) => (tp[c].weakCallRate === null ? 0 : -tp[c].weakCallRate),
	'three-two-five': (c) => -p325[c].earlyTrumpLeadRate,
	'ten-pakad': (c) => -pakad[c].style.trumpEarly,
	'twenty-nine': (c) => g29[c].style.makeRate
};
const dna = (c) => CANONICAL_STYLES[c].tendencies.dna;
const predicted = {
	boldness: (c) =>
		dna(c).riskTolerance + dna(c).aggression + dna(c).ego - dna(c).discipline - dna(c).patience,
	patience: (c) => dna(c).patience + dna(c).discipline - dna(c).riskTolerance
};

const rank = (f) => {
	const order = CHARS.slice().sort((a, b) => f(b) - f(a));
	return Object.fromEntries(CHARS.map((c) => [c, order.indexOf(c) + 1]));
};
const spearman = (a, b) => {
	const n = CHARS.length;
	const d2 = CHARS.reduce((s, c) => s + (a[c] - b[c]) ** 2, 0);
	return +(1 - (6 * d2) / (n * (n * n - 1))).toFixed(2);
};

const out = { seed: SEED, teenPattiTables: T, axes: {} };
for (const [axis, games] of [
	['boldness', boldness],
	['patience', patience]
]) {
	const want = rank(predicted[axis]);
	const ranks = Object.fromEntries(Object.entries(games).map(([g, f]) => [g, rank(f)]));
	const values = Object.fromEntries(
		Object.entries(games).map(([g, f]) => [
			g,
			Object.fromEntries(CHARS.map((c) => [c, +f(c).toFixed(3)]))
		])
	);
	const agreement = Object.fromEntries(
		Object.entries(ranks).map(([g, r]) => [g, spearman(r, want)])
	);
	// Same side of the middle (rank 1-2 vs 4-5; rank 3 counts as agreeing) as the DNA predicts.
	const side = (r) => (r < 3 ? 1 : r > 3 ? -1 : 0);
	const consistency = Object.fromEntries(
		CHARS.map((c) => {
			const games4 = Object.values(ranks).map((r) => side(r[c]));
			const agree = games4.filter(
				(s) => s === 0 || side(want[c]) === 0 || s === side(want[c])
			).length;
			return [c, `${agree}/4`];
		})
	);
	out.axes[axis] = { predicted: want, ranks, values, agreement, consistency };
	console.error(
		axis,
		'agreement with DNA',
		JSON.stringify(agreement),
		'consistency',
		JSON.stringify(consistency)
	);
}
console.log(JSON.stringify(out, null, '\t'));
