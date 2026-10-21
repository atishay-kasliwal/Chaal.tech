/**
 * Quick tuning check for the character styles (BOT_BRAIN.md §28): a small slice of the Phase 2
 * study in a couple of minutes. Measurement only; the full study is scripts/sim/phase2-report.mjs.
 *
 *   node scripts/sim/tune.mjs [--seed 21] [--scale 1]
 *
 * Prints identifiability, fingerprints, decision quality, event windows, session spread and the
 * adaptation index (late behaviour against one opponent type, v3 minus v2).
 */
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';
import { runPool } from './pool.mjs';
import { REFERENCE_IDS, CHARACTER_IDS, versioned } from '../../server/sim/population.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';
import { sum, metrics, FEATURES, featureVector } from '../../server/sim/fingerprint.mjs';
import { identifiability } from '../../server/sim/identify.mjs';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const SEED = arg('seed', 21);
const SCALE = arg('scale', 1);
const HANDS = 200;
const TYPES = ['baseline-rock', 'baseline-station', 'baseline-aggressive'];
const at = (m, v) => (CHARACTER_IDS.includes(m) ? `${m}@${v}` : m);
const cls = { 2: versioned(2), 3: versioned(3) };

const specs = [];
const add = (run, table, seats, extra = {}) =>
	specs.push({ run, table, seats, seed: SEED, hands: HANDS, rulesVersion: 'classic-1', ...extra });
for (let t = 0; t < 120 * SCALE; t++) {
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
const SESSIONS = Math.round(10 * SCALE);
for (const c of CHARACTER_IDS)
	for (const v of [2, 3]) {
		const field = shuffle(REFERENCE_IDS, stream(SEED, 'session-field', c).random).slice(0, 4);
		for (let i = 0; i < SESSIONS; i++) {
			add(`same:${c}@${v}`, 9000, [`${c}@${v}`, ...field], { decisionSeed: SEED * 1000 + i });
			const other = shuffle(REFERENCE_IDS, stream(SEED, 'session-other', c, i).random).slice(0, 4);
			add(`varied:${c}@${v}`, 9100 + i, [`${c}@${v}`, ...other]);
		}
	}
for (const type of TYPES)
	for (const v of [2, 3])
		for (const c of CHARACTER_IDS)
			for (let t = 0; t < 12 * SCALE; t++)
				add(`adapt:${type}:${c}@${v}`, 9500 + t, [`${c}@${v}`, type, type, type, type]);

const started = performance.now();
const results = await runPool(specs, Math.max(1, availableParallelism() - 1));
const seconds = (performance.now() - started) / 1000;

const p = (x) => (x == null ? '  n/a' : `${Math.round(x * 100)}%`.padStart(5));
const f2 = (x) => (x == null ? ' n/a' : x.toFixed(2).padStart(5));
const short = (m) =>
	m.replace('-sharma', '').replace('-kohli', '').replace('-raina', '').replace('ms-', '');
const row = (label, cells) => console.log(`${label.padEnd(26)}${cells.join(' ')}`);

// Mixed tables: identifiability, fingerprints, quality, event windows.
const sessions = {};
const byMember = {};
for (const v of [2, 3])
	for (const r of results.filter((x) => x.run === `mixed@${v}`))
		for (const s of r.seats) {
			(sessions[v] ??= []).push({ table: r.table, member: s.member, hands: s.hands });
			(byMember[s.member] ??= []).push(s.hands);
		}
console.log(`\n${specs.length} tables in ${seconds.toFixed(0)} s`);
for (const v of [2, 3]) {
	const rs = [10, 25, 50, 100].map((k) => identifiability(sessions[v], k, cls[v]));
	console.log(
		`identify v${v}: ${rs.map((r) => `${r.k}=${p(r.accuracy)}`).join(' ')}   @50: ${cls[v].map((c) => `${short(c)} ${p(rs[2].perClass[c])}`).join(' ')}`
	);
}
{
	const r = identifiability(sessions[3], 50, cls[3]);
	for (const a of cls[3])
		console.log(
			`  ${short(a).padEnd(9)} → ${cls[3].map((b) => `${short(b)} ${r.confusion[a][b]}`).join('  ')}`
		);
}
const fp = Object.fromEntries(
	Object.entries(byMember).map(([m, hs]) => [m, metrics(sum(hs.flat()))])
);
const both = CHARACTER_IDS.flatMap((c) => [`${c}@2`, `${c}@3`]);
console.log('');
row(
	'',
	both.map((m) => short(m).padStart(9))
);
for (const [label, key, fmt] of [
	['blind rounds', 'blindRounds', f2],
	['blind raise', 'blindRaiseRate', p],
	['aggression (seen R/C)', 'aggression', f2],
	['raise after seeing', 'seenRaiseRate', p],
	['stay after seeing', 'stayAfterSeeing', p],
	['fold to raise', 'foldToRaise', p],
	['show when legal', 'showRate', p],
	['chaal', 'chaalRate', p],
	['very weak continued', 'weakContinueRate', p],
	['strong packed', 'strongPackRate', p],
	['monster not raised', 'monsterNoRaiseRate', p],
	['big evidence override', 'bigOverrideRate', p],
	['mood changed best', 'stateOverrideRate', p],
	['memory changed best', 'memoryOverrideRate', p],
	['boots/100', 'bootsPer100', (x) => x.toFixed(0).padStart(5)]
])
	row(
		label,
		both.map((m) => fmt(fp[m][key]).padStart(9))
	);

// Event windows: the 3 hands after a big loss / win.
console.log(
	'\nafter events (aggression base/loss/win · stay base/loss · raise-after-seeing base/loss)'
);
for (const m of both) {
	const o = { base: [], loss: [], win: [] };
	for (const hands of byMember[m])
		hands.forEach((h, i) => {
			const prev = hands.slice(Math.max(0, i - 3), i);
			o[
				prev.some((x) => x.net <= -20) ? 'loss' : prev.some((x) => x.net >= 20) ? 'win' : 'base'
			].push(h);
		});
	const [b, l, w] = ['base', 'loss', 'win'].map((k) => metrics(sum(o[k])));
	row(short(m), [
		`${f2(b.aggression)}/${f2(l.aggression)}/${f2(w.aggression)}`,
		`  ${p(b.stayAfterSeeing)}/${p(l.stayAfterSeeing)}`,
		`  ${p(b.seenRaiseRate)}/${p(l.seenRaiseRate)}`
	]);
}

// Session spread: whole-session fingerprints standardized over every session here.
const rows = results
	.filter((x) => x.run.startsWith('same:') || x.run.startsWith('varied:'))
	.map((r) => {
		const [kind, member] = r.run.split(':');
		return { kind, member, x: featureVector(sum(r.seats[0].hands)) };
	});
const n = FEATURES.length;
const mean = Array.from(
	{ length: n },
	(_, i) => rows.reduce((s, r) => s + (r.x[i] ?? 0), 0) / rows.length
);
const sd = Array.from(
	{ length: n },
	(_, i) =>
		Math.sqrt(rows.reduce((s, r) => s + ((r.x[i] ?? mean[i]) - mean[i]) ** 2, 0) / rows.length) || 1
);
const z = (x) => x.map((v, i) => ((v ?? mean[i]) - mean[i]) / sd[i]);
const spread = (kind, member) => {
	const xs = rows.filter((r) => r.kind === kind && r.member === member).map((r) => z(r.x));
	const c = xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0) / xs.length);
	return (
		xs.reduce((s, x) => s + Math.sqrt(x.reduce((a, v, i) => a + (v - c[i]) ** 2, 0)), 0) / xs.length
	);
};
console.log('\nsession spread (same table v2→v3 · varied v2→v3)');
for (const c of CHARACTER_IDS)
	row(short(c), [
		`${f2(spread('same', `${c}@2`))} → ${f2(spread('same', `${c}@3`))}`,
		`   ${f2(spread('varied', `${c}@2`))} → ${f2(spread('varied', `${c}@3`))}`
	]);

