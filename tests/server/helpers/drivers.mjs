/**
 * Plays legal hands of every game through a TableSim, choosing moves at random (seeded), so
 * recorder tests see realistic, varied hands. Humans move through the same actions the UI sends;
 * bots move through the real bot runner.
 */
import { freshDeck } from '../../../server/classic.mjs';
import { freshRummyDeck } from '../../../server/rummy/rummy.mjs';
import { fresh325Deck } from '../../../server/tricks/three-two-five.mjs';
import { getVariant } from '../../../server/variants/index.mjs';
import { TableSim, shuffled } from './table-sim.mjs';

const pick = (random, list) => list[Math.floor(random() * list.length)];

/** Try an action; illegal ones are simply not committed (as in the room). */
function attempt(sim, actor, action, payload, options) {
	try {
		sim.act(actor, action, payload, options);
		return true;
	} catch {
		return false;
	}
}

export function teenPattiTable({
	seed = 1,
	humans = ['a', 'b', 'c'],
	bots = [],
	rulesVersion = 'classic-1',
	options = {},
	table = 1000
} = {}) {
	const sim = new TableSim({ seed });
	sim.connected = new Set(humans);
	sim.create({
		host: humans[0],
		rulesVersion,
		table,
		options: { boot: 10, autoReady: true, ...options }
	});
	for (const id of humans) sim.act(id, 'join', { username: id.toUpperCase() });
	bots.forEach((level, index) =>
		sim.act(humans[0], 'addBot', { botId: `bot-test${index}abcd`, name: `Bot${index}`, level })
	);
	return sim;
}

export function dealTeenPatti(
	sim,
	rulesVersion = sim.room.rulesVersion,
	handId = `h${sim.room.revision}`
) {
	const variant = getVariant(rulesVersion);
	sim.tick(2000);
	return sim.act(
		sim.room.hostId,
		'start',
		{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion },
		{ ctx: { deck: shuffled(freshDeck(), sim.random), handId, requireReady: true } }
	);
}

/** Humans' off-turn obligations: discards and table moves (bots do theirs in the runner). */
function humanChore(sim, random) {
	for (const p of sim.room.players) {
		if (p.bot || p.departed || p.seatNumber === null || p.isPacked || !p.cards.length) continue;
		const legal = sim.view(p.id).legalActions;
		if (legal.discard) {
			for (let index = 0; index < p.cards.length; index++)
				if (attempt(sim, p.id, 'discard', { index })) return true;
		}
		if (legal.table?.length && attempt(sim, p.id, 'table', pick(random, legal.table))) return true;
	}
	return false;
}

export function playTeenPatti(sim, { packBias = 0.15, maxSteps = 150, beforeStep } = {}) {
	const random = sim.random;
	for (let n = 0; n < maxSteps && sim.playing(); n++) {
		sim.tick(400);
		if (beforeStep?.(n) === 'stop') return;
		if (!sim.playing()) break;
		if (humanChore(sim, random)) continue;
		if (sim.botMove()) continue;
		const current = sim.room.currentPlayerId;
		const player = sim.room.players.find((p) => p.id === current);
		if (!player || player.bot) {
			sim.timeout();
			continue;
		}
		const legal = sim.view(current).legalActions;
		if (legal.see && random() < 0.3 && attempt(sim, current, 'see')) continue;
		if (legal.show && random() < 0.25 && attempt(sim, current, 'show')) continue;
		if (legal.bet && random() > packBias) {
			const amount = random() < 0.4 ? legal.maxBet : legal.minBet;
			if (attempt(sim, current, 'bet', { amount })) continue;
		}
		if (!attempt(sim, current, 'pack')) sim.timeout();
	}
	while (sim.playing()) sim.timeout();
}

export function holdemTable({ seed = 1, players = ['a', 'b', 'c'], stacks } = {}) {
	const sim = new TableSim({ seed });
	sim.connected = new Set(players);
	sim.create({ gameType: 'texas-holdem', host: players[0], table: 1000 });
	for (const id of players) sim.act(id, 'join', { username: id.toUpperCase() });
	if (stacks)
		sim.patchRoom((room) => {
			// Uneven stacks from earlier, unrecorded play, keeping chips conserved.
			const total = room.players.reduce((sum, p) => sum + p.balance, 0);
			room.players.forEach((p, i) => (p.balance = stacks[i]));
			room.players[0].balance += total - stacks.reduce((sum, value) => sum + value, 0);
		});
	return sim;
}

export function playHoldem(sim, { allInBias = 0.15 } = {}) {
	const random = sim.random;
	for (const p of sim.room.players.filter((p) => !p.departed))
		attempt(sim, p.id, 'ready', { ready: true });
	sim.tick(1000);
	sim.act(
		sim.room.hostId,
		'start',
		{},
		{ ctx: { deck: shuffled(freshDeck(), random), handId: `p${sim.room.revision}` } }
	);
	for (let n = 0; n < 200 && sim.playing(); n++) {
		sim.tick(400);
		const current = sim.room.currentPlayerId;
		const legal = sim.view(current).legalActions;
		const roll = random();
		if (
			legal.raise &&
			roll < allInBias &&
			attempt(sim, current, 'raise', { amount: legal.maxRaiseTo })
		)
			continue;
		if (legal.raise && roll < 0.35) {
			const target =
				legal.minRaiseTo + Math.floor(random() * Math.max(1, legal.maxRaiseTo - legal.minRaiseTo));
			if (attempt(sim, current, 'raise', { amount: Math.min(target, legal.maxRaiseTo) })) continue;
		}
		if (legal.check && attempt(sim, current, 'check')) continue;
		if (legal.call && roll < 0.85 && attempt(sim, current, 'call')) continue;
		if (!attempt(sim, current, 'fold')) sim.timeout();
	}
	while (sim.playing()) sim.timeout();
}

