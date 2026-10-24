import test from 'node:test';
import assert from 'node:assert/strict';
import { redBlack as v } from '../../server/variants/red-black.mjs';

const c = (rank, suit) => ({ rank, suit });
const H = 'hearts', D = 'diamonds', S = 'spades', C = 'clubs';
const cmp = (a, b) => v.compareHands(a, b);

const trail = [c(2, H), c(2, D), c(2, S)];
const pure = [c(5, H), c(4, H), c(3, H)];
const seq = [c(9, H), c(8, S), c(7, D)];
const flush = [c(9, H), c(6, H), c(3, H)];
const colour = [c(13, H), c(8, D), c(3, H)];
const pair = [c(14, H), c(14, S), c(13, D)];
const high = [c(14, H), c(13, S), c(9, D)];

test('identity', () => {
	assert.equal(v.id, 'red-black');
	assert.equal(v.rulesVersion, 'red-black-1');
	assert.equal(v.name, 'Red & Black');
	assert.deepEqual(v.wildIndexes(), []);
});

test('ordering across every category boundary', () => {
	const order = [trail, pure, seq, flush, colour, pair, high];
	for (let i = 0; i < order.length - 1; i++) assert.equal(cmp(order[i], order[i + 1]), 1, `step ${i}`);
	for (let i = 0; i < order.length - 1; i++) assert.equal(cmp(order[i + 1], order[i]), -1);
});

test('lowest colour hand beats highest pair; lowest flush beats highest colour hand', () => {
	assert.equal(cmp([c(4, H), c(3, D), c(2, H)].map((x) => x), pair), 1);
	assert.equal(cmp([c(5, S), c(3, S), c(2, S)], [c(14, H), c(13, D), c(11, H)]), 1);
});

test('colour hands compare by ranks; red and black tie', () => {
	assert.equal(cmp([c(13, H), c(8, D), c(3, H)], [c(13, S), c(8, C), c(3, S)]), 0);
	assert.equal(cmp([c(13, H), c(8, D), c(4, H)], [c(13, S), c(8, C), c(3, S)]), 1);
	assert.equal(cmp([c(12, H), c(11, D), c(9, H)], [c(13, S), c(2, C), c(3, S)]), -1);
});

test('same-colour sequence stays a sequence', () => {
	const s = [c(9, H), c(8, D), c(7, H)];
	assert.equal(v.evaluateHand(s)[0], 3);
	assert.equal(cmp(s, flush), 1);
	assert.equal(cmp(s, colour), 1);
});

test('same suit stays a flush', () => {
	assert.equal(v.evaluateHand(flush)[0], 2);
});

test('same-colour pair stays a pair', () => {
	const p = [c(9, H), c(9, D), c(4, H)];
	assert.equal(v.evaluateHand(p)[0], 1);
	assert.equal(cmp(p, colour), -1);
});

test('mixed colours stay high card', () => {
	assert.equal(v.evaluateHand(high)[0], 0);
	assert.equal(v.evaluateHand([c(9, H), c(6, D), c(3, S)])[0], 0);
});

test('describe', () => {
	assert.equal(v.describe(colour), 'All red, King high');
	assert.equal(v.describe(flush), 'Colour, 9 high');
	assert.equal(v.describe(pair), 'Pair of Aces');
	assert.equal(v.describe(seq), 'Sequence, 9 high');
	assert.equal(v.describe(pure), 'Pure sequence, 5 high');
	assert.equal(v.describe(trail), 'Trail of 2s');
	assert.equal(v.describe(high), 'High card Ace');
});

test('getRules shape', () => {
	const r = v.getRules();
	assert.deepEqual(r.rankingOrder.slice(0, 3), ['high-card', 'pair', 'colour-hand']);
	assert.ok(Object.isFrozen(r));
	assert.match(r.upgradeRule, /pair stays a pair/);
	assert.ok(!JSON.stringify(r).includes('—'));
});

test('rejects bad hands', () => {
	assert.throws(() => v.evaluateHand([c(2, H), c(2, H), c(3, H)]));
	assert.throws(() => v.evaluateHand([c(2, H)]));
});
