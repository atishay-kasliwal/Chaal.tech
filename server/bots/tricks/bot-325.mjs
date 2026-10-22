import { legalPlays, trickWinner, sameCard, cardKey, cardName } from '../../tricks/cards.mjs';
import { CANONICAL_STYLES } from '../dna-styles.mjs';
import { observation325 } from './observation-325.mjs';

/**
 * A 3 2 5 bot = Game Brain + Character Personality + Session Adaptation
 * (docs/archive/games/TRICK_GAMES_PHASE1.md §5). One Rohit: the character's DNA is his canonical Teen Patti
 * DNA (server/bots/dna-styles.mjs), translated into 3 2 5 decisions; nothing here is per character.
 *
 * Decide(observation):
 *  1. Game Brain (no personality): for each legal move, a utility a competent player would give it.
 *     Card play estimates each card's chance of winning the trick by sampling the unseen cards between
 *     the two opponents (consistent with the suits they have shown they lack) and playing the trick
 *     out with a simple opponent model. Target pressure (tricks still needed against tricks left)
 *     sets how much winning now is worth against keeping trumps and high cards for later.
 *  2. Personality: DNA traits push the utilities (risk appetite contests uncertain tricks, patience
 *     keeps trumps, aggression spends high cards early, curiosity probes new suits), capped, and
 *     scaled down when the brain's evidence is clear: strong evidence constrains personality,
 *     ambiguity gives it room (the same bound as Teen Patti, server/bots/character-v3.mjs).
 *  3. Adaptation: what this bot has seen each opponent do this session (how often they ruff when
 *     out of a suit, how often they play to win a trick) changes the opponent model inside the
 *     sampler, gradually: confidence grows with observations and old ones fade.
 * Then a softmax over utilities (temperature by discipline) and one recorded draw.
 */
export const BRAIN_325 = 'tt5@1';
const BETA = 5;
const TAU = 0.35;
const CLARITY = 0.12;
const PERSONA_CAP = 0.35;
/**
 * Personality strength, chosen by simulation (docs/archive/games/325_PHASE2_REPORT.md): at 1x characters were
 * identified blind 43% of the time, at 2x 51%, at 3x 56%; strength against the baseline held at 2x
 * except Virat (whose early aggression costs most), and fell away at 3x. 2x is the middle ground.
 */
export const PERSONA_SCALE = 2;
const SAMPLES = 40;
const PRIOR = { beat: 0.8, ruff: 0.8 };
const NEUTRAL = Object.freeze({
	riskTolerance: 0.5,
	aggression: 0.5,
	patience: 0.5,
	discipline: 0.6,
	curiosity: 0.5,
	adaptability: 0.5
});

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const round3 = (x) => Math.round(x * 1000) / 1000;
/** How much a card is worth keeping: its trick-taking power, trumps most. */
const power = (card, trump) => (card.rank - 7) / 7 + (card.suit === trump ? 0.6 : 0);

/* ------------------------------------------ the brain ------------------------------------------ */

