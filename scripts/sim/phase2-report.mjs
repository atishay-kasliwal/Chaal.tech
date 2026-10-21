/**
 * Phase 2 report (docs/BOT_BRAIN.md §28): character styles @2 (tp-dna@2, stateless) against
 * @3 (tp-dna@3, with a mind), measured the same way. Measurement only.
 *
 *   node scripts/sim/phase2-report.mjs [--seed 21] [--hands 200] [--scale 1]
 *
 * Runs (all on the real engine, every deck and decision seeded):
 *  - mixed@v: 2 to 5 characters of one version per table, the rest reference bots; identical
 *    compositions and decks for v2 and v3. Fingerprints, identifiability, ablation, event windows.
 *  - hero: every policy (v2, v3, references) in the same seat at the same tables against the same
 *    four reference opponents with the same decks. Strength, decision quality, distances.
 *  - sessions: each character, 30 sessions of 200 hands on the SAME table (same opponents, same
 *    decks) with different decision seeds, and 30 sessions on different tables. Separates decision
 *    noise, table context and the session-to-session variation a mind adds.
 *  - adaptation: Dhoni (and, for contrast, every character) against four copies of one opponent
 *    type, early hands vs late hands.
 *
 * Writes docs/bots/PHASE2_REPORT.md and .sim/phase2-<seed>.json.
 */
import { availableParallelism } from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runPool } from './pool.mjs';
import { REFERENCE_IDS, CHARACTER_IDS, versioned } from '../../server/sim/population.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';
import {
	sum,
	metrics,
	FEATURES,
	FINGERPRINT_VERSION,
	featureVector,
	nightEffect,
	STRENGTH_BUCKETS
} from '../../server/sim/fingerprint.mjs';
import { identifiability } from '../../server/sim/identify.mjs';
import { runTable, reproduceHand, SIM_VERSION } from '../../server/sim/table.mjs';
import { JUDGE_VERSION } from '../../server/sim/judge.mjs';
import { explainDecision } from '../../server/sim/explain.mjs';
import { CHARACTER_GRAPH_V3 } from '../../server/bots/character-v3.mjs';
import { toMermaid } from '../../server/bots/graph.mjs';
import { MIND_VERSION } from '../../server/bots/mind.mjs';
import { OBSERVATION_VERSION } from '../../server/bots/observe.mjs';
import { STYLES } from '../../server/bots/dna-styles.mjs';
import { castMember } from '../../src/lib/bots/cast.js';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const SEED = arg('seed', 21);
const HANDS = arg('hands', 200);
const SCALE = arg('scale', 1);
const RULES = 'classic-1';
const V2 = versioned(2);
const V3 = versioned(3);
const HEROES = [...V2, ...V3, ...REFERENCE_IDS];
const HERO_TABLES = Math.round(160 * SCALE);
const HERO_HANDS = Math.round(HANDS * 0.75);
const SESSIONS = Math.max(4, Math.round(30 * SCALE));
const ADAPT_TABLES = Math.max(4, Math.round(40 * SCALE));
const TYPES = ['baseline-rock', 'baseline-station', 'baseline-aggressive'];
const at = (m, v) => (CHARACTER_IDS.includes(m) ? `${m}@${v}` : m);

/* ---------------------------------------- plan ---------------------------------------- */

const specs = [];
const add = (run, table, seats, extra = {}) =>
	specs.push({ run, table, seats, seed: SEED, hands: HANDS, rulesVersion: RULES, ...extra });
for (let t = 0; t < 480 * SCALE; t++) {
	const r = stream(SEED, 'compose-mix', t).random;
	const chars = shuffle(CHARACTER_IDS, r).slice(0, 2 + Math.floor(r() * 4));
	const order = shuffle([...chars, ...shuffle(REFERENCE_IDS, r).slice(0, 5 - chars.length)], r);
	for (const v of [2, 3])
		add(
			`mixed@${v}`,
			t,
			order.map((m) => at(m, v))
		);
}
for (let t = 0; t < HERO_TABLES; t++) {
	const field = shuffle(REFERENCE_IDS, stream(SEED, 'hero-field', t).random).slice(0, 4);
	for (const hero of HEROES) {
		const seats = field.slice();
		seats.splice(t % 5, 0, hero);
		add(`hero:${hero}`, t, seats, { heroSeat: t % 5, hands: HERO_HANDS });
	}
}
for (const c of CHARACTER_IDS)
	for (const v of [2, 3]) {
		const field = shuffle(REFERENCE_IDS, stream(SEED, 'session-field', c).random).slice(0, 4);
		for (let i = 0; i < SESSIONS; i++) {
			// Same table: same seat, opponents and decks; only the decision seed changes.
			add(`same:${c}@${v}`, 9000, [`${c}@${v}`, ...field], {
				heroSeat: 0,
				decisionSeed: SEED * 1000 + i
			});
			// Different tables: everything changes.
			const other = shuffle(REFERENCE_IDS, stream(SEED, 'session-other', c, i).random).slice(0, 4);
			add(`varied:${c}@${v}`, 9100 + i, [`${c}@${v}`, ...other], { heroSeat: 0 });
		}
	}
