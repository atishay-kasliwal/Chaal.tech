/**
 * Skill versus luck (docs/archive/ANALYTICS_PHASE5.md, "Skill and luck"). There is no universal skill score:
 * every game gets the method it can defend, and each result says whether it is exact, estimated, or
 * outcome-only. Three things are always kept apart:
 *
 *   cards     what the cards you were dealt were worth, against a fair deal
 *   play      what you did beyond what those cards alone would win
 *   outcome   what actually happened (cards + play, exactly)
 *
 * A player can play well and lose, play badly and win, hold strong cards and fall short. Every
 * "expected versus actual" comes with an interval, and nothing is called hot or cold on a small
 * sample. Inputs are only the signed-in player's own facts, own private cards and the public records
 * of their own hands.
 */
import { clusteredMean, evidence, round, twoSidedP, wilson, Z95 } from '../compute/stats.mjs';
import { blackjackEv, holdemClass, holdemEquity, holdemShare, teenPattiEquity, teenPattiEquityVariance } from './strength.mjs';
import { tierOf } from './language.mjs';

export const MIN_HANDS = 30;

/** Expected versus actual with an interval, and a verdict no stronger than the sample allows. */
export function compare({ actual, expected, variance, n, min = MIN_HANDS }) {
	const se = variance > 0 ? Math.sqrt(variance) : null;
	const diff = actual - expected;
	const z = se ? diff / se : null;
	const p = z === null ? null : twoSidedP(z);
	const level = evidence(n, min);
	const tier = tierOf({ n, min, p });
	return {
		n,
		actual: round(actual, 2),
		expected: round(expected, 2),
		difference: round(diff, 2),
		low: se === null ? null : round(diff - Z95 * se, 2),
		high: se === null ? null : round(diff + Z95 * se, 2),
		z: round(z, 2),
		p: round(p, 4),
		evidence: level,
		tier,
		verdict: level === 'insufficient' || z === null ? 'insufficient' : tier === 'weak' ? 'as-expected' : diff > 0 ? 'above' : 'below'
	};
}

const BAND = (ratio) => (ratio >= 1.6 ? 'strong' : ratio < 0.6 ? 'weak' : 'average');

/* ------------------------------------------- per hand ------------------------------------------- */

/** Teen Patti: the cards' equity against random opponents, assuming everyone stays to the end. */
function teenPattiRow(fact, own) {
	if (!fact.complete || !own) return null;
	const opponents = fact.players - 1;
	const eq = teenPattiEquity(fact.rulesVersion ?? own.rulesVersion, own.final?.length ? own.final : own.dealt, opponents);
	if (!eq) return null;
	const fair = 1 / fact.players;
	return valued(fact, eq.equity, fair, teenPattiEquityVariance(fact.rulesVersion ?? own.rulesVersion, opponents));
}

/**
 * Value a hand's cards in the game's own stake unit. If everyone stayed to the end, a hand with win
 * chance e from a pot P is worth P·e minus its own P/n share: P·(e − 1/n). That is "what the cards
 * were worth", zero for an average hand. Packing a weak hand therefore counts as good play (the cards
 * were worth less than nothing) and packing a strong one as costly, which a win-count cannot say.
 */
function valued(fact, equity, fair, deckVariance) {
	const pot = fact.stayPotUnits ?? fact.potUnits ?? 0;
	return {
		equity,
		fair,
		pot,
		cardsBoots: pot * (equity - fair),
		cardsVar: pot * pot * (deckVariance ?? Math.max(equity * (1 - equity) * 0.35, 0)),
		playVar: pot * pot * equity * (1 - equity),
		deckVariance,
		bernoulli: equity * (1 - equity),
		band: BAND(equity / fair),
		packed: fact.exit === 'fold'
	};
}

/** Hold'em: hole-card equity scaled to the table size (an estimate, see strength.mjs). */
function holdemRow(fact, own) {
	if (!fact.complete || !own?.dealt || own.dealt.length !== 2) return null;
	const share = holdemShare(own.dealt, fact.players);
	if (share === null) return null;
	return valued(fact, share, 1 / fact.players, null);
}

