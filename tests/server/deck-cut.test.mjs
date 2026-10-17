import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, playing, CUT_MS } from '../../server/engine.mjs';

/**
 * A fair deck: the server seals the next hand's deck before anyone cuts, the person whose turn it
 * was to pick cuts it, and after the hand the shown cards can be checked against the seal.
 */

const sha = (value) => createHash('sha256').update(value).digest('hex');
const connected = new Set(['a', 'b', 'c']);
const ctx = { now: 1000, turnMs: 90000, connected, randomInt: () => 0, lineup: [] };

function table(lineup = []) {
	let room = newRoom('cut-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ['a', 'b', 'c']) room = transition(room, id, 'join', { username: id }, ctx);
	return transition(room, 'a', 'prepareStart', {}, { ...ctx, lineup });
}
/** What the room server does when a cut opens: seal a shuffled deck. */
function seal(room, deck = freshDeck().reverse()) {
	const salts = deck.map((_, i) => `salt-${i}-${'x'.repeat(20)}`);
	const leaves = deck.map((card, i) => sha(`${i}|${card.rank}|${card.suit}|${salts[i]}`));
	return { ...room, seal: { deck, salts, leaves, commitment: sha(leaves.join('')) } };
}
const deal = (room, cutAt) =>
	transition(
		room,
		'a',
		'start',
		{ cutAt, cardsToDeal: 3, rulesVersion: room.upNext?.rulesVersion ?? room.rulesVersion },
		{ ...ctx, deck: room.seal.deck, handId: `h${room.revision}`, requireReady: true }
	);

test('the host starts the night: its game is settled and the host cuts first', () => {
	const room = table(['muflis-1', 'ak47-1']);
	assert.equal(room.upNext.rulesVersion, 'muflis-1');
	assert.equal(room.upNext.lineupIndex, 0);
	assert.deepEqual(room.cut, { by: 'a', ms: CUT_MS, deadline: ctx.now + CUT_MS, at: null });
	assert.throws(() => transition(room, 'b', 'prepareStart', {}, ctx), /Only the host/);
	assert.throws(() => transition(room, 'a', 'prepareStart', {}, ctx), /already under way/);
});

test('only the cutter cuts, once, somewhere inside the deck', () => {
	let room = table();
	assert.throws(() => transition(room, 'b', 'cutDeck', { at: 20 }, ctx), /not your turn/);
	for (const at of [0, 52, 2.5, '9'])
		assert.throws(
			() => transition(room, 'a', 'cutDeck', { at }, ctx),
			/between the first and last/
		);
	room = transition(room, 'a', 'cutDeck', { at: 20 }, ctx);
	assert.equal(room.cut.at, 20);
	assert.throws(() => transition(room, 'a', 'cutDeck', { at: 21 }, ctx), /already cut/);
	// Everyone sees who cut and where.
	assert.equal(projection(room, 'c', connected).cut.at, 20);
});

test('the sealed deck is dealt from the cut, and only its fingerprint shows during the hand', () => {
	let room = seal(transition(table(), 'a', 'cutDeck', { at: 20 }, ctx));
	assert.equal(projection(room, 'b', connected).cut.commitment, room.seal.commitment);
	assert.equal(projection(room, 'b', connected).seal, undefined);
	const sealed = room.seal.deck;
	room = deal(room, 20);
	assert.ok(playing(room));
	// After a cut at 20, the first card dealt is the 21st card of the sealed deck.
	const firstSeat = room.players.find((p) => p.seatNumber === 0);
	assert.deepEqual(firstSeat.cards[0], sealed[20]);
	const view = projection(room, 'b', connected);
	assert.equal(view.deckProof.commitment, room.handSeal.commitment);
	assert.equal(view.deckProof.cutAt, 20);
	assert.equal(view.deckProof.leaves, undefined, 'no proof material before the hand ends');
	assert.equal(view.cut, undefined);
});

test('after a Show, anyone can check the shown cards against the seal; packed hands stay secret', () => {
	let room = seal(transition(table(), 'a', 'cutDeck', { at: 7 }, ctx));
	room = deal(room, 7);
	// c packs; a and b show.
	while (playing(room)) {
		const turn = room.currentPlayerId;
		if (turn === 'c') room = transition(room, 'c', 'pack', {}, ctx);
		else if (room.players.filter((p) => !p.isPacked).length === 2)
			room = transition(room, turn, 'show', {}, ctx);
		else room = transition(room, turn, 'bet', { amount: 10 }, ctx);
	}
	const proof = projection(room, 'c', connected).deckProof;
	assert.equal(proof.cards.length, 6, 'the two shown hands');
	// Verify exactly as the table does: each shown card's fingerprint sits in the sealed list,
	// and the fingerprints add up to the fingerprint published before the cut.
	assert.equal(sha(proof.leaves.join('')), proof.commitment);
	for (const card of proof.cards)
		assert.equal(sha(`${card.pos}|${card.rank}|${card.suit}|${card.salt}`), proof.leaves[card.pos]);
	// c's packed cards are not in the proof.
	const packed = room.players.find((p) => p.id === 'c').cards.map((c) => `${c.rank}:${c.suit}`);
	assert.ok(proof.cards.every((card) => !packed.includes(`${card.rank}:${card.suit}`)));
	assert.equal(JSON.stringify(proof).includes(room.handSeal.salts[proof.cards.length + 30]), false);
});

test('after each hand the next picker cuts; changing the game reseals', () => {
	let room = seal(table());
	room = deal(room, 5);
	while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	const chooser = room.chooser.playerId;
	room = transition(room, chooser, 'chooseNext', { choice: 'muflis-1' }, ctx);
	assert.equal(room.cut.by, chooser);
	room = seal(room);
	room = transition(room, chooser, 'openPick', {}, ctx);
	assert.equal(room.cut, undefined);
	assert.equal(room.seal, undefined, 'a new game gets a new sealed deck');
});
