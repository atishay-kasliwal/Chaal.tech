/**
 * Improvement tracking (docs/ANALYTICS_PHASE5.md, "Improvement"). A player's last 30 days against
 * their own earlier history, never against other people.
 *
 * Luck is not improvement. The headline verdict is built only from dimensions that remove the cards:
 * play beyond card strength, and exact decision cost where a game has one. Raw results are shown
 * beside them, and when results rise without the skill dimensions rising a note says so. Style
 * dimensions (aggression, pressure response, bet size) describe change; they are never scored
 * better or worse, because there is no defensible "right" level.
 */
import { clusteredMean, evidence, proportionTest, round, twoSidedP } from '../compute/stats.mjs';
import { tierOf } from './language.mjs';

const DAY = 86_400_000;
export const MIN_RECENT = 30;
export const MIN_BASELINE = 60;

/** Difference of two means with known sampling variances. */
function diffMeans(a, b) {
	if (!a.n || !b.n || a.varMean === null || b.varMean === null) return null;
	const se = Math.sqrt(a.varMean + b.varMean);
	const diff = a.mean - b.mean;
	const z = se ? diff / se : 0;
	return { diff, z, p: twoSidedP(z) };
}
const meanOf = (rows, value, variance) => {
	const n = rows.length;
	if (!n) return { n: 0, mean: null, varMean: null };
	const mean = rows.reduce((s, r) => s + value(r), 0) / n;
	return { n, mean, varMean: rows.reduce((s, r) => s + variance(r), 0) / (n * n) };
};

function dimension({ id, label, kind, recent, baseline, test, better, format = (x) => round(x, 2), min = MIN_RECENT, note = null }) {
	const enough = recent.n >= min && baseline.n >= Math.max(min, MIN_BASELINE);
	const tier = test ? tierOf({ n: Math.min(recent.n, baseline.n), min, p: test.p }) : 'weak';
	const moved = enough && test && tier !== 'weak';
	return {
		id,
		label,
		kind,
		recent: { n: recent.n, value: format(recent.mean ?? recent.value ?? null) },
		baseline: { n: baseline.n, value: format(baseline.mean ?? baseline.value ?? null) },
		change: test ? round(test.diff, 3) : null,
		p: test ? round(test.p, 4) : null,
		tier,
		evidence: enough ? evidence(Math.min(recent.n, baseline.n), min) : 'insufficient',
		direction: !moved ? (enough ? 'steady' : 'unclear') : better === null ? 'changed' : test.diff * better > 0 ? 'better' : 'worse',
		note
	};
}

/**
 * @param rows playRows(): per-hand play residuals for TP, Hold'em and Blackjack
 * @param facts the player's facts (all complete hands, stake games)
 * @param set collectDecisions() output for the player (public decision sequence)
 * @param bjDecisions [{ at, cost }] exact Blackjack decision costs
 */
