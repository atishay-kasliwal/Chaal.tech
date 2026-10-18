/**
 * Game-specific strength and expected-value models. Each is labelled with how trustworthy it is:
 *   exact       a solved quantity under this table's own rules (Blackjack basic strategy)
 *   estimated   a model with stated assumptions (Teen Patti and Hold'em card equity)
 *   unavailable the game or variant has no defensible model here (Rummy, joker and discard variants)
 * Nothing here reads anyone's cards except cards the caller was entitled to pass in.
 */
import { getVariant } from '../../variants/index.mjs';
import { HOLDEM_EQUITY } from './holdem-equity.mjs';
import { TP_STRENGTH } from './tp-strength.mjs';

/* ------------------------------------------ Teen Patti ------------------------------------------ */

const tables = new Map();

/** A variant whose hand strength depends only on the cards themselves (no table cards, jokers or discards). */
export function strengthModelFor(rulesVersion) {
	const variant = getVariant(rulesVersion);
	const k = variant?.cardsPerPlayer ?? 3;
	if (!variant || ![2, 3].includes(k) || variant.prepareHand || variant.discardTo || variant.stateFor || variant.wildIndexes) return null;
	return { variant, k };
}

/**
 * Strength tables are generated offline (scripts/generate-tp-strength.mjs) and shipped as data: building
 * one on a request would enumerate every possible hand, which costs up to a second for wild-card
 * variants. A variant with no generated table has no model, and a test fails if one is missing.
 */
function table(rulesVersion) {
	if (!tables.has(rulesVersion)) {
		const rows = TP_STRENGTH[rulesVersion];
		if (!rows) tables.set(rulesVersion, null);
		else
			tables.set(rulesVersion, {
				byKey: new Map(rows.map(([key, weaker, tie]) => [key, { weaker, tie }])),
				groups: rows.map(([, weaker, tie]) => ({ weaker, tie, p: tie }))
			});
	}
	return tables.get(rulesVersion);
}

/** Variance of a hand's win equity over the deck: how much "which cards you were dealt" can swing it. */
export function teenPattiEquityVariance(rulesVersion, opponents) {
	const t = strengthModelFor(rulesVersion) && table(rulesVersion);
	if (!t) return null;
	const fair = 1 / (opponents + 1);
	return t.groups.reduce((s, g) => s + g.p * (((g.weaker + g.tie / 2) ** opponents) - fair) ** 2, 0);
}

/**
 * Chance a hand beats `opponents` independent random hands to the end, ties shared. "Independent"
 * ignores the few cards already out, a small effect for a 52-card deck.
 * @returns null when the variant has no card-only strength model
 */
export function teenPattiEquity(rulesVersion, cards, opponents) {
	const model = strengthModelFor(rulesVersion);
	const t = model && table(rulesVersion);
	if (!t || !cards || cards.length !== model.k || opponents < 1) return null;
	let row;
	try {
		row = t.byKey.get(model.variant.evaluateHand(cards).join(','));
	} catch {
		return null;
	}
	if (!row) return null;
	const against = row.weaker + row.tie / 2;
	return { weaker: row.weaker, tie: row.tie, percentile: against, equity: against ** opponents, model: 'estimated' };
}

/* -------------------------------------------- Hold'em -------------------------------------------- */

const LETTER = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T' };
const letter = (r) => LETTER[r] ?? String(r);
export function holdemClass([a, b]) {
	const [hi, lo] = a.rank >= b.rank ? [a, b] : [b, a];
	return `${letter(hi.rank)}${letter(lo.rank)}${hi.rank === lo.rank ? 'p' : hi.suit === lo.suit ? 's' : 'o'}`;
}
/** Heads-up preflop equity against a random hand, or null if the class is unknown. */
export const holdemEquity = (cards) => (cards?.length === 2 ? HOLDEM_EQUITY[holdemClass(cards)] ?? null : null);

/* ------------------------------------------- Blackjack ------------------------------------------- */

const RANKS = [
	...Array.from({ length: 8 }, (_, i) => ({ value: i + 2, p: 1 / 13 })),
	{ value: 10, p: 4 / 13 },
	{ value: 11, p: 1 / 13 }
];
const total = (hard, ace) => (ace && hard + 10 <= 21 ? hard + 10 : hard);
const add = (hard, ace, value) => ({ hard: hard + (value === 11 ? 1 : value), ace: ace || value === 11 });

