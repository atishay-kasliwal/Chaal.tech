/**
 * Phase 4 Samay event study (brief §9): the champion and the event challengers on the same tables.
 * Population tables (the Phase 3 opponent mix, seat rotating) and bluff-heavy tables, where the
 * events that matter (catching a bluff, being bluffed off, losing big) happen often enough to see.
 */
import {
	opponents,
	seatsFor,
	combine,
	measure,
	withReference
} from '../../server/sim/evaluate.mjs';
import { judgeBands } from '../../server/sim/targets.mjs';
import { SAMAY_CHALLENGERS } from '../../server/sim/challengers.mjs';
import { addEvents } from '../../server/sim/events-study.mjs';
import { CHAMPIONS } from '../../server/sim/league.mjs';
import { ci, paired, bootstrap } from '../../server/sim/p4stats.mjs';
import { flat } from './phase4-stages.mjs';

const C = 'samay-raina';
export const BLUFFY = ['human-bluffer', 'human-bluffer', 'human-aggressive', 'human-balanced'];
const b100 = (s) => (s.total.net / Math.max(s.hands, 1)) * 100;
const rate = (x) => (x.n ? x.pack / x.n : null);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/** Visible event behaviour from summed event-study counters. */
export function eventMeasures(e) {
	return {
		foldCaught12: r3(rate(e.face[0])),
		foldCaught34: r3(rate(e.face[1])),
		foldCaught58: r3(rate(e.face[2])),
		foldOther: r3(rate(e.face[3])),
		nCaught12: e.face[0].n,
		packAfterLoss: r3(rate(e.afterLoss)),
		packCalm: r3(rate(e.calm)),
		attrActed: r3(e.attr.n ? e.attr.acted / e.attr.n : null),
		attrPackWhenActed: r3(e.attr.acted ? e.attr.pack / e.attr.acted : null),
		attrCallWhenActed: r3(e.attr.acted ? e.attr.call / e.attr.acted : null),
		attrShowWhenActed: r3(e.attr.acted ? e.attr.show / e.attr.acted : null),
		events: e.events
	};
}

export async function samay({ SEED, SCALE, run, save, opt }) {
	const T = Math.round(Number(opt('tables', 400)) * SCALE);
	const H = Number(opt('hands', 100));
	const variants = [
		{ key: CHAMPIONS[C], member: CHAMPIONS[C], change: 'champion' },
		...SAMAY_CHALLENGERS.map((x) => ({
			key: x.id,
			member: { id: x.id, style: x.style },
			change: x.change
		})),
		{
			key: `${C}@2`,
			member: `${C}@2`,
			change: 'stateless reference (table effect on reactions)',
			reference: true
		}
	];
	const specs = [];
	for (const v of variants)
		for (let t = 0; t < T; t++) {
			const pop = seatsFor(v.member, opponents(SEED, 'samay', t, C), t);
			specs.push({
				seed: SEED,
				table: 100 + t,
				hands: H,
				seats: pop.seats,
				matched: true,
				summary: { seats: [pop.heroSeat], events: !v.reference },
				meta: { key: v.key, kind: 'pop' }
			});
			specs.push({
				seed: SEED,
				table: 6000 + t,
				hands: H,
				seats: [v.member, ...BLUFFY],
				matched: true,
				summary: { seats: [0], events: !v.reference },
				meta: { key: v.key, kind: 'bluffy' }
			});
		}
	console.log(`Samay event study: ${specs.length} tables`);
	const res = flat(await run(specs, 'samay'));
	const of = (key, kind) =>
		res.filter((r) => r.key === key && r.kind === kind).sort((a, b) => a.table - b.table);
	const ref = measure(combine(of(`${C}@2`, 'pop').map((r) => r.seats[0])));
	const champ = { pop: of(CHAMPIONS[C], 'pop'), bluffy: of(CHAMPIONS[C], 'bluffy') };
	const out = { seed: SEED, tables: T, hands: H, variants: {} };
	for (const v of variants.filter((x) => !x.reference)) {
		const pop = of(v.key, 'pop');
		const bluffy = of(v.key, 'bluffy');
		const m = withReference(measure(combine(pop.map((r) => r.seats[0]))), ref);
		const all = [...pop, ...bluffy];
		const ev = all.reduce((acc, r) => addEvents(acc, r.events), null);
		// Fold to a recently caught bluffer (1-4 hands) minus the champion's, table bootstrap.
		const foldCaught = (rs) => {
			const e = rs.reduce((acc, r) => addEvents(acc, r.events), null);
			const n = e.face[0].n + e.face[1].n;
			return n ? (e.face[0].pack + e.face[1].pack) / n : 0;
		};
		const champAll = [...champ.pop, ...champ.bluffy];
		const idx = all.map((_, i) => i);
		const diff = bootstrap(
			idx,
			(ids) => foldCaught(ids.map((i) => all[i])) - foldCaught(ids.map((i) => champAll[i])),
			{ reps: 300 }
		);
		out.variants[v.key] = {
			change: v.change,
			bands: judgeBands(C, m),
			m,
			boots: ci(pop.map((r) => b100(r.seats[0]))),
			pairedPop: paired(
				pop.map((r) => b100(r.seats[0])),
				champ.pop.map((r) => b100(r.seats[0]))
			),
			pairedBluffy: paired(
				bluffy.map((r) => b100(r.seats[0])),
				champ.bluffy.map((r) => b100(r.seats[0]))
			),
			events: eventMeasures(ev),
			foldCaughtVsChampion: {
				diff: r3(foldCaught(all) - foldCaught(champAll)),
				lo: r3(diff.lo),
				hi: r3(diff.hi)
			}
		};
		const x = out.variants[v.key];
		console.log(
			`${v.key.padEnd(20)} bands ${x.bands.passed}/${x.bands.results.length} pop ${Math.round(x.pairedPop.mean)}±${Math.round(x.pairedPop.ci)} bluffy ${Math.round(x.pairedBluffy.mean)}±${Math.round(x.pairedBluffy.ci)} fold vs caught 1-2 ${x.events.foldCaught12} 3-4 ${x.events.foldCaught34} other ${x.events.foldOther} (Δ ${x.foldCaughtVsChampion.diff} [${x.foldCaughtVsChampion.lo}, ${x.foldCaughtVsChampion.hi}]) attr acted ${x.events.attrActed} dPack ${x.events.attrPackWhenActed}`
		);
	}
	save(`samay-${SEED}`, out);
}
