import { evaluateHand, compareHands } from '../classic.mjs';

/**
 * Games where cards change hands (Trade One, Pass the Card). Table moves reach the variant with
 * `{ deck, players }` where `players` are the live (unpacked) players, the same objects the
 * engine holds, so a move may swap cards between hands.
 */
const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);
const base = { evaluateHand, compareHands };
const rules = (extra) =>
	Object.freeze({ rankingOrder: CLASSIC_ORDER, suitsBreakTies: false, ...extra });

// ——— Trade One ———

/**
 * After you look, once per hand you may give one of your cards to a rival and take the card in
 * the same place in their hand, unseen. { kind: 'trade', index, target }; index -1 keeps your hand.
 */
export const tradeOne = Object.freeze({
	...base,
	id: 'trade-one',
	version: 1,
	rulesVersion: 'trade-one-1',
	name: 'Trade One',
	description:
		'After you look, trade one card with a rival for the card in the same place in their hand.',
	prepareHand: () => ({ state: { traded: {}, trades: [] }, cardsConsumed: 0 }),
	publicState: (state) => ({ traded: Object.keys(state.traded), trades: [...state.trades] }),
	tableOptions: (state, player, { players }) =>
		player.isPacked || player.isBlind || state.traded[player.id] || player.cards.length !== 3
			? []
			: [
					...players
						.filter((p) => p.id !== player.id && p.cards.length === 3)
						.flatMap((p) => player.cards.map((_, index) => ({ kind: 'trade', index, target: p.id }))),
					{ kind: 'trade', index: -1 }
				],
	tableAction: (state, player, payload, { players }) => {
		if (payload?.kind !== 'trade') throw new Error('Unknown table move');
		if (player.isBlind) throw new Error('Look at your cards first');
		if (state.traded[player.id]) throw new Error('You already traded this hand');
		const { index, target } = payload;
		if (index === -1) {
			state.traded[player.id] = true;
			return;
		}
		if (!Number.isInteger(index) || index < 0 || index >= player.cards.length)
			throw new Error('Choose one of your cards to trade');
		const rival = players.find((p) => p.id === target && p.id !== player.id);
		if (!rival || rival.cards.length !== player.cards.length)
			throw new Error('Choose a rival still in the hand');
		[player.cards[index], rival.cards[index]] = [rival.cards[index], player.cards[index]];
		state.traded[player.id] = true;
		state.trades.push({ from: player.id, to: rival.id });
	},
	getRules: () =>
		rules({
			trade:
				'After you look, once per hand: give one of your cards to a rival and take the card in the same place in their hand, without seeing it. A rival who traded with you is told.'
		})
});

// ——— Pass the Card ———

/** Seat order of the players still in, for passing to "the next player". */
const bySeat = (players) => [...players].sort((a, b) => a.seatNumber - b.seatNumber);

/**
 * Everyone in the hand picks one card to pass. Once every live player has picked, each passes
 * their pick to the next seat and takes the card passed to them into the same place. Players
 * who pack before then are skipped. If the hand ends first, nothing moves.
 */
function resolvePass(state, players) {
	if (state.done || players.length < 2) return;
	if (!players.every((p) => state.chosen[p.id] !== undefined)) return;
	const ring = bySeat(players);
	const sent = ring.map((p) => p.cards[state.chosen[p.id]]);
	ring.forEach((p, i) => {
		p.cards[state.chosen[p.id]] = sent[(i + ring.length - 1) % ring.length];
	});
	state.done = true;
}

export const passTheCard = Object.freeze({
	...base,
	id: 'pass-the-card',
	version: 1,
	rulesVersion: 'pass-the-card-1',
	name: 'Pass the Card',
	description: 'Everyone passes one card to the next player. Blind players pass without looking.',
	prepareHand: () => ({ state: { chosen: {}, done: false }, cardsConsumed: 0 }),
	publicState: (state) => ({ passed: Object.keys(state.chosen), done: state.done }),
	tableOptions: (state, player) =>
		state.done || player.isPacked || state.chosen[player.id] !== undefined || player.cards.length !== 3
			? []
			: player.cards.map((_, index) => ({ kind: 'pass', index })),
	tableAction: (state, player, payload, { players }) => {
		if (payload?.kind !== 'pass') throw new Error('Unknown table move');
		if (state.done) throw new Error('Cards were already passed');
		if (state.chosen[player.id] !== undefined) throw new Error('You already picked a card to pass');
		const { index } = payload;
		if (!Number.isInteger(index) || index < 0 || index >= player.cards.length)
			throw new Error('Choose one of your cards to pass');
		state.chosen[player.id] = index;
		resolvePass(state, players);
	},
	// Someone packed: the rest may now all be waiting on nobody.
	afterPack: (state, { players }) => resolvePass(state, players),
	getRules: () =>
		rules({
			pass: 'Pick one card to pass. When every player still in has picked, each passes their card to the next seat. Blind players pass without looking.'
		})
});

export const SWAP_GAMES = Object.freeze([tradeOne, passTheCard]);
