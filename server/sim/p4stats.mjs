import { stream } from './seeds.mjs';
import { addCounters } from './summary.mjs';

/**
 * Phase 4 statistics helpers: per-table results from seat summaries, paired intervals, sample
 * sizes from measured spread, bootstrap intervals and tail measures. Uncertainty is always reported
 * with the estimate (brief §3).
 */

/** Boots per 100 hands of a seat summary, optionally over its first `upTo` hands (25/50/100/150/all). */
export function boots100(seat, upTo = Infinity) {
	if (upTo === Infinity) return (seat.total.net / Math.max(seat.hands, 1)) * 100;
	const ends = [25, 50, 100, 150];
	const k = ends.indexOf(upTo);
	if (k < 0) throw new Error(`boots100: no phase ends at ${upTo}`);
	let t = null;
	for (let i = 0; i <= k; i++) t = addCounters(t, seat.phases[i]);
	return t ? (t.net / Math.max(t.hands, 1)) * 100 : 0;
}

export const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);
export const sd = (xs) => {
	const m = mean(xs);
	return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(xs.length - 1, 1));
};
/** Mean and 95% half-width over independent units (tables, nights). */
export const ci = (xs) => ({
	mean: mean(xs),
	ci: (1.96 * sd(xs)) / Math.sqrt(Math.max(xs.length, 1)),
	n: xs.length
});
export const paired = (a, b) => ci(a.map((x, i) => x - b[i]));
/** Units needed for a 95% half-width of `target` given a per-unit spread. */
export const needed = (spread, target) => Math.ceil(((1.96 * spread) / target) ** 2);

/** Percentile bootstrap interval of a statistic over units (deterministic seed). */
export function bootstrap(units, stat, { reps = 400, seed = 4 } = {}) {
	const random = stream(seed, 'bootstrap', units.length).random;
	const vals = [];
	for (let r = 0; r < reps; r++) {
		const sample = units.map(() => units[Math.floor(random() * units.length)]);
		vals.push(stat(sample));
	}
	vals.sort((a, b) => a - b);
	return { lo: vals[Math.floor(0.025 * reps)], hi: vals[Math.floor(0.975 * reps)], sd: sd(vals) };
}

/** Mean of the worst `share` of values (e.g. the worst session decile). */
export function tail(xs, share = 0.1) {
	const s = xs.slice().sort((a, b) => a - b);
	const k = Math.max(1, Math.round(s.length * share));
	return mean(s.slice(0, k));
}

/**
 * Night variety (as Phase 3.1, server/sim/fingerprint.mjs nightEffect): for each night, the mean
 * distance from its even-hands half to other nights' odd halves, minus the distance to its own odd
 * half. `groups` are lists of nights, each [evenVector, oddVector]; features are standardized over
 * all groups together, so groups are comparable. Returns per group the per-night values.
 */
export function nightValues(groups) {
	const all = groups.flat().flat();
	const n = all[0]?.length ?? 0;
	const mu = Array.from({ length: n }, (_, i) =>
		mean(all.map((x) => x[i]).filter((v) => v != null))
	);
	const sg = Array.from({ length: n }, (_, i) => {
		const xs = all.map((x) => x[i] ?? mu[i]);
		return Math.sqrt(xs.reduce((s, v) => s + (v - mu[i]) ** 2, 0) / Math.max(xs.length, 1)) || 1;
	});
	const z = (x) => x.map((v, i) => ((v ?? mu[i]) - mu[i]) / sg[i]);
	const d = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
	return groups.map((nights) => {
		const zs = nights.map(([a, b]) => [z(a), z(b)]);
		return zs.map(([a, b], i) => {
			const others = zs.filter((_, j) => j !== i).map(([, b2]) => d(a, b2));
			return mean(others) - d(a, b);
		});
	});
}
