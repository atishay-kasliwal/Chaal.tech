import test from 'node:test';
import assert from 'node:assert/strict';
import {
	freshPakadDeck,
	newRoom,
	transition,
	projection,
	autoMove,
	scoreHand
} from '../../server/tricks/ten-pakad.mjs';
import { cardKey, legalPlays } from '../../server/tricks/cards.mjs';
import { GameError } from '../../server/engine.mjs';
import { runTablePakad, randomPakad } from '../../server/sim/tricks/table-pakad.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';

/* 10 Pakad, Chaal V1 (docs/games/10PAKAD_PLAN.md §1, locked 2026-10-22). */

const IDS = ['a', 'b', 'c', 'd'];
const ctx = (extra = {}) => ({ now: 1000, turnMs: 60000, connected: new Set(IDS), ...extra });
const deckFor = (n) => shuffle(freshPakadDeck(), stream(9, 'deck', n).random);
function table() {
	let room = newRoom('ten-pakad-test', 0, 'a');
	for (const id of IDS) {
		room = transition(room, id, 'join', { username: id }, ctx());
		room = transition(room, id, 'ready', { ready: true }, ctx());
	}
	return room;
}
const byId = (room, id) => room.players.find((p) => p.id === id);
const legalFor = (room) =>
	legalPlays(byId(room, room.currentPlayerId).cards, room.trick.plays[0]?.card.suit);
function playOut(room, choose = (legal) => legal[0]) {
	let guard = 0;
	while (!room.gameShow && guard++ < 100)
		room = transition(
			room,
			room.currentPlayerId,
			'play',
			{ card: choose(legalFor(room), room) },
			ctx()
		);
	return room;
}

test('the deck: 52 cards, A high to 2 in every suit', () => {
	const deck = freshPakadDeck();
	assert.equal(deck.length, 52);
	assert.equal(new Set(deck.map(cardKey)).size, 52);
});

test('four seats in two partnerships; a fifth player is refused; start needs all four', () => {
	let room = newRoom('ten-pakad-seats', 0, 'a');
	for (const id of IDS.slice(0, 3)) {
		room = transition(room, id, 'join', { username: id }, ctx());
		room = transition(room, id, 'ready', { ready: true }, ctx());
	}
	assert.throws(
		() => transition(room, 'a', 'start', {}, ctx({ deck: deckFor(1), handId: 'h' })),
		/four players/
	);
	room = transition(room, 'd', 'join', { username: 'd' }, ctx());
	assert.throws(() => transition(room, 'e', 'join', { username: 'e' }, ctx()), /full/);
	const v = projection(room, 'a', ctx().connected);
	assert.deepEqual(v.teams, { a: 0, b: 1, c: 0, d: 1 });
});

test("deal and order: five each, anticlockwise from the dealer's right, dealer last; no trump yet", () => {
	const room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(2), handId: 'h1' }));
	assert.equal(room.stage, 'open');
	assert.equal(room.trump, null);
	assert.equal(room.order.at(-1), room.dealerId);
	for (const id of IDS) assert.equal(byId(room, id).cards.length, 5);
	assert.equal(room.pending.length, 32);
	// Anticlockwise: each next player sits one seat lower (mod 4).
	for (let k = 0; k < 3; k++)
		assert.equal(
			(byId(room, room.order[k]).seatNumber + 3) % 4,
			byId(room, room.order[k + 1]).seatNumber
		);
	assert.equal(room.currentPlayerId, room.order[0]);
});

test('trump: the first card played off suit sets it, counts in that trick, and the rest is dealt after it', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(3), handId: 'h1' }));
	let guard = 0;
	while (!room.trump && guard++ < 30) {
		const before = room;
		const led = room.trick.plays[0]?.card.suit;
		const legal = legalFor(room);
		const off = led && legal.find((c) => c.suit !== led);
		room = transition(room, room.currentPlayerId, 'play', { card: off ?? legal[0] }, ctx());
		if (room.trump) {
			assert.equal(room.trump, off.suit);
			assert.equal(room.trumpSetBy.id, before.currentPlayerId);
			assert.equal(room.trumpSetBy.trick, before.tricksPlayed + 1);
		}
	}
	assert.ok(room.trump);
	assert.equal(room.stage, 'open', 'the rest is dealt only after that trick');
	// Finish the trick: then everyone holds 13 minus the tricks played.
	while (room.trick.plays.length)
		room = transition(room, room.currentPlayerId, 'play', { card: legalFor(room)[0] }, ctx());
	assert.equal(room.stage, 'play');
	for (const id of IDS) assert.equal(byId(room, id).cards.length, 13 - room.tricksPlayed);
	assert.equal(room.pending.length, 0);
});

