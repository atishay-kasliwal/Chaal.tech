import {
	newRoom,
	transition,
	projection,
	freshPakadDeck,
	playing
} from '../../tricks/ten-pakad.mjs';
import { stream, shuffle } from '../seeds.mjs';

/**
 * A headless 10 Pakad table on the real engine: the same transition and projection a room runs,
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

export function runTablePakad(spec, hooks = {}) {
	const { seed, table, hands, seats } = spec;
	let room = newRoom('sim-pakad', 0, 'p0');
	for (const [i, pid] of IDS.entries()) {
		room = transition(room, pid, 'join', { username: `seat${i}` }, ctx());
		room = transition(room, pid, 'ready', { ready: true }, ctx());
	}
	const memory = IDS.map(() => ({}));
	const counts = IDS.map(() => 0);
	const results = [];
	for (let h = 0; h < hands; h++) {
		const deck = shuffle(freshPakadDeck(), stream(seed, 'deckPakad', table, h).random);
		room = transition(room, 'p0', 'start', {}, ctx({ deck, handId: `t${table}-h${h}` }));
		let guard = 0;
		while (playing(room)) {
			if (guard++ > 200) throw new Error(`10 Pakad table ${table} hand ${h} stalled`);
			const pid = room.currentPlayerId;
			const seat = IDS.indexOf(pid);
			const view = projection(room, pid, ctx().connected);
			const rng = stream(seed, 'decidePakad', table, h, seat, counts[seat]++);
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

/** A legal random player: the floor every bot must clear. */
export function randomPakad(view, selfId, random) {
	const l = view.legalActions.play;
	return { action: 'play', payload: { card: l[Math.floor(random() * l.length)] } };
}

/** A greedy player: wins the trick whenever it can, as cheaply as possible; otherwise plays low. */
export function greedyPakad(view) {
	const l = view.legalActions.play;
	const plays = view.trick.plays;
	const trump = view.trump;
	const strength = (c) => c.rank + (trump && c.suit === trump ? 100 : 0);
	const led = plays[0]?.card.suit;
	const wins = (c) =>
		plays.every((p) => {
			const t = (x) => trump && x.suit === trump;
			if (t(c) !== t(p.card)) return t(c);
			if (c.suit !== p.card.suit) return !t(p.card) && p.card.suit !== led;
			return c.rank > p.card.rank;
		});
	const winners = l.filter(wins).sort((a, b) => strength(a) - strength(b));
	const card = winners[0] ?? l.slice().sort((a, b) => strength(a) - strength(b))[0];
	return { action: 'play', payload: { card } };
}

export { IDS as PAKAD_SEATS };
