import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { listVariants, getVariant } from '../../server/variants/index.mjs';
import { newRoom, transition, projection, invariant, playing } from '../../server/engine.mjs';
import { decide, winChance, bestDiscard } from '../../server/bots/strategy.mjs';
import { nextBotMove, pickBotName, humansPresent, BOT_NAMES } from '../../server/bots/runner.mjs';

function rng(seed) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 2 ** 32;
	};
}
function shuffled(random) {
	const deck = freshDeck();
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}
const humans = new Set(['host']);
const ctx = { now: 1000, turnMs: 60000, connected: humans };

function tableWithBots(levels) {
	let room = newRoom('bot-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	levels.forEach((level, i) => {
		room = transition(
			room,
			'host',
			'addBot',
			{ botId: `bot-${level}-${i}`, name: BOT_NAMES[i], level },
			ctx
		);
	});
	return room;
}

test('Only the host adds bots, between hands, on option tables, up to six seats', () => {
	let room = tableWithBots(['easy']);
	assert.equal(room.players.length, 2);
	const bot = room.players[1];
	assert.deepEqual(bot.bot, { level: 'easy', rebuys: 0 });
	assert.equal(bot.balance, 1000);
	assert.equal(room.issuedChips, 2000);
	room = transition(
		room,
		'guest',
		'join',
		{ username: 'Guest' },
		{ ...ctx, connected: new Set(['host', 'guest']) }
	);
	assert.throws(
		() => transition(room, 'guest', 'addBot', { botId: 'bot-x-1', name: 'X', level: 'easy' }, ctx),
		/host/
	);
	for (const bad of [
		{ botId: 'bot-a-1', name: 'A', level: 'genius' },
		{ botId: 'human-1', name: 'A', level: 'easy' },
		{ botId: bot.id, name: 'Dup', level: 'easy' },
		{ botId: 'bot-a-2', name: '', level: 'easy' }
	])
		assert.throws(() => transition(room, 'host', 'addBot', bad, ctx));
	for (let i = 0; i < 3; i++)
		room = transition(
			room,
			'host',
			'addBot',
			{ botId: `bot-fill-${i}`, name: `f${i}`, level: 'hard' },
			ctx
		);
	assert.equal(projection(room, 'host', humans).legalActions.addBot, false);
	assert.throws(
		() =>
			transition(room, 'host', 'addBot', { botId: 'bot-full-1', name: 'Z', level: 'easy' }, ctx),
		/full/
	);
	const legacy = transition(
		newRoom('old-room', 1000, 'host'),
		'host',
		'join',
		{ username: 'H' },
		ctx
	);
	assert.throws(
		() =>
			transition(legacy, 'host', 'addBot', { botId: 'bot-old-1', name: 'O', level: 'easy' }, ctx),
		/table options/
	);
});

test('Bots count as connected, get dealt in, and can be removed between hands only', () => {
	let room = tableWithBots(['normal', 'hard']);
	const view = projection(room, 'host', humans);
	assert.ok(view.usersList.filter((u) => u.bot).every((u) => u.connected));
	assert.deepEqual(
		view.usersList.map((u) => u.bot ?? null),
		[null, 'normal', 'hard']
	);
	room = transition(
		room,
		'host',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck: freshDeck(), handId: 'h', requireReady: true }
	);
	assert.equal(room.players.filter((p) => p.cards.length === 3).length, 3);
	assert.throws(
		() => transition(room, 'host', 'removeBot', { botId: 'bot-normal-0' }, ctx),
		/between hands/
	);
	while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
	room = transition(room, 'host', 'removeBot', { botId: 'bot-normal-0' }, ctx);
	assert.equal(projection(room, 'host', humans).usersList.length, 2);
	assert.throws(
		() => transition(room, 'host', 'removeBot', { botId: 'bot-normal-0' }, ctx),
		/not at the table/
	);
	invariant(room);
});

test('A broke bot buys back in at the next deal; chips stay conserved', () => {
	let room = tableWithBots(['easy']);
	const bot = room.players.find((p) => p.bot);
	const host = room.players.find((p) => p.id === 'host');
	// Move the bot's chips to the host, keeping the room's books balanced.
	host.balance += bot.balance - 5;
	bot.balance = 5;
	invariant(room);
	room = transition(
		room,
		'host',
		'start',
		{ cutAt: 0, cardsToDeal: 3 },
		{ ...ctx, deck: freshDeck(), handId: 'h', requireReady: true }
	);
	const after = room.players.find((p) => p.bot);
	assert.equal(after.bot.rebuys, 1);
	assert.equal(after.balance, 1005 - 10);
	assert.equal(room.issuedChips, 3000);
	invariant(room);
});

test('A bot can never become host when the host leaves', () => {
	let room = tableWithBots(['easy', 'hard']);
	room = transition(room, 'host', 'leave', {}, ctx);
	assert.equal(room.hostId, null);
});

test('Bots decide from their own view only: hidden cards never change a decision', () => {
	for (const version of listVariants().map((v) => v.rulesVersion)) {
		const variant = getVariant(version);
		const deckA = shuffled(rng(11));
		const deckB = deckA.slice();
		// Swap the host's hidden cards with cards from deep in the deck.
		const n = variant.cardsPerPlayer ?? 3;
		for (let i = 0; i < n; i++) {
			const hostIndex = i * 2; // seat 0 receives every other card
			[deckB[hostIndex], deckB[40 + i]] = [deckB[40 + i], deckB[hostIndex]];
		}
		const start = (deck) =>
			transition(
				tableWithBots(['hard']),
				'host',
				'start',
				{ cutAt: 0, cardsToDeal: n, rulesVersion: version },
				{ ...ctx, deck, handId: 'h', requireReady: true }
			);
		const a = start(deckA);
		const b = start(deckB);
		const botId = a.players.find((p) => p.bot).id;
		assert.deepEqual(
			a.players.find((p) => p.bot).cards,
			b.players.find((p) => p.bot).cards,
			version
		);
		for (let seed = 1; seed <= 5; seed++)
			assert.deepEqual(
				decide(projection(a, botId, humans), botId, rng(seed)),
				decide(projection(b, botId, humans), botId, rng(seed)),
				version
			);
	}
});

