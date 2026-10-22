/** The ONLY historical ingress into memory: observer-filtered, allow-listed PUBLIC facts.
 * Never accepts a database or reads private/sealed records. Cards are deliberately not retained.
 */
import { decisionsIn } from '../../analytics/compute/patterns.mjs';
import { handFacts, subjectOf } from '../../analytics/compute/facts.mjs';

export const MEMORY_VERSION = 'bot-memory@1';
export const contextOf = (game, variant) => `${game}|${variant ?? '-'}`;
export const contextId = (botId, game, variant) => `${botId}|${contextOf(game, variant)}`;
const finite = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const own = (o, k) => Object.hasOwn(o ?? {}, k);

/** The recorded observer interval is a seat interval; an explicit observedBy list is stricter.
 * For human observers connectivity is also required. Bots are server seats, always connected
 * until they leave. Packing does NOT remove a legitimate observer from the table.
 */
export function observedEvent(record, seat, event) {
	if (!seat || !record.seats?.some((s) => s.p === seat.p)) return false;
	const interval = record.observers?.find((o) => o.p === seat.p);
	if (
		!interval ||
		event.i < interval.from ||
		(interval.until !== null && event.i >= interval.until)
	)
		return false;
	if (Array.isArray(event.observedBy) && !event.observedBy.includes(seat.p)) return false;
	if (
		record.events?.some(
			(e) =>
				e.i < event.i &&
				((e.raw === 'leave' && e.p === seat.p) ||
					(e.raw === 'removeBot' && e.payload?.botId === seat.p))
		)
	)
		return false;
	return seat.kind === 'bot' || (event.connected ?? []).includes(seat.p);
}

/** Scrub BEFORE calling the shared analytics pattern functions. No arbitrary payload, table,
 * legal-table/discard choices, shown cards, trace, hidden stack or analytics field crosses here. */
function cleanEvent(record, event) {
	const actor = record.seats.find((s) => s.p === event.p);
	const d = event.decision;
	const legal = {};
	for (const key of [
		'pack',
		'bet',
		'fold',
		'call',
		'raise',
		'check',
		'show',
		'see',
		'hit',
		'stand',
		'double',
		'drawDiscard',
		'declare'
	])
		if (own(d?.legal, key)) legal[key] = !!d.legal[key];
	for (const key of ['minBet', 'maxBet'])
		if (finite(d?.legal?.[key]) !== null) legal[key] = d.legal[key];
	return {
		i: event.i,
		t: event.t,
		p: event.p,
		a: event.a,
		raw: event.raw,
		kind: event.kind,
		...(event.sub !== undefined
			? {
					sub: event.sub,
					players: (event.players ?? []).filter((p) => record.seats.some((s) => s.p === p))
				}
			: {}),
		connected: (event.connected ?? []).filter((p) => record.seats.some((s) => s.p === p)),
		payload:
			['raise', 'call'].includes(event.a) && finite(event.payload?.amount) !== null
				? { amount: event.payload.amount }
				: {},
		...(d && event.kind !== 'system' && !event.cause
			? {
					decision: {
						legal,
						blind: typeof d.blind === 'boolean' ? d.blind : null,
						potBefore: finite(d.potBefore),
						stackBefore: actor?.hidden ? null : finite(d.stackBefore),
						stakeMultiple: finite(d.stakeMultiple),
						facing: ['raise', 'call'].includes(d.facing) ? d.facing : 'none'
					}
				}
			: {})
	};
}

/** One reproducible contribution, scoped to a permanent bot that was DEALT IN.
 * before is an exclusive time boundary, including late revelations. */
