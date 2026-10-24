import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck } from '../../server/classic.mjs';
import { listVariants, getVariant } from '../../server/variants/index.mjs';
import { compareVectors } from '../../server/variants/hand-utils.mjs';
import { describeHand, wildIndexes } from '../../server/variants/describe.mjs';

/**
 * Properties every game's scoring must have, checked on random deals: scores are real numbers,
 * hands compare the same both ways round and with themselves, comparing agrees with scoring, the
 * order is transitive, a hand's card order does not matter (where the game says it should not),
 * and the plain-language name and joker marks are sane.
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
function shuffled(random) {
	const deck = freshDeck();
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}
const PLAYERS = ['p0', 'p1', 'p2'];
/** Games where the order of the cards in a hand is part of the rules (the first three play). */
const ORDERED = (variant) => Number.isInteger(variant.discardTo) || variant.foldsToEnd;

/** One random deal: three hands, the game's table state, and each hand's own scoring state. */
function deal(variant, random) {
	const deck = shuffled(random);
	const size = variant.cardsPerPlayer ?? 3;
	const hands = PLAYERS.map((_, i) => deck.slice(i * size, (i + 1) * size));
	const rest = deck.slice(size * PLAYERS.length);
	let state;
	if (variant.prepareHand) {
		state = structuredClone(variant.prepareHand({ remainingDeck: rest }).state);
		// Push the table through its stages, and give some hands the joker they paid for.
		if (variant.afterPot) variant.afterPot(state, Math.floor(random() * 700));
		if (variant.rulesVersion === 'auction-1' && random() < 0.6) state.winner = pick(random, PLAYERS);
		if (variant.rulesVersion === 'buying-joker-1')
			for (const id of PLAYERS) if (random() < 0.5) state.bought[id] = true;
	}
	const states = PLAYERS.map((id) => (variant.stateFor ? variant.stateFor(state, id) : state));
	return { hands, state, states };
}
const pick = (random, list) => list[Math.floor(random() * list.length)];
const sign = (n) => Math.sign(n);

/** Versions no longer on offer that saved hands, lineups and replays can still name. */
const SAVED_VERSIONS = ['buying-joker-1', 'auction-1', 'folding-joker-1', 'side-show-1'];
for (const variant of [...listVariants(), ...SAVED_VERSIONS.map((v) => getVariant(v))])
	test(`Scoring properties: ${variant.name} (${variant.rulesVersion})`, () => {
		const random = rng(variant.rulesVersion.length * 7919 + 13);
		const trials = variant.rulesVersion === 'progressive-joker-1' ? 60 : 150;
		for (let t = 0; t < trials; t++) {
			const { hands, state, states } = deal(variant, random);
			const scores = hands.map((hand, i) => variant.evaluateHand(hand, states[i]));
			for (const score of scores) {
				assert.ok(Array.isArray(score) && score.length > 0, 'a score is a list');
				assert.ok(score.every(Number.isFinite), `${variant.rulesVersion}: score ${score}`);
			}
			// Scoring is deterministic.
			hands.forEach((hand, i) =>
				assert.deepEqual(variant.evaluateHand(hand, states[i]), scores[i], 'deterministic')
			);
			if (!variant.stateFor) {
				// Comparing is symmetric, reflexive and agrees with the scores.
				for (let i = 0; i < 3; i++) {
					assert.equal(variant.compareHands(hands[i], hands[i], state), 0, 'reflexive');
					for (let j = 0; j < 3; j++) {
						const ij = variant.compareHands(hands[i], hands[j], state);
						const ji = variant.compareHands(hands[j], hands[i], state);
						assert.ok([-1, 0, 1].includes(ij), 'compare returns -1, 0 or 1');
						assert.equal(ij + ji, 0, `${variant.rulesVersion}: asymmetric compare`);
						// Comparing may break equal scores (Running does, by suit), never contradict them.
						const byScore = sign(compareVectors(scores[i], scores[j]));
						// (A knock-out rule, like Running's killer suit, may override the scores on purpose.)
						if (byScore !== 0 && !variant.knockedOut) assert.equal(ij, byScore, 'compare matches scores');
						// Transitivity over every triple.
						for (let k = 0; k < 3; k++) {
							const jk = variant.compareHands(hands[j], hands[k], state);
							const ik = variant.compareHands(hands[i], hands[k], state);
							if (ij >= 0 && jk >= 0) assert.ok(ik >= 0, `${variant.rulesVersion}: not transitive`);
						}
					}
				}
			}
			// Card order inside a hand does not change its score (unless order is part of the game).
			if (!ORDERED(variant)) {
				hands.forEach((hand, i) => {
					const reordered = [...hand].reverse();
					assert.deepEqual(
						variant.evaluateHand(reordered, states[i]),
						scores[i],
						`${variant.rulesVersion}: card order changed the score`
					);
				});
			}
			// Jokers are real positions in the hand; the name is plain words.
			hands.forEach((hand, i) => {
				const marks = wildIndexes(variant, hand, states[i]);
				assert.ok(Array.isArray(marks));
				assert.equal(new Set(marks).size, marks.length, 'joker marks are unique');
				assert.ok(marks.every((m) => Number.isInteger(m) && m >= 0 && m < hand.length));
				const name = describeHand(variant, hand, states[i]);
				assert.ok(typeof name === 'string' && name.length > 0, `${variant.rulesVersion}: no hand name`);
				assert.ok(!/undefined|NaN|null/.test(name), `${variant.rulesVersion}: name "${name}"`);
			});
		}
		const rules = variant.getRules();
		assert.ok(rules && typeof rules === 'object' && Object.isFrozen(rules), 'rules are frozen');
		assert.ok(variant.name && variant.description, 'has a name and a description');
		assert.ok(!/—/.test(`${variant.name} ${variant.description}`), 'no em dash in player text');
	});
