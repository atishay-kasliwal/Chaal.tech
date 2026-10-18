/**
 * Hand-written public hand records in the recorder's shape (server/analytics/recorder.mjs), so
 * analytics tests can use histories whose correct answers are worked out by hand.
 */
const MIN = 60_000;
export const T0 = Date.UTC(2026, 9, 1, 14, 0);

/** Losers' losses shared among winners by gain: the recorder's flow rule. */
function nettingFlows(players) {
	const winners = players.filter((p) => p.net > 0);
	const total = winners.reduce((s, w) => s + w.net, 0);
	const flows = [];
	for (const payer of players.filter((p) => p.net < 0))
		for (const w of winners) flows.push({ from: payer.p, to: w.p, amt: Math.round(((-payer.net * w.net) / total) * 100) / 100 });
	return flows;
}

let auto = 0;
/**
 * @param o.seats [{ p, net, contributed?, exit?, kind?, bot?, order?, stack?, hidden? }]
 * @param o.winners seat ids that won (split pots: several)
 */
export function hand(o) {
	const id = o.id ?? `h${++auto}`;
	const at = o.at ?? T0 + auto * MIN;
	const game = o.game ?? 'teen-patti';
	const seats = o.seats.map((s, i) => ({
		p: s.p,
		kind: s.kind ?? (s.bot ? 'bot' : 'human'),
		seat: i,
		order: s.order ?? i,
		stack: s.hidden ? null : (s.stack ?? 1000),
		hidden: !!s.hidden,
		connected: true,
		...(s.bot ? { bot: { botId: s.bot, styleId: `${s.bot}@1`, styleVersion: 1, configHash: '0000000000000000', policy: 'tp-heuristic@1' } } : {})
	}));
	const winners = o.winners ?? o.seats.filter((s) => s.net > 0).map((s) => s.p);
	const players = o.seats.map((s) => ({
		p: s.p,
		contributed: s.contributed ?? Math.max(0, -s.net),
		net: s.net,
		exit: s.exit ?? (winners.includes(s.p) ? 'won' : 'lost'),
		exitAt: null,
		shown: !!s.shown
	}));
	return {
		_id: `${o.room ?? 'room'}:${id}`,
		v: 2,
		room: o.room ?? 'room',
		handId: id,
		nightId: o.night ?? 'room:night1',
		handNo: o.handNo ?? auto,
		gameType: game,
		rulesVersion: o.rulesVersion ?? (game === 'teen-patti' ? 'classic-1' : null),
		startedAt: at - MIN,
		completedAt: at,
		practice: o.practice ?? seats.some((s) => s.kind === 'bot'),
		config: { table: 1000, boot: game === 'teen-patti' ? (o.boot ?? 10) : null, potLimit: 0, bigBlind: game === 'texas-holdem' ? (o.bigBlind ?? 2) : null },
		seats,
		observers: o.observers ?? seats.map((s) => ({ p: s.p, from: 0, until: null })),
		table: o.table ?? {},
		events: o.events ?? [{ i: 0, t: 0, p: seats[0].p, kind: 'player', raw: 'start', a: 'deal', payload: {}, chips: o.dealChips ?? {} }],
		outcome: {
			reason: o.stopped ? 'night-ended' : 'show',
			pot: o.stopped ? null : (o.pot ?? players.reduce((s, p) => s + p.contributed, 0)),
			winners: o.stopped ? [] : winners.map((p) => ({ p, amt: players.find((x) => x.p === p).net })),
			players
		},
		shown: o.shown ?? [],
		lateShown: o.lateShown,
		flows: o.flows ?? nettingFlows(players)
	};
}

/** A voluntary decision event with its recorded legal options. */
export function decide(i, p, a, { legal = { pack: true, bet: true, minBet: 10, maxBet: 20 }, facing = 'none', blind = false, potBefore = 30, stackBefore = 1000, amount, kind = 'player', stakeMultiple } = {}) {
	return {
		i,
		t: i * 1000,
		p,
		kind,
		raw: a === 'fold' ? 'pack' : a === 'raise' || a === 'call' ? 'bet' : a,
		a,
		payload: amount ? { amount } : {},
		chips: {},
		decision: { legal, potBefore, stackBefore, toCall: 10, stakeMultiple: stakeMultiple ?? (a === 'raise' ? 2 : a === 'call' ? 1 : undefined), blind, facing, live: 2, lastAggressor: null, turnStartT: 0, ms: 500 }
	};
}

export const timeoutEvent = (i, p, connected = [p]) => ({ i, t: i * 1000, p, kind: 'system', raw: 'timeout', a: 'timeout', cause: 'timeout', payload: {}, chips: {}, connected });
