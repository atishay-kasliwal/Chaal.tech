import { legalPlays, trickWinner, cardName } from '../../tricks/cards.mjs';
import { CANONICAL_STYLES } from '../dna-styles.mjs';
import { observation29, remember29 } from './observation-29.mjs';

/**
 * A 29 bot = Game Brain + Character Personality + Session Adaptation, as the other trick games
 * (docs/games/29_REPORT.md). One Rohit: canonical DNA; 29's strategy is its own.
 *
 *  1. Game Brain (no personality).
 *     - Bid: how many points the partnership can expect from four cards, through the best trump suit
 *       (its length and its J and 9), the point cards held, and partner support; bid the next value
 *       while it is within that estimate, else pass.
 *     - Trump: the suit with the most length and the highest cards; the card set face down is its
 *       weakest card, so the J and 9 stay in hand.
 *     - Ask for trump when unable to follow (the rule), and always declare a Pair.
 *     - Play: samples the hidden hands (counts, shown voids, and the bidder's face-down card), plays the
 *       trick out with a partner-aware opponent model, and values the points the trick moves between
 *       the teams, weighted by what each side still needs for the target, less the cost of spending a
 *       strong card.
 *  2. Personality: DNA traits push the utilities (risk appetite and ego raise bids, discipline lowers
 *     them; risk contests uncertain tricks; aggression spends strength early; patience keeps trumps
 *     and point cards; sociality feeds points to a winning partner; curiosity leads new suits), capped
 *     and bounded by how clear the brain's choice is.
 *  3. Adaptation: each opponent's beat and trump rates, and how often the other team makes its bids
 *     (an opponent side that overbids is let through more often).
 */
export const BRAIN_29 = 'g29@1';
const BETA = 5;
const TAU = 0.35;
const CLARITY = 0.12;
const PERSONA_CAP = 0.35;
export const PERSONA_SCALE = 2;
const SAMPLES = 32;
const TRICKS = 8;
const PRIOR = { beat: 0.8, ruff: 0.8 };
const STRENGTH = { 11: 8, 9: 7, 14: 6, 10: 5, 13: 4, 12: 3, 8: 2, 7: 1 };
const POINTS = { 11: 3, 9: 2, 14: 1, 10: 1 };
const NEUTRAL = Object.freeze({
	riskTolerance: 0.5,
	aggression: 0.5,
	patience: 0.5,
	discipline: 0.6,
	curiosity: 0.5,
	adaptability: 0.5,
	ego: 0.5,
	sociality: 0.5
});

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const round3 = (x) => Math.round(x * 1000) / 1000;
const strength = (c) => STRENGTH[c.rank] ?? 0;
const pts = (c) => POINTS[c.rank] ?? 0;
const power = (c, trump) => strength(c) / 8 + (trump && c.suit === trump ? 0.6 : 0);
const winner = (plays, trump) => trickWinner(plays, trump, strength);

/* ------------------------------------------ the brain ------------------------------------------ */

/** How good a suit is as trump: length, and the J, 9 and A in it. */
const suitScore = (hand, suit) =>
	hand
		.filter((c) => c.suit === suit)
		.reduce(
			(u, c) => u + 1 + (c.rank === 11 ? 1.5 : c.rank === 9 ? 1 : c.rank === 14 ? 0.4 : 0),
			0
		);

/** Expected partnership points from four cards: a heuristic, its offset calibrated by simulation
 * (docs/games/29_REPORT.md: the offset that wins most hands against the greedy and random players). */
export function bidEstimate(obs) {
	const best = Math.max(...obs.suits.map((s) => suitScore(obs.hand, s)));
	const held = obs.hand.reduce((s, c) => s + pts(c), 0);
	const partnerBid = obs.bids.some((b) => b.id === obs.partner && b.bid);
	return Math.min(28, 5 + 1.2 * held + 1.6 * best + (partnerBid ? 1.5 : 0));
}

