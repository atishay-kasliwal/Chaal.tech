/**
 * Canonical per-hand facts: the one place a public hand record becomes numbers.
 * Every analytic (player, game, rivals, admin, bots later) starts from these, so each metric
 * has a single definition.
 *
 * Normalisation (docs/ANALYTICS_PHASE2.md):
 * - Chips are never compared raw. Each game has a stake unit: Teen Patti the table's boot,
 *   Hold'em the big blind, Blackjack the player's own opening bet. These are comparable
 *   ("boots" in the UI). Rummy has no stake (points), so it is reported in points and kept out
 *   of cross-game totals.
 * - Winning is judged against a fair share: 1 / players dealt in. A split pot gives each
 *   winner an equal fraction of one win. Blackjack is played against the dealer, so it has no
 *   fair share; it is judged on net bets.
 * - A hand stopped before its result (the night ended mid-hand, refunds) is not complete and
 *   never counts toward results.
 */

export const UNITS = Object.freeze({
	'teen-patti': { one: 'boot', many: 'boots', stake: true },
	'texas-holdem': { one: 'big blind', many: 'big blinds', stake: true },
	blackjack: { one: 'bet', many: 'bets', stake: true },
	rummy: { one: 'point', many: 'points', stake: false }
});
export const GAMES = Object.freeze(Object.keys(UNITS));

/** The stable identity analytics use: a person's playerId, or a bot's permanent botId. */
export function subjectOf(seat) {
	if (seat.kind === 'bot') return `bot:${seat.bot?.botId ?? 'unknown'}`;
	return seat.p;
}

function unitFor(record, seatP) {
	if (record.gameType === 'texas-holdem') return record.config?.bigBlind || 2;
	if (record.gameType === 'blackjack') {
		const deal = record.events?.find((e) => e.a === 'deal');
		const wager = -(deal?.chips?.[seatP] ?? 0);
		return wager > 0 ? wager : record.outcome?.players?.find((p) => p.p === seatP)?.contributed || 2;
	}
	if (record.gameType === 'rummy') return 1;
	return record.config?.boot || 1;
}

/**
 * Facts for every seat in one hand.
 * @returns {Map<string, object>} keyed by seat id (the table's player or bot id)
 */
export function handFacts(record) {
	const outcome = record.outcome ?? { players: [], winners: [] };
	const complete = outcome.pot !== null && outcome.pot !== undefined;
	const winnerIds = (outcome.winners ?? []).map((w) => w.p);
	const players = record.seats.length;
	const game = record.gameType;
	const facts = new Map();
	// Who reached the end of the hand, and what each of them put in: the pot a player who packed early
	// would have been playing for had they stayed (used to value cards without rewarding folding).
	const finishers = outcome.players.filter((p) => p.exit === 'won' || p.exit === 'lost');
	const perFinisher = finishers.length ? finishers.reduce((s, p) => s + (p.contributed ?? 0), 0) / finishers.length : null;
	for (const seat of record.seats) {
		const result = outcome.players.find((p) => p.p === seat.p) ?? { net: 0, contributed: 0, exit: 'unknown' };
		const unit = unitFor(record, seat.p);
		const won = !complete
			? 0
			: game === 'blackjack'
				? result.net > 0 ? 1 : 0
				: winnerIds.includes(seat.p) ? 1 / winnerIds.length : 0;
		facts.set(seat.p, {
			handId: record._id,
			nightId: record.nightId,
			room: record.room,
			handNo: record.handNo ?? null,
			gameType: game,
			rulesVersion: record.rulesVersion ?? null,
			startedAt: record.startedAt,
			completedAt: record.completedAt,
			practice: !!record.practice,
			seatId: seat.p,
			subject: subjectOf(seat),
			kind: seat.kind,
			botId: seat.bot?.botId ?? null,
			players,
			complete,
			won,
			fairShare: game === 'blackjack' || !complete ? null : 1 / players,
			net: complete ? result.net : 0,
			unit,
			units: complete ? result.net / unit : 0,
			stake: UNITS[game]?.stake ?? false,
			contributed: result.contributed ?? 0,
			potUnits: complete && outcome.pot !== null ? outcome.pot / unit : null,
			// The pot had this player stayed to the end: unchanged for someone who did, larger for a folder.
			stayPotUnits:
				complete && outcome.pot !== null
					? (outcome.pot + (result.exit === 'won' || result.exit === 'lost' || perFinisher === null ? 0 : Math.max(0, perFinisher - (result.contributed ?? 0)))) / unit
					: null,
			exit: result.exit,
			shown: !!result.shown,
			order: seat.order ?? null,
			relOrder: players > 1 && seat.order !== null && seat.order !== undefined ? seat.order / (players - 1) : null,
			opponents: record.seats.filter((s) => s.p !== seat.p).map((s) => ({ seatId: s.p, subject: subjectOf(s), kind: s.kind }))
		});
	}
	return facts;
}

/** Facts for one subject across many records (the records must include that subject). */
export function factsFor(records, subject) {
	const out = [];
	for (const record of records) {
		for (const fact of handFacts(record).values()) if (fact.subject === subject) out.push(fact);
	}
	return out.sort((a, b) => a.completedAt - b.completedAt);
}
