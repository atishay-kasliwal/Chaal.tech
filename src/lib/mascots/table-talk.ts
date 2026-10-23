import type { FeedEvent } from '#lib/teen-patti/feed.js';
import { lineFor, voiced } from '../../../shared/bot-voice.mjs';
import { speech } from './mascots.svelte.js';
import { botChat } from './talk-prefs.svelte.js';

/**
 * Table talk on screen. The lines come from the room server (server/bots/table-talk.mjs: rare,
 * earned moments, the same for everyone at the table); this side only shows them, unless this viewer
 * turned "Bot chat" off. The one line made here is a hello on the first deal, from what a character
 * remembers of this viewer.
 */

/** What a bot remembers of the person at this table, from its moment memory (server: recallRelationship). */
export interface Recall {
	moments: number;
	mood: 'new' | 'back' | 'rematch' | 'revenge' | 'pressure';
}
/** Remembered feelings about the viewer, by character mascot id. Filled once when the table opens. */
export const recalls: Record<string, Recall> = {};

/** A line from the room server (event `botTalk`). */
export interface BotTalk {
	roomName: string;
	playerId: string;
	text: string;
	delayMs?: number;
	holdMs?: number;
}

const greeted = new Set<string>();
const timers = new Set<ReturnType<typeof setTimeout>>();

function hashUnit(seed: string) {
	let h = 0x811c9dc5;
	for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
	return h / 4294967296;
}

const clamp = (value: unknown, low: number, high: number, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value)
		? Math.min(high, Math.max(low, value))
		: fallback;

/** Show a server line on its seat, after its short delay, unless Bot chat is off. */
export function hearBotTalk(value: unknown, roomName: string) {
	if (!value || typeof value !== 'object') return;
	const talk = value as BotTalk;
	if (talk.roomName !== roomName || typeof talk.playerId !== 'string') return;
	if (typeof talk.text !== 'string' || !talk.text || talk.text.length > 120) return;
	if (!botChat.on) return;
	const timer = setTimeout(
		() => {
			timers.delete(timer);
			if (botChat.on) speech.say(talk.playerId, talk.text, clamp(talk.holdMs, 1500, 6000, 3600));
		},
		clamp(talk.delayMs, 0, 3000, 0)
	);
	timers.add(timer);
}

/** Bot chat off: clear what is showing and anything about to show. */
export function hushBotTalk() {
	for (const timer of timers) clearTimeout(timer);
	timers.clear();
	speech.clear();
}

/**
 * Development harnesses only (?talk on /test-325, /test-pakad, /test-29): every character at the
 * table says one of its real lines and holds it, to check where bubbles sit.
 */
export async function demoTalk(
	users: { id: string; isBot: boolean; characterId: string | null }[]
) {
	// Loaded only here, so the lines never ride in the table's bundle.
	const lines: Record<string, Record<string, readonly string[]>> = (
		await import('../../../shared/talk-lines.mjs')
	).TALK_LINES;
	for (const user of users) {
		const line = user.isBot && user.characterId ? lines[user.characterId]?.BIG_WIN[0] : null;
		if (line) speech.say(user.id, line, 120000);
	}
}

/** The first deal of a session: one character says hello, by what it remembers of this viewer. */
export function talkToEvents(events: FeedEvent[], room: RoomData) {
	if (!events.some((event) => event.kind === 'deal')) return;
	const bots = room.usersList.filter(
		(user) => user.bot && !user.hasLeft && user.botMascotId && voiced(user.botMascotId)
	);
	const fresh = bots.filter((bot) => !greeted.has(bot.id));
	if (!fresh.length) return;
	for (const bot of bots) greeted.add(bot.id);
	if (!botChat.on) return;
	const seed = `${room.handId}:hello`;
	const bot = fresh[Math.floor(hashUnit(seed) * fresh.length)];
	const mood = recalls[bot.botMascotId ?? '']?.mood ?? 'new';
	const line = lineFor(bot.botMascotId ?? '', mood === 'new' ? 'sit' : mood, seed);
	if (line) speech.say(bot.id, line);
}
