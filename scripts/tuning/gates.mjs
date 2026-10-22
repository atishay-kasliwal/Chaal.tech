/**
 * Tuning loop: the gates (docs/bots/TUNING_LOOP.md). The Phase 4 champion-vs-challenger gates
 * (scripts/sim/phase4-gates.mjs, the ones Dhoni C1 passed in docs/archive/bots/PHASE41_REPORT.md),
 * with the same thresholds, applied to a DNA candidate against the canonical style on matched tables:
 *
 *  regression       no core band newly failed; no fewer bands passed; violation at most +0.5
 *  personality      its 50-hand windows identified as its character at most 5 points below canonical
 *  identifiability  (new) overall accuracy of the five-way identification at most 5 points below
 *  strength         not clearly weaker in the population: upper 95% bound of the paired difference >= -50
 *  exploit          only when the draft names an exploit: that exploit clearly improves (lower bound > 0)
 *  counter          no fixed exploit clearly worse: no paired difference with upper bound < -100
 *  variety          night variety at least 0.6 of canonical's
 *  bad actions      bad-action rate at most 0.5 points above canonical's
 *  performance      mean decision time at most 1.5 times canonical's (+0.02 ms), when timing is on
 *
 * The Phase 4 adaptation scenarios (the `adapt` and `event` exploit targets) are not run: a DNA
 * step is not a new mechanism, and the counter-exploit suite already covers the opponents that
 * broke earlier fixes. A candidate that passes here still goes through the full Phase 4 gates at
 * full budget before anyone adopts it.
 */
import { measure, withReference } from '../../server/sim/evaluate.mjs';
import { judgeBands } from '../../server/sim/targets.mjs';
import { identifyWindows } from '../../server/sim/identify.mjs';
import { ci, paired, nightValues } from '../../server/sim/p4stats.mjs';

export const THRESHOLDS = Object.freeze({
	violationSlack: 0.5,
	personalityDrop: 0.05,
	identifiabilityDrop: 0.05,
	strengthFloor: -50,
	counterFloor: -100,
	varietyShare: 0.6,
	badActionSlack: 0.005,
	perfFactor: 1.5,
	perfSlackMs: 0.02
});

const r0 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x));
const pct = (x) => (x == null ? 'n/a' : `${Math.round(100 * x)}%`);

/** One hero's measurements: bands, identity, strength units, exploits, variety, timing. */
function row(character, key, stats, baseline, perf) {
	const m = withReference(measure(stats.summary), baseline.reference);
	const classes = [key, ...baseline.otherKeys];
	const others = Object.values(baseline.others).flat();
	const id = identifyWindows([...stats.windows, ...others], 50, classes);
	return {
		key,
		m,
		bands: judgeBands(character, m),
		identity: { perClass: id.perClass?.[key] ?? null, accuracy: id.accuracy },
		pop: stats.pop,
		x: stats.x,
		nights: stats.nights,
		perf
	};
}

/**
 * Gate every candidate against canonical. `candidates` are { key, draft, stats }. Returns the
 * canonical row and per candidate its gates, verdict and the numbers behind them.
 */