for (const type of TYPES)
	for (const v of [2, 3])
		for (const c of CHARACTER_IDS)
			for (let t = 0; t < ADAPT_TABLES; t++)
				add(`adapt:${type}:${c}@${v}`, 9500 + t, [`${c}@${v}`, type, type, type, type], {
					heroSeat: 0
				});

/* ---------------------------------------- run ---------------------------------------- */

let peakRss = 0;
const sampler = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 250);
const threads = Math.max(1, availableParallelism() - 1);
const started = performance.now();
let lastLog = 0;
const results = await runPool(specs, threads, (done, total) => {
	if (performance.now() - lastLog > 20000 || done === total) {
		lastLog = performance.now();
		console.log(`  ${done}/${total} tables`);
	}
});
const wallMs = performance.now() - started;
clearInterval(sampler);
const totalHands = specs.reduce((s, x) => s + x.hands, 0);
const totalDecisions = results.reduce((s, r) => s + r.decisions, 0);
const slowest = results.reduce((m, r) => (r.ms > m.ms ? r : m));
const memory = { workerMb: Math.max(...results.map((r) => r.rssMb)), parentMb: peakRss / 2 ** 20 };
const specOf = new Map(specs.map((s) => [`${s.run}#${s.table}#${s.decisionSeed ?? ''}`, s]));
const heroHands = (r) => {
	const spec =
		specOf.get(`${r.run}#${r.table}#${r.decisionSeed ?? ''}`) ??
		specs.find((s) => s.run === r.run && s.table === r.table);
	return r.seats[spec.heroSeat ?? 0].hands;
};

/* ----------------------------------- aggregate ----------------------------------- */

const fpOf = (by) =>
	Object.fromEntries(Object.entries(by).map(([m, hands]) => [m, metrics(sum(hands))]));
const byMember = (runFilter) => {
	const by = {};
	for (const r of results.filter((x) => runFilter(x.run)))
		for (const s of r.seats) (by[s.member] ??= []).push(...s.hands);
	return by;
};
const mixed = {
	2: fpOf(byMember((r) => r === 'mixed@2')),
	3: fpOf(byMember((r) => r === 'mixed@3'))
};

const hero = {};
const heroTables = {};
for (const r of results.filter((x) => x.run.startsWith('hero:'))) {
	const id = r.run.slice('hero:'.length);
	const hands = heroHands(r);
	(hero[id] ??= []).push(...hands);
	(heroTables[id] ??= {})[r.table] = {
		net: hands.reduce((s, h) => s + h.net, 0),
		hands: hands.length
	};
}
const heroFp = fpOf(hero);
const ciOver = (xs) => {
	const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
	const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(xs.length - 1, 1));
	return { mean, ci: (1.96 * sd) / Math.sqrt(xs.length) };
};
const strength = (id) => ciOver(Object.values(heroTables[id]).map((t) => (t.net / t.hands) * 100));
const paired = (a, b) =>
	ciOver(
		Object.keys(heroTables[a]).map(
			(t) => ((heroTables[b][t].net - heroTables[a][t].net) / heroTables[a][t].hands) * 100
		)
	);

const sessionsOf = (v) =>
	results
		.filter((r) => r.run === `mixed@${v}`)
		.flatMap((r) => r.seats.map((s) => ({ table: r.table, member: s.member, hands: s.hands })));
const S = { 2: sessionsOf(2), 3: sessionsOf(3) };
const cls = { 2: V2, 3: V3 };
const ident = Object.fromEntries(
	[2, 3].map((v) => [v, [10, 25, 50, 100].map((k) => identifiability(S[v], k, cls[v]))])
);
const GROUPS = {
	'blind features (2)': ['blindRounds', 'blindRaiseRate'],
	'show behaviour (2)': ['showRate', 'showdownRate'],
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
	[2, 3].map((v) => [
		v,
		ablations.map(([name, without]) => ({ name, r: identifiability(S[v], 50, cls[v], without) }))
	])
);

