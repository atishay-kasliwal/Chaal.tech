/** Phase 4 adaptation suite (brief §7, §8): every champion against one opponent type at a time. */
import { metrics } from '../../server/sim/fingerprint.mjs';
import { addCounters } from '../../server/sim/summary.mjs';
import { PHASE4_CHAMPIONS } from '../../server/bots/dna-styles.mjs';
import { CHAMPIONS, leagueMember } from '../../server/sim/league.mjs';
import { bootstrap, ci, mean } from '../../server/sim/p4stats.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { flat } from './phase4-stages.mjs';

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/** A champion with its opponent reads switched off (adaptability 0): the no-learning control. */
export function noReads(c) {
	const s = PHASE4_CHAMPIONS[c];
	return {
		id: `${s._id}-noreads`,
		style: {
			...s,
			_id: `${s._id}-noreads`,
			status: 'control',
			tendencies: { ...s.tendencies, dna: { ...s.tendencies.dna, adaptability: 0 } }
		}
	};
}

export const BIN = 20;
/**
 * The adaptation scenarios: one opponent type in all four other seats; what a player who adapts
 * should do, as a metric that should move in a direction between two windows of 20-hand bins.
 */
export const ADAPT = Object.freeze([
	{
		id: 'rock',
		type: 'human-very-conservative',
		metric: 'thinRaise',
		sign: 1,
		early: [0, 1],
		late: [7, 8, 9],
		belief: 'foldToRaise',
		expect: 'discovers that bluffs work: bluffs more'
	},
	{
		id: 'station',
		type: 'human-station',
		metric: 'thinRaise',
		sign: -1,
		early: [0, 1],
		late: [7, 8, 9],
		belief: 'foldToRaise',
		expect: 'stops bluffing a caller'
	},
	{
		id: 'station-value',
		type: 'human-station',
		metric: 'valueRaise',
		sign: 1,
		early: [0, 1],
		late: [7, 8, 9],
		belief: 'foldToRaise',
		expect: 'value-raises a caller more'
	},
	{
		id: 'maniac',
		type: 'human-maniac',
		metric: 'seenFoldToRaise',
		sign: -1,
		early: [0, 1],
		late: [7, 8, 9],
		belief: 'aggression',
		expect: "a maniac's raise means less: folds to it less"
	},
	{
		id: 'value',
		type: 'human-value',
		metric: 'seenFoldToRaise',
		sign: 1,
		early: [0, 1],
		late: [7, 8, 9],
		belief: 'bluffShown',
		expect: "a value player's raise means more: folds to it more"
	},
	{
		id: 'switch-a',
		type: 'human-switch',
		metric: 'seenFoldToRaise',
		sign: -1,
		early: [5],
		late: [8, 9],
		belief: 'aggression',
		expect: 'tight, then a maniac from hand 100: folds less once the switch is noticed'
	},
	{
		id: 'switch-b',
		type: 'human-switch-reverse',
		metric: 'seenFoldToRaise',
		sign: 1,
		early: [5],
		late: [8, 9],
		belief: 'aggression',
		expect: 'a maniac, then tight value from hand 100: drops the stale read, folds more'
	},
	{
		id: 'deceptive',
		type: 'human-deceptive',
		metric: 'seenFoldToRaise',
		sign: 1,
		early: [3],
		late: [7, 8, 9],
		belief: 'bluffShown',
		expect: 'bluffer, then value from hand 50: respects raises again'
	},
	{
		id: 'blind-heavy',
		type: 'human-blind-heavy',
		metric: 'seenFoldToRaise',
		sign: -1,
		early: [0, 1],
		late: [7, 8, 9],
		belief: 'aggression',
		expect: 'blind raises carry no information about cards: folds to them less once learned'
	}
]);
const SCEN_TYPES = [...new Set(ADAPT.map((a) => a.type))];

const curveOf = (tables) => {
	const n = Math.max(...tables.map((t) => t.length));
	return Array.from({ length: n }, (_, b) =>
		tables.reduce((acc, t) => (t[b] ? addCounters(acc, t[b]) : acc), null)
	);
};
const windowMetric = (curve, bins, key) => {
	const t = bins.reduce((acc, b) => addCounters(acc, curve[b]), null);
	return t ? metrics(t)[key] : null;
};
const readsN = (bin, belief) =>
	bin?.reads?.[`${belief}C`] ? bin.reads[`${belief}N`] / bin.reads[`${belief}C`] : null;
/** Reads are summed per bin (addCounters skips nested objects), so merge them across tables. */
const mergeReads = (tables) =>
	Array.from({ length: Math.max(...tables.map((t) => t.length)) }, (_, b) => {
		const r = {};
		for (const t of tables)
			for (const [k, v] of Object.entries(t[b]?.reads ?? {})) r[k] = (r[k] ?? 0) + v;
		return { reads: r };
	});