// Adaptation: hands 41 to 200 against four copies of one type; v3 minus v2 removes the part any
// stateless policy shows just from the opponents' play.
const late = {};
for (const r of results.filter((x) => x.run.startsWith('adapt:'))) {
	const [, type, member] = r.run.split(':');
	(late[`${type}|${member}`] ??= []).push(...r.seats[0].hands.slice(40));
}
const lm = (type, m) => metrics(sum(late[`${type}|${m}`]));
console.log(
	'\nadaptation, hands 41-200: thin raise · value raise · continue facing raise · boots/100 (v2 → v3)'
);
for (const c of CHARACTER_IDS) {
	for (const type of TYPES) {
		const [a, b] = [lm(type, `${c}@2`), lm(type, `${c}@3`)];
		row(`${short(c)} vs ${type.slice(9)}`, [
			`${p(a.thinRaise)} → ${p(b.thinRaise)}`,
			`  ${p(a.valueRaise)} → ${p(b.valueRaise)}`,
			`  ${p(1 - (a.foldToRaise ?? 0))} → ${p(1 - (b.foldToRaise ?? 0))}`,
			`  ${a.bootsPer100.toFixed(0).padStart(5)} → ${b.bootsPer100.toFixed(0).padStart(5)}`
		]);
	}
	// Exploit index: bluff more into folders than into callers, call raisers who bluff wider.
	const idx = (v) => {
		const [rock, station, aggr] = TYPES.map((t) => lm(t, `${c}@${v}`));
		return {
			bluff: (rock.thinRaise ?? 0) - (station.thinRaise ?? 0),
			value: (station.valueRaise ?? 0) - (rock.valueRaise ?? 0),
			call: (rock.foldToRaise ?? 0) - (aggr.foldToRaise ?? 0)
		};
	};
	const [i2, i3] = [idx(2), idx(3)];
	row(`  ${short(c)} exploit v3-v2`, [
		`bluff ${p(i3.bluff - i2.bluff)}`,
		` value ${p(i3.value - i2.value)}`,
		` call ${p(i3.call - i2.call)}`
	]);
}