/** Where a Blackjack player's cards stood at each of their own decisions, in order. */
function blackjackDecisions(record, fact, own) {
	if (!record || !own?.dealt || own.dealt.length < 2) return [];
	const up = record.table?.dealerCards?.[0]?.rank;
	if (!up) return [];
	const out = [];
	let hits = 0;
	for (const e of record.events ?? []) {
		if (e.p !== fact.seatId || e.sub !== undefined || e.kind === 'system' || !['hit', 'stand', 'double'].includes(e.a)) continue;
		const cards = [...own.dealt, ...(own.final ?? []).slice(own.dealt.length, own.dealt.length + hits)];
		if (cards.length < 2) break;
		const ev = blackjackEv(cards, up);
		const chosen = ev[e.a];
		if (chosen !== null && chosen !== undefined) out.push({ i: e.i, action: e.a, cards: cards.length, total: cards.reduce((s, c) => s + (c.rank === 14 ? 11 : Math.min(10, c.rank)), 0), best: ev.best, chosen, cost: ev.best - chosen, up });
		if (e.a === 'hit') hits++;
	}
	return out;
}
/** Blackjack's expected result before any decision, with the best play from here. */
function blackjackStartEv(record, own) {
	const up = record?.table?.dealerCards?.[0]?.rank;
	if (!up || !own?.dealt || own.dealt.length < 2) return null;
	const [a, b] = own.dealt;
	const natural = own.dealt.length >= 2 && ((a.rank === 14 && Math.min(10, b.rank) === 10 && b.rank !== 14) || (b.rank === 14 && Math.min(10, a.rank) === 10 && a.rank !== 14));
	if (!natural) return blackjackEv(own.dealt.slice(0, 2), up).best;
	// Natural: paid 3:2 unless the dealer also has one (a push). Ace up → 4/13 a ten, ten up → 1/13 an ace.
	const dealerNatural = up === 14 ? 4 / 13 : Math.min(10, up) === 10 ? 1 / 13 : 0;
	return 1.5 * (1 - dealerNatural);
}

/**
 * One row per hand the models can judge, in a form every surface shares: the play residual (actual
 * minus what the cards alone would give) and its variance. Improvement tracking, night recaps and
 * records all read these, so "play" means one thing everywhere.
 */
export function playRows({ facts, owns, records = new Map() }) {
	const out = [];
	for (const fact of facts) {
		if (!fact.complete) continue;
		const own = owns.get(fact.handId);
		if (fact.gameType === 'teen-patti' || fact.gameType === 'texas-holdem') {
			const row = (fact.gameType === 'teen-patti' ? teenPattiRow : holdemRow)(fact, own);
			if (row) out.push({ fact, game: fact.gameType, equity: row.equity, fair: row.fair, residual: fact.units - row.cardsBoots, variance: row.playVar, band: row.band, packed: row.packed });
		} else if (fact.gameType === 'blackjack') {
			const start = blackjackStartEv(records.get(fact.handId), own);
			if (start !== null) out.push({ fact, game: 'blackjack', equity: start, fair: start, residual: fact.units - start, variance: 1.35, band: null, packed: false });
		}
	}
	return out;
}

/* ------------------------------------------- per game ------------------------------------------- */

const LIMITS = {
	'teen-patti': [
		'Card strength assumes every opponent stays to the end against a random hand. Real opponents pack weak hands, so a strong hand is worth somewhat less than shown.',
		'Variants with jokers, table cards or discards have no card-only strength model and are left out.',
		'A hand’s value uses the pot that was actually played, which depends a little on how everyone bet, including you.',
		'Packing a weak hand is usually right and counts as good play here. "Play" still mixes skill, bluffing, reading opponents and their luck; it is not a pure skill score.'
	],
	'texas-holdem': [
		'Strength is each starting hand’s heads-up equity against a random hand, scaled to the table size. It ignores position, stacks and everything after the flop.',
		'Pot-odds checks apply only to heads-up preflop decisions and compare against a random hand, which flatters weak hands against a raiser.',
		'The decision counts are signals to review, not a mistake rate.'
	],
	blackjack: [
		'Exact for this table’s rules (no splits, dealer stands on 17, no peek) assuming an infinite deck. A real single deck changes values by a small amount.',
		'Only hit, stand and double are evaluated; a timed-out turn is automatic and not counted.',
		'Expected results use the best play from each starting hand; the gap to your actual result is luck plus the cost of any mistakes.'
	],
	rummy: [
		'Rummy is judged on outcomes alone. No hand-strength or decision model is defended for it, so skill and luck are not separated.',
		'Points are kept apart from boots and never added to other games.'
	]
};

