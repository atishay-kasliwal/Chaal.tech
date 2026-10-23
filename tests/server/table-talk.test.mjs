import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection, playing } from '../../server/engine.mjs';
import { botSeatPayload, nextBotMove, updateMinds } from '../../server/bots/runner.mjs';
import {
	tableTalk,
	publicFacts,
	emptyTalk,
	talkChance,
	TABLE_GAP_MS,
	BOT_GAP_MS,
	CHANCE,
	PRIORITY
} from '../../server/bots/table-talk.mjs';
import { TALK_CUES, TALK_LINES } from '../../shared/talk-lines.mjs';
import { CUES } from '../../server/bots/mind.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { renderLines } from '../../scripts/table-talk-lines.mjs';
import { seeded, shuffled } from './helpers/table-sim.mjs';

const humans = new Set(['host']);
const ctx = { now: 1000, turnMs: 60000, connected: humans };
const CAST = ['rohit-sharma', 'virat-kohli', 'samay-raina'];

function table(ids = CAST) {
	let room = newRoom('talk-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	ids.forEach((id, i) => {
		room = transition(
			room,
			'host',
			'addBot',
			botSeatPayload(room, id, `bot-talk-${i}`, () => 0),
			ctx
		);
	});
	return room;
}

/**
 * Play Teen Patti hands the way the room object does: every commit updates the minds, then (when
 * `talk` is on) works out table talk from the committed snapshots. Returns every commit, the bot
 * decisions and the lines. `talkRandom` is talk's own draw source, separate from the bots'.
 */
function play({ hands = 30, seed = 1, talk = true, chance = null, gapMs = 1000 } = {}) {
	const random = seeded(seed);
	const talkRandom = seeded(seed * 7 + 3);
	let room = table();
	let minds = {};
	let talkState = emptyTalk();
	let now = 0;
	const commits = [];
	const decisions = [];
	const lines = [];
	const step = (before, after, actorId) => {
		minds = updateMinds(minds, before, after);
		now += gapMs;
		const frozen = JSON.stringify([before, after, minds]);
		if (talk) {
			const out = tableTalk(talkState, before, after, {
				actorId,
				minds,
				now,
				random: talkRandom,
				chance
			});
			talkState = out.state;
			if (out.talk) lines.push({ ...out.talk, commit: commits.length });
		}
		// Talk never changes what it reads.
		assert.equal(JSON.stringify([before, after, minds]), frozen);
		commits.push({ before, after, actorId, minds, now, talkState });
	};
	for (let h = 0; h < hands; h++) {
		const before = room;
		try {
			room = transition(
				room,
				'host',
				'start',
				{ cutAt: 0, cardsToDeal: 3 },
				{ ...ctx, deck: shuffled(freshDeck(), random), handId: `h${h}`, requireReady: true }
			);
		} catch {
			break; // Somebody (the host, most likely) is out of chips: the night is over.
		}
		step(before, room, 'host');
		for (let guard = 0; guard < 200 && playing(room); guard++) {
			const prev = room;
			if (room.currentPlayerId === 'host') {
				const legal = projection(room, 'host', humans).legalActions;
				const action = random() < 0.5 && legal.bet ? 'bet' : 'pack';
				room = transition(
					room,
					'host',
					action,
					action === 'bet' ? { amount: legal.minBet } : {},
					ctx
				);
				step(prev, room, 'host');
				continue;
			}
			const move = nextBotMove(room, humans, random, { minds });
			assert.ok(move, 'a bot is due');
			decisions.push(`${move.botId}:${move.action}:${JSON.stringify(move.payload ?? {})}`);
			room = transition(room, move.botId, move.action, move.payload, ctx);
			step(prev, room, move.botId);
		}
	}
	const played = new Set(commits.map((c) => c.after.handId)).size;
	return { room, commits, decisions, lines, minds, played };
}

