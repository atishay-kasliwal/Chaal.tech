import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { listVariants } from '../../server/variants/index.mjs';
import { newRoom, transition, projection, invariant, playing } from '../../server/engine.mjs';

/**
 * Plays thousands of random but legal hands for every variant and table size, the
 * way real players click. Every step must keep chips conserved, never leak a hidden
 * card, keep the advertised legal actions honest, and end each hand with a winner.
 */

function rng(seed) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 2 ** 32;
	};
}
const pick = (random, list) => list[Math.floor(random() * list.length)];
function shuffled(random) {
	const deck = freshDeck();
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];

function assertNoLeaks(room, connected) {
	const reveal = new Set(room.result?.revealedPlayerIds ?? []);
	for (const viewer of room.players.filter((p) => p.seatNumber !== null && !p.departed)) {
		const view = projection(room, viewer.id, connected);
		for (const user of view.usersList) {
			const owner = room.players.find((p) => p.id === user.id);
			const visible = (owner.id === viewer.id && !owner.isBlind) || reveal.has(owner.id);
			assert.equal(user.cardsInHand.length, owner.cards.length);
			if (visible) {
				assert.deepEqual(user.cardsInHand, owner.cards);
				if (owner.cards.length)
					assert.equal(typeof user.handName, 'string', `${room.rulesVersion} names visible hands`);
			} else {
				assert.ok(
					user.cardsInHand.every((card) => card.rank === 0 && card.suit === ''),
					'hidden card leaked'
				);
				assert.equal(user.handName, undefined, 'hidden hand name leaked');
				assert.equal(user.wildCards, undefined, 'hidden joker positions leaked');
			}
		}
	}
}

/** Choose what a real player could click right now, using only what the server advertises. */
function chooseAction(room, connected, random) {
	const actorId = room.currentPlayerId;
	const view = projection(room, actorId, connected);
	const legal = view.legalActions;
	const me = view.usersList.find((user) => user.id === actorId);
	const options = [];
	if (legal.see) options.push(['see', {}], ['see', {}]);
	if (legal.discard)
		return [actorId, 'discard', { index: Math.floor(random() * me.cardsInHand.length) }];
	if (legal.bet) {
		options.push(
			['bet', { amount: legal.minBet }],
			['bet', { amount: legal.minBet }],
			['bet', { amount: legal.minBet }]
		);
		if (legal.maxBet > legal.minBet) options.push(['bet', { amount: legal.maxBet }]);
	}
	if (legal.show) options.push(['show', {}], ['show', {}]);
	if (legal.pack) options.push(['pack', {}]);
	if (random() < 0.03) return [actorId, 'timeout', {}];
	assert.ok(options.length, `${room.rulesVersion}: current player has no legal action`);
	const [action, payload] = pick(random, options);
	return [actorId, action, payload];
}

function playSession(rulesVersion, playerCount, seed) {
	const random = rng(seed);
	const connected = new Set(ids.slice(0, playerCount));
	let now = 1_000;
	let room = newRoom('sim-room', 1000, 'p0', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ids.slice(0, playerCount))
		room = transition(room, id, 'join', { username: id }, { now, turnMs: 60000, connected });
	const issued = room.issuedChips;
	const variant = listVariants().find((v) => v.rulesVersion === rulesVersion);
	let hands = 0;
	for (let hand = 0; hand < 6; hand++) {
		const able = room.players.filter((p) => p.balance >= 10 && p.ready !== false);
		if (able.length < 2) break;
		room = transition(
			room,
			room.hostId,
			'start',
			{ cutAt: Math.floor(random() * 20), cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion },
			{
				now,
				turnMs: 60000,
				connected,
				handId: `hand-${seed}-${hand}`,
				deck: shuffled(random),
				requireReady: true
			}
		);
		hands++;
		assert.ok(playing(room));
		assertNoLeaks(room, connected);
		let steps = 0;
		while (playing(room)) {
			assert.ok(++steps < 600, `${rulesVersion}: hand did not finish`);
			// Players who are not on turn may look at their cards at any time.
			for (const p of room.players)
				if (
					p.id !== room.currentPlayerId &&
					random() < 0.08 &&
					projection(room, p.id, connected).legalActions.see
				)
					room = transition(room, p.id, 'see', {}, { now, turnMs: 60000, connected });
			const [actor, action, payload] = chooseAction(room, connected, random);
			if (action === 'timeout') now = room.deadline;
			const before = JSON.stringify(room);
			room = transition(room, actor, action, payload, { now, turnMs: 60000, connected });
			assert.notEqual(JSON.stringify(room), before, `${rulesVersion}: ${action} changed nothing`);
			invariant(room);
			assert.equal(
				room.players.reduce((sum, p) => sum + p.balance, room.pot),
				issued
			);
			assertNoLeaks(room, connected);
			now += 1000;
		}
		assert.ok(room.result, 'every hand ends with a result');
		assert.equal(room.pot, 0);
		assert.ok(room.players.some((p) => p.id === room.result.winnerId));
		if (room.result.reason.startsWith('show'))
			assert.equal(room.result.revealedPlayerIds.length, 2);
		// Occasionally someone sits out the next hand, then comes back.
		const sitter = pick(random, room.players);
		room = transition(
			room,
			sitter.id,
			'ready',
			{ ready: random() < 0.75 },
			{ now, turnMs: 60000, connected }
		);
	}
	return hands;
}

for (const variant of listVariants())
	test(`Random legal play: ${variant.name} (${variant.rulesVersion}) on 2–6 player tables`, () => {
		let hands = 0;
		for (let players = 2; players <= 6; players++)
			for (let seed = 1; seed <= 12; seed++)
				hands += playSession(variant.rulesVersion, players, seed * 7919 + players * 104729);
		assert.ok(hands > 200, `${variant.rulesVersion} played ${hands} hands`);
	});

test('Illegal actions are refused without changing the table, in every variant', () => {
	const connected = new Set(['a', 'b', 'c']);
	const ctx = { now: 1000, turnMs: 60000, connected };
	for (const variant of listVariants()) {
		let room = newRoom('illegal-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
		for (const id of ['a', 'b', 'c']) room = transition(room, id, 'join', { username: id }, ctx);
		room = transition(
			room,
			'a',
			'start',
			{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion: variant.rulesVersion },
			{ ...ctx, deck: freshDeck(), handId: 'x' }
		);
		const before = JSON.stringify(room);
		const notTurn = room.players.find((p) => p.id !== room.currentPlayerId).id;
		const attempts = [
			[notTurn, 'bet', { amount: 10 }],
			[room.currentPlayerId, 'bet', { amount: 5 }],
			[room.currentPlayerId, 'bet', { amount: 21 }],
			[room.currentPlayerId, 'bet', { amount: 10.5 }],
			[room.currentPlayerId, 'show', {}],
			[room.currentPlayerId, 'discard', { index: 0 }],
			[room.currentPlayerId, 'timeout', {}],
			['a', 'start', { cutAt: 0, cardsToDeal: 3 }],
			['zz', 'see', {}]
		];
		for (const [id, action, payload] of attempts)
			assert.throws(
				() => transition(room, id, action, payload, ctx),
				undefined,
				`${variant.rulesVersion} ${action}`
			);
		assert.equal(JSON.stringify(room), before, variant.rulesVersion);
	}
});
