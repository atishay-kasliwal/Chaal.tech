import { situation, candidates, move, strength, baseFactors, forcedMove } from './brain.mjs';
import { QUIRKS } from './quirks.mjs';
import { defineGraph, runGraph } from './graph.mjs';
import { DNA_POLICY_V1 } from './dna-policies.mjs';

/**
 * Policy tp-character@1: character bots. Base Teen Patti skill (./brain.mjs) plus personality as
 * data: a style's DNA traits and quirks add named deltas to each candidate move's utility; a
 * softmax turns utilities into probabilities and one recorded draw picks the move.
 *
 * Pure: the same view, style and random draws always give the same move and trace. Reads only
 * the bot's own projection. Phase 1 has no memory, mood or opponent models (BOT_BRAIN.md §20).
 */
export const CHARACTER_POLICY = DNA_POLICY_V1;

/** Scale from utility units to logits before the temperature. */
const BETA = 5;
/** Base temperature; discipline lowers it. */
const TAU = 0.35;
/** Irreducible noise: tiny on purpose. Unusual moves should come from personality, not dice. */
export const NOISE = 0.002;
/** A factor that moved the choice by less than this is not offered as a reason. */
const MIN_MARGIN = 0.02;

/**
 * Reasons this policy can give, a fixed vocabulary (never free text). A superset of the legacy
 * REASONS minus `mistake`, which this policy never uses.
 */
export const CHARACTER_REASONS = Object.freeze([
	'table-move',
	'discard',
	'only-move',
	'noise',
	'blind-see',
	'blind-hold',
	'blind-bluff-raise',
	'blind-show',
	'blind-stack-guard',
	'show-strong',
	'strong-raise',
	'pot-odds-call',
	'weak-pack',
	'stack-guard',
	'aggression',
	'bluff-raise',
	'blind-preference',
	'patience-pack',
	'curiosity-call',
	'show-preference',
	'risk-appetite',
	'caution',
	'honest-play',
	'likes-to-look',
	'impatience',
	'incurious-pack',
	'avoids-show',
	'risk-averse',
	'blind-pride',
	'survival-pack'
]);

/** DNA traits in use and how each one moves the candidates. 0.5 is neutral. */
const TRAITS = {
	aggression: (sit, x) => ({ raise: 0.5 * x, chaal: 0.12 * x }),
	bluffAffinity: (sit, x, s) =>
		sit.seen ? { raise: 0.7 * x * (1 - s.multi) } : { raise: 0.45 * x },
	blindPreference: (sit, x) => (sit.seen ? null : { see: -1.2 * x, chaal: 0.2 * x }),
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
	bluffAffinity: ['bluff-raise', 'honest-play'],
	blindPreference: ['blind-preference', 'likes-to-look'],
	patience: ['patience-pack', 'impatience'],
	curiosity: ['curiosity-call', 'incurious-pack'],
	showPreference: ['show-preference', 'avoids-show'],
	riskTolerance: ['risk-appetite', 'risk-averse']
};

/** Which reason a factor stands for, given the move it pushed toward and the trait's direction. */
function reasonFor(factor, action, seen, dna) {
	const [kind, name] = factor.split('.');
	if (kind === 'quirk') return QUIRKS[name]?.reason ?? 'only-move';
	if (kind === 'dna') {
		const [high, low] = TRAIT_REASONS[name];
		if (name === 'bluffAffinity' && !seen && dna[name] >= 0.5) return 'blind-bluff-raise';
		return dna[name] >= 0.5 ? high : low;
	}
	if (!seen)
		return action === 'see'
			? 'blind-see'
			: action === 'show'
				? 'blind-show'
				: action === 'pack'
					? 'blind-stack-guard'
					: action === 'raise'
						? 'blind-bluff-raise'
						: 'blind-hold';
	if (name === 'stack-pressure') return 'stack-guard';
	return { pack: 'weak-pack', chaal: 'pot-odds-call', raise: 'strong-raise', show: 'show-strong' }[
		action
	];
}

