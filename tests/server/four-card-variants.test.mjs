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

test('Folding Joker: the folded card is your joker', () => {
	const v = getVariant('folding-joker-1');
	// Keep 9♠ 9♥ 4♦, fold 4♣: fours are wild, so 9 9 + wild 4 makes a trail of 9s.
	const folded = [c(9, 'spades'), c(9, 'hearts'), c(4, 'diamonds'), c(4, 'clubs')];
	// Same keep, fold a King: no wild in hand, just a pair of 9s.
	const plain = [c(9, 'spades'), c(9, 'hearts'), c(4, 'diamonds'), c(13, 'clubs')];
	assert.ok(v.compareHands(folded, plain) > 0);
	assert.deepEqual(v.wildIndexes(folded), [2]);
	// The bot throws the card whose rank helps most as a joker.
	// (Either 4 works: throw one, the other 4 is wild.)
	assert.ok([2, 3].includes(bestDiscard(folded, v)));
});

test('four-card games deal four, take a discard, and play three', () => {
	for (const version of [
		'muflis-4-1',
		'joker-4-1',
		'lowest-joker-4-1',
		'highest-joker-4-1',
		'color-joker-4-1',
		'folding-joker-1'
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
		{ cutAt: 0, cardsToDeal: 4, rulesVersion: 'folding-joker-1' },
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
});
