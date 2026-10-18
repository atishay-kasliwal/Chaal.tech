import type { PresenceEvent, PresenceEventType } from './types.js';
const types: readonly string[] = [
	'PLAYER_RAISED',
	'PLAYER_CALLED',
	'PLAYER_FOLDED',
	'BOT_TURN',
	'BOT_WON',
	'BOT_LOST',
	'IDLE',
	'NEUTRAL'
];
const value = (v: unknown): Record<string, unknown> | null =>
	v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const id = (v: unknown) => (typeof v === 'string' && /^[\w:-]{1,100}$/.test(v) ? v : undefined);

/** Boundary for explicit PUBLIC event DTOs. Unknown fields are discarded, never spread. */
export function publicEvent(input: unknown): PresenceEvent | null {
	const v = value(input);
	if (!v || typeof v.type !== 'string' || !types.includes(v.type) || !id(v.id)) return null;
	return {
		id: id(v.id)!,
		type: v.type as PresenceEventType,
		...(id(v.actor) ? { actor: id(v.actor) } : {})
	};
}

/** Adapter for the existing public table feed. This accepts feed events, never RoomData.
 * It ignores feed text, cards, amounts, bot policy, turn estimates and arbitrary metadata.
 * Split winners must be supplied as a batch so a bot sharing a pot never reacts as a loser.
 * BOT_TURN comes from a separate public turn notification, not legal/private action state. */
export function fromPublicFeed(input: unknown, botSeatId: string): PresenceEvent[] {
	if (!Array.isArray(input)) return [];
	const feed = input
		.slice(-64)
		.map(value)
		.filter((v): v is Record<string, unknown> => !!v);
	const wins = feed.filter((v) => v.kind === 'win');
	const result: PresenceEvent[] = [];
	for (const e of feed) {
		const eventId =
			typeof e.id === 'number' && Number.isSafeInteger(e.id) ? `feed:${e.id}` : id(e.id);
		if (!eventId) continue;
		const actor = id(e.playerId);
		const type =
			e.kind === 'raise'
				? 'PLAYER_RAISED'
				: e.kind === 'chaal' || e.kind === 'blind'
					? 'PLAYER_CALLED'
					: e.kind === 'pack'
						? 'PLAYER_FOLDED'
						: null;
		if (type && actor !== botSeatId)
			result.push({ id: eventId, type, ...(actor ? { actor } : {}) });
	}
	if (wins.length) {
		const own = wins.some((e) => e.playerId === botSeatId);
		const resultIds = wins
			.map((e) => String(e.id))
			.sort()
			.join(':')
			.slice(0, 80);
		result.push({ id: `result:${resultIds}`, type: own ? 'BOT_WON' : 'BOT_LOST' });
	}
	return result;
}