const round = (x) => Math.round(x * 1000) / 1000;

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
		label: 'base brain: strength, pot odds, candidates',
		run(c) {
			c.cands = candidates(c.sit);
			c.strength = c.sit.seen ? strength(c.sit, c.random) : null;
			c.factors = baseFactors(c.sit, c.cands, c.strength);
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
			const dna = c.style.tendencies.dna;
			for (const [trait, effect] of Object.entries(TRAITS)) {
				if (dna[trait] === undefined) continue;
				const d = effect(c.sit, dna[trait] - 0.5, c.strength);
				if (d) push(c, `dna.${trait}`, d);
			}
		}
	},
	{
		id: 'quirks',
		label: 'signature quirks',
		run(c) {
			for (const { id, strength: k } of c.style.tendencies.quirks ?? []) {
				const quirk = QUIRKS[id];
				if (!quirk?.apply) continue;
				const d = quirk.apply(c.sit, k);
				if (d) push(c, `quirk.${id}`, d);
			}
		}
	},
	{
		id: 'choose',
		label: 'softmax over utilities, one recorded draw',
		run(c) {
			const utility = Object.fromEntries(c.cands.map((a) => [a, 0]));
			for (const { d } of c.factors) for (const [a, v] of Object.entries(d)) utility[a] += v;
			const tau = TAU * (1.4 - (c.style.tendencies.dna.discipline ?? 0.5));
			const top = Math.max(...Object.values(utility));
			const weights = c.cands.map((a) => Math.exp((BETA * (utility[a] - top)) / tau));
			const total = weights.reduce((sum, w) => sum + w, 0);
			c.utility = utility;
			c.tau = tau;
			c.probs = Object.fromEntries(c.cands.map((a, i) => [a, weights[i] / total]));
			const draw = c.random();
			if (draw < NOISE) {
				c.chosen = c.cands[Math.floor(c.random() * c.cands.length)];
				c.noise = true;
				return;
			}
			let u = (draw - NOISE) / (1 - NOISE);
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
		label: 'primary and secondary reasons',
		run(c) {
			const chosen = c.chosen;
			// What separated the chosen move from the strongest alternative.
			const rival = c.cands.filter((a) => a !== chosen).sort((a, b) => c.probs[b] - c.probs[a])[0];
			const margins = c.factors
				.map(({ f, d }) => [f, (d[chosen] ?? 0) - (d[rival] ?? 0)])
				.filter(([, m]) => m > MIN_MARGIN)
				.sort((a, b) => b[1] - a[1]);
			const reasons = [];
			for (const [f] of margins) {
				const reason = reasonFor(f, chosen, c.sit.seen, c.style.tendencies.dna);
				if (reason && !reasons.includes(reason)) reasons.push(reason);
			}
			const primary = c.noise
				? 'noise'
				: (reasons[0] ?? reasonFor('base.equity', chosen, c.sit.seen, c.style.tendencies.dna));
			c.result = {
				...move(c.sit, chosen),
				reason: primary,
				trace: {
					rival: rival ?? null,
					probs: mapValues(c.probs),
					utility: mapValues(c.utility),
					factors: c.factors
						.map(({ f, d }) => [f, mapValues(d)])
						.sort((a, b) => magnitude(b[1]) - magnitude(a[1]))
						.slice(0, 8),
					margins: margins.slice(0, 6).map(([f, m]) => [f, round(m)]),
					secondary: reasons.filter((r) => r !== primary).slice(0, 2),
					tau: round(c.tau),
					...(c.strength ? { eq: round(c.strength.single), s: round(c.strength.multi) } : {}),
					...(c.noise ? { noise: true } : {})
				}
			};
		}
	}
];

function push(c, f, d) {
	const kept = Object.fromEntries(
		Object.entries(d).filter(([a, v]) => c.cands.includes(a) && v !== 0)
	);
	if (Object.keys(kept).length) c.factors.push({ f, d: kept });
}
const mapValues = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));
const magnitude = (d) => Object.values(d).reduce((sum, v) => sum + Math.abs(v), 0);

export const CHARACTER_GRAPH = defineGraph(CHARACTER_POLICY, nodes);

/**
 * @param view the bot's own projection
 * @param style a published style with policy tp-character@1
 * @returns {{ action, payload, reason, trace? } | null}
 */
export function decideCharacter(view, botId, random, style) {
	const c = runGraph(CHARACTER_GRAPH, { view, botId, random, style, factors: [] });
	if (!c.result) return null;
	return c.result.trace
		? { ...c.result, trace: { path: c.path, ...c.result.trace } }
		: { ...c.result, trace: { path: c.path } };
}
