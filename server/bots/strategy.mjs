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
const CACHE_LIMIT = 60_000;
function score(variant, cards, handState) {
	const id = `${variant.rulesVersion}|${handState?.wildRank ?? handState?.wildColor ?? ''}|${cards
		.map(key)
		.sort()
		.join(',')}`;
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
	const ordered = variant.rulesVersion === 'discard-one-1';
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
	let best = 0;
	let bestScore;
	for (let index = 0; index < cards.length; index++) {
		const kept = cards.filter((_, i) => i !== index);
		const score = variant.evaluateHand(kept, handState);
		if (!bestScore || compare(score, bestScore) > 0) {
			best = index;
			bestScore = score;
		}
	}
	return best;
}

function compare(left, right) {
	for (let i = 0; i < Math.min(left.length, right.length); i++)
		if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
	return Math.sign(left.length - right.length);
}

const PROFILES = Object.freeze({
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
 * @param view the bot's own projection (server/engine.mjs projection for the bot id)
 * @returns {{ action: string, payload: object }}
 */
export function decide(view, botId, random) {
	const legal = view.legalActions;
	const me = view.usersList.find((user) => user.id === botId);
	const level = me?.bot ?? 'normal';
	const profile = PROFILES[level] ?? PROFILES.normal;
	const variant = getVariant(view.rulesVersion);
	const handState = view.variantState;
	const opponents = view.usersList.filter(
		(user) => user.id !== botId && user.cardsInHand.length && !user.isPacked
	);
	const myTurn = view.usersList[view.currentPlayer]?.id === botId;
	const pack = { action: 'pack', payload: {} };
	const low = { action: 'bet', payload: { amount: legal.minBet } };
	const high = { action: 'bet', payload: { amount: legal.maxBet } };
	const canRaise = legal.bet && legal.maxBet > legal.minBet;

	// Discard variants: throw the card that leaves the strongest three.
	if (legal.discard)
		return {
			action: 'discard',
			payload: { index: bestDiscard(me.cardsInHand, variant, handState) }
		};
	if (!myTurn) return null;

	// Weaker bots sometimes just click something: pack a good hand, raise with nothing.
	if (random() < profile.mistake) {
		const options = [pack, ...(legal.bet ? [low] : []), ...(canRaise ? [high] : [])];
		if (legal.show) options.push({ action: 'show', payload: {} });
		return options[Math.floor(random() * options.length)];
	}

	const boot = view.boot ?? 1;
	const roundsPlayed = (me.handBet ?? 0) / Math.max(boot, 1);
	const seen = me.cardsInHand.some((card) => card.rank > 0);

	// Blind phase: keep betting blind for a while (cheap, and it pressures seen players).
	if (!seen) {
		const stayBlind = legal.see ? roundsPlayed < profile.blindRounds + random() * 1.5 : true; // Pot Blind: nobody may look.
		if (!stayBlind) return { action: 'see', payload: {} };
		if (legal.show && (roundsPlayed > 3 || random() < 0.25)) return { action: 'show', payload: {} };
		if (!legal.bet) return pack;
		// Pot Blind tables get expensive: bow out once the stake eats a big share of the stack.
		if (!legal.see && legal.minBet > me.balance * 0.25 && random() < 0.5) return pack;
		return canRaise && random() < profile.bluff + 0.05 ? high : low;
	}

	const known = [handState?.indicator].filter(Boolean);
	const single = winChance(me.cardsInHand, variant, handState, random, known);
	// Against several live opponents the hand has to beat each of them.
	let strength = single ** Math.max(1, opponents.length * 0.8);
	// A seen opponent who has been betting big is probably holding something.
	const seenBetters = opponents.filter((user) => !user.isBlind && (user.handBet ?? 0) > me.handBet);
	if (level === 'hard' && seenBetters.length) strength *= 0.9;
	strength += (random() - 0.5) * profile.randomness;

	if (legal.show && opponents.length === 1) {
		if (strength >= profile.show) return { action: 'show', payload: {} };
	}
	if (!legal.bet) return legal.show && strength >= 0.35 ? { action: 'show', payload: {} } : pack;

	// Pot odds: the cheaper the call relative to the pot, the looser the bot plays.
	const cost = legal.minBet;
	const potOdds = cost / Math.max(view.pot + cost, 1);
	const callLine = Math.min(profile.call, profile.call * 0.6 + potOdds);
	if (strength >= profile.raise && canRaise) return random() < 0.7 ? high : low;
	if (strength >= callLine) return low;
	if (canRaise && random() < profile.bluff) return high;
	return pack;
}
