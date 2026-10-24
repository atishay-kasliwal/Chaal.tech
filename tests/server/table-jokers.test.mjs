import test from 'node:test';
import assert from 'node:assert/strict';
import { matFor } from '../../src/lib/teen-patti/table-cards.ts';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection } from '../../server/engine.mjs';

const indicator = { rank: 12, suit: 'diamonds' };
const room = (rulesVersion, variantState) => ({
	rulesVersion, variantState, isStarted: true, usersList: [], legalActions: {}, pot: 20
});
const ui = { previewLine: null, onopen() {}, onpreview() {}, onlock() {}, onmove() {} };

test('public rank and colour jokers sit on the table with the correct scope', () => {
	const rank = matFor(room('joker-1', { indicator, wildRank: 12 }), 'me', ui);
	assert.deepEqual(rank.tray.cards, [indicator]);
	assert.equal(rank.tray.ranks, 'Q');
	assert.match(rank.tray.note, /rank.*everyone/);
	const colour = matFor(room('color-joker-1', { indicator, wildColor: 'red' }), 'me', ui);
	assert.deepEqual(colour.tray.cards, [indicator]);
	assert.equal(colour.tray.ranks, undefined);
	assert.match(colour.tray.note, /Every red card/);
});

test('hidden indicators stay hidden, and no previous joker appears in a waiting room', () => {
	assert.equal(matFor(room('joker-1', { indicator: { rank: 0, suit: '' } }), 'me', ui), null);
	assert.equal(matFor({ ...room('joker-1', { indicator }), isStarted: false }, 'me', ui), null);
	const progressive = matFor(room('progressive-joker-1', { indicator, stage: 0, wildRanks: [] }), 'me', ui);
	assert.deepEqual(progressive.tray.cards, []);
	const buying = matFor(room('buying-joker-2', { buyers: [] }), 'me', ui);
	assert.equal(buying.tray.cards, undefined);
	assert.match(buying.tray.note, /hidden/);
});

test('shared folded ranks and public throws retain their table display', () => {
	const shared = matFor(room('folding-joker-2', { wildRanks: [13, 7, 7] }), 'me', ui);
	assert.equal(shared.tray.ranks, '7 · K');
	const thrown = matFor(room('joker-4-2', { indicator, throws: [{ playerId: 'other', card: { rank: 3, suit: 'clubs' } }] }), 'me', ui);
	assert.equal(thrown.cards.length, 1);
	assert.deepEqual(thrown.tray.cards, [indicator]);
});

/** A real hand, as the server sends it to player a: what the table must show for the joker. */
function realView(rulesVersion, cardsToDeal = 3) {
	const connected = new Set(['a', 'b']);
	const ctx = { now: 1000, turnMs: 60000, connected };
	let table = newRoom('joker-table', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ['a', 'b']) table = transition(table, id, 'join', { username: id }, ctx);
	table = transition(table, 'a', 'start', { cutAt: 0, cardsToDeal, rulesVersion }, { ...ctx, deck: freshDeck(), handId: 'h1' });
	return { table, view: projection(table, 'a', connected), ctx, connected };
}

test('real hands: the joker the server deals is the joker on the table', () => {
	for (const [version, cards] of [['joker-1', 3], ['joker-4-1', 4]]) {
		const { table, view } = realView(version, cards);
		const mat = matFor(view, 'a', ui);
		assert.deepEqual(mat.tray.cards, [table.variantState.indicator], version);
		assert.equal(mat.tray.title, 'Joker');
		assert.equal(mat.tray.ranks, { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[table.variantState.wildRank] ?? String(table.variantState.wildRank));
	}
	for (const [version, cards] of [['color-joker-1', 3], ['color-joker-4-1', 4]]) {
		const { table, view } = realView(version, cards);
		const mat = matFor(view, 'a', ui);
		assert.deepEqual(mat.tray.cards, [table.variantState.indicator], version);
		assert.match(mat.tray.note, new RegExp(`Every ${table.variantState.wildColor} card`));
	}
});

test('real hands: Folding Joker shows the shared jokers as they are folded', () => {
	const { table, view, ctx, connected } = realView('folding-joker-2', 4);
	assert.match(matFor(view, 'a', ui).tray.note, /Fold a card/);
	// The player on turn looks and folds their first card: that rank is now a shared joker.
	const folder = table.currentPlayerId;
	let next = transition(table, folder, 'see', {}, ctx);
	const folded = next.players.find((p) => p.id === folder).cards[0].rank;
	next = transition(next, folder, 'discard', { index: 0 }, ctx);
	const mat = matFor(projection(next, 'a', connected), 'a', ui);
	assert.match(mat.tray.note, /wild for everyone/);
	assert.ok(mat.tray.ranks.length > 0);
	assert.equal(next.variantState.wildRanks.includes(folded), true);
});
