/**
 * Phase 3 final study (BOT_BRAIN.md §29): the final candidate of every character (from a search
 * league, scripts/sim/phase3.mjs) against its frozen Phase 2 ancestor (@3), on matched tables.
 * Measurement only: nothing is published.
 *
 *   node scripts/sim/phase3-report.mjs [--league .sim/phase3/league-41.json] [--seed 51] [--scale 1] [--md <path>]
 *
 * Runs (real engine, every deck and decision seeded, summaries only so memory stays flat):
 *  - pop: final, ancestor (@3) and stateless reference (@2) of each character in the same seat at
 *    the same population tables, with the same opponents, cards and opponent draws.
 *  - adapt: final and ancestor against four copies of each adaptation opponent type.
 *  - match: final and ancestor against four copies of every archetype, baseline, legacy bot and
 *    other character (@3): the matchup matrices.
 *  - sessions: the same table with different decision seeds; different tables; three different
 *    opponent populations. Within-character variation and between-character distance.
 * In process: decision traces (§19), deterministic reproduction, mind size. Timing runs in a
 * fresh process (scripts/sim/bench.mjs).
 *
 * Writes docs/bots/PHASE3_REPORT.md (never a reviewed report) and .sim/phase3/final-<seed>.json.
 */
import { availableParallelism } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runPool } from './pool.mjs';
import { CHARACTER_IDS, REFERENCE_IDS } from '../../server/sim/population.mjs';
import { ARCHETYPE_IDS, ARCHETYPE_EXPECT } from '../../server/sim/archetypes.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';
import {
	opponents,
	seatsFor,
	ADAPT_TYPES,
	combine,
	measure,
	ci,
	withReference
} from '../../server/sim/evaluate.mjs';
import { metrics, FEATURES, featureVector } from '../../server/sim/fingerprint.mjs';
import { identifyWindows, classify } from '../../server/sim/identify.mjs';
import { ancestorGenome, candidateStyle, drift } from '../../server/sim/candidates.mjs';
import { judgeBands, TARGETS, TARGETS_VERSION } from '../../server/sim/targets.mjs';
import { runTable, reproduceHand, SIM_VERSION } from '../../server/sim/table.mjs';
import { judgeDecision, JUDGE_VERSION } from '../../server/sim/judge.mjs';
import { explainDecision } from '../../server/sim/explain.mjs';
import { castMember } from '../../src/lib/bots/cast.js';

const argv = process.argv;
const opt = (name, fallback) =>
	argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback;
const SEED = Number(opt('seed', 51));
const SCALE = Number(opt('scale', 1));
const LEAGUE = opt('league', new URL('../../.sim/phase3/league-41.json', import.meta.url).pathname);
const HANDS = 200;
const POP_TABLES = Math.round(400 * SCALE);
const ADAPT_TABLES = Math.max(4, Math.round(24 * SCALE));
const MATCH_TABLES = Math.max(2, Math.round(10 * SCALE));
const SESSIONS = Math.max(4, Math.round(20 * SCALE));
const POP_SESSIONS = Math.max(4, Math.round(16 * SCALE));
const WINDOWS = [10, 25, 50, 100];
const threads = Math.max(1, availableParallelism() - 1);
const league = JSON.parse(readFileSync(LEAGUE, 'utf8'));
const name = (c) => castMember(c)?.name ?? c;

/* ------------------------------------- the finals ------------------------------------- */

const FINAL = {};
for (const c of CHARACTER_IDS) {
	const f = league.final?.[c];
	const id = f?.chosen ?? f?.ranking?.[0] ?? null;
	const cand = id ? league.candidates[id] : null;
	const genome = cand
		? { dna: cand.genome.dna, quirks: cand.genome.quirks, tempo: ancestorGenome(c).tempo }
		: ancestorGenome(c);
	const sid = id ?? `${c}@4-ancestor-dna`;
	FINAL[c] = {
		id: sid,
		chosen: !!f?.chosen,
		reason: f?.reason ?? 'no search result',
		genome,
		style: candidateStyle(c, genome, {
			id: sid,
			parent: cand?.parent ?? `${c}@3`,
			generation: cand?.generation ?? 0
		})
	};
}
const VERSIONS = {
	final: (c) => ({ id: FINAL[c].id, style: FINAL[c].style }),
	'@3': (c) => `${c}@3`,
	'@2': (c) => `${c}@2`
};
const pick = (list, n, ...key) => shuffle(list, stream(SEED, 'popvar', ...key).random).slice(0, n);
const POPULATIONS = {
	'human archetypes': (c, i) => pick(ARCHETYPE_IDS, 4, 'arch', c, i),
	'other characters, any version': (c, i) =>
		CHARACTER_IDS.filter((o) => o !== c).map(
			(o) => `${o}@${pick([1, 2, 3], 1, 'ver', c, i, o)[0]}`
		),
	'legacy bots and baselines': (c, i) => pick(REFERENCE_IDS, 4, 'ref', c, i)
};
const matchTypes = (c) => [
	...ARCHETYPE_IDS,
	...REFERENCE_IDS,
	...CHARACTER_IDS.filter((o) => o !== c).map((o) => `${o}@3`)
];

/* ---------------------------------------- plan ---------------------------------------- */

const specs = [];
const add = (spec) =>
	specs.push({ seed: SEED, hands: HANDS, matched: true, key: specs.length, ...spec });
