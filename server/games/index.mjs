import * as holdem from '../poker/holdem.mjs';
import * as blackjack from '../blackjack/blackjack.mjs';
import * as rummy from '../rummy/rummy.mjs';
import * as threeTwoFive from '../tricks/three-two-five.mjs';
import * as tenPakad from '../tricks/ten-pakad.mjs';

const games = new Map([
	['texas-holdem', holdem],
	['blackjack', blackjack],
	['rummy', rummy],
	['three-two-five', threeTwoFive],
	['ten-pakad', tenPakad]
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
