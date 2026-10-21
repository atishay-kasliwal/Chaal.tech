import { situation, candidates, move, strength, forcedMove } from './brain.mjs';
import { baseFactorsV2, EVIDENCE, CONVENTION } from './character-v2.mjs';
import { QUIRKS_V3, QUIRKS_V5 } from './quirks.mjs';

/** Every quirk by name, for reasons and grouping (names are unique); a policy applies only its own set. */
const QUIRK_NAMES = Object.freeze({ ...QUIRKS_V3, ...QUIRKS_V5 });
import { defineGraph, runGraph } from './graph.mjs';
import { MOOD_BASELINE, beliefs, confidence, PRIORS } from './mind.mjs';
import { DNA_POLICY_V3 } from './dna-policies.mjs';

/**
 * Policy tp-dna@3 (BOT_BRAIN.md §28, Phase 2): the tp-dna@2 foundation (base brain,
 * DNA traits, conditional quirks, the evidence bound, conflict explanations) plus a mind.
 *
 * New named steps, each producing named factors that are bounded exactly like personality:
 *  - recall: what the bot remembers about this hand and table (./mind.mjs), and who is pressing it.
 *  - state: mood (confidence, frustration, fear, suspicion, excitement) away from its baseline.
 *    Disciplined styles feel their mood less in their decisions.
 *  - social: relationships with the players in the hand (rivalry, annoyance, fear), by temperament.
 *  - beliefs: opponent tendencies (fold to a raise, bluffs shown, aggression), each weighted by
 *    how many observations back it and by the style's adaptability.
 *
 * The base brain's "pressure" is now seen players still in who have bet after looking this hand
 * (from observations), not seen players whose total bet is higher: a blind player's bets are half
 * price, so the old proxy counted every seen opponent as pressure on anyone who had played blind.
 *
 * Without a mind (null) the policy still plays: no state, relationships or beliefs.
 * Pure and deterministic from (view, style, mind, random draws). Reads only the bot's own
 * projection and its own mind, which is built only from its own projections.
 */
export const CHARACTER_POLICY_V3 = DNA_POLICY_V3;

const BETA = 5;
const TAU = 0.35;
export const NOISE_V3 = 0.002;
const CLARITY = 0.12;
const BLUFF_LINE = 0.35;
const MIN_MARGIN = 0.02;
const PULL_LINE = 0.05;
/**
 * Most one source of influence can move any move's utility, before the evidence bound. Many
 * small pushes (a mood, a rivalry, a quirk) cannot add up to overrule the cards: each group is
 * scaled down to its cap if it would exceed it. Personality traits keep their tp-dna@2 range.
 */
export const CAPS = Object.freeze({ state: 0.25, social: 0.15, model: 0.4, quirk: 0.25 });

/** Evidence weights: tp-dna@2's plus the future cost of continuing with a weak hand. */
const EVIDENCE_V3 = { ...EVIDENCE, 'base.future-cost': 1 };
function evidenceOf(cands, base) {
	return sumFactors(
		cands,
		base.map(({ f, d }) => ({
			f,
			d: Object.fromEntries(
				Object.entries(d).map(([a, v]) => [a, v * (EVIDENCE_V3[f] ?? CONVENTION)])
			)
		}))
	);
}

/**
 * Base utilities for this policy: tp-dna@2's, plus the future cost of continuing a seen hand
 * well below a fair share. A chaal only buys the next round: a hand that rarely wins will pay
 * again and again, which pot odds on this one bet do not see. Borderline hands (near a fair share)
 * are untouched, so how loosely to play them stays a matter of personality. And a monster is
 * worth more raised than shown.
 */
