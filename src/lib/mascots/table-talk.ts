import type { FeedEvent } from '#lib/teen-patti/feed.js';
import { lineFor, voiced } from '../../../shared/bot-voice.mjs';
import { speech } from './mascots.svelte.js';

/** What a bot remembers of the person at this table, from its moment memory (server: recallRelationship). */
export interface Recall {
	moments: number;
	mood: 'new' | 'back' | 'rematch' | 'revenge' | 'pressure';
}
/** Remembered feelings about the viewer, by character mascot id. Filled once when the table opens. */
export const recalls: Record<string, Recall> = {};

/** A bot talks at most this often, so it feels like a person at the table and not a ticker. */
const GAP_MS = 7000;
/** Chance a bot comments on a moment that is not a hand ending. Hand endings always get a line. */
const CHATTY = 0.28;
const lastSpoke = new Map<string, number>();
const greeted = new Set<string>();

function hashUnit(seed: string) {
	let h = 0x811c9dc5;
	for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
	return h / 4294967296;
}

function say(user: { id: string; botMascotId?: string }, situation: string, seed: string, force = false, now = Date.now()) {
	const mascotId = user.botMascotId;
	if (!mascotId || !voiced(mascotId)) return;
	if (!force && now - (lastSpoke.get(user.id) ?? 0) < GAP_MS) return;
	const line = lineFor(mascotId, situation, seed);
	if (!line) return;
	lastSpoke.set(user.id, now);
	speech.say(user.id, line);
}

/** Table talk from the same feed events that drive faces. Deterministic per moment: seed = hand + event. */
export function talkToEvents(events: FeedEvent[], room: RoomData) {
	const bots = room.usersList.filter((user) => user.bot && !user.hasLeft);
	if (!bots.length) return;
	const byId = new Map(bots.map((user) => [user.id, user]));
	let settled = false;
	for (const event of events) {
		const seed = `${room.handId}:${event.id}`;
		const actor = event.playerId ? byId.get(event.playerId) : undefined;
		switch (event.kind) {
			case 'deal':
				// The first hand of a session: each bot greets the person according to what it remembers.
				for (const bot of bots) {
					if (greeted.has(bot.id)) continue;
					greeted.add(bot.id);
					const mood = recalls[bot.botMascotId ?? '']?.mood ?? 'new';
					say(bot, mood === 'new' ? 'sit' : mood, `${seed}:hello`, false);
				}
				break;
			case 'raise':
				if (actor && hashUnit(seed) < CHATTY) say(actor, 'raise', seed);
				break;
			case 'see':
				if (actor && hashUnit(seed) < CHATTY * 0.6) say(actor, 'see', seed);
				break;
			case 'pack':
				if (actor && hashUnit(seed) < CHATTY) say(actor, 'pack', seed);
				break;
			case 'show':
				if (hashUnit(seed) < 0.5) {
					const bot = bots.find((user) => !user.isPacked);
					if (bot) say(bot, 'show', seed);
				}
				break;
			case 'win': {
				if (settled) break;
				settled = true;
				if (actor) say(actor, 'win', seed, true);
				const losers = bots.filter((user) => user.id !== event.playerId);
				// One other bot reacts to a loss, chosen by the same seed so everyone sees the same table.
				const reacting = losers[Math.floor(hashUnit(`${seed}:who`) * losers.length)];
				if (reacting && hashUnit(`${seed}:lose`) < 0.7) say(reacting, 'lose', `${seed}:lose`, true);
				break;
			}
		}
	}
}