function tallyBands(rows) {
	const out = {};
	for (const band of ['weak', 'average', 'strong']) {
		const group = rows.filter((r) => r.band === band);
		const complete = group.filter((r) => r.fact.complete);
		const stayed = complete.filter((r) => !r.packed);
		out[band] = {
			hands: group.length,
			wins: round(group.reduce((s, r) => s + r.fact.won, 0), 2),
			units: round(complete.reduce((s, r) => s + r.fact.units, 0), 1),
			perHand: complete.length ? round(complete.reduce((s, r) => s + r.fact.units, 0) / complete.length, 2) : null,
			stayRate: complete.length ? round(stayed.length / complete.length, 3) : null,
			stay: wilson(stayed.length, complete.length),
			evidence: evidence(group.length, 15)
		};
	}
	return out;
}

function equityGame(game, rows) {
	const n = rows.length;
	const unit = game === 'texas-holdem' ? 'big blinds' : 'boots';
	const facts = rows.map((r) => r.fact);
	const sum = (pick) => rows.reduce((t, r) => t + pick(r), 0);
	const W = sum((r) => r.fact.won);
	const F = sum((r) => r.fair);
	const units = sum((r) => r.fact.units);
	const cards = sum((r) => r.cardsBoots);
	// Wins are kept as the simple, familiar companion: wins against a fair share (same as Phase 2).
	const wins = compare({ actual: W, expected: F, variance: sum((r) => r.fair * (1 - r.fair)), n });
	const perHand = clusteredMean(
		[...new Set(facts.map((f) => f.nightId))].map((id) => {
			const mine = facts.filter((f) => f.nightId === id);
			return { sum: mine.reduce((s, f) => s + f.units, 0), n: mine.length };
		})
	);
	return {
		game,
		model: 'estimated',
		unit,
		hands: n,
		// All three in the same unit and adding up exactly: cards + play = outcome.
		cards: compare({ actual: cards, expected: 0, variance: sum((r) => r.cardsVar), n }),
		play: compare({ actual: units, expected: cards, variance: sum((r) => r.playVar), n }),
		outcome: compare({ actual: units, expected: 0, variance: sum((r) => r.cardsVar + r.playVar), n }),
		wins,
		boots: { total: round(units, 1), perHand: round(perHand.mean, 2), low: round(perHand.low, 2), high: round(perHand.high, 2) },
		byStrength: tallyBands(rows)
	};
}

function holdemChecks(rows) {
	let evaluated = 0;
	let overfold = 0;
	let leak = 0;
	for (const { record, fact } of rows) {
		const own = record.own;
		const hu = own?.dealt?.length === 2 ? holdemEquity(own.dealt) : null;
		if (hu === null) continue;
		for (const e of record.record?.events ?? []) {
			const d = e.decision;
			if (e.p !== fact.seatId || e.sub !== undefined || e.kind === 'system' || !d || d.street !== 'preflop' || d.live !== 1 || !(d.toCall > 0) || !d.potBefore) continue;
			if (!['fold', 'call', 'raise'].includes(e.a)) continue;
			evaluated++;
			const required = d.toCall / (d.potBefore + d.toCall);
			if (e.a === 'fold' && hu > required + 0.15) overfold++;
			if (e.a !== 'fold' && hu < required - 0.05) leak++;
		}
	}
	return { evaluated, foldedAbovePotOdds: overfold, continuedBelowPotOdds: leak, evidence: evidence(evaluated, 20), kind: 'estimated' };
}

/**
 * @param facts the player's complete-or-not facts for the filtered window
 * @param owns Map handId → the player's own hand_private doc
 * @param records Map handId → public hand record (with events when decisions are wanted)
 */