for (const c of CHARACTER_IDS) {
	for (const [v, m] of Object.entries(VERSIONS))
		for (let t = 0; t < POP_TABLES; t++) {
			const { seats, heroSeat } = seatsFor(m(c), opponents(SEED, 'final-pop', t, c), t);
			add({ run: 'pop', c, v, table: t, seats, summary: { seats: [heroSeat], windows: WINDOWS } });
		}
	for (const v of ['final', '@3']) {
		const m = VERSIONS[v](c);
		const solo = (run, table, field, extra = {}) =>
			add({ run, c, v, table, seats: [m, ...field], summary: { seats: [0] }, ...extra });
		for (const type of ADAPT_TYPES)
			for (let t = 0; t < ADAPT_TABLES; t++)
				solo(`adapt:${type}`, 7000 + t, [type, type, type, type]);
		for (const type of matchTypes(c))
			for (let t = 0; t < MATCH_TABLES; t++)
				// A published character may sit only once: one copy and three balanced humans.
				solo(
					`match:${type}`,
					8000 + t,
					type.includes('@')
						? [type, 'human-balanced', 'human-balanced', 'human-balanced']
						: [type, type, type, type]
				);
		const field = opponents(SEED, 'session-same', 0, c);
		for (let i = 0; i < SESSIONS; i++)
			solo('same', 9000, field, { decisionSeed: SEED * 1000 + i, night: i });
		for (let i = 0; i < SESSIONS; i++)
			solo('varied', 9100 + i, opponents(SEED, 'session-varied', i, c));
		for (const [kind, fieldOf] of Object.entries(POPULATIONS))
			for (let i = 0; i < POP_SESSIONS; i++) solo(`popvar:${kind}`, 9300 + i, fieldOf(c, i));
	}
}

/* ---------------------------------------- run ---------------------------------------- */

let peakRss = 0;
const sampler = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 500);
const started = performance.now();
let lastLog = 0;
console.log(`final study: ${specs.length} tables on ${threads} workers`);
const raw = await runPool(specs, threads, (done, total) => {
	if (performance.now() - lastLog > 60000 || done === total) {
		lastLog = performance.now();
		console.log(
			`  ${done}/${total} tables, ${((performance.now() - started) / 1000).toFixed(0)} s`
		);
	}
});
const wallMs = performance.now() - started;
clearInterval(sampler);
const R = raw.map((r) => ({ ...r, spec: specs[r.key], s: r.seats[0] }));
if (raw.length !== specs.length)
	throw new Error(`${specs.length - raw.length} tables returned no result`);
const totalHands = specs.reduce((s, x) => s + x.hands, 0);
const totalDecisions = R.reduce((s, r) => s + r.decisions, 0);
const memory = { workerMb: Math.max(...R.map((r) => r.rssMb)), parentMb: peakRss / 2 ** 20 };
const slowest = R.reduce((m, r) => (r.ms > m.ms ? r : m));
const sel = (c, v, run) =>
	R.filter((r) => r.spec.c === c && r.spec.v === v && r.spec.run === run).sort(
		(a, b) => a.spec.table - b.spec.table || (a.spec.night ?? 0) - (b.spec.night ?? 0)
	);
const comb = (rs) => combine(rs.map((r) => r.s));

/* ------------------------------------- measurement ------------------------------------- */

const M = {}; // M[c][v] = { measures, fp, boots, perTable }
for (const c of CHARACTER_IDS) {
	M[c] = {};
	for (const v of Object.keys(VERSIONS)) {
		const pop = sel(c, v, 'pop');
		const total = comb(pop);
		const byType =
			v === '@2'
				? null
				: Object.fromEntries(ADAPT_TYPES.map((t) => [t, comb(sel(c, v, `adapt:${t}`))]));
		const perTable = pop.map((r) => (r.s.total.net / r.s.hands) * 100);
		M[c][v] = {
			measures: measure(total, byType),
			fp: metrics(total.total),
			total,
			byType,
			perTable,
			boots: ci(perTable)
		};
	}
	for (const v of ['final', '@3'])
		M[c][v].measures = withReference(M[c][v].measures, M[c]['@2'].measures);
	M[c].final.paired = ci(M[c].final.perTable.map((x, i) => x - M[c]['@3'].perTable[i]));
	for (const v of ['final', '@3']) M[c][v].bands = judgeBands(c, M[c][v].measures);
}

// Identifiability: k-hand windows of the hero seat at population tables (train even, test odd).
const windowRows = (v, k) =>
	CHARACTER_IDS.flatMap((c) =>
		sel(c, v, 'pop').flatMap((r) =>
			r.s.windows[k].map((t) => ({ table: r.spec.table, member: c, t }))
		)
	);
const ident = Object.fromEntries(
	['final', '@3'].map((v) => [
		v,
		WINDOWS.map((k) => identifyWindows(windowRows(v, k), k, CHARACTER_IDS))
	])
);
const GROUPS = {
	'blind features (2)': ['blindRounds', 'blindRaiseRate'],
	'show features (2)': ['showRate', 'showdownRate'],
	'all raise features (5)': [
		'blindRaiseRate',
		'raiseRate',
		'seenRaiseRate',
		'aggression',
		'raiseShareOfBets'
	],
	'all pack and fold features (4)': ['packRate', 'seenPackRate', 'foldToRaise', 'stayAfterSeeing']
};
const ablations = [['none', []], ...FEATURES.map((f) => [f, [f]]), ...Object.entries(GROUPS)];
const ablation = Object.fromEntries(
	['final', '@3'].map((v) => {
		const rows = windowRows(v, 50);
		return [
			v,
			ablations.map(([n, without]) => ({
				name: n,
				r: identifyWindows(rows, 50, CHARACTER_IDS, without)
			}))
		];
	})
);
// Sequence-based identification: 50-hand windows described only by their action bigrams.
const sequenceIdent = Object.fromEntries(
	['final', '@3'].map((v) => {
		const rows = CHARACTER_IDS.flatMap((c) =>
			sel(c, v, 'pop').flatMap((r) =>
				r.s.windowGrams.map((g) => ({ table: r.spec.table, member: c, g }))
			)
		);
		const freq = {};
		for (const r of rows) for (const [g, n] of Object.entries(r.g)) freq[g] = (freq[g] ?? 0) + n;
		const vocab = Object.entries(freq)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 40)
			.map(([g]) => g);
		const x = (g) => {
			const n = Object.values(g).reduce((s, y) => s + y, 0) || 1;
			return vocab.map((w) => (g[w] ?? 0) / n);
		};
		return [
			v,
			classify(
				rows.map((r) => ({ table: r.table, member: r.member, x: x(r.g) })),
				50,
				CHARACTER_IDS
			)
		];
	})
);

