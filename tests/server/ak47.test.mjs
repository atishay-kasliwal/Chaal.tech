import test from 'node:test';
import assert from 'node:assert/strict';
import {
	freshDeck,
	evaluateHand as evaluateClassic,
	compareHands as compareClassic
} from '../../server/classic.mjs';
import { getVariant, listVariants } from '../../server/variants/index.mjs';
import { newRoom, transition, invariant, projection } from '../../server/engine.mjs';

const ak47 = getVariant('ak47-1');
const card = (rank, suit) => ({ rank, suit });

test('AK47 is registered without changing the Classic default or other variants', () => {
	assert.deepEqual(
		listVariants().map(({ rulesVersion }) => rulesVersion),
		[
			'classic-1',
			'muflis-1',
			'ak47-1',
			'joker-1',
			'lowest-joker-1',
			'999-1',
			'2-card-1',
			'4-card-1',
			'highest-joker-1',
			'one-eyed-jack-1',
			'color-joker-1',
			'lallan-kallan-1',
			'odd-even-1',
			'best-of-five-1',
			'worst-of-four-1',
			'hukum-1',
			'red-black-1',
			'progressive-joker-1',
			'pot-blind-1',
			'discard-one-1',
			'folding-joker-2',
			'muflis-4-1',
			'joker-4-1',
			'lowest-joker-4-1',
			'highest-joker-4-1',
			'color-joker-4-1',
			'open-card-1',
			'one-hidden-1',
			'stud-1',
			'draw-1',
			'trade-one-1',
			'pass-the-card-1',
			'high-low-1',
			'split-pot-1',
			'faceoff-1',
			'buying-joker-1',
			'auction-1',
			'knockout-1',
			'sudden-death-1',
			'survivor-1',
			'banko-1',
			'community-1',
			'chatai-1',
			'running-1',
			'rotating-joker-1',
			'revolving-joker-1',
			'kiss-miss-bliss-1',
			'kissing-missing-1'
		]
	);
	assert.equal(getVariant('classic-1').id, 'classic');
	assert.deepEqual(ak47.getRules().wildRanks, [4, 7, 13, 14]);
	assert.throws(() => ak47.getRules().wildRanks.push(2), TypeError);
});

test('hands without A, K, 4 or 7 keep exact Classic scores and comparisons', () => {
	const hands = [
		[card(9, 'hearts'), card(9, 'spades'), card(6, 'clubs')],
		[card(10, 'hearts'), card(9, 'hearts'), card(8, 'hearts')],
		[card(12, 'hearts'), card(10, 'spades'), card(8, 'clubs')]
	];
	for (const hand of hands) {
		assert.deepEqual(ak47.evaluateHand(hand), evaluateClassic(hand));
		for (const other of hands)
			assert.equal(ak47.compareHands(hand, other), compareClassic(hand, other));
	}
});

test('wild cards can complete a stronger valid hand and use each represented card only once', () => {
	assert.deepEqual(
		ak47.evaluateHand([card(2, 'hearts'), card(2, 'spades'), card(7, 'diamonds')]),
		[5, 2]
	);
	assert.deepEqual(
		ak47.evaluateHand([card(9, 'hearts'), card(10, 'hearts'), card(7, 'clubs')]),
		[4, 11]
	);
	assert.deepEqual(
		ak47.evaluateHand([card(12, 'hearts'), card(13, 'spades'), card(14, 'clubs')]),
		[5, 12]
	);
	assert.deepEqual(
		ak47.evaluateHand([card(14, 'hearts'), card(13, 'spades'), card(7, 'clubs')]),
		[5, 14]
	);
	const natural = [card(9, 'hearts'), card(9, 'spades'), card(6, 'clubs')];
	const before = structuredClone(natural);
	assert.deepEqual(ak47.evaluateHand(natural), evaluateClassic(natural));
	assert.deepEqual(natural, before);
});

test('wild hands compare by their best Classic rank vector; suits never break ties', () => {
	const left = [card(2, 'hearts'), card(2, 'spades'), card(7, 'diamonds')];
	const equal = [card(2, 'clubs'), card(2, 'diamonds'), card(14, 'hearts')];
	const lower = [card(3, 'hearts'), card(3, 'spades'), card(6, 'clubs')];
	assert.equal(ak47.compareHands(left, equal), 0);
	assert.equal(ak47.compareHands(left, lower), 1);
	assert.equal(ak47.compareHands(lower, left), -1);
});

test('Classic to AK47 selection reuses room seats, chips, dealing and private projections', () => {
	const ctx = {
		now: 1000,
		turnMs: 60000,
		handId: 'classic-hand',
		deck: freshDeck(),
		connected: new Set(['a', 'b', 'c'])
	};
	let room = newRoom('switch-room', 50, 'a', 'classic-1');
	for (const id of ctx.connected) room = transition(room, id, 'join', { username: id }, ctx);
	const seats = room.players.map(({ id, seatNumber }) => [id, seatNumber]);
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3 }, ctx);
	while (!room.gameShow) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	const balancesBefore = room.players.map(({ id, balance }) => [id, balance]);
	room = transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3, rulesVersion: 'ak47-1' },
		{ ...ctx, handId: 'ak47-hand' }
	);
	assert.equal(room.rulesVersion, 'ak47-1');
	assert.equal(room.handId, 'ak47-hand');
	assert.deepEqual(
		room.players.map(({ id, seatNumber }) => [id, seatNumber]),
		seats
	);
	assert.deepEqual(
		room.players.map(({ id, balance }) => [id, balance]),
		balancesBefore.map(([id, balance]) => [id, balance - 1])
	);
	for (const id of ctx.connected) {
		const view = projection(room, id, ctx.connected);
		for (const player of view.usersList) {
			if (player.id !== id) assert.ok(player.cardsInHand.every(({ rank }) => rank === 0));
		}
	}
	invariant(room);
});

test('AK47 rejects malformed and duplicate-card hands through the Classic contract', () => {
	for (const hand of [
		[],
		[card(2, 'hearts'), card(3, 'spades')],
		[card(4, 'hearts'), card(4, 'hearts'), card(2, 'clubs')]
	])
		assert.throws(() => ak47.evaluateHand(hand));
	assert.throws(() => ak47.compareHands([card(2, 'hearts')], [card(3, 'spades')]));
});
