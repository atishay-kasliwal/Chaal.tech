import { getVariant } from '../variants/index.mjs';
import { compare } from './strategy.mjs';
import { OBSERVATION_VERSION } from './observe.mjs';

/**
 * A bot's mind, mind@1 (docs/BOT_BRAIN.md §5.2, §7, §9, §11): session state built only from its
 * own observations (./observe.mjs). Pure functions over plain JSON, so a mind can be stored in the
 * room's durable storage, snapshotted into a hand capture, and folded again during replay.
 *
 *  - mood: confidence, frustration, fear, suspicion, excitement in [0, 1]. Events push them;
 *    every hand they drift back toward baseline at a rate set by the style's moodRecovery.
 *  - self: tonight's results (in boots), streak, bluffs tried / got through / caught.
 *  - others: per player seen at the table (human or bot, keyed by table id and tagged with its
 *    kind, so persistent bot-to-bot memory can be enabled later without a new schema): an
 *    opponent model (counts only), a relationship (rivalry, annoyance, respect, fear) and recent
 *    history with this bot.
 *  - hand: this hand only: who raised, when, whether this bot raised or packed.
 *
 * Everything is bounded: fixed fields, at most MAX_OTHERS players, counts capped by decay.
 * How a style reacts is data (its DNA feeling and social traits), never a branch on who it is.
 */
export const MIND_VERSION = 'mind@1';
/**
 * Appraisal rules by version. mind@1 (tp-dna@3) is frozen. mind@2 (tp-dna@4, Phase 3):
 * - opponent models forget faster for adaptable styles, so they follow a player who changes gear;
 * - being bluffed off a pot makes a suspicious style more suspicious (a calling station's trigger).
 * mind@3 (tp-dna@5, Phase 3.1): mind@2, plus each cue records the hand number it happened in.
 */
export const MIND_VERSIONS = Object.freeze({ 1: 'mind@1', 2: 'mind@2', 3: 'mind@3', 4: 'mind@4' });
/**
 * What each version adds, so a later version can take some features and not others.
 * mind@4 (tp-dna@6, Phase 4 challengers only): mind@1, plus the hand number on each cue, plus for
 * each opponent the hand this bot last caught them bluffing and the hand they last bluffed it off a
 * pot (opponent-specific event memory).
 */
const MIND_FEATURES = Object.freeze({
	1: { adaptiveDecay: false, bluffedSuspicion: false, stamp: false, eventHands: false },
	2: { adaptiveDecay: true, bluffedSuspicion: true, stamp: false, eventHands: false },
	3: { adaptiveDecay: true, bluffedSuspicion: true, stamp: true, eventHands: false },
	4: { adaptiveDecay: false, bluffedSuspicion: false, stamp: true, eventHands: true }
});
const MAX_OTHERS = 8;
/** A result is big when it moves at least this many boots and this share of the starting stack. */
export const BIG_POT = 6;
export const BIG_SHARE = 0.2;
/** Old observations fade so a model follows a player who changes gear (and counts stay bounded). */
const MODEL_DECAY = 0.985;

export const MOOD_BASELINE = Object.freeze({
	confidence: 0.5,
	frustration: 0.1,
	fear: 0.2,
	suspicion: 0.3,
	excitement: 0.2
});

const clamp = (x) => Math.min(1, Math.max(0, x));
const round = (x) => Math.round(x * 10000) / 10000;

/**
 * Tonight's form: everyone arrives in a slightly different mood. Drawn once, at the first hand this
 * bot sees, from a hash of its seat and that hand's id (public, unique per session, so the same
 * mind is rebuilt in replay). Moods drift back to baseline plus form, not to baseline alone. The
 * disciplined vary less from night to night.
 */