// Sequences: whole-hand action shapes (first 6 tokens) and bigram transitions.
// Tokens: b/B blind chaal/raise, L look, c/r seen chaal/raise, s/S show, p/x pack seen/blind.
const PATTERNS = [
	['blind, blind, blind raise', /bbB/],
	['three blind raises', /BBB/],
	['blind to the end (never looks)', /^[bBSx]+$/],
	['look at once', /^L/],
	['look, call, call, show', /^[bB]*Lcc+s$/],
	['look then raise at once', /Lr/],
	['seen raise, raise', /rr/],
	['look then pack at once', /Lp$/],
	['pack blind', /x$/]
];
const sequences = {};
for (const c of CHARACTER_IDS)
	for (const v of ['final', '@3']) {
		const { shapes, grams, hands } = M[c][v].total;
		const total = Object.values(shapes).reduce((s, n) => s + n, 0);
		const rate = (re) =>
			Object.entries(shapes)
				.filter(([sh]) => re.test(sh.replace('…', '')))
				.reduce((s, [, n]) => s + n, 0) / total;
		const after = (a) => {
			const row = Object.entries(grams).filter(([g]) => g.length === 2 && g[0] === a);
			const n = row.reduce((s, [, k]) => s + k, 0);
			return Object.fromEntries(row.map(([g, k]) => [g[1], k / Math.max(n, 1)]));
		};
		(sequences[c] ??= {})[v] = {
			patterns: PATTERNS.map(([label, re]) => [label, rate(re)]),
			top: Object.entries(shapes)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 6)
				.map(([sh, n]) => [sh || '(no decision)', n / total]),
			transitions: Object.fromEntries(['b', 'B', 'L', 'c', 'r'].map((a) => [a, after(a)])),
			hands
		};
	}

// Matchups: boots/100 against four copies of one opponent type.
const matchups = {};
for (const c of CHARACTER_IDS)
	for (const v of ['final', '@3'])
		for (const type of matchTypes(c)) {
			const rs = sel(c, v, `match:${type}`);
			((matchups[c] ??= {})[v] ??= {})[type] = ci(rs.map((r) => (r.s.total.net / r.s.hands) * 100));
		}

// Variation: whole-session fingerprints, standardized over every session of the study.
const sessionRows = R.filter(
	(r) => ['same', 'varied'].includes(r.spec.run) || r.spec.run.startsWith('popvar:')
).map((r) => ({
	c: r.spec.c,
	v: r.spec.v,
	run: r.spec.run,
	x: featureVector(r.s.total),
	halves: r.s.halves.map((h) => featureVector(h))
}));
const variation = (() => {
	const n = FEATURES.length;
	const all = sessionRows.map((r) => r.x);
	const mean = Array.from(
		{ length: n },
		(_, i) => all.reduce((s, x) => s + (x[i] ?? 0), 0) / all.length
	);
	const sd = Array.from(
		{ length: n },
		(_, i) =>
			Math.sqrt(all.reduce((s, x) => s + ((x[i] ?? mean[i]) - mean[i]) ** 2, 0) / all.length) || 1
	);
	const z = (x) => x.map((v, i) => ((v ?? mean[i]) - mean[i]) / sd[i]);
	const d = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
	const centre = (xs) => xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0) / xs.length);
	const spread = (xs) => {
		const c0 = centre(xs);
		return xs.reduce((s, x) => s + d(x, c0), 0) / xs.length;
	};
	const out = { within: {}, between: {} };
	for (const v of ['final', '@3']) {
		const cents = {};
		for (const c of CHARACTER_IDS) {
			const rows = sessionRows.filter((r) => r.c === c && r.v === v);
			const of = (run) => rows.filter((r) => r.run === run).map((r) => z(r.x));
			// Night effect on the same table: halves of one night vs halves of other nights.
			const same = rows.filter((r) => r.run === 'same').map((r) => r.halves.map(z));
			const per = same.map(([a, b], i) => {
				const others = same.filter((_, j) => j !== i).map(([, b2]) => d(a, b2));
				return others.reduce((s, x) => s + x, 0) / others.length - d(a, b);
			});
			const popCentres = Object.keys(POPULATIONS).map((k) => centre(of(`popvar:${k}`)));
			const popDist = [];
			for (let i = 0; i < popCentres.length; i++)
				for (let j = i + 1; j < popCentres.length; j++)
					popDist.push(d(popCentres[i], popCentres[j]));
			(out.within[c] ??= {})[v] = {
				decisionSeed: spread(of('same')),
				tableContext: spread(of('varied')),
				population: popDist.reduce((s, x) => s + x, 0) / popDist.length,
				night: ci(per)
			};
			cents[c] = centre(of('varied'));
		}
		out.between[v] = {};
		for (const a of CHARACTER_IDS)
			for (const b of CHARACTER_IDS) if (a < b) out.between[v][`${a}|${b}`] = d(cents[a], cents[b]);
		// Whole-session identification (varied tables): nearest centroid of the other sessions.
		const varied = sessionRows.filter((r) => r.v === v && r.run === 'varied');
		let correct = 0;
		for (const [i, r] of varied.entries()) {
			const best = CHARACTER_IDS.map((c) => {
				const xs = varied.filter((o, j) => j !== i && o.c === c).map((o) => z(o.x));
				return [c, d(z(r.x), centre(xs))];
			}).sort((a, b) => a[1] - b[1])[0][0];
			if (best === r.c) correct++;
		}
		out[`sessionAccuracy:${v}`] = correct / varied.length;
	}
	return out;
})();

// Adaptation by session phase against each scenario opponent.
const phaseRows = (c, v, type) => {
	const s = M[c][v].byType?.[type];
	return s ? s.phases.map((p) => metrics(p)) : null;
};

/* ---------------------------------- determinism, traces ---------------------------------- */

const digest = (hands) =>
	createHash('sha256')
		.update(
			JSON.stringify(
				hands.map((h) => [
					h.decisions.map((d) => [d.seat, d.name, d.reason, d.draws]),
					h.seats.map((s) => s.net)
				])
			)
		)
		.digest('hex')
		.slice(0, 16);