// Distances in one field (hero runs).
const dist = (() => {
	const vec = (m) => FEATURES.map((f) => heroFp[m][f] ?? 0);
	const n = FEATURES.length;
	const mean = Array.from(
		{ length: n },
		(_, i) => HEROES.reduce((s, m) => s + vec(m)[i], 0) / HEROES.length
	);
	const sd = Array.from(
		{ length: n },
		(_, i) =>
			Math.sqrt(HEROES.reduce((s, m) => s + (vec(m)[i] - mean[i]) ** 2, 0) / HEROES.length) || 1
	);
	const z = (m) => vec(m).map((x, i) => (x - mean[i]) / sd[i]);
	const d = (a, b) => Math.sqrt(z(a).reduce((s, x, i) => s + (x - z(b)[i]) ** 2, 0));
	const out = { legacyPair: d('legacy-normal', 'legacy-hard') };
	for (const v of [2, 3])
		for (const c of cls[v]) {
			out[c] = {
				ref: REFERENCE_IDS.map((r) => [r, d(c, r)]).sort((a, b) => a[1] - b[1])[0],
				char: cls[v]
					.filter((x) => x !== c)
					.map((x) => [x, d(c, x)])
					.sort((a, b) => a[1] - b[1])[0]
			};
		}
	return out;
})();

// Session variation: whole-session fingerprints, standardized over every session in the study.
const session = (() => {
	const rows = [];
	for (const r of results.filter((x) => x.run.startsWith('same:') || x.run.startsWith('varied:'))) {
		const [kind, member] = r.run.split(':');
		rows.push({ kind, member, x: featureVector(sum(heroHands(r))) });
	}
	const n = FEATURES.length;
	const mean = Array.from(
		{ length: n },
		(_, i) => rows.reduce((s, r) => s + (r.x[i] ?? 0), 0) / rows.length
	);
	const sd = Array.from(
		{ length: n },
		(_, i) =>
			Math.sqrt(rows.reduce((s, r) => s + ((r.x[i] ?? mean[i]) - mean[i]) ** 2, 0) / rows.length) ||
			1
	);
	const z = (x) => x.map((v, i) => ((v ?? mean[i]) - mean[i]) / sd[i]);
	const out = {};
	for (const member of [...V2, ...V3]) {
		const spread = (kind) => {
			const xs = rows.filter((r) => r.kind === kind && r.member === member).map((r) => z(r.x));
			const c = xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0) / xs.length);
			return {
				spread:
					xs.reduce((s, x) => s + Math.sqrt(x.reduce((a, v, i) => a + (v - c[i]) ** 2, 0)), 0) /
					xs.length,
				centroid: c,
				n: xs.length
			};
		};
		out[member] = {
			same: spread('same'),
			varied: spread('varied'),
			night: nightEffect(results.filter((r) => r.run === `same:${member}`).map((r) => heroHands(r)))
		};
	}
	// Whole-session identification (varied tables), nearest centroid of the other sessions.
	for (const v of [2, 3]) {
		const varied = rows.filter((r) => r.kind === 'varied' && cls[v].includes(r.member));
		let correct = 0;
		for (const [i, r] of varied.entries()) {
			const cents = Object.fromEntries(
				cls[v].map((m) => {
					const xs = varied.filter((o, j) => j !== i && o.member === m).map((o) => z(o.x));
					return [m, xs[0].map((_, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length)];
				})
			);
			const zx = z(r.x);
			const best = cls[v].reduce(
				(b, m) => {
					const dm = Math.sqrt(zx.reduce((s, x, k) => s + (x - cents[m][k]) ** 2, 0));
					return dm < b[1] ? [m, dm] : b;
				},
				[null, Infinity]
			);
			if (best[0] === r.member) correct++;
		}
		out[`sessionAccuracy@${v}`] = correct / varied.length;
	}
	return out;
})();

