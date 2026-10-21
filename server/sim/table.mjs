import { performance } from 'node:perf_hooks';
import { freshDeck } from '../classic.mjs';
import { getVariant } from '../variants/index.mjs';
import { newRoom, transition, playing, projection } from '../engine.mjs';
import { nextBotMove, seatDecider, updateMinds, botDue } from '../bots/runner.mjs';
import { member } from './population.mjs';
import { styleForSeat } from '../bots/dna-styles.mjs';
import { stream, shuffle } from './seeds.mjs';
import { handPercentile } from './judge.mjs';

/**
 * A headless table on the real engine (`transition`, `projection`) with the real production
 * deciders, exactly as a room runs bots, minus timers and networking. Every deck and decision is
 * seeded from (seed, table, hand, step), so the same spec always plays the same hands.
 *
 * A hand depends on the stacks the previous hands left, so reproducing hand h replays the table
 * from hand 0 (cheap: about a millisecond a hand).
 */
export const SIM_VERSION = 'sim@1';
const ctx = { now: 1000, turnMs: 60000, connected: new Set() };

/** Move names used everywhere in measurement. */
export const MOVES = Object.freeze(['pack', 'see', 'chaal', 'raise', 'show', 'discard', 'table']);

function moveName(move, legal) {
	if (move.action !== 'bet') return move.action;
	return move.payload.amount > legal.minBet ? 'raise' : 'chaal';
}

/**
 * @param spec { seed, table, seats: memberId[], hands, rulesVersion?, boot?, stack?, traces? }
 * @param onHand optional callback per finished hand (streaming)
 * @param hooks { decision?({ room, view, actor, move, row }) } extra fields per decision row
 */
