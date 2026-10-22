import test from 'node:test';
import assert from 'node:assert/strict';
import {
	fresh29Deck,
	newRoom,
	transition,
	projection,
	autoMove,
	scoreHand,
	pointsOf,
	STRENGTH
} from '../../server/tricks/twenty-nine.mjs';
import { cardKey, trickWinner } from '../../server/tricks/cards.mjs';
import { GameError } from '../../server/engine.mjs';
import { runTable29, random29 } from '../../server/sim/tricks/table-29.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';

/* 29, Chaal V1 (docs/archive/games/29_RULES.md, locked 2026-10-22). */

const IDS = ['a', 'b', 'c', 'd'];
const C = new Set(IDS);
const ctx = (extra = {}) => ({ now: 1000, turnMs: 60000, connected: C, ...extra });
const deckFor = (n) => shuffle(fresh29Deck(), stream(9, 'deck29', n).random);
const byId = (room, id) => room.players.find((p) => p.id === id);
const legal = (room) => projection(room, room.currentPlayerId, C).legalActions;
function table() {
	let room = newRoom('twenty-nine-test', 0, 'a');
	for (const id of IDS) {
		room = transition(room, id, 'join', { username: id }, ctx());
		room = transition(room, id, 'ready', { ready: true }, ctx());
	}
	return room;
}
const act = (room, action, payload = {}) =>
	transition(room, room.currentPlayerId, action, payload, ctx());
/** Auction where the first player bids `value` and everyone else passes; then trump from its first card. */
function auction(room, value = 16) {
	room = act(room, 'bid', { value });
	for (let k = 0; k < 3; k++) room = act(room, 'pass');
	return room;
}
function playOut(room, random = stream(3, 'p', 0).random) {
	let guard = 0;
	while (!room.gameShow && guard++ < 200) {
		const l = legal(room);
		if (l.reveal) room = act(room, 'reveal');
		else if (l.pair) room = act(room, 'pair');
		else room = act(room, 'play', { card: l.play[Math.floor(random() * l.play.length)] });
	}
	return room;
}

test('the deck: 32 cards, 7 to A; J 9 A 10 K Q 8 7 rank; J 3, 9 2, A 1, 10 1 point (28)', () => {
	const deck = fresh29Deck();
	assert.equal(deck.length, 32);
	assert.equal(new Set(deck.map(cardKey)).size, 32);
	assert.equal(pointsOf(deck), 28);
	const order = [11, 9, 14, 10, 13, 12, 8, 7];
	for (let i = 1; i < order.length; i++) assert.ok(STRENGTH[order[i - 1]] > STRENGTH[order[i]]);
	const plays = (cards) => cards.map((card, i) => ({ id: i, card }));
	const s = (c) => STRENGTH[c.rank];
	assert.equal(
		trickWinner(
			plays([
				{ rank: 14, suit: 'hearts' },
				{ rank: 9, suit: 'hearts' },
				{ rank: 11, suit: 'spades' }
			]),
			null,
			s
		),
		1
	);
});

test("deal and auction: four each, clockwise from the dealer's left; bid higher or pass; three passes end it", () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(1), handId: 'h1' }));
	assert.equal(room.stage, 'bid');
	for (const id of IDS) assert.equal(byId(room, id).cards.length, 4);
	assert.equal(room.order.at(-1), room.dealerId);
	for (let k = 0; k < 3; k++)
		assert.equal(
			(byId(room, room.order[k]).seatNumber + 1) % 4,
			byId(room, room.order[k + 1]).seatNumber
		);
	assert.equal(room.currentPlayerId, room.order[0]);
	assert.deepEqual(legal(room).bid[0], 15);
	room = act(room, 'bid', { value: 17 });
	assert.throws(() => act(room, 'bid', { value: 17 }), /Bid from 18/);
	room = act(room, 'bid', { value: 19 });
	room = act(room, 'pass');
	room = act(room, 'pass');
	assert.equal(room.stage, 'bid', 'two passes in a row do not end it');
	room = act(room, 'pass');
	assert.equal(room.stage, 'trump');
	assert.equal(room.bidderId, room.order[1]);
	assert.equal(room.bid, 19);
	assert.equal(room.currentPlayerId, room.bidderId);
});