function sampleHands(obs, random) {
	const others = obs.order.filter((id) => id !== obs.self);
	const slots = others.reduce((s, id) => s + obs.counts[id], 0);
	for (let attempt = 0; attempt < 12; attempt++) {
		const pool = obs.unseen.slice();
		for (let i = pool.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		const hands = Object.fromEntries(others.map((id) => [id, []]));
		const space = (id) => obs.counts[id] - hands[id].length;
		let undealt = Math.max(0, pool.length - slots);
		let ok = true;
		for (const c of pool) {
			const open = others.filter((id) => space(id) > 0 && !obs.voids[id]?.includes(c.suit));
			const room = open.reduce((s, id) => s + space(id), 0);
			if (random() * (room + undealt) < undealt) {
				undealt--;
				continue;
			}
			if (!open.length) {
				ok = false;
				const any = others.find((id) => space(id) > 0);
				if (any) hands[any].push(c);
				continue;
			}
			let r = random() * room;
			const id = open.find((x) => (r -= space(x)) < 0) ?? open.at(-1);
			hands[id].push(c);
		}
		if ((ok || attempt === 11) && others.every((id) => space(id) === 0)) return hands;
	}
	return null;
}

function opponentCard(obs, id, hand, plays, trump, model, random) {
	const legal = legalPlays(hand, plays[0]?.card.suit);
	if (!legal.length) return null;
	const cheap = (a, b) => pts(a) - pts(b) || power(a, trump) - power(b, trump);
	if (!plays.length) return legal.slice().sort((a, b) => strength(b) - strength(a))[0];
	const w = plays[winner(plays, trump)];
	if (obs.teams[w.id] === obs.teams[id]) {
		const gift = legal.filter((c) => pts(c) && c.suit !== trump).sort((a, b) => pts(b) - pts(a))[0];
		return gift && random() < 0.5 ? gift : legal.slice().sort(cheap)[0];
	}
	const beats = (c) => winner([...plays, { id, card: c }], trump) === plays.length;
	const winners = legal.filter(beats);
	const p = legal[0].suit === plays[0].card.suit ? model.beat : model.ruff;
	if (winners.length && random() < p)
		return winners.sort((a, b) => power(a, trump) - power(b, trump))[0];
	return legal.slice().sort(cheap)[0];
}

/** Trick points for this seat's team, weighted by what each side still needs (bidders vs defenders). */
function trickWorth(obs, plays, trump) {
	const w = plays[winner(plays, trump)].id;
	const p = plays.reduce((s, x) => s + pts(x.card), 0);
	const ours = obs.teams[w] === obs.team;
	const bidding = obs.team === obs.bidTeam;
	const need = bidding ? obs.target - obs.points[obs.team] : 29 - obs.target - obs.points[obs.team];
	const urgency = 1 + 0.4 * clamp(need / Math.max(1, 28 - obs.points[0] - obs.points[1]));
	return { v: (ours ? 1 : -1) * (p + 0.4) * urgency, ours };
}

function rollouts(obs, random, models) {
	const legal = obs.legal.play;
	const value = legal.map(() => 0);
	const ours = legal.map(() => 0);
	const plays0 = obs.trick.plays;
	const at = obs.order.indexOf(obs.self);
	const after = obs.order
		.slice(at + 1)
		.concat(obs.order.slice(0, at))
		.slice(0, 4 - plays0.length - 1);
	// Trump counts only once revealed; the bidder knows a reveal later in this trick would make it count.
	const known = obs.revealed ? obs.trump : null;
	let n = 0;
	for (let s = 0; s < SAMPLES; s++) {
		const hands = sampleHands(obs, random);
		if (!hands) break;
		n++;
		legal.forEach((card, i) => {
			const plays = [...plays0, { id: obs.self, card }];
			let t = known;
			for (const id of after) {
				const hand = hands[id];
				const led = plays[0].card.suit;
				if (!t && obs.trump && !hand.some((c) => c.suit === led)) t = obs.trump;
				const c = opponentCard(obs, id, hand, plays, t, models[id], random);
				if (c) plays.push({ id, card: c });
			}
			const r = trickWorth(obs, plays, t);
			value[i] += r.v;
			ours[i] += r.ours ? 1 : 0;
		});
	}
	const avg = (xs) => xs.map((x) => (n ? x / n : 0));
	return { value: avg(value), p: n ? avg(ours) : legal.map(() => 0.5) };
}

function brain(obs, random, models, memory, dna, adaptive) {
	if (obs.legal.reveal) return { kind: 'reveal', cands: [{}], base: [0], info: {} };
	if (obs.legal.pair) return { kind: 'pair', cands: [{}], base: [0], info: {} };
	if (obs.legal.pass) {
		const est = bidEstimate(obs);
		const floor = obs.legal.bid[0];
		const cands = [{ pass: true }, ...(floor !== undefined ? [{ value: floor }] : [])];
		// Opponents who keep failing their bids are better let through (adaptation).
		const opp = memory?.bidRecord?.[1 - obs.team];
		const fails = opp ? opp.failed / Math.max(1, opp.made + opp.failed) : 0.5;
		const adapt = adaptive ? (dna.adaptability ?? 0.5) : 0;
		const conf = opp ? (opp.made + opp.failed) / (opp.made + opp.failed + 6) : 0;
		const letThrough =
			obs.high && obs.teams[obs.high.id] !== obs.team ? 0.4 * adapt * conf * (fails - 0.5) : 0;
		const base = cands.map((c) => (c.pass ? letThrough : (est - c.value) / 4));
		return { kind: 'bid', cands, base, info: { est } };
	}
	if (obs.legal.chooseTrump.length) {
		const cands = obs.legal.chooseTrump;
		const base = cands.map((c) => suitScore(obs.hand, c.suit) / 2 - strength(c) * 0.06);
		return { kind: 'trump', cands, base, info: {} };
	}
	const cands = obs.legal.play;
	const { value, p } = rollouts(obs, random, models);
	const trump = obs.revealed ? obs.trump : null;
	const left = TRICKS - obs.completed;
	const base = cands.map(
		(c, i) => value[i] - (power(c, trump) * 0.6 + pts(c) * 0.15) * (left / TRICKS)
	);
	return { kind: 'play', cands, base, info: { p } };
}

/* ---------------------------------------- personality ---------------------------------------- */

function personality(obs, b, dna) {
	const x = (k) => (dna[k] ?? 0.5) - 0.5;
	if (b.kind === 'bid')
		return b.cands.map((c) =>
			c.pass
				? 0
				: 0.5 * (x('riskTolerance') + x('ego') + 0.5 * x('aggression')) - 0.4 * x('discipline')
		);
	if (b.kind !== 'play') return b.cands.map(() => 0);
	const trump = obs.revealed ? obs.trump : null;
	const plays = obs.trick.plays;
	const leading = !plays.length;
	const ledBefore = new Set(obs.remembered.map((t) => t.plays[0].card.suit));
	const early = 1 - obs.completed / TRICKS;
	const partnerWinning = plays.length > 0 && plays[winner(plays, trump)].id === obs.partner;
	return b.cands.map((c, i) => {
		const p = b.info.p[i];
		let d = 0;
		d += 0.6 * x('riskTolerance') * 4 * p * (1 - p);
		d += 0.35 * x('aggression') * power(c, trump) * early;
		if (p < 0.9) d -= 0.4 * x('patience') * (power(c, trump) + 0.3 * pts(c));
		if (partnerWinning && pts(c)) d += 0.4 * x('sociality') * p;
		if (leading && !ledBefore.has(c.suit)) d += 0.25 * x('curiosity');
		if (obs.team === obs.bidTeam && obs.self === obs.bidderId) d += 0.3 * x('ego') * p;
		return d;
	});
}

/* ---------------------------------------- adaptation ---------------------------------------- */

const confidence = (n) => n / (n + 12);

export function observe29(view, selfId, memory) {
	const before = memory.tricks?.length ?? 0;
	const sameHand = memory.handId === view.handId;
	remember29(view, memory);
	memory.opp ??= {};
	memory.bidRecord ??= [
		{ made: 0, failed: 0 },
		{ made: 0, failed: 0 }
	];
	const fresh = sameHand ? memory.tricks.slice(before) : memory.tricks;
	for (const t of fresh) {
		const led = t.plays[0].card.suit;
		t.plays.forEach((p, k) => {
			if (p.id === selfId || k === 0 || view.teams?.[p.id] === view.teams?.[selfId]) return;
			const m = (memory.opp[p.id] ??= { follow: 0, beat: 0, voidN: 0, ruff: 0 });
			const beat = winner([...t.plays.slice(0, k), p], t.trump) === k;
			if (p.card.suit === led) {
				m.follow++;
				if (beat) m.beat++;
			} else if (t.trump) {
				m.voidN++;
				if (p.card.suit === t.trump && beat) m.ruff++;
			}
		});
	}
	const r = view.result;
	if (r?.handId && r.made !== null && r.made !== undefined && memory.scored !== r.handId) {
		memory.scored = r.handId;
		memory.bidRecord[r.bidTeam][r.made ? 'made' : 'failed']++;
	}
	return memory;
}

export function opponentModels(obs, memory, dna, adaptive) {
	const adapt = adaptive ? (dna.adaptability ?? 0.5) : 0;
	const out = {};
	for (const id of obs.order) {
		if (id === obs.self) continue;
		const m = obs.teams[id] === obs.team ? null : memory?.opp?.[id];
		const rate = (hits, n, prior) => (n ? hits / n : prior);
		const move = (prior, hits, n) =>
			clamp(prior + 2 * adapt * confidence(n) * (rate(hits, n, prior) - prior), 0.05, 0.98);
		out[id] = {
			beat: m ? move(PRIOR.beat, m.beat, m.follow) : PRIOR.beat,
			ruff: m ? move(PRIOR.ruff, m.ruff, m.voidN) : PRIOR.ruff,
			n: m ? Math.round(m.follow + m.voidN) : 0
		};
	}
	return out;
}

/* ------------------------------------------ decide ------------------------------------------ */

export function decide29(
	view,
	random,
	{ dna = NEUTRAL, memory = {}, adaptive = true, personaScale = PERSONA_SCALE } = {}
) {
	const mind = observe29(view, view.selfId, structuredClone(memory ?? {}));
	const obs = observation29(view, mind);
	const models = opponentModels(obs, mind, dna, adaptive);
	const b = brain(obs, random, models, mind, dna, adaptive);
	const persona = personality(obs, b, dna).map((d) => d * personaScale);
	const cap = PERSONA_CAP * personaScale;
	const worst = Math.max(...persona.map(Math.abs), 1e-9);
	const capped = worst > cap ? persona.map((d) => (d * cap) / worst) : persona;
	const sorted = b.base.slice().sort((a, c) => c - a);
	const clarity = sorted.length > 1 ? sorted[0] - sorted[1] : 1;
	const discipline = dna.discipline ?? 0.5;
	const reach = CLARITY * (0.6 + 0.8 * (1 - discipline));
	const lambda = 1 / (1 + (clarity / reach) ** 2);
	const utility = b.base.map((u, i) => u + lambda * capped[i]);
	const tau = TAU * (1.4 - discipline);
	const top = Math.max(...utility);
	const w = utility.map((u) => Math.exp((BETA * (u - top)) / tau));
	const total = w.reduce((s, v) => s + v, 0);
	const probs = w.map((v) => v / total);
	let r = random();
	let chosen = probs.length - 1;
	for (let i = 0; i < probs.length; i++)
		if ((r -= probs[i]) < 0) {
			chosen = i;
			break;
		}
	const cand = b.cands[chosen];
	let action;
	let payload;
	if (b.kind === 'bid') {
		action = cand.pass ? 'pass' : 'bid';
		payload = cand.pass ? {} : { value: cand.value };
	} else if (b.kind === 'trump') {
		action = 'chooseTrump';
		payload = { card: { rank: cand.rank, suit: cand.suit } };
	} else if (b.kind === 'reveal' || b.kind === 'pair') {
		action = b.kind;
		payload = {};
	} else {
		action = 'play';
		payload = { card: { rank: cand.rank, suit: cand.suit } };
	}
	const label = (c) =>
		c.pass ? 'pass' : c.value ? String(c.value) : c.rank ? cardName(c) : b.kind;
	return {
		action,
		payload,
		reason: chosen === b.base.indexOf(sorted[0]) ? `${b.kind}-best` : `${b.kind}-character`,
		trace: {
			brain: BRAIN_29,
			kind: b.kind,
			cands: b.cands.map(label),
			base: b.base.map(round3),
			persona: capped.map(round3),
			probs: probs.map(round3),
			clarity: round3(clarity),
			lambda: round3(lambda),
			...(b.info.est !== undefined ? { estimate: round3(b.info.est) } : {}),
			...(b.info.p ? { pTeam: b.info.p.map(round3) } : {})
		}
	};
}

export function bot29(
	characterId,
	{ personality: persona = true, adaptive = true, personaScale = PERSONA_SCALE } = {}
) {
	const dna =
		characterId && persona ? (CANONICAL_STYLES[characterId]?.tendencies.dna ?? NEUTRAL) : NEUTRAL;
	const decide = (view, selfId, random, memory) =>
		decide29(view, random, { dna, memory, adaptive, personaScale });
	decide.observe = (view, selfId, memory) => observe29(view, selfId, memory);
	decide.characterId = characterId ?? null;
	return decide;
}
