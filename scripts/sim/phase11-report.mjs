/**
 * Phase 1.1 report (docs/archive/BOT_BRAIN.md §27): character styles @1 (tp-dna@1) against @2
 * (tp-dna@2), measured the same way. Measurement only: nothing is tuned here.
 *
 *   node scripts/sim/phase11-report.mjs [--seed 11] [--hands 200] [--scale 1]
 *
 * Runs:
 *  - mixed@v: 2 to 5 characters of one version per table, the rest reference bots. Version 1 and
 *    version 2 use identical table compositions and decks (same seeds), so they differ only in the
 *    characters' policy. Fingerprints and identifiability come from here.
 *  - hero: every policy (5 characters x 2 versions, 7 reference bots) takes the same seat at the
 *    same tables against the same four reference opponents with the same decks. Strength,
 *    decision quality and distances come from here, so every policy faces one field.
 *
 * Writes docs/archive/bots/PHASE1_1_REPORT.md and .sim/phase11-<seed>.json.
 */
import { runPool } from './pool.mjs';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { REFERENCE_IDS, CHARACTER_IDS, versioned } from '../../server/sim/population.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';
import { sum, metrics, FEATURES, FINGERPRINT_VERSION } from '../../server/sim/fingerprint.mjs';
import { identifiability } from '../../server/sim/identify.mjs';
import { runTable, reproduceHand, SIM_VERSION } from '../../server/sim/table.mjs';
import { JUDGE_VERSION } from '../../server/sim/judge.mjs';
import { explainDecision } from '../../server/sim/explain.mjs';
import { CHARACTER_GRAPH_V2 } from '../../server/bots/character-v2.mjs';
import { toMermaid } from '../../server/bots/graph.mjs';
import { STYLES } from '../../server/bots/dna-styles.mjs';
import { castMember } from '../../src/lib/bots/cast.js';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const SEED = arg('seed', 11);
const HANDS = arg('hands', 200);
const SCALE = arg('scale', 1);
const RULES = 'classic-1';
const V1 = versioned(1);
const V2 = versioned(2);
const HEROES = [...V1, ...V2, ...REFERENCE_IDS];
const HERO_TABLES = Math.round(160 * SCALE);
const HERO_HANDS = Math.round(HANDS * 0.75);

/* ---------------------------------------- plan ---------------------------------------- */

const specs = [];
for (let t = 0; t < 480 * SCALE; t++) {
	const r = stream(SEED, 'compose-mix', t).random;
	const chars = shuffle(CHARACTER_IDS, r).slice(0, 2 + Math.floor(r() * 4));
	const refs = shuffle(REFERENCE_IDS, r).slice(0, 5 - chars.length);
	const order = shuffle([...chars, ...refs], r);
	for (const v of [1, 2])
		specs.push({
			run: `mixed@${v}`,
			table: t,
			seats: order.map((m) => (CHARACTER_IDS.includes(m) ? `${m}@${v}` : m)),
			seed: SEED,
			hands: HANDS,
			rulesVersion: RULES
		});
}
for (let t = 0; t < HERO_TABLES; t++) {
	const field = shuffle(REFERENCE_IDS, stream(SEED, 'hero-field', t).random).slice(0, 4);
	for (const hero of HEROES) {
		const seats = field.slice();
		seats.splice(t % 5, 0, hero);
		specs.push({
			run: `hero:${hero}`,
			table: t,
			heroSeat: t % 5,
			seats,
			seed: SEED,
			hands: HERO_HANDS,
			rulesVersion: RULES
		});
	}
}

/* ---------------------------------------- run ---------------------------------------- */