export function runTable(spec, onHand = null, hooks = {}) {
	const {
		seed,
		table,
		seats,
		hands,
		rulesVersion = 'classic-1',
		boot = 10,
		stack = 1000,
		traces = false,
		stopAfter = Infinity,
		// Decisions can be seeded apart from decks: same cards, different choices (session studies).
		decisionSeed = seed,
		// Matched (duplicate) play: each seat's k-th decision of a hand draws from its own stream,
		// so when one seat changes policy the others keep their draws (classic variant only).
		matched = false
	} = spec;
	if (matched && rulesVersion !== 'classic-1') throw new Error('matched play needs classic-1');
	const variant = getVariant(rulesVersion);
	let room = newRoom('sim-table', stack, 'host', rulesVersion, { boot, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	const members = {};
	seats.forEach((id, i) => {
		const m = member(id);
		const botId = `bot-seat-${i}`;
		room = transition(room, 'host', 'addBot', m.seat(room, botId), ctx);
		members[botId] = { ...m, seat: i };
	});
	room = transition(room, 'host', 'leave', {}, ctx);
	// Archetypes with their own starting stack (short-stacked, rich); chips stay conserved.
	for (const p of room.players) {
		const m = members[p.id];
		if (!m?.stack) continue;
		room.issuedChips += m.stack * boot - p.balance;
		p.balance = m.stack * boot;
	}
	const deciderOf = (p) => members[p.id].decide ?? seatDecider(p);
	// Bots on mind-keeping styles remember the session, exactly as in a live room. Offline only:
	// a style under test keeps a mind too, each state's projections are computed once (states are
	// never changed after a transition), and minds are updated in place (snapshots are copies).
	const views = new WeakMap();
	const project = (state, id, connected) => {
		let byId = views.get(state);
		if (!byId) views.set(state, (byId = new Map()));
		if (!byId.has(id)) byId.set(id, projection(state, id, connected));
		return byId.get(id);
	};
	const mindOptions = {
		styleOf: (p) => members[p.id]?.style ?? styleForSeat(p.bot),
		project,
		mutate: true
	};
	let minds = updateMinds({}, null, room, mindOptions);
	let mindMs = 0;
	const advance = (before, after) => {
		const t0 = performance.now();
		minds = updateMinds(minds, before, after, mindOptions);
		mindMs += performance.now() - t0;
		return after;
	};

	const out = [];
	for (let h = 0; h < hands && h <= stopAfter; h++) {
		const before = Object.fromEntries(
			room.players
				.filter((p) => p.bot)
				.map((p) => [p.id, { balance: p.balance, rebuys: p.bot.rebuys }])
		);
		const dealer = room.players.find((p) => p.bot && !p.departed).id;
		const deck = shuffle(freshDeck(), stream(seed, 'deck', table, h).random);
		const preDeal = room;
		room = transition(
			{ ...room, hostId: dealer },
			dealer,
			'start',
			{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion },
			{
				...ctx,
				deck,
				// Another night at the same table (a different decision seed) has its own hand ids.
				handId: decisionSeed === seed ? `s${table}-${h}` : `s${table}-${h}-n${decisionSeed}`,
				requireReady: true
			}
		);
		advance(preDeal, room);
		mindMs = 0;
		const decisions = [];
		const turns = {};
		const lastAct = {};
		let lastRaise = -1;
		let step = 0;
		while (playing(room)) {
			if (step > 5000) throw new Error(`Table ${table} hand ${h} stalled`);
			let rng;
			if (matched) {
				const seatOf = members[botDue(room, ctx.connected)].seat;
				turns[seatOf] = (turns[seatOf] ?? 0) + 1;
				rng = stream(decisionSeed, 'decision', table, h, 'seat', seatOf, turns[seatOf]);
			} else rng = stream(decisionSeed, 'decision', table, h, step);
			const t0 = performance.now();
			const move = nextBotMove(room, ctx.connected, rng.random, { deciderOf, minds });
			const ms = performance.now() - t0;
			if (!move) throw new Error(`Table ${table} hand ${h}: no bot move`);
			const actor = room.players.find((p) => p.id === move.botId);
			const view = projection(room, actor.id, ctx.connected);
			const legal = view.legalActions;
			const name = moveName(move, legal);
			const seat = members[actor.id].seat;
			const probs = move.trace?.probs;
			const row = {
				i: step,
				seat,
				name,
				blind: actor.isBlind,
				rounds: (actor.handBet ?? 0) / boot,
				showOk: !!legal.show,
				raiseOk: !!legal.bet && legal.maxBet > legal.minBet,
				forced: !legal.bet && !legal.show,
				facing: lastRaise > (lastAct[seat] ?? -1),
				alive: room.players.filter((p) => p.cards.length && !p.isPacked && !p.departed).length,
				reason: move.reason ?? null,
				entropy: probs ? entropy(probs) : null,
				ms,
				draws: rng.draws,
				...(traces ? { move } : {})
			};
			// Offline grading (server/sim/judge.mjs) sees the bot's own cards, before the move.
			if (hooks.decision) row.q = hooks.decision({ room, view, actor, move, row });
			decisions.push(row);
			if (name === 'raise') lastRaise = step;
			if (['pack', 'chaal', 'raise', 'show', 'see'].includes(name)) lastAct[seat] = step;
			room = advance(room, transition(room, move.botId, move.action, move.payload, ctx));
			step++;
		}
		const revealed = new Set(room.result?.revealedPlayerIds ?? []);
		const winners = new Set(
			room.result?.winners ? room.result.winners.map((w) => w.id) : [room.result?.winnerId]
		);
		const hand = {
			h,
			decisions,
			reason: room.result?.reason ?? null,
			mindMs,
			...(traces ? { minds: structuredClone(minds) } : {}),
			seats: room.players
				.filter((p) => p.bot)
				.map((p) => {
					const start = before[p.id];
					const rebuy = (p.bot.rebuys - start.rebuys) * room.table;
					return {
						seat: members[p.id].seat,
						member: members[p.id].id,
						dealt: p.cards.length > 0,
						net: (p.balance - start.balance - rebuy) / boot,
						showdown: revealed.has(p.id),
						// Cards shown at a showdown are public: their percentile (classic only).
						shownP:
							revealed.has(p.id) && rulesVersion === 'classic-1' && p.cards.length === 3
								? handPercentile(p.cards)
								: null,
						won: winners.has(p.id)
					};
				})
		};
		if (onHand) onHand(hand);
		else out.push(hand);
	}
	return out;
}

export function entropy(probs) {
	let e = 0;
	for (const p of Object.values(probs)) if (p > 0) e -= p * Math.log2(p);
	return e;
}

/** The exact hand h of a table spec, replayed from the start with the same seeds. */
export function reproduceHand(spec, h) {
	const hands = runTable({ ...spec, hands: h + 1, traces: true });
	return hands[h];
}
