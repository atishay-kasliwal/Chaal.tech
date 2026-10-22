import { legalPlays, trickWinner, cardName } from '../../tricks/cards.mjs';
import { CANONICAL_STYLES } from '../dna-styles.mjs';
import { observationPakad, rememberPakad } from './observation-pakad.mjs';

/**
 * A 10 Pakad bot = Game Brain + Character Personality + Session Adaptation
 * (docs/games/10PAKAD_PLAN.md §7-8). One Rohit: the character's DNA is his canonical DNA
 * (server/bots/dna-styles.mjs); identity carries across games, strategy does not. Nothing here is
 * per character, and nothing is borrowed from Teen Patti or 3 2 5 except the shared trick core.
 *
 * Decide(observation):
 *  1. Game Brain (no personality). In 10 Pakad tricks are not worth the same: a trick's cards go to
 *     the centre, and only the second trick in a row by the same player collects the pile, tens and
 *     all (the 13th trick takes what is left). For each legal card the brain samples the hidden hands
 *     (consistent with the suits each player has shown they lack), plays the trick out with a simple
 *     partner-aware opponent model, and values the result: a collection is worth the pile's tens to
 *     the team that takes it, a win that starts a streak is worth part of that (the pile is at risk on
 *     the next trick), and spending a strong card costs later tricks. In the opening tricks a player
 *     who cannot follow sets trump with the card they play, so that card is also a trump choice: the
 *     brain prefers a suit it is long and strong in.
 *  2. Personality: DNA traits push the utilities (risk appetite contests uncertain tricks, aggression
 *     spends strength on a rich pile, patience keeps trumps, ego backs one's own streak, sociality
 *     feeds tens to a partner who is winning, curiosity leads new suits), capped, and scaled down when
 *     the brain's evidence is clear (the same bound as Teen Patti and 3 2 5).
 *  3. Adaptation: how often each opponent beats a trick when following and trumps when void, from
 *     what this seat saw this session, moves the opponent model inside the sampler.
 * Then a softmax over utilities (temperature by discipline) and one recorded draw.
 */
export const BRAIN_PAKAD = 'pakad@1';
const BETA = 5;
const TAU = 0.35;
const CLARITY = 0.12;
const PERSONA_CAP = 0.35;
/** Personality strength, as 3 2 5 (docs/games/325_PHASE2_REPORT.md); checked by 10 Pakad's evaluation. */
export const PERSONA_SCALE = 2;
const SAMPLES = 32;
const TRICKS = 13;
const PRIOR = { beat: 0.8, ruff: 0.8 };
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
/** How much a card is worth keeping: its trick-taking power, trumps most; a ten is also a prize. */
const power = (card, trump) => (card.rank - 2) / 12 + (trump && card.suit === trump ? 0.6 : 0);

/* ------------------------------------------ the brain ------------------------------------------ */

/**
 * Deal the unseen cards to the other three players by their card counts, respecting known voids. In
 * the opening tricks some unseen cards are not dealt yet: each card stays undealt in proportion to the
 * undealt places left, otherwise it goes to a hand that can hold it, in proportion to its space.
 */
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
				// No hand can hold it: the voids conflict with this shuffle; place it anyway on the last try.
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

/** A simple player: never overtakes a winning partner; otherwise wins cheaply with probability beat/ruff. */
function opponentCard(obs, id, hand, plays, trump, model, random) {
	const legal = legalPlays(hand, plays[0]?.card.suit);
	if (!legal.length) return null;
	const low = () => legal.slice().sort((a, b) => power(a, trump) - power(b, trump))[0];
	if (!plays.length) return legal.slice().sort((a, b) => b.rank - a.rank)[0];
	const winner = plays[trickWinner(plays, trump)];
	if (obs.teams[winner.id] === obs.teams[id]) {
		const ten = legal.find((c) => c.rank === 10 && c.suit !== trump);
		return ten && random() < 0.5 ? ten : low();
	}
	const beats = (c) => trickWinner([...plays, { id, card: c }], trump) === plays.length;
	const winners = legal.filter(beats);
	const p = legal[0].suit === plays[0].card.suit ? model.beat : model.ruff;
	if (winners.length && random() < p)
		return winners.sort((a, b) => power(a, trump) - power(b, trump))[0];
	return low();
}

