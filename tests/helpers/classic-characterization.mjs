import { createHash } from 'node:crypto';
import { freshDeck } from '../../server/classic.mjs';

// Later phases add public handBet and lobby readiness. Preserve frozen expectations for pre-existing fields.
const legacy = (value) =>
	JSON.parse(JSON.stringify(value), (key, item) =>
		['handBet', 'ready', 'readyEnabled'].includes(key) ? undefined : item
	);

// Fixed recipes capture Phase 1 behavior. Expected hashes are recorded before extraction.
export function replayClassic(engine, count, pattern) {
	const ids = Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
	const connected = new Set(ids);
	let now = 1000;
	let hand = 1;
	let room = engine.newRoom(`classic-${count}-${pattern}`, 50, ids[0]);
	const trace = createHash('sha256');
	let transitions = 0;
	const deck = () => {
		const cards = freshDeck();
		if (pattern === 'reverse') return cards.reverse();
		if (pattern === 'rotate') return [...cards.slice(17), ...cards.slice(0, 17)];
		return cards;
	};
	function record(actor, action, payload, before) {
		const views = room.players
			.filter((p) => p.seatNumber !== null && !p.departed)
			.map((p) => engine.projection(room, p.id, connected));
		trace.update(
			JSON.stringify({
				actor,
				action,
				payload,
				now,
				room: legacy(room),
				views: legacy(views),
				ledger: engine.movements(before, room, action)
			})
		);
	}
	function act(actor, action, payload = {}) {
		const before = room;
		room = engine.transition(room, actor, action, payload, {
			now,
			turnMs: 60000,
			handId: `characterized-hand-${hand}`,
			deck: deck(),
			connected
		});
		transitions++;
		record(actor, action, payload, before);
		now += 10;
	}
	record(null, 'create', {}, undefined);
	for (const id of ids) act(id, 'join', { username: `Player ${id}` });
	act(ids[0], 'start', { cardsToDeal: 3, cutAt: 7 });
	act(room.currentPlayerId, 'bet', { amount: 1 });
	while (room.players.filter((p) => !p.isPacked && !p.departed).length > 2)
		act(room.currentPlayerId, 'pack');
	for (const player of room.players.filter((p) => !p.isPacked && p.isBlind)) act(player.id, 'see');
	act(room.currentPlayerId, 'show');
	const firstResult = { ...room.result };
	hand++;
	act(room.hostId, 'start', { cardsToDeal: 3, cutAt: 0 });
	now = room.deadline;
	act(room.currentPlayerId, 'timeout');
	act(ids[0], 'leave');
	while (engine.playing(room)) act(room.currentPlayerId, 'pack');
	return {
		transitions,
		trace: trace.digest('hex'),
		firstResult,
		final: createHash('sha256')
			.update(JSON.stringify(legacy(room)))
			.digest('hex')
	};
}
