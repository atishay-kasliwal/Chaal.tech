import test from 'node:test';
import assert from 'node:assert/strict';
import { tableMove } from '../../server/bots/strategy.mjs';

const c = (rank, suit) => ({ rank, suit });
const options = [0, 1, 2, -1].map((index) => ({ kind: 'draw', index }));
const move = (cards) =>
	tableMove({ legalActions: { table: options } }, { id: 'bot', cardsInHand: cards }, null, () => 0);

test('a Draw bot keeps a pair or better', () => {
	assert.deepEqual(move([c(9, 'hearts'), c(9, 'spades'), c(2, 'clubs')]), { kind: 'draw', index: -1 });
	assert.deepEqual(move([c(5, 'hearts'), c(6, 'hearts'), c(7, 'hearts')]), { kind: 'draw', index: -1 });
});

test('a Draw bot keeps two connected cards and replaces the third', () => {
	assert.deepEqual(move([c(9, 'hearts'), c(13, 'spades'), c(10, 'clubs')]), { kind: 'draw', index: 1 });
	assert.deepEqual(move([c(2, 'hearts'), c(13, 'hearts'), c(8, 'clubs')]), { kind: 'draw', index: 2 });
});

test('a Draw bot with nothing replaces its lowest card', () => {
	assert.deepEqual(move([c(14, 'hearts'), c(8, 'spades'), c(3, 'clubs')]), { kind: 'draw', index: 2 });
});
