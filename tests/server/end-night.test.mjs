import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, playing } from '../../server/engine.mjs';
import { nightEmail, nightLength } from '../../server/club/nights.mjs';

/** Club owners end a table: after the hand or at once with bets refunded; everyone gets a summary. */

const connected = new Set(['a', 'b', 'c']);
const ctx = { now: 1000, turnMs: 90000, connected };
const owner = { ...ctx, canEnd: true };
function table() {
	let room = newRoom('end-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ['a', 'b', 'c']) room = transition(room, id, 'join', { username: id }, ctx);
	return room;
}
const deal = (room) =>
	transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: 3, rulesVersion: 'classic-1' },
		{ ...ctx, deck: freshDeck(), handId: `h${room.revision}`, requireReady: true }
	);
const finishHand = (room) => {
	while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	return room;
};

test('only club owners can end a table', () => {
	const room = table();
	assert.throws(() => transition(room, 'b', 'endNight', { mode: 'now' }, ctx), /Only club owners/);
	assert.throws(
		() => transition(room, 'a', 'endNight', { mode: 'soon' }, owner),
		/after this hand/
	);
});

test('between hands, the table ends at once with the night’s summary; then only leaving works', () => {
	let room = finishHand(deal(table()));
	room = transition(room, 'a', 'endNight', { mode: 'after-hand' }, owner);
	const ended = projection(room, 'b', connected).ended;
	assert.equal(ended.hands, 1);
	assert.deepEqual(ended.games, { 'classic-1': 1 });
	assert.equal(
		ended.realNet.reduce((sum, p) => sum + p.net, 0),
		0
	);
	assert.ok(Array.isArray(ended.settleUp));
	assert.equal(room.chooser, undefined, 'no next game is picked');
	assert.throws(() => deal(room), /ended for the night/);
	assert.throws(() => transition(room, 'b', 'ready', { ready: true }, ctx), /ended for the night/);
	transition(room, 'b', 'leave', {}, ctx);
});

test('“after this hand” lets the hand finish, then ends; no new hand can start meanwhile', () => {
	let room = deal(table());
	room = transition(room, 'a', 'endNight', { mode: 'after-hand' }, owner);
	assert.ok(playing(room));
	assert.equal(projection(room, 'b', connected).ending, true);
	room = finishHand(room);
	assert.ok(room.ended, 'the table ended when the hand did');
	assert.equal(room.ended.hands, 1);
});

test('“now” stops the hand and gives everyone back exactly what they put in', () => {
	let room = finishHand(deal(table()));
	const before = Object.fromEntries(room.players.map((p) => [p.id, p.balance]));
	room = deal(room);
	room = transition(room, room.currentPlayerId, 'bet', { amount: 20 }, ctx);
	room = transition(room, 'a', 'endNight', { mode: 'now' }, owner);
	assert.equal(room.pot, 0);
	assert.ok(!playing(room));
	for (const p of room.players) assert.equal(p.balance, before[p.id], `${p.id} refunded`);
	assert.ok(room.ended);
});

test('the thank-you email tells each person their result and who they settle with', () => {
	const night = {
		at: 3 * 60 * 60 * 1000 + 12 * 60 * 1000,
		startedAt: 0,
		hands: 47,
		games: { 'muflis-1': 9, 'classic-1': 4 },
		biggest: { amount: 1280, winner: 'atishay', rulesVersion: 'chatai-1' },
		realNet: [
			{ id: 'aditya', name: 'aditya', net: -300 },
			{ id: 'divyansh', name: 'divyansh', net: 300 }
		],
		settleUp: [
			{ from: 'aditya', fromName: 'aditya', to: 'divyansh', toName: 'divyansh', amount: 300 }
		]
	};
	const gameName = (v) => ({ 'muflis-1': 'Muflis', 'classic-1': 'Classic' })[v] ?? v;
	assert.equal(nightLength(night.startedAt, night.at), '3h 12m');
	const loser = nightEmail({ playerId: 'aditya', name: 'aditya kumar', night, gameName });
	assert.equal(loser.subject, 'Thanks for tonight, Aditya ♠');
	assert.match(loser.text, /You pay Divyansh ₹300/);
	assert.match(loser.text, /most played: Muflis/);
	assert.match(loser.text, /biggest pot: ₹1,280 to Atishay/);
	const winner = nightEmail({ playerId: 'divyansh', name: 'divyansh', night, gameName });
	assert.match(winner.text, /Aditya pays you ₹300/);
	assert.match(winner.text, /finished \+₹300/);
	assert.ok(!/—/.test(loser.text + loser.html), 'no em dashes');
	const sneaky = nightEmail({ playerId: 'x', name: '<script>alert(1)</script>', night, gameName });
	assert.ok(!sneaky.html.includes('<script>'), 'names are escaped');
});
