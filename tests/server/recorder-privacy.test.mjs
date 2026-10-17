import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listVariants } from '../../server/variants/index.mjs';
import { nextBotMove } from '../../server/bots/runner.mjs';
import { finishCapture, buildHandRecords } from '../../server/analytics/recorder.mjs';
import { canonicalJson } from '../../server/analytics/hash.mjs';
import {
	teenPattiTable,
	dealTeenPatti,
	playTeenPatti,
	holdemTable,
	playHoldem,
	blackjackTable,
	playBlackjack,
	rummyTable,
	playRummy
} from './helpers/drivers.mjs';
import { seeded } from './helpers/table-sim.mjs';

const SEALED_KEYS = ['preDeal', 'steps', 'deck', 'salts', 'leaves', 'hiddenStacks', 'botTrace', 'draws', 'rngDraws', 'recycledDeck', 'ctx'];
// Rummy plays two decks: a card is its rank, suit and copy.
const key = (card) => `${card.rank}:${card.suit}:${card.copy ?? 0}`;

function walk(value, visit, path = []) {
	if (Array.isArray(value)) value.forEach((item, i) => walk(item, visit, [...path, i]));
	else if (value && typeof value === 'object') {
		visit(value, path);
		for (const [k, v] of Object.entries(value)) walk(v, visit, [...path, k]);
	}
}
const cardsIn = (value) => {
	const found = [];
	walk(value, (node) => {
		if ('rank' in node && 'suit' in node && (node.rank > 0 || node.suit === 'joker')) found.push(key(node));
	});
	return found;
};
const keysIn = (value) => {
	const found = new Set();
	walk(value, (node) => Object.keys(node).forEach((k) => found.add(k)));
	return found;
};

/** Hands from every game, many variants, with bots, packs, shows and hidden balances. */
function sampleHands() {
	const hands = [];
	for (const [index, variant] of listVariants().entries()) {
		const sim = teenPattiTable({ seed: 500 + index, rulesVersion: variant.rulesVersion, bots: ['hard'] });
		sim.act('b', 'setBalanceHidden', { hidden: true });
		for (let n = 0; n < 2; n++) {
			dealTeenPatti(sim, variant.rulesVersion);
			playTeenPatti(sim, { packBias: 0.3 });
		}
		hands.push(...sim.finished());
	}
	for (const seed of [601, 602, 603]) {
		const holdem = holdemTable({ seed, players: ['a', 'b', 'c', 'd'] });
		playHoldem(holdem);
		hands.push(...holdem.finished());
		const blackjack = blackjackTable({ seed });
		playBlackjack(blackjack);
		hands.push(...blackjack.finished());
		const rummy = rummyTable({ seed });
		playRummy(rummy, { turns: 20 });
		hands.push(...rummy.finished());
	}
	for (const hand of hands) assert.ok(hand.ok, hand.failure?.detail?.message);
	return hands.map((hand) => hand.records);
}
const HANDS = sampleHands();

test('the public record never contains a card a player kept hidden', () => {
	for (const { public: record, private: privates } of HANDS) {
		const shown = new Set([...record.shown.map((s) => s.p), ...(record.lateShown ?? []).map((s) => s.p)]);
		const publicCards = new Set(cardsIn(record));
		for (const own of privates) {
			if (shown.has(own.p)) continue;
			// Cards the table made public (a Rummy discard on top of the pile) are not hidden.
			const tableCards = new Set(cardsIn(record.table));
			for (const card of own.final.map(key))
				if (!tableCards.has(card))
					assert.ok(!publicCards.has(card), `${record._id}: ${own.p}'s hidden ${card} leaked`);
		}
	}
});

test('public and private records carry no system-only data', () => {
	for (const { public: record, private: privates } of HANDS) {
		for (const doc of [record, ...privates]) {
			const keys = keysIn(doc);
			for (const sealedKey of SEALED_KEYS) assert.ok(!keys.has(sealedKey), `${doc._id} has ${sealedKey}`);
		}
		if (record.seal) assert.deepEqual(Object.keys(record.seal).sort(), ['commitment', 'cutAt', 'cutBy']);
		for (const seat of record.seats.filter((s) => s.hidden)) {
			assert.equal(seat.stack, null, 'a hidden balance is not public');
			for (const event of record.events.filter((e) => e.p === seat.p && e.decision))
				assert.equal(event.decision.stackBefore, null);
		}
	}
});

test("a player's private record holds only that player's own cards", () => {
	for (const { public: record, private: privates } of HANDS) {
		for (const own of privates) {
			const mine = new Set([...own.dealt, ...own.final].map(key));
			for (const card of cardsIn(own)) assert.ok(mine.has(card), `${own._id} holds someone else's ${card}`);
			assert.ok(record.seats.some((s) => s.p === own.p));
		}
	}
});

