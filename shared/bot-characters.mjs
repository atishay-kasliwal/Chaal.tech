/** Shared character identity/art catalogue. No frontend or server runtime dependencies. */
export const BOT_CHARACTERS = Object.freeze(
	[
		{ id: 'rohit-sharma', name: 'Rohit Sharma', mascotId: 'bot-rohit-sharma' },
		{ id: 'virat-kohli', name: 'Virat Kohli', mascotId: 'bot-virat-kohli' },
		{ id: 'ms-dhoni', name: 'MS Dhoni', mascotId: 'bot-ms-dhoni' },
		{ id: 'gg', name: 'GG', mascotId: 'bot-gg' },
		{ id: 'samay-raina', name: 'Samay Raina', mascotId: 'bot-samay-raina' }
	].map((character) => Object.freeze(character))
);

/** @param {unknown} id */
export const botCharacter = (id) => BOT_CHARACTERS.find((character) => character.id === id);