function baseFactorsV3(sit, cands, s) {
	const factors = baseFactorsV2(sit, cands, s);
	if (!sit.seen) return factors;
	const fair = 1 / (sit.opponents.length + 1);
	const short = Math.max(0, 1 - s.multi / fair);
	if (short > 0.3) {
		const d = Object.fromEntries(
			['chaal', 'raise'].filter((a) => cands.includes(a)).map((a) => [a, -0.2 * short])
		);
		if (Object.keys(d).length) factors.push({ f: 'base.future-cost', d });
	}
	// Very strong hands want the pot built: the value of raising climbs faster at the top.
	// A monster (beats nearly every single hand) wants the pot built even when several players
	// make its chance against all of them look ordinary.
	const top = 0.8 * Math.max(0, s.multi - 0.75) + 4 * Math.max(0, s.single - 0.95);
	if (cands.includes('raise') && top > 0)
		factors.push({ f: 'base.value-raise', d: { raise: top } });
	// Asking for a show with a monster ends the hand early: raising earns more.
	if (cands.includes('show') && s.multi > 0.85)
		factors.push({ f: 'base.show-value', d: { show: -0.5 * (s.multi - 0.85) } });
	return factors;
}

export const TRAITS = {
	aggression: (sit, x) => (sit.seen ? { raise: 0.5 * x, chaal: 0.1 * x } : null),
	blindAggression: (sit, x) => (sit.seen ? null : { raise: 0.6 * x }),
	bluffAffinity: (sit, x, s) =>
		sit.seen && s.multi < BLUFF_LINE ? { raise: 0.8 * x * (1 - s.multi / BLUFF_LINE) } : null,
	blindPreference: (sit, x) => (sit.seen ? null : { see: -1.4 * x, chaal: 0.15 * x }),
	patience: (sit, x, s) =>
		sit.seen ? { chaal: -0.5 * x * (1 - s.multi), raise: -0.3 * x * (1 - s.multi) } : null,
	// Wider than tp-dna@2: the bound now protects very weak hands, so curiosity can speak up
	// in the borderline spots where it belongs.
	curiosity: (sit, x) => (sit.seen ? { chaal: 0.6 * x, show: 0.25 * x } : null),
	showPreference: (sit, x) => ({ show: 0.6 * x }),
	riskTolerance: (sit, x) => ({
		chaal: 1.2 * x * sit.stackPressure,
		raise: 1.5 * x * sit.stackPressure
	})
};

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

/** Mood: how a deviation from baseline moves each candidate. dev = mood - baseline. */
export const MOODS = {
	confidence: (sit, dev) =>
		sit.seen ? { raise: 0.35 * dev, chaal: 0.1 * dev } : { see: -0.25 * dev, raise: 0.15 * dev },
	// Mind-driven aggression acts once cards are seen; blind play stays with the blind traits.
	// Frustration comes out by temperament: the undisciplined tilt (raise more), the disciplined
	// tighten up (release marginal hands). Same mood, opposite play.
	frustration: (sit, dev, m, dna, s) => {
		if (!sit.seen) return null;
		const hot = 1 - (dna.discipline ?? 0.5);
		const cool = (dna.discipline ?? 0.5) * (1 - s.multi);
		return { raise: dev * (0.4 * hot - 0.4 * cool), chaal: dev * (0.15 * hot - 0.8 * cool) };
	},
	fear: (sit, dev) => ({ raise: -0.35 * dev, chaal: -0.15 * dev }),
	suspicion: (sit, dev, m) => (sit.seen && m.facing ? { chaal: 0.3 * dev, show: 0.2 * dev } : null),
	excitement: (sit, dev) => (sit.seen ? { raise: 0.15 * dev } : null)
};
const TEMPERED = new Set(['frustration']);
const MOOD_REASONS = {
	confidence: ['confident', 'shaken'],
	// [above baseline, below baseline, above baseline for a disciplined style]
	frustration: ['tilt', 'calm', 'tightened-up'],
	fear: ['nervous', 'fearless'],
	suspicion: ['suspicious-call', 'trusting'],
	excitement: ['excited', 'flat']
};
const SOCIAL_REASONS = {
	rivalry: 'rivalry-pressure',
	annoyance: 'stubborn-call',
	fear: 'intimidated'
};
const MODEL_REASONS = {
	pressure: ['model-pressure', 'model-station'],
	value: ['model-value', 'model-thin-value'],
	caller: ['model-call-light', 'model-respect']
};