const finals = CHARACTER_IDS.map((c) => VERSIONS.final(c));
const detSpec = { seed: SEED, table: 4444, seats: finals, hands: 120, matched: true };
const determinism = { a: digest(runTable(detSpec)), b: digest(runTable(detSpec)) };
determinism.same = determinism.a === determinism.b;

const traceSpec = { seed: SEED, table: 4343, seats: finals, hands: 200, traces: true };
const traceHands = runTable(traceSpec, null, { decision: judgeDecision });
const mindBytes = Math.max(
	...Object.values(traceHands.at(-1).minds).map((m) => JSON.stringify(m).length)
);
const moved = (o) => Object.values(o ?? {}).some((x) => Math.abs(x) > 0.02);
const KINDS = [
	[
		'normal decision',
		(d, t, q) =>
			!d.forced &&
			!moved(t.state) &&
			!moved(t.model) &&
			!moved(t.social) &&
			!moved(t.quirk) &&
			!q.ov
	],
	['personality changed the best move', (d, t, q) => q.ov && !q.qov],
	['mood influenced', (d, t) => t.stateOverride || (moved(t.state) && !d.blind)],
	[
		'memory influenced',
		(d, t) => t.memoryOverride || (moved(t.model) && t.memoryRefs?.some((r) => r[3] > 5))
	],
	['relationship influenced', (d, t) => moved(t.social)],
	[
		'mistake or imperfect',
		(d, t, q) =>
			(q.strong && d.name === 'pack') ||
			(q.monster && d.raiseOk && d.name !== 'raise') ||
			(q.weak && d.name === 'chaal') ||
			q.ovAdv > 0.1
	],
	['strong hand', (d, t, q) => q.strong && !d.forced],
	['weak hand', (d, t, q) => q.weak && !d.forced]
];
const DHONI_KIND = [
	'opponent model driven',
	(d, t) => moved(t.model) && t.memoryRefs?.some((r) => r[3] > 10)
];
const traces = {};
for (const hand of traceHands)
	for (const d of hand.decisions) {
		const c = CHARACTER_IDS[d.seat];
		const t = d.move.trace;
		if (!t?.probs) continue;
		const kinds = c === 'ms-dhoni' ? [...KINDS, DHONI_KIND] : KINDS;
		for (const [kind, test] of kinds) {
			if (traces[c]?.[kind] || !test(d, t, d.q ?? {})) continue;
			(traces[c] ??= {})[kind] = { hand: hand.h, step: d.i, d };
		}
	}
for (const c of CHARACTER_IDS)
	for (const x of Object.values(traces[c] ?? {})) {
		const again = reproduceHand({ ...traceSpec, traces: false }, x.hand);
		x.reproduced =
			again.decisions[x.step].name === x.d.name && again.decisions[x.step].reason === x.d.reason;
		const q = x.d.q ?? {};
		x.text = explainDecision({
			name: name(c),
			move: x.d.move,
			decision: { ...x.d, rounds: x.d.rounds.toFixed(1) }
		});
		x.judge =
			q.p !== undefined
				? `judge: hand percentile ${Math.round(q.p * 100)}%, beats everyone ${Math.round(q.w * 100)}%${q.strong ? ', strong' : ''}${q.weak ? ', very weak' : ''}${q.monster ? ', monster' : ''}${q.ov ? `, best move differs from the base brain (evidence given up ${q.ovAdv.toFixed(2)})` : ''}`
				: 'judge: blind decision';
		delete x.d;
	}

/* ------------------------------------- clean timing ------------------------------------- */

mkdirSync(new URL('../../.sim/phase3/', import.meta.url), { recursive: true });
const finalsPath = new URL(`../../.sim/phase3/finals-${SEED}.json`, import.meta.url).pathname;
writeFileSync(
	finalsPath,
	JSON.stringify(Object.fromEntries(CHARACTER_IDS.map((c) => [c, FINAL[c].genome])))
);
const bench = JSON.parse(
	execFileSync(
		process.execPath,
		[
			new URL('./bench.mjs', import.meta.url).pathname,
			'--hands',
			'600',
			'--candidates',
			finalsPath
		],
		{
			encoding: 'utf8'
		}
	)
);

/* ------------------------------------------ league ------------------------------------------ */

const cands = Object.values(league.candidates);
const ancestry = (id) => {
	const chain = [];
	let cur = id;
	while (cur && league.candidates[cur]) {
		const x = league.candidates[cur];
		chain.push(
			`${cur} (gen ${x.generation}${x.changed?.length ? `: ${x.changed.join(', ')}` : ''})`
		);
		cur = x.parent?.split('×')[0];
		if (x.parent?.includes('×')) chain.push(`crossed with ${x.parent.split('×')[1]}`);
	}
	chain.push(cur ?? '?');
	return chain;
};
const stageHands = (stage) => league.stages[stage].tables * league.stages[stage].hands;

/* ------------------------------------------ write ------------------------------------------ */

writeFileSync(
	new URL(`../../.sim/phase3/final-${SEED}.json`, import.meta.url),
	JSON.stringify({
		seed: SEED,
		league: LEAGUE,
		wallMs,
		totalHands,
		totalDecisions,
		memory,
		finals: Object.fromEntries(CHARACTER_IDS.map((c) => [c, { ...FINAL[c], style: undefined }])),
		measures: Object.fromEntries(
			CHARACTER_IDS.map((c) => [
				c,
				Object.fromEntries(
					Object.entries(M[c]).map(([v, x]) => [
						v,
						x.measures
							? { measures: x.measures, boots: x.boots, paired: x.paired, bands: x.bands }
							: x
					])
				)
			])
		),
		ident,
		sequenceIdent,
		variation,
		matchups,
		sequences,
		determinism,
		bench,
		mindBytes
	})
);

