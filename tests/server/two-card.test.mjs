import test from 'node:test';
import assert from 'node:assert/strict';
import { twoCard, evaluateHand } from '../../server/variants/two-card.mjs';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, invariant } from '../../server/engine.mjs';

const card = (rank, suit) => ({ rank, suit });

test('2 Card ranks pairs over high cards and resolves rank ties without suit order', () => {
	assert.deepEqual(evaluateHand([card(8, 'hearts'), card(8, 'spades')]), [1, 8]);
	assert.deepEqual(evaluateHand([card(14, 'hearts'), card(2, 'spades')]), [0, 14, 2]);
	assert.equal(
		twoCard.compareHands(
			[card(2, 'hearts'), card(2, 'spades')],
			[card(14, 'hearts'), card(13, 'clubs')]
		),
		1
	);
	assert.equal(
		twoCard.compareHands(
			[card(9, 'hearts'), card(8, 'spades')],
			[card(9, 'clubs'), card(8, 'diamonds')]
		),
		0
	);
});

for (let count = 2; count <= 6; count++)
	test(`${count} players receive two private cards and share standard room accounting`, () => {
		const ids = Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
		const ctx = {
			now: 1000,
			turnMs: 60000,
			handId: `two-${count}`,
			deck: freshDeck(),
			connected: new Set(ids)
		};
		let room = newRoom('two-card-room', 50, 'a', '2-card-1');
		for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
		room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 2 }, ctx);
		assert.ok(room.players.every((player) => player.cards.length === 2));
		assert.equal(
			new Set(
				room.players.flatMap((player) => player.cards.map(({ rank, suit }) => `${rank}:${suit}`))
			).size,
			count * 2
		);
		assert.equal(room.deck.length, 52 - count * 2);
		for (const id of ids) {
			const view = projection(room, id, ctx.connected);
			assert.equal(view.usersList.find((player) => player.id === id).cardsInHand.length, 2);
			assert.ok(
				view.usersList
					.filter((player) => player.id !== id)
					.every((player) => player.cardsInHand.every((face) => face.rank === 0))
			);
		}
		invariant(room);
	});

test('a room can switch from 2 Card to Classic between hands', () => {
	const ctx = {
		now: 1000,
		turnMs: 60000,
		handId: 'two',
		deck: freshDeck(),
		connected: new Set(['a', 'b'])
	};
	let room = newRoom('switch-two', 50, 'a', '2-card-1');
	for (const id of ctx.connected) room = transition(room, id, 'join', { username: id }, ctx);
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 2 }, ctx);
	room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	room = transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3, rulesVersion: 'classic-1' },
		{ ...ctx, handId: 'classic' }
	);
	assert.equal(room.rulesVersion, 'classic-1');
	assert.ok(room.players.every((player) => player.cards.length === 3));
});