// Behaviour after significant events (mixed runs): the 3 hands after a big loss or win vs the rest.
const BIG = 20;
const events = (() => {
	const out = {};
	for (const v of [2, 3])
		for (const r of results.filter((x) => x.run === `mixed@${v}`))
			for (const s of r.seats) {
				if (!cls[v].includes(s.member)) continue;
				const o = (out[s.member] ??= { base: [], loss: [], win: [] });
				s.hands.forEach((h, i) => {
					const prev = s.hands.slice(Math.max(0, i - 3), i);
					const kind = prev.some((p) => p.net <= -BIG)
						? 'loss'
						: prev.some((p) => p.net >= BIG)
							? 'win'
							: 'base';
					o[kind].push(h);
				});
			}
	const summary = {};
	for (const [m, o] of Object.entries(out)) {
		const f = (k) => metrics(sum(o[k]));
		summary[m] = {
			base: f('base'),
			loss: f('loss'),
			win: f('win'),
			n: { loss: o.loss.length, win: o.win.length }
		};
	}
	return summary;
})();

// Adaptation: early (hands 1 to 40) vs late (hands 121 to 200) against one opponent type.
const adaptation = (() => {
	const out = {};
	for (const r of results.filter((x) => x.run.startsWith('adapt:'))) {
		const [, type, member] = r.run.split(':');
		const hands = heroHands(r);
		const o = (out[`${type}|${member}`] ??= { early: [], late: [], tables: 0 });
		o.early.push(...hands.slice(0, 40));
		o.late.push(...hands.slice(120));
		o.tables++;
	}
	const view = {};
	for (const [k, o] of Object.entries(out))
		view[k] = { early: metrics(sum(o.early)), late: metrics(sum(o.late)) };
	return view;
})();

// Exploitation (hands 41 to 200): how differently a character plays folders, callers and
// maniacs, minus how differently its stateless v2 plays them. v2 has no memory, so its differences
// come only from what the opponents do to it; what remains is what the mind adds.
const exploit = (() => {
	const late = {};
	for (const r of results.filter((x) => x.run.startsWith('adapt:'))) {
		const [, type, member] = r.run.split(':');
		(late[`${type}|${member}`] ??= []).push(...heroHands(r).slice(40));
	}
	const out = {};
	for (const c of CHARACTER_IDS) {
		const idx = (v) => {
			const [rock, station, aggr] = TYPES.map((t) => metrics(sum(late[`${t}|${c}@${v}`])));
			return {
				rock,
				station,
				aggr,
				bluff: (rock.thinRaise ?? 0) - (station.thinRaise ?? 0),
				call: (rock.foldToRaise ?? 0) - (aggr.foldToRaise ?? 0)
			};
		};
		out[c] = { 2: idx(2), 3: idx(3) };
	}
	return out;
})();

/* --------------------------------- clean timing --------------------------------- */

// Timing runs in a fresh process: this one holds every result, and its garbage collection would
// inflate every policy's numbers (it did in the first Phase 2 run).
const bench = JSON.parse(
	execFileSync(
		process.execPath,
		[new URL('./bench.mjs', import.meta.url).pathname, '--hands', '600'],
		{
			encoding: 'utf8'
		}
	)
);
let mindBytes;
{
	const last = runTable({
		seed: SEED,
		table: 7778,
		seats: V3,
		hands: 200,
		rulesVersion: RULES,
		traces: true
	}).at(-1);
	mindBytes = Math.max(...Object.values(last.minds).map((m) => JSON.stringify(m).length));
}

/* --------------------------------- example traces --------------------------------- */

const exampleSpec = {
	seed: SEED,
	table: 4242,
	seats: V3,
	rulesVersion: RULES,
	hands: 200,
	traces: true
};
const exampleHands = runTable(exampleSpec);
const nz = (o) => Object.values(o ?? {}).some((x) => Math.abs(x) > 0.02);
const WANT = {
	'rohit-sharma@3': (d, t) => d.blind && (nz(t.quirk) || nz(t.state)),
	'virat-kohli@3': (d, t) => !d.blind && (nz(t.social) || nz(t.state)) && d.name === 'raise',
	'gg@3': (d, t) => !d.blind && t.resisted?.length && nz(t.state),
	'samay-raina@3': (d, t) => !d.blind && t.facing && (nz(t.model) || nz(t.quirk)),
	'ms-dhoni@3': (d, t) => !d.blind && nz(t.model) && t.memoryRefs?.some((r) => r[3] > 5)
};
const examples = {};
for (const hand of exampleHands)
	for (const d of hand.decisions) {
		const id = V3[d.seat];
		const t = d.move.trace;
		if (examples[id] || !t?.probs || !WANT[id](d, t)) continue;
		const again = reproduceHand({ ...exampleSpec, traces: false }, hand.h);
		examples[id] = {
			hand: hand.h,
			step: d.i,
			reproduced: again.decisions[d.i].name === d.name && again.decisions[d.i].reason === d.reason,
			text: explainDecision({
				name: castMember(id.split('@')[0]).name,
				move: d.move,
				decision: { ...d, rounds: d.rounds.toFixed(1) }
			})
		};
	}

