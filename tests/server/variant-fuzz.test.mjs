import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { listVariants, getVariant } from '../../server/variants/index.mjs';
import { newRoom, transition, projection, invariant, playing } from '../../server/engine.mjs';

/**
 * Hostile input. A client can send anything in a move; the server must refuse what is not legal
 * with a plain message, never change the table when it refuses, never fall over with a
 * programming error (a TypeError dressed up as a rejection), and keep the chips whole whenever
 * it accepts something strange.
 */
const ids = ['a', 'b', 'c', 'd'];
const connected = new Set(ids);
const ctx = { now: 1000, turnMs: 60000, connected };

function rng(seed) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 2 ** 32;
	};
}
const pick = (random, list) => list[Math.floor(random() * list.length)];

const GARBAGE = [
	undefined,
	null,
	'draw',
	7,
	-1,
	NaN,
	[],
	[1, 2],
	{},
	{ kind: null },
	{ kind: 'nope' },
	{ kind: '__proto__' },
	{ kind: 'constructor' },
	{ kind: 'draw' },
	{ kind: 'draw', index: '1' },
	{ kind: 'draw', index: 1.5 },
	{ kind: 'draw', index: -2 },
	{ kind: 'draw', index: 99 },
	{ kind: 'draw', index: null },
	{ kind: 'trade', index: 0 },
	{ kind: 'trade', index: 0, target: 'zz' },
	{ kind: 'trade', index: 0, target: 'a' },
	{ kind: 'trade', index: 99, target: 'b' },
	{ kind: 'trade', index: 0, target: { id: 'b' } },
	{ kind: 'pass', index: NaN },
	{ kind: 'pass', index: Infinity },
	{ kind: 'pass', index: '0' },
	{ kind: 'bid', bid: -1 },
	{ kind: 'bid', bid: 1e9 },
	{ kind: 'bid', bid: '5' },
	{ kind: 'bid' },
	{ kind: 'buy', price: -5 },
	{ kind: 'buy', decline: 'yes' },
	{ kind: 'share' },
	{ kind: 'share', target: 'zz' },
	{ kind: 'share', target: 'a' },
	{ kind: 'share', target: ['b'] },
	{ kind: 'sideshow' },
	{ kind: 'sideshow', accept: true },
	{ kind: 'sideshow-answer' },
	{ kind: 'sideshow-answer', accept: 'yes' },
	{ kind: 'sideshow-answer', accept: true },
	{ kind: 'faceoff' },
	{ kind: 'faceoff', target: 'zz' },
	{ kind: 'faceoff', target: ['b'] },
	{ kind: 'open', index: '0' },
	{ kind: 'open', index: 1e9 },
	{ kind: 'line', line: 8 },
	{ kind: 'joker', indexes: 'ab' },
	{ kind: 'joker', indexes: [0] },
	{ kind: 'joker', indexes: [0, 0] },
	{ kind: 'joker', indexes: [-1, 1e9] },
	{ declare: 'sideways' },
	{ declare: ['high'] },
	{ amount: 'lots' },
	{ amount: -10 },
	{ amount: Number.MAX_SAFE_INTEGER + 2 },
	{ index: 'x' },
	{ kind: 'draw'.repeat(5000) }
];
// A message like these means the code tripped over the input instead of judging it.
const CRASH = /undefined|null|NaN|Cannot read|is not a function|is not iterable|not defined|Invalid array length/i;

function start(rulesVersion, seed) {
	let room = newRoom('fuzz-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
	for (const id of ids) room = transition(room, id, 'join', { username: id }, ctx);
	const random = rng(seed);
	const deck = freshDeck();
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	const variant = getVariant(rulesVersion);
	return transition(
		room,
		'a',
		'start',
		{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion },
		{ ...ctx, deck, handId: `fuzz-${seed}` }
	);
}

/** Try one hostile move; it is either refused cleanly or leaves a sound table. */
function attempt(room, id, action, payload, label) {
	const before = JSON.stringify(room);
	let next;
	try {
		next = transition(room, id, action, payload, ctx);
	} catch (error) {
		assert.ok(error instanceof Error, `${label}: threw a non-error`);
		assert.ok(
			!CRASH.test(String(error.message)),
			`${label}: crashed instead of refusing (${error.message})`
		);
		assert.equal(JSON.stringify(room), before, `${label}: a refused move changed the table`);
		return room;
	}
	invariant(next);
	assert.equal(
		next.players.reduce((sum, p) => sum + p.balance, next.pot),
		next.issuedChips,
		`${label}: accepted a move that broke the chips`
	);
	return next;
}

/** Versions no longer on offer that saved hands, lineups and replays can still name. */
const SAVED_VERSIONS = ['buying-joker-1', 'auction-1', 'folding-joker-1', 'side-show-1'];
for (const variant of [...listVariants(), ...SAVED_VERSIONS.map((v) => getVariant(v))])
	test(`Hostile input: ${variant.name} (${variant.rulesVersion}) is refused cleanly`, () => {
		const rulesVersion = variant.rulesVersion;
		for (let seed = 1; seed <= 4; seed++) {
			const random = rng(seed * 977);
			let room = start(rulesVersion, seed);
			for (let step = 0; step < 40 && playing(room); step++) {
				// A burst of nonsense from every seat, whoever's turn it is.
				for (const id of ids) {
					for (let n = 0; n < 6; n++) {
						const action = pick(random, ['table', 'table', 'table', 'show', 'bet', 'discard', 'see']);
						const payload = pick(random, GARBAGE);
						attempt(room, id, action, payload, `${rulesVersion} ${id} ${action} ${JSON.stringify(payload)?.slice(0, 60)}`);
					}
				}
				// A side show that garbage happened to open is answered, so the hand can go on.
				if (room.sideShow) {
					room = transition(room, room.sideShow.to, 'table', { kind: 'sideshow-answer', accept: random() < 0.5 }, ctx);
					continue;
				}
				// Then one honest move, so the fuzzing reaches later states of the hand.
				const actor = room.currentPlayerId;
				const legal = projection(room, actor, connected).legalActions;
				const moves = [];
				if (legal.table?.length) moves.push(['table', pick(random, legal.table)]);
				if (legal.see) moves.push(['see', {}]);
				if (legal.bet) moves.push(['bet', { amount: legal.minBet }]);
				if (legal.pack) moves.push(['pack', {}]);
				const [action, payload] = pick(random, moves);
				room = transition(room, actor, action, payload, ctx);
			}
		}
	});

test('Hostile input in the lobby and after the hand never crashes the engine', () => {
	for (const variant of listVariants()) {
		let room = start(variant.rulesVersion, 3);
		while (playing(room)) room = transition(room, room.currentPlayerId, 'pack', {}, ctx);
		for (const id of ids)
			for (const payload of GARBAGE)
				for (const action of ['table', 'show', 'bet', 'discard', 'see', 'reveal'])
					attempt(room, id, action, payload, `${variant.rulesVersion} after hand ${action}`);
	}
});