/** The same room with every hidden card replaced: what nobody at the table can see changes. */
function rehide(room, random) {
	if (!room) return room;
	const copy = structuredClone(room);
	const shown = new Set([...(copy.result?.revealedPlayerIds ?? []), ...(copy.shownIds ?? [])]);
	const deck = shuffled(freshDeck(), random);
	for (const p of copy.players)
		if (p.cards?.length && !shown.has(p.id)) p.cards = p.cards.map(() => deck.pop());
	return copy;
}

/* ------------------------------------------- lines ------------------------------------------- */

test('lines: every character has 6 to 10 lines for every moment, short, kind and dash free', () => {
	assert.deepEqual(Object.keys(TALK_LINES).sort(), [...CHARACTER_IDS].sort());
	// Every mind cue can be spoken; talk adds WIN and BLIND_RAISE.
	for (const cue of CUES) assert.ok(TALK_CUES.includes(cue), cue);
	assert.deepEqual([...PRIORITY].sort(), [...TALK_CUES].sort());
	assert.deepEqual(Object.keys(CHANCE).sort(), [...TALK_CUES].sort());
	const all = new Map();
	for (const [id, byCue] of Object.entries(TALK_LINES)) {
		assert.deepEqual(Object.keys(byCue).sort(), [...TALK_CUES].sort(), id);
		for (const [cue, lines] of Object.entries(byCue)) {
			assert.ok(lines.length >= 6 && lines.length <= 10, `${id}/${cue}: ${lines.length}`);
			assert.equal(new Set(lines).size, lines.length, `${id}/${cue} repeats a line`);
			// A {name} moment still needs lines for when nobody is named.
			if (lines.some((l) => l.includes('{name}')))
				assert.ok(lines.filter((l) => !l.includes('{name}')).length >= 1, `${id}/${cue}`);
			for (const line of lines) {
				assert.ok(line.length >= 3 && line.replace('{name}', 'Someone').length <= 48, line);
				assert.doesNotMatch(line, /[—–]|\s-\s|--/, `no dashes: ${line}`);
				assert.doesNotMatch(line.replaceAll('{name}', ''), /[{}]/, `only {name}: ${line}`);
				assert.doesNotMatch(line, /\b(money|rupees?|cash|loan|all your savings)\b/i, line);
				all.set(line, (all.get(line) ?? 0) + 1);
			}
		}
	}
	assert.ok(all.size >= 300, `${all.size} lines`);
});

test('lines: docs/bots/TABLE_TALK_LINES.md is printed from the lines file and up to date', () => {
	const doc = readFileSync(new URL('../../docs/bots/TABLE_TALK_LINES.md', import.meta.url), 'utf8');
	assert.equal(doc, renderLines(), 'run: node scripts/table-talk-lines.mjs');
	assert.doesNotMatch(doc, /—/);
});

/* ------------------------------------------ privacy ------------------------------------------ */

test('privacy: talk reads public facts only, so hidden cards never change them', () => {
	const { commits } = play({ hands: 6, seed: 3, talk: false });
	const draw = seeded(99);
	for (const { before, after } of commits) {
		assert.deepEqual(publicFacts(rehide(before, draw)), publicFacts(before));
		assert.deepEqual(publicFacts(rehide(after, draw)), publicFacts(after));
		assert.doesNotMatch(JSON.stringify(publicFacts(after)), /"cards"|"suit"|"rank"/);
	}
});

test('privacy: mid-hand talk is independent of the bot’s hidden cards (same public play, other cards, same lines)', () => {
	let checked = 0;
	let spoke = 0;
	for (const seed of [1, 2]) {
		const { commits } = play({ hands: 25, seed, talk: false });
		const midHand = commits.filter(
			({ before, after }) => before && playing(before) && playing(after)
		);
		const draw = seeded(seed + 1000);
		for (const { before, after, actorId } of midHand) {
			// Always talk when a moment allows it, so a difference could not hide behind a coin flip.
			for (const chance of [1, null]) {
				for (let k = 0; k < 2; k++) {
					const run = (b, a) =>
						tableTalk(emptyTalk(), b, a, { actorId, now: 1e9, random: seeded(k), chance }).talk;
					const original = run(before, after);
					const other = run(rehide(before, draw), rehide(after, draw));
					assert.deepEqual(other, original);
					if (original) spoke++;
					checked++;
				}
			}
		}
	}
	console.log(`mid-hand checks ${checked}, spoke ${spoke}`);
	assert.ok(checked > 300, `${checked} mid-hand checks`);
	assert.ok(spoke > 0, 'some blind raise was spoken about, so the comparison means something');
});

