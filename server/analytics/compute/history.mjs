/**
 * The player's own nights and hands, and one hand as that player was entitled to see it.
 *
 * The hand view is filtered by the observer model: only events while the viewer was seated,
 * other players' cards only if they were shown while the viewer was present, the viewer's own
 * cards from their private record, no system-only data, and no decision context or timing for
 * anyone but the viewer. It is shaped so a visual replay can be built on it later.
 */
import { handFacts, subjectOf, UNITS } from './facts.mjs';
import { round } from './stats.mjs';

export function nights(facts) {
	const out = new Map();
	for (const f of facts) {
		const n = out.get(f.nightId) ?? { nightId: f.nightId, room: f.room, startedAt: f.startedAt, endedAt: f.completedAt, hands: 0, games: {}, units: 0, points: 0, wins: 0, withBots: false };
		n.hands++;
		n.games[f.gameType] = (n.games[f.gameType] ?? 0) + 1;
		if (f.stake) n.units += f.units;
		else n.points += f.net;
		n.wins += f.won;
		n.withBots ||= f.practice;
		n.startedAt = Math.min(n.startedAt, f.startedAt);
		n.endedAt = Math.max(n.endedAt, f.completedAt);
		out.set(f.nightId, n);
	}
	return [...out.values()]
		.sort((a, b) => b.startedAt - a.startedAt)
		.map((n) => ({ ...n, units: round(n.units, 1), wins: round(n.wins, 1), points: n.points || null }));
}

export function hands(facts, { night, page = 0, pageSize = 25 } = {}) {
	const list = facts.filter((f) => !night || f.nightId === night).sort((a, b) => b.completedAt - a.completedAt);
	return {
		total: list.length,
		page,
		pageSize,
		hands: list.slice(page * pageSize, (page + 1) * pageSize).map((f) => ({
			handId: f.handId,
			nightId: f.nightId,
			at: f.completedAt,
			gameType: f.gameType,
			rulesVersion: f.rulesVersion,
			players: f.players,
			withBots: f.practice,
			complete: f.complete,
			won: round(f.won, 2),
			units: f.stake ? round(f.units, 1) : null,
			points: f.stake ? null : f.net,
			unit: UNITS[f.gameType]?.many,
			exit: f.exit,
			potUnits: round(f.potUnits, 1)
		}))
	};
}

const AMOUNT_ACTIONS = new Set(['call', 'raise', 'show']);

/**
 * One hand for one viewer, or null when the viewer was not at the table.
 * @param record public hand record
 * @param viewer the viewer's seat id (playerId)
 * @param own the viewer's hand_private doc (or null)
 * @param names subject → { name, characterId } for display
 */
export function handDetail(record, viewer, own, names = {}) {
	const presence = record.observers?.find((o) => o.p === viewer);
	if (!presence) return null;
	const facts = handFacts(record);
	const label = (seatId) => {
		const seat = record.seats.find((s) => s.p === seatId);
		const subject = seat ? subjectOf(seat) : seatId;
		return { subject, name: names[subject]?.name ?? (seat?.kind === 'bot' ? 'Bot' : 'A friend'), you: seatId === viewer, kind: seat?.kind ?? null };
	};
	// The viewer saw event i if they were seated in the state it produced (state i + 1).
	const saw = (i) => presence.from <= i + 1 && (presence.until === null || i + 1 <= presence.until);
	const unit = facts.get(viewer)?.unit ?? record.config?.boot ?? 1;
	const events = (record.events ?? [])
		.filter((e) => saw(e.i))
		.map((e) => ({
			i: e.i,
			sub: e.sub ?? null,
			t: e.t ?? null,
			by: e.p === 'system' ? { subject: 'system', name: 'Table' } : label(e.p),
			action: e.a,
			automatic: e.kind === 'system' || e.p === 'system',
			cause: e.cause ?? null,
			...(AMOUNT_ACTIONS.has(e.a) && e.payload?.amount ? { amount: e.payload.amount, amountUnits: round(e.payload.amount / unit, 2) } : {}),
			...(e.players ? { players: e.players.map((p) => label(p)) } : {}),
			// Decision context (options, timing) only for the viewer's own moves.
			...(e.p === viewer && e.decision
				? {
						yours: {
							options: Object.keys(e.decision.legal ?? {}).filter((k) => !['ready', 'start', 'addBot', 'minBet', 'maxBet', 'toCall', 'minRaiseTo', 'maxRaiseTo'].includes(k)),
							toCall: e.decision.toCall ?? null,
							potBefore: e.decision.potBefore ?? null,
							stakeMultiple: e.decision.stakeMultiple ?? null,
							facing: e.decision.facing ?? null,
							blind: e.decision.blind ?? null
						}
					}
				: {})
		}));
	const visible = (entry) => entry.p === viewer || (entry.observedBy ?? []).includes(viewer);
	const shown = [...(record.shown ?? []), ...(record.lateShown ?? []).map((s) => ({ ...s, late: true }))]
		.filter(visible)
		.map((s) => ({ ...label(s.p), cards: s.cards, hand: s.label ?? null, late: !!s.late }));
	return {
		handId: record._id,
		nightId: record.nightId,
		handNo: record.handNo,
		gameType: record.gameType,
		rulesVersion: record.rulesVersion,
		startedAt: record.startedAt,
		completedAt: record.completedAt,
		unit: UNITS[record.gameType]?.one,
		config: { boot: record.config?.boot ?? null, potLimit: record.config?.potLimit ?? null, bigBlind: record.config?.bigBlind ?? null },
		seats: record.seats.map((s) => {
			const f = facts.get(s.p);
			return {
				...label(s.p),
				seat: s.seat,
				order: s.order,
				stack: s.stack,
				net: f?.net ?? null,
				units: f ? round(f.units, 1) : null,
				exit: f?.exit ?? null
			};
		}),
		yourCards: own ? { dealt: own.dealt, final: own.final, hand: own.label ?? null, sawAt: own.seenAt ?? null } : null,
		table: record.table ?? {},
		events,
		shown,
		outcome: {
			reason: record.outcome?.reason ?? null,
			pot: record.outcome?.pot ?? null,
			potUnits: record.outcome?.pot !== null && record.outcome?.pot !== undefined ? round(record.outcome.pot / unit, 1) : null,
			winners: (record.outcome?.winners ?? []).map((w) => label(w.p))
		},
		youLeftAt: presence.until
	};
}
