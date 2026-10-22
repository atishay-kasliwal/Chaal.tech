/**
 * Phase 5, long-term memory for the characters (docs/archive/bots/PHASE5_REPORT.md): what a character
 * remembers about a returning player, turned into a small prior for its session mind.
 *
 * public observations only (bot_memory: observer-filtered, no cards)
 *   -> a bounded summary per player (rates of folding under pressure, giving up, raising vs calling)
 *   -> confidence (the memory model's own evidence weight: hands, opportunities, 60-day fade)
 *   -> decay (14-day half-life inside the memory model; the session's per-hand decay after seeding)
 *   -> a returning-player prior: at most SEED_CAP pseudo-observations per belief
 *   -> new evidence overrides stale memory (the session's own counts soon outweigh the seed).
 * No live retraining, no hidden cards, no change to DNA or policy: the policy reads the same beliefs.
 * Pure: no database (the room loads documents; the simulator builds summaries from its own nights).
 */
import { estimate, DAY } from './model.mjs';
import { MIND_POLICIES } from '../policies.mjs';

export const LTM_VERSION = 'ltm@1';
/** Most pseudo-observations a prior may add to one belief (a session sees about 30 per night). */
export const SEED_CAP = 10;
const round = (x) => Math.round(x * 1000) / 1000;
const clamp = (x) => Math.min(1, Math.max(0, x));
const decayTo = (from, to) => Math.exp((-Math.LN2 * Math.max(0, to - from)) / (14 * DAY));

/** One counter across several contexts (variants) of the same player, decayed to a common time. */
export function combineCounters(counters, now) {
	const list = counters.filter(Boolean);
	if (!list.length) return null;
	const out = { action: list[0].action, n: 0, k: 0, hands: 0, rn: 0, rk: 0, lastObserved: 0 };
	for (const c of list) {
		const d = decayTo(c.lastObserved, now);
		out.n += c.n;
		out.k += c.k;
		out.hands += c.hands;
		out.rn += c.rn * d;
		out.rk += c.rk * d;
		out.lastObserved = Math.max(out.lastObserved, c.lastObserved);
	}
	// Recent counts are already at `now`; estimate() decays from lastObserved, so undo that step.
	const back = decayTo(out.lastObserved, now);
	if (back > 0) {
		out.rn /= back;
		out.rk /= back;
	}
	return out;
}

/** The rate a summary stands for: the recent one when behaviour has clearly changed, else long-term. */
const rateOf = (e) => (e ? (e.changed ? e.recent : e.longTerm) : null);

/**
 * The prior from rates and confidences (both in [0, 1]), as pseudo-counts for the mind's model:
 * fold to a raise (facing, facingPack), giving up (packs against bets), aggression (raises vs chaals).
 */
export function priorFromRates({ foldToRaise, givesUp, raiseShare }, asOf) {
	const counts = { facing: 0, facingPack: 0, packs: 0, chaals: 0, raises: 0 };
	const weight = {};
	if (foldToRaise) {
		const w = round(SEED_CAP * clamp(foldToRaise.confidence));
		counts.facing = w;
		counts.facingPack = round(w * clamp(foldToRaise.rate));
		weight.foldToRaise = w;
	}
	if (givesUp) {
		const w = round(SEED_CAP * clamp(givesUp.confidence));
		const bets = w * (1 - clamp(givesUp.rate));
		counts.packs = round(w * clamp(givesUp.rate));
		const share = raiseShare ? clamp(raiseShare.rate) : null;
		const r = share === null ? 0.25 : share;
		counts.raises = round(bets * r);
		counts.chaals = round(bets * (1 - r));
		weight.givesUp = w;
	}
	const total = Object.values(counts).reduce((s, v) => s + v, 0);
	return total > 0 ? { v: LTM_VERSION, asOf, counts, weight } : null;
}

/**
 * Teen Patti: one character's memory documents (bot_memory, any Teen Patti variant) about one player,
 * combined across variants, into a prior. Null when the character has never played them.
 */