let peakRss = 0;
let peakHeap = 0;
const sampleMemory = () => {
	const m = process.memoryUsage();
	peakRss = Math.max(peakRss, m.rss);
	peakHeap = Math.max(peakHeap, m.heapUsed);
};
const sampler = setInterval(sampleMemory, 250);
const threads = Math.max(1, availableParallelism() - 1);
const started = performance.now();
let lastLog = 0;
const results = await runPool(specs, threads, (done, total) => {
	if (performance.now() - lastLog > 15000 || done === total) {
		lastLog = performance.now();
		console.log(`  ${done}/${total} tables`);
	}
});
const wallMs = performance.now() - started;
const tableMs = results.map((r) => r.ms).sort((x, y) => x - y);
const slowest = results.reduce((m, r) => (r.ms > m.ms ? r : m));
const simMemory = {
	peakWorkerRssMb: Math.max(...results.map((r) => r.rssMb)),
	peakParentRssMb: peakRss / 2 ** 20,
	peakParentHeapMb: peakHeap / 2 ** 20
};
clearInterval(sampler);
sampleMemory();

const totalHands = specs.reduce((s, x) => s + x.hands, 0);
const totalDecisions = results.reduce((s, r) => s + r.decisions, 0);

/* ----------------------------------- aggregate ----------------------------------- */

const handsOf = (filter) => {
	const by = {};
	for (const r of results.filter((x) => filter(x.run)))
		for (const s of r.seats) (by[s.member] ??= []).push(...s.hands);
	return by;
};
const fpOf = (by) =>
	Object.fromEntries(Object.entries(by).map(([m, hands]) => [m, metrics(sum(hands))]));

const mixed = {
	1: fpOf(handsOf((r) => r === 'mixed@1')),
	2: fpOf(handsOf((r) => r === 'mixed@2'))
};

// Hero runs: the hero seat only; strength with a CI over tables (hands within a table are not independent).
const hero = {};
const heroTables = {};
for (const r of results.filter((x) => x.run.startsWith('hero:'))) {
	const id = r.run.slice('hero:'.length);
	const seat = specs.find((s) => s.run === r.run && s.table === r.table).heroSeat;
	const hands = r.seats[seat].hands;
	(hero[id] ??= []).push(...hands);
	(heroTables[id] ??= {})[r.table] = {
		net: hands.reduce((s, h) => s + h.net, 0),
		hands: hands.length
	};
}
const heroFp = fpOf(hero);
function strength(id) {
	const tables = Object.values(heroTables[id]);
	const per = tables.map((t) => (t.net / t.hands) * 100);
	const mean = per.reduce((s, x) => s + x, 0) / per.length;
	const sd = Math.sqrt(per.reduce((s, x) => s + (x - mean) ** 2, 0) / (per.length - 1));
	return { mean, ci: (1.96 * sd) / Math.sqrt(per.length), tables: per.length };
}
function paired(a, b) {
	const keys = Object.keys(heroTables[a]);
	const diffs = keys.map(
		(t) => ((heroTables[b][t].net - heroTables[a][t].net) / heroTables[a][t].hands) * 100
	);
	const mean = diffs.reduce((s, x) => s + x, 0) / diffs.length;
	const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / (diffs.length - 1));
	return { mean, ci: (1.96 * sd) / Math.sqrt(diffs.length) };
}

// Identifiability per version, from the mixed runs.
const sessions = (v) =>
	results
		.filter((r) => r.run === `mixed@${v}`)
		.flatMap((r) => r.seats.map((s) => ({ table: r.table, member: s.member, hands: s.hands })));
const S = { 1: sessions(1), 2: sessions(2) };
const classes = { 1: V1, 2: V2 };
const ident = Object.fromEntries(
	[1, 2].map((v) => [v, [10, 25, 50, 100].map((k) => identifiability(S[v], k, classes[v]))])
);
const GROUPS = {
	'blind features (blindRounds, blindRaiseRate)': ['blindRounds', 'blindRaiseRate'],
	'show behaviour (showRate, showdownRate)': ['showRate', 'showdownRate'],
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
	[1, 2].map((v) => [
		v,
		ablations.map(([name, without]) => ({
			name,
			r: identifiability(S[v], 50, classes[v], without)
		}))
	])
);

