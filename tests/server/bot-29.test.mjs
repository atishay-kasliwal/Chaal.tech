import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { transition, projection, playing } from '../../server/engine.mjs';
import { createGameRoom } from '../../server/games/index.mjs';
import { fresh29Deck } from '../../server/tricks/twenty-nine.mjs';
import { botDue, nextBotMove, updateMinds } from '../../server/bots/runner.mjs';
import { bot29, decide29, observe29 } from '../../server/bots/tricks/bot-29.mjs';
import { observation29 } from '../../server/bots/tricks/observation-29.mjs';
import { runTable29, random29, greedy29 } from '../../server/sim/tricks/table-29.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';

/* 29 bots: the information boundary (including the hidden trump), the live runner path, strength. */

const ctx = (extra = {}) => ({ now: 1000, turnMs: 60000, connected: new Set(['host']), ...extra });
const deck = (n) => shuffle(fresh29Deck(), stream(13, 'd', n).random);
const ALL = new Set(['p0', 'p1', 'p2', 'p3']);
const GG = CANONICAL_STYLES.gg.tendencies.dna;

function liveTable() {
	let room = createGameRoom('twenty-nine', 'bot-table-29', 0, 'host');
	room = transition(room, 'host', 'join', { username: 'host' }, ctx());
	room = transition(room, 'host', 'ready', { ready: true }, ctx());
	for (const [botId, characterId] of [
		['bot-virat-n1', 'virat-kohli'],
		['bot-gg-n1', 'gg'],
		['bot-dhoni-n1', 'ms-dhoni']
	])
		room = transition(room, 'host', 'addBot', { botId, characterId }, ctx());
	return room;
}

test('bot modules read no engine or room code', () => {
	const dir = new URL('../../server/bots/tricks/', import.meta.url);
	for (const file of readdirSync(dir)) {
		const src = readFileSync(new URL(file, dir), 'utf8');
		assert.ok(
			!/from ['"][^'"]*(twenty-nine|ten-pakad|three-two-five|engine|room-object)\.mjs['"]/.test(
				src
			),
			`${file} imports engine code`
		);
	}
});

test('the observation knows trump only when the seat may: the bidder, or everyone after the reveal', () => {
	let room = liveTable();
	room = transition(room, 'host', 'start', {}, ctx({ deck: deck(1), handId: 'h1' }));
	const obs = observation29(projection(room, room.order[0], ctx().connected));
	assert.ok(Object.isFrozen(obs));
	assert.equal(obs.hand.length, 4);
	assert.equal(obs.trump, null);
	assert.equal(JSON.stringify(obs).includes('salt'), false);
});

test('information boundary: hidden cards, and the hidden trump itself, never change a decision', () => {
	const bot = bot29('gg');
	let checked = 0;
	let hiddenTrump = 0;
	const memory = {};
	runTable29(
		{ seed: 21, table: 3, hands: 6, seats: [bot, random29, random29, random29] },
		{
			onDecision({ seat, room, view }) {
				observe29(view, 'p0', memory);
				if (seat !== 0 || checked > 60) return;
				const swapped = structuredClone(room);
				const others = swapped.players.filter((p) => p.id !== 'p0' && p.cards.length);
				if (others.length < 2) return;
				[others[0].cards[0], others[1].cards[0]] = [others[1].cards[0], others[0].cards[0]];
				// Before the reveal, a seat other than the bidder cannot know the face-down card: swap it
				// for another player's card, changing the trump suit too.
				if (swapped.indicator && swapped.bidderId !== 'p0') {
					const holder = others.find((p) => p.id !== swapped.bidderId) ?? others[0];
					[holder.cards[0], swapped.indicator] = [swapped.indicator, holder.cards[0]];
					swapped.trump = swapped.indicator.suit;
					hiddenTrump++;
				}
				swapped.secret = { salt: `${swapped.secret.salt}-other` };
				const v2 = projection(swapped, 'p0', ALL);
				const a = decide29(view, stream(1, 'x', checked).random, { dna: GG, memory });
				const b = decide29(v2, stream(1, 'x', checked).random, { dna: GG, memory });
				assert.deepEqual(b, a);
				checked++;
			}
		}
	);
	assert.ok(checked > 30 && hiddenTrump > 5, `${checked} / ${hiddenTrump}`);
});

test('live path: bots fill seats, the runner moves them through bid, trump, reveal and play', () => {
	let room = liveTable();
	let minds = {};
	room = transition(room, 'host', 'start', {}, ctx({ deck: deck(2), handId: 'live-1' }));
	minds = updateMinds(minds, null, room);
	let guard = 0;
	const kinds = new Set();
	while (playing(room) && guard++ < 300) {
		const due = botDue(room, ctx().connected);
		let move;
		if (due) {
			move = nextBotMove(room, ctx().connected, stream(5, 'live', guard).random, { minds });
			assert.equal(move.botId, due);
			kinds.add(move.action);
		} else {
			const view = projection(room, 'host', ctx().connected);
			move = { botId: 'host', ...random29(view, 'host', stream(6, 'h', guard).random) };
		}
		const before = room;
		room = transition(room, move.botId, move.action, move.payload, ctx());
		minds = updateMinds(minds, before, room);
	}
	assert.ok(['hand-complete', 'annulled'].includes(room.result.reason), room.result.reason);
	assert.ok(kinds.has('play'));
	for (const mind of Object.values(minds)) assert.equal(mind.tricks.length, 8);
});

function teamMatch(a, b, tables, hands = 6) {
	let won = 0;
	let n = 0;
	for (let t = 0; t < tables; t++) {
		const { results } = runTable29({ seed: 31, table: t, hands, seats: [a, b, a, b] });
		for (const r of results) {
			if (r.winnerTeam === null || r.winnerTeam === undefined) continue;
			n++;
			won += r.winnerTeam === 0 ? 1 : 0;
		}
	}
	return won / n;
}

test('strength floor: the brain beats random and greedy teams; every character beats random', () => {
	const base = bot29(null, { personality: false, adaptive: false });
	assert.ok(teamMatch(base, random29, 12) > 0.65);
	assert.ok(teamMatch(base, greedy29, 30) > 0.5);
	for (const id of Object.keys(CANONICAL_STYLES))
		assert.ok(teamMatch(bot29(id), random29, 8) > 0.62, id);
});

test('a decision stays inside the performance budget', () => {
	const bot = bot29('virat-kohli');
	const times = [];
	runTable29(
		{ seed: 8, table: 1, hands: 3, seats: [bot, random29, random29, random29] },
		{
			onDecision({ seat, view }) {
				if (seat !== 0) return;
				const t0 = performance.now();
				bot(view, 'p0', stream(2, 't', times.length).random, {});
				times.push(performance.now() - t0);
			}
		}
	);
	times.sort((a, b) => a - b);
	assert.ok(times[Math.floor(times.length * 0.9)] < 25);
});
