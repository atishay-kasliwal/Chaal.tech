import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, playing } from '../../server/engine.mjs';
import { getVariant } from '../../server/variants/index.mjs';
import { bestDiscard } from '../../server/bots/strategy.mjs';

const c = (rank, suit) => ({ rank, suit });
const ids = ['a', 'b'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, connected };

test('original Folding Joker remains available for saved hands', () => {
	const old = getVariant('folding-joker-1');
	const keep = [c(9, 'spades'), c(9, 'hearts'), c(4, 'diamonds')];
	assert.ok(old.compareHands([...keep, c(4, 'clubs')], [...keep, c(13, 'clubs')]) > 0);
	assert.deepEqual(old.wildIndexes([...keep, c(4, 'clubs')]), [2]);
});

test('Folding Joker: every folded rank is wild for both hands', () => {
	const v = getVariant('folding-joker-2');
	// Keep 9♠ 9♥ 4♦, fold 4♣: fours are wild, so 9 9 + wild 4 makes a trail of 9s.
	const folded = [c(9, 'spades'), c(9, 'hearts'), c(4, 'diamonds'), c(4, 'clubs')];
	// Same keep, fold a King: no wild in hand, just a pair of 9s.
	const plain = [c(9, 'spades'), c(9, 'hearts'), c(4, 'diamonds'), c(13, 'clubs')];
	const state = { wildRanks: [4] };
	assert.equal(v.compareHands(folded, plain, state), 0);
	assert.deepEqual(v.wildIndexes(folded, state), [2]);
	assert.deepEqual(v.wildIndexes(plain, state), [2]);
	assert.deepEqual(v.wildIndexes(folded, { wildRanks: [] }), []);
	// The bot throws the card whose rank helps most as a joker.
	// (Either 4 works: throw one, the other 4 is wild.)
	assert.ok([2, 3].includes(bestDiscard(folded, v)));
	bestDiscard(folded, v, state);
	assert.deepEqual(state, { wildRanks: [4] }, 'bot candidate scoring does not change the pool');
});

test('four-card games deal four, take a discard, and play three', () => {
	for (const version of [
		'muflis-4-1',
		'joker-4-1',
		'lowest-joker-4-1',
		'highest-joker-4-1',
		'color-joker-4-1',
		'folding-joker-2'
	]) {
		const v = getVariant(version);
		assert.equal(v.cardsPerPlayer, 4, version);
		assert.equal(v.discardTo, 3, version);
	}
	// Muflis 4 keeps Muflis order: the lower three wins.
	const m = getVariant('muflis-4-1');
	assert.ok(
		m.compareHands(
			[c(2, 'spades'), c(5, 'hearts'), c(7, 'clubs'), c(14, 'spades')],
			[c(14, 'hearts'), c(14, 'diamonds'), c(14, 'clubs'), c(2, 'hearts')]
		) > 0
	);
});

test('in a real hand, folding keeps the card last and stops asking to discard', () => {
	let room = newRoom('fold-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
	room = transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 4, rulesVersion: 'folding-joker-2' },
		{ ...ctx, deck: freshDeck(), handId: 'h', requireReady: true }
	);
	assert.ok(playing(room));
	const who = room.currentPlayerId;
	room = transition(room, who, 'see', {}, ctx);
	let view = projection(room, who, connected);
	assert.equal(view.legalActions.discard, true);
	assert.match(view.usersList.find((u) => u.id === who).handName, /Fold one card/);
	const thrown = room.players.find((p) => p.id === who).cards[1];
	room = transition(room, who, 'discard', { index: 1 }, ctx);
	const me = room.players.find((p) => p.id === who);
	assert.equal(me.cards.length, 4);
	assert.deepEqual(me.cards[3], thrown);
	view = projection(room, who, connected);
	assert.ok(!view.legalActions.discard);
	assert.equal(view.usersList.find((u) => u.id === who).folded, true);
	assert.deepEqual(view.variantState.wildRanks, [thrown.rank]);
	const other = ids.find((id) => id !== who);
	assert.deepEqual(projection(room, other, connected).variantState.wildRanks, [thrown.rank]);
	assert.ok(projection(room, other, connected).usersList.find((u) => u.id === who).cardsInHand.every((card) => card.rank === 0));
	room = transition(room, other, 'see', {}, ctx);
	const otherThrown = room.players.find((p) => p.id === other).cards[0];
	room = transition(room, other, 'discard', { index: 0 }, ctx);
	assert.deepEqual(room.variantState.wildRanks, [...new Set([thrown.rank, otherThrown.rank])]);
});

test('Folding Joker pool deduplicates ranks and resets for a fresh hand', () => {
	const variant = getVariant('folding-joker-2');
	const state = variant.prepareHand().state;
	variant.onDiscard(state, { card: c(7, 'hearts') });
	variant.onDiscard(state, { card: c(7, 'clubs') });
	variant.onDiscard(state, { card: c(13, 'spades') });
	assert.deepEqual(state.wildRanks, [7, 13]);
	assert.deepEqual(variant.prepareHand().state.wildRanks, []);
	assert.deepEqual(variant.wildIndexes([c(7, 'clubs'), c(13, 'hearts'), c(2, 'spades'), c(4, 'clubs')], state), [0, 1]);
});
