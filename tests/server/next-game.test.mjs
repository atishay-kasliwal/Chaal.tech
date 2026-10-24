import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import {
	newRoom,
	transition,
	projection,
	nextHandChoice,
	nextInLineup,
	CHOOSE_MS,
	SOLO_CHOOSE_MS,
	HANDOVER_CHOOSE_MS,
	playing
} from '../../server/engine.mjs';
import { listVariants, getVariant } from '../../server/variants/index.mjs';

const ids = ['a', 'b', 'c'];
const connected = new Set([...ids, 'bot-0001']);
const ctx = { now: 1000, turnMs: 60000, connected };

function table() {
	let room = newRoom('pick-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
	return transition(room, 'a', 'addBot', { botId: 'bot-0001', name: 'Bunty', level: 'easy' }, ctx);
}
const deal = (room, rulesVersion = room.rulesVersion) =>
	transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: getVariant(rulesVersion).cardsPerPlayer ?? 3, rulesVersion },
		{ ...ctx, deck: freshDeck(), handId: `h${room.revision}`, requireReady: true }
	);
const finish = (room) => {
	while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	return room;
};

test('after each hand the next person in seat order picks the next game; bots never pick', () => {
	let room = finish(deal(table()));
	assert.equal(room.chooser.playerId, 'a');
	assert.equal(room.chooser.deadline, ctx.now + CHOOSE_MS);
	assert.equal(
		projection(room, 'c', connected).chooser.playerId,
		'a',
		'everyone sees who is picking'
	);

	assert.throws(() => transition(room, 'b', 'chooseNext', { choice: 'random' }, ctx), /a’s turn/);
	assert.throws(() => nextHandChoice(room, ctx.now), /a is picking/);
});

test('the pick decides the next game, and the turn passes on', () => {
	let room = finish(deal(table()));
	room = transition(room, 'a', 'chooseNext', { choice: 'muflis-1' }, ctx);
	assert.deepEqual(nextHandChoice(room, ctx.now), { mode: 'selected', rulesVersion: 'muflis-1' });
	room = finish(deal(room, 'muflis-1'));
	assert.equal(room.rulesVersion, 'muflis-1');
	assert.equal(room.chooser.playerId, 'b');
	room = transition(room, 'b', 'chooseNext', { choice: 'random' }, ctx);
	assert.deepEqual(nextHandChoice(room, ctx.now), { mode: 'random' });
	room = finish(deal(room));
	assert.equal(room.chooser.playerId, 'c');
	room = finish(deal(transition(room, 'c', 'chooseNext', { choice: 'keep' }, ctx)));
	assert.equal(room.chooser.playerId, 'a', 'round robin wraps around, skipping the bot');
	assert.throws(() => transition(room, 'a', 'chooseNext', { choice: 'poker' }, ctx), /variant/);
});

test('no pick in a minute falls back to Random; a chooser who leaves forfeits the pick', () => {
	let room = finish(deal(table()));
	assert.deepEqual(nextHandChoice(room, ctx.now + CHOOSE_MS), { mode: 'random' });
	room = transition(room, 'a', 'leave', {}, ctx);
	assert.deepEqual(nextHandChoice(room, ctx.now), { mode: 'random' });
});

// Settling the next game ahead of the deal, so everyone sees it and its rules.
const seq = (values) => {
	let i = 0;
	return (n) => values[i++ % values.length] % n;
};
const pickCtx = (extra = {}) => ({ ...ctx, randomInt: seq([0]), lineup: [], ...extra });

test('a pick settles the next game at once, with 15 seconds to read a new game', () => {
	let room = finish(deal(table()));
	assert.equal(room.upNext, undefined);
	room = transition(room, 'a', 'chooseNext', { choice: 'muflis-1' }, pickCtx());
	assert.deepEqual(room.upNext, {
		rulesVersion: 'muflis-1',
		mode: 'picked',
		by: 'a',
		changed: true,
		revealMs: 15000,
		dealAt: ctx.now + 15000
	});
	assert.deepEqual(projection(room, 'b', connected).upNext.rulesVersion, 'muflis-1');
	// The same game again: no rules card, a short pause.
	room = transition(
		finish(deal(room, 'muflis-1')),
		'b',
		'chooseNext',
		{ choice: 'keep' },
		pickCtx()
	);
	assert.equal(room.upNext.changed, false);
	assert.equal(room.upNext.revealMs, 0);
	// Dealing uses the settled game up.
	assert.equal(deal(room, 'muflis-1').upNext, undefined);
});

test('a pick window that runs out settles Random, and never the game just played', () => {
	let room = finish(deal(table()));
	assert.throws(() => transition(room, 'b', 'settleNext', {}, pickCtx()), /still open/);
	room = transition(room, 'b', 'settleNext', {}, pickCtx({ now: ctx.now + CHOOSE_MS }));
	assert.equal(room.upNext.mode, 'random');
	assert.notEqual(room.upNext.rulesVersion, 'classic-1');
	assert.throws(() =>
		transition(room, 'b', 'settleNext', {}, pickCtx({ now: ctx.now + CHOOSE_MS }))
	);
});