const p = (x) =>
	x === null || x === undefined || Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(1)}%`;
const p0 = (x) =>
	x === null || x === undefined || Number.isNaN(x) ? 'n/a' : `${Math.round(x * 100)}%`;
const f2 = (x) => (x === null || x === undefined || Number.isNaN(x) ? 'n/a' : x.toFixed(2));
const sg = (x, fn = f2) => (x === null || x === undefined ? 'n/a' : `${x >= 0 ? '+' : ''}${fn(x)}`);
const pm = (o) => `${sg(o.mean, (x) => x.toFixed(0))} ± ${o.ci.toFixed(0)}`;
const fmtBand = (key, x) =>
	x === null || x === undefined
		? 'n/a'
		: /Rounds|aggression|^entropy|bluffIndex|callIndex|Growth|DeltaX|Delta$/.test(key) &&
			  !/Rate/.test(key)
			? f2(x)
			: p(x);

const FP = [
	['blind rounds a hand', 'blindRounds', f2],
	['blind raise', 'blindRaiseRate', p0],
	['look at once', 'lookAtOnce', p0],
	['never looked', 'neverLooked', p0],
	['raise after seeing', 'seenRaiseRate', p0],
	['aggression (seen raise per call)', 'aggression', f2],
	['pack', 'packRate', p0],
	['show when legal', 'showRate', p0],
	['stay after seeing', 'stayAfterSeeing', p0],
	['fold to a raise (seen, could call)', 'seenFoldToRaise', p0],
	['continue with a middling hand', 'continueMid', p0],
	['thin raise (bluffs)', 'thinRaise', p0],
	['value raise', 'valueRaise', p0],
	['entropy (bits)', 'entropy', f2]
];
const QUALITY = [
	['bad actions', 'badActionRate'],
	['strong hand packed', 'strongPackRate'],
	['monster not raised', 'monsterNoRaiseRate'],
	['very weak called', 'weakCallRate'],
	['big evidence override', 'bigOverrideRate'],
	['mood changed best move', 'stateOverrideRate'],
	['memory changed best move', 'memoryOverrideRate']
];
const confusion = (r) =>
	!r.confusion
		? 'n/a'
		: [
				`| actual \\ predicted | ${CHARACTER_IDS.map(name).join(' | ')} | correct |`,
				`|---|${CHARACTER_IDS.map(() => '---:').join('|')}|---:|`,
				...CHARACTER_IDS.map(
					(a) =>
						`| ${name(a)} | ${CHARACTER_IDS.map((b) => (a === b ? `**${r.confusion[a][b]}**` : r.confusion[a][b])).join(' | ')} | ${p0(r.perClass[a])} |`
				)
			].join('\n');
const base50 = ablation.final[0].r;
const giveaways = ablation.final
	.slice(1, FEATURES.length + 1)
	.flatMap(({ name: n, r }) =>
		CHARACTER_IDS.filter((c) => (base50.perClass[c] ?? 0) - (r.perClass?.[c] ?? 0) >= 0.15).map(
			(c) =>
				`${name(c)} depends on ${n} (${p0(base50.perClass[c])} → ${p0(r.perClass[c])} without it)`
		)
	);
const matchTable = (types, label) =>
	[
		`| ${label} | ${CHARACTER_IDS.map((c) => `${name(c)} final`).join(' | ')} | ${CHARACTER_IDS.map((c) => `${name(c)} v3`).join(' | ')} |`,
		`|---|${CHARACTER_IDS.map(() => '---:').join('|')}|${CHARACTER_IDS.map(() => '---:').join('|')}|`,
		...types.map(
			(t) =>
				`| ${t} | ${CHARACTER_IDS.map((c) => (matchups[c].final[t] ? matchups[c].final[t].mean.toFixed(0) : '·')).join(' | ')} | ${CHARACTER_IDS.map((c) => (matchups[c]['@3'][t] ? matchups[c]['@3'][t].mean.toFixed(0) : '·')).join(' | ')} |`
		)
	].join('\n');
let archetypeCheck;
try {
	const b = JSON.parse(
		readFileSync(new URL('../../.sim/phase3/baseline-31.json', import.meta.url), 'utf8')
	);
	archetypeCheck = [
		'| archetype | expected | blind rounds | look at once | raise after seeing | thin raise | fold to a raise | continue middling | entropy | boots/100 |',
		'|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
		...ARCHETYPE_IDS.map((a) => {
			const m = b.heroes[a]?.measures;
			return m
				? `| ${a} | ${ARCHETYPE_EXPECT[a]} | ${f2(m.blindRounds)} | ${p0(m.lookAtOnce)} | ${p0(m.seenRaiseRate)} | ${p0(m.thinRaise)} | ${p0(m.seenFoldToRaise)} | ${p0(m.continueMid)} | ${f2(m.entropy)} | ${m.bootsPer100.toFixed(0)} |`
				: `| ${a} | ${ARCHETYPE_EXPECT[a]} | not measured |`;
		})
	].join('\n');
} catch {
	archetypeCheck = 'Baseline file .sim/phase3/baseline-31.json not found.';
}
const searchSummary = (() => {
	const rejectedScreen = cands.filter((x) => x.status === 'rejected at screening').length;
	const rejectedMedium = cands.filter((x) => x.status.startsWith('rejected at medium')).length;
	return {
		total: cands.length,
		rejectedScreen,
		rejectedMedium,
		finalists: cands.filter((x) => x.stages.final).length
	};
})();
const searchDecisions = league.decisions ?? 0;

const md = `# Bot Brain Phase 3 report: individual character tuning

