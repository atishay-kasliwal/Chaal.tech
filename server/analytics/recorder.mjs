/**
 * Hand recorder v2 (docs/archive/ANALYTICS_SPEC.md §10.3, §15).
 *
 * A hand is recorded as its pre-deal snapshot plus every input to `transition()`, in order, with
 * the context each input ran under (clock, turn length, connected players, deck, every random
 * draw). `transition()` is pure, so that is enough to rebuild the exact state at every decision.
 *
 * Capture is cheap and happens inside the room's commit transaction (`recordCommit`). When a hand
 * ends, it is replayed and every intermediate state is checked against the hash taken live. Only
 * a hand that replays exactly becomes records; anything else becomes an explicit failure row.
 * The recorder never changes the room: it only reads snapshots that are already committed.
 *
 * Output tiers, written to separate collections (server/analytics/store.mjs):
 *   public  - hand_records: what every seated player could observe
 *   private - hand_private: one player's own cards
 *   sealed  - hand_sealed: replay inputs, deck order, hidden balances, bot decision traces
 */
import { transition, projection, playing, limits } from '../engine.mjs';
import { nextBotMove } from '../bots/runner.mjs';
import { identityForSeat, STYLES, LEGACY_POLICY } from '../bots/identity.mjs';
import { ADAPTIVE_POLICY } from '../bots/memory/adaptive.mjs';
import { CHARACTER_POLICY, configErrors } from '../bots/config.mjs';
import { updateMinds } from '../bots/runner.mjs';
import { DNA_POLICIES } from '../bots/policies.mjs';
import { getVariant } from '../variants/index.mjs';
import { canonicalJson, fingerprint64 } from './hash.mjs';
import { handVersions, replayUnavailable } from '../games/versions.mjs';

export const RECORDER_VERSION = 2;

export class ReplayError extends Error {
	constructor(message, step = null) {
		super(message);
		this.name = 'ReplayError';
		this.step = step;
	}
}

/** This code no longer implements the versions a hand was played under. Never approximated. */
export class ReplayUnavailable extends Error {
	constructor(reason) {
		super(`Replay unavailable: ${reason}`);
		this.name = 'ReplayUnavailable';
		this.reason = reason;
	}
}

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
export const stateHash = (json) => fingerprint64(json);

/**
 * The part of a room that defines what happened in the game: seats, cards, chips, turn, table
 * cards and result. Two engines that agree on this at every step played the hand identically,
 * even if their snapshots differ in bookkeeping fields. Recorded beside the exact hash so a
 * harmless refactor reads as "compatible" instead of breaking every historical replay.
 */
export function semanticState(room) {
	const result = room.result
		? {
				winnerId: room.result.winnerId ?? null,
				winners: room.result.winners ?? null,
				amount: room.result.amount ?? null,
				reason: room.result.reason ?? null,
				payouts: room.result.payouts ?? null,
				losses: room.result.losses ?? null
			}
		: null;
	return {
		handId: room.handId ?? null,
		gameType: room.gameType ?? 'teen-patti',
		rulesVersion: room.rulesVersion ?? null,
		isStarted: !!room.isStarted,
		gameShow: !!room.gameShow,
		pot: room.pot ?? 0,
		currentPlayerId: room.currentPlayerId ?? null,
		stage: room.stage ?? null,
		board: room.board ?? null,
		dealerCards: room.dealerCards ?? null,
		discardPile: room.discardPile ?? null,
		wildRank: room.wildRank ?? null,
		variantState: room.variantState ?? null,
		hostId: room.hostId ?? null,
		ended: !!room.ended,
		result,
		players: (room.players ?? []).map((p) => ({
			id: p.id,
			seatNumber: p.seatNumber ?? null,
			balance: p.balance,
			cards: p.cards ?? [],
			handBet: p.handBet ?? null,
			isBlind: p.isBlind ?? null,
			isPacked: p.isPacked ?? null,
			folded: p.folded ?? null,
			dropped: p.dropped ?? null,
			departed: !!p.departed,
			status: p.status ?? null,
			blackjackBet: p.blackjackBet ?? null
		}))
	};
}
export const semanticHash = (room) => fingerprint64(canonicalJson(semanticState(room)));

/* ------------------------------------------------------------------------------------------ */
/* Capture                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Plain-JSON copy of a transition context, taken before the transition can touch it. */
function freezeCtx(ctx = {}) {
	const out = {};
	for (const [key, value] of Object.entries(ctx)) {
		if (key === 'randomInt' || value === undefined || typeof value === 'function') continue;
		out[key] = value instanceof Set ? [...value] : value;
	}
	if (ctx.connected instanceof Set) out.connectedSet = true;
	if (typeof ctx.randomInt === 'function') out.random = true;
	return clone(out);
}

/**
 * Wrap a transition context so every random draw is logged. Use `ctx` for the transition and
 * `step()` to describe the input for `recordCommit`.
 */
