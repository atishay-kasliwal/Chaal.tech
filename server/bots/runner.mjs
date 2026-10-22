import { bot325, observe325 } from './tricks/bot-325.mjs';
import { botPakad, observePakad } from './tricks/bot-pakad.mjs';
import { projection, playing } from '../engine.mjs';
import { decide } from './strategy.mjs';
import { ADAPTIVE_POLICY, adaptiveDecision } from './memory/adaptive.mjs';
import { deciderFor, MIND_POLICIES, MIND_RULES } from './policies.mjs';
import { observe } from './observe.mjs';
import { emptyMind, updateMind } from './mind.mjs';
import { styleForSeat, CHARACTER_STYLES, STYLES as REFERENCE_STYLES } from './dna-styles.mjs';
import { castMember } from '../../src/lib/bots/cast.js';

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

/**
 * An addBot payload for the simulator and tests: a character id seats that character's DNA reference
 * style (Phase 2 unless `styleId` names another reference version), embedded in the seat exactly as
 * the engine seats a published style; anything else is a practice level with a friendly name. Live
 * rooms never use this: they seat what the bot directory has published.
 */
export function botSeatPayload(room, pick, botId, random, styleId = null) {
	const character = castMember(pick);
	if (character) {
		const style = REFERENCE_STYLES[styleId ?? CHARACTER_STYLES[character.id]._id];
		if (!style || style.botId !== character.id)
			throw new Error(`Unknown reference style ${styleId}`);
		return { botId, name: character.name, level: 'normal', style };
	}
	return { botId, name: pickBotName(room, random), level: pick };
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
export const TEMPO = Object.freeze({
	'rohit-sharma': 1,
	'virat-kohli': 0.8,
	'ms-dhoni': 1.35,
	gg: 1.15,
	'samay-raina': 0.9
});

/** What about the table should slow a bot down, from the room (no cards involved). */
export function thinkingContext(room, botPlayerId) {
	const bot = room.players.find((p) => p.id === botPlayerId);
	const boot = room.boot ?? 1;
	return {
		botId:
			bot?.bot?.botId ?? bot?.bot?.style?.botId ?? String(bot?.bot?.styleId ?? '').split('@')[0],
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
	if (TRICK_GAMES.has(room.gameType))
		return playing(room) && room.players.find((p) => p.id === room.currentPlayerId)?.bot
			? room.currentPlayerId
			: null;
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
 * The decider for a seated bot, by the policy of the style it sat down with:
 * - `tp-adaptive@1` reads the cross-session memory loaded for it (`memoryFor`);
 * - `tp-dna@*` (server/bots/policies.mjs) reads its per-session mind (`minds`);
 * - `tp-character@1`, `tp-heuristic@1` and seats without a style play the heuristic with the
 *   style's tendencies, or a replayed profile (`profileFor`, the recorder's replay of older hands).
 */
export function seatDecider(
	player,
	{ minds = null, memoryFor = () => undefined, profileFor = () => undefined } = {}
) {
	const style = player.bot?.style ?? null;
	return (view, botId, random, mind = minds?.[botId] ?? null) => {
		if (style?.policy === ADAPTIVE_POLICY)
			return adaptiveDecision(view, botId, random, style, memoryFor(botId));
		const dna = style?.policy?.startsWith('tp-dna@') ? deciderFor(style) : null;
		if (dna) return dna(view, botId, random, mind);
		return decide(view, botId, random, profileFor(botId) ?? style?.tendencies);
	};
}

/**
 * The next bot move for this room, or null when no bot needs to act.
 * Discards come first (any bot holding too many seen cards), then the bot on turn.
 * Options: `minds` (per-session minds by bot id), `memoryFor` (adaptive memory loader),
 * `profileFor` (replayed profiles), or `deciderOf` (the simulator's own decider per seat).
 */
export function nextBotMove(
	room,
	connected,
	random,
	{ deciderOf = null, minds = null, memoryFor, profileFor } = {}
) {
	const choose = (view, bot) =>
		(deciderOf ? deciderOf(bot) : seatDecider(bot, { minds, memoryFor, profileFor }))(
			view,
			bot.id,
			random,
			minds?.[bot.id] ?? null
		);
	if (TRICK_GAMES.has(room.gameType)) {
		const current = room.players.find((p) => p.id === room.currentPlayerId);
		if (!playing(room) || !current?.bot) return null;
		const view = projection(room, current.id, connected);
		const decide = deciderOf
			? deciderOf(current)
			: TRICK_GAMES.get(room.gameType).bot(current.bot.characterId);
		const move = decide(view, current.id, random, minds?.[current.id] ?? {});
		return move ? { botId: current.id, ...move } : null;
	}
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

/* ------------------------------------------- minds ------------------------------------------- */

const NOBODY = new Set();
const seatedBot = (room, id) =>
	room?.players.find((p) => p.id === id && p.bot && !p.departed && p.seatNumber !== null);

/**
 * Bring every mind-keeping bot's mind up to date after one commit (before -> after). Pure and
 * deterministic: the live room, the recorder's replay and the simulator all call this, so a mind
 * is the same wherever it is rebuilt. Each bot observes only its own two projections
 * (server/bots/observe.mjs). Minds of bots that left are dropped; a bot that sits down starts empty.
 * Options are for the offline simulator: the style of a seat under test, a memoized projection,
 * and updating minds in place. A live room and a replay use the defaults.
 */
export function updateMinds(
	minds,
	before,
	after,
	{ styleOf = (p) => styleForSeat(p.bot), project = projection, mutate = false } = {}
) {
	if (after && TRICK_GAMES.has(after.gameType)) return updateTrickMinds(minds, after);
	if (!after || (after.gameType && after.gameType !== 'teen-patti')) return minds ?? {};
	const next = {};
	for (const p of after.players) {
		if (!seatedBot(after, p.id)) continue;
		const style = styleOf(p);
		if (!style || !MIND_POLICIES.has(style.policy)) continue;
		const rules = MIND_RULES[style.policy] ?? 1;
		const prior = minds?.[p.id] ?? emptyMind(rules);
		const nextView = project(after, p.id, NOBODY);
		const prevView = seatedBot(before, p.id) ? project(before, p.id, NOBODY) : null;
		next[p.id] = updateMind(prior, observe(prevView, nextView), {
			self: p.id,
			view: nextView,
			dna: style.tendencies.dna,
			kindOf: (id) => (after.players.find((x) => x.id === id)?.bot ? 'bot' : 'human'),
			mutate,
			rules
		});
	}
	return next;
}

/**
 * Trick games: each game's bot and its session memory. After every commit each seated bot folds its
 * own projection into its mind, so what it learns about the table is exactly what a person in its
 * seat could have seen.
 */
const TRICK_GAMES = new Map([
	['three-two-five', { bot: bot325, observe: observe325 }],
	['ten-pakad', { bot: botPakad, observe: observePakad }]
]);
function updateTrickMinds(minds, after) {
	const { observe: fold } = TRICK_GAMES.get(after.gameType);
	const next = {};
	for (const p of after.players) {
		if (!p.bot || p.departed || p.seatNumber === null) continue;
		const mind = structuredClone(minds?.[p.id] ?? {});
		fold(projection(after, p.id, NOBODY), p.id, mind);
		next[p.id] = mind;
	}
	return next;
}
