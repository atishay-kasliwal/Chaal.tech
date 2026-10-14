import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { getVariant } from '../../server/variants/index.mjs';
import { newRoom, transition, projection, invariant, movements } from '../../server/engine.mjs';

for (const initial of ['classic-1', 'muflis-1'])
	test(`Host can switch from ${initial} only at the next hand start without resetting seats or chips`, () => {
		const next = initial === 'classic-1' ? 'muflis-1' : 'classic-1';
		const ctx = {
			now: 1000,
			turnMs: 60000,
			handId: 'first',
			deck: freshDeck(),
			connected: new Set(['a', 'b'])
		};
		let room = newRoom('switch-room', 50, 'a', initial);
		for (const id of ctx.connected) room = transition(room, id, 'join', { username: id }, ctx);
		room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3 }, ctx);
		const start = { cutAt: 0, cardsToDeal: 3, rulesVersion: next };
		assert.throws(() => transition(room, 'a', 'start', start, ctx));
		assert.equal(room.rulesVersion, initial);
		room = transition(room, 'b', 'pack', {}, ctx);
		const before = structuredClone(room),
			identities = room.players.map((p) => [p.id, p.seatNumber]);
		assert.throws(
			() => transition(room, 'b', 'start', start, ctx),
			(error) => error.code === 'FORBIDDEN'
		);
		for (const invalid of [null, {}, 'muflis-2'])
			assert.throws(
				() => transition(room, 'a', 'start', { ...start, rulesVersion: invalid }, ctx),
				(error) => error.code === 'UNSUPPORTED_RULES'
			);
		assert.deepEqual(room, before);
		room = transition(room, 'a', 'start', start, { ...ctx, handId: 'second' });
		assert.equal(room.rulesVersion, next);
		assert.equal(room.handId, 'second');
		assert.deepEqual(
			room.players.map((p) => [p.id, p.seatNumber]),
			identities
		);
		assert.deepEqual(
			room.players.map((p) => p.balance),
			before.players.map((p) => p.balance - 1)
		);
		assert.equal(room.issuedChips, before.issuedChips);
		assert.equal(room.pot, 2);
		invariant(room);
	});

const classic = getVariant('classic-1'),
	muflis = getVariant('muflis-1');
const cards = (ranks, flush = false) =>
	ranks.map((rank, i) => ({ rank, suit: flush ? 'hearts' : ['hearts', 'spades', 'clubs'][i] }));

test('Muflis explicitly reverses category order, ranks, kickers and Classic ace/sequence order', () => {
	const strongestToWeakest = [
		cards([5, 3, 2]),
		cards([2, 2, 3]),
		cards([5, 3, 2], true),
		cards([4, 3, 2]),
		cards([4, 3, 2], true),
		cards([2, 2, 2])
	];
	for (let i = 0; i < strongestToWeakest.length - 1; i++)
		assert.equal(muflis.compareHands(strongestToWeakest[i], strongestToWeakest[i + 1]), 1);
	for (const [better, worse] of [
		[cards([5, 3, 2]), cards([5, 4, 2])],
		[cards([13, 7, 2]), cards([14, 7, 2])],
		[cards([2, 2, 3]), cards([2, 2, 4])],
		[cards([2, 2, 14]), cards([3, 3, 2])],
		[cards([13, 12, 11]), cards([14, 3, 2])],
		[cards([14, 3, 2]), cards([14, 13, 12])],
		[cards([5, 3, 2], true), cards([5, 4, 2], true)],
		[cards([2, 2, 2]), cards([14, 14, 14])]
	])
		assert.equal(muflis.compareHands(better, worse), 1);
	assert.equal(
		muflis.compareHands(
			cards([5, 3, 2]),
			cards([5, 3, 2]).map((c) => ({ ...c, suit: c.suit === 'hearts' ? 'diamonds' : c.suit }))
		),
		0
	);
	assert.equal(Object.is(muflis.compareHands(cards([5, 3, 2]), cards([5, 3, 2])), -0), false);
	assert.throws(() => {
		muflis.getRules().rankingOrder.reverse();
	}, TypeError);
	assert.equal(muflis.version, 1);
});

test('All 22,100 Muflis vectors and 132,600 anchor comparisons are the exact Classic inverse', () => {
	const deck = freshDeck();
	const anchors = [
		cards([14, 14, 14]),
		cards([14, 13, 12], true),
		cards([14, 3, 2]),
		cards([14, 10, 4], true),
		cards([10, 10, 4]),
		cards([5, 3, 2])
	];
	let count = 0;
	for (let a = 0; a < 50; a++)
		for (let b = a + 1; b < 51; b++)
			for (let c = b + 1; c < 52; c++) {
				const hand = [deck[a], deck[b], deck[c]],
					original = JSON.stringify(hand);
				assert.deepEqual(
					muflis.evaluateHand(hand),
					classic.evaluateHand(hand).map((n) => (n === 0 ? 0 : -n))
				);
				for (const anchor of anchors) {
					const expected = classic.compareHands(hand, anchor);
					assert.equal(muflis.compareHands(hand, anchor), expected === 0 ? 0 : -expected);
				}
				assert.equal(JSON.stringify(hand), original);
				count++;
			}
	assert.equal(count, 22100);
	for (const invalid of [[], cards([2, 3]), [deck[0], deck[0], deck[2]], cards([15, 3, 2])]) {
		assert.throws(() => muflis.evaluateHand(invalid));
		assert.throws(() => muflis.compareHands(invalid, anchors[0]));
	}
});