/* ----------------------------------------- write ----------------------------------------- */

mkdirSync(new URL('../../.sim/', import.meta.url), { recursive: true });
writeFileSync(
	new URL(`../../.sim/phase2-${SEED}.json`, import.meta.url),
	JSON.stringify(
		{
			seed: SEED,
			wallMs,
			totalHands,
			totalDecisions,
			memory,
			slowest: { run: slowest.run, ms: slowest.ms },
			mixed,
			heroFp,
			ident,
			ablation,
			dist,
			session,
			events,
			adaptation,
			exploit: Object.fromEntries(
				Object.entries(exploit).map(([c, o]) => [
					c,
					{ 2: { bluff: o[2].bluff, call: o[2].call }, 3: { bluff: o[3].bluff, call: o[3].call } }
				])
			),
			mindBytes,
			bench
		},
		null,
		1
	)
);

const name = (m) => {
	const [id, v] = m.split('@');
	return castMember(id) ? `${castMember(id).name}${v ? ` v${v}` : ''}` : m;
};
const p = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
const f2 = (x) => (x === null || x === undefined ? 'n/a' : x.toFixed(2));
const pair = (fn) => CHARACTER_IDS.flatMap((c) => [fn(`${c}@2`), fn(`${c}@3`)]);
const pairHead = `| | ${pair(name).join(' | ')} |\n|---|${pair(() => '---:').join('|')}|`;
const FP = [
	['blind rounds', (m) => f2(m.blindRounds)],
	['blind raise', (m) => p(m.blindRaiseRate)],
	['chaal', (m) => p(m.chaalRate)],
	['raise', (m) => p(m.raiseRate)],
	['pack', (m) => p(m.packRate)],
	['show (when legal)', (m) => p(m.showRate)],
	['aggression (seen R/C)', (m) => f2(m.aggression)],
	['raise after seeing', (m) => p(m.seenRaiseRate)],
	['fold to raise', (m) => p(m.foldToRaise)],
	['stay after seeing', (m) => p(m.stayAfterSeeing)],
	['showdown', (m) => p(m.showdownRate)],
	['entropy (bits)', (m) => f2(m.entropy)]
];
const fpTable = (src) =>
	[pairHead, ...FP.map(([l, fn]) => `| ${l} | ${pair((m) => fn(src(m))).join(' | ')} |`)].join(
		'\n'
	);
const QUALITY = [
	['strong hand packed', 'strongPackRate'],
	['very weak continued', 'weakContinueRate'],
	['very weak raised', 'weakRaiseRate'],
	['monster not raised', 'monsterNoRaiseRate'],
	['big evidence override', 'bigOverrideRate'],
	['personality override', 'overrideRate'],
	['quirk override', 'quirkOverrideRate'],
	['mood moved decision', 'stateInfluence'],
	['memory moved decision', 'memoryInfluence'],
	['mood changed best move', 'stateOverrideRate'],
	['memory changed best move', 'memoryOverrideRate'],
	['belief confidence (mean)', 'modelConfidence']
];
const qualityTable = () => {
	const ids = [...pair((m) => m), ...REFERENCE_IDS];
	return [
		`| | ${QUALITY.map(([l]) => l).join(' | ')} |`,
		`|---|${QUALITY.map(() => '---:').join('|')}|`,
		...ids.map(
			(m) =>
				`| ${name(m)} | ${QUALITY.map(([, k]) => (k === 'modelConfidence' ? f2(heroFp[m][k]) : p(heroFp[m][k]))).join(' | ')} |`
		)
	].join('\n');
};
const confusion = (r, c) =>
	!r.confusion
		? 'n/a'
		: [
				`| actual \\ predicted | ${c.map(name).join(' | ')} | correct |`,
				`|---|${c.map(() => '---:').join('|')}|---:|`,
				...c.map(
					(a) =>
						`| ${name(a)} | ${c.map((b) => (a === b ? `**${r.confusion[a][b]}**` : r.confusion[a][b])).join(' | ')} | ${p(r.perClass[a])} |`
				)
			].join('\n');