test('privacy: mid-hand talk is only BLIND_RAISE, only for the bot that acted, only while it is blind', () => {
	const { lines, commits } = play({ hands: 40, seed: 11, chance: 1, gapMs: 60000 });
	const mid = lines.filter((l) => l.cue === 'BLIND_RAISE');
	assert.ok(mid.length > 0);
	for (const line of mid) {
		const at = commits[line.commit];
		assert.equal(at.actorId, line.playerId, 'spoken on its own action');
		assert.ok(playing(at.after));
		assert.equal(
			at.before.players.find((p) => p.id === line.playerId).isBlind,
			true,
			'had not seen its cards'
		);
		assert.equal(at.after.players.find((p) => p.id === line.playerId).isBlind, true);
		assert.equal(line.delayMs, 0);
	}
	// Everything else waits for the hand to end: said on the commit that settled it.
	const ends = lines.filter((l) => l.cue !== 'BLIND_RAISE');
	assert.ok(ends.length > 0);
	for (const line of ends) {
		const at = commits[line.commit];
		assert.ok(!playing(at.after), `${line.cue} after the hand`);
		assert.equal(at.after.result.handId, line.handId);
		assert.notEqual(at.before.result?.handId, line.handId);
	}
});

test('privacy: a hand-end line without a mind depends only on what was shown', () => {
	const { commits } = play({ hands: 30, seed: 8, talk: false });
	const ends = commits.filter(
		({ before, after }) => after.result && before.result?.handId !== after.result.handId
	);
	assert.ok(ends.length >= 25);
	const draw = seeded(5);
	for (const { before, after, actorId } of ends)
		for (let k = 0; k < 4; k++) {
			const run = (b, a) =>
				tableTalk(emptyTalk(), b, a, { actorId, now: 1e9, random: seeded(k), chance: 1 }).talk;
			assert.deepEqual(run(rehide(before, draw), rehide(after, draw)), run(before, after));
		}
});

/* ---------------------------------------- rate limits ---------------------------------------- */

test('rarity: one line per moment, one per bot per hand, a table gap and a per-bot gap', () => {
	// Fast commits (every 300 ms) and every moment allowed to talk: the gaps must still hold.
	const { lines, commits } = play({ hands: 60, seed: 21, chance: 1, gapMs: 300 });
	assert.ok(lines.length > 5);
	const times = lines.map((l) => commits[l.commit].now);
	for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= TABLE_GAP_MS);
	const perBotHand = new Set();
	const lastBy = new Map();
	for (const line of lines) {
		const key = `${line.playerId}:${line.handId}`;
		assert.ok(!perBotHand.has(key), `twice in a hand: ${key}`);
		perBotHand.add(key);
		const now = commits[line.commit].now;
		if (lastBy.has(line.playerId)) assert.ok(now - lastBy.get(line.playerId) >= BOT_GAP_MS);
		lastBy.set(line.playerId, now);
	}
	// One speaker per commit.
	assert.equal(new Set(lines.map((l) => l.commit)).size, lines.length);
});

test('rarity: at the real chances most hands pass in silence', () => {
	let hands = 0;
	let spoken = 0;
	for (const seed of [31, 32, 33, 34]) {
		const { lines, played } = play({ hands: 50, seed, gapMs: 1500 });
		hands += played;
		spoken += lines.length;
	}
	assert.ok(hands >= 100, `${hands} hands`);
	const rate = spoken / hands;
	console.log(`lines per hand ${rate.toFixed(2)} over ${hands} hands`);
	assert.ok(rate > 0.05 && rate < 0.35, `lines per hand ${rate.toFixed(2)}`);
});

