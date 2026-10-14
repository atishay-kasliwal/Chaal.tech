import test from 'node:test';
import assert from 'node:assert/strict';
import { fourCard, evaluateHand } from '../../server/variants/four-card.mjs';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, invariant } from '../../server/engine.mjs';

const card = (rank, suit) => ({ rank, suit });

test('4 Card evaluates the strongest of all four three-card subsets', () => {
	assert.deepEqual(
		evaluateHand([card(2, 'hearts'), card(3, 'hearts'), card(4, 'hearts'), card(12, 'spades')]),
		[4, 4]
	);
	assert.deepEqual(
		evaluateHand([card(14, 'hearts'), card(13, 'hearts'), card(12, 'hearts'), card(11, 'hearts')]),
		[4, 14]
	);
	assert.equal(
		fourCard.compareHands(
			[card(2, 'hearts'), card(3, 'hearts'), card(4, 'hearts'), card(12, 'spades')],
			[card(5, 'hearts'), card(6, 'hearts'), card(7, 'hearts'), card(2, 'clubs')]
		),
		-1
	);
	assert.throws(() =>
		evaluateHand([card(2, 'hearts'), card(3, 'hearts'), card(4, 'hearts'), card(2, 'hearts')])
	);
});

for (let count = 2; count <= 6; count++)
	test(`${count} players receive four private cards and share standard room accounting`, () => {
		const ids = Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
		const ctx = {
			now: 1000,
			turnMs: 60000,
			handId: `four-${count}`,
			deck: freshDeck(),
			connected: new Set(ids)
		};
		let room = newRoom('four-card-room', 50, 'a', '4-card-1');
		for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
		room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 4 }, ctx);
		assert.ok(room.players.every((player) => player.cards.length === 4));
		assert.equal(
			new Set(
				room.players.flatMap((player) => player.cards.map(({ rank, suit }) => `${rank}:${suit}`))
			).size,
			count * 4
		);
		assert.equal(room.deck.length, 52 - count * 4);
		for (const id of ids) {
			const view = projection(room, id, ctx.connected);
			assert.equal(view.usersList.find((player) => player.id === id).cardsInHand.length, 4);
			assert.ok(
				view.usersList
					.filter((player) => player.id !== id)
					.every((player) => player.cardsInHand.every((face) => face.rank === 0))
			);
		}
		invariant(room);
	});
