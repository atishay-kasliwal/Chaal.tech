import { projection, playing } from '../engine.mjs';
import { decide } from './strategy.mjs';

/** Friendly table names; a room never seats two bots with the same name. */
export const BOT_NAMES = Object.freeze([
	'Raju',
	'Pinky',
	'Bunty',
	'Dolly',
	'Chintu',
	'Guddu',
	'Babli',
	'Pappu',
	'Sweety',
	'Monty',
	'Tinku',
	'Rinku'
]);

export function pickBotName(room, random) {
	const taken = new Set(room.players.filter((p) => !p.departed).map((p) => p.username));
	const free = BOT_NAMES.filter((name) => !taken.has(name.toLowerCase()));
	const pool = free.length ? free : BOT_NAMES;
	return pool[Math.floor(random() * pool.length)];
}

/** Human-feeling pause before a bot acts. Looking or discarding is quicker than betting. */
/**
 * How long a bot "thinks". The table should feel unhurried: at least 2 seconds before the turn
 * passes to a bot's move, and at least 1 second between a bot looking at its cards and betting.
 */
export function botDelay(random, quick = false) {
	return quick ? 1000 + Math.floor(random() * 700) : 2000 + Math.floor(random() * 2000);
}

/** True when at least one person (not a bot) is connected, so bots are worth running. */
export function humansPresent(room, connected) {
	return room.players.some(
		(p) => !p.bot && !p.departed && p.seatNumber !== null && connected.has(p.id)
	);
}

/** Which bot (if any) needs to act now, without working out its move. Cheap to call. */
export function botDue(room, connected) {
	if (!playing(room) || (room.gameType && room.gameType !== 'teen-patti')) return null;
	const current = room.players.find((p) => p.id === room.currentPlayerId);
	if (current?.bot) return current.id;
	const discarding = room.players.find(
		(p) =>
			p.bot &&
			!p.departed &&
			!p.isPacked &&
			p.cards.length &&
			projection(room, p.id, connected).legalActions.discard
	);
	return discarding?.id ?? null;
}

/**
 * The next bot move for this room, or null when no bot needs to act.
 * Discards come first (any bot holding too many seen cards), then the bot on turn.
 */
export function nextBotMove(room, connected, random) {
	if (!playing(room) || (room.gameType && room.gameType !== 'teen-patti')) return null;
	for (const bot of room.players.filter(
		(p) => p.bot && !p.departed && !p.isPacked && p.cards.length
	)) {
		const view = projection(room, bot.id, connected);
		if (view.legalActions.discard) {
			const move = decide(view, bot.id, random);
			if (move) return { botId: bot.id, ...move };
		}
	}
	const current = room.players.find((p) => p.id === room.currentPlayerId);
	if (!current?.bot) return null;
	const move = decide(projection(room, current.id, connected), current.id, random);
	return move ? { botId: current.id, ...move } : null;
}

/** Announcement for the table feed fallback (the UI narrates from snapshots too). */
export function botMoveText(room, move) {
	const name = room.players.find((p) => p.id === move.botId)?.username ?? 'Bot';
	return move.action === 'pack' ? `${name} packed` : null;
}