test('Random plays every game in the pool once before any repeats', () => {
	const lineup = ['classic-1', 'muflis-1', 'ak47-1', 'joker-1'];
	let room = finish(deal(table()));
	room = transition(
		room,
		'a',
		'chooseNext',
		{ choice: 'random' },
		pickCtx({ lineup, randomInt: seq([3, 1, 2, 0, 1]) })
	);
	const played = [];
	for (let hand = 0; hand < 4; hand++) {
		const version = room.upNext.rulesVersion;
		played.push(version);
		room = finish(deal(room, version));
		// The standing Random settles straight away for whoever picks next.
		room = transition(
			room,
			room.chooser.playerId,
			'chooseNext',
			{ choice: 'random' },
			pickCtx({ lineup, randomInt: seq([3, 1, 2, 0, 1]) })
		);
	}
	assert.equal(new Set(played).size, 4, played.join());
	for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
});

test('alone with bots, a standing pick settles right after the hand with a short rules card', () => {
	let room = newRoom('solo-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'a', 'join', { username: 'a' }, ctx);
	room = transition(room, 'a', 'addBot', { botId: 'bot-0002', name: 'Bunty', level: 'easy' }, ctx);
	room = finish(deal(room));
	room = transition(room, 'a', 'chooseNext', { choice: 'random' }, pickCtx());
	assert.equal(room.upNext.revealMs, 5000);
	room = deal(room, room.upNext.rulesVersion);
	while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, pickCtx());
	assert.ok(room.upNext, 'settled without waiting');
	assert.equal(room.upNext.mode, 'random');
});

