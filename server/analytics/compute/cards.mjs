/**
 * Card analytics over a player's OWN private cards (docs/ANALYTICS_PHASE2.md, "Cards").
 * Callers must pass only the signed-in player's hand_private documents; nothing here may be fed
 * another named player's cards. Club-wide fairness is anonymous counts only.
 *
 * Two different questions, kept apart:
 * - What did I do with my cards? (results by hand strength: play, partly skill)
 * - What cards did the deck give me? (fairness: pure chance, never a trait)
 */
import { getVariant } from '../../variants/index.mjs';
import { benjaminiHochberg, chiSquare, evidence, round, twoSidedP } from './stats.mjs';

const TP_NAMES = { 5: 'trail', 4: 'pure-sequence', 3: 'sequence', 2: 'colour', 1: 'pair', 0: 'high-card' };
const LABEL_PREFIX = [
	[/^trail/i, 'trail'],
	[/^pure sequence/i, 'pure-sequence'],
	[/^sequence/i, 'sequence'],
	[/^colou?r/i, 'colour'],
	[/^pair/i, 'pair'],
	[/^high card/i, 'high-card']
];
export const TP_ORDER = ['trail', 'pure-sequence', 'sequence', 'colour', 'pair', 'high-card'];

/** Teen Patti category of a final hand, from the variant's own evaluator (label as fallback). */
export function teenPattiCategory(own, table) {
	const variant = getVariant(own.rulesVersion);
	if (variant && own.final?.length) {
		try {
			const state = variant.stateFor ? variant.stateFor(table?.variantState, own.p) : table?.variantState;
			const value = variant.evaluateHand(own.final, state);
			const cards = variant.cardsPerPlayer ?? 3;
			if (cards === 2) return Math.abs(value[0]) >= 1 ? 'pair' : 'high-card';
			return TP_NAMES[Math.abs(value[0])] ?? 'other';
		} catch {
			/* a joker game whose wild card is not public: fall back to the label */
		}
	}
	for (const [pattern, name] of LABEL_PREFIX) if (pattern.test(own.label ?? '')) return name;
	return 'unknown';
}

/** Strength tier, variant-aware: Muflis (lowest wins) inverts it. An approximation until equity exists. */
export function teenPattiTier(category, rulesVersion) {
	const lowWins = /^muflis/.test(rulesVersion ?? '');
	const standard = { trail: 'strong', 'pure-sequence': 'strong', sequence: 'strong', colour: 'average', pair: 'average', 'high-card': 'weak' };
	const muflis = { trail: 'weak', 'pure-sequence': 'weak', sequence: 'weak', colour: 'average', pair: 'average', 'high-card': 'strong' };
	if (/^2-card/.test(rulesVersion ?? '')) return category === 'pair' ? 'strong' : 'weak';
	return (lowWins ? muflis : standard)[category] ?? 'unknown';
}

/** Hold'em starting hand class and tier from the two hole cards. */
export function holdemStart([a, b]) {
	const [hi, lo] = a.rank >= b.rank ? [a, b] : [b, a];
	const suited = a.suit === b.suit;
	const gap = hi.rank - lo.rank;
	let name;
	if (gap === 0) name = hi.rank >= 11 ? 'big-pair' : 'pair';
	else if (hi.rank === 14 && lo.rank === 13) name = 'ace-king';
	else if (lo.rank >= 10) name = 'broadway';
	else if (suited && gap <= 1) name = 'suited-connector';
	else if (suited) name = 'suited';
	else if (gap <= 1) name = 'connector';
	else name = 'other';
	const tier = { 'big-pair': 'premium', 'ace-king': 'premium', pair: 'good', broadway: 'good', 'suited-connector': 'speculative', suited: 'speculative', connector: 'speculative', other: 'weak' }[name];
	return { name, tier };
}

const bjValue = (card) => (card.rank === 14 ? 11 : Math.min(10, card.rank));
/** Blackjack opening situation from the first two cards. */
export function blackjackStart([a, b]) {
	const total = bjValue(a) + bjValue(b);
	const soft = a.rank === 14 || b.rank === 14;
	if (total === 21) return 'blackjack';
	if (bjValue(a) === bjValue(b)) return 'pair';
	if (soft) return 'soft';
	return total >= 17 ? 'hard-17-plus' : total >= 12 ? 'hard-12-16' : 'hard-11-or-less';
}