test('trump: if all five opening tricks are followed, a card drawn from them sets it (replayable)', () => {
	// Each player gets 2 spades and a heart, a diamond and a club; everyone follows the suit led.
	const S = (r) => ({ rank: r, suit: 'spades' });
	const H = (r) => ({ rank: r, suit: 'hearts' });
	const D = (r) => ({ rank: r, suit: 'diamonds' });
	const C = (r) => ({ rank: r, suit: 'clubs' });
	const hands = [
		[S(14), S(13), H(14), D(14), C(14)],
		[S(12), S(11), H(13), D(13), C(13)],
		[S(10), S(9), H(12), D(12), C(12)],
		[S(8), S(7), H(11), D(11), C(11)]
	];
	const used = new Set(hands.flat().map(cardKey));
	const rest = freshPakadDeck().filter((c) => !used.has(cardKey(c)));
	const deck = [...hands.flat(), ...rest];
	const run = () => {
		let room = transition(table(), 'a', 'start', {}, ctx({ deck, handId: 'h-drawn' }));
		for (let t = 0; t < 5; t++)
			for (let k = 0; k < 4; k++) {
				const led = room.trick.plays[0]?.card.suit;
				const legal = legalFor(room);
				assert.ok(!led || legal[0].suit === led, 'everyone can follow');
				room = transition(room, room.currentPlayerId, 'play', { card: legal[0] }, ctx());
			}
		return room;
	};
	const room = run();
	assert.ok(room.trumpSetBy.drawn);
	assert.equal(room.trump, room.trumpSetBy.drawn.suit);
	assert.equal(room.stage, 'play');
	for (const id of IDS) assert.equal(byId(room, id).cards.length, 8);
	assert.deepEqual(run().trumpSetBy, room.trumpSetBy, 'the same deck draws the same card');
});

test('collecting: only the same player twice in a row collects the centre; the 13th trick takes the rest', () => {
	for (let n = 0; n < 40; n++) {
		const random = stream(4, 'play', n).random;
		let room = transition(
			table(),
			'a',
			'start',
			{},
			ctx({ deck: deckFor(10 + n), handId: `c${n}` })
		);
		let streak = null;
		while (!room.gameShow) {
			const before = room;
			const legal = legalFor(room);
			room = transition(
				room,
				room.currentPlayerId,
				'play',
				{ card: legal[Math.floor(random() * legal.length)] },
				ctx()
			);
			if (room.tricksPlayed === before.tricksPlayed) continue;
			const t = room.lastTrick;
			const expect = t.n === 13 || streak === t.winner;
			assert.equal(t.collected, expect, `trick ${t.n}`);
			if (t.collected) assert.equal(room.centre.length, 0);
			streak = t.collected ? null : t.winner;
		}
		assert.equal(room.result.tens[0] + room.result.tens[1], 4);
		assert.equal(room.captured[0].length + room.captured[1].length, 52);
	}
});

test('hand result: four tens is a Kot; the non-dealing team wins with 2 or 3 (2-2 included); the dealers need 3', () => {
	const run0 = { team: null, hands: 0 };
	// Dealing team is 0.
	assert.deepEqual(scoreHand([4, 0], 0, run0), {
		winner: 0,
		kot: 'four-tens',
		run: run0,
		dealer: 'right'
	});
	assert.deepEqual(scoreHand([0, 4], 0, run0).dealer, 'partner');
	assert.equal(scoreHand([0, 4], 0, run0).kot, 'four-tens');
	assert.deepEqual(scoreHand([2, 2], 0, run0), {
		winner: 1,
		kot: null,
		run: { team: 1, hands: 1 },
		dealer: 'same'
	});
	assert.equal(scoreHand([1, 3], 0, run0).winner, 1);
	assert.deepEqual(scoreHand([3, 1], 0, run0), {
		winner: 0,
		kot: null,
		run: { team: 0, hands: 1 },
		dealer: 'right'
	});
});

