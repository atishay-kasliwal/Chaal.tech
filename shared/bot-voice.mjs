/**
 * Hellos for the five characters: what one says on a session's first deal, from what it remembers of
 * the viewer. Hand-written, in each character's own spirit, light and kind: playful cricket banter,
 * never a claim about what a real person said or believes. No AI writes any of this: a line is chosen
 * deterministically from the moment and a seed, so a refresh never changes it and a test can check
 * every line. No em dashes anywhere a player can read. Lines during and after hands are table talk
 * (Phase 6): shared/talk-lines.mjs.
 *
 * Situations:
 *   sit       it sat down (first time)    back    it sat down and knows you   rematch  it remembers losing to you
 *   revenge   it remembers beating you    pressure  it remembers you pushing it around
 */
/** @type {readonly string[]} */
export const SITUATIONS = Object.freeze(['sit', 'back', 'rematch', 'revenge', 'pressure']);

const VOICE = {
	'bot-rohit-sharma': {
		sit: ['Hello, hello. Deal me in.', 'Good to be here.'],
		back: ['Back again, nice.', 'You again. Good.', 'Same table, new night.'],
		rematch: ['You got me last time. I have not forgotten.', 'I owe you one from before.'],
		revenge: ['I seem to do well against you.', 'This table has been kind to me with you around.'],
		pressure: ['You pushed me around last time. Not today.', 'I remember that big raise of yours.']
	},
	'bot-virat-kohli': {
		sit: ['Ready. Deal.', 'I am here to win.'],
		back: ['Good, you are back. Let us go.', 'Back for more? Fine.'],
		rematch: ['You beat me last time. Not again.', 'I have been waiting for this rematch.'],
		revenge: ['I have had your number lately.', 'Last few times went my way.'],
		pressure: ['You like to pile on the pressure. I remember.', 'I know your big raises now.']
	},
	'bot-ms-dhoni': {
		sit: ['Evening. Deal me in.', 'Settled in.'],
		back: ['Good to see you again.', 'You are back. Let us have a proper game.'],
		rematch: ['You got me before. I remember how.', 'Rematch. I have been thinking about it.'],
		revenge: ['I know how this usually ends with us.', 'Patience has worked well against you.'],
		pressure: ['You like pressure. I like waiting.', 'I remember your big raises. I will be ready.']
	},
	'bot-gg': {
		sit: ['Hello all. Careful hands tonight.', 'I will be watchful.'],
		back: ['Good to see you again. I am watching.', 'Back again? I am ready.'],
		rematch: [
			'You took that last time. I took notes.',
			'I remember how that went. Different this time.'
		],
		revenge: ['I have a good record against you.', 'The notes say I am doing well here.'],
		pressure: ['You raise a lot. I have noticed.', 'Big raises from you. I remember.']
	},
	'bot-samay-raina': {
		sit: ['Hi everyone! What are we doing?', 'I brought snacks. No I did not.'],
		back: ['Oh, it is you again! Great.', 'The regulars are here.'],
		rematch: [
			'You beat me last time and I am still talking about it.',
			'Rematch! I have a plan. It is a bad plan.'
		],
		revenge: [
			'I seem to keep winning against you. Sorry, not sorry.',
			'This is becoming a pattern.'
		],
		pressure: ['You push me around and I let you. Not today.', 'Your big raises still haunt me.']
	}
};

/** FNV-1a: tiny, stable, enough to spread a seed over a short list. */
/** @param {string} text */
function hash(text) {
	let h = 0x811c9dc5;
	for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
	return h;
}

/** Which characters have a voice (by their mascot id). */
/** @param {string} mascotId */
export const voiced = (mascotId) => Object.hasOwn(VOICE, mascotId);

/**
 * @param {string} mascotId e.g. 'bot-virat-kohli'
 * @param {string} situation one of SITUATIONS
 * @param {string} seed anything stable for this moment (hand id and event id): same moment, same line
 * @returns a line, or null when this character has nothing for the situation
 */
export function lineFor(mascotId, situation, seed) {
	/** @type {Record<string, Record<string, string[]>>} */
	const voices = VOICE;
	const lines = voices[mascotId]?.[situation];
	return lines?.length ? lines[hash(`${mascotId}|${situation}|${seed}`) % lines.length] : null;
}

export const allLines = () =>
	Object.entries(VOICE).flatMap(([mascotId, byWhen]) =>
		Object.entries(byWhen).flatMap(([situation, lines]) =>
			lines.map((text) => ({ mascotId, situation, text }))
		)
	);
