import {
	newRoom,
	transition,
	projection,
	fresh325Deck,
	playing
} from '../../tricks/three-two-five.mjs';
import { stream, shuffle } from '../seeds.mjs';

/**
 * A headless 3 2 5 table on the real engine: the same transition and projection a room runs,
 * minus sockets and timers. Every deck and every decision draw is seeded from
 * (seed, table, round, seat, k), so a table spec always replays exactly, and swapping one seat's
 * decider leaves the other seats' draws unchanged (matched play).
 *
 * spec: { seed, table, rounds, seats: [decider, decider, decider] }
 *   decider(view, selfId, random, memory) -> { action, payload, reason?, trace? }
 *   memory: a per-seat object the decider may keep between its own decisions (session memory)
 * onDecision({ round, seat, view, move }) and onRound({ round, room }) are optional hooks.
 */
const ctx = (extra = {}) => ({
	now: 1000,
	turnMs: 60000,
	connected: new Set(['p0', 'p1', 'p2']),
	...extra
});

export function runTable325(spec, hooks = {}) {
	const { seed, table, rounds, seats } = spec;
	const ids = ['p0', 'p1', 'p2'];
	let room = newRoom('sim-325', 0, 'p0');
	for (const [i, pid] of ids.entries()) {
		room = transition(room, pid, 'join', { username: `seat${i}` }, ctx());
		room = transition(room, pid, 'ready', { ready: true }, ctx());
	}
	const memory = ids.map(() => ({}));
	const counts = ids.map(() => 0);
	const results = [];
	for (let r = 0; r < rounds; r++) {
		const deck = shuffle(fresh325Deck(), stream(seed, 'deck325', table, r).random);
		room = transition(room, 'p0', 'start', {}, ctx({ deck, handId: `t${table}-r${r}` }));
		let guard = 0;
		while (playing(room)) {
			if (guard++ > 200) throw new Error(`3 2 5 table ${table} round ${r} stalled`);
			const pid = room.currentPlayerId;
			const seat = ids.indexOf(pid);
			const view = projection(room, pid, ctx().connected);
			const rng = stream(seed, 'decide325', table, r, seat, counts[seat]++);
			const move = seats[seat](view, pid, rng.random, memory[seat]);
			if (hooks.onDecision) hooks.onDecision({ round: r, seat, view, move, room });
			room = transition(room, pid, move.action, move.payload, ctx());
			// Every seat sees each change (for session memory), as a client receives every update.
			for (const [s, other] of ids.entries())
				if (seats[s].observe)
					seats[s].observe(projection(room, other, ctx().connected), other, memory[s]);
		}
		results.push(structuredClone(room.result));
		if (hooks.onRound) hooks.onRound({ round: r, room });
	}
	return { room, results };
}

/** A legal random player: the floor every bot must clear. */
export function randomPlayer(view, selfId, random) {
	const l = view.legalActions;
	const pick = (xs) => xs[Math.floor(random() * xs.length)];
	if (l.chooseTrump)
		return {
			action: 'chooseTrump',
			payload: { suit: pick(['spades', 'hearts', 'diamonds', 'clubs']) }
		};
	if (l.pull) return { action: 'pull', payload: { position: Math.floor(random() * l.pull) } };
	if (l.give.length) return { action: 'give', payload: { card: pick(l.give) } };
	return { action: 'play', payload: { card: pick(l.play) } };
}