/** Deal the unseen cards to the other two players, respecting counts and known voids. */
function sampleHands(obs, random) {
	const others = obs.order.filter((id) => id !== obs.self);
	for (let attempt = 0; attempt < 12; attempt++) {
		const pool = obs.unseen.slice();
		for (let i = pool.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		const hands = Object.fromEntries(others.map((id) => [id, []]));
		const fits = (id, c) => !obs.voids[id].includes(c.suit);
		let ok = true;
		for (const c of pool) {
			const open = others.filter((id) => hands[id].length < obs.counts[id] && fits(id, c));
			if (!open.length) {
				ok = attempt === 11;
				const any = others.find((id) => hands[id].length < obs.counts[id]);
				if (!any) break;
				hands[any].push(c);
				continue;
			}
			// Weight by space left so hand sizes come out right.
			const total = open.reduce((s, id) => s + obs.counts[id] - hands[id].length, 0);
			let r = random() * total;
			const id = open.find((x) => (r -= obs.counts[x] - hands[x].length) < 0) ?? open.at(-1);
			hands[id].push(c);
		}
		if (ok) return hands;
	}
	return null;
}

/** A simple opponent: wins the trick when it can (cheaply) with probability beat/ruff, else plays low. */
function opponentCard(hand, plays, trump, model, random) {
	const led = plays[0]?.card.suit;
	const legal = legalPlays(hand, led);
	if (!plays.length) return legal.slice().sort((a, b) => b.rank - a.rank)[0];
	const winning = plays[trickWinner(plays, trump)].card;
	const beats = (c) => trickWinner([...plays, { id: 'x', card: c }], trump) === plays.length;
	const winners = legal.filter(beats);
	const following = legal[0].suit === led;
	const p = following ? model.beat : model.ruff;
	if (winners.length && random() < p)
		return winners.sort((a, b) => power(a, trump) - power(b, trump))[0];
	void winning;
	return legal.slice().sort((a, b) => power(a, trump) - power(b, trump))[0];
}

/** Chance that each legal card wins the current trick, over sampled deals. */
function winChances(obs, random, models) {
	const legal = obs.legal.play;
	const wins = legal.map(() => 0);
	let n = 0;
	const plays0 = obs.trick.plays;
	const after = obs.order
		.slice(obs.order.indexOf(obs.self) + 1)
		.concat(obs.order.slice(0, obs.order.indexOf(obs.self)))
		.slice(0, 3 - plays0.length - 1);
	for (let s = 0; s < SAMPLES; s++) {
		const hands = sampleHands(obs, random);
		if (!hands) break;
		n++;
		legal.forEach((card, i) => {
			const plays = [...plays0, { id: obs.self, card }];
			for (const id of after)
				plays.push({ id, card: opponentCard(hands[id], plays, obs.trump, models[id], random) });
			if (plays[trickWinner(plays, obs.trump)].id === obs.self) wins[i]++;
		});
	}
	return legal.map((_, i) => (n ? wins[i] / n : 0.5));
}

/** Target pressure: 1 when every remaining trick is needed, 0 once the quota is made. */
export const pressure325 = (obs) => {
	const need = obs.quotas[obs.self] - (obs.won[obs.self] ?? 0);
	const left = 10 - obs.completed;
	return need <= 0 ? 0 : clamp(need / Math.max(left, 1));
};

function brain(obs, random, models) {
	const trump = obs.trump;
	if (obs.legal.chooseTrump) {
		const cands = obs.suits.map((suit) => ({ suit }));
		const base = obs.suits.map((suit) =>
			obs.hand.reduce(
				(u, c) =>
					u +
					(c.suit === suit
						? 0.5 + (c.rank - 7) / 10
						: c.rank === 14
							? 0.35
							: c.rank === 13
								? 0.12
								: 0),
				0
			)
		);
		return { kind: 'trump', cands, base, info: {} };
	}
	if (obs.legal.pull) {
		// Face down: every position is the same to anyone who cannot see the cards.
		const cands = Array.from({ length: obs.legal.pull }, (_, position) => ({ position }));
		return { kind: 'pull', cands, base: cands.map(() => 0), info: {} };
	}
	if (obs.legal.give.length) {
		const held = (suit) => obs.hand.filter((c) => c.suit === suit).length;
		const trumps = held(trump);
		const cands = obs.legal.give;
		// Give away what you will miss least; emptying a side suit is worth something when you hold trumps.
		const base = cands.map(
			(c) => -power(c, trump) + (c.suit !== trump && held(c.suit) === 1 && trumps > 0 ? 0.25 : 0)
		);
		return { kind: 'give', cands, base, info: {} };
	}
	const cands = obs.legal.play;
	const p = winChances(obs, random, models);
	const chase = pressure325(obs);
	// Winning a trick is +1 point; while short of quota each trick is also worth avoiding pulls next
	// round, so it is valued higher. Spending a strong card costs future tricks.
	const worth = 1 + 0.6 * chase;
	const base = cands.map((c, i) => p[i] * worth - power(c, trump) * (0.32 - 0.12 * chase));
	return { kind: 'play', cands, base, info: { p, chase } };
}

/* ---------------------------------------- personality ---------------------------------------- */

function personality(obs, b, dna) {
	const x = (k) => (dna[k] ?? 0.5) - 0.5;
	const trump = obs.trump;
	if (b.kind === 'trump') {
		const len = (suit) => obs.hand.filter((c) => c.suit === suit).length;
		// Risk appetite backs a long suit over a few high cards.
		return b.cands.map(({ suit }) => 0.12 * x('riskTolerance') * (len(suit) - 2));
	}
	if (b.kind === 'give') return b.cands.map((c) => -0.3 * x('patience') * power(c, trump));
	if (b.kind === 'pull') return b.cands.map(() => 0);
	const leading = !obs.trick.plays.length;
	const ledBefore = new Set(obs.history.map((t) => t.plays[0].card.suit));
	const early = 1 - obs.completed / 10;
	return b.cands.map((c, i) => {
		const p = b.info.p[i];
		let d = 0;
		d += 0.6 * x('riskTolerance') * 4 * p * (1 - p); // contest uncertain tricks
		d += 0.35 * x('aggression') * power(c, trump) * early; // spend strength early
		if (p < 0.9) d -= 0.4 * x('patience') * (c.suit === trump ? 1 : 0.4) * power(c, trump); // keep trumps
		if (leading && !ledBefore.has(c.suit)) d += 0.25 * x('curiosity'); // probe new suits
		return d;
	});
}

/* ---------------------------------------- adaptation ---------------------------------------- */

const confidence = (n) => n / (n + 12);

/** Fold this seat's view into its session memory (completed tricks only; each one once). */
export function observe325(view, selfId, memory) {
	memory.opp ??= {};
	// Tricks already counted, for this deal only (memory stays small across a long session).
	if (memory.handId !== view.handId) {
		memory.handId = view.handId;
		memory.seen = {};
	}
	for (const [i, t] of (view.history ?? []).entries()) {
		const key = `${view.handId}:${i}`;
		if (memory.seen[key]) continue;
		memory.seen[key] = true;
		if (view.round !== memory.round) {
			memory.round = view.round;
			for (const m of Object.values(memory.opp)) for (const k of Object.keys(m)) m[k] *= 0.97;
		}
		const led = t.plays[0].card.suit;
		t.plays.forEach((p, k) => {
			if (p.id === selfId || k === 0) return;
			const m = (memory.opp[p.id] ??= { follow: 0, beat: 0, voidN: 0, ruff: 0 });
			const before = t.plays.slice(0, k);
			const winner = before[trickWinner(before, view.trump)].card;
			const beat = trickWinner([...before, p], view.trump) === k;
			if (p.card.suit === led) {
				// A follow that could have mattered: the card led was beatable in its own suit.
				if (winner.suit === led && winner.rank < 14) {
					m.follow++;
					if (beat) m.beat++;
				}
			} else if (view.trump) {
				m.voidN++;
				if (p.card.suit === view.trump && beat) m.ruff++;
			}
		});
	}
}

/** The opponent model the sampler uses for each opponent: prior, moved by evidence and adaptability. */
export function opponentModels(obs, memory, dna, adaptive) {
	const adapt = adaptive ? (dna.adaptability ?? 0.5) : 0;
	const out = {};
	for (const id of obs.order) {
		if (id === obs.self) continue;
		const m = memory?.opp?.[id];
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

export function decide325(
	view,
	random,
	{ dna = NEUTRAL, memory = {}, adaptive = true, personaScale = PERSONA_SCALE } = {}
) {
	const obs = observation325(view);
	const models = opponentModels(obs, memory, dna, adaptive);
	const b = brain(obs, random, models);
	// personaScale (evaluation only) turns personality up or down, cap included.
	const persona = personality(obs, b, dna).map((d) => d * personaScale);
	const cap = PERSONA_CAP * personaScale;
	// Cap personality, then bound it by how clear the brain's choice is.
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
	const bestBase = b.base.indexOf(sorted[0]);
	const cand = b.cands[chosen];
	const action = { trump: 'chooseTrump', pull: 'pull', give: 'give', play: 'play' }[b.kind];
	const payload =
		b.kind === 'trump'
			? { suit: cand.suit }
			: b.kind === 'pull'
				? { position: cand.position }
				: { card: { rank: cand.rank, suit: cand.suit } };
	const label = (c) => (c.suit && c.rank ? cardName(c) : (c.suit ?? `#${c.position}`));
	return {
		action,
		payload,
		reason: chosen === bestBase ? `${b.kind}-best` : `${b.kind}-character`,
		trace: {
			brain: BRAIN_325,
			kind: b.kind,
			cands: b.cands.map(label),
			base: b.base.map(round3),
			persona: capped.map(round3),
			probs: probs.map(round3),
			clarity: round3(clarity),
			lambda: round3(lambda),
			...(b.info.p ? { pWin: b.info.p.map(round3), chase: round3(b.info.chase) } : {}),
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
export function bot325(
	characterId,
	{ personality: persona = true, adaptive = true, personaScale = PERSONA_SCALE } = {}
) {
	const dna =
		characterId && persona ? (CANONICAL_STYLES[characterId]?.tendencies.dna ?? NEUTRAL) : NEUTRAL;
	const decide = (view, selfId, random, memory) =>
		decide325(view, random, { dna, memory, adaptive, personaScale });
	decide.observe = (view, selfId, memory) => observe325(view, selfId, memory);
	decide.characterId = characterId ?? null;
	return decide;
}

export { sameCard, cardKey };
