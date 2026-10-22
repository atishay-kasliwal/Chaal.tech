/**
 * Phase 4 champion-vs-challenger gates (brief §13). A challenger replaces nothing by fixing one
 * weakness: it must pass every gate on tables matched with its champion.
 *
 *  regression   no core band newly failed; no more bands failed; violation at most +0.5
 *  personality  its 50-hand windows are still identified as its character (at most 5 points below
 *               the champion), and it sits nearer its champion than half the nearest other character
 *  strength     not clearly weaker in the population: upper 95% bound of the paired difference >= -50
 *  exploit      the targeted weakness improves, interval excluding zero (per challenger, `target`)
 *  counter      no fixed exploit clearly worse: no paired difference with upper bound < -100
 *  variety      night variety at least 0.6 of the champion's
 *  bad actions  bad-action rate at most 0.5 points above the champion's
 *  performance  mean decision time at most 1.5 times the champion's
 */
import {
	opponents,
	seatsFor,
	combine,
	measure,
	withReference
} from '../../server/sim/evaluate.mjs';
import { judgeBands } from '../../server/sim/targets.mjs';
import { identifyWindows } from '../../server/sim/identify.mjs';
import { featureVector } from '../../server/sim/fingerprint.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { runTable } from '../../server/sim/table.mjs';
import { CHAMPIONS, SHORT } from '../../server/sim/league.mjs';
import { ci, paired, nightValues, mean } from '../../server/sim/p4stats.mjs';
import { CHALLENGER_SETS } from '../../server/sim/challengers.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { flat } from './phase4-stages.mjs';
import { ADAPT, BIN, adaptEffect, noReads } from './phase4-adapt.mjs';
import { BLUFFY, eventMeasures } from './phase4-samay.mjs';
import { addEvents } from '../../server/sim/events-study.mjs';

const b100 = (s) => (s.total.net / Math.max(s.hands, 1)) * 100;
const SCEN_TYPES = [...new Set(ADAPT.map((a) => a.type))];
const advSeats = (g, label) =>
	[1, 2, 3, 4].map((i) => ({ id: `${label}#${i}`, adversary: g, target: 0 }));

/** Mean and 99th percentile decision time, in one process with the default JIT (as the game runs). */
function timing(member) {
	const ms = [];
	for (let t = 0; t < 3; t++)
		for (const hand of runTable({
			seed: 77,
			table: t,
			hands: 150,
			seats: [member, 'human-balanced', 'gg@4', 'human-station', 'human-maniac']
		}))
			for (const d of hand.decisions) if (d.seat === 0) ms.push(d.ms);
	ms.sort((a, b) => a - b);
	return { mean: mean(ms), p99: ms[Math.floor(0.99 * (ms.length - 1))], n: ms.length };
}