test('Hand strength and discard choices are sensible', () => {
	const classic = getVariant('classic-1');
	const c = (rank, suit) => ({ rank, suit });
	const trail = winChance(
		[c(14, 'hearts'), c(14, 'spades'), c(14, 'clubs')],
		classic,
		undefined,
		rng(3)
	);
	const junk = winChance(
		[c(2, 'hearts'), c(5, 'spades'), c(7, 'clubs')],
		classic,
		undefined,
		rng(3)
	);
	assert.ok(trail > 0.99 && junk < 0.15, `trail ${trail}, junk ${junk}`);
	const muflis = getVariant('muflis-1');
	assert.ok(
		winChance([c(2, 'hearts'), c(3, 'spades'), c(5, 'clubs')], muflis, undefined, rng(3)) > 0.9
	);
	const discard = getVariant('discard-one-1');
	assert.equal(
		bestDiscard([c(9, 'hearts'), c(9, 'spades'), c(2, 'clubs'), c(9, 'clubs')], discard),
		2
	);
});

/**
 * Bots play every hand. With `human`, the host stays seated and clicks a random legal
 * action on their turn (and deals), so six-seat tables mix five bots with a person.
 */
function playBotTable(version, levels, seed, hands = 8, human = false) {
	const random = rng(seed);
	let room = tableWithBots(levels);
	if (!human) room = transition(room, 'host', 'leave', {}, ctx);
	const variant = getVariant(version);
	const connected = human ? humans : new Set();
	let played = 0;
	for (let hand = 0; hand < hands; hand++) {
		const dealer = human ? 'host' : room.players.find((p) => p.bot && !p.departed).id;
		if (human && room.players.find((p) => p.id === 'host').balance < 10) break;
		room = transition(
			{ ...room, hostId: dealer },
			dealer,
			'start',
			{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion: version },
			{ ...ctx, connected, deck: shuffled(random), handId: `h${seed}-${hand}`, requireReady: true }
		);
		played++;
		let steps = 0;
		while (playing(room)) {
			assert.ok(++steps < 400, `${version}: table stalled`);
			let move = nextBotMove(room, connected, random);
			if (!move) {
				assert.equal(room.currentPlayerId, 'host', `${version}: no bot move on a bot turn`);
				const legal = projection(room, 'host', connected).legalActions;
				const options = [
					...(legal.see ? [['see', {}]] : []),
					...(legal.discard ? [['discard', { index: 0 }]] : []),
					...(legal.bet ? [['bet', { amount: legal.minBet }]] : []),
					...(legal.show ? [['show', { declare: 'high' }]] : []),
					...(legal.pack ? [['pack', {}]] : [])
				];
				const [action, payload] = options[Math.floor(random() * options.length)];
				move = { botId: 'host', action, payload };
			}
			room = transition(room, move.botId, move.action, move.payload, { ...ctx, connected });
			invariant(room);
		}
		assert.ok(room.result);
		assert.equal(room.players.reduce((s, p) => s + p.balance, 0) + room.pot, room.issuedChips);
	}
	return { room, played };
}

for (const variant of listVariants())
	test(`Bots finish every hand legally: ${variant.name}`, () => {
		for (let players = 2; players <= 6; players++) {
			const levels = Array.from(
				{ length: players - 1 },
				(_, i) => ['easy', 'normal', 'hard'][i % 3]
			);
			for (let seed = 1; seed <= 3; seed++) {
				// Bots-only tables (2–5 bots) and mixed tables with a person (2–6 seats).
				if (players <= 5)
					playBotTable(variant.rulesVersion, [...levels, 'normal'], seed * 31 + players);
				playBotTable(variant.rulesVersion, levels, seed * 57 + players, 6, true);
			}
		}
	});

test('Over many hands Hard and Normal bots beat Easy bots', () => {
	let hardNet = 0,
		normalNet = 0,
		easyNet = 0;
	for (let seed = 1; seed <= 40; seed++) {
		const { room } = playBotTable('classic-1', ['easy', 'normal', 'hard'], seed * 977, 15);
		for (const p of room.players.filter((player) => player.bot)) {
			const net = p.balance - 1000 * (1 + p.bot.rebuys);
			if (p.bot.level === 'hard') hardNet += net;
			else if (p.bot.level === 'normal') normalNet += net;
			else easyNet += net;
		}
	}
	assert.ok(hardNet > easyNet, `hard ${hardNet} vs easy ${easyNet}`);
	assert.ok(normalNet > easyNet, `normal ${normalNet} vs easy ${easyNet}`);
});

test('Runner helpers: unique names and human presence', () => {
	const room = tableWithBots(['easy', 'easy']);
	const name = pickBotName(room, rng(5));
	assert.ok(!room.players.some((p) => p.username === name.toLowerCase()));
	assert.equal(humansPresent(room, humans), true);
	assert.equal(humansPresent(room, new Set()), false);
	assert.equal(nextBotMove(room, humans, rng(1)), null);
});
