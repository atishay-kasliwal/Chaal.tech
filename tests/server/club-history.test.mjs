import test from 'node:test';
import assert from 'node:assert/strict';
import { trackClubHand, historySince } from '../../server/club/history.mjs';

const players = [
	{ id: 'a', username: 'A', cards: [{ rank: 1 }], balance: 90 },
	{ id: 'b', username: 'B', cards: [{ rank: 2 }], balance: 90 }
];
const start = { name: 'room', handId: 'hand', players };
const movement = (kind, a, b) => ({
	kind,
	entries: [
		{ account: 'a', delta: a },
		{ account: 'b', delta: b }
	]
});

test('net record excludes chip gifts, records both players and settles only once', () => {
	const initial = trackClubHand(null, { players: [] }, start, movement('start', -10, -10), 100);
	const gifted = trackClubHand(
		initial.progress,
		start,
		start,
		movement('answerChipRequest', -50, 50),
		200
	);
	const finished = {
		...start,
		result: { handId: 'hand', winnerId: 'b', winnerName: 'B', amount: 20 }
	};
	const result = trackClubHand(gifted.progress, start, finished, movement('play', 0, 20), 300);
	assert.deepEqual(
		result.completed.players.map(({ net, won }) => ({ net, won })),
		[
			{ net: -10, won: false },
			{ net: 10, won: true }
		]
	);
	assert.equal(result.completed._id, 'room:hand');
	assert.equal(result.completed.practice, false);
	assert.equal(result.progress, null);
	assert.equal(trackClubHand(null, finished, finished, null, 400).completed, null);
	assert.equal('cards' in result.completed.players[0], false);
});

test('split pots, blackjack pushes and practice results have distinct outcomes', () => {
	const initial = trackClubHand(null, {}, start, movement('start', -10, -10), 100);
	const split = {
		...start,
		result: { handId: 'hand', winners: [{ id: 'a' }, { id: 'b' }], winnerName: 'A & B', amount: 20 }
	};
	assert.deepEqual(
		trackClubHand(
			initial.progress,
			start,
			split,
			movement('show', 10, 10),
			200
		).completed.players.map((p) => [p.net, p.won]),
		[
			[0, true],
			[0, true]
		]
	);
	const blackjack = {
		...start,
		gameType: 'blackjack',
		result: {
			handId: 'hand',
			winnerName: 'A',
			amount: 10,
			payouts: [
				{ playerId: 'a', bet: 10, payout: 20 },
				{ playerId: 'b', bet: 10, payout: 10 }
			]
		}
	};
	assert.deepEqual(
		trackClubHand(
			initial.progress,
			start,
			blackjack,
			movement('blackjackAction', 20, 10),
			200
		).completed.players.map((p) => [p.net, p.won]),
		[
			[10, true],
			[0, false]
		]
	);
	const practice = trackClubHand(
		null,
		{},
		{ ...start, players: [players[0], { ...players[1], bot: { level: 'easy' } }] },
		null,
		100
	);
	assert.equal(practice.progress.practice, true);
});

test('an active hand from before rollout is not recorded with incomplete chip totals', () => {
	const finished = { ...start, result: { handId: 'hand', winnerId: 'a' } };
	assert.equal(trackClubHand(null, start, finished, movement('play', 20, 0), 300).completed, null);
});

test('calendar filters use India midnight and month boundaries', () => {
	const now = Date.parse('2026-10-31T20:00:00Z');
	assert.equal(historySince('all', now), 0);
	assert.equal(historySince('today', now), Date.parse('2026-10-31T18:30:00Z'));
	assert.equal(historySince('month', now), Date.parse('2026-10-31T18:30:00Z'));
});