for (let count = 2; count <= 6; count++)
	test(`${count} players use identical shared infrastructure for all three-card variants`, () => {
		const ids = Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
		const ctx = {
			now: 1000,
			turnMs: 60000,
			handId: 'same-hand',
			deck: freshDeck(),
			connected: new Set(ids)
		};
		const games = ['classic-1', 'muflis-1', 'ak47-1', 'joker-1', 'lowest-joker-1', '999-1'].map(
			(version) => newRoom('same-room', 50, 'a', version)
		);
		const normalize = (value) => {
			const visit = (item) => {
				if (Array.isArray(item)) return item.map(visit);
				if (!item || typeof item !== 'object') return item;
				const result = {};
				for (const [key, child] of Object.entries(item)) {
					if (key === 'deck' || key === 'variantState') continue;
					result[key] = key === 'rulesVersion' ? 'normalized' : visit(child);
				}
				return result;
			};
			return visit(JSON.parse(JSON.stringify(value)));
		};
		const act = (actor, action, payload = {}) => {
			const ledgers = games.map((before, i) => {
				games[i] = transition(before, actor, action, payload, ctx);
				invariant(games[i]);
				return movements(before, games[i], action);
			});
			for (let i = 1; i < games.length; i++) {
				assert.deepEqual(normalize(games[0]), normalize(games[i]));
				assert.deepEqual(ledgers[0], ledgers[i]);
			}
			for (const id of ids.filter((id) => games[0].players.some((p) => p.id === id)))
				for (let i = 1; i < games.length; i++)
					assert.deepEqual(
						normalize(projection(games[0], id, ctx.connected)),
						normalize(projection(games[i], id, ctx.connected))
					);
		};
		for (const id of ids) act(id, 'join', { username: id });
		act('a', 'start', { cutAt: 0, cardsToDeal: 3 });
		act('a', 'see');
		act('b', 'bet', { amount: 1 });
		while (!games[0].gameShow) act(games[0].currentPlayerId, 'pack');
		assert.equal(games[1].result.reason, 'last-player');
	});

test('Muflis equal Show hands still lose for requester and folded hands remain hidden', () => {
	const ctx = {
		now: 1000,
		turnMs: 60000,
		handId: 'tie',
		deck: freshDeck(),
		connected: new Set(['a', 'b', 'c'])
	};
	let room = newRoom('tie-room', 50, 'a', 'muflis-1');
	for (const id of ctx.connected) room = transition(room, id, 'join', { username: id }, ctx);
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3 }, ctx);
	room = transition(room, 'b', 'pack', {}, ctx);
	room.players[0].cards = cards([5, 3, 2]);
	room.players[2].cards = cards([5, 3, 2]).map((c) => ({
		...c,
		suit: c.suit === 'hearts' ? 'diamonds' : c.suit
	}));
	room = transition(room, 'c', 'show', {}, ctx);
	assert.equal(room.result.winnerId, 'a');
	assert.equal(room.result.reason, 'show-tie-requester-loses');
	assert.ok(
		projection(room, 'a', ctx.connected)
			.usersList.find((p) => p.id === 'b')
			.cardsInHand.every((c) => c.rank === 0)
	);
	invariant(room);
});

test('Room creation validates its version and only host start can select rules for a new hand', () => {
	for (const invalid of [null, {}, ['muflis-1'], '', 'muflis', 'muflis-2', '__proto__'])
		assert.throws(
			() => newRoom('bad-room', 50, 'a', invalid),
			(error) => error.code === 'UNSUPPORTED_RULES'
		);
	assert.equal(newRoom('old-room', 50, 'a').rulesVersion, 'classic-1');
	const ctx = {
		now: 1000,
		turnMs: 60000,
		handId: 'pinned',
		deck: freshDeck(),
		connected: new Set(['a', 'b'])
	};
	let room = newRoom('fixed-room', 50, 'a', 'muflis-1');
	for (const id of ctx.connected)
		room = transition(room, id, 'join', { username: id, rulesVersion: 'classic-1' }, ctx);
	room = transition(room, 'a', 'start', { cutAt: 0, cardsToDeal: 3 }, ctx);
	assert.equal(room.rulesVersion, 'muflis-1');
	assert.throws(() => transition(room, 'a', 'setVariant', { rulesVersion: 'classic-1' }, ctx));
	assert.equal(room.rulesVersion, 'muflis-1');
});
