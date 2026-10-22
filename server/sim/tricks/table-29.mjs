import {
	newRoom,
	transition,
	projection,
	fresh29Deck,
	playing
} from '../../tricks/twenty-nine.mjs';
import { stream, shuffle } from '../seeds.mjs';

/**
 * A headless 29 table on the real engine: the same transition and projection a room runs,
 * minus sockets and timers. Every deck and every decision draw is seeded from
 * (seed, table, hand, seat, k), so a table spec always replays exactly, and swapping one seat's
 * decider leaves the other seats' draws unchanged (matched play).
 *
 * spec: { seed, table, hands, seats: [decider × 4] }; seats 0 and 2 are partners, as are 1 and 3.
 *   decider(view, selfId, random, memory) -> { action, payload, reason?, trace? }
 *   memory: a per-seat object kept between hands (session memory); a decider with `observe` folds
 *   every change of its own view into it, as the room's minds do.
 * onDecision({ hand, seat, view, move, room }) and onHand({ hand, room }) are optional hooks.
 */
const IDS = ['p0', 'p1', 'p2', 'p3'];
const ctx = (extra = {}) => ({ now: 1000, turnMs: 60000, connected: new Set(IDS), ...extra });

export function runTable29(spec, hooks = {}) {
	const { seed, table, hands, seats } = spec;
	let room = newRoom('sim-29', 0, 'p0');
	for (const [i, pid] of IDS.entries()) {
		room = transition(room, pid, 'join', { username: `seat${i}` }, ctx());
		room = transition(room, pid, 'ready', { ready: true }, ctx());
	}
	const memory = IDS.map(() => ({}));
	const counts = IDS.map(() => 0);
	const results = [];
	for (let h = 0; h < hands; h++) {
		const deck = shuffle(fresh29Deck(), stream(seed, 'deck29', table, h).random);
		room = transition(room, 'p0', 'start', {}, ctx({ deck, handId: `t${table}-h${h}` }));
		let guard = 0;
		while (playing(room)) {
			if (guard++ > 200) throw new Error(`29 table ${table} hand ${h} stalled`);
			const pid = room.currentPlayerId;
			const seat = IDS.indexOf(pid);
			const view = projection(room, pid, ctx().connected);
			const rng = stream(seed, 'decide29', table, h, seat, counts[seat]++);
			const move = seats[seat](view, pid, rng.random, memory[seat]);
			if (hooks.onDecision) hooks.onDecision({ hand: h, seat, view, move, room });
			room = transition(room, pid, move.action, move.payload, ctx());
			for (const [s, own] of IDS.entries())
				if (seats[s].observe)
					seats[s].observe(projection(room, own, ctx().connected), own, memory[s]);
		}
		results.push(structuredClone(room.result));
		if (hooks.onHand) hooks.onHand({ hand: h, room });
	}
	return { room, results };
}

/** A legal random player: the floor every bot must clear (bids rarely, asks for trump when it must). */
export function random29(view, selfId, random) {
	const l = view.legalActions;
	const pick = (xs) => xs[Math.floor(random() * xs.length)];
	if (l.pass)
		return l.bid.length && random() < 0.3
			? { action: 'bid', payload: { value: l.bid[0] } }
			: { action: 'pass', payload: {} };
	if (l.chooseTrump.length)
		return { action: 'chooseTrump', payload: { card: pick(l.chooseTrump) } };
	if (l.reveal) return { action: 'reveal', payload: {} };
	if (l.pair) return { action: 'pair', payload: {} };
	return { action: 'play', payload: { card: pick(l.play) } };
}

const STRENGTH = { 11: 8, 9: 7, 14: 6, 10: 5, 13: 4, 12: 3, 8: 2, 7: 1 };
/** A greedy player: bids on two or more point cards, wins every trick it can, cheapest card first. */
export function greedy29(view) {
	const l = view.legalActions;
	const hand = view.usersList.find((u) => u.id === view.selfId).cardsInHand;
	if (l.pass) {
		const held = hand.filter((c) => [11, 9].includes(c.rank)).length;
		return held >= 2 && l.bid.length
			? { action: 'bid', payload: { value: l.bid[0] } }
			: { action: 'pass', payload: {} };
	}
	if (l.chooseTrump.length) {
		const count = (s) => hand.filter((c) => c.suit === s).length;
		const card = l.chooseTrump
			.slice()
			.sort((a, b) => count(b.suit) - count(a.suit) || STRENGTH[a.rank] - STRENGTH[b.rank])[0];
		return { action: 'chooseTrump', payload: { card } };
	}
	if (l.reveal) return { action: 'reveal', payload: {} };
	if (l.pair) return { action: 'pair', payload: {} };
	const plays = view.trick.plays;
	const trump = view.revealed ? view.trump : null;
	const s = (c) => STRENGTH[c.rank] + (trump && c.suit === trump ? 100 : 0);
	const led = plays[0]?.card.suit;
	const wins = (c) =>
		plays.every((p) => {
			const t = (x) => trump && x.suit === trump;
			if (t(c) !== t(p.card)) return t(c);
			if (c.suit !== p.card.suit) return !t(p.card) && p.card.suit !== led;
			return STRENGTH[c.rank] > STRENGTH[p.card.rank];
		});
	const winners = l.play.filter(wins).sort((a, b) => s(a) - s(b));
	return {
		action: 'play',
		payload: { card: winners[0] ?? l.play.slice().sort((a, b) => s(a) - s(b))[0] }
	};
}

export { IDS as SEATS_29 };