export function skillLuck({ facts, owns, records = new Map() }) {
	const by = (game) => facts.filter((f) => f.gameType === game);
	const games = {};
	const nightRows = [];

	/* Teen Patti */
	const tp = by('teen-patti');
	if (tp.length) {
		const rows = [];
		let unmodelled = 0;
		for (const fact of tp) {
			const row = teenPattiRow(fact, owns.get(fact.handId));
			if (row) rows.push({ ...row, fact });
			else if (fact.complete) unmodelled++;
		}
		if (rows.length) {
			const result = equityGame('teen-patti', rows);
			const strong = result.byStrength.strong;
			const packedStrong = rows.filter((r) => r.band === 'strong' && r.packed).length;
			const stayedWeak = rows.filter((r) => r.band === 'weak' && !r.packed && r.fact.exit === 'lost').length;
			games['teen-patti'] = {
				...result,
				unmodelled,
				decisions: {
					kind: 'estimated',
					packedStrongHands: { k: packedStrong, n: strong.hands, rate: strong.hands ? round(packedStrong / strong.hands, 3) : null },
					playedWeakToTheEnd: { k: stayedWeak, n: result.byStrength.weak.hands, rate: result.byStrength.weak.hands ? round(stayedWeak / result.byStrength.weak.hands, 3) : null },
					note: 'Signals to review: packing a strong hand costs wins, and staying with a weak one is sometimes a deliberate bluff.'
				},
				limitations: LIMITS['teen-patti']
			};
			for (const r of rows) nightRows.push({ nightId: r.fact.nightId, at: r.fact.completedAt, cardsBoots: r.cardsBoots, cardsVar: r.cardsVar, units: r.fact.units });
		} else games['teen-patti'] = { game: 'teen-patti', model: 'unavailable', hands: tp.length, reason: 'no-private-cards-or-variant', limitations: LIMITS['teen-patti'] };
	}

	/* Hold'em */
	const hd = by('texas-holdem');
	if (hd.length) {
		const rows = [];
		for (const fact of hd) {
			const row = holdemRow(fact, owns.get(fact.handId));
			if (row) rows.push({ ...row, fact, record: { own: owns.get(fact.handId), record: records.get(fact.handId) } });
		}
		if (rows.length) {
			games['texas-holdem'] = {
				...equityGame('texas-holdem', rows),
				decisions: holdemChecks(rows.map((r) => ({ ...r.record ? { record: r.record } : {}, fact: r.fact }))),
				classes: Object.entries(
					rows.reduce((m, r) => ((m[holdemClass(owns.get(r.fact.handId).dealt)] = (m[holdemClass(owns.get(r.fact.handId).dealt)] ?? 0) + 1), m), {})
				)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 5)
					.map(([key, count]) => ({ key, count })),
				limitations: LIMITS['texas-holdem']
			};
			for (const r of rows) nightRows.push({ nightId: r.fact.nightId, at: r.fact.completedAt, cardsBoots: r.cardsBoots, cardsVar: r.cardsVar, units: r.fact.units });
		} else games['texas-holdem'] = { game: 'texas-holdem', model: 'unavailable', hands: hd.length, reason: 'no-private-cards', limitations: LIMITS['texas-holdem'] };
	}

	/* Blackjack: exact */
	const bj = by('blackjack').filter((f) => f.complete);
	if (by('blackjack').length) {
		const hands = [];
		const decisions = [];
		for (const fact of bj) {
			const own = owns.get(fact.handId);
			const record = records.get(fact.handId);
			const start = blackjackStartEv(record, own);
			if (start === null) continue;
			hands.push({ fact, start });
			for (const d of blackjackDecisions(record, fact, own)) decisions.push({ ...d, handId: fact.handId, nightId: fact.nightId });
		}
		if (hands.length) {
			const expected = hands.reduce((s, h) => s + h.start, 0);
			const actual = hands.reduce((s, h) => s + h.fact.units, 0);
			const residual = hands.map((h) => h.fact.units - h.start);
			const mean = residual.reduce((s, v) => s + v, 0) / residual.length;
			const varEach = residual.length > 30 ? residual.reduce((s, v) => s + (v - mean) ** 2, 0) / (residual.length - 1) : 1.35;
			const costly = decisions.filter((d) => d.cost > 0.01);
			const cost = decisions.reduce((s, d) => s + d.cost, 0);
			const grouped = new Map();
			for (const d of costly) {
				const key = `${d.action}|${d.total}|${d.up}|${d.cards}`;
				const g = grouped.get(key) ?? { action: d.action, total: d.total, dealerUp: d.up, cost: 0, count: 0 };
				g.cost += d.cost;
				g.count++;
				grouped.set(key, g);
			}
			games.blackjack = {
				game: 'blackjack',
				model: 'exact',
				hands: hands.length,
				// What the starting hands were worth, and what you did with them, exactly.
				outcome: compare({ actual, expected, variance: hands.length * varEach, n: hands.length }),
				decisions: {
					kind: 'exact',
					evaluated: decisions.length,
					optimal: decisions.length - costly.length,
					mistakes: costly.length,
					mistakeRate: decisions.length ? round(costly.length / decisions.length, 3) : null,
					mistake: wilson(costly.length, decisions.length),
					betsLost: round(cost, 2),
					betsLostPer100: decisions.length ? round((cost / decisions.length) * 100, 2) : null,
					common: [...grouped.values()].sort((a, b) => b.cost - a.cost).slice(0, 4).map((g) => ({ ...g, cost: round(g.cost, 2) })),
					evidence: evidence(decisions.length, 40),
					examples: costly.slice(-5).map((d) => ({ handId: d.handId, nightId: d.nightId }))
				},
				boots: { total: round(actual, 1), perHand: round(actual / hands.length, 2) },
				limitations: LIMITS.blackjack
			};
			for (const h of hands) nightRows.push({ nightId: h.fact.nightId, at: h.fact.completedAt, expected: h.start, units: h.fact.units, exact: true, varEach });
		} else games.blackjack = { game: 'blackjack', model: 'unavailable', hands: by('blackjack').length, reason: 'no-private-cards', limitations: LIMITS.blackjack };
	}

	/* Rummy: outcome only */
	const ru = by('rummy').filter((f) => f.complete);
	if (by('rummy').length) {
		const fair = ru.filter((f) => f.fairShare !== null);
		const W = fair.reduce((s, f) => s + f.won, 0);
		const F = fair.reduce((s, f) => s + f.fairShare, 0);
		const V = fair.reduce((s, f) => s + f.fairShare * (1 - f.fairShare), 0);
		games.rummy = {
			game: 'rummy',
			model: 'outcome-only',
			hands: ru.length,
			outcome: compare({ actual: W, expected: F, variance: V, n: fair.length }),
			points: { perHand: ru.length ? round(ru.reduce((s, f) => s + f.net, 0) / ru.length, 1) : null, total: round(ru.reduce((s, f) => s + f.net, 0), 0) },
			limitations: LIMITS.rummy
		};
	}

	return { games, nights: nightSummary(nightRows), method: METHOD };
}