const where = (src) =>
	[
		`| raise rate where | ${['Rohit v2', 'Rohit v3', 'Virat v2', 'Virat v3'].join(' | ')} |`,
		'|---|---:|---:|---:|---:|',
		...['blind', 'seenOpen', 'seenFacingRaise', 'headsUp', 'multiway', 'late'].map(
			(k) =>
				`| ${k} | ${['rohit-sharma@2', 'rohit-sharma@3', 'virat-kohli@2', 'virat-kohli@3'].map((m) => p(src(m).raiseWhere[k])).join(' | ')} |`
		)
	].join('\n');

const md = `# Bot Brain Phase 2 report: the mind (v2 vs v3)

Generated by \`node scripts/sim/phase2-report.mjs --seed ${SEED} --hands ${HANDS} --scale ${SCALE}\` on ${new Date().toISOString().slice(0, 10)}.
Real engine; ${SIM_VERSION}, fingerprint ${FINGERPRINT_VERSION}, judge ${JUDGE_VERSION}, ${MIND_VERSION}, ${OBSERVATION_VERSION}; variant \`${RULES}\`; boot 10, stack 100 boots, automatic rebuys.
v2 = styles \`@2\` on \`tp-dna@2\` (Phase 1.1, stateless). v3 = styles \`@3\` on \`tp-dna@3\` (Phase 2, with a mind).

**Scale:** ${totalHands.toLocaleString()} hands, ${totalDecisions.toLocaleString()} decisions, ${(wallMs / 1000).toFixed(0)} s on ${threads} worker processes. Slowest table ${(slowest.ms / 1000).toFixed(1)} s. Peak memory ${memory.workerMb.toFixed(0)} MB per worker, ${memory.parentMb.toFixed(0)} MB parent.

<!-- ANSWERS -->

## 1. Strength against one field (hero runs: same seat, tables, opponents and decks)

| | boots/100 | 95% CI |
|---|---:|---:|
${HEROES.map((m) => {
	const s = strength(m);
	return `| ${name(m)} | ${s.mean.toFixed(0)} | ± ${s.ci.toFixed(0)} |`;
}).join('\n')}

| paired v2 → v3 | change in boots/100 |
|---|---:|
${CHARACTER_IDS.map((c) => {
	const d = paired(`${c}@2`, `${c}@3`);
	return `| ${name(c)} | ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(0)} ± ${d.ci.toFixed(0)} |`;
}).join('\n')}

## 2. Fingerprints (mixed tables; identical compositions and decks for v2 and v3)

${fpTable((m) => mixed[m.endsWith('@2') ? 2 : 3][m])}

## 3. Decision quality and influence (hero runs, judge with the bot's own cards)

Forced moves (pack the only legal move) are not graded (judge@2). "Big evidence override" = the policy's best move beat the base brain's by more than 0.1 of card and money evidence. Mood / memory "moved" = a non-zero contribution; "changed best move" = without it the best move would differ.

${qualityTable()}

## 4. Identifiability (public behaviour, ${FEATURES.length} features)

| hands watched | v2 | v3 |
|---:|---:|---:|
${[0, 1, 2, 3].map((i) => `| ${ident[2][i].k} | ${p(ident[2][i].accuracy)} | ${p(ident[3][i].accuracy)} |`).join('\n')}
| whole 200-hand session (varied tables) | ${p(session['sessionAccuracy@2'])} | ${p(session['sessionAccuracy@3'])} |

${[0, 1, 2, 3].map((i) => `### v3 confusion at ${ident[3][i].k} hands\n\n${confusion(ident[3][i], V3)}`).join('\n\n')}

### v2 confusion at 50 hands (Phase 1.1, for comparison)

${confusion(ident[2][2], V2)}

## 5. Single-feature ablation at 50 hands

| removed | v2 | v3 | ${V3.map(name).join(' | ')} |
|---|---:|---:|${V3.map(() => '---:').join('|')}|
${ablation[3].map(({ name: n, r }, i) => `| ${n} | ${p(ablation[2][i].r.accuracy)} | **${p(r.accuracy)}** | ${V3.map((c) => p(r.perClass?.[c])).join(' | ')} |`).join('\n')}

## 6. Distances (hero runs, one field)

For scale: legacy-normal to legacy-hard ${dist.legacyPair.toFixed(2)}.

| character | nearest reference v2 | nearest reference v3 | nearest character v2 | nearest character v3 |
|---|---|---|---|---|
${CHARACTER_IDS.map((c) => {
	const a = dist[`${c}@2`],
		b = dist[`${c}@3`];
	return `| ${name(c)} | ${a.ref[0]} ${a.ref[1].toFixed(2)} | ${b.ref[0]} ${b.ref[1].toFixed(2)} | ${name(a.char[0])} ${a.char[1].toFixed(2)} | ${name(b.char[0])} ${b.char[1].toFixed(2)} |`;
}).join('\n')}

