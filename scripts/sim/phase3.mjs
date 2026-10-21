/**
 * Phase 3 search (BOT_BRAIN.md §29): individual character tuning by population search.
 *
 *   node scripts/sim/phase3.mjs [--seed 41] [--generations 4] [--children 12] [--scale 1]
 *
 * For every character separately, each generation:
 *   1. children: generation 0 is the ancestor's DNA on tp-dna@4 plus mutations of it; later
 *      generations mutate and cross the best two so far (ancestry kept);
 *   2. screening: a small matched run against the frozen ancestor (same tables, opponents, cards,
 *      opponent draws), fresh tables each generation;
 *   3. selection, never on one number: hard gates first (bad actions no worse than the ancestor,
 *      the character's core bands not broken), then fidelity (band violations), then competence
 *      (paired gain over the ancestor) only to separate candidates of similar fidelity;
 *   4. medium evaluation for the best three: more tables, every adaptation scenario.
 * Then the best two of each character (any generation) get a large finalist evaluation, and the
 * best finalist is chosen only if it is more faithful than the ancestor and not clearly weaker.
 *
 * Offline only. Every candidate is recorded in the league (.sim/phase3/league-<seed>.json) with its
 * parent, genome, stage results and why it was kept or rejected. Nothing is published.
 */
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runPool } from './pool.mjs';
import { CHARACTER_IDS } from '../../server/sim/population.mjs';
import { stream } from '../../server/sim/seeds.mjs';
import {
	opponents,
	seatsFor,
	ADAPT_TYPES,
	combine,
	measure,
	ci,
	withReference
} from '../../server/sim/evaluate.mjs';
import {
	ancestorGenome,
	mutate,
	crossover,
	candidateStyle,
	drift
} from '../../server/sim/candidates.mjs';
import { judgeBands, TARGETS_VERSION } from '../../server/sim/targets.mjs';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const SEED = arg('seed', 41);
const GENERATIONS = arg('generations', 4);
const CHILDREN = arg('children', 12);
const SCALE = arg('scale', 1);
const ONLY = process.argv.includes('--only')
	? process.argv[process.argv.indexOf('--only') + 1].split(',')
	: CHARACTER_IDS;
const STAGES = {
	screen: {
		tables: Math.round(40 * SCALE),
		hands: 150,
		adapt: ['human-very-conservative', 'human-station', 'human-maniac'],
		adaptTables: Math.max(2, Math.round(4 * SCALE))
	},
	medium: {
		tables: Math.round(150 * SCALE),
		hands: 200,
		adapt: ADAPT_TYPES,
		adaptTables: Math.max(2, Math.round(8 * SCALE))
	},
	final: {
		tables: Math.round(500 * SCALE),
		hands: 200,
		adapt: ADAPT_TYPES,
		adaptTables: Math.max(4, Math.round(24 * SCALE))
	}
};
/** Tolerances for selection. */
const BAD_SLACK = 0.015; // bad-action rate may exceed the ancestor's by at most this much
const FIDELITY_TIE = 0.1; // violation scores this close (relative) are "as faithful"
const threads = Math.max(1, availableParallelism() - 1);

const league = {
	seed: SEED,
	targets: TARGETS_VERSION,
	stages: STAGES,
	started: new Date().toISOString(),
	candidates: {},
	generations: [],
	hands: 0,
	decisions: 0,
	seconds: 0
};
const save = () => {
	mkdirSync(new URL('../../.sim/phase3/', import.meta.url), { recursive: true });
	writeFileSync(
		new URL(`../../.sim/phase3/league-${SEED}.json`, import.meta.url),
		JSON.stringify(league)
	);
};