function resultsBy(rows, key) {
	const groups = new Map();
	for (const row of rows) {
		const k = key(row);
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(row);
	}
	return [...groups.entries()].map(([k, list]) => {
		const complete = list.filter((r) => r.fact?.complete);
		const fair = complete.filter((r) => r.fact.fairShare !== null);
		const wins = complete.reduce((s, r) => s + r.fact.won, 0);
		const expected = fair.reduce((s, r) => s + r.fact.fairShare, 0);
		const units = complete.reduce((s, r) => s + r.fact.units, 0);
		const mean = complete.length ? units / complete.length : null;
		const sd = complete.length > 1 ? Math.sqrt(complete.reduce((s, r) => s + (r.fact.units - mean) ** 2, 0) / (complete.length - 1)) : null;
		const half = sd !== null ? 1.96 * (sd / Math.sqrt(complete.length)) : null;
		return {
			key: k,
			hands: list.length,
			share: null,
			wins: round(wins, 2),
			fairRatio: expected ? round(wins / expected, 2) : null,
			units: round(units, 1),
			perHand: round(mean, 2),
			perHandLow: half === null ? null : round(mean - half, 2),
			perHandHigh: half === null ? null : round(mean + half, 2),
			packed: complete.length ? round(complete.filter((r) => ['fold', 'timeout'].includes(r.fact.exit)).length / complete.length, 3) : null,
			shown: complete.length ? round(complete.filter((r) => r.fact.shown).length / complete.length, 3) : null,
			evidence: evidence(complete.length, 15)
		};
	});
}
const withShares = (groups, total) => groups.map((g) => ({ ...g, share: total ? round(g.hands / total, 3) : null }));

/**
 * Card analytics for the signed-in player.
 * @param owns that player's hand_private docs
 * @param factsByHand handId → the same player's fact for that hand
 * @param tables handId → the hand's public table state (for joker variants)
 */
export function ownCards(owns, factsByHand, tables = new Map()) {
	const rows = owns.map((own) => ({ own, fact: factsByHand.get(own.handId), table: tables.get(own.handId) }));
	const tp = rows.filter((r) => r.own.gameType === 'teen-patti');
	const tpRows = tp.map((r) => {
		const category = teenPattiCategory(r.own, r.table);
		return { ...r, category, tier: teenPattiTier(category, r.own.rulesVersion) };
	});
	const holdem = rows.filter((r) => r.own.gameType === 'texas-holdem' && r.own.dealt?.length === 2).map((r) => ({ ...r, ...holdemStart(r.own.dealt) }));
	const blackjack = rows
		.filter((r) => r.own.gameType === 'blackjack' && r.own.dealt?.length >= 2)
		.map((r) => {
			const up = r.table?.dealerCards?.[0];
			return { ...r, start: blackjackStart(r.own.dealt), dealer: up ? (bjValue(up) >= 7 ? 'dealer-7-to-ace' : 'dealer-2-to-6') : 'dealer-unknown' };
		});
	const rummy = rows
		.filter((r) => r.own.gameType === 'rummy')
		.map((r) => {
			const wild = r.table?.wildRank;
			const jokers = (r.own.dealt ?? []).filter((c) => c.suit === 'joker' || (wild && c.rank === wild)).length;
			return { ...r, jokers: jokers >= 2 ? '2-or-more' : String(jokers) };
		});
	const order = (list, keys) => [...list].sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
	return {
		hands: rows.length,
		teenPatti: tp.length
			? {
					hands: tp.length,
					categories: order(withShares(resultsBy(tpRows, (r) => r.category), tp.length), TP_ORDER),
					tiers: order(withShares(resultsBy(tpRows.filter((r) => r.tier !== 'unknown'), (r) => r.tier), tp.length), ['strong', 'average', 'weak']),
					note: 'Strength tiers come from hand category (Muflis reversed). Exact hands are grouped: single holdings are too rare to mean anything.'
				}
			: null,
		holdem: holdem.length
			? {
					hands: holdem.length,
					classes: withShares(resultsBy(holdem, (r) => r.name), holdem.length),
					tiers: order(withShares(resultsBy(holdem, (r) => r.tier), holdem.length), ['premium', 'good', 'speculative', 'weak'])
				}
			: null,
		blackjack: blackjack.length
			? {
					hands: blackjack.length,
					starts: withShares(resultsBy(blackjack, (r) => r.start), blackjack.length),
					byDealer: withShares(resultsBy(blackjack, (r) => r.dealer), blackjack.length)
				}
			: null,
		rummy: rummy.length ? { hands: rummy.length, jokers: order(withShares(resultsBy(rummy, (r) => r.jokers), rummy.length), ['0', '1', '2-or-more']) } : null
	};
}