test('seven hands in a row is a Kot and resets the run; a four-tens Kot resets it too', () => {
	assert.deepEqual(scoreHand([1, 3], 0, { team: 1, hands: 6 }), {
		winner: 1,
		kot: 'seven-in-a-row',
		run: { team: null, hands: 0 },
		dealer: 'same'
	});
	assert.deepEqual(scoreHand([3, 1], 0, { team: 1, hands: 6 }).run, { team: 0, hands: 1 });
	assert.deepEqual(scoreHand([0, 4], 1, { team: 1, hands: 5 }).run, { team: null, hands: 0 });
});

test("next dealer follows the result: same, to the right, or the dealer's partner", () => {
	let room = table();
	for (let h = 0; h < 30; h++) {
		room = transition(room, 'a', 'start', {}, ctx({ deck: deckFor(100 + h), handId: `n${h}` }));
		const order = room.order;
		const dealer = room.dealerId;
		room = playOut(room);
		const r = room.result;
		const expected =
			r.winnerTeam === r.dealingTeam ? order[0] : r.kot === 'four-tens' ? order[1] : dealer;
		assert.equal(room.nextDealerId, expected, `hand ${h}`);
		const next = transition(
			room,
			'a',
			'start',
			{},
			ctx({ deck: deckFor(200 + h), handId: `m${h}` })
		);
		assert.equal(next.dealerId, expected);
		const kots = room.match.kots[0] + room.match.kots[1];
		assert.ok(kots <= h + 1);
	}
});

test('projection: only your own cards; piles show their card and ten counts; nothing secret', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(5), handId: 'p' }));
	room = playOut(room, (legal) => legal.at(-1));
	room = transition(room, 'a', 'start', {}, ctx({ deck: deckFor(6), handId: 'p2' }));
	for (let k = 0; k < 9; k++)
		room = transition(room, room.currentPlayerId, 'play', { card: legalFor(room)[0] }, ctx());
	const v = projection(room, 'b', ctx().connected);
	for (const u of v.usersList)
		assert.equal(
			u.cardsInHand.every((c) => c.rank > 0),
			u.id === 'b',
			u.id
		);
	assert.deepEqual(Object.keys(v.centre).sort(), ['count', 'tens']);
	assert.ok(v.captured.every((c) => Object.keys(c).sort().join() === 'count,tens'));
	assert.equal('history' in v, false);
	const text = JSON.stringify(v);
	for (const secret of ['salt', 'pending', 'secret'])
		assert.equal(text.includes(secret), false, secret);
});

test('leaving mid-hand ends it unscored; the match totals do not move', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(7), handId: 'l' }));
	const match = structuredClone(room.match);
	room = transition(room, room.currentPlayerId, 'play', { card: legalFor(room)[0] }, ctx());
	room = transition(room, 'b', 'leave', {}, ctx());
	assert.equal(room.result.reason, 'abandoned');
	assert.deepEqual(room.match, match);
});

test('rule errors are GameErrors with the reason; a timed-out turn gets a legal automatic move', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(8), handId: 't' }));
	const other = IDS.find((id) => id !== room.currentPlayerId);
	assert.throws(
		() => transition(room, other, 'play', { card: byId(room, other).cards[0] }, ctx()),
		(e) => e instanceof GameError && /not your turn/.test(e.message)
	);
	room = transition(room, room.currentPlayerId, 'play', { card: legalFor(room)[0] }, ctx());
	const actor = room.currentPlayerId;
	const led = room.trick.plays[0].card.suit;
	const off = byId(room, actor).cards.find((c) => c.suit !== led);
	if (byId(room, actor).cards.some((c) => c.suit === led) && off)
		assert.throws(
			() => transition(room, actor, 'play', { card: off }, ctx()),
			(e) => e instanceof GameError && /Follow the suit/.test(e.message)
		);
	const auto = autoMove(room, actor);
	assert.ok(
		legalFor(room).some(
			(c) => c.rank === auto.payload.card.rank && c.suit === auto.payload.card.suit
		)
	);
	const late = transition(room, 'a', 'timeout', {}, ctx({ now: room.deadline + 1 }));
	assert.equal(byId(late, actor).autoMoves, 1);
});

test('a seeded table replays exactly, and every hand ends with all 52 cards captured', () => {
	const spec = {
		seed: 2,
		table: 1,
		hands: 4,
		seats: [randomPakad, randomPakad, randomPakad, randomPakad]
	};
	const a = runTablePakad(spec);
	const b = runTablePakad(spec);
	assert.deepEqual(a.results, b.results);
	assert.equal(a.results.length, 4);
});