export function gateCandidates(character, baseline, candidates) {
	const champ = row(
		character,
		baseline.champion.key,
		baseline.champion,
		baseline,
		baseline.perf ?? null
	);
	const rows = candidates.map((c) => ({
		...row(character, c.key, c.stats, baseline, c.stats.perf ?? null),
		draft: c.draft
	}));
	// Night variety is standardized over every hero together (as the Phase 4 gates do).
	const nightVals = nightValues([champ.nights, ...rows.map((r) => r.nights)]);
	champ.night = ci(nightVals[0]);
	rows.forEach((r, i) => (r.night = ci(nightVals[i + 1])));
	const coreFailed = (b) => b.results.filter((x) => x.core && !x.pass).map((x) => x.key);
	const T = THRESHOLDS;
	const out = rows.map((r) => {
		const g = {};
		const newCore = coreFailed(r.bands).filter((k) => !coreFailed(champ.bands).includes(k));
		g.regression = {
			pass:
				!newCore.length &&
				r.bands.passed >= champ.bands.passed &&
				r.bands.violation <= champ.bands.violation + T.violationSlack,
			detail: `bands ${r.bands.passed}/${r.bands.results.length} (canonical ${champ.bands.passed}), violation ${r.bands.violation.toFixed(2)} (${champ.bands.violation.toFixed(2)})${newCore.length ? `, core lost: ${newCore.join(', ')}` : ''}`
		};
		g.personality = {
			pass:
				r.identity.perClass != null &&
				champ.identity.perClass != null &&
				r.identity.perClass >= champ.identity.perClass - T.personalityDrop,
			detail: `identified ${pct(r.identity.perClass)} (canonical ${pct(champ.identity.perClass)})`
		};
		g.identifiability = {
			pass:
				r.identity.accuracy != null &&
				champ.identity.accuracy != null &&
				r.identity.accuracy >= champ.identity.accuracy - T.identifiabilityDrop,
			detail: `five-way accuracy ${pct(r.identity.accuracy)} (canonical ${pct(champ.identity.accuracy)})`
		};
		const p = paired(r.pop, champ.pop);
		g.strength = {
			pass: p.mean + p.ci >= T.strengthFloor,
			detail: `${r0(p.mean)} ± ${r0(p.ci)} boots/100 vs canonical (${p.n} tables)`,
			paired: p
		};
		const xPaired = Object.fromEntries(
			Object.keys(r.x).map((x) => [x, paired(r.x[x], champ.x[x] ?? [])])
		);
		const worse = Object.entries(xPaired).filter(([, v]) => v.mean + v.ci < T.counterFloor);
		g.counter = {
			pass: !worse.length,
			detail: worse.length
				? `clearly worse: ${worse.map(([x]) => x).join(', ')}`
				: 'none clearly worse'
		};
		const target = r.draft.exploitTarget ?? null;
		if (target && xPaired[target])
			g.exploit = {
				pass: xPaired[target].mean - xPaired[target].ci > 0,
				detail: `${target}: ${r0(xPaired[target].mean)} ± ${r0(xPaired[target].ci)} boots/100 vs canonical`
			};
		else
			g.exploit = {
				pass: null,
				detail: target ? `${target} not in this run's exploit suite` : 'no target named'
			};
		g.variety = {
			pass: r.night.mean >= T.varietyShare * champ.night.mean,
			detail: `${r.night.mean.toFixed(2)} ± ${r.night.ci.toFixed(2)} (canonical ${champ.night.mean.toFixed(2)})`
		};
		g.badActions = {
			pass: (r.m.badActionRate ?? 0) <= (champ.m.badActionRate ?? 0) + T.badActionSlack,
			detail: `${(100 * (r.m.badActionRate ?? 0)).toFixed(2)}% (canonical ${(100 * (champ.m.badActionRate ?? 0)).toFixed(2)}%)`
		};
		g.performance =
			r.perf && champ.perf
				? {
						pass: r.perf.mean <= T.perfFactor * champ.perf.mean + T.perfSlackMs,
						detail: `${r.perf.mean.toFixed(3)} ms mean (canonical ${champ.perf.mean.toFixed(3)})`
					}
				: { pass: null, detail: 'timing off' };
		const pass = Object.values(g).every((x) => x.pass !== false);
		return {
			key: r.key,
			draft: r.draft,
			pass,
			gates: Object.fromEntries(
				Object.entries(g).map(([k, v]) => [k, { pass: v.pass, detail: v.detail }])
			),
			strength: { mean: p.mean, ci: p.ci, n: p.n },
			xPaired: Object.fromEntries(
				Object.entries(xPaired).map(([x, v]) => [x, { mean: v.mean, ci: v.ci, n: v.n }])
			),
			bands: r.bands,
			identity: r.identity,
			night: r.night,
			badActionRate: r.m.badActionRate,
			perf: r.perf
		};
	});
	return {
		canonical: {
			key: champ.key,
			bands: champ.bands,
			identity: champ.identity,
			night: champ.night,
			badActionRate: champ.m.badActionRate,
			pop: ci(champ.pop),
			x: Object.fromEntries(Object.entries(champ.x).map(([x, v]) => [x, ci(v)])),
			perf: champ.perf
		},
		candidates: out
	};
}
