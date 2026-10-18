import { projection, playing } from '../engine.mjs';
import { decide } from './strategy.mjs';
import { ADAPTIVE_POLICY, adaptiveDecision } from './memory/adaptive.mjs';

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
export function botDelay(random, quick = false, feel = {}) {
	const base = quick ? 1000 + Math.floor(random() * 700) : 2000 + Math.floor(random() * 2000);
	const tempo = TEMPO[feel.botId] ?? 1;
	// Bigger decisions take longer: facing a raise, or a big pot.
	const weight = 1 + (feel.facingRaise ? 0.3 : 0) + (feel.bigPot ? 0.25 : 0);
	// Now and then a long think, the way a person sometimes stalls on a hard one.
	const stall = !quick && random() < 0.08 ? 1500 + Math.floor(random() * 2000) : 0;
	return Math.min(7000, Math.round(base * tempo * weight + stall));
}

/** How quickly each character plays: Virat is decisive, Dhoni takes his time, Samay is quick but erratic. */
export const TEMPO = Object.freeze({ 'rohit-sharma': 1, 'virat-kohli': 0.8, 'ms-dhoni': 1.35, gg: 1.15, 'samay-raina': 0.9 });

/** What about the table should slow a bot down, from the room (no cards involved). */
export function thinkingContext(room, botPlayerId) {
	const bot = room.players.find((p) => p.id === botPlayerId);
	const boot = room.boot ?? 1;
	return {
		botId: bot?.bot?.botId ?? bot?.bot?.style?.botId ?? String(bot?.bot?.styleId ?? '').split('@')[0],
		facingRaise: (room.maxStake ?? 0) > boot * 2,
		bigPot: (room.pot ?? 0) >= boot * 20
	};
}

/** True when at least one person (not a bot) is connected, so bots are worth running. */
export function humansPresent(room, connected) {
	return room.players.some(
		(p) => !p.bot && !p.departed && p.seatNumber !== null && connected.has(p.id)
	);
}

/** Off-turn work a bot must do: discard, or a table move (open a mat card, lock a line). */
const needsMove = (legal) => !!legal.discard || !!legal.table?.length;

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
			needsMove(projection(room, p.id, connected).legalActions)
	);
	return discarding?.id ?? null;
}

/**
 * The next bot move for this room, or null when no bot needs to act.
 * Discards come first (any bot holding too many seen cards), then the bot on turn.
 */
export function nextBotMove(room, connected, random, profileFor = () => undefined, memoryFor = () => undefined) {
	const choose = (view, bot) => bot.bot.style?.policy === ADAPTIVE_POLICY
		? adaptiveDecision(view, bot.id, random, bot.bot.style, memoryFor(bot.id))
		: decide(view, bot.id, random, profileFor(bot.id) ?? bot.bot.style?.tendencies);
	if (!playing(room) || (room.gameType && room.gameType !== 'teen-patti')) return null;
	for (const bot of room.players.filter(
		(p) => p.bot && !p.departed && !p.isPacked && p.cards.length
	)) {
		const view = projection(room, bot.id, connected);
		if (needsMove(view.legalActions)) {
			const move = choose(view, bot);
			if (move) return { botId: bot.id, ...move };
		}
	}
	const current = room.players.find((p) => p.id === room.currentPlayerId);
	if (!current?.bot) return null;
	const move = choose(projection(room, current.id, connected), current);
	return move ? { botId: current.id, ...move } : null;
}

/** Announcement for the table feed fallback (the UI narrates from snapshots too). */
export function botMoveText(room, move) {
	const name = room.players.find((p) => p.id === move.botId)?.username ?? 'Bot';
	return move.action === 'pack' ? `${name} packed` : null;
}