export function nightForm(key, discipline = 0.5) {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
	const next = () => {
		h = (h + 0x6d2b79f5) | 0;
		let t = Math.imul(h ^ (h >>> 15), 1 | h);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const amp = 0.25 * (1.2 - discipline);
	return Object.fromEntries(
		Object.keys(MOOD_BASELINE).map((k) => [k, round(amp * (2 * next() - 1))])
	);
}
const restingMood = (mind) =>
	Object.fromEntries(
		Object.entries(MOOD_BASELINE).map(([k, v]) => [k, clamp(v + (mind.form?.[k] ?? 0))])
	);

const emptyModel = () => ({
	hands: 0,
	blindBets: 0,
	sees: 0,
	seeAt: 0,
	chaals: 0,
	raises: 0,
	packs: 0,
	facing: 0,
	facingPack: 0,
	showdowns: 0,
	raiseShown: 0,
	weakShown: 0,
	wins: 0,
	aggr: 0.25
});
const emptySubject = (kind) => ({
	kind,
	model: emptyModel(),
	rel: { rivalry: 0, annoyance: 0, respect: 0.3, fear: 0 },
	recent: { beatMe: 99, caughtBluffing: 0, bluffedMe: 0, wonOf5: [] }
});

export function emptyMind(rules = 1) {
	return {
		v: MIND_VERSIONS[rules],
		obs: OBSERVATION_VERSION,
		hands: 0,
		mood: { ...MOOD_BASELINE },
		self: { net: 0, streak: 0, last: [], bluffs: { tried: 0, through: 0, caught: 0 }, rebuys: 0 },
		table: { aggr: 0.25 },
		others: {},
		hand: null,
		// Semantic cues for a future table-talk layer (never decisions): the last few, emitted only
		// when a hand is over, so nothing a bot "says" can hint at its cards mid-hand (approval A6).
		cues: []
	};
}

/** Cue vocabulary: what a presentation layer may react to. */
export const CUES = Object.freeze([
	'BIG_LOSS',
	'BIG_WIN',
	'BLIND_WIN',
	'BLUFF_THROUGH',
	'CAUGHT_BLUFFING',
	'CAUGHT_THEIR_BLUFF',
	'GOT_BLUFFED',
	'REVENGE_SUCCESS',
	'RIVAL_ON_STREAK'
]);

/** True when this hand would lose to a low pair under its variant's ranking: a weak hand. */
export function weakHand(view, id, cards) {
	if (!cards?.length) return null;
	const variant = getVariant(view.rulesVersion);
	const state = variant.stateFor ? variant.stateFor(view.variantState, id) : view.variantState;
	const suits = ['hearts', 'spades', 'clubs', 'diamonds'];
	const reference = [2, 2, 3, 4, 5]
		.slice(0, cards.length)
		.map((rank, i) => ({ rank, suit: suits[i % 4] }));
	try {
		return compare(variant.evaluateHand(cards, state), variant.evaluateHand(reference, state)) < 0;
	} catch {
		return null;
	}
}

function subject(mind, id, kindOf) {
	if (!mind.others[id]) {
		const ids = Object.keys(mind.others);
		if (ids.length >= MAX_OTHERS) {
			// Forget the player seen least.
			const least = ids.sort((a, b) => mind.others[a].model.hands - mind.others[b].model.hands)[0];
			delete mind.others[least];
		}
		mind.others[id] = emptySubject(kindOf(id));
	}
	return mind.others[id];
}

/**
 * Fold one batch of observations into a mind. `self` is this bot's table id; `view` its projection
 * after the events (for its own cards and for judging revealed hands); `dna` its style's traits.
 */
export function updateMind(
	prior,
	events,
	{ self, view, dna, kindOf = () => 'human', mutate = false, rules = 1 }
) {
	if (!events.length) return prior;
	// `mutate` (offline simulation only, where nothing else holds the prior) skips the copy; a
	// live room or a replay always works on a copy, since a recorded step may hold the prior.
	const mind = mutate ? prior : JSON.parse(JSON.stringify(prior));
	const trait = (name) => dna[name] ?? 0.5;
	const mood = mind.mood;
	const push = (key, amount) => (mood[key] = clamp(mood[key] + amount));
	for (const e of events) {
		if (e.k === 'deal') {
			const decay = MIND_FEATURES[rules].adaptiveDecay
				? MODEL_DECAY - 0.03 * Math.max(0, trait('adaptability') - 0.5)
				: MODEL_DECAY;
			mind.hands++;
			if (!mind.form) {
				mind.form = nightForm(`${self}|${e.hand}`, trait('discipline'));
				Object.assign(mood, restingMood(mind));
			}
			// Slow enough that a big pot colours the next several hands, not just the next one.
			const recover = 0.1 + 0.35 * trait('moodRecovery');
			const rest = restingMood(mind);
			for (const key of Object.keys(mood))
				mood[key] = clamp(mood[key] + (rest[key] - mood[key]) * recover);
			for (const s of Object.values(mind.others)) {
				s.rel.annoyance *= 0.75;
				s.rel.rivalry *= 0.97;
				s.rel.fear *= 0.9;
				s.recent.beatMe = Math.min(99, s.recent.beatMe + 1);
				for (const k of Object.keys(s.model)) if (k !== 'aggr') s.model[k] *= decay;
			}
			mind.hand = {
				id: e.hand,
				raisers: [],
				seenRaisers: [],
				seenBettors: [],
				lastRaiser: null,
				acted: false,
				raised: false,
				packed: false,
				blind: true,
				raiseAt: -1,
				lastAct: {},
				n: 0,
				// This bot's chips before the boot: the hand's result is measured from here.
				start: e.stacks[self] == null ? null : e.stacks[self] + (e.bets[self] ?? 0)
			};
			for (const id of e.seats) if (id !== self) subject(mind, id, kindOf).model.hands++;
			continue;
		}
		const hand = mind.hand;
		if (!hand) continue;
		hand.n++;
		if (e.k === 'rebuy') {
			if (e.who === self) mind.self.rebuys++;
			continue;
		}
		if (e.k === 'see') {
			if (e.who === self) hand.blind = false;
			else {
				const m = subject(mind, e.who, kindOf).model;
				m.sees++;
				m.seeAt += e.committed;
			}
			continue;
		}
		if (e.k === 'bet') {
			const facing = hand.raiseAt > (hand.lastAct[e.who] ?? -1);
			hand.lastAct[e.who] = hand.n;
			if (e.raised) {
				hand.raiseAt = hand.n;
				hand.lastRaiser = e.who;
				if (!hand.raisers.includes(e.who)) hand.raisers.push(e.who);
				// Raising after looking says something about the cards; a blind raise does not.
				if (!e.blind && !hand.seenRaisers.includes(e.who)) hand.seenRaisers.push(e.who);
			}
			// Betting after looking (a call or a raise) says the cards are worth playing.
			if (!e.blind && !hand.seenBettors.includes(e.who)) hand.seenBettors.push(e.who);
			if (e.who === self) {
				hand.acted = true;
				if (e.raised) hand.raised = true;
				continue;
			}
			const s = subject(mind, e.who, kindOf);
			if (facing) s.model.facing++;
			if (e.blind) s.model.blindBets++;
			else if (e.raised) s.model.raises++;
			else s.model.chaals++;
			s.model.aggr = s.model.aggr * 0.9 + (e.raised ? 0.1 : 0);
			if (e.raised && hand.acted && !hand.packed) {
				// Raised into this bot: some fear, some annoyance at a repeat raiser.
				push('fear', 0.03 * (1 - trait('pressureResistance')));
				s.rel.annoyance = clamp(
					s.rel.annoyance + 0.05 * (1 + hand.raisers.filter((r) => r === e.who).length)
				);
			}
			continue;
		}
		if (e.k === 'pack') {
			if (e.who === self) hand.packed = true;
			else {
				const s = subject(mind, e.who, kindOf);
				s.model.packs++;
				if (hand.raiseAt > (hand.lastAct[e.who] ?? -1)) {
					s.model.facing++;
					s.model.facingPack++;
				}
			}
			continue;
		}
		if (e.k === 'result') appraiseResult(mind, e, { self, view, trait, push, kindOf, rules });
	}
	return roundMind(mind);
}

function appraiseResult(mind, e, { self, view, trait, push, kindOf, rules }) {
	const hand = mind.hand;
	const cue = (name, who = null) =>
		(mind.cues = [
			...(mind.cues ?? []),
			// mind@3 and mind@4: the hand number too, so a policy can tell how recent an event is.
			{
				hand: hand?.id ?? null,
				cue: name,
				...(who ? { who } : {}),
				...(MIND_FEATURES[rules].stamp ? { n: mind.hands } : {})
			}
		].slice(-5));
	const boot = Math.max(view.boot ?? 1, 1);
	const me = view.usersList.find((u) => u.id === self);
	const inHand = e.bets[self] !== undefined && hand?.start != null && me?.balance != null;
	const net = inHand ? (me.balance - hand.start) / boot : 0;
	const winnerIds = e.winners.map((w) => w.id);
	// Big is relative: 20 boots matter to a 100-boot stack, not to a 2,000-boot one.
	const big = Math.max(BIG_POT, (BIG_SHARE * (hand?.start ?? 0)) / boot);
	const size = Math.min(1, Math.abs(net) / (big * 1.5));
	const myWeak =
		me && me.cardsInHand.every((c) => c.rank > 0) ? weakHand(view, self, me.cardsInHand) : null;
	const showdown = Object.keys(e.revealed).length > 1;

	if (inHand) {
		mind.self.net += net;
		mind.self.last = [...mind.self.last, Math.round(net * 10) / 10].slice(-5);
		mind.self.streak =
			net > 0
				? Math.max(1, mind.self.streak + 1)
				: net < 0
					? Math.min(-1, mind.self.streak - 1)
					: mind.self.streak;
	}
	// A rival who beat this bot lately was in the pot, and this bot took it.
	if (net > 0)
		for (const [id, s] of Object.entries(mind.others))
			if (s.recent.beatMe <= 3 && s.rel.rivalry > 0.1 && e.bets[id] !== undefined) {
				cue('REVENGE_SUCCESS', id);
				s.rel.rivalry = clamp(s.rel.rivalry - 0.1);
				push('frustration', -0.1);
			}
	if (net <= -big) {
		cue('BIG_LOSS', winnerIds.find((id) => id !== self) ?? null);
		// BIG_LOSS: frustration and doubt by loss sensitivity; fear unless pressure-resistant;
		// a rivalry with whoever took the pot, by ego and appetite for revenge.
		push('frustration', 0.55 * size * trait('lossSensitivity'));
		push('confidence', -0.15 * size * trait('lossSensitivity'));
		push('fear', 0.2 * size * (1 - trait('pressureResistance')));
		for (const id of winnerIds) {
			if (id === self) continue;
			const s = subject(mind, id, kindOf);
			s.rel.rivalry = clamp(s.rel.rivalry + (0.3 * size * (trait('ego') + trait('revenge'))) / 2);
			s.recent.beatMe = 0;
		}
	} else if (net >= big) {
		cue('BIG_WIN');
		push('confidence', 0.3 * size * trait('winElation'));
		push('excitement', 0.2 * size * trait('winElation'));
		push('frustration', -0.25 * size);
	}
	// Winning without ever looking: confidence in blind play, by how much wins lift this style.
	if (net > 0 && hand?.blind) {
		push('confidence', 0.12 * trait('winElation'));
		cue('BLIND_WIN');
	}

	// This bot's own pressure: a raise with a weak hand either got through or got caught.
	if (inHand && hand?.raised && myWeak) {
		mind.self.bluffs.tried++;
		if (net > 0 && !showdown) {
			mind.self.bluffs.through++;
			cue('BLUFF_THROUGH');
			push('confidence', 0.08);
			push('excitement', 0.1);
		} else if (showdown && net < 0) {
			mind.self.bluffs.caught++;
			cue('CAUGHT_BLUFFING');
			push('confidence', -0.12 * trait('ego'));
			push('frustration', 0.12 * trait('ego'));
			for (const id of winnerIds)
				if (id !== self)
					subject(mind, id, kindOf).rel.rivalry = clamp(
						subject(mind, id, kindOf).rel.rivalry + 0.08 * trait('ego')
					);
		}
	}

	// What other players showed.
	for (const [id, cards] of Object.entries(e.revealed)) {
		if (id === self) continue;
		const s = subject(mind, id, kindOf);
		s.model.showdowns++;
		const raised = hand?.raisers.includes(id);
		const weak = weakHand(view, id, cards);
		if (raised && weak) {
			s.model.weakShown++;
			if (!hand.packed) {
				// Caught their bluff: confidence for this bot, suspicion of them by temperament.
				s.recent.caughtBluffing++;
				if (MIND_FEATURES[rules].eventHands) s.recent.caughtAt = mind.hands;
				cue('CAUGHT_THEIR_BLUFF', id);
				push('confidence', 0.06);
				push('suspicion', 0.1 * trait('suspicion'));
			} else {
				// Bluffed off a pot: it stings by ego, and breeds rivalry by appetite for revenge.
				s.recent.bluffedMe++;
				if (MIND_FEATURES[rules].eventHands) s.recent.bluffedAt = mind.hands;
				cue('GOT_BLUFFED', id);
				if (MIND_FEATURES[rules].bluffedSuspicion) push('suspicion', 0.15 * trait('suspicion'));
				push('frustration', 0.12 * trait('ego'));
				s.rel.rivalry = clamp(s.rel.rivalry + 0.15 * trait('revenge'));
				s.rel.annoyance = clamp(s.rel.annoyance + 0.15);
			}
		} else if (raised && weak === false) {
			s.model.raiseShown++;
			s.rel.respect = clamp(s.rel.respect + 0.05);
		}
	}

	// Hot streaks: someone winning 3 of the last 5 is a rival to the proud, a threat to the timid,
	// suspicious to the suspicious.
	for (const [id, s] of Object.entries(mind.others)) {
		s.recent.wonOf5 = [...s.recent.wonOf5, winnerIds.includes(id) ? 1 : 0].slice(-5);
		if (winnerIds.includes(id)) s.model.wins++;
		if (s.recent.wonOf5.reduce((a, b) => a + b, 0) >= 3 && winnerIds.includes(id)) {
			s.rel.rivalry = clamp(s.rel.rivalry + (0.05 * (trait('ego') + trait('revenge'))) / 2);
			s.rel.fear = clamp(s.rel.fear + 0.06 * (1 - trait('pressureResistance')));
			if (s.rel.rivalry > 0.2) cue('RIVAL_ON_STREAK', id);
			push('suspicion', 0.03 * trait('suspicion'));
		}
	}
	const raisesThisHand = hand ? hand.raisers.length : 0;
	mind.table.aggr = mind.table.aggr * 0.9 + 0.1 * Math.min(1, raisesThisHand / 2);
	mind.hand = hand ? { ...hand, over: true } : null;
}

function roundMind(mind) {
	for (const key of Object.keys(mind.mood)) mind.mood[key] = round(mind.mood[key]);
	mind.self.net = round(mind.self.net);
	mind.table.aggr = round(mind.table.aggr);
	for (const s of Object.values(mind.others)) {
		for (const k of Object.keys(s.model)) s.model[k] = round(s.model[k]);
		for (const k of Object.keys(s.rel)) s.rel[k] = round(s.rel[k]);
	}
	return mind;
}

/* ------------------------------------------ beliefs ------------------------------------------ */

/** Confidence in a tendency from n observations: weak with few, trusted near 30. */
export const confidence = (n) => n / (n + 12);
/** A rate shrunk toward a population prior: few observations stay close to the prior. */
const shrunk = (hits, n, prior, k = 6) => (hits + prior * k) / (n + k);

/**
 * Population priors for policy tp-dna@3, from simulated play (Phase 2 mixed tables: players
 * fold to a raise 10 to 18% of the time, pack about a quarter of their decisions). From live
 * aggregate data later.
 */
export const PRIORS = Object.freeze({
	foldToRaise: 0.15,
	givesUp: 0.25,
	bluffShown: 0.25,
	aggression: 0.25
});

/**
 * Phase 5: a returning player's long-term prior (server/bots/memory/prior.mjs), folded into this
 * session's model of them as capped pseudo-observations, once per session. It then decays with the
 * session's own evidence like any other count, so new play overrides old memory. Nothing else in the
 * mind changes, and a mind is recorded at each deal, so a seeded hand replays exactly.
 */
export function seedPrior(mind, id, kind, prior) {
	if (!mind || !prior) return mind;
	if (!mind.others[id] && Object.keys(mind.others).length >= MAX_OTHERS) return mind;
	const s = (mind.others[id] ??= emptySubject(kind));
	if (s.ltm) return mind;
	for (const k of ['facing', 'facingPack', 'packs', 'chaals', 'raises'])
		s.model[k] = round(s.model[k] + (prior.counts[k] ?? 0));
	s.ltm = { v: prior.v, weight: prior.weight, asOf: prior.asOf };
	return mind;
}

/** What this bot believes about one player, each with its confidence. */
export function beliefs(mind, id) {
	const s = mind?.others?.[id];
	if (!s) return null;
	const m = s.model;
	const shows = m.raiseShown + m.weakShown;
	const bets = m.raises + m.chaals;
	return {
		foldToRaise: { p: shrunk(m.facingPack, m.facing, PRIORS.foldToRaise), n: m.facing },
		// How often a decision ends in a pack: players who give up a lot rarely face a raise at
		// all (they are gone first), so fold-to-raise alone misses the tightest players.
		givesUp: { p: shrunk(m.packs, m.packs + bets, PRIORS.givesUp), n: m.packs + bets },
		bluffShown: { p: shrunk(m.weakShown, shows, PRIORS.bluffShown, 4), n: shows },
		aggression: { p: shrunk(m.raises, bets, PRIORS.aggression), n: bets },
		recent: s.recent,
		rel: s.rel
	};
}
