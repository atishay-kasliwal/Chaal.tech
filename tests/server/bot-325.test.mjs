import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { transition, projection, playing } from '../../server/engine.mjs';
import { createGameRoom } from '../../server/games/index.mjs';
import { fresh325Deck } from '../../server/tricks/three-two-five.mjs';
import { botDue, nextBotMove, updateMinds } from '../../server/bots/runner.mjs';
import { bot325, decide325 } from '../../server/bots/tricks/bot-325.mjs';
import { observation325 } from '../../server/bots/tricks/observation-325.mjs';
import { runTable325, randomPlayer } from '../../server/sim/tricks/table-325.mjs';
import { stream, shuffle } from '../../server/sim/seeds.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';

/* 3 2 5 bots: the information boundary, the live runner path, and a strength floor. */

const ctx = (extra = {}) => ({ now: 1000, turnMs: 60000, connected: new Set(['host']), ...extra });
const deck = (n) => shuffle(fresh325Deck(), stream(11, 'd', n).random);

function liveTable() {
	let room = createGameRoom('three-two-five', 'bot-table-325', 0, 'host');
	room = transition(room, 'host', 'join', { username: 'host' }, ctx());
	room = transition(room, 'host', 'ready', { ready: true }, ctx());
	room = transition(
		room,
		'host',
		'addBot',
		{ botId: 'bot-rohit-x1', characterId: 'rohit-sharma' },
		ctx()
	);
	room = transition(
		room,
		'host',
		'addBot',
		{ botId: 'bot-dhoni-x1', characterId: 'ms-dhoni' },
		ctx()
	);
	return room;
}

test('bot modules read no engine or room code: only the seat projection reaches them', () => {
	const dir = new URL('../../server/bots/tricks/', import.meta.url);
	for (const file of readdirSync(dir)) {
		const src = readFileSync(new URL(file, dir), 'utf8');
		assert.ok(
			!/from ['"][^'"]*(three-two-five|engine|room-object)\.mjs['"]/.test(src),
			`${file} imports engine code`
		);
	}
});

test('the observation holds only the seat view: own cards, public plays, counts; frozen', () => {
	let room = liveTable();
	room = transition(room, 'host', 'start', {}, ctx({ deck: deck(1), handId: 'h1' }));
	const id = room.order[0];
	const obs = observation325(projection(room, id, ctx().connected));
	assert.ok(Object.isFrozen(obs) && Object.isFrozen(obs.hand));
	assert.equal(obs.hand.length, 5);
	const mine = new Set(obs.hand.map((c) => `${c.rank}${c.suit}`));
	assert.equal(obs.unseen.length, 30 - 5);
	assert.ok(obs.unseen.every((c) => !mine.has(`${c.rank}${c.suit}`)));
	assert.equal(JSON.stringify(obs).includes('salt'), false);
});

test('information boundary: swapping cards the bot cannot see never changes its decision', () => {
	const bot = bot325('ms-dhoni');
	let checked = 0;
	runTable325(
		{ seed: 21, table: 3, rounds: 4, seats: [bot, randomPlayer, randomPlayer] },
		{
			onDecision({ seat, room, view }) {
				if (seat !== 0 || checked > 40) return;
				const others = room.order.filter((id) => id !== 'p0');
				const swapped = structuredClone(room);
				const [x, y] = others.map((pid) => swapped.players.find((p) => p.id === pid));
				if (!x.cards.length || !y.cards.length) return;
				[x.cards[0], y.cards[0]] = [y.cards[0], x.cards[0]];
				// The secret pull order is part of what the bot cannot see too.
				swapped.secret = { salt: `${swapped.secret.salt}-other` };
				const v2 = projection(swapped, 'p0', new Set(['p0', 'p1', 'p2']));
				const a = decide325(view, stream(1, 'x', checked).random, {
					dna: CANONICAL_STYLES['ms-dhoni'].tendencies.dna
				});
				const b = decide325(v2, stream(1, 'x', checked).random, {
					dna: CANONICAL_STYLES['ms-dhoni'].tendencies.dna
				});
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
			move = { botId: 'host', ...randomPlayer(view, 'host', stream(6, 'h', guard).random) };
		}
		const before = room;
		room = transition(room, move.botId, move.action, move.payload, ctx());
		minds = updateMinds(minds, before, room);
	}
	assert.equal(room.result.reason, 'round-complete');
	assert.deepEqual(Object.keys(minds).sort(), ['bot-dhoni-x1', 'bot-rohit-x1']);
	// Each mind has a model of the two other players, built from completed tricks.
	for (const mind of Object.values(minds)) assert.equal(Object.keys(mind.opp).length, 2);
});

test('strength floor: every character and the baseline clearly beat random players', () => {
	for (const id of [null, ...Object.keys(CANONICAL_STYLES)]) {
		const bot = bot325(id, { personality: !!id });
		let mine = 0;
		for (let t = 0; t < 6; t++) {
			const { room } = runTable325({
				seed: 31,
				table: t,
				rounds: 6,
				seats: [bot, randomPlayer, randomPlayer]
			});
			mine += room.scores.p0;
		}
		assert.ok(mine > 20, `${id ?? 'baseline'}: ${mine} over 36 rounds`);
	}
});