export const CHARACTER_REASONS_V3 = Object.freeze([
	...new Set([
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
		...Object.values(MOOD_REASONS).flat(),
		...Object.values(SOCIAL_REASONS),
		...Object.values(MODEL_REASONS).flat(),
		...Object.values(QUIRKS_V3).map((q) => q.reason)
	])
]);

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

function reasonFor(factor, action, c, sign) {
	const [kind, name] = factor.split('.');
	if (kind === 'quirk') return QUIRK_NAMES[name].reason;
	if (kind === 'dna') {
		const [high, low] = TRAIT_REASONS[name];
		return c.style.tendencies.dna[name] >= 0.5 ? high : low;
	}
	if (kind === 'state') {
		const up = c.moodDev[name] >= 0;
		if (up && TEMPERED.has(name) && (c.style.tendencies.dna.discipline ?? 0.5) >= 0.5)
			return MOOD_REASONS[name][2];
		return MOOD_REASONS[name][up ? 0 : 1];
	}
	if (kind === 'social') return SOCIAL_REASONS[name];
	if (kind === 'model') return MODEL_REASONS[name][sign >= 0 ? 0 : 1];
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
const minus = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - b[k]]));
const GROUPS = ['persona', 'state', 'social', 'model', 'quirk'];
// A quirk that amplifies opponent reads (readsTable) is part of the reads, so it is a model factor.
const group = (f) => {
	const [kind, name] = f.split('.');
	if (kind === 'quirk' && QUIRK_NAMES[name]?.modelWeight) return 'model';
	return { dna: 'persona', state: 'state', social: 'social', model: 'model', quirk: 'quirk' }[kind];
};

function push(c, f, d, sign = 1) {
	const kept = Object.fromEntries(
		Object.entries(d).filter(
			([a, v]) => c.cands.includes(a) && Number.isFinite(v) && Math.abs(v) > 1e-6
		)
	);
	if (Object.keys(kept).length) c.extra.push({ f, d: kept, sign });
}