test('rarity: chance 0 is silent, and the deployment override is read safely', () => {
	assert.equal(play({ hands: 20, seed: 4, chance: 0 }).lines.length, 0);
	assert.equal(talkChance({}), null);
	assert.equal(talkChance({ BOT_TALK_CHANCE: '1' }), 1);
	assert.equal(talkChance({ BOT_TALK_CHANCE: '0' }), 0);
	assert.equal(talkChance({ BOT_TALK_CHANCE: 'loud' }), null);
	assert.equal(talkChance({ BOT_TALK_CHANCE: '3' }), null);
});

test('a line names a real player at the table and never repeats the bot’s last few', () => {
	const { lines, room } = play({ hands: 80, seed: 41, chance: 1, gapMs: 40000 });
	const names = room.players.map((p) => p.username);
	for (const line of lines) {
		assert.doesNotMatch(line.text, /[{}]/);
		assert.ok(line.text.length > 2);
		assert.ok(names.includes(room.players.find((p) => p.id === line.playerId).username));
	}
	const byBot = new Map();
	for (const line of lines)
		byBot.set(line.playerId, [...(byBot.get(line.playerId) ?? []), line.text]);
	for (const said of byBot.values())
		for (let i = 1; i < said.length; i++)
			assert.ok(!said.slice(Math.max(0, i - 4), i).includes(said[i]));
});

/* ------------------------------------------- replay ------------------------------------------- */

test('replay: talk changes no snapshot, mind or bot decision', () => {
	for (const seed of [2, 9]) {
		const loud = play({ hands: 30, seed, chance: 1 });
		const quiet = play({ hands: 30, seed, talk: false });
		assert.ok(loud.lines.length > 0);
		assert.deepEqual(loud.decisions, quiet.decisions);
		assert.deepEqual(loud.room, quiet.room);
		assert.deepEqual(loud.minds, quiet.minds);
		assert.deepEqual(
			loud.commits.map((c) => c.after.revision),
			quiet.commits.map((c) => c.after.revision)
		);
	}
});

test('trick games: a public hand result can earn a line; nothing mid-hand', () => {
	const base = {
		name: 't',
		gameType: 'ten-pakad',
		handId: 'p1',
		isStarted: true,
		gameShow: true,
		players: [
			{ id: 'me', username: 'Me', seatNumber: 0, cards: [] },
			{
				id: 'b1',
				username: 'Rohit',
				seatNumber: 1,
				bot: { characterId: 'rohit-sharma' },
				cards: []
			},
			{ id: 'p2', username: 'Pal', seatNumber: 2, cards: [] },
			{ id: 'b3', username: 'Dhoni', seatNumber: 3, bot: { characterId: 'ms-dhoni' }, cards: [] }
		],
		result: {
			reason: 'hand-complete',
			handId: 'p1',
			winnerTeam: 1,
			kot: true,
			winnerId: 'b1',
			amount: 0
		}
	};
	const before = { ...base, gameShow: false, result: null };
	const { talk } = tableTalk(emptyTalk(), before, base, { now: 1e6, random: seeded(1), chance: 1 });
	assert.ok(talk && ['b1', 'b3'].includes(talk.playerId));
	assert.equal(talk.cue, 'BIG_WIN');
	assert.ok(TALK_LINES[talk.botId].BIG_WIN.includes(talk.text));
	const mid = {
		...before,
		players: before.players.map((p) => ({ ...p, cards: [{ rank: 5, suit: 'hearts' }] }))
	};
	assert.equal(
		tableTalk(emptyTalk(), before, mid, { actorId: 'b1', now: 1e6, random: seeded(1), chance: 1 })
			.talk,
		null
	);
	// An abandoned hand earns nothing.
	const abandoned = {
		...base,
		result: { ...base.result, reason: 'abandoned', winnerTeam: null, winnerId: 'none' }
	};
	assert.equal(
		tableTalk(emptyTalk(), before, abandoned, { now: 1e6, random: seeded(1), chance: 1 }).talk,
		null
	);
});