test('alone with bots, the pick window is shorter', () => {
	let room = newRoom('solo-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'a', 'join', { username: 'a' }, ctx);
	room = transition(room, 'a', 'addBot', { botId: 'bot-0002', name: 'Bunty', level: 'easy' }, ctx);
	room = finish(deal(room));
	assert.equal(room.chooser.playerId, 'a');
	assert.equal(room.chooser.deadline, ctx.now + SOLO_CHOOSE_MS);
});

test('a lineup sets what comes next, narrows random, and a timeout follows it', () => {
	const lineup = ['classic-1', 'muflis-1', 'ak47-1'];
	assert.equal(nextInLineup(lineup, 'classic-1'), 'muflis-1');
	assert.equal(nextInLineup(lineup, 'ak47-1'), 'classic-1');
	assert.equal(nextInLineup(lineup, 'joker-1'), 'classic-1');
	let room = finish(deal(table()));
	assert.deepEqual(nextHandChoice(room, ctx.now + CHOOSE_MS, lineup), {
		mode: 'selected',
		rulesVersion: 'muflis-1'
	});
	room = transition(room, 'a', 'chooseNext', { choice: 'random' }, ctx);
	assert.deepEqual(nextHandChoice(room, ctx.now, lineup), { mode: 'random', pool: lineup });
});

test('a pick stands for later hands until someone changes it', () => {
	let room = finish(deal(table()));
	room = transition(room, 'a', 'chooseNext', { choice: 'random' }, ctx);
	room = finish(deal(room));
	// b's turn: a short window to keep or change it; if b does nothing, Random carries on.
	assert.equal(room.chooser.playerId, 'b');
	assert.equal(room.chooser.deadline, ctx.now + HANDOVER_CHOOSE_MS);
	assert.throws(() => nextHandChoice(room, ctx.now), /b is picking/);
	assert.deepEqual(nextHandChoice(room, ctx.now + HANDOVER_CHOOSE_MS), { mode: 'random' });
	// b changes it during the countdown; that now stands.
	room = transition(room, 'b', 'chooseNext', { choice: 'keep' }, ctx);
	assert.deepEqual(room.standing, { choice: room.rulesVersion, by: 'b' });
	const kept = room.rulesVersion;
	room = finish(deal(room));
	// c's turn now; if c does nothing, b's pick carries on.
	assert.deepEqual(nextHandChoice(room, ctx.now + HANDOVER_CHOOSE_MS), {
		mode: 'selected',
		rulesVersion: kept
	});
});

test('the chooser can reopen the pick to change a standing game; others cannot', () => {
	let room = finish(deal(table()));
	room = transition(room, 'a', 'chooseNext', { choice: 'random' }, ctx);
	room = finish(deal(room));
	assert.throws(() => transition(room, 'c', 'openPick', {}, ctx), /not your turn/);
	room = transition(room, 'b', 'openPick', {}, ctx);
	assert.equal(room.chooser.deadline, ctx.now + CHOOSE_MS);
	assert.throws(() => nextHandChoice(room, ctx.now), /b is picking/);
});

test('alone with bots, a standing pick deals with no wait', () => {
	let room = newRoom('solo-stand', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'a', 'join', { username: 'a' }, ctx);
	room = transition(room, 'a', 'addBot', { botId: 'bot-0003', name: 'Bunty', level: 'easy' }, ctx);
	room = finish(deal(room));
	room = transition(room, 'a', 'chooseNext', { choice: 'random' }, ctx);
	room = finish(deal(room));
	assert.equal(room.chooser.deadline, ctx.now);
});

test('Random never brings back any of the last four games played', () => {
	const random = ((seed) => (n) => {
		seed = (seed * 1103515245 + 12345) % 2 ** 31;
		return seed % n;
	})(42);
	const threeCard = listVariants()
		.filter((variant) => (variant.cardsPerPlayer ?? 3) === 3)
		.map((variant) => variant.rulesVersion);
	for (const lineup of [
		threeCard,
		['classic-1', 'muflis-1', 'ak47-1', 'joker-1', '999-1', 'pot-blind-1']
	]) {
		let room = finish(deal(table()));
		const played = [room.rulesVersion];
		room = transition(
			room,
			'a',
			'chooseNext',
			{ choice: 'random' },
			pickCtx({ lineup, randomInt: random })
		);
		for (let hand = 0; hand < 60; hand++) {
			const version = room.upNext.rulesVersion;
			assert.ok(
				!played.slice(-4).includes(version),
				`${version} came back within four: ${played.slice(-4)}`
			);
			played.push(version);
			room = finish(deal(room, version));
			room = transition(
				room,
				room.chooser.playerId,
				'chooseNext',
				{ choice: 'random' },
				pickCtx({ lineup, randomInt: random })
			);
		}
	}
});

test('a lineup too small to rest four games gets the one played longest ago', () => {
	const lineup = ['classic-1', 'muflis-1', 'ak47-1'];
	let room = finish(deal(table()));
	room = transition(room, 'a', 'chooseNext', { choice: 'random' }, pickCtx({ lineup }));
	const played = [];
	for (let hand = 0; hand < 6; hand++) {
		played.push(room.upNext.rulesVersion);
		room = finish(deal(room, room.upNext.rulesVersion));
		room = transition(
			room,
			room.chooser.playerId,
			'chooseNext',
			{ choice: 'random' },
			pickCtx({ lineup })
		);
	}
	for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
	assert.equal(new Set(played).size, 3);
});

// Tonight's lineup: hands per game, Mystery slots, and looping.
const followLineup = (room, lineup, hands, randomInt = seq([0])) => {
	room = finish(deal(room, room.upNext?.rulesVersion ?? room.rulesVersion));
	// Nobody picks: the lineup decides.
	return transition(
		room,
		room.chooser.playerId,
		'settleNext',
		{},
		pickCtx({ now: room.chooser.deadline, lineup, lineupHands: hands, randomInt })
	);
};

test('a lineup plays each game for its hands, then moves on and loops', () => {
	const lineup = ['muflis-1', 'ak47-1'];
	let room = finish(deal(table()));
	room = transition(
		room,
		room.chooser.playerId,
		'settleNext',
		{},
		pickCtx({ now: room.chooser.deadline, lineup, lineupHands: 2 })
	);
	const order = [];
	for (let hand = 0; hand < 7; hand++) {
		order.push(room.upNext.rulesVersion);
		room = followLineup(room, lineup, 2);
	}
	assert.deepEqual(order, [
		'muflis-1',
		'muflis-1',
		'ak47-1',
		'ak47-1',
		'muflis-1',
		'muflis-1',
		'ak47-1'
	]);
	// The same game again needs no rules card; a new one does.
	assert.equal(projection(room, 'a', connected).lineupAt.played >= 1, true);
});

test('a Mystery slot draws a game the night is not playing', () => {
	const lineup = ['muflis-1', 'mystery', 'ak47-1'];
	let room = finish(deal(table()));
	room = transition(
		room,
		room.chooser.playerId,
		'settleNext',
		{},
		pickCtx({ now: room.chooser.deadline, lineup, lineupHands: 1 })
	);
	assert.equal(room.upNext.rulesVersion, 'muflis-1');
	room = followLineup(room, lineup, 1, seq([5, 2, 7]));
	const mystery = room.upNext.rulesVersion;
	assert.equal(room.upNext.lineupIndex, 1);
	assert.notEqual(mystery, 'muflis-1');
	room = followLineup(room, lineup, 1);
	assert.equal(room.upNext.rulesVersion, 'ak47-1');
});

test('one round per game: a hand for each player seated', () => {
	const lineup = ['muflis-1', 'ak47-1'];
	let room = finish(deal(table())); // a, b, c and a bot: four seats
	room = transition(
		room,
		room.chooser.playerId,
		'settleNext',
		{},
		pickCtx({ now: room.chooser.deadline, lineup, lineupHands: 0 })
	);
	const order = [];
	for (let hand = 0; hand < 5; hand++) {
		order.push(room.upNext.rulesVersion);
		room = followLineup(room, lineup, 0);
	}
	assert.deepEqual(order, ['muflis-1', 'muflis-1', 'muflis-1', 'muflis-1', 'ak47-1']);
});
