import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { newRoom, transition, projection } from '../../server/engine.mjs';
import { listVariants } from '../../server/variants/index.mjs';
import { describeHand, describeKeep, wildIndexes } from '../../server/variants/describe.mjs';
import { compareVectors } from '../../server/variants/hand-utils.mjs';

/**
 * Four-card (and Kiss-Miss-Bliss) games: before you throw a card away, the hand name and joker
 * stars must describe the best cards you could keep, not just the first three dealt.
 */

const S = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
const R = { A: 14, K: 13, Q: 12, J: 11 };
const c = (t) => ({ rank: R[t.slice(0, -1)] ?? Number(t.slice(0, -1)), suit: S[t.slice(-1)] });

const discardGames = listVariants().filter(
	(variant) => Number.isInteger(variant.discardTo) && !variant.foldsToEnd
);

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
/** Every way to keep `keep` cards: the kept cards and their positions in the hand. */
function keeps(cards, keep) {
	const out = [];
	const walk = (start, picked) => {
		if (picked.length === keep) return void out.push(picked);
		for (let i = start; i < cards.length; i++) walk(i + 1, [...picked, i]);
	};
	walk(0, []);
	return out;
}

test('Lowest Joker 4: the joker is the lowest of the three you would keep, not of the first three dealt', () => {
	const variant = listVariants().find((v) => v.rulesVersion === 'lowest-joker-4-1');
	// First three dealt (K 9 A) would make the 9 the joker for a Sequence. Keeping K A A makes a
	// Trail of Aces: that is what the table must show.
	const hand = ['K♠', '9♦', 'A♥', 'A♣'].map(c);
	const keep = describeKeep(variant, hand);
	assert.equal(keep.handName, 'Best three: Trail of Aces (with joker)');
	const kept = keeps(hand, 3).find((picked) => keep.wildCards.every((i) => picked.includes(i)));
	assert.ok(kept, 'the starred card is part of a best keep');
	// A hand with A, K, A and a low card: the low card is the lowest you keep.
	const low = describeKeep(variant, ['A♠', 'K♦', 'A♥', '4♣'].map(c));
	assert.match(low.handName, /Trail of Aces/);
});

for (const variant of discardGames)
	test(`${variant.name}: before throwing away, the name and stars match the best cards to keep`, () => {
		const random = rng(variant.rulesVersion.length * 7919);
		for (let round = 0; round < 250; round++) {
			const deck = shuffled(random);
			const hand = deck.slice(0, variant.cardsPerPlayer);
			const state = variant.prepareHand
				? variant.prepareHand({ remainingDeck: deck.slice(variant.cardsPerPlayer) }).state
				: undefined;
			const handState = variant.stateFor ? variant.stateFor(state, 'p') : state;
			const preview = describeKeep(variant, hand, handState);
			// Brute force: the best score over every possible set of cards to keep.
			let best = null;
			for (const picked of keeps(hand, variant.discardTo)) {
				const score = variant.evaluateHand(
					picked.map((i) => hand[i]),
					handState
				);
				if (!best || compareVectors(score, best.score) > 0) best = { score, picks: [picked] };
				else if (compareVectors(score, best.score) === 0) best.picks.push(picked);
			}
			const bestName = describeHand(
				variant,
				best.picks[0].map((i) => hand[i]),
				handState
			);
			assert.equal(
				preview.handName,
				`Best three: ${bestName}`,
				`${variant.rulesVersion} ${JSON.stringify(hand)}`
			);
			// The stars sit on the jokers of one of the best keeps.
			assert.ok(
				best.picks.some((picked) => {
					const wild = wildIndexes(
						variant,
						picked.map((i) => hand[i]),
						handState
					).map((i) => picked[i]);
					return (
						wild.length === preview.wildCards.length &&
						wild.every((i) => preview.wildCards.includes(i))
					);
				}),
				`${variant.rulesVersion} stars ${preview.wildCards} on ${JSON.stringify(hand)}`
			);
		}
	});

test('At the table: a seen four-card hand shows the best keep; after the throw, the real hand', () => {
	const connected = new Set(['a', 'b']);
	const ctx = { now: 1000, turnMs: 90000, connected };
	for (const variant of discardGames) {
		const random = rng(variant.rulesVersion.length * 104729);
		for (let round = 0; round < 40; round++) {
			let room = newRoom('keep-room', 1000, 'a', 'classic-1', { boot: 10, autoReady: true });
			for (const id of ['a', 'b']) room = transition(room, id, 'join', { username: id }, ctx);
			room = transition(
				room,
				'a',
				'start',
				{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer, rulesVersion: variant.rulesVersion },
				{ ...ctx, deck: shuffled(random), handId: `h${round}` }
			);
			room = transition(room, 'a', 'see', {}, ctx);
			const me = () => projection(room, 'a', connected).usersList.find((u) => u.id === 'a');
			const before = me();
			assert.match(before.handName, /^Best three: /, variant.rulesVersion);
			// Throw away cards outside the starred best keep until three are left, then the name
			// is the real hand and matches what was promised.
			const promised = before.handName.replace('Best three: ', '');
			while (projection(room, 'a', connected).legalActions.discard) {
				const view = me();
				const hand = room.players.find((p) => p.id === 'a').cards;
				const handState = variant.stateFor
					? variant.stateFor(room.variantState, 'a')
					: room.variantState;
				// The card whose removal keeps the best score.
				let throwAt = -1;
				let top = null;
				for (let i = 0; i < hand.length; i++) {
					if (variant.keepsCard?.(handState, hand[i])) continue;
					const rest = hand.filter((_, j) => j !== i);
					const score =
						rest.length === variant.discardTo
							? variant.evaluateHand(rest, handState)
							: (() => {
									let b = null;
									for (const picked of keeps(rest, variant.discardTo)) {
										const s = variant.evaluateHand(
											picked.map((k) => rest[k]),
											handState
										);
										if (!b || compareVectors(s, b) > 0) b = s;
									}
									return b;
								})();
					if (!top || compareVectors(score, top) > 0) {
						top = score;
						throwAt = i;
					}
				}
				assert.ok(view.cardsInHand.length > variant.discardTo);
				room = transition(room, 'a', 'discard', { index: throwAt }, ctx);
			}
			assert.equal(me().handName, promised, `${variant.rulesVersion} round ${round}`);
		}
	}
});