export function stepRecorder(ctx = {}) {
	const frozen = freezeCtx(ctx);
	const draws = [];
	const live =
		typeof ctx.randomInt === 'function'
			? {
					...ctx,
					randomInt: (...args) => {
						const value = ctx.randomInt(...args);
						draws.push([args, value]);
						return value;
					}
				}
			: ctx;
	return {
		ctx: live,
		step(actor, action, payload = {}, extra = {}) {
			return {
				actor,
				action,
				payload: clone(payload) ?? {},
				ctx: { ...frozen, ...(draws.length ? { draws: clone(draws) } : {}) },
				kind: 'player',
				...extra
			};
		}
	};
}

/** sfc32: a small deterministic generator, expanded from a secure per-decision seed. */
function sfc32([a, b, c, d]) {
	return () => {
		a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
		let t = (a + b) | 0;
		a = b ^ (b >>> 9);
		b = (c + (c << 3)) | 0;
		c = (c << 21) | (c >>> 11);
		d = (d + 1) | 0;
		t = (t + d) | 0;
		c = (c + t) | 0;
		return (t >>> 0) / 0x1_0000_0000;
	};
}

/**
 * A bot's random source for one decision: a 128-bit seed from the secure source, expanded
 * deterministically. Recording the seed and the number of draws replays the decision exactly.
 */
export function botRandom(randomUint32) {
	const seed = [randomUint32(), randomUint32(), randomUint32(), randomUint32()];
	const next = sfc32(seed);
	const rng = {
		seed,
		draws: 0,
		random: () => {
			rng.draws++;
			return next();
		}
	};
	return rng;
}

function restoreCtx(saved = {}) {
	const { draws = [], connected, connectedSet, random, ...rest } = clone(saved);
	let next = 0;
	return {
		...rest,
		...(connected !== undefined ? { connected: connectedSet ? new Set(connected) : connected } : {}),
		...(random
			? {
					randomInt: (...args) => {
						const draw = draws[next++];
						if (!draw || JSON.stringify(draw[0]) !== JSON.stringify(args))
							throw new ReplayError('Random draws do not match the recorded hand');
						return draw[1];
					}
				}
			: {})
	};
}

/** Apply one recorded input exactly as the room did. Returns the committed (JSON) state. */
export function applyStep(before, step) {
	let after;
	if (step.action === 'hostRecovery')
		after = { ...before, hostId: step.payload.hostId, revision: before.revision + 1 };
	else after = transition(before, step.actor, step.action, step.payload, restoreCtx(step.ctx));
	if (step.seal) after.seal = clone(step.seal);
	return clone(after);
}

/* ------------------------------------------------------------------------------------------ */
/* Commit-time recording                                                                       */
/* ------------------------------------------------------------------------------------------ */

const emptyStats = () => ({ handsStarted: 0, captured: 0, failed: 0 });
const emptyState = () => ({ v: RECORDER_VERSION, night: null, bots: {}, hand: null, last: null, stats: emptyStats() });

/** Over: a new hand replaced it, or the room is no longer playing it (result, refund, end). */
const handOver = (hand, after) => after.handId !== hand.handId || !playing(after);

function failureRow(room, handId, reason, detail = {}, at = Date.now()) {
	return {
		id: `fail:${room}:${handId ?? 'none'}:${at}`,
		payload: { type: 'failure', room, handId: handId ? `${room}:${handId}` : null, reason, detail, at }
	};
}

/**
 * Record one committed room change. Pure: returns the next recorder state and outbox rows.
 * Throws only on programming errors; callers use `recordCommitSafely`.
 */
