/**
 * How each club character plays, as six meters for the Bots pages. Each value is the character's
 * canonical DNA trait (server/bots/dna-styles.mjs CANONICAL_STYLES), 0 to 1, rounded;
 * tests/server/bot-style-meters.test.mjs fails if a canonical style changes and these do not.
 */
export const METERS = Object.freeze([
	{ key: 'blind', label: 'Blind', trait: 'blindPreference' },
	{ key: 'aggression', label: 'Aggression', trait: 'aggression' },
	{ key: 'bluff', label: 'Bluff', trait: 'bluffAffinity' },
	{ key: 'calls', label: 'Calls', trait: 'curiosity' },
	{ key: 'patience', label: 'Patience', trait: 'patience' },
	{ key: 'reads', label: 'Reads you', trait: 'adaptability' }
]);

/** @type {Readonly<Record<string, Readonly<Record<string, number>>>>} */
export const STYLE_METERS = Object.freeze({
	'rohit-sharma': Object.freeze({
		blind: 0.9,
		aggression: 0.6,
		bluff: 0.45,
		calls: 0.45,
		patience: 0.5,
		reads: 0.2
	}),
	'virat-kohli': Object.freeze({
		blind: 0.5,
		aggression: 0.92,
		bluff: 0.75,
		calls: 0.5,
		patience: 0.2,
		reads: 0.2
	}),
	gg: Object.freeze({
		blind: 0.42,
		aggression: 0.42,
		bluff: 0.2,
		calls: 0.18,
		patience: 0.85,
		reads: 0.3
	}),
	'samay-raina': Object.freeze({
		blind: 0.45,
		aggression: 0.42,
		bluff: 0.25,
		calls: 0.95,
		patience: 0.25,
		reads: 0.4
	}),
	'ms-dhoni': Object.freeze({
		blind: 0.6,
		aggression: 0.62,
		bluff: 0.55,
		calls: 0.45,
		patience: 0.7,
		reads: 0.95
	})
});

/** The suit and table colour each character is drawn with. */
export const BOT_LOOK = Object.freeze({
	'rohit-sharma': { suit: '♠', tone: '#263b2a', accent: '#7fc48e' },
	'virat-kohli': { suit: '♦', tone: '#243243', accent: '#79a7e6' },
	gg: { suit: '♣', tone: '#494026', accent: '#f2dc91' },
	'samay-raina': { suit: '♠', tone: '#263a40', accent: '#79d1d6' },
	'ms-dhoni': { suit: '♥', tone: '#422b34', accent: '#ee9a8b' }
});
