import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, invariant, playing } from '../../server/engine.mjs';

const ids = ['a', 'b', 'c'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, connected };
const hidden = (cards) => cards.every((card) => card.rank === 0);
const handOf = (room, viewer, id) =>
	projection(room, viewer, connected).usersList.find((user) => user.id === id).cardsInHand;

function dealt() {
	let room = newRoom('show-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
	return transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck: freshDeck(), handId: 'h1', requireReady: true }
	);
}
const act = (room, action) => transition(room, room.currentPlayerId, action, {}, ctx);

test('A packed player can still look at their cards, and show them to the table', () => {
	let room = dealt();
	const packer = room.currentPlayerId;
	room = act(room, 'pack');
	assert.ok(hidden(handOf(room, packer, packer)), 'packed blind: still face down');
	assert.equal(projection(room, packer, connected).legalActions.peek, true);

	room = transition(room, packer, 'see', {}, ctx);
	assert.ok(!hidden(handOf(room, packer, packer)), 'peeked: you see your own cards');
	const other = ids.find((id) => id !== packer);
	assert.ok(hidden(handOf(room, other, packer)), 'nobody else sees them yet');

	room = transition(room, packer, 'reveal', {}, ctx);
	assert.ok(!hidden(handOf(room, other, packer)), 'shown: everyone sees them');
	assert.equal(projection(room, packer, connected).legalActions.reveal, false);
	assert.ok(playing(room), 'the hand carries on');
	invariant(room);
});

test('When everyone else packs, the winner can peek and show; a new deal hides it again', () => {
	let room = dealt();
	room = act(room, 'pack');
	room = act(room, 'pack');
	assert.ok(!playing(room) && room.result);
	const last = room.result.winnerId;
	assert.ok(hidden(handOf(room, last, last)), 'won blind: cards still face down');
	room = transition(room, last, 'reveal', {}, ctx);
	const other = ids.find((id) => id !== last);
	assert.ok(!hidden(handOf(room, last, last)) && !hidden(handOf(room, other, last)));

	room = transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck: freshDeck(), handId: 'h2', requireReady: true }
	);
	assert.ok(hidden(handOf(room, other, last)), 'new hand: shown cards are private again');
	assert.throws(() => transition(room, last, 'reveal', {}, ctx), /after you pack/);
});