export function recordCommit(state, { before, after, afterJson, step, now, engine = null }) {
	const next = state ? clone(state) : emptyState();
	next.stats ??= emptyStats();
	const rows = [];
	const room = after.name;
	if (!next.night) next.night = { id: `${room}:${now}`, startedAt: now, handNo: 0, seq: 0 };

	// A bot's identity is frozen when it sits down, so a later style change never relabels it.
	if (step.action === 'addBot' && after.players.some((p) => p.id === step.payload?.botId))
		next.bots[step.payload.botId] = identityForSeat(after.players.find(p => p.id === step.payload.botId)?.bot) ?? {
			unresolved: true,
			level: step.payload.level ?? null,
			character: step.payload.character ?? null
		};

	const entry = {
		...step,
		t: now,
		h: stateHash(afterJson ?? JSON.stringify(after)),
		s: semanticHash(after),
		rev: after.revision
	};
	const startsHand = !!after.handId && after.handId !== before?.handId;

	if (next.hand && (startsHand || next.hand.handId !== after.handId)) {
		// The recorded hand stopped being the room's hand without ending: never a partial record.
		if (!next.hand.failed)
			rows.push(failureRow(room, next.hand.handId, 'superseded', { by: after.handId }, now));
		next.hand = null;
	}

	if (startsHand) {
		next.night.handNo += 1;
		next.stats.handsStarted += 1;
		next.hand = {
			handId: after.handId,
			versions: handVersions(after, { engine, recorder: RECORDER_VERSION }),
			nightId: next.night.id,
			handNo: next.night.handNo,
			prevHandId: next.last?.handId ?? null,
			startedAt: now,
			preDeal: before,
			steps: [entry],
			bots: Object.fromEntries(
				after.players
					.filter((p) => p.bot)
					.map((p) => [p.id, next.bots[p.id] ?? { ...identityForSeat(p.bot), resolvedAt: 'deal' }])
			)
		};
	} else if (next.hand && !next.hand.failed) next.hand.steps.push(entry);
	else if (!next.hand && step.action !== 'see') rows.push(...betweenHands(next, { before, after, step, now }));

	if (next.hand && handOver(next.hand, after)) {
		// Replay and record building happen when the outbox is flushed, off the gameplay path.
		if (!next.hand.failed) {
			rows.push({
				id: `cap:${room}:${next.hand.handId}`,
				payload: { type: 'capture', room, engine, recorder: RECORDER_VERSION, hand: next.hand }
			});
			next.stats.captured += 1;
			next.last = { handId: next.hand.handId };
		}
		next.hand = null;
	}

	next.stats.failed += rows.filter((row) => row.payload.type === 'failure').length;
	if (after.ended && !before?.ended) {
		rows.push(nightEvent(next, { t: now, p: step.actor, a: 'night-ended', payload: {} }, room));
		next.night = null;
	}
	return { state: next, rows };
}

/**
 * Never lets analytics break a commit. A recorder error abandons only the current hand's
 * recording (marked failed, with a failure row) and play continues untouched.
 */
export function recordCommitSafely(state, input) {
	try {
		const out = recordCommit(state, input);
		// The room stores both as JSON in the same transaction: prove they serialise here.
		JSON.stringify(out.state);
		for (const row of out.rows) JSON.stringify(row.payload);
		return out;
	} catch (error) {
		const room = input.after?.name ?? 'unknown';
		const handId = state?.hand?.handId ?? input.after?.handId ?? null;
		let next;
		try {
			next = state ? clone(state) : emptyState();
			if (next.hand) next.hand = { handId: next.hand.handId, failed: true, steps: [] };
			next.stats = { ...(next.stats ?? emptyStats()), failed: (next.stats?.failed ?? 0) + 1 };
		} catch {
			next = emptyState();
		}
		return {
			state: next,
			rows: [failureRow(room, handId, 'recorder-error', { message: String(error?.message ?? error).slice(0, 500) }, input.now)],
			error
		};
	}
}

/** The room is closing while a hand is being recorded: say so rather than lose it silently. */
export function abandonOpenHand(state, room, now = Date.now()) {
	if (!state?.hand || state.hand.failed) return [];
	return [failureRow(room, state.hand.handId, 'room-closed-mid-hand', {}, now)];
}

function nightEvent(state, event, room) {
	const seq = (state.night.seq += 1);
	return {
		id: `nev:${state.night.id}:${seq}`,
		payload: {
			type: 'night-event',
			nightId: state.night.id,
			room,
			startedAt: state.night.startedAt,
			event: { seq, ...event }
		}
	};
}

function balanceChanges(before, after) {
	const changes = {};
	for (const p of after?.players ?? []) {
		const delta = p.balance - (before?.players.find((old) => old.id === p.id)?.balance ?? 0);
		if (delta && before?.players.some((old) => old.id === p.id)) changes[p.id] = delta;
	}
	return changes;
}

/**
 * Who actually saw something happen: seated players who were connected at that moment, and
 * seated bots (always present). Seated but disconnected people are listed apart, never as
 * observers, so analytics and bot memory cannot learn what someone was not there to see.
 */
export function presence(room, connectedIds, exclude = null) {
	const connected = Array.isArray(connectedIds) ? new Set(connectedIds) : null;
	const seated = room.players.filter((p) => p.seatNumber !== null && !p.departed && p.id !== exclude);
	if (!connected) return { observedBy: seated.filter((p) => p.bot).map((p) => p.id), absent: [], presenceUnknown: true };
	return {
		observedBy: seated.filter((p) => p.bot || connected.has(p.id)).map((p) => p.id),
		absent: seated.filter((p) => !p.bot && !connected.has(p.id)).map((p) => p.id)
	};
}