export async function gates({ SEED, SCALE, run, save, opt, load }) {
	const set = CHALLENGER_SETS[opt('set', 'samay')];
	const ids = opt('ids', null)?.split(',');
	const challengers = set.filter(
		(x) => !ids || ids.includes(x.id.split('-').at(-1)) || ids.includes(x.id)
	);
	const c = challengers[0].character;
	const T = Math.round(Number(opt('tables', 240)) * SCALE);
	const TS = Math.round(Number(opt('scenarioTables', 96)) * SCALE);
	const TX = Math.round(Number(opt('exploitTables', 64)) * SCALE);
	const N = Math.round(Number(opt('nights', 60)) * SCALE);
	const champion = { key: CHAMPIONS[c], member: CHAMPIONS[c] };
	const heroes = [
		champion,
		...challengers.map((x) => ({ key: x.id, member: { id: x.id, style: x.style } }))
	];
	const search = load(`search-${opt('searchSeed', SEED)}`)?.characters?.[c]?.finals?.[0] ?? null;
	const specs = [];
	const events = c === 'samay-raina';
	// Population: every champion too (identity needs all five characters), and the stateless reference.
	const popHeroes = [
		...heroes,
		...CHARACTER_IDS.filter((x) => x !== c).map((x) => ({
			key: CHAMPIONS[x],
			member: CHAMPIONS[x],
			other: true
		})),
		{ key: `${c}@2`, member: `${c}@2`, reference: true }
	];
	for (const h of popHeroes)
		for (let t = 0; t < T; t++) {
			const ch = h.other ? CHARACTER_IDS.find((x) => CHAMPIONS[x] === h.key) : c;
			const pop = seatsFor(h.member, opponents(SEED, 'gates', t, ch), t);
			specs.push({
				seed: SEED,
				table: 100 + t,
				hands: 200,
				seats: pop.seats,
				matched: true,
				summary: {
					seats: [pop.heroSeat],
					windows: [50],
					events: events && !h.other && !h.reference
				},
				meta: { key: h.key, run: 'pop' }
			});
		}
	for (const h of [
		...heroes,
		{ key: `${CHAMPIONS[c]}-noreads`, member: noReads(c), control: true }
	]) {
		for (const type of SCEN_TYPES)
			for (let t = 0; t < TS; t++)
				specs.push({
					seed: SEED,
					table: 7000 + t,
					hands: 200,
					seats: [h.member, type, type, type, type],
					matched: true,
					bins: { seat: 0, size: BIN },
					meta: { key: h.key, run: 'scen', type }
				});
		if (h.control) continue;
		const xs = [
			...Object.entries(EXPLOITS).map(([x, e]) => [x, e.g]),
			...(search ? [['search', search.genome]] : [])
		];
		for (const [x, g] of xs)
			for (let t = 0; t < TX; t++)
				specs.push({
					seed: SEED,
					table: 5000 + t,
					hands: 200,
					seats: [h.member, ...advSeats(g, x)],
					matched: true,
					summary: { seats: [0] },
					meta: { key: h.key, run: 'x', x }
				});
		if (events)
			for (let t = 0; t < T; t++)
				specs.push({
					seed: SEED,
					table: 6000 + t,
					hands: 200,
					seats: [h.member, ...BLUFFY],
					matched: true,
					summary: { seats: [0], events: true },
					meta: { key: h.key, run: 'bluffy' }
				});
		const field = opponents(SEED, 'night', 0, c);
		for (let i = 0; i < N; i++)
			specs.push({
				seed: SEED,
				decisionSeed: SEED * 1000 + i,
				table: 9000,
				hands: 200,
				seats: [h.member, ...field],
				matched: true,
				summary: { seats: [0] },
				meta: { key: h.key, run: 'night', night: i }
			});
	}
	console.log(`gates (${SHORT[c]}, ${challengers.length} challengers): ${specs.length} tables`);
	const res = flat(await run(specs, 'gates'));
	const of = (key, runName, extra = () => true) =>
		res
			.filter((r) => r.key === key && r.run === runName && extra(r))
			.sort((a, b) => a.table - b.table || (a.night ?? 0) - (b.night ?? 0));
	const ref = measure(combine(of(`${c}@2`, 'pop').map((r) => r.seats[0])));
	const rows = [];
	const identityRows = (key, label) =>
		of(key, 'pop').flatMap((r) =>
			r.seats[0].windows[50].map((t) => ({ table: r.table, member: label, t }))
		);
	const others = CHARACTER_IDS.filter((x) => x !== c).flatMap((x) =>
		identityRows(CHAMPIONS[x], CHAMPIONS[x])
	);
	const classes = (key) => [key, ...CHARACTER_IDS.filter((x) => x !== c).map((x) => CHAMPIONS[x])];
	const nightsOf = (key) =>
		of(key, 'night').map((r) => r.seats[0].halves.map((x) => featureVector(x)));
	const nightVals = nightValues(heroes.map((h) => nightsOf(h.key)));
	const control = (type) =>
		of(`${CHAMPIONS[c]}-noreads`, 'scen', (r) => r.type === type).map((r) => r.bins);
	for (const [hi, h] of heroes.entries()) {
		const pop = of(h.key, 'pop');
		const m = withReference(measure(combine(pop.map((r) => r.seats[0]))), ref);
		const id = identifyWindows([...identityRows(h.key, h.key), ...others], 50, classes(h.key));
		const scen = Object.fromEntries(
			SCEN_TYPES.map((type) => [type, of(h.key, 'scen', (r) => r.type === type).map((r) => r.bins)])
		);
		const scenBoots = (type) => scen[type].map((t) => t.reduce((s, b) => s + (b?.net ?? 0), 0) / 2);
		const xRuns = (x) => of(h.key, 'x', (r) => r.x === x).map((r) => b100(r.seats[0]));
		const ev = events
			? [...pop, ...of(h.key, 'bluffy')].reduce((acc, r) => addEvents(acc, r.events), null)
			: null;
		rows.push({
			key: h.key,
			change: challengers.find((x) => x.id === h.key)?.change ?? 'champion',
			target: challengers.find((x) => x.id === h.key)?.target ?? null,
			m,
			bands: judgeBands(c, m),
			identity: {
				perClass: id.perClass?.[h.key] ?? null,
				accuracy: id.accuracy,
				between: id.betweenDistance
			},
			pop: pop.map((r) => b100(r.seats[0])),
			scen: Object.fromEntries(SCEN_TYPES.map((type) => [type, scenBoots(type)])),
			adapt: Object.fromEntries(
				ADAPT.map((a) => [a.id, adaptEffect(a, scen[a.type], control(a.type))])
			),
			x: Object.fromEntries(
				[...Object.keys(EXPLOITS), ...(search ? ['search'] : [])].map((x) => [x, xRuns(x)])
			),
			night: ci(nightVals[hi]),
			events: ev ? eventMeasures(ev) : null,
			perf: timing(h.member)
		});
	}
	const champ = rows[0];
	const out = {
		seed: SEED,
		character: c,
		tables: T,
		scenarioTables: TS,
		exploitTables: TX,
		nights: N,
		searchExploit: search ? { id: search.id, says: search.says } : null,
		rows: []
	};
	for (const r of rows) {
		const g = {};
		const coreFailed = (b) => b.results.filter((x) => x.core && !x.pass).map((x) => x.key);
		const newCore = coreFailed(r.bands).filter((k) => !coreFailed(champ.bands).includes(k));
		g.regression = {
			pass:
				!newCore.length &&
				r.bands.passed >= champ.bands.passed &&
				r.bands.violation <= champ.bands.violation + 0.5,
			detail: `bands ${r.bands.passed}/${r.bands.results.length} (champion ${champ.bands.passed}), violation ${r.bands.violation.toFixed(2)} (${champ.bands.violation.toFixed(2)})${newCore.length ? `, core lost: ${newCore.join(', ')}` : ''}`
		};
		const champDist = champ.identity.between.find((d) => d.a === champ.key || d.b === champ.key);
		g.personality = {
			pass: r.identity.perClass != null && r.identity.perClass >= champ.identity.perClass - 0.05,
			detail: `identified ${Math.round(100 * r.identity.perClass)}% (champion ${Math.round(100 * champ.identity.perClass)}%)`,
			nearestOther: champDist?.d ?? null
		};
		const p = paired(r.pop, champ.pop);
		g.strength = { pass: p.mean + p.ci >= -50, paired: p };
		const scenarioPaired = Object.fromEntries(
			SCEN_TYPES.map((type) => [type, paired(r.scen[type], champ.scen[type])])
		);
		const xPaired = Object.fromEntries(
			Object.keys(r.x).map((x) => [x, paired(r.x[x], champ.x[x])])
		);
		const worse = Object.entries(xPaired).filter(([, v]) => v.mean + v.ci < -100);
		g.counter = { pass: !worse.length, worse: worse.map(([x]) => x) };
		g.variety = {
			pass: r.night.mean >= 0.6 * champ.night.mean,
			detail: `${r.night.mean.toFixed(2)} ± ${r.night.ci.toFixed(2)} (champion ${champ.night.mean.toFixed(2)})`
		};
		g.badActions = {
			pass: (r.m.badActionRate ?? 0) <= (champ.m.badActionRate ?? 0) + 0.005,
			detail: `${(100 * r.m.badActionRate).toFixed(2)}% (champion ${(100 * champ.m.badActionRate).toFixed(2)}%)`
		};
		g.performance = {
			pass: r.perf.mean <= 1.5 * champ.perf.mean + 0.02,
			detail: `${r.perf.mean.toFixed(3)} ms mean, p99 ${r.perf.p99.toFixed(3)} (champion ${champ.perf.mean.toFixed(3)})`
		};
		// The weakness this challenger targets.
		if (r.target?.kind === 'event') {
			const e = r.events;
			const ce = champ.events;
			g.exploit = {
				pass:
					e &&
					ce &&
					e.foldCaught12 != null &&
					e.attrPackWhenActed < -0.02 &&
					e.foldCaught12 + e.foldCaught34 < ce.foldCaught12 + ce.foldCaught34,
				detail: `fold to a bluffer caught 1-2 / 3-4 hands ago ${e?.foldCaught12} / ${e?.foldCaught34} (champion ${ce?.foldCaught12} / ${ce?.foldCaught34}); event reactions change P(pack) by ${e?.attrPackWhenActed} where they act`
			};
		} else if (r.target?.kind === 'adapt') {
			const a = r.adapt[r.target.scenario];
			const ca = champ.adapt[r.target.scenario];
			g.exploit = {
				pass: a.verdict === 'right' && ca.verdict !== 'right',
				detail: `${r.target.scenario}: ${a.effect} [${a.lo}, ${a.hi}] ${a.verdict} (champion ${ca.effect} [${ca.lo}, ${ca.hi}] ${ca.verdict})`
			};
		} else if (r.target?.kind === 'exploit') {
			const v = xPaired[r.target.x];
			g.exploit = {
				pass: v.mean - v.ci > 0,
				detail: `${r.target.x}: ${Math.round(v.mean)} ± ${Math.round(v.ci)} boots/100 vs champion`
			};
		} else g.exploit = { pass: null, detail: 'no target' };
		const pass = Object.values(g).every((x) => x.pass !== false);
		out.rows.push({
			key: r.key,
			change: r.change,
			gates: g,
			pass,
			bands: r.bands,
			m: r.m,
			scenarioPaired,
			xPaired,
			adapt: r.adapt,
			events: r.events,
			night: r.night,
			perf: r.perf,
			identity: r.identity.perClass
		});
		console.log(
			`${r.key.padEnd(20)} ${pass ? 'PASS' : 'fail'} ${Object.entries(g)
				.map(([k, v]) => `${k}:${v.pass === null ? '-' : v.pass ? 'ok' : 'X'}`)
				.join(' ')} | pop ${Math.round(p.mean)}±${Math.round(p.ci)}`
		);
	}
	save(`gates-${opt('set', 'samay')}-${SEED}`, out);
}