export function observeHand(record, botId, before = Infinity) {
	if (!record || !(record.completedAt < before)) return null;
	const observer = record.seats?.find((s) => s.kind === 'bot' && s.bot?.botId === botId);
	if (!observer || !record.observers?.some((o) => o.p === observer.p)) return null;
	const visible = (record.events ?? []).filter(
		(e) => record.startedAt + (e.t ?? 0) < before && observedEvent(record, observer, e)
	);
	const safe = { ...record, events: visible.map((e) => cleanEvent(record, e)) };
	const facts = handFacts(record);
	const resultEvent = record.events?.findLast((e) => e.a === 'result');
	// Old fixture records may omit the synthetic result: the final observation is required.
	const finalEvent = resultEvent ?? record.events?.at(-1);
	const sawResult = !!finalEvent && observedEvent(record, observer, finalEvent);
	const peers = record.seats
		.filter((s) => s.p !== observer.p)
		.map((seat) => {
			const fact = facts.get(seat.p);
			const set = decisionsIn(safe, seat.p, { unit: fact.unit });
			const rawByIndex = new Map(safe.events.map((e) => [e.i, e]));
			const decisions = set.decisions.map((d) => ({
				i: d.i,
				at: record.startedAt + (rawByIndex.get(d.i)?.t ?? 0),
				action: d.action,
				betting: d.betting,
				options: d.options,
				facing: d.facing,
				blind: d.blind,
				// TP raises have at most a 2x step; 'large' refers to price relative to the public pot.
				largeRaise:
					d.facing === 'raise' &&
					(() => {
						const e = visible.filter((e) => e.i < d.i && e.a === 'raise').at(-1);
						return (
							!!e && e.decision?.potBefore > 0 && e.payload?.amount / e.decision.potBefore >= 0.75
						);
					})(),
				stakeMultiple: d.stakeMultiple,
				potUnits: d.potUnits,
				stackUnits: d.stackUnits,
				relOrder: d.relOrder
			}));
			const flows = sawResult
				? (record.flows ?? []).reduce(
						(n, f) =>
							n +
							(f.from === observer.p && f.to === seat.p
								? f.amt
								: f.from === seat.p && f.to === observer.p
									? -f.amt
									: 0),
						0
					) / fact.unit
				: 0;
			return {
				playerId: subjectOf(seat),
				kind: seat.kind,
				decisions,
				timeouts: set.timeouts.length,
				disconnectedTimeouts: set.timeouts.filter((t) => !t.connected).length,
				automatic: visible.filter((e) => e.p === seat.p && (e.kind === 'system' || e.cause)).length,
				result:
					sawResult && fact.complete
						? { won: fact.won, units: fact.units, netBetween: flows }
						: null,
				blindDecisions: set.hand?.blindDecisions ?? 0,
				stayedBlind:
					decisions.some((d) => d.betting && d.blind) && !decisions.some((d) => d.action === 'see'),
				sawCompleteHand: record.observers.find((o) => o.p === observer.p)?.from === 0 && sawResult
			};
		});
	const episodes = [];
	for (const peer of peers) {
		for (const d of peer.decisions) {
			const tags = [];
			if (d.action === 'raise' && d.blind && (d.potUnits >= 20 || d.stakeMultiple >= 2))
				tags.push('blind-pressure');
			if (d.action === 'fold' && d.facing === 'raise') tags.push('packed-under-pressure');
			if (d.action === 'show') tags.push('show');
			if (tags.length)
				episodes.push({
					id: `${record._id}:${d.i}:${peer.playerId}`,
					handId: record._id,
					event: d.i,
					playerId: peer.playerId,
					at: d.at,
					tags
				});
		}
		if (peer.result && Math.abs(peer.result.netBetween) >= 20)
			episodes.push({
				id: `${record._id}:pot:${peer.playerId}`,
				handId: record._id,
				playerId: peer.playerId,
				at: record.completedAt,
				tags: ['large-shared-pot'],
				units: peer.result.netBetween
			});
	}
	// A late reveal is an episode only when this bot was explicitly present. Never retain cards.
	for (const shown of [...(record.shown ?? []), ...(record.lateShown ?? [])]) {
		const at = shown.t ?? record.startedAt + (record.events.find((e) => e.i === shown.at)?.t ?? 0);
		if (!(at < before) || !shown.observedBy?.includes(observer.p) || shown.p === observer.p)
			continue;
		const target = record.seats.find((s) => s.p === shown.p);
		if (target)
			episodes.push({
				id: `${record._id}:shown:${shown.p}:${at}`,
				handId: record._id,
				event: shown.at ?? null,
				playerId: subjectOf(target),
				at,
				tags: ['public-reveal']
			});
	}
	return {
		schema: MEMORY_VERSION,
		botId,
		game: record.gameType,
		variant: record.rulesVersion ?? null,
		handId: record._id,
		nightId: record.nightId,
		handNo: record.handNo,
		startedAt: record.startedAt,
		at: record.completedAt,
		styleId: observer.bot.styleId,
		peers,
		episodes,
		through: Math.max(record.completedAt, ...episodes.map((e) => e.at))
	};
}
