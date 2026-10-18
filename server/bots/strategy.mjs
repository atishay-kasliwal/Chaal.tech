import { freshDeck } from '../classic.mjs';
import { getVariant } from '../variants/index.mjs';

/**
 * Bot decisions. A bot sees exactly what a human in its seat would see — its own
 * projection of the room — and returns one legal action. Pure: randomness comes in
 * through `random`, so every decision is reproducible in tests.
 */

const key = (card) => `${card.rank}:${card.suit}`;
const SAMPLES = 96;

/**
 * Hand scores are cached per variant and table state: the same opponent hands come up
 * again and again across samples and decisions, and joker hands are costly to score.
 */
const scoreCache = new Map();
const stateKey = (handState) =>
	handState?.wildRank ?? handState?.wildColor ?? (handState ? JSON.stringify(handState) : '');
const CACHE_LIMIT = 60_000;
function score(variant, cards, handState) {
	const id = `${variant.rulesVersion}|${stateKey(handState)}|${cards.map(key).sort().join(',')}`;
	let value = scoreCache.get(id);
	if (!value) {
		value = variant.evaluateHand(cards, handState);
		if (scoreCache.size >= CACHE_LIMIT) scoreCache.clear();
		scoreCache.set(id, value);
	}
	return value;
}

/** Chance this hand beats one random opponent hand, by sampling the unseen cards. */
export function winChance(cards, variant, handState, random, known = []) {
	const taken = new Set([...cards, ...known].filter(Boolean).map(key));
	const pool = freshDeck().filter((card) => !taken.has(key(card)));
	const size = cards.length;
	// Discard One keeps card order (the first three play); every other variant is order-free.
	const ordered = Number.isInteger(variant.discardTo);
	const mine = ordered ? variant.evaluateHand(cards, handState) : score(variant, cards, handState);
	let total = 0;
	for (let n = 0; n < SAMPLES; n++) {
		// Partial Fisher–Yates: draw `size` distinct unseen cards.
		const hand = [];
		const deck = pool.slice();
		for (let i = 0; i < size; i++) {
			const j = i + Math.floor(random() * (deck.length - i));
			[deck[i], deck[j]] = [deck[j], deck[i]];
			hand.push(deck[i]);
		}
		const theirs = ordered
			? variant.evaluateHand(hand, handState)
			: score(variant, hand, handState);
		const result = compare(mine, theirs);
		total += result > 0 ? 1 : result === 0 ? 0.5 : 0;
	}
	return total / SAMPLES;
}

/** For discard variants: which card to throw away so the remaining three score best. */
export function bestDiscard(cards, variant, handState) {
	let best = cards.findIndex((card) => !variant.keepsCard?.(handState, card));
	let bestScore;
	for (let index = 0; index < cards.length; index++) {
		// Never throw away the joker you made.
		if (variant.keepsCard?.(handState, cards[index])) continue;
		const kept = cards.filter((_, i) => i !== index);
		// Folding Joker scores the kept three with the thrown card last, as the joker.
		const score = variant.evaluateHand(
			variant.foldsToEnd ? [...kept, cards[index]] : kept,
			handState
		);
		if (!bestScore || compare(score, bestScore) > 0) {
			best = index;
			bestScore = score;
		}
	}
	return best;
}

/** Pick a table move: a random mat card, the line or joker pair that scores best. */
function tableMove(view, me, variant, random) {
	const options = view.legalActions.table;
	const seen = me.cardsInHand.every((card) => card.rank > 0);
	const scored = (payload) => {
		if (!seen) return null;
		if (payload.kind === 'line') {
			const state = {
				...view.variantState,
				lines: { ...view.variantState.lines, [me.id]: payload.line }
			};
			return variant.evaluateHand(me.cardsInHand, variant.stateFor(state, me.id));
		}
		if (payload.kind === 'joker') {
			const [i, j] = payload.indexes;
			const joker = me.cardsInHand[i];
			const rest = me.cardsInHand.filter((_, index) => index !== i && index !== j);
			// Best three that keep the joker.
			let best = null;
			for (let a = 0; a < rest.length; a++)
				for (let b = a + 1; b < rest.length; b++) {
					const score = variant.evaluateHand([joker, rest[a], rest[b]], {
						jokerKey: `${joker.rank}:${joker.suit}`
					});
					if (!best || compare(score, best) > 0) best = score;
				}
			return best;
		}
		return null;
	};
	let choice = options[Math.floor(random() * options.length)];
	let top = null;
	for (const payload of options) {
		const score = scored(payload);
		if (score && (!top || compare(score, top) > 0)) {
			top = score;
			choice = payload;
		}
	}
	return choice;
}