/* --------------------------------------------- fairness --------------------------------------------- */

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
/** Classic three-card category odds from a fair 52-card deck (22,100 hands). */
export const CLASSIC_ODDS = Object.freeze({ trail: 52 / 22100, 'pure-sequence': 48 / 22100, sequence: 720 / 22100, colour: 1096 / 22100, pair: 3744 / 22100, 'high-card': 16440 / 22100 });

/**
 * Do the dealt cards look like a fair shuffle? Single-deck games only (Rummy plays two decks
 * with jokers). Unusual results are reported only with enough cards and after correcting for
 * having looked at 52 cards at once.
 */
export function deckFairness(owns) {
	const cards = owns.filter((o) => ['teen-patti', 'texas-holdem', 'blackjack'].includes(o.gameType)).flatMap((o) => o.dealt ?? []).filter((c) => RANKS.includes(c.rank) && SUITS.includes(c.suit));
	const total = cards.length;
	const count = (pred) => cards.filter(pred).length;
	const ranks = RANKS.map((rank) => count((c) => c.rank === rank));
	const suits = SUITS.map((suit) => count((c) => c.suit === suit));
	const rankTest = chiSquare(ranks, RANKS.map(() => total / 13));
	const suitTest = chiSquare(suits, SUITS.map(() => total / 4));
	const perCard = [];
	for (const suit of SUITS)
		for (const rank of RANKS) {
			const k = count((c) => c.rank === rank && c.suit === suit);
			const expected = total / 52;
			const sd = Math.sqrt(total * (1 / 52) * (51 / 52));
			perCard.push({ rank, suit, count: k, expected: round(expected, 1), p: sd ? twoSidedP((k - expected) / sd) : 1 });
		}
	const flagged = total >= 52 * 10 ? benjaminiHochberg(perCard, 0.05).filter((c) => c.significant) : [];
	const enough = total >= 13 * 10;
	const classic = owns.filter((o) => o.gameType === 'teen-patti' && /^(classic|muflis)-/.test(o.rulesVersion ?? '') && o.final?.length === 3);
	const categories = Object.keys(CLASSIC_ODDS).map((name) => ({
		name,
		count: classic.filter((o) => teenPattiCategory({ ...o, rulesVersion: 'classic-1' }) === name).length,
		expected: round(classic.length * CLASSIC_ODDS[name], 1)
	}));
	// Merge rare categories so every expected count is usable.
	const merged = [
		categories.slice(0, 3).reduce((s, c) => ({ count: s.count + c.count, expected: s.expected + c.expected }), { count: 0, expected: 0 }),
		...categories.slice(3)
	];
	const categoryTest = classic.length >= 60 ? chiSquare(merged.map((c) => c.count), merged.map((c) => c.expected)) : null;
	const verdict = !enough
		? 'insufficient'
		: rankTest.p < 0.01 || suitTest.p < 0.01 || flagged.length || (categoryTest && categoryTest.p < 0.01)
			? 'unusual'
			: 'fair';
	return {
		cards: total,
		verdict,
		note: 'Which cards you are dealt is chance. A fair deck still makes some cards come up more often for a while; that says nothing about how you play.',
		ranks: RANKS.map((rank, i) => ({ rank, count: ranks[i], expected: round(total / 13, 1) })),
		suits: SUITS.map((suit, i) => ({ suit, count: suits[i], expected: round(total / 4, 1) })),
		rankTest: { p: round(rankTest.p, 4) },
		suitTest: { p: round(suitTest.p, 4) },
		mostDealt: enough ? [...perCard].sort((a, b) => b.count - a.count).slice(0, 3).map(({ rank, suit, count, expected }) => ({ rank, suit, count, expected })) : [],
		unusualCards: flagged.map(({ rank, suit, count, expected }) => ({ rank, suit, count, expected })),
		classicCategories: classic.length ? { hands: classic.length, categories, p: categoryTest ? round(categoryTest.p, 4) : null } : null
	};
}