// Distances in the same field (hero runs), standardized over every hero.
function distances() {
	const ids = HEROES;
	const vec = (m) => FEATURES.map((f) => heroFp[m][f] ?? 0);
	const n = FEATURES.length;
	const mean = Array.from(
		{ length: n },
		(_, i) => ids.reduce((s, m) => s + vec(m)[i], 0) / ids.length
	);
	const sd = Array.from(
		{ length: n },
		(_, i) => Math.sqrt(ids.reduce((s, m) => s + (vec(m)[i] - mean[i]) ** 2, 0) / ids.length) || 1
	);
	const z = (m) => vec(m).map((x, i) => (x - mean[i]) / sd[i]);
	const d = (a, b) => Math.sqrt(z(a).reduce((s, x, i) => s + (x - z(b)[i]) ** 2, 0));
	const out = {};
	for (const v of [1, 2])
		for (const c of classes[v]) {
			const refs = REFERENCE_IDS.map((r) => [r, d(c, r)]).sort((a, b) => a[1] - b[1]);
			const chars = classes[v]
				.filter((x) => x !== c)
				.map((x) => [x, d(c, x)])
				.sort((a, b) => a[1] - b[1]);
			out[c] = { nearestRef: refs[0], nearestChar: chars[0], toChars: Object.fromEntries(chars) };
		}
	out.legacyPair = d('legacy-normal', 'legacy-hard');
	out.easyNormal = d('legacy-easy', 'legacy-normal');
	return out;
}
const dist = distances();

/* --------------------------------- clean timing --------------------------------- */