function compare(left, right) {
	for (let i = 0; i < Math.min(left.length, right.length); i++)
		if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
	return Math.sign(left.length - right.length);
}

/** Style parameters per legacy level. Published as immutable styles in ./identity.mjs: edit only
 * by publishing a new style version (a test pins their hash). */
export const PROFILES = Object.freeze({
	// A friendly "calling station": looks early, stays in with weak hands, rarely raises.
	easy: {
		blindRounds: 0.5,
		call: 0.18,
		raise: 0.95,
		show: 0.32,
		bluff: 0,
		randomness: 0.35,
		mistake: 0.3
	},
	// Plays a round blind, then folds weak hands and bets strong ones by pot odds.
	normal: {
		blindRounds: 1,
		call: 0.33,
		raise: 0.72,
		show: 0.5,
		bluff: 0.03,
		randomness: 0.1,
		mistake: 0.05
	},
	// Tighter and more aggressive, with occasional bluffs; reads raises from seen players.
	hard: {
		blindRounds: 1,
		call: 0.3,
		raise: 0.66,
		show: 0.52,
		bluff: 0.05,
		randomness: 0.04,
		mistake: 0
	}
});

/**
 * Why a bot chose its move: a fixed category for recorded decision traces, never free text.
 * @type {readonly string[]}
 */
export const REASONS = Object.freeze([
	'table-move',
	'discard',
	'mistake',
	'blind-see',
	'blind-show',
	'blind-no-bet',
	'blind-stack-guard',
	'blind-bluff-raise',
	'blind-hold',
	'show-strong',
	'show-forced',
	'no-bet-pack',
	'strong-raise',
	'pot-odds-call',
	'bluff-raise',
	'weak-pack'
]);

/**
 * @param view the bot's own projection (server/engine.mjs projection for the bot id)
 * @returns {{ action: string, payload: object, reason: string }}
 */
export function decide(view, botId, random, profile, extra = {}) {
	const move = choose(view, botId, random, profile, extra);
	return move && { action: move.action, payload: move.payload, reason: move.reason };
}