export function blackjackTable({ seed = 1, players = ['a', 'b'] } = {}) {
	const sim = new TableSim({ seed });
	sim.connected = new Set(players);
	sim.create({ gameType: 'blackjack', host: players[0], table: 1000 });
	for (const id of players) sim.act(id, 'join', { username: id.toUpperCase() });
	return sim;
}

export function playBlackjack(sim, { timeoutBias = 0.1 } = {}) {
	const random = sim.random;
	for (const p of sim.room.players.filter((p) => !p.departed)) {
		attempt(sim, p.id, 'bet', { amount: 2 * (1 + Math.floor(random() * 20)) });
		attempt(sim, p.id, 'ready', { ready: true });
	}
	sim.tick(1000);
	sim.act(
		sim.room.hostId,
		'start',
		{},
		{ ctx: { deck: shuffled(freshDeck(), random), handId: `b${sim.room.revision}` } }
	);
	for (let n = 0; n < 60 && sim.playing(); n++) {
		sim.tick(400);
		const current = sim.room.currentPlayerId;
		if (!current) break;
		const legal = sim.view(current).legalActions;
		const roll = random();
		if (roll < timeoutBias) sim.timeout();
		else if (legal.double && roll < 0.25) attempt(sim, current, 'double');
		else if (legal.hit && roll < 0.6) attempt(sim, current, 'hit');
		else if (!attempt(sim, current, 'stand')) sim.timeout();
	}
	while (sim.playing()) sim.timeout();
}

export function rummyTable({ seed = 1, players = ['a', 'b', 'c'] } = {}) {
	const sim = new TableSim({ seed });
	sim.connected = new Set(players);
	sim.create({ gameType: 'rummy', host: players[0], table: 1000 });
	for (const id of players) sim.act(id, 'join', { username: id.toUpperCase() });
	return sim;
}

/** Draw and discard for `turns` turns (recycling the discard pile when the stock runs out). */
export function playRummy(sim, { turns = 12, leaveAfter = true } = {}) {
	const random = sim.random;
	for (const p of sim.room.players.filter((p) => !p.departed))
		attempt(sim, p.id, 'ready', { ready: true });
	sim.tick(1000);
	sim.act(
		sim.room.hostId,
		'start',
		{},
		{ ctx: { deck: shuffled(freshRummyDeck(), random), handId: `r${sim.room.revision}` } }
	);
	for (let n = 0; n < turns && sim.playing(); n++) {
		sim.tick(400);
		const current = sim.room.currentPlayerId;
		const recycledDeck =
			sim.room.deck.length === 0 && sim.room.discardPile.length > 1
				? shuffled(sim.room.discardPile.slice(0, -1), random)
				: undefined;
		if (random() < 0.3 && sim.room.discardPile.length && attempt(sim, current, 'draw-discard'))
			attempt(sim, current, 'discard', { index: Math.floor(random() * 14) });
		else if (attempt(sim, current, 'draw-stock', {}, { ctx: recycledDeck ? { recycledDeck } : {} }))
			attempt(sim, current, 'discard', { index: Math.floor(random() * 14) });
		else sim.timeout();
	}
	if (leaveAfter)
		for (const p of sim.room.players.filter((p) => !p.departed).slice(1))
			if (sim.playing()) sim.act(p.id, 'leave');
}

/** A 3 2 5 table: one person and two Chaal characters (bots move through the real runner). */
export function threeTwoFiveTable({ seed = 1 } = {}) {
	const sim = new TableSim({ seed });
	sim.connected = new Set(['a']);
	sim.create({ gameType: 'three-two-five', host: 'a', table: 0 });
	sim.act('a', 'join', { username: 'A' });
	sim.act('a', 'addBot', { botId: 'bot-rohit-test1', characterId: 'rohit-sharma' });
	sim.act('a', 'addBot', { botId: 'bot-dhoni-test1', characterId: 'ms-dhoni' });
	return sim;
}

/** One round: bots through the runner, the person at random (sometimes letting the turn run out). */
export function playThreeTwoFive(sim, { timeoutBias = 0.1 } = {}) {
	const random = sim.random;
	attempt(sim, 'a', 'ready', { ready: true });
	sim.tick(1000);
	sim.act(
		'a',
		'start',
		{},
		{ ctx: { deck: shuffled(fresh325Deck(), random), handId: `t${sim.room.revision}` } }
	);
	for (let n = 0; n < 80 && sim.playing(); n++) {
		sim.tick(400);
		if (sim.botMove()) continue;
		if (random() < timeoutBias) {
			sim.timeout();
			continue;
		}
		const l = sim.view('a').legalActions;
		if (l.chooseTrump)
			sim.act('a', 'chooseTrump', {
				suit: pick(random, ['spades', 'hearts', 'diamonds', 'clubs'])
			});
		else if (l.pull) sim.act('a', 'pull', { position: Math.floor(random() * l.pull) });
		else if (l.give.length) sim.act('a', 'give', { card: pick(random, l.give) });
		else sim.act('a', 'play', { card: pick(random, l.play) });
	}
}

export { TableSim };