/** Evaluate heroes (each { key, character, member }) at one stage on tables `label`, matched with the ancestor. */
async function evaluate(stage, label, heroes) {
	const S = STAGES[stage];
	const specs = [];
	const byCharacter = new Map();
	for (const h of heroes) byCharacter.set(h.character, true);
	// The ancestor of every character plays the same tables, for paired comparison.
	const all = [
		...heroes,
		...[...byCharacter.keys()].map((c) => ({
			key: `${c}@3`,
			character: c,
			member: `${c}@3`,
			ancestor: true
		})),
		// The stateless Phase 1.1 version: the table effect on reactions to events.
		...[...byCharacter.keys()].map((c) => ({
			key: `${c}@2`,
			character: c,
			member: `${c}@2`,
			reference: true
		}))
	];
	for (const h of all) {
		for (let t = 0; t < S.tables; t++) {
			const { seats, heroSeat } = seatsFor(h.member, opponents(SEED, label, t, h.character), t);
			specs.push({
				run: 'pop',
				key: h.key,
				table: t,
				seed: SEED,
				hands: S.hands,
				seats,
				matched: true,
				summary: { seats: [heroSeat] }
			});
		}
		if (!h.reference)
			for (const type of S.adapt)
				for (let t = 0; t < S.adaptTables; t++)
					specs.push({
						run: `adapt:${type}`,
						key: h.key,
						table: 7000 + t,
						seed: SEED,
						hands: 200,
						seats: [h.member, type, type, type, type],
						matched: true,
						summary: { seats: [0] }
					});
	}
	const t0 = performance.now();
	const results = await runPool(specs, threads);
	league.seconds += (performance.now() - t0) / 1000;
	league.hands += specs.reduce((s, x) => s + x.hands, 0);
	league.decisions += results.reduce((s, r) => s + r.decisions, 0);
	const out = {};
	for (const h of all) {
		const pop = results
			.filter((r) => r.key === h.key && r.run === 'pop')
			.sort((a, b) => a.table - b.table);
		const byType = {};
		for (const type of S.adapt) {
			const rs = results.filter((r) => r.key === h.key && r.run === `adapt:${type}`);
			if (rs.length) byType[type] = combine(rs.map((r) => r.seats[0]));
		}
		out[h.key] = {
			measures: measure(combine(pop.map((r) => r.seats[0])), byType),
			perTable: pop.map((r) => (r.seats[0].total.net / r.seats[0].hands) * 100)
		};
	}
	// Reactions beyond the stateless version of the same character, on the same tables.
	for (const h of all)
		if (!h.reference)
			out[h.key].measures = withReference(out[h.key].measures, out[`${h.character}@2`].measures);
	// Paired difference with the ancestor, table by table.
	for (const h of heroes) {
		const anc = out[`${h.character}@3`].perTable;
		out[h.key].paired = ci(out[h.key].perTable.map((x, i) => x - anc[i]));
		out[h.key].boots = ci(out[h.key].perTable);
	}
	for (const c of byCharacter.keys()) out[`${c}@3`].boots = ci(out[`${c}@3`].perTable);
	return out;
}

/** Selection record for one candidate at one stage. */
function judge(character, result, ancestor) {
	const bands = judgeBands(character, result.measures);
	const ancestorBands = judgeBands(character, ancestor.measures);
	const bad = result.measures.badActionRate ?? 0;
	const gates = [];
	if (bad > (ancestor.measures.badActionRate ?? 0) + BAD_SLACK)
		gates.push(
			`bad actions ${(bad * 100).toFixed(1)}% vs ancestor ${((ancestor.measures.badActionRate ?? 0) * 100).toFixed(1)}%`
		);
	for (const b of bands.results)
		if (b.core && !b.pass && b.miss > 0.5) gates.push(`core band ${b.key} far outside`);
	return {
		violation: bands.violation,
		passed: bands.passed,
		total: bands.results.length,
		ancestorViolation: ancestorBands.violation,
		ancestorPassed: ancestorBands.passed,
		paired: result.paired,
		bad,
		gates,
		eligible: gates.length === 0
	};
}

/** Rank: eligible first, then fidelity (violation, ties within FIDELITY_TIE), then paired gain. */
function rank(rows) {
	return rows.slice().sort((a, b) => {
		if (a.j.eligible !== b.j.eligible) return a.j.eligible ? -1 : 1;
		const scale = Math.max(a.j.violation, b.j.violation, 0.05);
		if (Math.abs(a.j.violation - b.j.violation) / scale > FIDELITY_TIE)
			return a.j.violation - b.j.violation;
		return b.j.paired.mean - a.j.paired.mean;
	});
}

const record = (style, character) => {
	league.candidates[style._id] = {
		id: style._id,
		character,
		parent: style.parent,
		ancestor: style.ancestor,
		generation: style.generation,
		changed: style.changed,
		configHash: style.configHash,
		genome: { dna: style.tendencies.dna, quirks: style.tendencies.quirks },
		drift: drift(character, { dna: style.tendencies.dna }),
		stages: {},
		status: 'screening'
	};
};

const best = Object.fromEntries(ONLY.map((c) => [c, []])); // medium-evaluated, ranked rows
const styles = {};
let counter = Object.fromEntries(ONLY.map((c) => [c, 0]));