/** Learning effect and speed of one hero in one scenario, beside its no-reads control (paired tables). */
export function adaptEffect(a, hero, control) {
	const delta = (tables) => {
		const curve = curveOf(tables);
		const e = windowMetric(curve, a.early, a.metric);
		const l = windowMetric(curve, a.late, a.metric);
		return e == null || l == null ? 0 : l - e;
	};
	const idx = hero.map((_, i) => i);
	const stat = (ids) =>
		delta(ids.map((i) => hero[i])) - (control ? delta(ids.map((i) => control[i])) : 0);
	const effect = stat(idx);
	const b = bootstrap(idx, stat, { reps: 300 });
	const hc = curveOf(hero);
	const cc = control ? curveOf(control) : null;
	const val = (bin) => (bin ? metrics(bin)[a.metric] : null);
	const diff = hc.map((bin, i) => {
		const h = val(bin);
		const c = cc ? val(cc[i]) : 0;
		return h == null || c == null ? null : h - c;
	});
	// Speed: hands after the start window until the hero-minus-control difference has moved half way
	// from its start to its final level in the expected direction, and the observations its reads
	// rested on at that point.
	const start = mean(a.early.map((x) => diff[x]).filter((x) => x != null));
	const end = mean(a.late.map((x) => diff[x]).filter((x) => x != null));
	let half = null;
	if ((end - start) * a.sign > 0)
		for (let x = a.early.at(-1) + 1; x < diff.length; x++)
			if (diff[x] != null && (diff[x] - start) * a.sign >= 0.5 * (end - start) * a.sign) {
				half = x;
				break;
			}
	const reads = mergeReads(hero);
	// The interval wholly on the expected side of zero, or wholly on the other side.
	const clear = a.sign > 0 ? b.lo > 0 : b.hi < 0;
	const wrong = a.sign > 0 ? b.hi < 0 : b.lo > 0;
	return {
		effect: r3(effect),
		lo: r3(b.lo),
		hi: r3(b.hi),
		verdict: clear ? 'right' : wrong ? 'WRONG' : effect * a.sign > 0 ? 'right (unclear)' : 'none',
		curve: hc.map((x) => r3(val(x))),
		control: cc ? cc.map((x) => r3(val(x))) : null,
		halfwayHands: half == null ? null : (half - a.early.at(-1)) * BIN,
		readsAtHalfway: half == null ? null : r1(readsN(reads[half], a.belief)),
		reads: reads.map((x) => r1(readsN(x, a.belief))),
		boots: ci(
			hero.map((t) => {
				const all = t.reduce((acc, x) => addCounters(acc, x), null);
				return (all.net / all.hands) * 100;
			})
		)
	};
}

export async function adapt({ SEED, SCALE, run, save }) {
	const T = Math.round(96 * SCALE);
	const heroes = [
		...CHARACTER_IDS.map((c) => ({ key: CHAMPIONS[c], c, member: CHAMPIONS[c] })),
		...CHARACTER_IDS.map((c) => ({
			key: `${CHAMPIONS[c]}-noreads`,
			c,
			member: noReads(c),
			control: true
		})),
		{ key: 'ms-dhoni@5-c039', c: 'ms-dhoni', member: leagueMember('ms-dhoni@5-c039') }
	];
	const specs = [];
	for (const h of heroes)
		for (const type of SCEN_TYPES)
			for (let t = 0; t < T; t++)
				specs.push({
					seed: SEED,
					table: 7000 + t,
					hands: 200,
					seats: [h.member, type, type, type, type],
					matched: true,
					bins: { seat: 0, size: BIN },
					meta: { key: h.key, type }
				});
	console.log(`adaptation: ${specs.length} tables`);
	const res = flat(await run(specs, 'adapt'));
	const tablesOf = (key, type) =>
		res
			.filter((r) => r.key === key && r.type === type)
			.sort((x, y) => x.table - y.table)
			.map((r) => r.bins);
	const out = { seed: SEED, tables: T, bin: BIN, scenarios: ADAPT, results: {} };
	for (const h of heroes.filter((x) => !x.control)) {
		out.results[h.key] = {};
		for (const a of ADAPT)
			out.results[h.key][a.id] = adaptEffect(
				a,
				tablesOf(h.key, a.type),
				tablesOf(`${CHAMPIONS[h.c]}-noreads`, a.type)
			);
		console.log(
			`${h.key.padEnd(18)} ${ADAPT.map((a) => {
				const r = out.results[h.key][a.id];
				return `${a.id} ${r.effect} [${r.lo}, ${r.hi}] ${r.verdict}`;
			}).join(' | ')}`
		);
	}
	save(`adapt-${SEED}`, out);
}