function benchTable(seats, hands = 500) {
	const times = {};
	runTable({ seed: SEED, table: 7777, seats, hands, rulesVersion: RULES }, (h) => {
		for (const d of h.decisions) (times[seats[d.seat]] ??= []).push(d.ms);
		sampleMemory();
	});
	return times;
}
const pct = (xs, p) => {
	const s = xs.slice().sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const benchStart = performance.now();
const timing = {};
for (const level of ['easy', 'normal', 'hard']) {
	const t = benchTable(Array(5).fill(`legacy-${level}`));
	timing[`legacy-${level}`] = Object.values(t).flat();
}
for (const group of [V1, V2]) Object.assign(timing, benchTable(group));
const benchMs = performance.now() - benchStart;
const timingRows = Object.fromEntries(
	Object.entries(timing).map(([m, xs]) => [
		m,
		{
			n: xs.length,
			p50: pct(xs, 0.5),
			p95: pct(xs, 0.95),
			p99: pct(xs, 0.99),
			max: Math.max(...xs)
		}
	])
);
function throughput(seats, hands = 400) {
	const t0 = performance.now();
	runTable({ seed: SEED, table: 8888, seats, hands, rulesVersion: RULES });
	return Math.round((hands / (performance.now() - t0)) * 1000);
}
const hps = {
	legacy: throughput([
		'legacy-easy',
		'legacy-normal',
		'legacy-hard',
		'legacy-normal',
		'legacy-hard'
	]),
	v1: throughput(V1),
	v2: throughput(V2)
};
sampleMemory();

/* --------------------------------- example traces --------------------------------- */

const exampleSpec = {
	seed: SEED,
	table: 4242,
	seats: V2,
	rulesVersion: RULES,
	hands: 200,
	traces: true
};
const exampleHands = runTable(exampleSpec);
const WANT = {
	'rohit-sharma@2': (d) => d.blind && Object.values(d.move.trace.quirk ?? {}).some((x) => x !== 0),
	'virat-kohli@2': (d) => !d.blind && d.name === 'raise' && d.move.trace.alternatives?.length >= 2,
	'gg@2': (d) => !d.blind && d.move.trace.resisted?.length,
	'samay-raina@2': (d) => !d.blind && d.move.trace.s >= 0.55 && d.name === 'raise',
	'ms-dhoni@2': (d) => !d.blind && Math.max(...Object.values(d.move.trace.probs ?? { x: 1 })) < 0.7
};
const examples = {};
for (const hand of exampleHands)
	for (const d of hand.decisions) {
		const id = V2[d.seat];
		if (examples[id] || !d.move.trace?.probs || !WANT[id](d)) continue;
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
const raw = {
	slowestTable: { run: slowest.run, table: slowest.table, ms: slowest.ms },
	seed: SEED,
	hands: HANDS,
	heroHands: HERO_HANDS,
	heroTables: HERO_TABLES,
	sim: SIM_VERSION,
	fp: FINGERPRINT_VERSION,
	judge: JUDGE_VERSION,
	wallMs,
	totalHands,
	totalDecisions,
	simMemory,
	mixed,
	heroFp,
	ident,
	ablation,
	dist,
	timingRows,
	hps,
	benchMs
};
writeFileSync(
	new URL(`../../.sim/phase11-${SEED}.json`, import.meta.url),
	JSON.stringify(raw, null, 1)
);

const name = (m) => {
	const [id, v] = m.split('@');
	return castMember(id) ? `${castMember(id).name}${v ? ` v${v}` : ''}` : m;
};
const p = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
const f2 = (x) => (x === null || x === undefined ? 'n/a' : x.toFixed(2));
const FP_ROWS = [
	['blind rounds', (m) => f2(m.blindRounds)],
	['blind raise', (m) => p(m.blindRaiseRate)],
	['chaal', (m) => p(m.chaalRate)],
	['raise', (m) => p(m.raiseRate)],
	['pack', (m) => p(m.packRate)],
	['see', (m) => p(m.seeRate)],
	['show (when legal)', (m) => p(m.showRate)],
	['aggression (seen R/C)', (m) => f2(m.aggression)],
	['raise after seeing', (m) => p(m.seenRaiseRate)],
	['pack after seeing', (m) => p(m.seenPackRate)],
	['fold to raise', (m) => p(m.foldToRaise)],
	['stay after seeing', (m) => p(m.stayAfterSeeing)],
	['showdown', (m) => p(m.showdownRate)],
	['won at showdown', (m) => p(m.wonAtShowdown)],
	['entropy (bits)', (m) => f2(m.entropy)]
];
const QUALITY_ROWS = [
	['strong hand packed', 'strongPackRate'],
	['strong hand only called (raise legal)', 'strongPassiveRate'],
	['very weak hand continued', 'weakContinueRate'],
	['very weak hand raised', 'weakRaiseRate'],
	['monster not raised', 'monsterNoRaiseRate'],
	['sees under blind pressure', 'seeUnderPressure'],
	['sees without pressure', 'seeWithoutPressure'],
	['personality override (best move differs from base)', 'overrideRate'],
	['big override (beat > 0.1 of evidence)', 'bigOverrideRate'],
	['mean evidence overridden', 'meanOverriddenAdvantage'],
	['quirk override', 'quirkOverrideRate']
];
const fpTable = () => {
	const cols = CHARACTER_IDS.flatMap((c) => [`${c}@1`, `${c}@2`]);
	return [
		`| metric | ${cols.map(name).join(' | ')} |`,
		`|---|${cols.map(() => '---:').join('|')}|`,
		...FP_ROWS.map(
			([label, fn]) =>
				`| ${label} | ${cols.map((c) => fn(mixed[c.endsWith('@1') ? 1 : 2][c])).join(' | ')} |`
		)
	].join('\n');
};
const qualityTable = () => {
	const ids = [...CHARACTER_IDS.flatMap((c) => [`${c}@1`, `${c}@2`]), ...REFERENCE_IDS];
	return [
		`| | ${QUALITY_ROWS.map(([l]) => l).join(' | ')} |`,
		`|---|${QUALITY_ROWS.map(() => '---:').join('|')}|`,
		...ids.map(
			(m) =>
				`| ${name(m)} | ${QUALITY_ROWS.map(([, k]) => (k === 'meanOverriddenAdvantage' ? f2(heroFp[m][k]) : p(heroFp[m][k]))).join(' | ')} |`
		)
	].join('\n');
};
const confusion = (r, cls) =>
	!r.confusion
		? `Not enough hands for ${r.k}-hand windows.`
		: [
				`| actual \\ predicted | ${cls.map(name).join(' | ')} | correct |`,
				`|---|${cls.map(() => '---:').join('|')}|---:|`,
				...cls.map(
					(a) =>
						`| ${name(a)} | ${cls.map((b) => (a === b ? `**${r.confusion[a][b]}**` : r.confusion[a][b])).join(' | ')} | ${p(r.perClass[a])} |`
				)
			].join('\n');

const md = `# Bot Brain Phase 1.1 report: character styles v1 vs v2

Generated by \`node scripts/sim/phase11-report.mjs --seed ${SEED} --hands ${HANDS} --scale ${SCALE}\` on ${new Date().toISOString().slice(0, 10)}.
Real engine; ${SIM_VERSION}, fingerprint ${FINGERPRINT_VERSION}, decision judge ${JUDGE_VERSION}; variant \`${RULES}\`; boot 10, stack 100 boots, automatic rebuys.
v1 = styles \`@1\` on \`tp-dna@1\` (unchanged, pinned by a golden test). v2 = styles \`@2\` on \`tp-dna@2\`.

**Scale:** ${totalHands.toLocaleString()} hands, ${totalDecisions.toLocaleString()} decisions in ${(wallMs / 1000).toFixed(0)} s on ${threads} worker processes. Peak memory: ${simMemory.peakWorkerRssMb.toFixed(0)} MB per worker process, ${simMemory.peakParentRssMb.toFixed(0)} MB for the parent holding all results.

<!-- ANSWERS -->

## 1. Strength against one field (hero runs)

Each policy takes the same seat at the same ${HERO_TABLES} tables, against the same four reference opponents, with the same decks, ${HERO_HANDS} hands per table. CI is over tables.

| policy | boots/100 | 95% CI |
|---|---:|---:|
${HEROES.map((m) => {
	const s = strength(m);
	return `| ${name(m)} | ${s.mean.toFixed(0)} | ± ${s.ci.toFixed(0)} |`;
}).join('\n')}

**Paired change v1 → v2** (same tables, same cards, same opponents):

| character | v2 minus v1, boots/100 |
|---|---:|
${CHARACTER_IDS.map((c) => {
	const d = paired(`${c}@1`, `${c}@2`);
	return `| ${name(c)} | ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(0)} ± ${d.ci.toFixed(0)} |`;
}).join('\n')}

Limitation: this is lightweight duplicate evaluation (same cards, same seat, same opponents). It does not rotate one deal through every seat, and opponents' later decisions diverge once the hero acts differently. Full duplicate mode is phase 3.

## 2. Fingerprints, v1 and v2 (mixed tables; same compositions and decks for both versions)

${fpTable()}

## 3. Decision quality (hero runs: one field, graded with the bot's own cards offline)

"Strong" = beats every live opponent at least twice a fair share (capped at 80%); "very weak" = under a third of a fair share; "monster" = top 1.5% of hands. Override rates count decisions where the policy's own best move differed from the base brain's; the overridden size counts evidence (cards, money) only, not blind customs. v1 cannot separate quirks.

${qualityTable()}

## 4. Identifiability (public behaviour only; ${FEATURES.length} features)

| hands watched | v1 accuracy | v2 accuracy |
|---:|---:|---:|
${[0, 1, 2, 3].map((i) => `| ${ident[1][i].k} | ${p(ident[1][i].accuracy)} | ${p(ident[2][i].accuracy)} |`).join('\n')}

${[0, 1, 2, 3].map((i) => `### v2 confusion at ${ident[2][i].k} hands\n\n${confusion(ident[2][i], V2)}`).join('\n\n')}

### v1 confusion at 50 hands (for comparison)

${confusion(ident[1][2], V1)}

## 5. Single-feature ablation at 50 hands

Identification with one feature (or one group) removed. A diagnostic, not a target.

| removed | v1 | v2 | ${V2.map(name).join(' | ')} |
|---|---:|---:|${V2.map(() => '---:').join('|')}|
${ablation[2].map(({ name: n, r }, i) => `| ${n} | ${p(ablation[1][i].r.accuracy)} | **${p(r.accuracy)}** | ${V2.map((c) => p(r.perClass?.[c])).join(' | ')} |`).join('\n')}

## 6. Distances (hero runs, one field, standardized over all ${HEROES.length} policies)

For scale: legacy-normal to legacy-hard ${dist.legacyPair.toFixed(2)} (practically the same bot); legacy-easy to legacy-normal ${dist.easyNormal.toFixed(2)}.

| character | nearest reference v1 | nearest reference v2 | nearest character v1 | nearest character v2 |
|---|---|---|---|---|
${CHARACTER_IDS.map((c) => {
	const a = dist[`${c}@1`],
		b = dist[`${c}@2`];
	return `| ${name(c)} | ${a.nearestRef[0]} ${a.nearestRef[1].toFixed(2)} | ${b.nearestRef[0]} ${b.nearestRef[1].toFixed(2)} | ${name(a.nearestChar[0])} ${a.nearestChar[1].toFixed(2)} | ${name(b.nearestChar[0])} ${b.nearestChar[1].toFixed(2)} |`;
}).join('\n')}

### Within-character spread vs between-character distance (mixed runs, 50 hands)

| | ${V1.map((c) => name(c.split('@')[0])).join(' | ')} | closest pair |
|---|${V1.map(() => '---:').join('|')}|---|
| v1 within spread | ${V1.map((c) => f2(ident[1][2].withinSpread?.[c])).join(' | ')} | ${ident[1][2].betweenDistance[0] ? `${name(ident[1][2].betweenDistance[0].a)} : ${name(ident[1][2].betweenDistance[0].b)} ${ident[1][2].betweenDistance[0].d.toFixed(2)}` : 'n/a'} |
| v2 within spread | ${V2.map((c) => f2(ident[2][2].withinSpread?.[c])).join(' | ')} | ${ident[2][2].betweenDistance[0] ? `${name(ident[2][2].betweenDistance[0].a)} : ${name(ident[2][2].betweenDistance[0].b)} ${ident[2][2].betweenDistance[0].d.toFixed(2)}` : 'n/a'} |

Phase 1 bots are stateless, so this spread is sampling noise plus table context, not genuine session-to-session variation; see the limitation in BOT_BRAIN.md §27.

## 7. Performance (clean: one thread, no simulation running)

| policy | decisions | p50 ms | p95 ms | p99 ms | max ms |
|---|---:|---:|---:|---:|---:|
${Object.entries(timingRows)
	.map(
		([m, t]) =>
			`| ${name(m)} | ${t.n.toLocaleString()} | ${t.p50.toFixed(3)} | ${t.p95.toFixed(3)} | ${t.p99.toFixed(3)} | ${t.max.toFixed(2)} |`
	)
	.join('\n')}

Simulation tables (${HANDS} or ${HERO_HANDS} hands, Maglev off in workers): median ${(tableMs[Math.floor(tableMs.length / 2)] / 1000).toFixed(2)} s, slowest ${(slowest.ms / 1000).toFixed(1)} s (${slowest.run}, table ${slowest.table}).

Hands per second on one thread, including the engine: legacy ${hps.legacy}, characters v1 ${hps.v1}, characters v2 ${hps.v2}. Peak memory: ${simMemory.peakWorkerRssMb.toFixed(0)} MB per worker process; parent ${simMemory.peakParentRssMb.toFixed(0)} MB (heap ${simMemory.peakParentHeapMb.toFixed(0)} MB, holding every result).

## 8. Example decision traces (v2; table 4242)

${V2.map((id) => (examples[id] ? `Hand ${examples[id].hand}, step ${examples[id].step}, reproduced from seed: ${examples[id].reproduced ? 'yes' : 'NO'}\n\n\`\`\`\n${examples[id].text}\n\`\`\`` : `No matching example for ${name(id)} in 200 hands.`)).join('\n\n')}

## 9. Decision graph (generated from \`CHARACTER_GRAPH_V2\`)

\`\`\`mermaid
${toMermaid(CHARACTER_GRAPH_V2)}
\`\`\`

Styles published: ${Object.keys(STYLES).length}.
`;
mkdirSync(new URL('../../docs/bots/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../docs/archive/bots/PHASE1_1_REPORT.md', import.meta.url), md);
console.log(
	`Phase 1.1 report: ${totalHands} hands in ${(wallMs / 1000).toFixed(0)} s. Wrote docs/archive/bots/PHASE1_1_REPORT.md and .sim/phase11-${SEED}.json`
);
console.log(
	[1, 2].map((v) => `v${v}: ${ident[v].map((r) => `${r.k}=${p(r.accuracy)}`).join(' ')}`).join('\n')
);