test('swapping a packed, unshown hand for other cards changes nothing public, and no bot decision', () => {
	const variants = ['classic-1', 'muflis-1', 'ak47-1', '999-1', '2-card-1', '4-card-1', 'joker-1', 'lowest-joker-1', 'highest-joker-1'];
	let checked = 0;
	for (const [index, rulesVersion] of variants.entries())
		for (let seed = 700 + index * 10; seed < 705 + index * 10; seed++) {
			const sim = teenPattiTable({ seed, rulesVersion, bots: ['hard', 'normal'] });
			dealTeenPatti(sim, rulesVersion);
			playTeenPatti(sim, { packBias: 0.4 });
			const [capture] = sim.captures();
			const original = finishCapture(capture);
			const hidden = original.records.public.outcome.players.find((p) => !p.shown && p.exit !== 'won' && !p.p.startsWith('bot-'));
			if (!hidden) continue;
			const alt = structuredClone(capture);
			const start = alt.hand.steps[0];
			const participants = original.records.public.seats.map((s) => s.p);
			const ordered = sim.room.players.filter((p) => participants.includes(p.id)).map((p) => p.id);
			const position = ordered.indexOf(hidden.p);
			const per = original.records.private.find((p) => p.p === hidden.p).dealt.length;
			// Swap the hidden player's cards with cards from the bottom of the deck (never dealt).
			for (let card = 0; card < per; card++) {
				const at = card * ordered.length + position;
				const from = start.ctx.deck.length - 1 - card;
				[start.ctx.deck[at], start.ctx.deck[from]] = [start.ctx.deck[from], start.ctx.deck[at]];
			}
			for (const step of alt.hand.steps) delete step.h; // states now differ by those cards only
			const swapped = buildHandRecords(alt.hand, { engine: alt.engine, room: alt.room });
			assert.notEqual(
				canonicalJson(swapped.private.find((p) => p.p === hidden.p).dealt),
				canonicalJson(original.records.private.find((p) => p.p === hidden.p).dealt),
				'the swap changed the hidden hand'
			);
			assert.equal(canonicalJson(swapped.public), canonicalJson(original.records.public), `${rulesVersion}/${seed}`);
			assert.ok(swapped.sealed.botTrace.every((t) => t.verified === 'reproduced'));
			checked++;
		}
	assert.ok(checked >= 15, `checked ${checked} hands`);
});

test('hidden-card invariance: a bot decides the same whatever its opponents secretly hold', () => {
	let checked = 0;
	for (const [index, variant] of listVariants().entries()) {
		const sim = teenPattiTable({ seed: 900 + index, rulesVersion: variant.rulesVersion, bots: ['hard', 'easy'] });
		dealTeenPatti(sim, variant.rulesVersion);
		playTeenPatti(sim, {
			packBias: 0.05,
			beforeStep() {
				const room = sim.room;
				const draws = [];
				const random = seeded(index * 1000 + checked);
				const recording = () => {
					const value = random();
					draws.push(value);
					return value;
				};
				const move = nextBotMove(room, sim.connected, recording);
				if (!move) return;
				// Replace every opponent card the bot cannot see with an undealt card.
				const reveal = new Set([...(room.result?.revealedPlayerIds ?? []), ...(room.shownIds ?? [])]);
				const altered = structuredClone(room);
				const spare = [...altered.deck];
				for (const p of altered.players)
					if (p.id !== move.botId && !reveal.has(p.id))
						p.cards = p.cards.map((card) => (spare.length ? spare.pop() : card));
				let replayed;
				try {
					const queue = [...draws];
					replayed = nextBotMove(altered, sim.connected, () => (queue.length ? queue.shift() : random()));
				} catch {
					return; // a table state these cards cannot form; not a decision
				}
				assert.deepEqual(
					{ botId: replayed.botId, action: replayed.action, payload: replayed.payload },
					{ botId: move.botId, action: move.action, payload: move.payload },
					`${variant.rulesVersion}: a bot's decision depended on hidden cards`
				);
				checked++;
			}
		});
	}
	assert.ok(checked >= 40, `checked ${checked} bot decisions`);
});

test('bot code cannot reach storage, analytics or another player’s private data', async () => {
	for (const file of ['server/bots/strategy.mjs', 'server/bots/runner.mjs']) {
		const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
		const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
		for (const spec of imports)
			assert.ok(
				!/mongodb|analytics|club\/|cloudflare|store/.test(spec),
				`${file} imports ${spec}: bots decide only from projection(room, botId)`
			);
	}
	const runner = await readFile(new URL('../../server/bots/runner.mjs', import.meta.url), 'utf8');
	// Every decide() call is fed the bot's own projection, never the room.
	for (const call of runner.matchAll(/decide\(([^,]+),/g)) assert.match(call[1], /projection\(|view/);
});