Generated by \`node scripts/sim/phase3-report.mjs --league ${LEAGUE.replace(/^.*\/\.sim/, '.sim')} --seed ${SEED} --scale ${SCALE}\` on ${new Date().toISOString().slice(0, 10)}.
Real engine; ${SIM_VERSION}, judge ${JUDGE_VERSION}, targets ${TARGETS_VERSION}; candidates on \`tp-dna@4\` (mind@2); ancestors are the frozen Phase 2 styles \`@3\` (\`tp-dna@3\`, mind@1). Boot 10, stack 100 boots, automatic rebuys. **Nothing here is published**: the candidates exist only in \`.sim/phase3/\` and \`server/sim/candidates.mjs\` until a reviewer approves one.

<!-- ANSWERS -->

## 1. Scale

| | hands | decisions | time |
|---|---:|---:|---:|
| search (league seed ${league.seed}: ${league.generations.length} generations, staged) | ${league.hands.toLocaleString()} | ${searchDecisions.toLocaleString()} | ${(league.seconds / 60).toFixed(0)} min |
| final study (this report, seed ${SEED}) | ${totalHands.toLocaleString()} | ${totalDecisions.toLocaleString()} | ${(wallMs / 60000).toFixed(0)} min |
| **total** | **${(league.hands + totalHands).toLocaleString()}** | **${(searchDecisions + totalDecisions).toLocaleString()}** | **${((league.seconds + wallMs / 1000) / 60).toFixed(0)} min** |

${threads} worker processes. Slowest table ${(slowest.ms / 1000).toFixed(1)} s. Peak memory ${memory.workerMb.toFixed(0)} MB per worker, ${memory.parentMb.toFixed(0)} MB parent (summaries only; memory does not grow with hands).

Search stages per candidate: screening ${league.stages.screen.tables} tables (${stageHands('screen').toLocaleString()} hands) plus ${league.stages.screen.adapt.length} adaptation scenarios; medium ${league.stages.medium.tables} tables (${stageHands('medium').toLocaleString()} hands) plus all ${league.stages.medium.adapt.length} scenarios; finalists ${league.stages.final.tables} tables (${stageHands('final').toLocaleString()} hands). Every stage is matched with the ancestor (same tables, opponents, cards and opponent draws).

**Candidates:** ${searchSummary.total} generated, ${searchSummary.rejectedScreen} rejected at screening, ${searchSummary.rejectedMedium} rejected at medium evaluation by a hard gate, ${searchSummary.finalists} finalists.

## 2. Final candidate and ancestry per character

| character | final candidate | chosen by the search? | why | largest DNA changes from v3 |
|---|---|---|---|---|
${CHARACTER_IDS.map(
	(c) =>
		`| ${name(c)} | \`${FINAL[c].id}\` | ${FINAL[c].chosen ? 'yes' : 'no'} | ${FINAL[c].reason} | ${
			drift(c, FINAL[c].genome)
				.slice(0, 5)
				.map(([g, d]) => `${g} ${sg(d)}`)
				.join(', ') || 'none'
		} |`
).join('\n')}

${CHARACTER_IDS.map((c) => `- **${name(c)}**: ${ancestry(FINAL[c].id).join(' ← ')}`).join('\n')}

## 3. Target bands (final vs v3, measured in the population; adaptation bands from the scenario tables)

${CHARACTER_IDS.map((c) => {
	const [a, b] = [M[c].final.bands, M[c]['@3'].bands];
	return `### ${name(c)}: final ${a.passed}/${a.results.length} (violation ${a.violation.toFixed(2)}), v3 ${b.passed}/${b.results.length} (violation ${b.violation.toFixed(2)})

| band | range | final | v3 | why |
|---|---|---:|---:|---|
${TARGETS[c].map((t, i) => `| ${t.key}${t.core ? ' (core)' : ''} | ${fmtBand(t.key, t.min)} to ${fmtBand(t.key, t.max)} | ${a.results[i].pass ? '' : '✗ '}${fmtBand(t.key, a.results[i].value)} | ${b.results[i].pass ? '' : '✗ '}${fmtBand(t.key, b.results[i].value)} | ${t.why} |`).join('\n')}`;
}).join('\n\n')}

## 4. Fingerprints: final vs Phase 2 (v3), same tables

| | ${CHARACTER_IDS.flatMap((c) => [`${name(c)} v3`, `${name(c)} final`]).join(' | ')} |
|---|${CHARACTER_IDS.flatMap(() => ['---:', '---:']).join('|')}|
${FP.map(([l, k, fn]) => `| ${l} | ${CHARACTER_IDS.flatMap((c) => [fn(M[c]['@3'].measures[k]), fn(M[c].final.measures[k])]).join(' | ')} |`).join('\n')}

## 5. Strength (boots per 100 hands, population tables, 95% CI over ${POP_TABLES} tables)

| character | v3 | final | paired final − v3 |
|---|---:|---:|---:|
${CHARACTER_IDS.map((c) => `| ${name(c)} | ${pm(M[c]['@3'].boots)} | ${pm(M[c].final.boots)} | **${pm(M[c].final.paired)}** |`).join('\n')}

## 6. Decision quality (judge with the bot's own cards)

| | ${QUALITY.map(([l]) => l).join(' | ')} |
|---|${QUALITY.map(() => '---:').join('|')}|
${CHARACTER_IDS.flatMap((c) => ['@3', 'final'].map((v) => `| ${name(c)} ${v === '@3' ? 'v3' : 'final'} | ${QUALITY.map(([, k]) => p(M[c][v].measures[k] ?? M[c][v].fp[k])).join(' | ')} |`)).join('\n')}

## 7. Identifiability (public behaviour, ${FEATURES.length} features, population tables; trained on even tables, tested on odd)

| hands watched | v3 | final |
|---:|---:|---:|
${WINDOWS.map((k, i) => `| ${k} | ${p0(ident['@3'][i].accuracy)} | ${p0(ident.final[i].accuracy)} |`).join('\n')}
| whole 200-hand session (varied tables) | ${p0(variation['sessionAccuracy:@3'])} | ${p0(variation['sessionAccuracy:final'])} |
| 50 hands, action bigrams only (sequence-based) | ${p0(sequenceIdent['@3'].accuracy)} | ${p0(sequenceIdent.final.accuracy)} |

Identifiability is a diagnostic and release gate here, never an objective: no candidate was selected on it.

${WINDOWS.map((k, i) => `### Final, confusion at ${k} hands\n\n${confusion(ident.final[i])}`).join('\n\n')}

### Sequence-based (bigrams), final, 50 hands

${confusion(sequenceIdent.final)}

## 8. Single-feature ablation at 50 hands (final)

| removed | v3 | final | ${CHARACTER_IDS.map(name).join(' | ')} |
|---|---:|---:|${CHARACTER_IDS.map(() => '---:').join('|')}|
${ablation.final.map(({ name: n, r }, i) => `| ${n} | ${p0(ablation['@3'][i].r.accuracy)} | **${p0(r.accuracy)}** | ${CHARACTER_IDS.map((c) => p0(r.perClass?.[c])).join(' | ')} |`).join('\n')}