for (let g = 0; g < GENERATIONS; g++) {
	const gen = { generation: g, screened: 0, medium: [], kept: {} };
	const heroes = [];
	for (const c of ONLY) {
		const random = stream(SEED, 'children', c, g).random;
		const parents = best[c].slice(0, 2).map((r) => styles[r.id]);
		const genomeOf = (s) => ({
			dna: { ...s.tendencies.dna },
			quirks: s.tendencies.quirks.map((q) => ({ ...q })),
			tempo: { ...s.tendencies.tempo }
		});
		for (let i = 0; i < CHILDREN; i++) {
			let genome;
			let parent;
			if (g === 0) {
				parent = `${c}@3`;
				genome =
					i === 0
						? { ...ancestorGenome(c), changed: [] }
						: mutate(c, ancestorGenome(c), random, { sigma: 0.08, count: 3 });
			} else if (i < CHILDREN * 0.5 || parents.length < 2) {
				parent = parents[0]._id;
				genome = mutate(c, genomeOf(parents[0]), random, { sigma: 0.05, count: 2 });
			} else if (i < CHILDREN * 0.75) {
				parent = parents[1]._id;
				genome = mutate(c, genomeOf(parents[1]), random, { sigma: 0.05, count: 2 });
			} else {
				parent = `${parents[0]._id}×${parents[1]._id}`;
				genome = mutate(c, crossover(genomeOf(parents[0]), genomeOf(parents[1]), random), random, {
					sigma: 0.03,
					count: 1
				});
			}
			const id = `${c}@4-c${String(counter[c]++).padStart(3, '0')}`;
			const style = candidateStyle(c, genome, {
				id,
				parent,
				generation: g,
				changed: genome.changed ?? []
			});
			styles[id] = style;
			record(style, c);
			heroes.push({ key: id, character: c, member: { id, style } });
		}
	}
	console.log(`generation ${g}: screening ${heroes.length} candidates`);
	const screen = await evaluate('screen', `screen-${g}`, heroes);
	gen.screened = heroes.length;
	const promote = [];
	for (const c of ONLY) {
		const anc = screen[`${c}@3`];
		const rows = heroes
			.filter((h) => h.character === c)
			.map((h) => ({ id: h.key, j: judge(c, screen[h.key], anc) }));
		for (const r of rows) {
			league.candidates[r.id].stages.screen = { ...r.j, measures: screen[r.id].measures };
			league.candidates[r.id].status = 'rejected at screening';
		}
		for (const r of rank(rows).slice(0, 3)) promote.push(heroes.find((h) => h.key === r.id));
	}
	console.log(`generation ${g}: medium evaluation of ${promote.length}`);
	const medium = await evaluate('medium', `medium-${g}`, promote);
	for (const c of ONLY) {
		const anc = medium[`${c}@3`];
		league.ancestors ??= {};
		(league.ancestors[c] ??= {})[`medium-${g}`] = {
			measures: anc.measures,
			boots: anc.boots,
			bands: judgeBands(c, anc.measures)
		};
		for (const h of promote.filter((x) => x.character === c)) {
			const j = judge(c, medium[h.key], anc);
			league.candidates[h.key].stages.medium = {
				...j,
				measures: medium[h.key].measures,
				boots: medium[h.key].boots
			};
			league.candidates[h.key].status = j.eligible
				? 'medium'
				: `rejected at medium: ${j.gates.join('; ')}`;
			best[c].push({ id: h.key, j });
		}
		best[c] = rank(best[c]);
		gen.kept[c] = best[c].slice(0, 2).map((r) => r.id);
		gen.medium.push(...promote.filter((x) => x.character === c).map((x) => x.key));
	}
	league.generations.push(gen);
	save();
	console.log(
		`generation ${g} done: ${league.hands.toLocaleString()} hands so far, ${league.seconds.toFixed(0)} s`
	);
}

// Finalists: the best two of each character across all generations.
const finalists = [];
for (const c of ONLY)
	for (const r of best[c].filter((x) => x.j.eligible).slice(0, 2))
		finalists.push({ key: r.id, character: c, member: { id: r.id, style: styles[r.id] } });
console.log(`finalist evaluation of ${finalists.length}`);
const final = await evaluate('final', 'final', finalists);
league.final = {};
for (const c of ONLY) {
	const anc = final[`${c}@3`];
	const rows = finalists
		.filter((f) => f.character === c)
		.map((f) => ({ id: f.key, j: judge(c, final[f.key], anc) }));
	for (const r of rows) {
		league.candidates[r.id].stages.final = {
			...r.j,
			measures: final[r.id].measures,
			boots: final[r.id].boots
		};
		league.candidates[r.id].status = 'finalist';
	}
	const ranked = rank(rows);
	// Chosen only if more faithful than the ancestor and not clearly weaker (paired CI).
	const top = ranked[0];
	const better = top && top.j.eligible && top.j.violation < top.j.ancestorViolation - 1e-9;
	const weaker = top && top.j.paired.mean + top.j.paired.ci < 0;
	league.final[c] = {
		ancestor: { measures: anc.measures, boots: anc.boots, bands: judgeBands(c, anc.measures) },
		chosen: better && !weaker ? top.id : null,
		reason: !top
			? 'no eligible finalist'
			: !better
				? 'no finalist more faithful than the ancestor'
				: weaker
					? 'best finalist clearly weaker than the ancestor'
					: 'more faithful and not weaker',
		ranking: ranked.map((r) => r.id)
	};
	if (league.final[c].chosen)
		league.candidates[league.final[c].chosen].status = 'chosen (awaiting review)';
}
league.finished = new Date().toISOString();
save();
console.log(
	`Phase 3 search: ${league.hands.toLocaleString()} hands, ${league.seconds.toFixed(0)} s. Chosen:`,
	Object.fromEntries(ONLY.map((c) => [c, league.final[c].chosen]))
);