/** Value of a finished trick for this seat's team: collections, streaks and the tens at stake. */
function trickValue(obs, plays, trump) {
	const w = plays[trickWinner(plays, trump)].id;
	const tens = obs.centre.tens + plays.filter((p) => p.card.rank === 10).length;
	const stake = tens + 0.03 * (obs.centre.count + plays.length);
	const last = obs.completed + 1 === TRICKS;
	const collects = last || (obs.streak?.id === w && obs.streak.wins === 1);
	const sign = obs.teams[w] === obs.team ? 1 : -1;
	return { w, v: sign * (collects ? stake : 0.4 * stake), ours: sign > 0 };
}

/** Each legal card's expected trick value and chance that this team wins the trick. */
function rollouts(obs, random, models) {
	const legal = obs.legal.play;
	const value = legal.map(() => 0);
	const ours = legal.map(() => 0);
	const self = legal.map(() => 0);
	const plays0 = obs.trick.plays;
	const at = obs.order.indexOf(obs.self);
	const after = obs.order
		.slice(at + 1)
		.concat(obs.order.slice(0, at))
		.slice(0, 4 - plays0.length - 1);
	let n = 0;
	for (let s = 0; s < SAMPLES; s++) {
		const hands = sampleHands(obs, random);
		if (!hands) break;
		n++;
		legal.forEach((card, i) => {
			// Off suit before trump is known sets trump with this very card.
			const led = plays0[0]?.card.suit;
			const trump = obs.trump ?? (led && card.suit !== led ? card.suit : null);
			const plays = [...plays0, { id: obs.self, card }];
			let t = trump;
			for (const id of after) {
				const c = opponentCard(obs, id, hands[id], plays, t, models[id], random);
				if (!c) continue;
				if (!t && c.suit !== plays[0].card.suit) t = c.suit;
				plays.push({ id, card: c });
			}
			const r = trickValue(obs, plays, t);
			value[i] += r.v;
			ours[i] += r.ours ? 1 : 0;
			self[i] += r.w === obs.self ? 1 : 0;
		});
	}
	const avg = (xs) => xs.map((x) => (n ? x / n : 0));
	return { value: avg(value), p: n ? avg(ours) : legal.map(() => 0.5), pSelf: avg(self) };
}

/** How good a suit would be as trump for this hand (in the opening tricks, before the rest is dealt). */
const trumpFit = (obs, suit, played) =>
	obs.hand
		.filter((c) => c.suit === suit && !(c.rank === played.rank && c.suit === played.suit))
		.reduce((u, c) => u + 0.5 + (c.rank - 2) / 24, 0);

function brain(obs, random, models) {
	const cands = obs.legal.play;
	const { value, p, pSelf } = rollouts(obs, random, models);
	const led = obs.trick.plays[0]?.card.suit;
	const left = TRICKS - obs.completed;
	const base = cands.map((c, i) => {
		let u = value[i] - power(c, obs.trump) * 0.18 * (left / TRICKS);
		if (!obs.trump && led && c.suit !== led) u += 0.25 * trumpFit(obs, c.suit, c);
		return u;
	});
	return { cands, base, info: { p, pSelf, value } };
}

/* ---------------------------------------- personality ---------------------------------------- */

function personality(obs, b, dna) {
	const x = (k) => (dna[k] ?? 0.5) - 0.5;
	const trump = obs.trump;
	const leading = !obs.trick.plays.length;
	const ledBefore = new Set(obs.remembered.map((t) => t.plays[0].card.suit));
	const early = 1 - obs.completed / TRICKS;
	const rich = obs.centre.tens > 0 || (obs.streak && obs.teams[obs.streak.id] !== obs.team);
	const plays = obs.trick.plays;
	const partnerWinning = plays.length > 0 && plays[trickWinner(plays, trump)].id === obs.partner;
	return b.cands.map((c, i) => {
		const p = b.info.p[i];
		let d = 0;
		d += 0.6 * x('riskTolerance') * 4 * p * (1 - p); // contest uncertain tricks
		if (rich) d += 0.4 * x('aggression') * power(c, trump) * early; // spend strength on a rich pile
		if (p < 0.9) d -= 0.4 * x('patience') * (trump && c.suit === trump ? 1 : 0.4) * power(c, trump); // keep trumps
		if (obs.streak?.id === obs.self) d += 0.5 * x('ego') * b.info.pSelf[i]; // back one's own streak
		if (partnerWinning && c.rank === 10) d += 0.5 * x('sociality') * p; // feed a winning partner
		if (leading && !ledBefore.has(c.suit)) d += 0.25 * x('curiosity'); // probe new suits
		return d;
	});
}