const dealerMemo = new Map();
/** Dealer's final outcome distribution from a hand state; stands on every 17 (the engine's rule). */
function dealerDist(hard, ace, n) {
	const key = `${hard}|${ace}|${n}`;
	if (dealerMemo.has(key)) return dealerMemo.get(key);
	const value = total(hard, ace);
	let dist;
	if (n === 2 && value === 21) dist = { bj: 1 };
	else if (value > 21) dist = { bust: 1 };
	else if (value >= 17) dist = { [value]: 1 };
	else {
		dist = {};
		for (const r of RANKS) {
			const next = add(hard, ace, r.value);
			for (const [outcome, p] of Object.entries(dealerDist(next.hard, next.ace, n + 1))) dist[outcome] = (dist[outcome] ?? 0) + p * r.p;
		}
	}
	dealerMemo.set(key, dist);
	return dist;
}
/** Dealer shows one card; the hole card is unknown and there is no peek (the engine's rule). */
const dealerFromUp = (up) => dealerDist(up === 11 ? 1 : up, up === 11, 1);

function standEv(playerTotal, dist) {
	let ev = 0;
	for (const [outcome, p] of Object.entries(dist)) {
		if (outcome === 'bj') ev -= p;
		else if (outcome === 'bust') ev += p;
		else ev += p * (Number(outcome) < playerTotal ? 1 : Number(outcome) === playerTotal ? 0 : -1);
	}
	return ev;
}

const evMemo = new Map();
function best(hard, ace, up) {
	const key = `${hard}|${ace}|${up}`;
	if (evMemo.has(key)) return evMemo.get(key);
	const dist = dealerFromUp(up);
	const stand = standEv(total(hard, ace), dist);
	let hit = 0;
	for (const r of RANKS) {
		const next = add(hard, ace, r.value);
		const v = total(next.hard, next.ace);
		hit += r.p * (v > 21 ? -1 : v === 21 ? standEv(21, dist) : best(next.hard, next.ace, up).ev);
	}
	const out = { stand, hit, ev: Math.max(stand, hit) };
	evMemo.set(key, out);
	return out;
}

/**
 * Exact expected value, in bets, of each Blackjack option for this engine's rules (no splits, dealer
 * stands on all 17, no peek so a dealer natural beats every non-natural hand, doubling on any two
 * cards), assuming an infinite deck. Continuations are played optimally.
 * @param cards the player's current cards; @param upRank the dealer's up card rank (2..14)
 */
export function blackjackEv(cards, upRank) {
	let hard = 0;
	let ace = false;
	for (const c of cards) {
		const v = c.rank === 14 ? 11 : Math.min(10, c.rank);
		hard += v === 11 ? 1 : v;
		ace ||= v === 11;
	}
	const up = upRank === 14 ? 11 : Math.min(10, upRank);
	const dist = dealerFromUp(up);
	const state = best(hard, ace, up);
	let double = null;
	if (cards.length === 2) {
		double = 0;
		for (const r of RANKS) {
			const next = add(hard, ace, r.value);
			const v = total(next.hard, next.ace);
			double += r.p * 2 * (v > 21 ? -1 : standEv(v, dist));
		}
	}
	return { stand: state.stand, hit: state.hit, double, best: Math.max(state.stand, state.hit, double ?? -Infinity) };
}

/**
 * Multiway equity from the heads-up table: eq^(opponents), rescaled so that over every possible
 * starting hand the average is exactly a fair share. A deliberately simple, stated approximation.
 */
const multiway = new Map();
export function holdemShare(cards, players) {
	const eq = holdemEquity(cards);
	if (eq === null || players < 2) return null;
	if (!multiway.has(players)) {
		const k = players - 1;
		let sum = 0;
		let weight = 0;
		for (const [name, e] of Object.entries(HOLDEM_EQUITY)) {
			const w = name.endsWith('p') ? 6 : name.endsWith('s') ? 4 : 12;
			sum += w * e ** k;
			weight += w;
		}
		multiway.set(players, sum / weight);
	}
	return Math.min(0.99, eq ** (players - 1) / multiway.get(players) / players);
}
