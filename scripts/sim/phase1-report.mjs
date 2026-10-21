/**
 * Phase 1 measurement report (docs/BOT_BRAIN.md §20): reference fingerprints, character
 * fingerprints, character identifiability at 10/25/50/100 hands, performance, example traces.
 * Measurement only: nothing is tuned or trained here.
 *
 *   node scripts/sim/phase1-report.mjs [--seed 1] [--hands 150] [--scale 1]
 *
 * Writes docs/bots/PHASE1_REPORT.md and the raw numbers to .sim/phase1-<seed>.json.
 */
import { runPool } from './pool.mjs';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { REFERENCE_IDS, CHARACTER_IDS } from '../../server/sim/population.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';
import { sum, metrics, FINGERPRINT_VERSION, FEATURES } from '../../server/sim/fingerprint.mjs';
import { identifiability } from '../../server/sim/identify.mjs';
import { runTable, reproduceHand, SIM_VERSION } from '../../server/sim/table.mjs';
import { explainDecision } from '../../server/sim/explain.mjs';
import { CHARACTER_GRAPH } from '../../server/bots/character.mjs';
import { toMermaid } from '../../server/bots/graph.mjs';
import { STYLES, CHARACTER_STYLES } from '../../server/bots/dna-styles.mjs';
import { castMember } from '../../src/lib/bots/cast.js';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const SEED = arg('seed', 1);
const HANDS = arg('hands', 150);
const SCALE = arg('scale', 1);
const RULES = 'classic-1';

/* ---------------------------------------- plan ---------------------------------------- */

const specs = [];
const spec = (run, table, seats) =>
	specs.push({ run, table, seats, seed: SEED, hands: HANDS, rulesVersion: RULES });
// A: the reference population alone, random five-seat tables.
for (let t = 0; t < 240 * SCALE; t++)
	spec('reference', t, shuffle(REFERENCE_IDS, stream(SEED, 'compose-ref', t).random).slice(0, 5));
// B: characters among themselves and references: 2 to 5 characters per table, rest references.
for (let t = 0; t < 480 * SCALE; t++) {
	const r = stream(SEED, 'compose-mix', t).random;
	const chars = shuffle(CHARACTER_IDS, r).slice(0, 2 + Math.floor(r() * 4));
	const refs = shuffle(REFERENCE_IDS, r).slice(0, 5 - chars.length);
	spec('mixed', t, shuffle([...chars, ...refs], r));
}
// C: each character alone against four references (competence against a fixed field).
for (const c of CHARACTER_IDS)
	for (let t = 0; t < 80 * SCALE; t++) {
		const r = stream(SEED, `compose-solo-${c}`, t).random;
		spec(`solo:${c}`, t, shuffle([c, ...shuffle(REFERENCE_IDS, r).slice(0, 4)], r));
	}

/* ---------------------------------------- run ---------------------------------------- */

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
const totalHands = specs.length * HANDS;
const totalDecisions = results.reduce((s, r) => s + r.decisions, 0);

/* -------------------------------------- aggregate -------------------------------------- */

function fingerprints(runFilter) {
	const by = {};
	for (const r of results.filter((x) => runFilter(x.run)))
		for (const s of r.seats) (by[s.member] ??= []).push(...s.hands);
	return Object.fromEntries(Object.entries(by).map(([m, hands]) => [m, metrics(sum(hands))]));
}
const referenceFp = fingerprints((run) => run === 'reference');
const mixedFp = fingerprints((run) => run === 'mixed');
const soloFp = Object.fromEntries(
	CHARACTER_IDS.map((c) => [c, fingerprints((run) => run === `solo:${c}`)[c]])
);

const sessions = results
	.filter((r) => r.run === 'mixed')
	.flatMap((r) => r.seats.map((s) => ({ table: r.table, member: s.member, hands: s.hands })));
const ident = [10, 25, 50, 100].map((k) => identifiability(sessions, k, CHARACTER_IDS));

const timing = {};
for (const r of results)
	for (const [m, xs] of Object.entries(r.timing)) (timing[m] ??= []).push(...xs);
