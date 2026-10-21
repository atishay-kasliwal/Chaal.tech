import { situation, candidates, move, strength, baseFactors, forcedMove } from './brain.mjs';
import { QUIRKS_V2 } from './quirks.mjs';
import { defineGraph, runGraph } from './graph.mjs';
import { DNA_POLICY_V2 } from './dna-policies.mjs';

/**
 * Policy tp-character@2 (BOT_BRAIN.md §27, Phase 1.1): good Teen Patti fundamentals first, and
 * personality bends them without breaking them.
 *
 * Changes from tp-character@1 (which stays, frozen, for the @1 styles):
 *  - bound: personality and quirk deltas are scaled down by how clear the base brain's preference
 *    is. Ambiguous spots are personality's to decide; obvious ones rarely flip. How hard the bound
 *    bites depends on the style's discipline.
 *  - each trait acts in one place: `aggression` once cards are seen, the new `blindAggression`
 *    while blind, `bluffAffinity` only with weak seen hands. Quirks only act in their moment.
 *  - clarity is measured from evidence (cards, money), not blind conventions, so how long to stay
 *    blind and whether to double blind stay style choices.
 *  - the base brain feels blind pressure: seen players betting over a blind player make looking
 *    more attractive; a blind double is closer to a blind chaal.
 *  - explanations compare the move with the alternative that mattered, record every alternative's
 *    score gap, and say when fundamentals held against a personality pull.
 *
 * Pure and deterministic from (view, style, random draws). Reads only the bot's own projection.
 */
export const CHARACTER_POLICY_V2 = DNA_POLICY_V2;

const BETA = 5;
const TAU = 0.35;
export const NOISE_V2 = 0.002;
/** Base-brain clarity (utility gap between its best and second-best move) at which personality
 * keeps half its weight, for a style of typical discipline. */
const CLARITY = 0.12;
/** A seen raise is only called a bluff when the hand wins this often or less against the field. */
const BLUFF_LINE = 0.35;
/** A factor that moved the choice by less than this is not offered as a reason. */
const MIN_MARGIN = 0.02;
/** Personality pulling at least this hard toward another move, which fundamentals resisted. */
const PULL_LINE = 0.05;

/**
 * How much each base factor counts as evidence when judging how clear the base brain's choice is.
 * Factors from the cards and the money (equity, value, stack) are evidence. Blind conventions
 * (when to look, chaal vs raise unseen) are customs with no card information behind them: they
 * still score moves, but barely restrain personality, so how long to play blind is a style choice.
 */
export const EVIDENCE = {
	'base.equity': 1,
	'base.value-raise': 1,
	'base.show-value': 1,
	'base.stack-pressure': 1,
	'base.blind-pressure': 0.25
};
export const CONVENTION = 0.1;

/** Base utilities counted as evidence only (see EVIDENCE). */
export function evidenceOf(cands, base) {
	return sumFactors(
		cands,
		base.map(({ f, d }) => ({
			f,
			d: Object.fromEntries(Object.entries(d).map(([a, v]) => [a, v * (EVIDENCE[f] ?? CONVENTION)]))
		}))
	);
}

/**
 * Base utilities for this policy. Seen play is the shared base brain unchanged. Blind play differs
 * from tp-character@1 in three ways: a blind double is closer to a blind chaal (both are cheap and
 * both pressure seen players); the urge to look grows with the log of what is committed, so stakes
 * doubling (anyone's blind raise) does not rush everyone into looking; and seen players betting
 * over a blind player make looking attractive.
 */
export function baseFactorsV2(sit, cands, s) {
	if (sit.seen) return baseFactors(sit, cands, s);
	const factors = baseFactors(sit, cands, s).map(({ f, d }) => {
		if (f === 'base.blind-cheap' && d.raise !== undefined) return { f, d: { ...d, raise: 0.2 } };
		if (f === 'base.see-timing') return { f, d: { see: -0.35 + 0.55 * Math.log2(1 + sit.rounds) } };
		return { f, d };
	});
	if (cands.includes('see') && sit.seenBetters)
		factors.push({ f: 'base.blind-pressure', d: { see: 0.15 * sit.seenBetters } });
	return factors;
}

