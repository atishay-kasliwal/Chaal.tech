import type { FeedEvent } from '#lib/teen-patti/feed.js';
import { pick, reactions } from './mascots.svelte.js';

/**
 * What each mascot's face does when something happens at the table. Kept varied on
 * purpose, so the same moment rarely plays the same way twice. Names are expressions
 * from SHEET_CELLS; ones not drawn yet fall back to the nearest drawn face.
 */
const WIN = ['rich', 'starstruck', 'delighted', 'sparkle', 'heart', 'smug'];
const LOSE = ['cry', 'angry', 'shocked', 'dizzy'];
const WATCH_WIN = ['laugh', 'surprised', 'delighted', 'shocked'];
const BIG_RAISE_WATCHERS = ['shocked', 'nervous', 'surprised'];

export function reactToEvents(events: FeedEvent[], room: RoomData) {
	const seated = room.usersList.filter((user) => !user.hasLeft);
	// A split pot sends one win per share; nobody who shares it should cry.
	const winners = new Set(
		events.filter((event) => event.kind === 'win').map((event) => event.playerId)
	);
	let settled = false;
	for (const event of events) {
		switch (event.kind) {
			case 'blind':
				reactions.show(event.playerId, 'blind', 2200);
				break;
			case 'chaal':
				if (Math.random() < 0.5) reactions.show(event.playerId, 'smug', 1600);
				break;
			case 'raise':
				reactions.show(event.playerId, pick(['smug', 'rich']), 2000);
				for (const user of seated)
					if (user.id !== event.playerId && !user.isPacked && Math.random() < 0.6)
						reactions.show(user.id, pick(BIG_RAISE_WATCHERS), 1800);
				break;
			case 'see':
				reactions.show(event.playerId, pick(['thinking', 'nervous', 'smug', 'surprised']), 2000);
				break;
			case 'pack':
				reactions.show(event.playerId, pick(['cry', 'bashful', 'dizzy']), 2000);
				break;
			case 'show':
				for (const user of seated) if (!user.isPacked) reactions.show(user.id, 'surprised', 1400);
				break;
			case 'win':
				reactions.show(event.playerId, pick(WIN), 4000);
				if (settled) break;
				settled = true;
				for (const user of seated) {
					if (winners.has(user.id)) continue;
					reactions.show(user.id, pick(user.isPacked ? WATCH_WIN : LOSE), 3600);
				}
				break;
			case 'join':
				reactions.show(event.playerId, 'heart', 2000);
				break;
		}
	}
}

/** The face a seat rests on when nothing just happened, or null for the head turns. */
export function restingFace(state: { away: boolean }) {
	return state.away ? 'sleepy' : null;
}

/** Everyone looks at whoever's turn it is; between turns, at the pot. */
export const WATCH_ACTIVE = '[data-testid="player-seat"][data-active="true"], .pot';