**Single-feature giveaways** (one feature's removal costs a character 15+ points): ${giveaways.length ? giveaways.join('; ') : 'none'}.

## 9. Variation: a region, not a point

Whole-session fingerprints (200 hands) standardized over every session in the study. Spread = mean distance of a session from that character's own centre. **Decision seed**: ${SESSIONS} nights at the same table, same opponents and decks. **Table context**: ${SESSIONS} different tables. **Opponent population**: mean distance between the character's centres in three populations (${Object.keys(POPULATIONS).join('; ')}), ${POP_SESSIONS} sessions each. **Night** = halves of different nights minus halves of the same night (same table), with its 95% interval: above zero means a night has its own character.

| | decision seed v3 / final | table context v3 / final | opponent population v3 / final | night v3 | night final |
|---|---|---|---|---:|---:|
${CHARACTER_IDS.map((c) => {
	const [a, b] = [variation.within[c]['@3'], variation.within[c].final];
	return `| ${name(c)} | ${f2(a.decisionSeed)} / ${f2(b.decisionSeed)} | ${f2(a.tableContext)} / ${f2(b.tableContext)} | ${f2(a.population)} / ${f2(b.population)} | ${f2(a.night.mean)} ± ${f2(a.night.ci)} | ${f2(b.night.mean)} ± ${f2(b.night.ci)} |`;
}).join('\n')}

**Between-character distance** (centres over varied tables, same standardization):

| pair | v3 | final |
|---|---:|---:|
${Object.keys(variation.between.final)
	.sort((x, y) => variation.between.final[x] - variation.between.final[y])
	.map(
		(k) =>
			`| ${k.split('|').map(name).join(' – ')} | ${f2(variation.between['@3'][k])} | ${f2(variation.between.final[k])} |`
	)
	.join('\n')}

## 10. Matchup matrices (boots/100 against four copies of one opponent; ${MATCH_TABLES} tables × ${HANDS} hands each)

### Human archetypes

${matchTable(ARCHETYPE_IDS, 'opponents')}

### Legacy bots, baselines and the other characters (v3)

A published character can sit only once at a table, so a character row is one copy of that character (v3) and three human-balanced players.

${matchTable([...REFERENCE_IDS, ...CHARACTER_IDS.map((c) => `${c}@3`)], 'opponents')}

### Archetype validation (Phase 3 baseline, seed 31: each archetype in the population)

${archetypeCheck}

## 11. Sequence behaviour

Share of hands containing each sequence (hero seat, population tables). Tokens: b/B blind chaal/raise, L look, c/r seen chaal/raise, s show, p/x pack seen/blind.

| sequence | ${CHARACTER_IDS.flatMap((c) => [`${name(c)} v3`, 'final']).join(' | ')} |
|---|${CHARACTER_IDS.flatMap(() => ['---:', '---:']).join('|')}|
${PATTERNS.map(([label], i) => `| ${label} | ${CHARACTER_IDS.flatMap((c) => [p0(sequences[c]['@3'].patterns[i][1]), p0(sequences[c].final.patterns[i][1])]).join(' | ')} |`).join('\n')}

**Transitions (final): what follows a move** (share of the next token, top three):

| | ${['b', 'B', 'L', 'c', 'r'].join(' | ')} |
|---|---|---|---|---|---|
${CHARACTER_IDS.map(
	(c) =>
		`| ${name(c)} | ${['b', 'B', 'L', 'c', 'r']
			.map(
				(a) =>
					Object.entries(sequences[c].final.transitions[a])
						.sort((x, y) => y[1] - x[1])
						.slice(0, 3)
						.map(([tok, r]) => `${tok === '$' ? 'end' : tok} ${p0(r)}`)
						.join(', ') || '·'
			)
			.join(' | ')} |`
).join('\n')}

**Most common whole-hand shapes (final):**

${CHARACTER_IDS.map((c) => `- ${name(c)}: ${sequences[c].final.top.map(([sh, r]) => `\`${sh}\` ${p0(r)}`).join(', ')}`).join('\n')}

**Event → next hands** (the 3 hands after an event minus hands with no recent event, beyond the stateless v2 on the same tables, i.e. what the mind adds):

| reaction | ${CHARACTER_IDS.flatMap((c) => [`${name(c)} v3`, 'final']).join(' | ')} |
|---|${CHARACTER_IDS.flatMap(() => ['---:', '---:']).join('|')}|
${[
	['big loss → aggression (raise per call)', 'lossAggressionDeltaX'],
	['big loss → raise after seeing', 'lossSeenRaiseDeltaX'],
	['big loss → pack after seeing', 'lossPackDeltaX'],
	['big win → raise after seeing', 'winSeenRaiseDeltaX'],
	['blind win → blind raise', 'blindWinBlindRaiseDeltaX'],
	['blind win → blind rounds', 'blindWinBlindRoundsDeltaX'],
	['caught a bluff → fold to a raise', 'caughtBluffFoldDeltaX'],
	['bluffed off a pot → fold to a raise', 'bluffedOffFoldDeltaX'],
	['repeated pressure → pack after seeing', 'pressuredPackDeltaX']
]
	.map(
		([l, k]) =>
			`| ${l} | ${CHARACTER_IDS.flatMap((c) => [sg(M[c]['@3'].measures[k], (x) => x.toFixed(3)), sg(M[c].final.measures[k], (x) => x.toFixed(3))]).join(' | ')} |`
	)
	.join('\n')}

## 12. Adaptation (every character; scenario tables, hands 101 to 200 vs 1 to 50)

| | bluff index (vs rock − vs station, late) | bluff growth vs rock | value growth vs station | fold to maniac early → late | blind fold to maniac late |
|---|---|---|---|---|---|
${CHARACTER_IDS.flatMap((c) =>
	['@3', 'final'].map((v) => {
		const m = M[c][v].measures;
		return `| ${name(c)} ${v === '@3' ? 'v3' : 'final'} | ${f2(m.bluffIndex)} | ${sg(m.bluffGrowth)} | ${sg(m.valueGrowthVsCaller)} | ${p0(m.foldVsManiacEarly)} → ${p0(m.foldVsManiacLate)} | ${p(m.blindFoldVsManiacLate)} |`;
	})
).join('\n')}

## 13. Dhoni adaptation study (${ADAPT_TABLES} tables × ${HANDS} hands per scenario; phases: hands 1-25, 26-50, 51-100, 101-150, 151-200)

${ADAPT_TYPES.map((type) => {
	const rows = ['@3', 'final'].map((v) => [v, phaseRows('ms-dhoni', v, type)]);
	const line = (label, k, fn) =>
		`| ${label} | ${rows.map(([, ph]) => ph.map((m) => fn(m[k])).join(' → ')).join(' | ')} |`;
	return `### against ${type}

| | v3 | final |
|---|---|---|
${line('thin raise (bluffs)', 'thinRaise', p0)}
${line('value raise', 'valueRaise', p0)}
${line('fold to a raise (seen)', 'seenFoldToRaise', p0)}
${line('fold to a raise (blind)', 'blindFoldToRaise', p0)}
${line('blind rounds', 'blindRounds', f2)}
${line('boots/100', 'bootsPer100', (x) => x.toFixed(0))}`;
}).join('\n\n')}

## 14. Samay mood sensitivity

| | mood changed best move | memory changed best move | big loss → pack after seeing (mind adds) | caught a bluff → fold to a raise (mind adds) | big loss → aggression (mind adds) | continue middling | fold to a raise |
|---|---:|---:|---:|---:|---:|---:|---:|
${CHARACTER_IDS.flatMap((c) =>
	['@3', 'final'].map((v) => {
		const m = M[c][v].measures;
		return `| ${name(c)} ${v === '@3' ? 'v3' : 'final'} | ${p(m.stateOverrideRate)} | ${p(m.memoryOverrideRate)} | ${sg(m.lossPackDeltaX, (x) => x.toFixed(3))} | ${sg(m.caughtBluffFoldDeltaX, (x) => x.toFixed(3))} | ${sg(m.lossAggressionDeltaX, (x) => x.toFixed(3))} | ${p0(m.continueMid)} | ${p0(m.seenFoldToRaise)} |`;
	})
).join('\n')}

## 15. Performance (clean: \`scripts/sim/bench.mjs\` in a fresh process, after JIT warm-up; v4 = the final candidates)

| policy (5 seats) | hands/s incl. engine | decision p50 ms | p95 ms | p99 ms | max ms |
|---|---:|---:|---:|---:|---:|
${['legacy', 'v2', 'v3', 'v4'].map((g) => `| ${g} | ${bench[g].handsPerSec} | ${bench[g].decision.p50.toFixed(3)} | ${bench[g].decision.p95.toFixed(3)} | ${bench[g].decision.p99.toFixed(3)} | ${bench[g].decision.max.toFixed(1)} |`).join('\n')}

Mind upkeep per commit (all five bots): v3 p50 ${bench.v3.mindUpkeepPerCommit.p50.toFixed(2)} / p99 ${bench.v3.mindUpkeepPerCommit.p99.toFixed(2)} ms; v4 p50 ${bench.v4.mindUpkeepPerCommit.p50.toFixed(2)} / p99 ${bench.v4.mindUpkeepPerCommit.p99.toFixed(2)} ms. Largest final-candidate mind after 200 hands: ${(mindBytes / 1024).toFixed(1)} KB of JSON. Benchmark process ${bench.rssMb} MB. ${bench.node}.

## 16. Deterministic reproduction

- Same matched table (seed ${SEED}, table 4444, the five finals, 120 hands) run twice in one process: digest ${determinism.a} and ${determinism.b}: **${determinism.same ? 'identical' : 'DIFFERENT'}**.
- Every trace below was replayed from its seed and hand number: ${
	Object.values(traces)
		.flatMap((o) => Object.values(o))
		.every((x) => x.reproduced)
		? '**all reproduced** (same action and reason)'
		: '**NOT all reproduced**'
}.
- The frozen versions are pinned by golden digests (tests/server/bot-legacy-golden.test.mjs): legacy, v1, v2 and v3 decisions, traces and minds.

<!-- TESTS -->

## 17. Decision traces (finals at one table: seed ${SEED}, table 4343, 200 hands)

The first decision of each kind in hand order, not chosen for looking good. The judge line is offline only (it sees the bot's cards).

${CHARACTER_IDS.map(
	(c) =>
		`### ${name(c)}\n\n${(c === 'ms-dhoni' ? [...KINDS, DHONI_KIND] : KINDS)
			.map(([kind]) => {
				const x = traces[c]?.[kind];
				return x
					? `**${kind}** (hand ${x.hand}, step ${x.step}, reproduced: ${x.reproduced ? 'yes' : 'NO'}; ${x.judge})\n\n\`\`\`\n${x.text}\n\`\`\``
					: `**${kind}**: none in 200 hands.`;
			})
			.join('\n\n')}`
).join('\n\n')}
`;
const mdPath = opt('md', new URL('../../docs/bots/PHASE3_REPORT.md', import.meta.url).pathname);
mkdirSync(new URL('../../docs/bots/', import.meta.url), { recursive: true });
writeFileSync(mdPath, md);
console.log(
	`Phase 3 final study: ${totalHands.toLocaleString()} hands in ${(wallMs / 1000).toFixed(0)} s. Wrote ${mdPath}`
);
console.log(
	`identifiability final: ${ident.final.map((r) => `${r.k}=${p0(r.accuracy)}`).join(' ')}; v3: ${ident['@3'].map((r) => `${r.k}=${p0(r.accuracy)}`).join(' ')}`
);
for (const c of CHARACTER_IDS)
	console.log(
		`${name(c)}: ${FINAL[c].id} bands ${M[c].final.bands.passed}/${M[c].final.bands.results.length} (v3 ${M[c]['@3'].bands.passed}) paired ${pm(M[c].final.paired)}`
	);
