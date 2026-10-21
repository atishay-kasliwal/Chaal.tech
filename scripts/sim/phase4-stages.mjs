/** Phase 4 stages (scripts/sim/phase4.mjs). Each is async ({ SEED, SCALE, run, load, save }). */
import { opponents, seatsFor } from '../../server/sim/evaluate.mjs';
import { featureVector } from '../../server/sim/fingerprint.mjs';
import { CHAMPIONS, leagueMember, SHORT } from '../../server/sim/league.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { boots100, sd, ci, paired, needed, nightValues, mean } from '../../server/sim/p4stats.mjs';
import { stream } from '../../server/sim/seeds.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';

const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

/** A table spec watching one seat. */
export const tableSpec = ({ watch = 0, seed, table, hands, seats, decisionSeed, ...meta }) => ({
	matched: true,
	summary: { seats: [watch] },
	seed,
	table,
	hands,
	seats,
	...(decisionSeed != null ? { decisionSeed } : {}),
	meta
});
/** Results with their tags flattened (r.c, r.key, r.type ...). */
export const flat = (res) => res.map((r) => ({ ...r, ...r.meta }));

/** Four copies of an opponent; an adversary aims at the hero's seat (0). */
export function field(type) {
	if (type.startsWith('x:')) {
		const g = EXPLOITS[type.slice(2)].g;
		return [1, 2, 3, 4].map((i) => ({ id: `${type}#${i}`, adversary: g, target: 0 }));
	}
	return [type, type, type, type];
}

/** Calibration pairs: each champion and a realistic challenger (a historical candidate). */
export const CAL_PAIRS = Object.freeze({
	'rohit-sharma': 'rohit-sharma@5-c004',
	'virat-kohli': 'virat-kohli@4-c024',
	gg: 'gg@3',
	'samay-raina': 'samay-raina@5-c046',
	'ms-dhoni': 'ms-dhoni@5-c039'
});

/* --------------------------------------- calibration --------------------------------------- */

async function calibrate({ SEED, SCALE, run, save }) {
	const T = Math.round(48 * SCALE);
	const NIGHTS = Math.round(160 * SCALE);
	const types = [
		'population',
		'human-station',
		'human-maniac',
		'human-very-conservative',
		'x:raise-often'
	];
	const specs = [];
	for (const c of CHARACTER_IDS)
		for (const key of [CHAMPIONS[c], CAL_PAIRS[c], 'human-balanced'])
			for (const type of types)
				for (let t = 0; t < T; t++) {
					// The reference player is only needed against the adversary (exploit gap).
					if (key === 'human-balanced' && !type.startsWith('x:')) continue;
					const hero = leagueMember(key);
					const s =
						type === 'population'
							? seatsFor(hero, opponents(SEED, 'cal', t, c), t)
							: { seats: [hero, ...field(type)], heroSeat: 0 };
					specs.push(
						tableSpec({
							run: 'cal',
							c,
							key,
							type,
							table: (type === 'population' ? 100 : 3000) + t,
							seed: SEED,
							hands: 200,
							seats: s.seats,
							watch: s.heroSeat
						})
					);
				}
	for (const c of CHARACTER_IDS) {
		const nightField = opponents(SEED, 'night', 0, c);
		for (let i = 0; i < NIGHTS; i++)
			specs.push(
				tableSpec({
					run: 'night',
					c,
					key: CHAMPIONS[c],
					table: 9000,
					night: i,
					seed: SEED,
					decisionSeed: SEED * 1000 + i,
					hands: 200,
					seats: [CHAMPIONS[c], ...nightField]
				})
			);
	}
	console.log(`calibration: ${specs.length} tables`);
	const res = flat(await run(specs, 'calibrate'));
	const get = (c, key, type) =>
		res
			.filter((r) => r.run === 'cal' && r.c === c && r.key === key && r.type === type)
			.sort((a, b) => a.table - b.table)
			.map((r) => r.seats[0]);
	const out = { seed: SEED, tables: T, nights: NIGHTS, strength: {}, night: {} };
	for (const c of CHARACTER_IDS) {
		out.strength[c] = {};
		for (const type of types) {
			const champ = get(c, CHAMPIONS[c], type);
			const chal = get(c, CAL_PAIRS[c], type);
			const ref = type.startsWith('x:') ? get(c, 'human-balanced', type) : null;
			const row = {};
			for (const L of [50, 100, 200]) {
				const a = champ.map((s) => boots100(s, L === 200 ? Infinity : L));
				const b = chal.map((s) => boots100(s, L === 200 ? Infinity : L));
				const diff = a.map((x, i) => x - b[i]);
				row[L] = {
					champion: ci(a),
					sdUnpaired: r1(Math.sqrt(sd(a) ** 2 + sd(b) ** 2)),
					sdPaired: r1(sd(diff)),
					paired: paired(b, a),
					// Hands needed for a ±50 / ±100 boots/100 interval on a champion-challenger difference.
					hands50: needed(sd(diff), 50) * L,
					hands100: needed(sd(diff), 100) * L
				};
				if (ref) {
					const g = ref.map((s, i) => boots100(s, L === 200 ? Infinity : L) - a[i]);
					row[L].gapSd = r1(sd(g));
					row[L].gap = ci(g);
					row[L].gapHands100 = needed(sd(g), 100) * L;
				}
			}
			out.strength[c][type] = row;
		}
		// Night variety: how its estimate settles with the number of nights (random subsets).
		const halves = res
			.filter((r) => r.run === 'night' && r.c === c)
			.sort((a, b) => a.night - b.night)
			.map((r) => r.seats[0].halves.map((x) => featureVector(x)));
		const full = mean(nightValues([halves])[0]);
		const random = stream(SEED, 'nightcal', c).random;
		const byK = {};
		for (const k of [12, 25, 50, 100].filter((k) => k < halves.length)) {
			const est = [];
			for (let rep = 0; rep < 60; rep++) {
				const pool = halves.slice();
				for (let i = pool.length - 1; i > 0; i--) {
					const j = Math.floor(random() * (i + 1));
					[pool[i], pool[j]] = [pool[j], pool[i]];
				}
				est.push(mean(nightValues([pool.slice(0, k)])[0]));
			}
			// Subsets of one finite set vary less than fresh nights would: correct for it.
			const fpc = Math.sqrt(1 - k / halves.length);
			byK[k] = {
				mean: r3(mean(est)),
				sd: r3(sd(est) / fpc),
				relSd: r3(sd(est) / fpc / Math.abs(full))
			};
		}
		out.night[c] = { full: r3(full), n: halves.length, byK };
		console.log(
			`${SHORT[c].padEnd(6)} pop paired sd ${out.strength[c].population[200].sdPaired} (unpaired ${out.strength[c].population[200].sdUnpaired}); station ${out.strength[c]['human-station'][200].sdPaired}; maniac ${out.strength[c]['human-maniac'][200].sdPaired}; night ${out.night[c].full} sd@12 ${byK[12]?.sd} @50 ${byK[50]?.sd} @100 ${byK[100]?.sd}`
		);
	}
	save(`calibration-${SEED}`, out);
}

export const STAGES = { calibrate };
