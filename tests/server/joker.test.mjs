import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck, evaluateHand as evaluateClassic } from '../../server/classic.mjs';
import { joker } from '../../server/variants/joker.mjs';
import { newRoom, transition, projection, invariant } from '../../server/engine.mjs';

const card = (rank, suit) => ({ rank, suit });
const indicator = { wildRank: 8, indicator: card(8, 'clubs') };

test('Joker rank marker is taken from the next undealt card and removed from the deck', () => {
	const ctx = {
		now: 1000,
		turnMs: 60000,
		handId: 'joker-hand',
		deck: freshDeck(),
		connected: new Set(['a', 'b'])
	};
	let room = newRoom('joker-room', 50, 'a', 'joker-1');
	for (const id of ctx.connected) room = transition(room, id, 'join', { username: id }, ctx);
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3 }, ctx);
	assert.deepEqual(room.variantState.indicator, freshDeck()[6]);
	assert.equal(room.variantState.wildRank, freshDeck()[6].rank);
	assert.equal(room.deck.length, 52 - 6 - 1);
	assert.ok(room.players.every((player) => player.cards.length === 3));
	for (const id of ctx.connected) {
		const view = projection(room, id, ctx.connected);
		assert.deepEqual(view.variantState, room.variantState);
		assert.ok(
			view.usersList
				.filter((player) => player.id !== id)
				.every((player) => player.cardsInHand.every((face) => face.rank === 0))
		);
	}
	invariant(room);
});

test('Joker wild rank completes a stronger Classic hand and leaves non-wild hands unchanged', () => {
	const hand = [card(2, 'hearts'), card(2, 'spades'), card(8, 'diamonds')];
	assert.deepEqual(joker.evaluateHand(hand, indicator), [5, 2]);
	assert.equal(
		joker.compareHands(hand, [card(3, 'hearts'), card(3, 'spades'), card(6, 'clubs')], indicator),
		1
	);
	const natural = [card(9, 'hearts'), card(9, 'spades'), card(6, 'clubs')];
	assert.deepEqual(joker.evaluateHand(natural, indicator), evaluateClassic(natural));
	assert.throws(() => joker.evaluateHand(natural));
});