// Nodes read a policy's rules from the scratch (c.rules): see characterPolicy below.
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
		id: 'recall',
		label: 'mind: mood, who raised this hand, beliefs about players in it',
		run(c) {
			const mind = c.mind;
			const hand =
				mind?.hand && mind.hand.id === c.view.handId && !mind.hand.over ? mind.hand : null;
			const alive = new Set(c.sit.opponents.map((u) => u.id));
			const about = (id) => {
				const b = beliefs(mind, id);
				return b ? { id, beliefs: b, recent: b.recent, rel: b.rel } : null;
			};
			const facingId =
				hand &&
				hand.lastRaiser &&
				hand.lastRaiser !== c.botId &&
				alive.has(hand.lastRaiser) &&
				hand.raiseAt > (hand.lastAct[c.botId] ?? -1)
					? hand.lastRaiser
					: null;
			c.m = {
				mood: mind?.mood ?? MOOD_BASELINE,
				// Seen players still in who have bet after looking this hand (calls count: blind bets
				// are half price, so total bets alone would make any seen player look like pressure);
				// how each one counts is the policy's rule.
				pressure: hand ? c.rules.pressure(c, hand, alive, about) : c.sit.seenBetters,
				opponents: [...alive].map(about).filter(Boolean),
				facing: facingId ? about(facingId) : null,
				tableAggr: mind?.table.aggr ?? 0.25
			};
			// A policy may remember more (tp-dna@5: its own recent events).
			if (c.rules.recall) Object.assign(c.m, c.rules.recall(c, mind));
			c.moodDev = Object.fromEntries(
				Object.keys(MOOD_BASELINE).map((k) => [k, c.m.mood[k] - MOOD_BASELINE[k]])
			);
		}
	},
	{
		id: 'assess',
		label: 'base brain: strength, pot odds, pressure, candidates',
		run(c) {
			// Pressure is seen players who raised this hand (or, without a mind, the old proxy).
			const sit = { ...c.sit, seenBetters: c.m.pressure };
			c.sit = sit;
			c.cands = candidates(sit);
			c.strength = sit.seen ? strength(sit, c.random) : null;
			c.base = baseFactorsV3(sit, c.cands, c.strength);
			c.extra = [];
			if (c.cands.length === 1) {
				c.result = { ...move(sit, c.cands[0]), reason: 'only-move' };
				c.done = true;
			}
		}
	},
	{
		id: 'personalize',
		label: 'DNA traits',
		run(c) {
			const dna = c.style.tendencies.dna;
			for (const [trait, effect] of Object.entries(c.rules.traits)) {
				if (dna[trait] === undefined) continue;
				const d = effect(c.sit, dna[trait] - 0.5, c.strength);
				if (d) push(c, `dna.${trait}`, d);
			}
		}
	},
	{
		id: 'state',
		label: 'mood away from baseline; disciplined styles feel it less',
		run(c) {
			const dna = c.style.tendencies.dna;
			const feel = 1.2 - (dna.discipline ?? 0.5);
			for (const [name, effect] of Object.entries(c.rules.moods)) {
				const dev = c.moodDev[name];
				if (Math.abs(dev) < 0.02) continue;
				const d = effect(c.sit, dev, c.m, dna, c.strength);
				// Frustration already says how each temperament shows it (TEMPERED).
				const k = TEMPERED.has(name) ? 1 : feel;
				if (d)
					push(
						c,
						`state.${name}`,
						Object.fromEntries(Object.entries(d).map(([a, v]) => [a, v * k]))
					);
			}
			if (c.rules.amplify) c.rules.amplify(c);
		}
	},
	{
		id: 'social',
		label: 'relationships with the players in this hand',
		run(c) {
			const dna = c.style.tendencies.dna;
			const temper = 0.5 + (dna.sociality ?? 0.5);
			const fight = ((dna.revenge ?? 0.5) + (dna.ego ?? 0.5)) / 2;
			if (!c.sit.seen) return;
			const rival =
				c.m.facing ?? c.m.opponents.slice().sort((a, b) => b.rel.rivalry - a.rel.rivalry)[0];
			if (rival && rival.rel.rivalry > 0.02)
				push(c, 'social.rivalry', {
					raise: 0.35 * rival.rel.rivalry * fight * temper,
					chaal: 0.12 * rival.rel.rivalry * temper
				});
			if (c.m.facing && c.m.facing.rel.annoyance > 0.02)
				push(c, 'social.annoyance', { chaal: 0.25 * c.m.facing.rel.annoyance * temper });
			if (c.m.facing && c.m.facing.rel.fear > 0.02)
				push(c, 'social.fear', {
					chaal: -0.2 * c.m.facing.rel.fear * temper,
					raise: -0.25 * c.m.facing.rel.fear * temper
				});
		}
	},
	{
		id: 'beliefs',
		label: 'opponent tendencies, weighted by observations and adaptability',
		run(c) {
			const adapt = c.style.tendencies.dna.adaptability ?? 0.5;
			const reads =
				(c.style.tendencies.quirks ?? []).find((q) => q.id === 'readsTable')?.strength ?? 0;
			c.memoryRefs = [];
			const emit = (name, d, sign) => {
				push(
					c,
					`model.${name}`,
					Object.fromEntries(Object.entries(d).map(([a, v]) => [a, v * adapt])),
					sign
				);
				if (reads)
					push(
						c,
						'quirk.readsTable',
						Object.fromEntries(Object.entries(d).map(([a, v]) => [a, v * adapt * reads]))
					);
			};
			// Fold equity: the chance everyone still in gives up, believed vs what the population
			// would do. Each player's fold chance is half how they answer a raise, half how often
			// they give up at all (the tightest players are gone before anyone raises them), each
			// trusted by its own confidence. A product, so a bluff into four players rarely pays.
			if (c.sit.seen && c.cands.includes('raise') && c.m.opponents.length) {
				const prior = (PRIORS.foldToRaise + PRIORS.givesUp) / 2;
				let believed = 1;
				let usual = 1;
				let callers = 0;
				for (const o of c.m.opponents) {
					const b = o.beliefs.foldToRaise;
					const g = o.beliefs.givesUp;
					believed *=
						prior +
						0.5 * confidence(b.n) * (b.p - PRIORS.foldToRaise) +
						0.5 * confidence(g.n) * (g.p - PRIORS.givesUp);
					usual *= prior;
					callers += confidence(b.n) * Math.max(0, PRIORS.foldToRaise - b.p);
					c.memoryRefs.push([o.id, 'foldToRaise', round(b.p), round(b.n)]);
					c.memoryRefs.push([o.id, 'givesUp', round(g.p), round(g.n)]);
				}
				// Folders make weak raises (bluffs) pay; callers make strong raises (value) pay.
				const s = c.strength.multi;
				const strong = Math.min(1, Math.max(0, (s - 0.5) / 0.5));
				const edge = believed - usual;
				// The base brain prices a raise as if nobody folds; a raise that makes everyone fold wins
				// the pot the cards would have lost. Worth more the weaker the hand.
				if (Math.abs(edge) > 0.005) emit('pressure', { raise: 2.5 * edge * (1 - s) }, edge);
				// Against players who call raises, value raises earn more. Folders still call with
				// strong hands, so this read only ever adds to a strong raise.
				const loose = callers / c.m.opponents.length;
				if (loose > 0.005 && strong > 0) emit('value', { raise: 1.2 * loose * strong }, 1);
			}
			// Facing a raise: how light does this raiser raise?
			if (c.sit.seen && c.m.facing) {
				const b = c.m.facing.beliefs;
				const dev =
					confidence(b.bluffShown.n) * (b.bluffShown.p - PRIORS.bluffShown) * 0.8 +
					confidence(b.aggression.n) * (b.aggression.p - PRIORS.aggression) * 0.4;
				c.memoryRefs.push([
					c.m.facing.id,
					'bluffShown',
					round(b.bluffShown.p),
					round(b.bluffShown.n)
				]);
				c.memoryRefs.push([
					c.m.facing.id,
					'aggression',
					round(b.aggression.p),
					round(b.aggression.n)
				]);
				// A light raiser is worth calling heads-up; with others still in, their hands count too.
				const share = 1 / c.m.opponents.length;
				if (Math.abs(dev) > 0.005)
					emit('caller', { chaal: dev * share, show: 0.5 * dev * share }, dev);
			}
		}
	},
	{
		id: 'quirks',
		label: 'conditional quirks',
		run(c) {
			for (const { id, strength: k } of c.style.tendencies.quirks ?? []) {
				const quirk = (c.rules.quirks ?? QUIRKS_V3)[id];
				if (!quirk?.apply) continue;
				const d = quirk.apply(c.sit, k, c.strength, c.m);
				if (d) push(c, `quirk.${id}`, d);
			}
		}
	},
	{
		id: 'bound',
		label: 'cap each influence, then bound all but the base brain by evidence clarity',
		run(c) {
			const base = sumFactors(c.cands, c.base);
			const evidence = evidenceOf(c.cands, c.base);
			const ranked = c.cands.map((a) => evidence[a]).sort((x, y) => y - x);
			c.clarity = ranked[0] - ranked[1];
			const discipline = c.style.tendencies.dna.discipline ?? 0.5;
			const reach = CLARITY * (0.6 + 0.8 * (1 - discipline));
			c.lambda = 1 / (1 + (c.clarity / reach) ** 2);
			// Cap each source of influence, then bound everything by evidence clarity.
			c.capped = [];
			for (const [g, cap] of Object.entries(CAPS)) {
				const sum = sumFactors(
					c.cands,
					c.extra.filter((x) => group(x.f) === g)
				);
				const worst = Math.max(...Object.values(sum).map(Math.abs));
				if (worst > cap) {
					c.capped.push(g);
					const k = cap / worst;
					c.extra = c.extra.map((x) =>
						group(x.f) === g
							? { ...x, d: Object.fromEntries(Object.entries(x.d).map(([a, v]) => [a, v * k])) }
							: x
					);
				}
			}
			// Opponent reads are evidence about what a move is worth (a raise into players who fold
			// earns more), not a taste for one move: capped, weighted by adaptability and confidence,
			// but not shrunk by how clear the cards alone make the choice.
			c.extra = c.extra.map(({ f, d, sign }) => ({
				f,
				sign,
				d:
					group(f) === 'model'
						? d
						: Object.fromEntries(Object.entries(d).map(([a, v]) => [a, v * c.lambda]))
			}));
			c.factors = [...c.base, ...c.extra];
			c.baseU = base;
			c.evidenceU = evidence;
			c.parts = Object.fromEntries(
				GROUPS.map((g) => [
					g,
					sumFactors(
						c.cands,
						c.extra.filter((x) => group(x.f) === g)
					)
				])
			);
		}
	},
	{
		id: 'choose',
		label: 'softmax over utilities, one recorded draw',
		run(c) {
			const utility = { ...c.baseU };
			for (const g of GROUPS) for (const a of c.cands) utility[a] += c.parts[g][a];
			const tau = TAU * (1.4 - (c.style.tendencies.dna.discipline ?? 0.5));
			const top = Math.max(...Object.values(utility));
			const weights = c.cands.map((a) => Math.exp((BETA * (utility[a] - top)) / tau));
			const total = weights.reduce((sum, w) => sum + w, 0);
			c.utility = utility;
			c.tau = tau;
			c.probs = Object.fromEntries(c.cands.map((a, i) => [a, weights[i] / total]));
			c.baseBest = argmax(c.cands, c.baseU);
			c.best = argmax(c.cands, utility);
			const without = (...gs) => gs.reduce((u, g) => minus(u, c.parts[g]), utility);
			c.overrides = {
				quirk: argmax(c.cands, without('quirk')) !== c.best,
				state: argmax(c.cands, without('state')) !== c.best,
				memory: argmax(c.cands, without('social', 'model')) !== c.best
			};
			const draw = c.random();
			if (draw < NOISE_V3) {
				c.chosen = c.cands[Math.floor(c.random() * c.cands.length)];
				c.noise = true;
				return;
			}
			let u = (draw - NOISE_V3) / (1 - NOISE_V3);
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
			const nonBase = (a) => GROUPS.reduce((s, g) => s + c.parts[g][a], 0);
			const alternatives = others.map((a) => [
				a,
				round(c.probs[a]),
				round(gap(c.utility, a)),
				round(gap(c.baseU, a)),
				...GROUPS.map((g) => round(gap(c.parts[g], a)))
			]);
			const pull = (a) => nonBase(a) - nonBase(chosen);
			const pulled = others.slice().sort((a, b) => pull(b) - pull(a))[0];
			const key =
				chosen !== c.baseBest
					? c.baseBest
					: pulled !== undefined && pull(pulled) >= PULL_LINE
						? pulled
						: others.slice().sort((a, b) => c.probs[b] - c.probs[a])[0];
			const held = chosen === c.baseBest && key === pulled && pull(pulled) >= PULL_LINE;
			const margins = c.factors
				.map(({ f, d, sign }) => [f, (d[chosen] ?? 0) - (d[key] ?? 0), sign])
				.filter(([, m]) => m > MIN_MARGIN)
				.sort((a, b) => b[1] - a[1]);
			const reasons = [];
			for (const [f, , sign] of margins) {
				const reason = reasonFor(f, chosen, c, sign);
				if (!reasons.includes(reason)) reasons.push(reason);
			}
			const personal = margins.filter(([f]) => !f.startsWith('base.'));
			let primary;
			if (c.noise) primary = 'noise';
			else if (chosen !== c.baseBest)
				primary = personal.length ? reasonFor(personal[0][0], chosen, c, personal[0][2]) : 'mixing';
			else primary = reasons[0] ?? baseReason(null, chosen, c.sit.seen);
			const resisted = held
				? c.factors
						.filter(({ f }) => !f.startsWith('base.'))
						.map(({ f, d, sign }) => [f, (d[key] ?? 0) - (d[chosen] ?? 0), sign])
						.filter(([, m]) => m > MIN_MARGIN)
						.sort((a, b) => b[1] - a[1])
						.map(([f, , sign]) => reasonFor(f, key, c, sign))
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
					...Object.fromEntries(GROUPS.map((g) => [g, mapValues(c.parts[g])])),
					clarity: round(c.clarity),
					lambda: round(c.lambda),
					baseBest: c.baseBest,
					best: c.best,
					override: c.best !== c.baseBest,
					overridden: round(c.baseU[c.baseBest] - c.baseU[c.best]),
					overriddenEvidence: round(c.evidenceU[c.baseBest] - c.evidenceU[c.best]),
					quirkOverride: c.overrides.quirk,
					stateOverride: c.overrides.state,
					memoryOverride: c.overrides.memory,
					alternatives,
					factors: c.factors.map(({ f, d }) => [f, mapValues(d)]),
					margins: margins.slice(0, 6).map(([f, m]) => [f, round(m)]),
					secondary,
					...(held ? { resisted: [...new Set(resisted)].slice(0, 3) } : {}),
					mood: mapValues(c.m.mood),
					...(c.capped.length ? { capped: c.capped } : {}),
					pressure: c.m.pressure,
					...(c.m.facing ? { facing: c.m.facing.id } : {}),
					...(c.memoryRefs?.length ? { memoryRefs: c.memoryRefs } : {}),
					tau: round(c.tau),
					...(c.strength ? { eq: round(c.strength.single), s: round(c.strength.multi) } : {}),
					...(c.noise ? { noise: true } : {})
				}
			};
		}
	}
];