export function improvement({ rows, facts, set, bjDecisions = [], now = Date.now(), recentDays = 30 }) {
	const cut = now - recentDays * DAY;
	const split = (list, at) => [list.filter((x) => at(x) >= cut), list.filter((x) => at(x) < cut)];
	const dims = [];

	/* Skill dimensions: independent of luck. One per game, in that game's own unit. */
	for (const game of ['teen-patti', 'texas-holdem']) {
		const gameRows = rows.filter((r) => r.game === game);
		if (!gameRows.length) continue;
		const [rw, bw] = split(gameRows, (r) => r.fact.completedAt);
		const rm = meanOf(rw, (r) => r.residual, (r) => r.variance);
		const bm = meanOf(bw, (r) => r.residual, (r) => r.variance);
		dims.push(
			dimension({
				id: `play-beyond-cards:${game}`,
				label: game === 'teen-patti' ? 'Teen Patti: boots a hand beyond what your cards were worth' : 'Hold’em: big blinds a hand beyond what your cards were worth',
				kind: 'skill',
				recent: rm,
				baseline: bm,
				test: diffMeans(rm, bm),
				better: 1,
				format: (x) => (x === null ? null : round(x, 3)),
				note: 'Results with the cards’ own value taken out. Mixes skill, bluffing and opponents’ luck.'
			})
		);
	}
	const [rb, bb] = split(bjDecisions, (d) => d.at);
	if (bjDecisions.length) {
		// A per-decision cost has a heavy tail, so judge by the share of decisions that cost anything.
		const rate = (list) => ({ k: list.filter((d) => d.cost > 0.01).length, n: list.length });
		const a = rate(rb);
		const b = rate(bb);
		const t = proportionTest(a.k, a.n, b.k, b.n);
		dims.push(
			dimension({
				id: 'blackjack-decisions',
				label: 'Blackjack: decisions that cost you bets',
				kind: 'skill',
				recent: { n: a.n, mean: a.n ? a.k / a.n : null },
				baseline: { n: b.n, mean: b.n ? b.k / b.n : null },
				test: t.diff === null ? null : { diff: t.diff, p: t.p },
				better: -1,
				format: (x) => (x === null ? null : round(x, 3)),
				min: 20,
				note: 'Exact basic-strategy check. Lower is better.'
			})
		);
	}

	/* Results: shown, never the headline. */
	const stake = facts.filter((f) => f.complete && f.stake);
	const [rs, bs] = split(stake, (f) => f.completedAt);
	const perHand = (list) => {
		const nights = [...new Set(list.map((f) => f.nightId))].map((id) => {
			const mine = list.filter((f) => f.nightId === id);
			return { sum: mine.reduce((s, f) => s + f.units, 0), n: mine.length };
		});
		const c = clusteredMean(nights);
		return { n: c.n, mean: c.mean, varMean: c.se === null ? null : c.se ** 2, nights: c.clusters };
	};
	const ra = perHand(rs);
	const rbs = perHand(bs);
	const resultsDim = dimension({
		id: 'results',
		label: 'Boots per hand',
		kind: 'result',
		recent: ra,
		baseline: rbs,
		test: diffMeans(ra, rbs),
		better: 1,
		note: 'Includes luck. Compare with the dimensions above before calling it improvement.'
	});
	dims.push(resultsDim);

	/* Style: describes change, never scored. */
	const betting = set.decisions.filter((d) => d.betting);
	const style = (id, label, filterFn, legalKey, action) => {
		const [r, b] = split(betting.filter((d) => d.options[legalKey] && filterFn(d)), (d) => d.at);
		const a = { k: r.filter((d) => d.action === action).length, n: r.length };
		const c = { k: b.filter((d) => d.action === action).length, n: b.length };
		const t = proportionTest(a.k, a.n, c.k, c.n);
		return dimension({ id, label, kind: 'style', recent: { n: a.n, mean: a.n ? a.k / a.n : null }, baseline: { n: c.n, mean: c.n ? c.k / c.n : null }, test: t.diff === null ? null : { diff: t.diff, p: t.p }, better: null, min: 20 });
	};
	dims.push(
		style('pressure-response', 'Packing when facing a raise', (d) => d.facing === 'raise', 'fold', 'fold'),
		style('aggression', 'How often you raise', () => true, 'raise', 'raise'),
		style('blind-aggression', 'Raising while blind (Teen Patti)', (d) => d.blind === true, 'raise', 'raise')
	);
	const sized = betting.filter((d) => d.game === 'teen-patti' && (d.action === 'raise' || d.action === 'call') && d.stakeMultiple !== null);
	const [rz, bz] = split(sized, (d) => d.at);
	const sizeStat = (list) => {
		const n = list.length;
		if (n < 2) return { n, mean: n ? list[0].stakeMultiple : null, varMean: null };
		const mean = list.reduce((s, d) => s + d.stakeMultiple, 0) / n;
		return { n, mean, varMean: list.reduce((s, d) => s + (d.stakeMultiple - mean) ** 2, 0) / (n - 1) / n };
	};
	const sa = sizeStat(rz);
	const sb = sizeStat(bz);
	dims.push(dimension({ id: 'bet-sizing', label: 'Average bet size (× the boot)', kind: 'style', recent: sa, baseline: sb, test: diffMeans(sa, sb), better: null, min: 20 }));

	/* Consistency: spread of night results per hand. Lower = steadier. */
	const nightPerHand = (list) => [...new Set(list.map((f) => f.nightId))].map((id) => {
		const mine = list.filter((f) => f.nightId === id);
		return mine.reduce((s, f) => s + f.units, 0) / mine.length;
	});
	const na = nightPerHand(rs);
	const nb = nightPerHand(bs);
	const sd = (xs) => (xs.length > 2 ? Math.sqrt(xs.reduce((s, x) => s + (x - xs.reduce((a, b) => a + b, 0) / xs.length) ** 2, 0) / (xs.length - 1)) : null);
	dims.push({
		id: 'consistency',
		label: 'Night-to-night swings (boots per hand)',
		kind: 'style',
		recent: { n: na.length, value: round(sd(na), 2) },
		baseline: { n: nb.length, value: round(sd(nb), 2) },
		change: sd(na) !== null && sd(nb) !== null ? round(sd(na) - sd(nb), 2) : null,
		p: null,
		tier: 'weak',
		evidence: na.length >= 5 && nb.length >= 8 ? 'early' : 'insufficient',
		direction: 'unclear',
		note: 'Swings come mostly from luck at a friends’ table. Shown for context only.'
	});

	/* Headline: skill dimensions only. */
	const skill = dims.filter((d) => d.kind === 'skill');
	const better = skill.filter((d) => d.direction === 'better');
	const worse = skill.filter((d) => d.direction === 'worse');
	const known = skill.filter((d) => d.evidence !== 'insufficient');
	const verdict = !known.length ? 'not-enough' : better.length && !worse.length ? 'improving' : worse.length && !better.length ? 'slipping' : better.length && worse.length ? 'mixed' : 'steady';
	const resultsUp = resultsDim.direction === 'better';
	return {
		window: { days: recentDays, recentHands: rs.length, baselineHands: bs.length },
		verdict,
		headlineDimensions: skill.map((d) => d.id),
		dimensions: dims,
		luckNote: resultsUp && verdict !== 'improving'
			? 'Your results are up, but the measures that remove luck have not moved. That is mostly the cards.'
			: resultsDim.direction === 'worse' && verdict !== 'slipping'
				? 'Your results are down, but the measures that remove luck have not slipped. That is mostly the cards.'
				: null
	};
}