/** Between hands: joins, leaves, readiness, picks, cuts, lending, bots, late reveals. */
function betweenHands(state, { before, after, step, now }) {
	const rows = [];
	const event = {
		t: now,
		p: step.actor,
		a: before ? step.action : 'create',
		kind: step.kind ?? 'player',
		payload: step.payload ?? {},
		afterHand: state.last?.handId ?? null
	};
	if (step.action === 'addBot') {
		// The authoritative add payload carries a replay snapshot. Night events are public:
		// retain only identity metadata, never policy inputs, tendencies or validation reports.
		const identity = state.bots[step.payload?.botId];
		event.payload = {};
		event.identity = identity ? Object.fromEntries(
			['botId', 'styleId', 'styleVersion', 'configHash', 'policy'].map(key => [key, identity[key]])
		) : null;
	}
	if (step.action === 'answerChipRequest') event.chips = balanceChanges(before, after);
	rows.push(nightEvent(state, event, after.name));
	// A late reveal makes cards public to everyone still at the table.
	if (step.action === 'reveal' && state.last?.handId && after.handId === state.last.handId) {
		const player = after.players.find((p) => p.id === step.actor);
		rows.push({
			id: `rev:${after.name}:${after.handId}:${step.actor}`,
			payload: {
				type: 'reveal',
				handId: `${after.name}:${after.handId}`,
				entry: {
					p: step.actor,
					cards: clone(player?.cards ?? []),
					t: now,
					...presence(after, step.ctx?.connected, step.actor)
				}
			}
		});
	}
	return rows;
}

/* ------------------------------------------------------------------------------------------ */
/* Replay                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/**
 * Re-run a recorded hand from its pre-deal state. Verifies every intermediate state hash and
 * every bot decision; throws ReplayError at the first divergence.
 */
export function replayHand(preDeal, steps, { bots = {}, botChecks = [], match = {} } = {}) {
	const states = [clone(preDeal)];
	match.mode = 'exact';
	// Bot minds as they were at the deal, folded forward exactly as the room did (BOT_BRAIN §6.4).
	let minds = clone(steps[0]?.minds ?? {});
	steps.forEach((step, index) => {
		const before = states[index];
		if (step.kind === 'bot' && step.bot)
			botChecks.push({ i: index, verified: verifyBotDecision(before, step, index, bots, minds) });
		let after;
		try {
			after = applyStep(before, step);
		} catch (error) {
			if (error instanceof ReplayError) throw new ReplayError(error.message, index);
			throw new ReplayError(`Step ${index} (${step.action}) failed on replay: ${error?.message}`, index);
		}
		if (step.h && stateHash(JSON.stringify(after)) !== step.h) {
			// Same game, different bookkeeping (a refactored engine): compatible, and reported so.
			if (!step.s || semanticHash(after) !== step.s)
				throw new ReplayError(`State diverged at step ${index} (${step.action})`, index);
			match.mode = 'compatible';
		}
		states.push(after);
		minds = updateMinds(minds, before, after);
	});
	return states;
}

/**
 * Re-run a bot's decision with the exact style it played under. A style the running code can no
 * longer interpret is reported as unavailable, never re-interpreted with today's behaviour.
 */
function styleProfile(identity, bot) {
	const style = replayStyle(identity, bot);
	return style && !DNA_POLICIES.has(style.policy) && style.policy !== ADAPTIVE_POLICY ? style.tendencies : null;
}

/** The exact style a recorded bot played, or null when the running code cannot interpret it. */
function replayStyle(identity, bot) {
	const style = bot?.style ?? (identity?.styleId ? STYLES[identity.styleId] : null);
	if (!style || style.configHash !== identity?.configHash || style.botId !== identity.botId || style._id !== identity.styleId || style.version !== identity.styleVersion) return null;
	if ([CHARACTER_POLICY, ADAPTIVE_POLICY].includes(style.policy) || DNA_POLICIES.has(style.policy) ? configErrors(style).length > 0 : style.policy !== LEGACY_POLICY) return null;
	return style;
}

function verifyBotDecision(state, step, index, bots, minds = {}) {
	if (!replayStyle(bots[step.actor], state.players.find(p => p.id === step.actor)?.bot)) return 'policy-unavailable';
	if (!Array.isArray(step.bot.seed)) throw new ReplayError('Bot decision has no recorded seed', index);
	const next = sfc32(step.bot.seed);
	let used = 0;
	const random = () => {
		if (++used > step.bot.draws) throw new ReplayError('Bot used more random draws than recorded', index);
		return next();
	};
	const connected = new Set(step.ctx?.connected ?? []);
	const adaptive = state.players.find(p => p.id === step.actor)?.bot?.style?.policy === ADAPTIVE_POLICY;
	if (adaptive && (!step.bot.memory || step.bot.memory.asOf > step.t)) throw new ReplayError('Missing/future frozen memory', index);
	const move = nextBotMove(state, connected, random, {
		profileFor: (id) => styleProfile(bots[id], state.players.find(p => p.id === id)?.bot) ?? undefined,
		memoryFor: id => id === step.actor ? step.bot.memory : undefined,
		minds
	});
	if (adaptive && canonicalJson(move?.adaptive) !== canonicalJson(step.bot.adaptive)) throw new ReplayError('Adaptive trace is not reproducible', index);
	if (
		!move ||
		move.botId !== step.actor ||
		move.action !== step.action ||
		canonicalJson(move.payload ?? {}) !== canonicalJson(step.payload ?? {}) ||
		used !== step.bot.draws ||
		(step.bot.trace !== undefined && canonicalJson(move.trace ?? null) !== canonicalJson(step.bot.trace))
	)
		throw new ReplayError(`Bot decision at step ${index} is not reproducible`, index);
	return 'reproduced';
}

