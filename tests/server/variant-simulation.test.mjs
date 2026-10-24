import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { listVariants, getVariant } from '../../server/variants/index.mjs';
import { newRoom, transition, projection, invariant, playing } from '../../server/engine.mjs';

/**
 * Plays thousands of random but legal hands for every variant and table size, the
 * way real players click. Every step must keep chips conserved, never leak a hidden
 * card, keep the advertised legal actions honest, and end each hand with a winner.
 */

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
function shuffled(random) {
	const deck = freshDeck();
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

/** Versions no longer on offer that saved hands, lineups and replays can still name. */
const SAVED_VERSIONS = [
	'buying-joker-1',
	'auction-1',
	'folding-joker-1',
	'side-show-1',
	'folding-joker-2',
	'discard-one-1',
	'best-of-five-1',
	'muflis-4-1',
	'joker-4-1',
	'lowest-joker-4-1',
	'highest-joker-4-1',
	'color-joker-4-1'
];
const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
let forcedShows = 0;
const sideShows = { asked: 0, accepted: 0, declined: 0, timedOut: 0, shared: 0 };

function assertNoLeaks(room, connected) {
	// Hands compared at a Show, and hands shown on purpose (or knocked out in Running).
	const reveal = new Set([...(room.result?.revealedPlayerIds ?? []), ...(room.shownIds ?? [])]);
	for (const viewer of room.players.filter((p) => p.seatNumber !== null && !p.departed)) {
		const view = projection(room, viewer.id, connected);
		for (const user of view.usersList) {
			const owner = room.players.find((p) => p.id === user.id);
			const visible =
				(owner.id === viewer.id && !owner.isBlind) ||
				reveal.has(owner.id) ||
				!!room.sharedCards?.[owner.id]?.includes(viewer.id);
			assert.equal(user.cardsInHand.length, owner.cards.length);
			if (visible) {
				assert.deepEqual(user.cardsInHand, owner.cards);
				if (owner.cards.length)
					assert.equal(typeof user.handName, 'string', `${room.rulesVersion} names visible hands`);
			} else {
				assert.ok(
					user.cardsInHand.every((card) => card.rank === 0 && card.suit === ''),
					'hidden card leaked'
				);
				assert.equal(user.handName, undefined, 'hidden hand name leaked');
				assert.equal(user.wildCards, undefined, 'hidden joker positions leaked');
			}
		}
	}
}

const cardKey = (card) => `${card.rank}:${card.suit}`;
/** Every real card (rank above zero) found anywhere inside a value. */
function cardsIn(value, found = new Set()) {
	if (Array.isArray(value)) for (const item of value) cardsIn(item, found);
	else if (value && typeof value === 'object') {
		if (Number.isInteger(value.rank) && value.rank > 0 && typeof value.suit === 'string')
			found.add(cardKey(value));
		for (const item of Object.values(value)) cardsIn(item, found);
	}
	return found;
}
/** Games where a packed player's cards become public on purpose. */
const HANDS_BECOME_PUBLIC = new Set(['rotating-joker-1']);

/**
 * What each game that keeps a secret may show a viewer, stated from the rules, not from what the
 * projection happens to hide. (A projection that forgot to hide something would otherwise look fine.)
 */
const auctionRule = (raw, shown, viewer, reveal) =>
	assert.equal(
		shown.rank,
		raw.done && raw.winner && (viewer === raw.winner || reveal.has(raw.winner)) ? raw.rank : null,
		'auction joker rank'
	);
const SECRET_RULES = {
	'community-1': (raw, shown) => {
		assert.equal(shown.community.length, raw.community.length);
		shown.community.forEach((card, i) =>
			assert.deepEqual(card, i < raw.opened ? raw.community[i] : { rank: 0, suit: '' }, 'community card')
		);
	},
	'progressive-joker-1': (raw, shown) => {
		if (raw.stage === 0) assert.deepEqual(shown.indicator, { rank: 0, suit: '' }, 'indicator shown early');
		else assert.deepEqual(shown.indicator, raw.indicator);
	},
	'running-1': (raw, shown) =>
		shown.table.forEach((card, i) =>
			assert.deepEqual(card, i < raw.opened ? raw.table[i] : { rank: 0, suit: '' }, 'running card')
		),
	'buying-joker-1': (raw, shown, viewer) =>
		assert.equal(shown.rank, raw.bought[viewer] ? raw.rank : null, 'joker rank'),
	'buying-joker-2': (raw, shown, viewer) =>
		assert.equal(shown.rank, raw.bought[viewer] ? raw.rank : null, 'joker rank'),
	'auction-1': (raw, shown, viewer, reveal) => auctionRule(raw, shown, viewer, reveal),
	'auction-2': (raw, shown, viewer, reveal) => auctionRule(raw, shown, viewer, reveal),
	'chatai-1': (raw, shown) =>
		shown.mat.forEach((card, i) => {
			if (!raw.open[i]) assert.deepEqual(card, { rank: 0, suit: '' }, 'closed mat card');
		})
};

/**
 * Whatever a viewer is not meant to see must not appear anywhere in their projection: not in the
 * hands, not in the open cards, not in the variant's public state, not in the result or proof.
 * Secret cards are the other players' hidden cards (a seat's own hand too while it plays blind),
 * minus the cards the game lies face up, plus table cards the server holds back.
 */
function assertNoDeepLeaks(room, connected) {
	const reveal = new Set([...(room.result?.revealedPlayerIds ?? []), ...(room.shownIds ?? [])]);
	const variant = getVariant(room.rulesVersion);
	const open = variant.openCount?.(room.variantState) ?? 0;
	const rawState = cardsIn(room.variantState ?? {});
	for (const viewer of room.players.filter((p) => p.seatNumber !== null && !p.departed)) {
		const view = projection(room, viewer.id, connected);
		const shownState = cardsIn(view.variantState ?? {});
		const secret = new Set();
		for (const owner of room.players) {
			if (
				(owner.id === viewer.id && !owner.isBlind) ||
				reveal.has(owner.id) ||
				room.sharedCards?.[owner.id]?.includes(viewer.id)
			)
				continue;
			owner.cards.forEach((card, index) => {
				if (index >= open) secret.add(cardKey(card));
			});
		}
		for (const key of rawState) if (!shownState.has(key)) secret.add(key);
		// Throw games: a thrown card is face up for everyone, even a folded one still held.
		for (const entry of room.variantState?.throws ?? []) secret.delete(cardKey(entry.card));
		if (room.variantState?.throws)
			assert.deepEqual(view.variantState.throws, room.variantState.throws, 'every throw is public');
		SECRET_RULES[room.rulesVersion]?.(room.variantState, view.variantState, viewer.id, reveal);
		const { variantState, ...rest } = view;
		const found = cardsIn(rest);
		for (const key of found)
			assert.ok(!secret.has(key), `${room.rulesVersion}: ${viewer.id} can see secret card ${key}`);
		if (!HANDS_BECOME_PUBLIC.has(room.rulesVersion))
			for (const key of cardsIn(variantState ?? {}))
				assert.ok(
					!secret.has(key),
					`${room.rulesVersion}: ${viewer.id} sees secret card ${key} in the table state`
				);
		// Open cards: exactly the leading cards of a hand that is not otherwise visible.
		for (const user of view.usersList) {
			const owner = room.players.find((p) => p.id === user.id);
			const seen =
				(owner.id === viewer.id && !owner.isBlind) ||
				reveal.has(owner.id) ||
				!!room.sharedCards?.[owner.id]?.includes(viewer.id);
			if (user.openCards !== undefined) {
				assert.ok(!seen, 'open cards are only sent for hands that are not already visible');
				assert.equal(user.openCards.length, Math.min(open, owner.cards.length));
				user.openCards.forEach((entry, i) => {
					assert.equal(entry.index, i);
					assert.deepEqual(entry.card, owner.cards[i]);
				});
			} else if (open > 0 && owner.cards.length && !seen)
				assert.fail(`${room.rulesVersion}: open cards missing for ${user.id}`);
		}
	}
}

/**
 * The server only advertises moves that work: try every advertised table move, Faceoff target,
 * Show call, bet, pack and look, from every seat that is offered it. None may throw, and each
 * must leave the table consistent (chips conserved, nothing leaked).
 */
function assertAdvertisedMovesWork(room, connected, now, issued) {
	const ctx = { now, turnMs: 60000, connected };
	const attempts = [];
	for (const p of room.players.filter((q) => q.seatNumber !== null && !q.departed)) {
		const legal = projection(room, p.id, connected).legalActions;
		for (const move of legal.table ?? []) attempts.push([p.id, 'table', move]);
		if (legal.sideShow) attempts.push([p.id, 'table', { kind: 'sideshow' }]);
		for (const target of legal.share ?? []) attempts.push([p.id, 'table', { kind: 'share', target }]);
		if (legal.sideShowAnswer)
			for (const accept of [true, false])
				attempts.push([p.id, 'table', { kind: 'sideshow-answer', accept }]);
		for (const target of legal.faceoff ?? [])
			attempts.push([p.id, 'table', { kind: 'faceoff', target }]);
		if (legal.show) for (const declare of ['high', 'low']) attempts.push([p.id, 'show', { declare }]);
		if (legal.bet) {
			attempts.push([p.id, 'bet', { amount: legal.minBet }]);
			attempts.push([p.id, 'bet', { amount: legal.maxBet }]);
		}
		if (legal.pack) attempts.push([p.id, 'pack', {}]);
		if (legal.see) attempts.push([p.id, 'see', {}]);
		if (legal.discard)
			attempts.push([p.id, 'discard', { index: 0 }]);
	}
	for (const [id, action, payload] of attempts) {
		let next;
		try {
			next = transition(room, id, action, payload, ctx);
		} catch (error) {
			// A discard of a card the player must keep is refused by design (their made joker).
			if (action === 'discard' && /Keep your joker/.test(error.message)) continue;
			assert.fail(
				`${room.rulesVersion}: advertised ${action} ${JSON.stringify(payload)} by ${id} was refused: ${error.message}`
			);
		}
		invariant(next);
		assert.equal(
			next.players.reduce((sum, q) => sum + q.balance, next.pot),
			issued
		);
	}
}

/** Choose what a real player could click right now, using only what the server advertises. */
function chooseAction(room, connected, random) {
	const actorId = room.currentPlayerId;
	// A side show is waiting: the turn is on hold, so the one asked answers or the clock runs out.
	if (room.sideShow)
		return random() < 0.1
			? [actorId, 'timeout', {}]
			: [room.sideShow.to, 'table', { kind: 'sideshow-answer', accept: random() < 0.5 }];
	const view = projection(room, actorId, connected);
	const legal = view.legalActions;
	const me = view.usersList.find((user) => user.id === actorId);
	const options = [];
	// Table moves (open a mat card, lock a line, make a joker) come up often; take most of them.
	if (legal.table?.length && random() < 0.7) return [actorId, 'table', pick(random, legal.table)];
	if (legal.sideShow && random() < 0.3) return [actorId, 'table', { kind: 'sideshow' }];
	if (legal.share?.length && random() < 0.2)
		return [actorId, 'table', { kind: 'share', target: pick(random, legal.share) }];
	// Faceoff is an engine move, advertised apart from the table options.
	if (legal.faceoff?.length && random() < 0.2)
		return [actorId, 'table', { kind: 'faceoff', target: pick(random, legal.faceoff) }];
	if (legal.see) options.push(['see', {}], ['see', {}]);
	if (legal.discard) {
		// Any card but a joker the player made.
		const keep = new Set(room.variantState?.jokers ? (me.wildCards ?? []) : []);
		const throwable = me.cardsInHand.flatMap((_, i) => (keep.has(i) ? [] : [i]));
		return [actorId, 'discard', { index: pick(random, throwable) }];
	}
	if (legal.bet) {
		options.push(
			['bet', { amount: legal.minBet }],
			['bet', { amount: legal.minBet }],
			['bet', { amount: legal.minBet }]
		);
		if (legal.maxBet > legal.minBet) options.push(['bet', { amount: legal.maxBet }]);
	}
	if (legal.show) options.push(['show', { declare: 'high' }], ['show', { declare: 'low' }]);
	if (legal.pack) options.push(['pack', {}]);
	if (random() < 0.03) return [actorId, 'timeout', {}];
	assert.ok(options.length, `${room.rulesVersion}: current player has no legal action`);
	const [action, payload] = pick(random, options);
	return [actorId, action, payload];
}

/**
 * `thorough` sessions run the expensive checks (deep leak scan, every advertised move) at every
 * step; the rest sample them, so the whole suite stays quick while every game and table size is
 * still covered thoroughly.
 */
function playSession(game, playerCount, seed, thorough = false) {
	// A night: a list of games, one hand each, on the same table.
	const versions = Array.isArray(game) ? game : null;
	const random = rng(seed);
	const connected = new Set(ids.slice(0, playerCount));
	let now = 1_000;
	// Every session also picks a pot limit (including off) so forced Shows get exercised.
	const potLimit = [0, 64, 128, 256, 512][seed % 5];
	let room = newRoom('sim-room', 1000, 'p0', 'classic-1', { boot: 10, autoReady: true, potLimit });
	for (const id of ids.slice(0, playerCount))
		room = transition(room, id, 'join', { username: id }, { now, turnMs: 60000, connected });
	let issued = room.issuedChips;
	let hands = 0;
	for (let hand = 0; hand < (versions?.length ?? 6); hand++) {
		const rulesVersion = versions ? versions[hand] : game;
		const variant = getVariant(rulesVersion);
		if (versions) {
			// A night is about the games, not the stacks: everyone sits back down with a full stack.
			for (const p of room.players) {
				room.issuedChips += 1000 - p.balance;
				p.balance = 1000;
				p.ready = true;
				p.handBet = 0;
			}
			issued = room.issuedChips;
		}
		const able = room.players.filter((p) => p.balance >= 10 && p.ready !== false);
		if (able.length < 2) break;
		room = transition(
			room,
			room.hostId,
			'start',
			{ cutAt: Math.floor(random() * 20), cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion },
			{
				now,
				turnMs: 60000,
				connected,
				handId: `hand-${seed}-${hand}`,
				deck: shuffled(random),
				requireReady: true
			}
		);
		hands++;
		assert.ok(playing(room));
		assertNoLeaks(room, connected);
		assertNoDeepLeaks(room, connected);
		assertAdvertisedMovesWork(room, connected, now, issued);
		let steps = 0;
		while (playing(room)) {
			assert.ok(++steps < 600, `${rulesVersion}: hand did not finish`);
			// Players who are not on turn may look at their cards, or make a table move, at any time.
			for (const p of room.players) {
				if (p.id === room.currentPlayerId || !playing(room)) continue;
				const legal = projection(room, p.id, connected).legalActions;
				if (random() < 0.08 && legal.see)
					room = transition(room, p.id, 'see', {}, { now, turnMs: 60000, connected });
				else if (legal.share?.length && random() < 0.3)
					room = transition(room, p.id, 'table', { kind: 'share', target: pick(random, legal.share) }, { now, turnMs: 60000, connected });
				else if (legal.table?.length && random() < 0.5)
					room = transition(room, p.id, 'table', pick(random, legal.table), {
						now,
						turnMs: 60000,
						connected
					});
			}
			if (!playing(room)) break;
			const [actor, action, payload] = chooseAction(room, connected, random);
			if (action === 'timeout') now = room.deadline;
			const before = JSON.stringify(room);
			if (payload?.kind === 'share') sideShows.shared++;
			if (payload?.kind === 'sideshow') sideShows.asked++;
			else if (payload?.kind === 'sideshow-answer') sideShows[payload.accept ? 'accepted' : 'declined']++;
			else if (action === 'timeout' && room.sideShow) sideShows.timedOut++;
			room = transition(room, actor, action, payload, { now, turnMs: 60000, connected });
			assert.notEqual(JSON.stringify(room), before, `${rulesVersion}: ${action} changed nothing`);
			invariant(room);
			assert.equal(
				room.players.reduce((sum, p) => sum + p.balance, room.pot),
				issued
			);
			assertNoLeaks(room, connected);
			if (thorough || steps % 5 === 0) assertNoDeepLeaks(room, connected);
			if (thorough ? steps % 4 === 0 : steps % 25 === 0)
				assertAdvertisedMovesWork(room, connected, now, issued);
			now += 1000;
		}
		assert.ok(room.result, 'every hand ends with a result');
		assert.equal(room.pot, 0);
		assert.ok(room.players.some((p) => p.id === room.result.winnerId));
		if (room.result.reason.startsWith('show'))
			assert.equal(room.result.revealedPlayerIds.length, 2);
		if (room.result.reason.startsWith('pot-limit')) {
			forcedShows++;
			assert.ok(room.result.amount >= potLimit * 10, 'forced Show only at the limit');
			assert.ok(room.result.revealedPlayerIds.length >= 2);
			if (room.result.winners)
				assert.equal(
					room.result.winners.reduce((sum, w) => sum + w.amount, 0),
					room.result.amount
				);
		}
		// Occasionally someone sits out the next hand, then comes back.
		const sitter = pick(random, room.players);
		room = transition(
			room,
			sitter.id,
			'ready',
			{ ready: random() < 0.75 },
			{ now, turnMs: 60000, connected }
		);
	}
	return hands;
}

for (const variant of [...listVariants(), ...SAVED_VERSIONS.map((v) => getVariant(v))])
	test(`Random legal play: ${variant.name} (${variant.rulesVersion}) on 2–6 player tables`, () => {
		let hands = 0;
		for (let players = 2; players <= 6; players++)
			for (let seed = 1; seed <= 12; seed++)
				hands += playSession(variant.rulesVersion, players, seed * 7919 + players * 104729, seed <= 3);
		assert.ok(hands > 200, `${variant.rulesVersion} played ${hands} hands`);
	});

test('A night through every game on one table stays consistent from hand to hand', () => {
	const every = listVariants().map((variant) => variant.rulesVersion);
	for (const seed of [11, 29, 47]) {
		const random = rng(seed);
		const order = [...every];
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		for (const players of [3, 5]) {
			const hands = playSession(order, players, seed * 31 + players, true);
			// A player may run out of chips and end the night early; most of the games must be played.
			assert.ok(hands >= every.length - 12, `night ${seed}/${players}: only ${hands} hands`);
		}
	}
});

test('Illegal actions are refused without changing the table, in every variant', () => {
	const connected = new Set(['a', 'b', 'c']);
	const ctx = { now: 1000, turnMs: 60000, connected };
	for (const variant of listVariants()) {
		let room = newRoom('illegal-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
		for (const id of ['a', 'b', 'c']) room = transition(room, id, 'join', { username: id }, ctx);
		room = transition(
			room,
			'a',
			'start',
			{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion: variant.rulesVersion },
			{ ...ctx, deck: freshDeck(), handId: 'x' }
		);
		const before = JSON.stringify(room);
		const notTurn = room.players.find((p) => p.id !== room.currentPlayerId).id;
		const attempts = [
			[notTurn, 'bet', { amount: 10 }],
			[room.currentPlayerId, 'bet', { amount: 5 }],
			[room.currentPlayerId, 'bet', { amount: 21 }],
			[room.currentPlayerId, 'bet', { amount: 10.5 }],
			[room.currentPlayerId, 'show', { declare: 'high' }],
			[room.currentPlayerId, 'discard', { index: 0 }],
			[room.currentPlayerId, 'timeout', {}],
			['a', 'start', { cutAt: 0, cardsToDeal: 3 }],
			['zz', 'see', {}]
		];
		for (const [id, action, payload] of attempts)
			assert.throws(
				() => transition(room, id, action, payload, ctx),
				undefined,
				`${variant.rulesVersion} ${action}`
			);
		assert.equal(JSON.stringify(room), before, variant.rulesVersion);
	}
});

test('The simulation actually asked for, accepted, declined and timed out side shows', () => {
	assert.ok(sideShows.asked > 20, `asked: ${sideShows.asked}`);
	assert.ok(sideShows.accepted > 5, `accepted: ${sideShows.accepted}`);
	assert.ok(sideShows.declined > 5, `declined: ${sideShows.declined}`);
	assert.ok(sideShows.timedOut > 0, `timed out: ${sideShows.timedOut}`);
	assert.ok(sideShows.shared > 10, `cards shown to friends: ${sideShows.shared}`);
});

test('The simulation actually reached pot limits and forced Shows', () => {
	assert.ok(forcedShows > 20, `forced Shows: ${forcedShows}`);
});
