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
	playing
} from '../../server/engine.mjs';

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
		{ cutAt: 0, cardsToDeal: 3, rulesVersion },
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

test('no pick in a minute keeps the game; a chooser who leaves forfeits the pick', () => {
	let room = finish(deal(table()));
	assert.deepEqual(nextHandChoice(room, ctx.now + CHOOSE_MS), {
		mode: 'selected',
		rulesVersion: 'classic-1'
	});
	room = transition(room, 'a', 'leave', {}, ctx);
	assert.deepEqual(nextHandChoice(room, ctx.now), { mode: 'selected', rulesVersion: 'classic-1' });
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
