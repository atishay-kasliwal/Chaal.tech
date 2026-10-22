import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { transition, projection, playing } from '../../server/engine.mjs';
import { createGameRoom } from '../../server/games/index.mjs';
import { freshPakadDeck } from '../../server/tricks/ten-pakad.mjs';
import { botDue, nextBotMove, updateMinds } from '../../server/bots/runner.mjs';
import { botPakad, decidePakad, observePakad } from '../../server/bots/tricks/bot-pakad.mjs';
import { observationPakad } from '../../server/bots/tricks/observation-pakad.mjs';
import { runTablePakad, randomPakad, greedyPakad } from '../../server/sim/tricks/table-pakad.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';

/* 10 Pakad bots: the information boundary, the live runner path, strength floors and speed. */

const ctx = (extra = {}) => ({ now: 1000, turnMs: 60000, connected: new Set(['host']), ...extra });
const deck = (n) => shuffle(freshPakadDeck(), stream(12, 'd', n).random);
const DHONI = CANONICAL_STYLES['ms-dhoni'].tendencies.dna;

function liveTable() {
	let room = createGameRoom('ten-pakad', 'bot-table-pakad', 0, 'host');
	room = transition(room, 'host', 'join', { username: 'host' }, ctx());
	room = transition(room, 'host', 'ready', { ready: true }, ctx());
	for (const [botId, characterId] of [
		['bot-rohit-p1', 'rohit-sharma'],
		['bot-dhoni-p1', 'ms-dhoni'],
		['bot-samay-p1', 'samay-raina']
	])
		room = transition(room, 'host', 'addBot', { botId, characterId }, ctx());
	return room;
}

test('bot modules read no engine or room code: only the seat projection reaches them', () => {
	const dir = new URL('../../server/bots/tricks/', import.meta.url);
	for (const file of readdirSync(dir)) {
		const src = readFileSync(new URL(file, dir), 'utf8');
		assert.ok(
			!/from ['"][^'"]*(ten-pakad|three-two-five|engine|room-object)\.mjs['"]/.test(src),
			`${file} imports engine code`
		);
	}
});

test('the observation holds only the seat view and its own memory; frozen; nothing secret', () => {
	let room = liveTable();
	room = transition(room, 'host', 'start', {}, ctx({ deck: deck(1), handId: 'h1' }));
	const id = room.order[0];
	const obs = observationPakad(projection(room, id, ctx().connected));
	assert.ok(Object.isFrozen(obs) && Object.isFrozen(obs.hand));
	assert.equal(obs.hand.length, 5);
	assert.equal(obs.unseen.length, 52 - 5);
	assert.equal(obs.partner, room.order[2]);
	assert.equal(JSON.stringify(obs).includes('salt'), false);
});

test('memory: a bot remembers exactly the tricks it saw, from the last-trick view, once each', () => {
	const memory = {};
	const seen = [];
	runTablePakad(
		{ seed: 3, table: 2, hands: 1, seats: [randomPakad, randomPakad, randomPakad, randomPakad] },
		{
			onDecision({ room }) {
				const v = projection(room, 'p0', new Set(['p0', 'p1', 'p2', 'p3']));
				observePakad(v, 'p0', memory);
				if (v.lastTrick && !seen.includes(v.lastTrick.n)) seen.push(v.lastTrick.n);
			}
		}
	);
	assert.deepEqual(
		memory.tricks.map((t) => t.n),
		seen
	);
});

