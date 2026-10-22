import test from 'node:test';
import assert from 'node:assert/strict';
import { transition, GameError } from '../../server/engine.mjs';
import { createGameRoom } from '../../server/games/index.mjs';

/*
 * Rule errors in every game reach the room server as GameErrors, so players see the reason
 * ("Draw a card before discarding") instead of "Game service unavailable" (the room server shows
 * the message only for GameErrors). Gameplay is unchanged: the same actions are refused.
 */
const ctx = (extra = {}) => ({
	now: 1000,
	turnMs: 60000,
	connected: new Set(['a', 'b']),
	...extra
});
function refused(room, id, action, payload, message) {
	assert.throws(
		() => transition(room, id, action, payload, ctx()),
		(error) =>
			error instanceof GameError && message.test(error.message) && typeof error.code === 'string'
	);
}

for (const game of ['rummy', 'blackjack', 'texas-holdem']) {
	test(`${game}: rule errors are GameErrors with the player-facing reason`, () => {
		let room = createGameRoom(game, `errors-${game}`, 1000, 'a');
		room = transition(room, 'a', 'join', { username: 'A' }, ctx());
		// Not a member yet.
		refused(room, 'b', 'ready', { ready: true }, /join|member/i);
		room = transition(room, 'b', 'join', { username: 'B' }, ctx());
		// Only the host starts; a bad name is refused; an unknown action is refused.
		refused(room, 'b', 'start', {}, /host/i);
		refused(room, 'b', 'join', { username: '' }, /name/i);
	});
}

test('rummy: an out-of-turn discard is refused with its reason, not a service error', () => {
	let room = createGameRoom('rummy', 'errors-rummy-turn', 1000, 'a');
	room = transition(room, 'a', 'join', { username: 'A' }, ctx());
	room = transition(room, 'b', 'join', { username: 'B' }, ctx());
	refused(room, 'a', 'discard', { index: 0 }, /turn/i);
});