test('if the first three pass, the dealer bids 15', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(2), handId: 'h2' }));
	for (let k = 0; k < 3; k++) room = act(room, 'pass');
	assert.equal(room.stage, 'trump');
	assert.equal(room.bidderId, room.dealerId);
	assert.equal(room.bid, 15);
	assert.ok(room.bids.at(-1).forced);
});

test('trump is secret: the bidder sets a card face down; only the bidder sees it; eight cards each', () => {
	let room = auction(
		transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(3), handId: 'h3' }))
	);
	const bidder = room.bidderId;
	const card = byId(room, bidder).cards[0];
	room = act(room, 'chooseTrump', { card });
	assert.equal(room.stage, 'play');
	assert.equal(room.trump, card.suit);
	assert.equal(byId(room, bidder).cards.length, 7);
	for (const id of IDS.filter((x) => x !== bidder)) assert.equal(byId(room, id).cards.length, 8);
	for (const id of IDS) {
		const v = projection(room, id, C);
		assert.equal(v.trump, id === bidder ? card.suit : null, id);
		assert.deepEqual(v.indicator, id === bidder ? card : null);
		assert.equal(v.indicatorDown, true);
		assert.equal(JSON.stringify(v).includes('salt'), false);
	}
});

test('reveal: a player who cannot follow must ask first; trump then counts in that trick; the card returns to the bidder', () => {
	for (let n = 0; n < 40; n++) {
		let room = auction(
			transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(10 + n), handId: `r${n}` }))
		);
		room = act(room, 'chooseTrump', { card: byId(room, room.bidderId).cards[0] });
		const random = stream(4, 'r', n).random;
		let guard = 0;
		while (!room.revealed && !room.gameShow && guard++ < 50) {
			const l = legal(room);
			if (l.reveal) {
				assert.deepEqual(l.play, [], 'no play before asking');
				assert.throws(
					() => act(room, 'play', { card: byId(room, room.currentPlayerId).cards[0] }),
					/ask for trump/
				);
				const asker = room.currentPlayerId;
				const bidderBefore = byId(room, room.bidderId).cards.length;
				room = act(room, 'reveal');
				assert.equal(room.revealedAt.by, asker);
				assert.equal(byId(room, room.bidderId).cards.length, bidderBefore + 1);
				assert.equal(room.indicator, null);
				for (const id of IDS) assert.equal(projection(room, id, C).trump, room.trump);
				// Finish the trick: the winner is decided with trump.
				while (room.trick.plays.length) room = act(room, 'play', { card: legal(room).play[0] });
				const t = room.lastTrick;
				const s = (c) => STRENGTH[c.rank];
				assert.equal(t.winner, t.plays[trickWinner(t.plays, room.trump, s)].id);
				break;
			}
			room = act(room, 'play', { card: l.play[Math.floor(random() * l.play.length)] });
		}
	}
});

test('a full hand: 8 tricks, 28 points, the bidding side gains or loses one game point', () => {
	let room = table();
	for (let h = 0; h < 30; h++) {
		room = auction(
			transition(room, 'a', 'start', {}, ctx({ deck: deckFor(100 + h), handId: `f${h}` }))
		);
		room = act(room, 'chooseTrump', { card: byId(room, room.bidderId).cards[0] });
		const before = room.match.gamePoints.slice();
		const dealer = room.dealerId;
		const left = room.order[0];
		room = playOut(room, stream(5, 'f', h).random);
		const r = room.result;
		if (r.reason === 'annulled') {
			assert.deepEqual(room.match.gamePoints, before);
			continue;
		}
		assert.equal(r.points[0] + r.points[1], 28);
		assert.equal(r.made, r.points[r.bidTeam] >= r.target);
		if (r.gameOver === null) {
			const d = room.match.gamePoints[r.bidTeam] - before[r.bidTeam];
			assert.equal(d, r.made ? 1 : -1);
		}
		assert.equal(room.nextDealerId, left, 'the deal passes to the left');
		void dealer;
	}
});

