import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestWildHand, compareVectors, validateCards } from './hand-utils.mjs';

/**
 * Games where a hidden joker is paid for. One card is taken from the deck and kept face down:
 * its rank is the joker. In Buying Joker every player may buy it for themselves; in Auction
 * players bid and one player wins it. Only the buyer knows the rank until the hands are shown.
 * Each player is scored with their own hand state ({ wildRank }) through `stateFor`.
 */
const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);
const rules = (extra) =>
	Object.freeze({ rankingOrder: CLASSIC_ORDER, suitsBreakTies: false, ...extra });

const evaluate = (cards, handState) => {
	validateCards(cards, 3);
	return handState?.wildRank
		? bestWildHand(cards, new Set([handState.wildRank]), evaluateClassic)
		: evaluateClassic(cards);
};
const wildIndexes = (cards, handState) =>
	handState?.wildRank
		? cards.flatMap((card, i) => (card.rank === handState.wildRank ? [i] : []))
		: [];
const common = {
	evaluateHand: evaluate,
	compareHands: (left, right, handState) =>
		compareVectors(evaluate(left, handState), evaluate(right, handState)),
	wildIndexes
};
const drawJoker = ({ remainingDeck }) => {
	if (!remainingDeck.length) throw new Error('No card remains for the joker');
	return remainingDeck[0].rank;
};

// ——— Buying Joker ———

/** What buying the joker costs, in boots. */
export const BUY_BOOTS = 5;

export const buyingJoker = Object.freeze({
	...common,
	id: 'buying-joker',
	version: 1,
	rulesVersion: 'buying-joker-1',
	name: 'Buying Joker',
	description: `Pay ${BUY_BOOTS} boots to learn a hidden joker rank. It is wild in your hand only.`,
	prepareHand: ({ remainingDeck }) => ({
		state: { rank: drawJoker({ remainingDeck }), bought: {} },
		cardsConsumed: 1
	}),
	// Bots read the public state, where `bought` is a list and the rank only shows for the buyer.
	stateFor: (state, playerId) => {
		const bought = Array.isArray(state?.bought)
			? state.bought.includes(playerId)
			: !!state?.bought?.[playerId];
		return { wildRank: bought ? state.rank : null };
	},
	publicState: (state, viewerId) => ({
		bought: Object.keys(state.bought),
		price: BUY_BOOTS,
		rank: state.bought[viewerId] ? state.rank : null
	}),
	tableOptions: (state, player, { boot }) =>
		player.isPacked || state.bought[player.id] || player.balance < BUY_BOOTS * boot
			? []
			: [{ kind: 'buy', price: BUY_BOOTS * boot }],
	tableAction: (state, player, payload, { boot }) => {
		if (payload?.kind !== 'buy') throw new Error('Unknown table move');
		if (state.bought[player.id]) throw new Error('You already bought the joker');
		const price = BUY_BOOTS * boot;
		if (player.balance < price) throw new Error('Not enough chips to buy the joker');
		state.bought[player.id] = true;
		return { pays: [{ id: player.id, amount: price }] };
	},
	getRules: () =>
		rules({
			buy: `One card is kept face down. Any player may pay ${BUY_BOOTS} boots into the pot to learn its rank: that rank is wild in their hand only. Everyone can see who bought.`
		})
});

// ——— Auction ———

/** Sealed bids, in boots. 0 means no bid. */
export const AUCTION_BIDS = Object.freeze([0, 1, 2, 5, 10]);
const bySeat = (players) => [...players].sort((a, b) => a.seatNumber - b.seatNumber);

/**
 * When every player still in has bid, the highest bid wins the joker and pays it into the pot
 * (the earliest seat wins a tie). Nobody bidding above zero means no sale.
 */
function closeAuction(state, players, boot) {
	if (state.done || players.length < 2) return null;
	if (!players.every((p) => state.bids[p.id] !== undefined)) return null;
	state.done = true;
	let winner = null;
	for (const p of bySeat(players))
		if (state.bids[p.id] > 0 && (!winner || state.bids[p.id] > state.bids[winner.id])) winner = p;
	if (!winner) return null;
	state.winner = winner.id;
	state.amount = state.bids[winner.id] * boot;
	return { pays: [{ id: winner.id, amount: state.amount }] };
}

export const auction = Object.freeze({
	...common,
	id: 'auction',
	version: 1,
	rulesVersion: 'auction-1',
	name: 'Auction',
	description:
		'Everyone makes a sealed bid for a hidden joker. The highest bidder pays their bid and wins the joker.',
	prepareHand: ({ remainingDeck }) => ({
		state: { rank: drawJoker({ remainingDeck }), bids: {}, done: false, winner: null, amount: 0 },
		cardsConsumed: 1
	}),
	stateFor: (state, playerId) => ({ wildRank: state?.winner === playerId ? state.rank : null }),
	publicState: (state, viewerId, revealed) => ({
		bid: Object.keys(state.bids),
		done: state.done,
		winner: state.winner,
		amount: state.amount,
		rank:
			state.done && state.winner && (viewerId === state.winner || revealed.has(state.winner))
				? state.rank
				: null
	}),
	tableOptions: (state, player, { boot }) =>
		state.done || player.isPacked || state.bids[player.id] !== undefined
			? []
			: AUCTION_BIDS.filter((bid) => bid * boot <= player.balance).map((bid) => ({
					kind: 'bid',
					bid,
					amount: bid * boot
				})),
	tableAction: (state, player, payload, { players, boot }) => {
		if (payload?.kind !== 'bid') throw new Error('Unknown table move');
		if (state.done) throw new Error('The auction is over');
		if (state.bids[player.id] !== undefined) throw new Error('You already bid');
		if (!AUCTION_BIDS.includes(payload.bid)) throw new Error('Choose one of the bids');
		if (payload.bid * boot > player.balance) throw new Error('Not enough chips for that bid');
		state.bids[player.id] = payload.bid;
		return closeAuction(state, players, boot);
	},
	// Someone packed: the rest may all have bid already.
	afterPack: (state, { players, boot }) => closeAuction(state, players, boot),
	getRules: () =>
		rules({
			auction: `Everyone makes one sealed bid (${AUCTION_BIDS.join(', ')} boots). When all players still in have bid, the highest bidder pays their bid into the pot and wins the hidden joker: its rank is wild in their hand only. Equal top bids go to the earliest seat. Nobody bidding means no joker.`
		})
});

export const JOKER_BUY_GAMES = Object.freeze([buyingJoker, auction]);