/** DNA traits: where each one acts. x = trait - 0.5. */
const TRAITS = {
	aggression: (sit, x) => (sit.seen ? { raise: 0.5 * x, chaal: 0.1 * x } : null),
	blindAggression: (sit, x) => (sit.seen ? null : { raise: 0.6 * x }),
	bluffAffinity: (sit, x, s) =>
		sit.seen && s.multi < BLUFF_LINE ? { raise: 0.8 * x * (1 - s.multi / BLUFF_LINE) } : null,
	blindPreference: (sit, x) => (sit.seen ? null : { see: -1.4 * x, chaal: 0.15 * x }),
	patience: (sit, x, s) =>
		sit.seen ? { chaal: -0.5 * x * (1 - s.multi), raise: -0.3 * x * (1 - s.multi) } : null,
	curiosity: (sit, x) => (sit.seen ? { chaal: 0.45 * x, show: 0.25 * x } : null),
	showPreference: (sit, x) => ({ show: 0.6 * x }),
	riskTolerance: (sit, x) => ({
		chaal: 1.2 * x * sit.stackPressure,
		raise: 1.5 * x * sit.stackPressure
	})
};

/** Reasons for each trait when it is above / below typical (0.5). */
const TRAIT_REASONS = {
	aggression: ['aggression', 'caution'],
	blindAggression: ['blind-aggression', 'blind-caution'],
	bluffAffinity: ['bluff-raise', 'honest-play'],
	blindPreference: ['blind-preference', 'likes-to-look'],
	patience: ['patience-pack', 'impatience'],
	curiosity: ['curiosity-call', 'incurious-pack'],
	showPreference: ['show-preference', 'avoids-show'],
	riskTolerance: ['risk-appetite', 'risk-averse']
};

/** Reasons this policy can give: a fixed vocabulary, never free text. */
export const CHARACTER_REASONS_V2 = Object.freeze([
	'table-move',
	'discard',
	'only-move',
	'noise',
	'mixing',
	'fundamentals-held',
	'blind-see',
	'blind-pressure-see',
	'blind-hold',
	'blind-raise',
	'blind-show',
	'blind-stack-guard',
	'show-strong',
	'strong-raise',
	'pot-odds-call',
	'weak-pack',
	'stack-guard',
	...Object.values(TRAIT_REASONS).flat(),
	...new Set(Object.values(QUIRKS_V2).map((q) => q.reason))
]);

/** The base brain's reason for a move. */
function baseReason(factor, action, seen) {
	if (!seen) {
		if (action === 'see')
			return factor === 'base.blind-pressure' ? 'blind-pressure-see' : 'blind-see';
		return (
			{ show: 'blind-show', pack: 'blind-stack-guard', raise: 'blind-raise' }[action] ??
			'blind-hold'
		);
	}
	if (factor === 'base.stack-pressure') return 'stack-guard';
	return { pack: 'weak-pack', chaal: 'pot-odds-call', raise: 'strong-raise', show: 'show-strong' }[
		action
	];
}

function reasonFor(factor, action, c) {
	const [kind, name] = factor.split('.');
	if (kind === 'quirk') return QUIRKS_V2[name].reason;
	if (kind === 'dna') {
		const [high, low] = TRAIT_REASONS[name];
		return c.style.tendencies.dna[name] >= 0.5 ? high : low;
	}
	return baseReason(factor, action, c.sit.seen);
}

const round = (x) => Math.round(x * 1000) / 1000;
const mapValues = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));
const argmax = (cands, score) =>
	cands.reduce((best, a) => (score[a] > score[best] ? a : best), cands[0]);
const sumFactors = (cands, factors) => {
	const out = Object.fromEntries(cands.map((a) => [a, 0]));
	for (const { d } of factors) for (const [a, v] of Object.entries(d)) out[a] += v;
	return out;
};

function push(c, list, f, d) {
	const kept = Object.fromEntries(
		Object.entries(d).filter(([a, v]) => c.cands.includes(a) && v !== 0)
	);
	if (Object.keys(kept).length) list.push({ f, d: kept });
}