test('information boundary: swapping cards the bot cannot see never changes its decision', () => {
	const bot = botPakad('ms-dhoni');
	let checked = 0;
	const memory = {};
	runTablePakad(
		{ seed: 21, table: 3, hands: 3, seats: [bot, randomPakad, randomPakad, randomPakad] },
		{
			onDecision({ seat, room, view }) {
				observePakad(view, 'p0', memory);
				if (seat !== 0 || checked > 40) return;
				const swapped = structuredClone(room);
				const others = swapped.players.filter((p) => p.id !== 'p0' && p.cards.length);
				if (others.length < 2) return;
				// Swap a card between two other hands, and one with the undealt pile when there is one.
				[others[0].cards[0], others[1].cards[0]] = [others[1].cards[0], others[0].cards[0]];
				if (swapped.pending.length)
					[others[0].cards[0], swapped.pending[0]] = [swapped.pending[0], others[0].cards[0]];
				swapped.secret = { salt: `${swapped.secret.salt}-other` };
				const v2 = projection(swapped, 'p0', new Set(['p0', 'p1', 'p2', 'p3']));
				const a = decidePakad(view, stream(1, 'x', checked).random, { dna: DHONI, memory });
				const b = decidePakad(v2, stream(1, 'x', checked).random, { dna: DHONI, memory });
				assert.deepEqual(b, a);
				checked++;
			}
		}
	);
	assert.ok(checked > 20);
});

test('live path: bots fill seats, the runner moves them, minds learn only from their own views', () => {
	let room = liveTable();
	let minds = {};
	room = transition(room, 'host', 'start', {}, ctx({ deck: deck(2), handId: 'live-1' }));
	minds = updateMinds(minds, null, room);
	let guard = 0;
	while (playing(room) && guard++ < 200) {
		const due = botDue(room, ctx().connected);
		let move;
		if (due) {
			move = nextBotMove(room, ctx().connected, stream(5, 'live', guard).random, { minds });
			assert.equal(move.botId, due);
		} else {
			const view = projection(room, 'host', ctx().connected);
			move = { botId: 'host', ...randomPakad(view, 'host', stream(6, 'h', guard).random) };
		}
		const before = room;
		room = transition(room, move.botId, move.action, move.payload, ctx());
		minds = updateMinds(minds, before, room);
	}
	assert.equal(room.result.reason, 'hand-complete');
	assert.deepEqual(Object.keys(minds).sort(), ['bot-dhoni-p1', 'bot-rohit-p1', 'bot-samay-p1']);
	for (const mind of Object.values(minds)) assert.equal(mind.tricks.length, 13);
});

function teamMatch(a, b, tables, hands = 4) {
	let won = 0;
	let tens = 0;
	let n = 0;
	for (let t = 0; t < tables; t++) {
		const { results } = runTablePakad({ seed: 31, table: t, hands, seats: [a, b, a, b] });
		for (const r of results) {
			n++;
			won += r.winnerTeam === 0 ? 1 : 0;
			tens += r.tens[0];
		}
	}
	return { won: won / n, tens: tens / n };
}

test('strength floor: the brain alone beats random and greedy teams; every character beats random', () => {
	const base = botPakad(null, { personality: false, adaptive: false });
	const vsRandom = teamMatch(base, randomPakad, 6);
	assert.ok(vsRandom.won > 0.7 && vsRandom.tens > 2.4, JSON.stringify(vsRandom));
	const vsGreedy = teamMatch(base, greedyPakad, 6);
	assert.ok(vsGreedy.won > 0.55, JSON.stringify(vsGreedy));
	for (const id of Object.keys(CANONICAL_STYLES)) {
		const r = teamMatch(botPakad(id), randomPakad, 3);
		assert.ok(r.won > 0.6, `${id}: ${JSON.stringify(r)}`);
	}
});

test('a decision stays inside the performance budget', () => {
	const bot = botPakad('gg');
	const times = [];
	runTablePakad(
		{ seed: 8, table: 1, hands: 2, seats: [bot, randomPakad, randomPakad, randomPakad] },
		{
			onDecision({ seat, view, room }) {
				if (seat !== 0) return;
				const t0 = performance.now();
				bot(view, 'p0', stream(2, 't', times.length).random, {});
				times.push(performance.now() - t0);
				void room;
			}
		}
	);
	times.sort((a, b) => a - b);
	assert.ok(times[Math.floor(times.length * 0.9)] < 25, `p90 ${times.at(-3)} ms`);
});