/* ---------------------------------------- adaptation ---------------------------------------- */

const confidence = (n) => n / (n + 12);

/** Session memory: this hand's tricks (for the observation) and each opponent's habits. */
export function observePakad(view, selfId, memory) {
	const before = memory.tricks?.length ?? 0;
	const sameHand = memory.handId === view.handId;
	rememberPakad(view, selfId, memory);
	memory.opp ??= {};
	const fresh = sameHand ? memory.tricks.slice(before) : memory.tricks;
	for (const t of fresh) {
		const led = t.plays[0].card.suit;
		t.plays.forEach((p, k) => {
			if (p.id === selfId || k === 0 || view.teams?.[p.id] === view.teams?.[selfId]) return;
			const m = (memory.opp[p.id] ??= { follow: 0, beat: 0, voidN: 0, ruff: 0 });
			const prior = t.plays.slice(0, k);
			const beat = trickWinner([...prior, p], t.trump) === k;
			if (p.card.suit === led) {
				m.follow++;
				if (beat) m.beat++;
			} else if (t.trump) {
				m.voidN++;
				if (p.card.suit === t.trump && beat) m.ruff++;
			}
		});
	}
	if (memory.handSeen !== view.handId) {
		memory.handSeen = view.handId;
		for (const m of Object.values(memory.opp)) for (const k of Object.keys(m)) m[k] *= 0.97;
	}
	return memory;
}

/** The opponent model the sampler uses: prior, moved by evidence and adaptability. */
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

export function decidePakad(
	view,
	random,
	{ dna = NEUTRAL, memory = {}, adaptive = true, personaScale = PERSONA_SCALE } = {}
) {
	// The memory is this seat's own; bring it up to the current view without changing the caller's.
	const mind = observePakad(view, view.selfId, structuredClone(memory ?? {}));
	const obs = observationPakad(view, mind);
	const models = opponentModels(obs, mind, dna, adaptive);
	const b = brain(obs, random, models);
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
	const card = b.cands[chosen];
	return {
		action: 'play',
		payload: { card: { rank: card.rank, suit: card.suit } },
		reason: chosen === b.base.indexOf(sorted[0]) ? 'play-best' : 'play-character',
		trace: {
			brain: BRAIN_PAKAD,
			kind: 'play',
			cands: b.cands.map(cardName),
			base: b.base.map(round3),
			persona: capped.map(round3),
			probs: probs.map(round3),
			clarity: round3(clarity),
			lambda: round3(lambda),
			pTeam: b.info.p.map(round3),
			models: Object.fromEntries(
				Object.entries(models).map(([id, m]) => [
					id,
					{ beat: round3(m.beat), ruff: round3(m.ruff), n: m.n }
				])
			)
		}
	};
}

/**
 * A seat decider for the table runner and the room: a character (canonical DNA) or the neutral
 * baseline, with or without personality and adaptation (for evaluation).
 */
export function botPakad(
	characterId,
	{ personality: persona = true, adaptive = true, personaScale = PERSONA_SCALE } = {}
) {
	const dna =
		characterId && persona ? (CANONICAL_STYLES[characterId]?.tendencies.dna ?? NEUTRAL) : NEUTRAL;
	const decide = (view, selfId, random, memory) =>
		decidePakad(view, random, { dna, memory, adaptive, personaScale });
	decide.observe = (view, selfId, memory) => observePakad(view, selfId, memory);
	decide.characterId = characterId ?? null;
	return decide;
}