const pctl = (xs, p) => {
	const s = xs.slice().sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const timingRows = Object.fromEntries(
	Object.entries(timing).map(([m, xs]) => [
		m,
		{ p50: pctl(xs, 0.5), p99: pctl(xs, 0.99), n: xs.length }
	])
);

// Clean single-thread throughput, without parallel contention.
function bench(seats, hands = 600) {
	const t0 = performance.now();
	let decisions = 0;
	runTable(
		{ seed: SEED, table: 9999, seats, hands, rulesVersion: RULES },
		(h) => (decisions += h.decisions.length)
	);
	const ms = performance.now() - t0;
	return {
		hands,
		decisions,
		handsPerSec: Math.round((hands / ms) * 1000),
		msPerDecision: ms / decisions
	};
}
const benchLegacy = bench([
	'legacy-easy',
	'legacy-normal',
	'legacy-hard',
	'legacy-normal',
	'legacy-hard'
]);
const benchCharacters = bench(CHARACTER_IDS);

/* ----------------------------------- example traces ----------------------------------- */

// For each character, the first seen, non-forced decision with at least four factors.
const examples = {};
const exampleSpec = {
	seed: SEED,
	table: 4242,
	seats: CHARACTER_IDS,
	rulesVersion: RULES,
	hands: 40,
	traces: true
};
const exampleHands = runTable(exampleSpec);
for (const hand of exampleHands)
	for (const d of hand.decisions) {
		const id = CHARACTER_IDS[d.seat];
		if (examples[id] || d.blind || !d.move.trace?.factors || d.move.trace.factors.length < 4)
			continue;
		const again = reproduceHand(exampleSpec, hand.h).decisions[d.i];
		examples[id] = {
			hand: hand.h,
			step: d.i,
			reproduced: JSON.stringify(again.move) === JSON.stringify(d.move),
			text: explainDecision({
				name: castMember(id).name,
				move: d.move,
				decision: { ...d, rounds: d.rounds.toFixed(1) }
			})
		};
	}
// One blind decision for Rohit, the blind character.
for (const hand of exampleHands)
	for (const d of hand.decisions)
		if (
			!examples['rohit-sharma/blind'] &&
			CHARACTER_IDS[d.seat] === 'rohit-sharma' &&
			d.blind &&
			d.rounds >= 1.5 &&
			d.move.trace?.factors
		)
			examples['rohit-sharma/blind'] = {
				hand: hand.h,
				step: d.i,
				text: explainDecision({
					name: 'Rohit',
					move: d.move,
					decision: { ...d, rounds: d.rounds.toFixed(1) }
				})
			};

/* --------------------------------------- write --------------------------------------- */

mkdirSync(new URL('../../.sim/', import.meta.url), { recursive: true });
const raw = {
	seed: SEED,
	hands: HANDS,
	sim: SIM_VERSION,
	fp: FINGERPRINT_VERSION,
	wallMs,
	totalHands,
	totalDecisions,
	referenceFp,
	mixedFp,
	soloFp,
	ident,
	timingRows,
	benchLegacy,
	benchCharacters
};
writeFileSync(
	new URL(`../../.sim/phase1-${SEED}.json`, import.meta.url),
	JSON.stringify(raw, null, 1)
);

const label = (m) => castMember(m)?.name ?? m;
const f = (v, d = 2) =>
	v === null || v === undefined ? 'n/a' : typeof v === 'string' ? 'unavailable' : v.toFixed(d);
const p = (v) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 100)}%`);
const COLS = [
	['hands', (m) => m.hands.toLocaleString()],
	['decisions', (m) => m.decisions.toLocaleString()],
	['boots/100', (m) => `${m.bootsPer100.toFixed(0)} ± ${m.bootsPer100Ci95.toFixed(0)}`],
	['blind rounds', (m) => f(m.blindRounds)],
	['blind raise', (m) => p(m.blindRaiseRate)],
	['chaal', (m) => p(m.chaalRate)],
	['raise', (m) => p(m.raiseRate)],
	['pack', (m) => p(m.packRate)],
	['see', (m) => p(m.seeRate)],
	['show (when legal)', (m) => p(m.showRate)],
	['aggression (seen R/C)', (m) => f(m.aggression)],
	['fold to raise', (m) => p(m.foldToRaise)],
	['stay after seeing', (m) => p(m.stayAfterSeeing)],
	['showdown', (m) => p(m.showdownRate)],
	['won at showdown', (m) => p(m.wonAtShowdown)],
	['entropy (bits)', (m) => (m.entropy === null ? 'unavailable' : m.entropy.toFixed(2))]
];
function table(fps, order) {
	const ids = order.filter((m) => fps[m]);
	const head = `| metric | ${ids.map(label).join(' | ')} |\n|---|${ids.map(() => '---:').join('|')}|`;
	return [
		head,
		...COLS.map(([name, fn]) => `| ${name} | ${ids.map((m) => fn(fps[m])).join(' | ')} |`)
	].join('\n');
}
function confusion(r) {
	if (!r.confusion) return `Not enough hands per session for ${r.k}-hand windows.`;
	const head = `| actual \\ predicted | ${CHARACTER_IDS.map(label).join(' | ')} | correct |\n|---|${CHARACTER_IDS.map(() => '---:').join('|')}|---:|`;
	const rows = CHARACTER_IDS.map(
		(a) =>
			`| ${label(a)} | ${CHARACTER_IDS.map((b) => (a === b ? `**${r.confusion[a][b]}**` : r.confusion[a][b])).join(' | ')} | ${p(r.perClass[a])} |`
	);
	return [head, ...rows].join('\n');
}

const md = `# Bot Brain Phase 1 report