function choose(view, botId, random, styleProfile, extra = {}) {
	const legal = view.legalActions;
	const me = view.usersList.find((user) => user.id === botId);
	const level = me?.bot ?? 'normal';
	// A published style's tendencies when given; otherwise the legacy level's (the same values).
	const profile = styleProfile ?? PROFILES[level] ?? PROFILES.normal;
	const variant = getVariant(view.rulesVersion);
	// Some games give each player their own jokers (a Chatai line, a Kiss-Miss-Bliss pair).
	const handState = variant.stateFor
		? variant.stateFor(view.variantState, botId)
		: view.variantState;
	const opponents = view.usersList.filter(
		(user) => user.id !== botId && user.cardsInHand.length && !user.isPacked
	);
	const myTurn = view.usersList[view.currentPlayer]?.id === botId;
	const pack = { action: 'pack', payload: {} };
	const low = { action: 'bet', payload: { amount: legal.minBet } };
	const high = { action: 'bet', payload: { amount: legal.maxBet } };
	const canRaise = legal.bet && legal.maxBet > legal.minBet;

	// Table moves first: open the mat card it paid for, lock its best line, make a joker.
	if (legal.table?.length)
		return { action: 'table', payload: tableMove(view, me, variant, random), reason: 'table-move' };
	// Discard variants: throw the card that leaves the strongest three.
	if (legal.discard)
		return {
			action: 'discard',
			payload: { index: bestDiscard(me.cardsInHand, variant, handState) },
			reason: 'discard'
		};
	if (!myTurn) return null;

	// Weaker bots sometimes just click something: pack a good hand, raise with nothing.
	if (random() < profile.mistake) {
		const options = [pack, ...(legal.bet ? [low] : []), ...(canRaise ? [high] : [])];
		if (legal.show) options.push({ action: 'show', payload: {} });
		return { ...options[Math.floor(random() * options.length)], reason: 'mistake' };
	}

	const boot = view.boot ?? 1;
	const roundsPlayed = (me.handBet ?? 0) / Math.max(boot, 1);
	const seen = me.cardsInHand.some((card) => card.rank > 0);

	// Blind phase: keep betting blind for a while (cheap, and it pressures seen players).
	if (!seen) {
		// Blind match (optional trait): a seen player facing a blind one pays double and cannot Show, so a
		// bot with this trait stays blind for as long as a live opponent does.
		const matchBlind = profile.blindMatch && opponents.some((user) => user.isBlind);
		const stayBlind = legal.see ? matchBlind || roundsPlayed < profile.blindRounds + random() * 1.5 : true; // Pot Blind: nobody may look.
		if (!stayBlind) return { action: 'see', payload: {}, reason: 'blind-see' };
		if (legal.show && (roundsPlayed > 3 || random() < (profile.blindShowChance ?? 0.25)))
			return { action: 'show', payload: {}, reason: 'blind-show' };
		if (!legal.bet) return { ...pack, reason: 'blind-no-bet' };
		// Pot Blind tables get expensive: bow out once the stake eats a big share of the stack.
		if (!legal.see && legal.minBet > me.balance * (profile.stackRisk ?? 0.25) && random() < 0.5)
			return { ...pack, reason: 'blind-stack-guard' };
		return canRaise && random() < profile.bluff + 0.05
			? { ...high, reason: 'blind-bluff-raise' }
			: { ...low, reason: 'blind-hold' };
	}

	const known = [handState?.indicator].filter(Boolean);
	const single = winChance(me.cardsInHand, variant, handState, random, known);
	// Against several live opponents the hand has to beat each of them.
	let strength = single ** Math.max(1, opponents.length * 0.8);
	// A seen opponent who has been betting big is probably holding something.
	const seenBetters = opponents.filter((user) => !user.isBlind && (user.handBet ?? 0) > me.handBet);
	if (seenBetters.length) strength *= 1 - (profile.pressureRead ?? (level === 'hard' ? 0.1 : 0));
	if (profile.shortStackCall !== undefined && me.balance < boot * 15) strength -= profile.shortStackCall;
	if (profile.largePotCaution !== undefined) strength -= profile.largePotCaution * Math.min(1, view.pot / Math.max(me.balance, 1));
	// A reading of the opponent's betting line (adaptive styles with a line weight). 0 for everyone else.
	strength += extra.strengthAdjust ?? 0;
	strength += (random() - 0.5) * profile.randomness;

	if (legal.show && opponents.length === 1) {
		if (strength >= profile.show) return { action: 'show', payload: {}, reason: 'show-strong' };
	}
	if (!legal.bet)
		return legal.show && strength >= 0.35
			? { action: 'show', payload: {}, reason: 'show-forced' }
			: { ...pack, reason: 'no-bet-pack' };

	// Pot odds: the cheaper the call relative to the pot, the looser the bot plays.
	const cost = legal.minBet;
	const potOdds = cost / Math.max(view.pot + cost, 1);
	const callLine = Math.min(profile.call, profile.call * 0.6 + potOdds);
	if (strength >= profile.raise && canRaise)
		return { ...(random() < (profile.strongRaiseChance ?? 0.7) ? high : low), reason: 'strong-raise' };
	if (strength >= callLine) return { ...low, reason: 'pot-odds-call' };
	if (canRaise && random() < profile.bluff) return { ...high, reason: 'bluff-raise' };
	return { ...pack, reason: 'weak-pack' };
}