/* ------------------------------------------------------------------------------------------ */
/* Derivation: public, private and sealed records from replayed states                         */
/* ------------------------------------------------------------------------------------------ */

const gameOf = (room) => room.gameType ?? 'teen-patti';
const seatedIds = (room) =>
	room.players.filter((p) => p.seatNumber !== null && !p.departed).map((p) => p.id);
const NON_GAME = new Set([
	'join',
	'addBot',
	'removeBot',
	'answerChipRequest',
	'requestChips',
	'cancelChipRequest'
]);

/** Out of the hand, per game: packed (Teen Patti), folded (Hold'em), dropped (Rummy), or left. */
function isOut(game, player) {
	if (!player || player.departed) return true;
	if (game === 'teen-patti') return !!player.isPacked;
	if (game === 'texas-holdem') return !!player.folded;
	if (game === 'rummy') return !!player.dropped;
	return false;
}

/** One vocabulary across games (spec §4.0). */
function canonical(game, step, before) {
	const { action, payload } = step;
	if (action === 'start') return 'deal';
	if (action === 'timeout') return 'timeout';
	if (action === 'leave') return 'leave';
	if (game === 'teen-patti') {
		if (action === 'bet') {
			const player = before.players.find((p) => p.id === step.actor);
			return payload.amount > limits(before, player).min ? 'raise' : 'call';
		}
		return { pack: 'fold', see: 'see', show: 'show', discard: 'discard', table: 'table', reveal: 'reveal' }[action] ?? 'other';
	}
	if (game === 'texas-holdem') return ['fold', 'check', 'call', 'raise'].includes(action) ? action : 'other';
	if (game === 'blackjack') return ['hit', 'stand', 'double'].includes(action) ? action : 'other';
	if (game === 'rummy')
		return { 'draw-stock': 'draw', 'draw-discard': 'draw', discard: 'discard', declare: 'show' }[action] ?? 'other';
	return 'other';
}
const DECISIONS = new Set(['fold', 'check', 'call', 'raise', 'see', 'show', 'discard', 'table', 'draw', 'hit', 'stand', 'double']);

function safeProjection(room, id, connected) {
	try {
		return projection(room, id, connected);
	} catch {
		return null;
	}
}

function compactLegal(legal = {}) {
	const out = {};
	for (const [key, value] of Object.entries(legal))
		if (value !== false && value !== null && value !== undefined && !(Array.isArray(value) && !value.length))
			out[key] = clone(value);
	return out;
}

function toCall(game, room, player) {
	if (game === 'teen-patti') return limits(room, player).min;
	if (game === 'texas-holdem') return Math.max(0, (room.currentBet ?? 0) - (player.streetBet ?? 0));
	return null;
}

function liveCount(game, room) {
	return room.players.filter((p) => p.cards?.length && !isOut(game, p)).length;
}

function winnerIds(result) {
	if (!result) return [];
	if (result.payouts) return result.payouts.filter((p) => p.payout > p.bet).map((p) => p.playerId);
	if (result.winners)
		return result.winners.map((w) => (typeof w === 'string' ? w : w.id));
	return result.winnerId && result.winnerId !== 'none' && result.winnerId !== 'dealer' ? [result.winnerId] : [];
}

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Who paid whom. Teen Patti and Hold'em: each loser's loss is shared among the winners in
 * proportion to their gains (for one pot this is exactly who paid into it; with several Hold'em
 * side pots it is an attribution that always reconciles to net; the sealed replay keeps what an
 * exact per-pot split needs). Blackjack is against the dealer; Rummy losers pay the declarer.
 */
function chipFlows(game, result, players) {
	if (!result) return [];
	if (game === 'rummy')
		return (result.losses ?? [])
			.filter((loss) => loss.points && result.winnerId && result.winnerId !== 'none')
			.map((loss) => ({ from: loss.playerId, to: result.winnerId, amt: loss.points }));
	if (game === 'blackjack')
		return players
			.filter((p) => p.net)
			.map((p) => (p.net > 0 ? { from: 'dealer', to: p.p, amt: p.net } : { from: p.p, to: 'dealer', amt: -p.net }));
	const winners = players.filter((p) => p.net > 0);
	const total = winners.reduce((sum, w) => sum + w.net, 0);
	if (!total) return [];
	const flows = [];
	for (const payer of players.filter((p) => p.net < 0))
		for (const winner of winners) {
			const amt = round2((-payer.net * winner.net) / total);
			if (amt) flows.push({ from: payer.p, to: winner.p, amt });
		}
	return flows;
}