test('scoring: +1 or -1 to the bidding side; a game ends at +6 or -6; no reveal annuls the hand', () => {
	assert.deepEqual(
		scoreHand({ revealed: true, points: [16, 12], bidTeam: 0, target: 16 }, [0, 0]),
		{
			annulled: false,
			made: true,
			gamePoints: [1, 0],
			gameOver: null
		}
	);
	assert.equal(
		scoreHand({ revealed: true, points: [15, 13], bidTeam: 0, target: 16 }, [0, 0]).gamePoints[0],
		-1
	);
	assert.equal(
		scoreHand({ revealed: true, points: [20, 8], bidTeam: 0, target: 16 }, [5, 0]).gameOver,
		0
	);
	assert.equal(
		scoreHand({ revealed: true, points: [8, 20], bidTeam: 0, target: 16 }, [-5, 0]).gameOver,
		1
	);
	assert.equal(
		scoreHand({ revealed: false, points: [20, 8], bidTeam: 0, target: 16 }, [3, 1]).annulled,
		true
	);
});

test("the Pair: K and Q of trump, after one's side wins a trick with trump known; target moves by 4 within 15 to 28", () => {
	let found = 0;
	for (let n = 0; n < 400 && found < 6; n++) {
		let room = auction(
			transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(500 + n), handId: `p${n}` })),
			20
		);
		room = act(room, 'chooseTrump', { card: byId(room, room.bidderId).cards[0] });
		const random = stream(6, 'p', n).random;
		let guard = 0;
		while (!room.gameShow && guard++ < 200) {
			const l = legal(room);
			if (l.pair) {
				const id = room.currentPlayerId;
				const hand = byId(room, id).cards;
				assert.ok([13, 12].every((r) => hand.some((c) => c.rank === r && c.suit === room.trump)));
				const ours =
					room.players.find((p) => p.id === id).seatNumber % 2 ===
					byId(room, room.bidderId).seatNumber % 2;
				const before = room.target;
				room = act(room, 'pair');
				assert.equal(room.target, ours ? Math.max(15, before - 4) : Math.min(28, before + 4));
				assert.equal(legal(room).pair, false, 'only once');
				found++;
				break;
			}
			if (l.reveal) room = act(room, 'reveal');
			else room = act(room, 'play', { card: l.play[Math.floor(random() * l.play.length)] });
		}
	}
	assert.ok(found >= 3, `found ${found}`);
});

test('rule errors are GameErrors; leaving ends the hand unscored; timeouts get a legal automatic move', () => {
	let room = transition(table(), 'a', 'start', {}, ctx({ deck: deckFor(7), handId: 't' }));
	const other = IDS.find((id) => id !== room.currentPlayerId);
	assert.throws(
		() => transition(room, other, 'pass', {}, ctx()),
		(e) => e instanceof GameError && /not your turn/.test(e.message)
	);
	assert.deepEqual(autoMove(room, room.currentPlayerId), { action: 'pass', payload: {} });
	const late = transition(room, 'a', 'timeout', {}, ctx({ now: room.deadline + 1 }));
	assert.equal(late.bids.length, 1);
	room = auction(room);
	const auto = autoMove(room, room.bidderId);
	assert.equal(auto.action, 'chooseTrump');
	room = act(room, 'chooseTrump', auto.payload);
	const match = structuredClone(room.match);
	room = transition(room, 'b', 'leave', {}, ctx());
	assert.equal(room.result.reason, 'abandoned');
	assert.deepEqual(room.match, match);
});

test('a seeded table replays exactly', () => {
	const spec = { seed: 2, table: 1, hands: 4, seats: [random29, random29, random29, random29] };
	assert.deepEqual(runTable29(spec).results, runTable29(spec).results);
});
