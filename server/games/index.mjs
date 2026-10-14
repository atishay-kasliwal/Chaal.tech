import * as holdem from '../poker/holdem.mjs';
import * as blackjack from '../blackjack/blackjack.mjs';
import * as rummy from '../rummy/rummy.mjs';

const games = new Map([
	['texas-holdem', holdem],
	['blackjack', blackjack],
	['rummy', rummy]
]);

export function getGameEngine(gameType) {
	return games.get(gameType) ?? null;
}

export function createGameRoom(gameType, name, table, hostId) {
	const engine = getGameEngine(gameType);
	if (!engine) return null;
	return engine.newRoom(name, table, hostId);
}

export function listGameTypes() {
	return ['teen-patti', ...games.keys()];
}