const nodes = [
	{
		id: 'perceive',
		label: 'own view to situation; forced moves',
		run(c) {
			c.sit = situation(c.view, c.botId);
			const forced = forcedMove(c.sit, c.random);
			if (forced || !c.sit.myTurn) {
				c.result = forced;
				c.done = true;
			}
		}
	},
	{
		id: 'assess',
		label: 'base brain: strength, pot odds, pressure, candidates',
		run(c) {
			c.cands = candidates(c.sit);
			c.strength = c.sit.seen ? strength(c.sit, c.random) : null;
			c.base = baseFactorsV2(c.sit, c.cands, c.strength);
			if (c.cands.length === 1) {
				c.result = { ...move(c.sit, c.cands[0]), reason: 'only-move' };
				c.done = true;
			}
		}
	},
	{
		id: 'personalize',
		label: 'DNA traits',
		run(c) {
			c.persona = [];
			const dna = c.style.tendencies.dna;
			for (const [trait, effect] of Object.entries(TRAITS)) {
				if (dna[trait] === undefined) continue;
				const d = effect(c.sit, dna[trait] - 0.5, c.strength);
				if (d) push(c, c.persona, `dna.${trait}`, d);
			}
		}
	},
	{
		id: 'quirks',
		label: 'conditional quirks',
		run(c) {
			c.quirks = [];
			for (const { id, strength: k } of c.style.tendencies.quirks ?? []) {
				const quirk = QUIRKS_V2[id];
				if (!quirk?.apply) continue;
				const d = quirk.apply(c.sit, k, c.strength);
				if (d) push(c, c.quirks, `quirk.${id}`, d);
			}
		}
	},
	{
		id: 'bound',
		label: 'limit personality by base clarity and discipline',
		run(c) {
			const base = sumFactors(c.cands, c.base);
			// Clarity: how decisively the evidence (not the conventions) separates the top two moves.
			const evidence = evidenceOf(c.cands, c.base);
			c.evidenceU = evidence;
			const ranked = c.cands.map((a) => evidence[a]).sort((x, y) => y - x);
			c.clarity = ranked[0] - ranked[1];
			const discipline = c.style.tendencies.dna.discipline ?? 0.5;
			const reach = CLARITY * (0.6 + 0.8 * (1 - discipline));
			c.lambda = 1 / (1 + (c.clarity / reach) ** 2);
			const scale = (list) =>
				list.map(({ f, d }) => ({
					f,
					d: Object.fromEntries(Object.entries(d).map(([a, v]) => [a, v * c.lambda]))
				}));
			c.persona = scale(c.persona);
			c.quirks = scale(c.quirks);
			c.factors = [...c.base, ...c.persona, ...c.quirks];
			c.baseU = base;
			c.personaU = sumFactors(c.cands, c.persona);
			c.quirkU = sumFactors(c.cands, c.quirks);
		}
	},
	{
		id: 'choose',
		label: 'softmax over utilities, one recorded draw',
		run(c) {
			const utility = Object.fromEntries(
				c.cands.map((a) => [a, c.baseU[a] + c.personaU[a] + c.quirkU[a]])
			);
			const tau = TAU * (1.4 - (c.style.tendencies.dna.discipline ?? 0.5));
			const top = Math.max(...Object.values(utility));
			const weights = c.cands.map((a) => Math.exp((BETA * (utility[a] - top)) / tau));
			const total = weights.reduce((sum, w) => sum + w, 0);
			c.utility = utility;
			c.tau = tau;
			c.probs = Object.fromEntries(c.cands.map((a, i) => [a, weights[i] / total]));
			c.baseBest = argmax(c.cands, c.baseU);
			c.best = argmax(c.cands, utility);
			const withoutQuirks = Object.fromEntries(c.cands.map((a) => [a, utility[a] - c.quirkU[a]]));
			c.quirkOverride = argmax(c.cands, withoutQuirks) !== c.best;
			const draw = c.random();
			if (draw < NOISE_V2) {
				c.chosen = c.cands[Math.floor(c.random() * c.cands.length)];
				c.noise = true;
				return;
			}
			let u = (draw - NOISE_V2) / (1 - NOISE_V2);
			c.chosen = c.cands.at(-1);
			for (const a of c.cands) {
				u -= c.probs[a];
				if (u < 0) {
					c.chosen = a;
					break;
				}
			}
		}
	},
	{
		id: 'explain',
		label: 'the decision conflict: key alternative, reasons, what was resisted',
		run(c) {
			const chosen = c.chosen;
			const others = c.cands.filter((a) => a !== chosen);
			const gap = (score, a) => score[chosen] - score[a];
			const alternatives = others.map((a) => [
				a,
				round(c.probs[a]),
				round(gap(c.utility, a)),
				round(gap(c.baseU, a)),
				round(gap(c.personaU, a)),
				round(gap(c.quirkU, a))
			]);
			// The alternative that matters: the base brain's choice when we departed from it;
			// otherwise the move personality pulled hardest toward; otherwise the likeliest other.
			const pull = (a) => c.personaU[a] + c.quirkU[a] - (c.personaU[chosen] + c.quirkU[chosen]);
			const pulled = others.slice().sort((a, b) => pull(b) - pull(a))[0];
			const key =
				chosen !== c.baseBest
					? c.baseBest
					: pulled !== undefined && pull(pulled) >= PULL_LINE
						? pulled
						: others.slice().sort((a, b) => c.probs[b] - c.probs[a])[0];
			const held = chosen === c.baseBest && key === pulled && pull(pulled) >= PULL_LINE;
			const margins = c.factors
				.map(({ f, d }) => [f, (d[chosen] ?? 0) - (d[key] ?? 0)])
				.filter(([, m]) => m > MIN_MARGIN)
				.sort((a, b) => b[1] - a[1]);
			const reasons = [];
			for (const [f] of margins) {
				const reason = reasonFor(f, chosen, c);
				if (!reasons.includes(reason)) reasons.push(reason);
			}
			const personal = margins.filter(([f]) => !f.startsWith('base.'));
			let primary;
			if (c.noise) primary = 'noise';
			else if (chosen !== c.baseBest)
				primary = personal.length ? reasonFor(personal[0][0], chosen, c) : 'mixing';
			else primary = reasons[0] ?? baseReason(null, chosen, c.sit.seen);
			// What personality wanted that the fundamentals did not allow.
			const resisted = held
				? c.factors
						.filter(({ f }) => !f.startsWith('base.'))
						.map(({ f, d }) => [f, (d[key] ?? 0) - (d[chosen] ?? 0)])
						.filter(([, m]) => m > MIN_MARGIN)
						.sort((a, b) => b[1] - a[1])
						.map(([f]) => reasonFor(f, key, c))
				: [];
			const secondary = [
				...(held ? ['fundamentals-held'] : []),
				...reasons.filter((r) => r !== primary)
			].slice(0, 3);
			c.result = {
				...move(c.sit, chosen),
				reason: primary,
				trace: {
					key: key ?? null,
					probs: mapValues(c.probs),
					utility: mapValues(c.utility),
					base: mapValues(c.baseU),
					persona: mapValues(c.personaU),
					quirk: mapValues(c.quirkU),
					clarity: round(c.clarity),
					lambda: round(c.lambda),
					baseBest: c.baseBest,
					best: c.best,
					override: c.best !== c.baseBest,
					overridden: round(c.baseU[c.baseBest] - c.baseU[c.best]),
					// The same gap counting evidence only: overriding a blind custom costs nothing here.
					overriddenEvidence: round(c.evidenceU[c.baseBest] - c.evidenceU[c.best]),
					quirkOverride: c.quirkOverride,
					alternatives,
					factors: c.factors.map(({ f, d }) => [f, mapValues(d)]),
					margins: margins.slice(0, 6).map(([f, m]) => [f, round(m)]),
					secondary,
					...(resisted.length ? { resisted: [...new Set(resisted)].slice(0, 3) } : {}),
					tau: round(c.tau),
					...(c.strength ? { eq: round(c.strength.single), s: round(c.strength.multi) } : {}),
					...(c.noise ? { noise: true } : {})
				}
			};
		}
	}
];

export const CHARACTER_GRAPH_V2 = defineGraph(CHARACTER_POLICY_V2, nodes);

export function decideCharacterV2(view, botId, random, style) {
	const c = runGraph(CHARACTER_GRAPH_V2, { view, botId, random, style });
	if (!c.result) return null;
	return { ...c.result, trace: { path: c.path, ...(c.result.trace ?? {}) } };
}
