import { sum, featureVector, FEATURES } from './fingerprint.mjs';

/**
 * Character identifiability: can someone who has watched a bot for k hands tell which character
 * it is, from public behaviour alone? A nearest-centroid classifier over standardized fp@1 public
 * features, trained on windows from some tables and tested on windows from different tables.
 *
 * sessions: [{ table, member, hands: seatHandStats records in order }]
 */
export function windows(sessions, k, without = []) {
	const out = [];
	for (const s of sessions)
		for (let i = 0; i + k <= s.hands.length; i += k)
			out.push({
				table: s.table,
				member: s.member,
				x: featureVector(sum(s.hands.slice(i, i + k)), without)
			});
	return out;
}

function standardizer(rows) {
	const n = rows[0]?.x.length ?? FEATURES.length;
	const mean = Array(n).fill(0),
		count = Array(n).fill(0),
		sq = Array(n).fill(0);
	for (const { x } of rows)
		x.forEach((v, i) => {
			if (v === null) return;
			mean[i] += v;
			count[i]++;
		});
	for (let i = 0; i < n; i++) mean[i] /= Math.max(count[i], 1);
	for (const { x } of rows)
		x.forEach((v, i) => {
			if (v !== null) sq[i] += (v - mean[i]) ** 2;
		});
	const sd = sq.map((s, i) => Math.sqrt(s / Math.max(count[i] - 1, 1)) || 1);
	// A feature missing from a window (no such situation) counts as average.
	return (x) => x.map((v, i) => (v === null ? 0 : (v - mean[i]) / sd[i]));
}

const distance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

/**
 * @returns { k, accuracy, n, confusion: { actual: { predicted: count } }, perClass,
 *            withinSpread, betweenDistance } trained on even tables, tested on odd ones.
 */
export function identifiability(sessions, k, classes, without = []) {
	return classify(windows(sessions, k, without), k, classes);
}

/**
 * The same from precomputed k-hand window counters (Phase 3 summaries):
 * rows = [{ table, member, t }] where t is a window's summed counters.
 */
export function identifyWindows(rows, k, classes, without = []) {
	return classify(
		rows.map((r) => ({ table: r.table, member: r.member, x: featureVector(r.t, without) })),
		k,
		classes
	);
}

/** Nearest-centroid classification of feature vectors: train on even tables, test on odd. */
export function classify(rows, k, classes) {
	const all = rows.filter((w) => classes.includes(w.member));
	const train = all.filter((w) => w.table % 2 === 0);
	const test = all.filter((w) => w.table % 2 === 1);
	if (classes.some((c) => !train.some((w) => w.member === c)) || !test.length)
		return {
			k,
			n: test.length,
			trainWindows: train.length,
			accuracy: null,
			confusion: null,
			perClass: null,
			withinSpread: null,
			betweenDistance: []
		};
	const z = standardizer(train);
	const centroids = Object.fromEntries(
		classes.map((c) => {
			const rows = train.filter((w) => w.member === c).map((w) => z(w.x));
			return [c, rows[0].map((_, i) => rows.reduce((s, r) => s + r[i], 0) / rows.length)];
		})
	);
	const confusion = Object.fromEntries(
		classes.map((c) => [c, Object.fromEntries(classes.map((p) => [p, 0]))])
	);
	let correct = 0;
	const spread = Object.fromEntries(classes.map((c) => [c, []]));
	for (const w of test) {
		const v = z(w.x);
		let best = null,
			bestD = Infinity;
		for (const c of classes) {
			const d = distance(v, centroids[c]);
			if (d < bestD) [best, bestD] = [c, d];
		}
		confusion[w.member][best]++;
		if (best === w.member) correct++;
		spread[w.member].push(distance(v, centroids[w.member]));
	}
	const between = [];
	for (let i = 0; i < classes.length; i++)
		for (let j = i + 1; j < classes.length; j++)
			between.push({
				a: classes[i],
				b: classes[j],
				d: distance(centroids[classes[i]], centroids[classes[j]])
			});
	return {
		k,
		n: test.length,
		trainWindows: train.length,
		accuracy: correct / Math.max(test.length, 1),
		confusion,
		perClass: Object.fromEntries(
			classes.map((c) => {
				const row = confusion[c];
				const total = Object.values(row).reduce((s, v) => s + v, 0);
				return [c, total ? row[c] / total : null];
			})
		),
		// Within-character variation: how far one window of a character sits from its own centroid.
		withinSpread: Object.fromEntries(
			classes.map((c) => [c, spread[c].reduce((s, v) => s + v, 0) / Math.max(spread[c].length, 1)])
		),
		betweenDistance: between.sort((a, b) => a.d - b.d)
	};
}