function handLabel(view, id) {
	return view?.usersList?.find((user) => user.id === id)?.handName ?? null;
}

function publicTable(game, room) {
	if (game === 'texas-holdem') return { board: clone(room.board ?? []) };
	if (game === 'teen-patti' && room.variantState !== undefined) {
		const variant = getVariant(room.rulesVersion);
		const reveal = new Set([...(room.result?.revealedPlayerIds ?? []), ...(room.shownIds ?? [])]);
		return {
			variantState: variant?.publicState
				? clone(variant.publicState(room.variantState, null, reveal))
				: clone(room.variantState)
		};
	}
	if (game === 'blackjack') return { dealerCards: clone(room.dealerCards ?? []) };
	if (game === 'rummy') return { wildRank: room.wildRank ?? null, discardTop: clone(room.discardPile?.at(-1) ?? null) };
	return {};
}

/**
 * Turn an outbox capture into records, or into an explicit failure. Never a partial hand.
 * @returns {{ ok: true, records } | { ok: false, failure }}
 */
export function finishCapture(capture) {
	try {
		return { ok: true, records: buildHandRecords(capture.hand, { engine: capture.engine, room: capture.room }) };
	} catch (error) {
		const reason =
			error instanceof ReplayUnavailable
				? 'replay-unavailable'
				: error instanceof ReplayError
					? 'replay-mismatch'
					: 'build-failed';
		return {
			ok: false,
			failure: failureRow(
				capture.room,
				capture.hand?.handId,
				reason,
				{
					message: String(error?.message ?? error).slice(0, 500),
					step: error?.step ?? null,
					...(error instanceof ReplayUnavailable ? { unavailable: error.reason } : {})
				},
				capture.hand?.steps?.at(-1)?.t ?? Date.now()
			).payload,
			// The raw inputs are kept (system-only) so the hand can be rebuilt by code that can replay it.
			raw: capture.hand ? { _id: `${capture.room}:${capture.hand.handId}`, status: reason, capture } : null
		};
	}
}