/* ------------------------------------------- per night ------------------------------------------- */

/** For each night: were the cards hot or cold, and what happened? Teen Patti and Hold'em are in wins; Blackjack in bets. */
function nightSummary(rows) {
	const nights = new Map();
	for (const r of rows) {
		const n = nights.get(r.nightId) ?? { nightId: r.nightId, at: r.at, hands: 0, cards: { sum: 0, variance: 0, n: 0 }, blackjack: { actual: 0, expected: 0, variance: 0, n: 0 }, units: 0 };
		n.at = Math.max(n.at, r.at);
		n.hands++;
		n.units += r.units;
		if (r.exact) {
			n.blackjack.actual += r.units;
			n.blackjack.expected += r.expected;
			n.blackjack.variance += r.varEach;
			n.blackjack.n++;
		} else {
			n.cards.sum += r.cardsBoots;
			n.cards.variance += r.cardsVar;
			n.cards.n++;
		}
		nights.set(r.nightId, n);
	}
	return [...nights.values()]
		.sort((a, b) => a.at - b.at)
		.map((n) => {
			const cards = n.cards.n ? compare({ actual: n.cards.sum, expected: 0, variance: n.cards.variance, n: n.cards.n, min: 8 }) : null;
			const bj = n.blackjack.n ? compare({ actual: n.blackjack.actual, expected: n.blackjack.expected, variance: n.blackjack.variance, n: n.blackjack.n, min: 8 }) : null;
			const luck = cards?.verdict === 'above' ? 'hot' : cards?.verdict === 'below' ? 'cold' : bj?.verdict === 'above' ? 'hot' : bj?.verdict === 'below' ? 'cold' : cards || bj ? 'average' : 'unknown';
			return { nightId: n.nightId, at: n.at, hands: n.hands, units: round(n.units, 1), luck, cards, blackjack: bj };
		});
}

const METHOD = Object.freeze({
	cards: 'What your cards were worth: if everyone stayed to the end, each hand’s win chance times its pot, minus its fair share. Zero for an average deal.',
	play: 'What you did beyond the cards: what you actually won or lost minus what those cards were worth. Packing a hand that was worth less than nothing counts in your favour. Mixes skill, bluffing and opponents’ luck.',
	outcome: 'What happened: boots won or lost. Always cards + play.',
	exact: 'Solved for this game’s rules, no estimation involved.',
	estimated: 'A model with stated assumptions; read as a range.',
	'outcome-only': 'No defended model; results only.'
});


/** Every costed Blackjack decision with its time, for improvement tracking. */
export function blackjackCosts({ facts, owns, records }) {
	const out = [];
	for (const fact of facts)
		if (fact.gameType === 'blackjack' && fact.complete)
			for (const d of blackjackDecisions(records.get(fact.handId), fact, owns.get(fact.handId))) out.push({ at: fact.completedAt, cost: d.cost, handId: fact.handId });
	return out;
}
export { blackjackDecisions, blackjackStartEv };
