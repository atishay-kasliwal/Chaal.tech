/**
 * Phase 4 night-to-night variation (brief §10): where a session's character comes from. Each
 * source is varied alone, everything else held fixed, for every champion:
 *  - decision: only the decision draws (same decks, opponents and starting mood);
 *  - mood: only the starting mood (the night key the mood is drawn from), same draws and decks;
 *  - cards: only the decks;
 *  - opponents: only who else sits at the table;
 *  - night: everything at once, a typical real night;
 *  - stateless: the character's stateless version (Phase 1.1, no mind) with only the draws varied,
 *    the floor that decision noise alone produces.
 * Variety is the Phase 3.1 night measure (an even-hands half closer to its own odd half than to
 * other nights'), all sessions standardized together. Identity: each typical night's whole session
 * is classified by nearest character centroid (leave one out); acceptable variation is the range of
 * distances from a character's own centroid that its sessions still occupy while being recognised.
 */
import { opponents } from '../../server/sim/evaluate.mjs';
import { featureVector } from '../../server/sim/fingerprint.mjs';
import { addCounters } from '../../server/sim/summary.mjs';
import { CHAMPIONS, SHORT } from '../../server/sim/league.mjs';
import { nightValues, ci, mean } from '../../server/sim/p4stats.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { flat } from './phase4-stages.mjs';

const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
export const SOURCES = ['decision', 'mood', 'cards', 'opponents', 'night', 'stateless'];

function nightSpec(SEED, c, source, i) {
	const fixed = opponents(SEED, 'variation', 0, c);
	const base = { seed: SEED, decisionSeed: SEED * 7 + 1, nightKey: SEED * 7 + 2, field: fixed };
	const v = SEED * 1000 + i + 10;
	const s = {
		decision: { ...base, decisionSeed: v },
		mood: { ...base, nightKey: v },
		cards: { ...base, seed: v },
		opponents: { ...base, field: opponents(SEED, 'variation', i + 1, c) },
		night: {
			seed: v,
			decisionSeed: v + 500000,
			nightKey: v + 900000,
			field: opponents(SEED, 'variation', i + 1, c)
		},
		stateless: { ...base, decisionSeed: v }
	}[source];
	const hero = source === 'stateless' ? `${c}@2` : CHAMPIONS[c];
	return {
		seed: s.seed,
		decisionSeed: s.decisionSeed,
		nightKey: s.nightKey,
		table: 9100,
		hands: 200,
		seats: [hero, ...s.field],
		matched: true,
		summary: { seats: [0], sequences: source === 'night' },
		meta: { c, source, night: i }
	};
}

export async function variation({ SEED, SCALE, run, save, opt }) {
	const N = Math.round(Number(opt('nights', 60)) * SCALE);
	const specs = [];
	for (const c of CHARACTER_IDS)
		for (const source of SOURCES)
			for (let i = 0; i < N; i++) specs.push(nightSpec(SEED, c, source, i));
	console.log(`variation: ${specs.length} sessions`);
	const res = flat(await run(specs, 'variation'));
	const sessions = (c, source) =>
		res
			.filter((r) => r.c === c && r.source === source)
			.sort((a, b) => a.night - b.night)
			.map((r) => r.seats[0]);
	const groups = [];
	const index = [];
	for (const c of CHARACTER_IDS)
		for (const source of SOURCES) {
			groups.push(sessions(c, source).map((s) => s.halves.map((x) => featureVector(x))));
			index.push([c, source]);
		}
	const values = nightValues(groups);
	const out = {
		seed: SEED,
		nights: N,
		sources: SOURCES,
		variety: {},
		identity: {},
		development: {},
		sequences: {}
	};
	index.forEach(([c, source], g) => {
		(out.variety[c] ??= {})[source] = ci(values[g]);
	});
	// Session development: first 50 hands against the last 50, in standardized feature distance.
	const whole = (s) => featureVector(s.total);
	const allNights = CHARACTER_IDS.flatMap((c) => sessions(c, 'night').map((s) => ({ c, s })));
	const vecs = allNights.map(({ s }) => whole(s));
	const dim = vecs[0].length;
	const mu = Array.from({ length: dim }, (_, i) =>
		mean(vecs.map((v) => v[i]).filter((x) => x != null))
	);
	const sg = Array.from({ length: dim }, (_, i) => {
		const xs = vecs.map((v) => v[i] ?? mu[i]);
		return Math.sqrt(mean(xs.map((x) => (x - mu[i]) ** 2))) || 1;
	});
	const z = (v) => v.map((x, i) => ((x ?? mu[i]) - mu[i]) / sg[i]);
	const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
	for (const c of CHARACTER_IDS)
		for (const source of ['night', 'stateless']) {
			const d = sessions(c, source).map((s) =>
				dist(z(featureVector(addCounters(s.phases[0], s.phases[1]))), z(featureVector(s.phases[4])))
			);
			(out.development[c] ??= {})[source] = ci(d);
		}
	// Identity across typical nights: leave-one-out nearest centroid on whole sessions.
	const zs = allNights.map(({ c, s }) => ({ c, v: z(whole(s)) }));
	for (const c of CHARACTER_IDS) {
		let right = 0;
		const own = [];
		const nearestOther = [];
		const mine = zs.filter((x) => x.c === c);
		for (const x of mine) {
			const cent = (k) => {
				const rows = zs.filter((y) => y.c === k && y !== x).map((y) => y.v);
				return rows[0].map((_, i) => mean(rows.map((r) => r[i])));
			};
			const ds = Object.fromEntries(CHARACTER_IDS.map((k) => [k, dist(x.v, cent(k))]));
			const best = CHARACTER_IDS.reduce((a, b) => (ds[a] <= ds[b] ? a : b));
			if (best === c) right++;
			own.push(ds[c]);
			nearestOther.push(Math.min(...CHARACTER_IDS.filter((k) => k !== c).map((k) => ds[k])));
		}
		const sorted = own.slice().sort((a, b) => a - b);
		out.identity[c] = {
			accuracy: r3(right / mine.length),
			ownDistance: r3(mean(own)),
			band95: r3(sorted[Math.floor(0.95 * (sorted.length - 1))]),
			nearestOther: r3(mean(nearestOther)),
			margin: r3(mean(nearestOther.map((d, i) => d - own[i])))
		};
	}
	// Sequence counters from the typical nights, summed (server/sim/sequences.mjs).
	const addDeep = (a, b) => {
		if (!a) return structuredClone(b);
		for (const [k, v] of Object.entries(b))
			if (typeof v === 'number') a[k] = (a[k] ?? 0) + v;
			else addDeep(a[k], v);
		return a;
	};
	for (const c of CHARACTER_IDS)
		out.sequences[c] = res
			.filter((r) => r.c === c && r.source === 'night')
			.reduce((acc, r) => addDeep(acc, r.sequences), null);
	for (const c of CHARACTER_IDS)
		console.log(
			`${SHORT[c].padEnd(6)} ${SOURCES.map((s) => `${s} ${r3(out.variety[c][s].mean)}±${r3(out.variety[c][s].ci)}`).join(' ')} | identity ${out.identity[c].accuracy} margin ${out.identity[c].margin}`
		);
	save(`variation-${SEED}`, out);
}
