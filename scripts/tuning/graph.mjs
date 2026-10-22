/**
 * Tuning loop graph (docs/bots/TUNING_LOOP.md), on LangGraph JS:
 *
 *   START -> load_context -> measure_baseline -> propose -> validate --(need more, rounds left)--> propose
 *                                                       --(some valid)------------> simulate -> gate -> review -> END
 *                                                       --(none valid, no rounds)---------------------> review -> END
 *
 * Offline only. The graph never publishes, never writes to a database and never edits the canonical
 * configs: `review` writes a report and plain candidate configs to .sim/tuning/<run-id>/ and stops.
 * Every node's work is injected (`deps`), so tests can wire the graph with stubs.
 */
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';
import { characterContext } from './context.mjs';
import { draftErrors, draftStyle } from './bounds.mjs';
import { runBaseline, runCandidates } from './simulate.mjs';
import { gateCandidates } from './gates.mjs';

const last = (_, b) => b;
const append = (a, b) => a.concat(b);

export const TuningState = Annotation.Root({
	options: Annotation({ reducer: last, default: () => ({}) }),
	context: Annotation({ reducer: last, default: () => null }),
	baseline: Annotation({ reducer: last, default: () => null }),
	baselineSummary: Annotation({ reducer: last, default: () => null }),
	round: Annotation({ reducer: last, default: () => 0 }),
	drafts: Annotation({ reducer: last, default: () => [] }),
	accepted: Annotation({ reducer: append, default: () => [] }),
	rejected: Annotation({ reducer: append, default: () => [] }),
	usage: Annotation({ reducer: append, default: () => [] }),
	simulation: Annotation({ reducer: last, default: () => null }),
	gates: Annotation({ reducer: last, default: () => null }),
	output: Annotation({ reducer: last, default: () => null }),
	trace: Annotation({ reducer: append, default: () => [] })
});

/** What the proposer sees of the baseline: the fingerprint, bands, identity and exploit results. */
export function summarizeBaseline(context, baseline, gatesForCanonical) {
	const m = baseline.measured;
	const keys = [
		'bootsPer100',
		'blindRounds',
		'blindRaiseRate',
		'neverLooked',
		'seenRaiseRate',
		'aggression',
		'chaalRate',
		'packRate',
		'showRate',
		'stayAfterSeeing',
		'seenFoldToRaise',
		'thinRaise',
		'valueRaise',
		'strongPackRate',
		'weakCallRate',
		'monsterNoRaiseRate',
		'badActionRate',
		'entropy'
	];
	const r = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
	return {
		hands: m.hands,
		fingerprint: Object.fromEntries(keys.map((k) => [k, r(m[k])])),
		bands: gatesForCanonical.bands.results.map((b) => ({
			key: b.key,
			value: r(b.value),
			band: [b.min, b.max],
			pass: b.pass,
			core: b.core
		})),
		identity: {
			identified: r(gatesForCanonical.identity.perClass),
			fiveWayAccuracy: r(gatesForCanonical.identity.accuracy)
		},
		exploits: Object.fromEntries(
			Object.entries(gatesForCanonical.x).map(([x, v]) => [
				x,
				{ boots100: Math.round(v.mean), ci: Math.round(v.ci) }
			])
		)
	};
}

/** Default node implementations: the real simulator and gates. */
export const DEFAULT_DEPS = Object.freeze({
	context: (character) => characterContext(character),
	baseline: (character, budget, opts) => runBaseline(character, budget, opts),
	candidates: (character, list, budget, opts) => runCandidates(character, list, budget, opts),
	gate: (character, baseline, list) => gateCandidates(character, baseline, list),
	validateDraft: (character, canonical, draft, seen) =>
		draftErrors(character, canonical, draft, { seen })
});

/**
 * Build and compile the graph. deps: { proposer, review, ...DEFAULT_DEPS overrides }.
 * options (state.options): { character, budget, drafts (N), maxRounds (K), threads }.
 */
export function buildTuningGraph(deps) {
	const d = { ...DEFAULT_DEPS, ...deps };
	if (!d.proposer) throw new Error('buildTuningGraph needs a proposer');
	if (!d.review) throw new Error('buildTuningGraph needs a review writer');

	const context = async (s) => ({
		context: await d.context(s.options.character),
		trace: ['load_context']
	});

	const baseline = async (s) => {
		const b = await d.baseline(s.options.character, s.options.budget, {
			threads: s.options.threads
		});
		// Gate the canonical style against nothing, to get its own bands, identity and exploits.
		const self = d.gate(s.options.character, b, []);
		return {
			baseline: b,
			baselineSummary: summarizeBaseline(s.context, b, self.canonical),
			trace: ['measure_baseline']
		};
	};

	const propose = async (s) => {
		const round = s.round + 1;
		const want = Math.max(1, s.options.drafts - s.accepted.length);
		const out = await d.proposer.propose({
			context: s.context,
			baselineSummary: s.baselineSummary,
			round,
			want,
			feedback: s.rejected.map((x) => ({ draft: x.draft, reasons: x.reasons })),
			accepted: s.accepted.map((x) => x.draft)
		});
		return {
			round,
			drafts: (out.drafts ?? []).slice(0, want),
			usage: out.usage ? [{ round, ...out.usage }] : [],
			trace: ['propose']
		};
	};

	const validate = async (s) => {
		const c = s.options.character;
		const canonical = CANONICAL_STYLES[c];
		const seen = new Set(s.accepted.map((x) => x.style.configHash));
		const accepted = [];
		const rejected = [];
		for (const draft of s.drafts) {
			const reasons = await d.validateDraft(c, canonical, draft, seen);
			if (reasons.length) rejected.push({ round: s.round, draft, reasons });
			else {
				const style = draftStyle(c, canonical, draft);
				seen.add(style.configHash);
				accepted.push({ round: s.round, key: `${c}@tune-${draft.id}`, draft, style });
			}
		}
		return { accepted, rejected, trace: ['validate'] };
	};

	const afterValidate = (s) => {
		if (s.accepted.length >= s.options.drafts) return 'simulate';
		if (s.round < s.options.maxRounds) return 'propose';
		return s.accepted.length ? 'simulate' : 'review';
	};

	const simulate = async (s) => ({
		simulation: await d.candidates(
			s.options.character,
			s.accepted.map((x) => ({ key: x.key, style: x.style })),
			s.options.budget,
			{ threads: s.options.threads }
		),
		trace: ['simulate']
	});

	const gate = async (s) => ({
		gates: d.gate(
			s.options.character,
			s.baseline,
			s.accepted.map((x) => ({
				key: x.key,
				draft: x.draft,
				stats: s.simulation.stats[x.key]
			}))
		),
		trace: ['gate']
	});

	const review = async (s) => ({ output: await d.review(s), trace: ['review'] });

	return new StateGraph(TuningState)
		.addNode('load_context', context)
		.addNode('measure_baseline', baseline)
		.addNode('propose', propose)
		.addNode('validate', validate)
		.addNode('simulate', simulate)
		.addNode('gate', gate)
		.addNode('review', review)
		.addEdge(START, 'load_context')
		.addEdge('load_context', 'measure_baseline')
		.addEdge('measure_baseline', 'propose')
		.addEdge('propose', 'validate')
		.addConditionalEdges('validate', afterValidate, ['propose', 'simulate', 'review'])
		.addEdge('simulate', 'gate')
		.addEdge('gate', 'review')
		.addEdge('review', END)
		.compile();
}
