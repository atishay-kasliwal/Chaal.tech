/**
 * The character bots (art in design/mascots/bots/), shared by the table UI and the server
 * (server/engine.mjs validates seats against it; server/bots/characters.mjs gives each one its
 * personality). Legacy practice bots keep their own random names.
 */
export const CAST = Object.freeze([
	Object.freeze({ id: 'rohit-sharma', name: 'Rohit', tagline: 'Plays blind, hits big' }),
	Object.freeze({ id: 'virat-kohli', name: 'Virat', tagline: 'All aggression' }),
	Object.freeze({ id: 'gg', name: 'GG', tagline: 'Rock solid' }),
	Object.freeze({ id: 'samay-raina', name: 'Samay', tagline: 'Calls to see it' }),
	Object.freeze({ id: 'ms-dhoni', name: 'Dhoni', tagline: 'Captain Cool' })
]);

export const CHARACTER_IDS = Object.freeze(CAST.map((c) => c.id));

/** @param {string | null | undefined} id */
export const castMember = (id) => CAST.find((c) => c.id === id) ?? null;