## 7. Session variation: same person, different night

Whole-session fingerprints (200 hands), standardized over every session in the study. **Same table**: ${SESSIONS} sessions with identical opponents and decks, only the decision seed differs. **Varied**: ${SESSIONS} sessions at different tables. Spread = mean distance of a session from that character's own centre.

| | same-table spread v2 | same-table spread v3 | varied spread v2 | varied spread v3 |
|---|---:|---:|---:|---:|
${CHARACTER_IDS.map((c) => `| ${name(c)} | ${f2(session[`${c}@2`].same.spread)} | ${f2(session[`${c}@3`].same.spread)} | ${f2(session[`${c}@2`].varied.spread)} | ${f2(session[`${c}@3`].varied.spread)} |`).join('\n')}

**Night effect** (same table, \`nightEffect\` in \`server/sim/fingerprint.mjs\`): each session split into even and odd hands. Within = distance between the two halves of one night; between = distance to the other nights' halves; night = between minus within, with its 95% interval. Different choices send even a stateless policy down different paths at the same table, so v2 is not zero: **v3 minus v2 is what the mind adds** (mood, tonight's form, memory).

| | within v2 | within v3 | night v2 | night v3 | mind adds |
|---|---:|---:|---:|---:|---:|
${CHARACTER_IDS.map((c) => {
	const [a, b] = [session[`${c}@2`].night, session[`${c}@3`].night];
	return `| ${name(c)} | ${f2(a.within)} | ${f2(b.within)} | ${f2(a.night)} ± ${f2(a.ci)} | ${f2(b.night)} ± ${f2(b.ci)} | ${b.night - a.night >= 0 ? '+' : ''}${f2(b.night - a.night)} |`;
}).join('\n')}

## 8. Behaviour after significant events (mixed tables)

The 3 hands after a loss or win of ${BIG}+ boots, against all other hands. A stateless policy (v2) should show only table-context differences.

| | aggression after seeing (raise per call): base / after loss / after win | raise after seeing: base / after loss / after win | stay after seeing: base / after loss | hands after loss |
|---|---|---|---|---:|
${pair((m) => m)
	.map((m) => {
		const e = events[m];
		return `| ${name(m)} | ${f2(e.base.aggression)} / ${f2(e.loss.aggression)} / ${f2(e.win.aggression)} | ${p(e.base.seenRaiseRate)} / ${p(e.loss.seenRaiseRate)} / ${p(e.win.seenRaiseRate)} | ${p(e.base.stayAfterSeeing)} / ${p(e.loss.stayAfterSeeing)} | ${e.n.loss.toLocaleString()} |`;
	})
	.join('\n')}

## 9. Character questions

### Rohit vs Virat: where the aggression happens (mixed tables)

${where((m) => mixed[m.endsWith('@2') ? 2 : 3][m])}

### Samay: continuing by hand strength and by ambiguity (hero runs)

Continue = anything but pack, on seen decisions. Strength is the chance to beat every live opponent, as a multiple of a fair share.

| | ${STRENGTH_BUCKETS.join(' | ')} | ambiguous (clarity < 0.1) | clear |
|---|${STRENGTH_BUCKETS.map(() => '---:').join('|')}|---:|---:|
${pair((m) => m)
	.map(
		(m) =>
			`| ${name(m)} | ${heroFp[m].continueByStrength.map(p).join(' | ')} | ${p(heroFp[m].continueAmbiguous)} | ${p(heroFp[m].continueClear)} |`
	)
	.join('\n')}

### GG: when he looks (mixed tables)

| | after 0 blind bets | 1 | 2 | 3+ | never looked |
|---|---:|---:|---:|---:|---:|
${pair((m) => m)
	.map(
		(m) => `| ${name(m)} | ${mixed[m.endsWith('@2') ? 2 : 3][m].lookTiming.map(p).join(' | ')} |`
	)
	.join('\n')}

### Dhoni: adaptation against one opponent type (hands 1 to 40 vs 121 to 200)

| opponents | character | thin raise (≤ fair share) early → late | value raise (> 1.25x fair) early → late | continue facing a raise early → late | boots/100 early → late |
|---|---|---|---|---|---|
${TYPES.flatMap((type) =>
	pair((m) => m)
		.filter((m) => m.startsWith('ms-dhoni') || m.startsWith('samay') || m.startsWith('virat'))
		.map((m) => {
			const a = adaptation[`${type}|${m}`];
			return `| ${type} | ${name(m)} | ${p(a.early.thinRaise)} → ${p(a.late.thinRaise)} | ${p(a.early.valueRaise)} → ${p(a.late.valueRaise)} | ${p(1 - (a.early.foldToRaise ?? 0))} → ${p(1 - (a.late.foldToRaise ?? 0))} | ${a.early.bootsPer100.toFixed(0)} → ${a.late.bootsPer100.toFixed(0)} |`;
		})
).join('\n')}

### Exploitation: playing folders, callers and maniacs differently (hands 41 to 200, ${ADAPT_TABLES} tables each)

Thin raise = raise after seeing with at most a fair share. **Bluff index** = thin raises against rocks minus against stations; **call index** = folding to a raise against rocks minus against maniacs. "Mind adds" = v3 index minus v2 index (v2 has no memory, so its differences come only from the opponents' play).

| character | thin raise vs rock v2 → v3 | vs station v2 → v3 | bluff index: mind adds | fold to raise vs rock / maniac v3 | call index: mind adds | boots/100 vs rock / station / maniac v2 | v3 |
|---|---|---|---:|---|---:|---|---|
${CHARACTER_IDS.map((c) => {
	const [a, b] = [exploit[c][2], exploit[c][3]];
	const sg = (x) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)} pts`;
	const boots = (o) => [o.rock, o.station, o.aggr].map((m) => m.bootsPer100.toFixed(0)).join(' / ');
	return `| ${name(c)} | ${p(a.rock.thinRaise)} → ${p(b.rock.thinRaise)} | ${p(a.station.thinRaise)} → ${p(b.station.thinRaise)} | ${sg(b.bluff - a.bluff)} | ${p(b.rock.foldToRaise)} / ${p(b.aggr.foldToRaise)} | ${sg(b.call - a.call)} | ${boots(a)} | ${boots(b)} |`;
}).join('\n')}

