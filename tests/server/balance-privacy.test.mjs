import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, invariant } from '../../server/engine.mjs';

const ids = ['a', 'b', 'c'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, connected };

function table() {
	let room = newRoom('privacy-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
	return room;
}
const seat = (room, viewer, id) =>
	projection(room, viewer, connected).usersList.find((user) => user.id === id);

test('A hidden balance reaches only its owner; others get the boot and chip flags', () => {
	let room = transition(table(), 'b', 'setBalanceHidden', { hidden: true }, ctx);
	assert.deepEqual(
		{ ...seat(room, 'a', 'b'), cardsInHand: undefined },
		{
			...seat(room, 'a', 'b'),
			balance: null,
			balanceHidden: true,
			coversBoot: true,
			hasChips: true,
			cardsInHand: undefined
		}
	);
	assert.equal(seat(room, 'b', 'b').balance, 1000);
	assert.equal(seat(room, 'b', 'b').balanceHidden, true);
	assert.equal(seat(room, 'a', 'a').balance, 1000);

	// Hiding works mid-hand too, and play carries on as normal.
	room = transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck: freshDeck(), handId: 'h', requireReady: true }
	);
	room = transition(room, 'c', 'setBalanceHidden', { hidden: true }, ctx);
	assert.equal(seat(room, 'a', 'c').balance, null);
	invariant(room);

	room = transition(room, 'b', 'setBalanceHidden', { hidden: false }, ctx);
	assert.equal(seat(room, 'a', 'b').balance, 990);
	assert.equal(seat(room, 'a', 'b').balanceHidden, undefined);
	assert.throws(
		() => transition(room, 'a', 'setBalanceHidden', { hidden: 'yes' }, ctx),
		/visibility/
	);
});
