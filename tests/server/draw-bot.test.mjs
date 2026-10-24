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

const buyOptions = [{ kind: 'buy', price: 50 }, { kind: 'buy', decline: true }];
const bots = (view, cards, balance, random, variant = { smartBids: true }) =>
	tableMove({ legalActions: { table: view } }, { id: 'bot', cardsInHand: cards, balance }, variant, random);

test('a Buying Joker bot passes unless its seen hand is weak and its stack deep', () => {
	const weak = [c(13, 'hearts'), c(8, 'spades'), c(3, 'clubs')];
	const pair = [c(9, 'hearts'), c(9, 'spades'), c(3, 'clubs')];
	const hidden = [c(0, ''), c(0, ''), c(0, '')];
	assert.deepEqual(bots(buyOptions, pair, 5000, () => 0), { kind: 'buy', decline: true });
	assert.deepEqual(bots(buyOptions, hidden, 5000, () => 0), { kind: 'buy', decline: true });
	// Weak but shallow stack: the price is more than a fortieth of it.
	assert.deepEqual(bots(buyOptions, weak, 1000, () => 0), { kind: 'buy', decline: true });
	assert.deepEqual(bots(buyOptions, weak, 5000, () => 0.9), { kind: 'buy', decline: true });
	assert.deepEqual(bots(buyOptions, weak, 5000, () => 0), { kind: 'buy', price: 50 });
});

const bidOptions = [0, 1, 2, 5, 10].map((bid) => ({ kind: 'bid', bid, amount: bid * 10 }));

test('an Auction 2 bot bids at most one boot, and only with a seen weak hand', () => {
	const weak = [c(13, 'hearts'), c(8, 'spades'), c(3, 'clubs')];
	const pair = [c(9, 'hearts'), c(9, 'spades'), c(3, 'clubs')];
	const hidden = [c(0, ''), c(0, ''), c(0, '')];
	assert.equal(bots(bidOptions, weak, 5000, () => 0).bid, 1);
	assert.equal(bots(bidOptions, weak, 5000, () => 0.9).bid, 0);
	assert.equal(bots(bidOptions, pair, 5000, () => 0).bid, 0);
	assert.equal(bots(bidOptions, hidden, 5000, () => 0).bid, 0);
	// Only the bids on offer can be chosen.
	assert.equal(bots(bidOptions.slice(0, 1), weak, 5000, () => 0).bid, 0);
});

test('Auction 1 bots keep bidding as they did when it shipped: any bid on offer', () => {
	const weak = [c(13, 'hearts'), c(8, 'spades'), c(3, 'clubs')];
	const picked = new Set();
	for (let i = 0; i < 40; i++) picked.add(bots(bidOptions, weak, 5000, () => i / 40, {}).bid);
	assert.ok(picked.has(10) && picked.has(0), 'a spread of bids, including the biggest');
});

test('Buying Joker 1 has no pass, so its bots still buy, drawing the same random number as ever', () => {
	const pair = [c(9, 'hearts'), c(9, 'spades'), c(3, 'clubs')];
	let draws = 0;
	const random = () => (draws++, 0);
	assert.deepEqual(bots([{ kind: 'buy', price: 50 }], pair, 5000, random, {}), {
		kind: 'buy',
		price: 50
	});
	assert.equal(draws, 1, 'the generic pick draws once, as when the game shipped');
});
