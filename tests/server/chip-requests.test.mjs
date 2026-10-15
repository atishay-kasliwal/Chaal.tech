import test from 'node:test';
import assert from 'node:assert/strict';
import {
	newRoom,
	transition,
	projection,
	invariant,
	movements,
	chipGiftText
} from '../../server/engine.mjs';

const ids = ['a', 'b', 'c'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, connected };

function table() {
	let room = newRoom('ask-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
	return room;
}
/** Move chips directly so a player is short, keeping the table's totals intact. */
function short(room, id, balance) {
	const next = structuredClone(room);
	const player = next.players.find((p) => p.id === id);
	next.players.find((p) => p.id === 'c').balance += player.balance - balance;
	player.balance = balance;
	invariant(next);
	return next;
}

test('Below 10% of the buy-in a player can ask a friend, who may give or decline', () => {
	let room = table();
	assert.equal(projection(room, 'a', connected).chipRequestAmounts, undefined);
	assert.throws(
		() => transition(room, 'a', 'requestChips', { to: 'b', amount: 100 }, ctx),
		/below 10%/
	);

	room = short(room, 'a', 50);
	assert.deepEqual(projection(room, 'a', connected).chipRequestAmounts, [100, 250, 500]);
	assert.throws(
		() => transition(room, 'a', 'requestChips', { to: 'b', amount: 123 }, ctx),
		/offered amounts/
	);
	assert.throws(
		() => transition(room, 'a', 'requestChips', { to: 'a', amount: 100 }, ctx),
		/friend/
	);

	const before = transition(room, 'a', 'requestChips', { to: 'b', amount: 250 }, ctx);
	// Only the two players involved can see the request.
	assert.deepEqual(projection(before, 'b', connected).chipRequests, [
		{ from: 'a', to: 'b', amount: 250 }
	]);
	assert.equal(projection(before, 'c', connected).chipRequests, undefined);
	assert.throws(
		() => transition(before, 'c', 'answerChipRequest', { from: 'a', accept: true }, ctx),
		/no longer open/
	);

	assert.equal(chipGiftText(before, 'a', 'b', true), 'b gave a 250 chips');
	room = transition(before, 'b', 'answerChipRequest', { from: 'a', accept: true }, ctx);
	assert.equal(room.players.find((p) => p.id === 'a').balance, 300);
	assert.equal(room.players.find((p) => p.id === 'b').balance, 750);
	assert.equal(projection(room, 'a', connected).chipRequests, undefined);
	assert.deepEqual(movements(before, room, 'answerChipRequest').entries, [
		{ account: 'a', delta: 250 },
		{ account: 'b', delta: -250 }
	]);
	invariant(room);
});

test('Declines, cancels and leaving close a request without moving chips', () => {
	let room = short(table(), 'a', 0);
	room = transition(room, 'a', 'requestChips', { to: 'b', amount: 100 }, ctx);
	room = transition(room, 'b', 'answerChipRequest', { from: 'a', accept: false }, ctx);
	assert.equal(room.players.find((p) => p.id === 'a').balance, 0);
	assert.equal(chipGiftText(room, 'a', 'b', false), null);

	room = transition(room, 'a', 'requestChips', { to: 'b', amount: 100 }, ctx);
	room = transition(room, 'a', 'requestChips', { to: 'c', amount: 500 }, ctx);
	assert.deepEqual(room.chipRequests, [{ from: 'a', to: 'c', amount: 500 }]);
	room = transition(room, 'a', 'cancelChipRequest', {}, ctx);
	assert.deepEqual(room.chipRequests, []);

	room = transition(room, 'a', 'requestChips', { to: 'b', amount: 100 }, ctx);
	room = transition(room, 'b', 'leave', {}, ctx);
	assert.deepEqual(room.chipRequests, []);
	invariant(room);
});