## 10. Performance (clean: \`scripts/sim/bench.mjs\` in a fresh process, after JIT warm-up)

| policy (5 seats) | hands/s incl. engine | decision p50 ms | p95 ms | p99 ms | max ms |
|---|---:|---:|---:|---:|---:|
${['legacy', 'v2', 'v3'].map((g) => `| ${g} | ${bench[g].handsPerSec} | ${bench[g].decision.p50.toFixed(3)} | ${bench[g].decision.p95.toFixed(3)} | ${bench[g].decision.p99.toFixed(3)} | ${bench[g].decision.max.toFixed(1)} |`).join('\n')}

Mind upkeep for v3 (all five bots observing one commit): p50 ${bench.v3.mindUpkeepPerCommit.p50.toFixed(2)} ms, p95 ${bench.v3.mindUpkeepPerCommit.p95.toFixed(2)} ms, p99 ${bench.v3.mindUpkeepPerCommit.p99.toFixed(2)} ms. Largest mind after 200 hands: ${(mindBytes / 1024).toFixed(1)} KB of JSON. Benchmark process ${bench.rssMb} MB.

## 11. Example decision traces (v3, table 4242)

${V3.map((id) => (examples[id] ? `Hand ${examples[id].hand}, step ${examples[id].step}, reproduced from seed: ${examples[id].reproduced ? 'yes' : 'NO'}\n\n\`\`\`\n${examples[id].text}\n\`\`\`` : `No matching example for ${name(id)} in 200 hands.`)).join('\n\n')}

## 12. Decision graph (generated from \`CHARACTER_GRAPH_V3\`)

\`\`\`mermaid
${toMermaid(CHARACTER_GRAPH_V3)}
\`\`\`

Styles published: ${Object.keys(STYLES).length}.
`;
mkdirSync(new URL('../../docs/bots/', import.meta.url), { recursive: true });
// --md <path>: write elsewhere (a trial run must not overwrite the reviewed report).
const mdPath = process.argv.includes('--md')
	? process.argv[process.argv.indexOf('--md') + 1]
	: new URL('../../docs/bots/PHASE2_REPORT.md', import.meta.url);
writeFileSync(mdPath, md);
console.log(
	`Phase 2 report: ${totalHands} hands in ${(wallMs / 1000).toFixed(0)} s. Wrote ${mdPath}`
);
console.log(
	[2, 3].map((v) => `v${v}: ${ident[v].map((r) => `${r.k}=${p(r.accuracy)}`).join(' ')}`).join('\n')
);