export function teenPattiPrior(docs, playerId, now) {
	const models = docs
		.filter((d) => d.game === 'teen-patti')
		.map((d) => d.models?.find((m) => m.playerId === playerId))
		.filter(Boolean);
	if (!models.length) return null;
	const get = (key) =>
		estimate(
			combineCounters(
				models.map((m) => m.metrics?.[key]),
				now
			),
			now
		);
	const pressure = get('pressure:fold');
	const fold = get('all:fold');
	const raise = get('all:raise');
	const call = get('all:call');
	const rr = rateOf(raise);
	const rc = rateOf(call);
	return priorFromRates(
		{
			foldToRaise: pressure && { rate: rateOf(pressure), confidence: pressure.confidence },
			givesUp: fold && { rate: rateOf(fold), confidence: fold.confidence },
			raiseShare:
				rr !== null && rc !== null && rr + rc > 0 ? { rate: rr / (rr + rc), confidence: 1 } : null
		},
		now
	);
}

/**
 * The simulator's stand-in for bot_memory (Phase 5 studies only): a prior from one night's session
 * model of a player, with the same rates and the same confidence formula as the memory model
 * (server/bots/memory/model.mjs estimate: hands/60 × opportunities/(opportunities + 80)).
 */
export function priorFromSession(model, asOf = 0) {
	if (!model) return null;
	const conf = (n) => Math.min(model.hands / 60, 1) * (n / (n + 80));
	const bets = model.raises + model.chaals;
	return priorFromRates(
		{
			foldToRaise: model.facing > 0 && {
				rate: model.facingPack / model.facing,
				confidence: conf(model.facing)
			},
			givesUp: model.packs + bets > 0 && {
				rate: model.packs / (model.packs + bets),
				confidence: conf(model.packs + bets)
			},
			raiseShare: bets > 0 && { rate: model.raises / bets, confidence: 1 }
		},
		asOf
	);
}

/**
 * Seed every seated character's mind with priors for the people at the table (a pure step the room
 * runs inside the deal's commit, before the deal records the minds; the simulator runs it too).
 * priors: { [botSeatId]: { [playerId]: prior } }.
 */
export function seedMinds(minds, priors, seedPrior, kindOf) {
	if (!priors) return minds;
	let next = minds;
	for (const [botId, byPlayer] of Object.entries(priors)) {
		if (!next[botId]) continue;
		for (const [playerId, prior] of Object.entries(byPlayer ?? {})) {
			if (!prior || next[botId].others?.[playerId]?.ltm) continue;
			if (next === minds) next = structuredClone(minds);
			seedPrior(next[botId], playerId, kindOf(playerId), prior);
		}
	}
	return next;
}

/** Characters whose minds take a long-term prior: seated published DNA styles that keep a mind. */
export const isMemoryCharacter = (p) =>
	!!p.bot &&
	!p.departed &&
	p.seatNumber !== null &&
	MIND_POLICIES.has(p.bot.style?.policy) &&
	!!p.bot.style?.botId;
const people = (room) => room.players.filter((p) => !p.bot && !p.departed && p.seatNumber !== null);

/** Who sits at a Teen Patti table, for when to reload priors; null when there is nothing to load. */
export function ltmRosterKey(room) {
	if (!room || (room.gameType && room.gameType !== 'teen-patti')) return null;
	const bots = room.players.filter(isMemoryCharacter).map((p) => `${p.id}:${p.bot.style.botId}`);
	const ids = people(room).map((p) => p.id);
	return bots.length && ids.length ? [...bots.sort(), '|', ...ids.sort()].join(',') : null;
}

/** The characters (bot ids in bot_memory) whose memory a table needs. */
export const memoryBotIds = (room) => [
	...new Set(room.players.filter(isMemoryCharacter).map((p) => p.bot.style.botId))
];

/** Priors for a table from the characters' memory documents: { [botSeatId]: { [playerId]: prior } }. */
export function priorsForTable(room, docs, now) {
	const priors = {};
	for (const b of room.players.filter(isMemoryCharacter)) {
		const mine = (docs ?? []).filter((d) => d.botId === b.bot.style.botId);
		if (!mine.length) continue;
		for (const person of people(room)) {
			const prior = teenPattiPrior(mine, person.id, now);
			if (prior) (priors[b.id] ??= {})[person.id] = prior;
		}
	}
	return priors;
}