/**
 * A character policy from this graph and a set of rules: which traits and moods exist, how
 * pressure is counted, and how a mood may amplify the personality. tp-dna@3 is these nodes
 * with V3_RULES and stays exactly as published (golden digest); a later policy supplies its own
 * rules (server/bots/character-v4.mjs) without copying the graph.
 */
export function characterPolicy(id, rules) {
	const graph = defineGraph(id, nodes);
	/** @param mind this bot's mind (./mind.mjs) or null */
	const decide = (view, botId, random, style, mind = null) => {
		const c = runGraph(graph, { view, botId, random, style, mind, rules });
		if (!c.result) return null;
		return { ...c.result, trace: { path: c.path, ...(c.result.trace ?? {}) } };
	};
	return { graph, decide };
}

/** Pressure in tp-dna@3: seen players still in who have bet after looking this hand. */
export const countPressure = (c, hand, alive) =>
	hand.seenBettors.filter((id) => id !== c.botId && alive.has(id)).length;

const V3_RULES = Object.freeze({ traits: TRAITS, moods: MOODS, pressure: countPressure });
const V3 = characterPolicy(CHARACTER_POLICY_V3, V3_RULES);
export const CHARACTER_GRAPH_V3 = V3.graph;
export const decideCharacterV3 = V3.decide;