Generated by \`node scripts/sim/phase1-report.mjs --seed ${SEED} --hands ${HANDS} --scale ${SCALE}\` on ${new Date().toISOString().slice(0, 10)}.
Engine: the real \`server/engine.mjs\`. Simulator ${SIM_VERSION}, fingerprint ${FINGERPRINT_VERSION}, variant \`${RULES}\`, boot 10, stack 1,000 (100 boots), automatic rebuys.
Character styles: ${Object.values(CHARACTER_STYLES)
	.map((s) => `\`${s._id}\` (${s.configHash})`)
	.join(', ')}. Policy \`tp-character@1\`. Nothing was tuned or trained for this report.

**Scale:** ${totalHands.toLocaleString()} hands, ${totalDecisions.toLocaleString()} decisions, ${(wallMs / 1000).toFixed(1)} s wall on ${threads} worker threads.

## Three separate axes

| Axis | Phase 1 measure | Status |
|---|---|---|
| Playing competence | boots/100 against a fixed field of reference bots (run C) | measured |
| Character identity | identifiability at 10/25/50/100 hands, confusion matrices, centroid distances | measured |
| Human believability | needs people watching or playing (and phase 2 mood and memory) | **unavailable**: no number is given rather than a proxy |

## 1. Reference fingerprints (run A: reference bots only, random 5-seat tables)

${table(referenceFp, REFERENCE_IDS)}

## 2. Character fingerprints (run B: 2 to 5 characters per table, rest references)

${table(mixedFp, CHARACTER_IDS)}

### Competence against a fixed field (run C: one character + four reference bots per table)

| | ${CHARACTER_IDS.map(label).join(' | ')} |
|---|${CHARACTER_IDS.map(() => '---:').join('|')}|
| boots/100 vs references | ${CHARACTER_IDS.map((c) => `${soloFp[c].bootsPer100.toFixed(0)} ± ${soloFp[c].bootsPer100Ci95.toFixed(0)}`).join(' | ')} |
| hands | ${CHARACTER_IDS.map((c) => soloFp[c].hands.toLocaleString()).join(' | ')} |

For scale, in run A: ${REFERENCE_IDS.map((m) => `${m} ${referenceFp[m].bootsPer100.toFixed(0)}`).join(', ')} boots/100.

### Not measurable in phase 1

Tilt index, after-win delta, revenge index and adaptation are **unavailable**: phase 1 bots have no mood, relationships or opponent models, so these would only measure noise.

## 3. Identifiability (run B, public behaviour only)

Nearest-centroid classifier on ${FEATURES.length} standardized public features (${FEATURES.join(', ')}). Trained on windows from even-numbered tables, tested on windows from odd-numbered tables, so a test window never shares a table with training data. Chance is 20%.

| hands watched | test windows | accuracy |
|---:|---:|---:|
${ident.map((r) => `| ${r.k} | ${r.n.toLocaleString()} | **${p(r.accuracy)}** |`).join('\n')}

${ident.map((r) => `### Confusion matrix at ${r.k} hands\n\n${confusion(r)}`).join('\n\n')}

### Between-character distance and within-character variation (50 hands)

Distances are in standardized feature units. Within-character spread is the mean distance of one 50-hand window from that character's own centroid: large means a character's sessions vary; it is reported, not optimized.

| pair | centroid distance |
|---|---:|
${ident[2].betweenDistance.map((d) => `| ${label(d.a)} : ${label(d.b)} | ${d.d.toFixed(2)} |`).join('\n')}

| character | within spread |
|---|---:|
${CHARACTER_IDS.map((c) => `| ${label(c)} | ${f(ident[2].withinSpread?.[c])} |`).join('\n')}

## 4. Performance

| | hands/s (1 thread) | ms per decision incl. engine |
|---|---:|---:|
| 5 legacy bots | ${benchLegacy.handsPerSec} | ${benchLegacy.msPerDecision.toFixed(3)} |
| 5 character bots | ${benchCharacters.handsPerSec} | ${benchCharacters.msPerDecision.toFixed(3)} |

Decision time alone (sampled, under ${threads}-thread load):

| member | p50 ms | p99 ms |
|---|---:|---:|
${Object.entries(timingRows)
	.sort()
	.map(([m, t]) => `| ${label(m)} | ${t.p50.toFixed(3)} | ${t.p99.toFixed(3)} |`)
	.join('\n')}

## 5. Example decision traces

${Object.values(examples)
	.map(
		(e) =>
			`Table 4242, hand ${e.hand}, step ${e.step}${e.reproduced === undefined ? '' : `, reproduced from seed: ${e.reproduced ? 'yes' : 'NO'}`}\n\n\`\`\`\n${e.text}\n\`\`\``
	)
	.join('\n\n')}

## 6. Decision graph (generated from \`CHARACTER_GRAPH\`)

\`\`\`mermaid
${toMermaid(CHARACTER_GRAPH)}
\`\`\`

Styles published: ${Object.keys(STYLES).length}.
`;
mkdirSync(new URL('../../docs/bots/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../docs/bots/PHASE1_REPORT.md', import.meta.url), md);
console.log(
	`Phase 1 report: ${totalHands} hands in ${(wallMs / 1000).toFixed(1)} s. Wrote docs/bots/PHASE1_REPORT.md and .sim/phase1-${SEED}.json`
);
console.log(ident.map((r) => `k=${r.k}: ${Math.round(r.accuracy * 100)}%`).join('  '));
