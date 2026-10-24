import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection } from '../../server/engine.mjs';
import { getVariant } from '../../server/variants/index.mjs';

const ids = ['a', 'b', 'c'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, connected };

function deal(rulesVersion) {
	let room = newRoom('throw-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
	const variant = getVariant(rulesVersion);
	return transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer, rulesVersion },
		{ ...ctx, deck: freshDeck(), handId: 'h', requireReady: true }
	);
}

const THROW_GAMES = [
	'discard-one-2',
	'best-of-five-2',
	'muflis-4-2',
	'joker-4-2',
	'lowest-joker-4-2',
	'highest-joker-4-2',
	'color-joker-4-2',
	'folding-joker-3'
];

test('in every throw game, a thrown card lies face up for every seat, with who threw it', () => {
	for (const version of THROW_GAMES) {
		let room = deal(version);
		const who = room.currentPlayerId;
		room = transition(room, who, 'see', {}, ctx);
		const card = room.players.find((p) => p.id === who).cards[1];
		room = transition(room, who, 'discard', { index: 1 }, ctx);
		for (const viewer of ids)
			assert.deepEqual(
				projection(room, viewer, connected).variantState.throws,
				[{ playerId: who, card }],
				`${version}: ${viewer} sees the throw`
			);
	}
});

test('the versions they replace keep thrown cards private', () => {
	for (const version of ['discard-one-1', 'joker-4-1', 'folding-joker-2']) {
		let room = deal(version);
		const who = room.currentPlayerId;
		room = transition(room, who, 'see', {}, ctx);
		room = transition(room, who, 'discard', { index: 1 }, ctx);
		assert.equal(room.variantState?.throws, undefined, version);
	}
});

test('Folding Joker 3: a seen player folds before packing', () => {
	let room = deal('folding-joker-3');
	const who = room.currentPlayerId;
	room = transition(room, who, 'see', {}, ctx);
	assert.equal(projection(room, who, connected).legalActions.pack, false);
	assert.throws(() => transition(room, who, 'pack', {}, ctx), /Fold a card onto the table/);
	room = transition(room, who, 'discard', { index: 0 }, ctx);
	assert.equal(projection(room, who, connected).legalActions.pack, true);
	room = transition(room, who, 'pack', {}, ctx);
	assert.equal(room.variantState.throws.length, 1);
});

test('Folding Joker 3: a blind pack folds the fourth card onto the table', () => {
	let room = deal('folding-joker-3');
	const who = room.currentPlayerId;
	const fourth = room.players.find((p) => p.id === who).cards[3];
	room = transition(room, who, 'pack', {}, ctx);
	assert.deepEqual(room.variantState.throws, [{ playerId: who, card: fourth }]);
	assert.deepEqual(room.variantState.wildRanks, [fourth.rank]);
});

test('Folding Joker 3: a seen player who times out folds their fourth card too', () => {
	let room = deal('folding-joker-3');
	const who = room.currentPlayerId;
	room = transition(room, who, 'see', {}, ctx);
	const fourth = room.players.find((p) => p.id === who).cards[3];
	room = transition(room, who, 'timeout', {}, { ...ctx, now: room.deadline + 1 });
	assert.deepEqual(room.variantState.throws, [{ playerId: who, card: fourth }]);
});