/** Replay, verify, and split one finished hand into its three tiers. */
export function buildHandRecords(hand, { engine = null, room } = {}) {
	const unavailable = replayUnavailable(hand.versions);
	if (unavailable) throw new ReplayUnavailable(unavailable);
	const botChecks = [];
	const match = {};
	const states = replayHand(hand.preDeal, hand.steps, { bots: hand.bots ?? {}, botChecks, match });
	const steps = hand.steps;
	const s0 = states[0];
	const s1 = states[1];
	const sn = states.at(-1);
	const game = gameOf(s1);
	const roomName = room ?? s1.name;
	const id = `${roomName}:${hand.handId}`;
	const startedAt = hand.startedAt;
	const completedAt = steps.at(-1).t;
	const participants = s1.players.filter((p) => p.cards?.length);
	const startConnected = new Set(steps[0].ctx?.connected ?? []);

	// Act order: from the first player to act, clockwise by seat.
	const bySeat = [...participants].sort((a, b) => a.seatNumber - b.seatNumber);
	const first = Math.max(0, bySeat.findIndex((p) => p.id === s1.currentPlayerId));
	const order = new Map([...bySeat.slice(first), ...bySeat.slice(0, first)].map((p, i) => [p.id, i]));

	const hiddenStacks = {};
	const seats = participants.map((p) => {
		const pre = s0.players.find((old) => old.id === p.id);
		const hidden = !!pre?.hideBalance;
		if (hidden) hiddenStacks[`start:${p.id}`] = pre?.balance ?? null;
		return {
			p: p.id,
			kind: p.bot ? 'bot' : 'human',
			seat: p.seatNumber,
			order: order.get(p.id),
			stack: hidden ? null : (pre?.balance ?? null),
			hidden,
			connected: p.bot ? true : startConnected.has(p.id),
			...(p.bot ? { bot: hand.bots?.[p.id] ?? { ...identityForSeat(p.bot), resolvedAt: 'build' } } : {})
		};
	});

	// Everyone at the table saw the public events while they were seated.
	const observers = new Map();
	states.forEach((state, k) => {
		for (const pid of seatedIds(state)) {
			const seen = observers.get(pid) ?? { p: pid, from: k, until: null };
			seen.until = k;
			observers.set(pid, seen);
		}
	});
	for (const seen of observers.values()) if (seen.until === states.length - 1) seen.until = null;

	// Events, decision context, and consequences (results, knock-outs) as system events.
	const events = [];
	const botTrace = [];
	let lastAggressor = null;
	let lastBet = null;
	steps.forEach((step, i) => {
		const before = states[i];
		const after = states[i + 1];
		const a = canonical(game, step, before);
		const event = {
			i,
			t: step.t - startedAt,
			p: step.actor,
			kind: step.kind ?? 'player',
			raw: step.action,
			a,
			payload: clone(step.payload ?? {}),
			...(step.cause ? { cause: step.cause } : {}),
			connected: step.ctx?.connected ?? null,
			chips: balanceChanges(before, after)
		};
		const actor = before.players.find((p) => p.id === step.actor);
		if (DECISIONS.has(a) && actor && step.kind !== 'system') {
			const view = safeProjection(before, step.actor, new Set(step.ctx?.connected ?? []));
			const turnMs = before.turnMs ?? step.ctx?.turnMs;
			const turnStart = before.deadline && turnMs ? before.deadline - turnMs : null;
			const hidden = !!actor.hideBalance;
			if (hidden) hiddenStacks[`${i}:${actor.id}`] = actor.balance;
			event.decision = {
				legal: compactLegal(view?.legalActions),
				potBefore: before.pot ?? null,
				stackBefore: hidden ? null : actor.balance,
				toCall: toCall(game, before, actor),
				...(game === 'teen-patti' && step.action === 'bet'
					? { stakeMultiple: round2(step.payload.amount / limits(before, actor).min) }
					: {}),
				blind: actor.isBlind ?? null,
				street: before.stage ?? null,
				live: liveCount(game, before),
				lastAggressor,
				facing: lastBet && lastBet.p !== step.actor ? lastBet.a : 'none',
				turnStartT: turnStart === null ? null : turnStart - startedAt,
				ms: turnStart === null ? null : (step.ctx?.now ?? step.t) - turnStart,
				...(step.kind === 'bot' ? { artificialDelay: true } : {})
			};
		}
		if (a === 'raise') lastAggressor = step.actor;
		if (a === 'raise' || a === 'call') lastBet = { p: step.actor, a };
		events.push(event);
		const knocked = after.players.filter(
			(p) => p.id !== step.actor && p.cards?.length && isOut(game, p) && !isOut(game, before.players.find((o) => o.id === p.id))
		);
		if (knocked.length)
			events.push({ i, sub: 1, p: 'system', kind: 'system', a: 'knock-out', players: knocked.map((p) => p.id) });
		if (after.result && !before.result)
			events.push({ i, sub: 2, p: 'system', kind: 'system', a: 'result', cause: after.result.reason ?? null });
		if (step.kind === 'bot')
			botTrace.push({
				i,
				p: step.actor,
				...(hand.bots?.[step.actor] ?? {}),
				chosen: step.action,
				params: clone(step.payload ?? {}),
				probs: step.bot?.trace?.probs ?? {},
				reason: step.bot?.reason ?? null,
				...(step.bot?.trace ? { trace: clone(step.bot.trace) } : {}),
				confidence: null,
				memoryRefs: step.bot?.memory ? [step.bot.memory.id] : [],
				...(step.bot?.adaptive ? { adaptive: clone(step.bot.adaptive) } : {}),
				rngSeed: step.bot?.seed ?? null,
				rngDraws: step.bot?.draws ?? 0,
				verified: botChecks.find((check) => check.i === i)?.verified ?? 'not-checked'
			});
	});

	// Outcome per participant.
	const result = sn.result && (sn.result.handId === undefined || sn.result.handId === hand.handId) ? sn.result : null;
	const winners = new Set(winnerIds(result));
	const nonGameDelta = (pid) =>
		steps.reduce((sum, step, i) => {
			if (!NON_GAME.has(step.action)) return sum;
			return sum + (balanceChanges(states[i], states[i + 1])[pid] ?? 0);
		}, 0);
	const players = participants.map((p) => {
		const pre = s0.players.find((old) => old.id === p.id);
		const end = sn.players.find((old) => old.id === p.id);
		// A bot topped up at the deal is not a result: take it out of net.
		const dealContribution = s1.players.find((old) => old.id === p.id)?.handBet ?? 0;
		const rebuy = p.bot && (p.bot.rebuys ?? 0) > (pre?.bot?.rebuys ?? 0)
			? p.balance + dealContribution - (pre?.balance ?? 0)
			: 0;
		const net = (end?.balance ?? 0) - (pre?.balance ?? 0) - rebuy - nonGameDelta(p.id);
		const contributed =
			game === 'rummy'
				? (result?.losses?.find((loss) => loss.playerId === p.id)?.points ?? 0)
				: (end?.handBet ?? 0);
		const exitAt = states.findIndex((state, k) => k > 1 && isOut(game, state.players.find((o) => o.id === p.id)));
		const exitStep = exitAt > 0 ? exitAt - 1 : null;
		const exit = winners.has(p.id)
			? 'won'
			: exitStep !== null
				? events.find((e) => e.i === exitStep && (e.p === p.id || e.players?.includes(p.id)))?.a ?? 'out'
				: result
					? 'lost'
					: 'unfinished';
		return { p: p.id, contributed, net, exit, exitAt: winners.has(p.id) ? null : exitStep };
	});

	// Cards that became visible to another seated player: checked where visibility can change.
	const shown = [];
	const checkpoints = new Set([states.length - 1]);
	steps.forEach((step, i) => {
		if (['reveal', 'show', 'declare', 'pack', 'timeout'].includes(step.action)) checkpoints.add(i + 1);
	});
	for (const p of participants) {
		for (const k of [...checkpoints].sort((x, y) => x - y)) {
			const state = states[k];
			const target = state.players.find((o) => o.id === p.id);
			if (!target?.cards?.length) continue;
			const viewers = seatedIds(state).filter((v) => v !== p.id);
			const visible = viewers.some((v) => {
				const view = safeProjection(state, v, new Set(viewers));
				const cards = view?.usersList?.find((user) => user.id === p.id)?.cardsInHand ?? view?.usersList?.find((user) => user.id === p.id)?.cards;
				return Array.isArray(cards) && cards.length && cards.every((card) => card.rank > 0 || card.suit === 'joker');
			});
			if (visible) {
				const view = safeProjection(state, viewers[0], new Set(viewers));
				shown.push({
					p: p.id,
					cards: clone(target.cards),
					label: handLabel(view, p.id),
					at: k - 1,
					...presence(state, steps[k - 1].ctx?.connected, p.id)
				});
				break;
			}
		}
	}
	const shownIds = new Set(shown.map((s) => s.p));
	for (const player of players) player.shown = shownIds.has(player.p);

	const publicRecord = {
		_id: id,
		v: RECORDER_VERSION,
		recorder: RECORDER_VERSION,
		engine,
		versions: hand.versions,
		room: roomName,
		handId: hand.handId,
		nightId: hand.nightId,
		handNo: hand.handNo,
		prevHandId: hand.prevHandId ? `${roomName}:${hand.prevHandId}` : null,
		gameType: game,
		rulesVersion: s1.rulesVersion ?? null,
		startedAt,
		completedAt,
		practice: participants.some((p) => !!p.bot),
		config: {
			table: s1.table ?? null,
			boot: s1.boot ?? null,
			potLimit: s1.potLimit ?? 0,
			autoReady: s1.autoReady ?? null,
			turnMs: steps[0].ctx?.turnMs ?? null,
			smallBlind: s1.smallBlind ?? null,
			bigBlind: s1.bigBlind ?? null
		},
		pick: {
			startPayload: clone(steps[0].payload ?? {}),
			upNext: clone(s0.upNext ?? null),
			chooser: s0.chooser?.playerId ?? null
		},
		seal: s1.handSeal?.commitment
			? { commitment: s1.handSeal.commitment, cutBy: s1.handSeal.cutBy ?? null, cutAt: s1.handSeal.cutAt ?? null }
			: null,
		seats,
		firstActor: s1.currentPlayerId ?? null,
		buttonSeat: s1.buttonSeat ?? null,
		observers: [...observers.values()],
		table: publicTable(game, sn),
		events,
		outcome: {
			reason: result?.reason ?? (sn.ended ? 'night-ended' : 'stopped'),
			pot: result?.amount ?? null,
			winners: players.filter((p) => winners.has(p.p)).map((p) => ({ p: p.p, amt: p.net })),
			players
		},
		shown,
		flows: chipFlows(game, result, players),
		verified: {
			replay: match.mode,
			stepCount: steps.length,
			botDecisions: botChecks.every((check) => check.verified === 'reproduced') ? 'reproduced' : 'partial'
		}
	};

	const privateRecords = participants.map((p) => {
		const end = sn.players.find((o) => o.id === p.id);
		const seenStep = states.findIndex((state, k) => k > 0 && state.players.find((o) => o.id === p.id)?.isBlind === false);
		return {
			_id: `${id}:${p.id}`,
			handId: id,
			p: p.id,
			room: roomName,
			completedAt,
			gameType: game,
			rulesVersion: s1.rulesVersion ?? null,
			dealt: clone(p.cards),
			final: clone(end?.cards ?? []),
			seenAt: game === 'teen-patti' && seenStep > 0 ? seenStep - 1 : null,
			label: handLabel(safeProjection(sn, p.id, new Set(seatedIds(sn))), p.id),
			equity: null
		};
	});

	const sealedRecord = {
		_id: id,
		recorder: RECORDER_VERSION,
		engine,
		versions: hand.versions,
		status: 'verified',
		hand: {
			handId: hand.handId,
			nightId: hand.nightId,
			handNo: hand.handNo,
			prevHandId: hand.prevHandId,
			startedAt: hand.startedAt,
			bots: clone(hand.bots ?? {})
		},
		preDeal: clone(hand.preDeal),
		steps: clone(steps),
		hiddenStacks,
		botTrace,
		finalHash: steps.at(-1).h
	};

	return { public: publicRecord, private: privateRecords, sealed: sealedRecord };
}
