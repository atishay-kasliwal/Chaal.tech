/**
 * Statistics shared by every analytic (docs/ANALYTICS_PHASE2.md, "Statistical methodology").
 * Friend groups produce small samples, so everything here reports uncertainty and refuses to
 * claim more than the data supports.
 */

export const Z95 = 1.959964;

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(x) {
	const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
	const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
	return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
export const twoSidedP = (z) => (Number.isNaN(z) || z === null || z === undefined ? 1 : Number.isFinite(z) ? 2 * (1 - normalCdf(Math.abs(z))) : 0);

/** Wilson score interval for a proportion. */
export function wilson(k, n, z = Z95) {
	if (!n) return { rate: null, low: null, high: null, n: 0 };
	const p = k / n;
	const denom = 1 + (z * z) / n;
	const centre = (p + (z * z) / (2 * n)) / denom;
	const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
	return { rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half), n };
}

/** Two-proportion z-test. */
export function proportionTest(k1, n1, k2, n2) {
	if (!n1 || !n2) return { diff: null, z: null, p: 1 };
	const p1 = k1 / n1;
	const p2 = k2 / n2;
	const pooled = (k1 + k2) / (n1 + n2);
	const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
	const z = se ? (p1 - p2) / se : 0;
	return { diff: p1 - p2, z, p: se ? twoSidedP(z) : 1 };
}

/** Rate pulled toward a prior rate, as if `strength` prior observations had been seen. */
export function shrinkRate(k, n, prior, strength) {
	if (prior === null || prior === undefined) return n ? k / n : null;
	return (k + prior * strength) / (n + strength);
}

/** Mean pulled toward a prior mean with the weight of `strength` observations. */
export function shrinkMean(mean, n, prior, strength) {
	if (mean === null || mean === undefined) return prior ?? null;
	if (prior === null || prior === undefined) return mean;
	return (mean * n + prior * strength) / (n + strength);
}

/**
 * Ratio mean (total ÷ count) with a standard error that treats each night as one cluster:
 * hands in a night share stacks, mood and opponents, so they are not independent.
 * @param groups [{ sum, n }] one per night
 */
export function clusteredMean(groups) {
	const used = groups.filter((g) => g.n > 0);
	const total = used.reduce((s, g) => s + g.sum, 0);
	const count = used.reduce((s, g) => s + g.n, 0);
	if (!count) return { mean: null, se: null, low: null, high: null, n: 0, clusters: 0 };
	const mean = total / count;
	const G = used.length;
	if (G < 2) return { mean, se: null, low: null, high: null, n: count, clusters: G };
	const ss = used.reduce((s, g) => s + (g.sum - mean * g.n) ** 2, 0);
	const se = Math.sqrt((G / (G - 1)) * ss) / count;
	return { mean, se, low: mean - Z95 * se, high: mean + Z95 * se, n: count, clusters: G };
}

/** Benjamini–Hochberg: marks which tests survive a false discovery rate of q. */
export function benjaminiHochberg(items, q = 0.1, key = 'p') {
	const sorted = items.map((item, index) => ({ item, index })).sort((a, b) => a.item[key] - b.item[key]);
	const m = sorted.length;
	let cutoff = -1;
	sorted.forEach(({ item }, rank) => {
		if (item[key] <= ((rank + 1) / m) * q) cutoff = rank;
	});
	const qValues = new Array(m);
	let running = 1;
	for (let rank = m - 1; rank >= 0; rank--) {
		running = Math.min(running, (sorted[rank].item[key] * m) / (rank + 1));
		qValues[sorted[rank].index] = Math.min(1, running);
	}
	return items.map((item, index) => ({ ...item, q: qValues[index], significant: sorted.findIndex((s) => s.index === index) <= cutoff }));
}

/* ------------------------------- chi-square goodness of fit ------------------------------- */

function logGamma(x) {
	const c = [76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 1.208650973866179e-3, -0.5395239384953e-5];
	let y = x;
	const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
	let ser = 1.000000000190015;
	for (const coefficient of c) ser += coefficient / ++y;
	return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x);
}
/** Regularised upper incomplete gamma Q(a, x). */
function gammaQ(a, x) {
	if (x <= 0) return 1;
	if (x < a + 1) {
		let sum = 1 / a;
		let term = sum;
		for (let n = 1; n < 500; n++) {
			term *= x / (a + n);
			sum += term;
			if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
		}
		return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
	}
	let b = x + 1 - a;
	let c = 1e300;
	let d = 1 / b;
	let h = d;
	for (let i = 1; i < 500; i++) {
		const an = -i * (i - a);
		b += 2;
		d = an * d + b;
		if (Math.abs(d) < 1e-300) d = 1e-300;
		c = b + an / c;
		if (Math.abs(c) < 1e-300) c = 1e-300;
		d = 1 / d;
		const delta = d * c;
		h *= delta;
		if (Math.abs(delta - 1) < 1e-12) break;
	}
	return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Pearson chi-square test of observed counts against expected counts. */
export function chiSquare(observed, expected) {
	let stat = 0;
	for (let i = 0; i < observed.length; i++) if (expected[i] > 0) stat += (observed[i] - expected[i]) ** 2 / expected[i];
	const df = observed.length - 1;
	return { stat, df, p: df > 0 ? gammaQ(df / 2, stat / 2) : 1 };
}

/* ----------------------------------------- wording ----------------------------------------- */

/**
 * How much a number can be trusted, in words the UI can show.
 * insufficient: below the minimum, show "not enough yet"; early: show, clearly provisional.
 */
export function evidence(n, min) {
	if (n < min) return 'insufficient';
	if (n < min * 3) return 'early';
	if (n < min * 10) return 'moderate';
	return 'strong';
}

/** Round for display without pretending to precision. */
export const round = (value, digits = 2) =>
	value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;
