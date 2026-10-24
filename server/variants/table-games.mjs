import { evaluateHand as evaluateClassic } from '../classic.mjs';
import { bestWildHand, compareVectors, validateCards, cardKey } from './hand-utils.mjs';

/**
 * Games with cards on the table (Chatai, Running, Rotating and Revolving Joker) and games where
 * players build a joker from their own cards (Kiss-Miss-Bliss, Kissing-Missing).
 *
 * Besides the usual variant boundary these use a few table hooks, all pure functions of the
 * variant's own state (the engine owns money, turns and settling):
 * - stateFor(state, playerId): the hand state that player's cards are scored with (their jokers);
 * - publicState(state, viewerId, revealedIds): what a viewer may see of the table cards;
 * - tableOptions(state, player): table moves this player may make now ({ kind, ... } payloads);
 * - tableAction(state, player, payload, { deck }): make one of those moves (may reorder the player's
 *   cards, or take cards off the top of the deck);
 * - beforeTurn(state) / afterBet(state, playerId) / afterPot(state, pot) / onPack(state, { cards, deck });
 * - knockedOut(state, player), showBlocked(state, playerId), showOverride(state, requester, other),
 *   keepsCard(handState, card).
 */

const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);
const HIDDEN = Object.freeze({ rank: 0, suit: '' });
const hidden = () => ({ ...HIDDEN });
const copy = (card) => ({ rank: card.rank, suit: card.suit });

/** Best Classic score with every card of these ranks wild. */
function withWildRanks(cards, ranks) {
	validateCards(cards, 3);
	const wild = new Set(ranks);
	return wild.size ? bestWildHand(cards, wild, evaluateClassic) : evaluateClassic(cards);
}
const wildIndexesFor = (cards, ranks) => {
	const wild = new Set(ranks);
	return cards.flatMap((card, index) => (index < 3 && wild.has(card.rank) ? [index] : []));
};
const rules = (extra) =>
	Object.freeze({ ...extra, rankingOrder: CLASSIC_ORDER, suitsBreakTies: false });

// ——— Chatai 3×3 ———

/** Rows, columns and both diagonals of the 3×3 mat, as card positions 0–8. */
export const CHATAI_LINES = Object.freeze([
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 6],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6]
]);
const allOpen = (state) => state.open.every(Boolean);

/**
 * Before the whole mat is open, every open card's rank is wild for everyone. Once all nine are
 * open, each player's jokers are the three cards of the line they locked; no line, no jokers.
 */
function chataiWildRanks(state, playerId) {
	if (!state?.mat) return [];
	if (allOpen(state)) {
		const line = state.lines?.[playerId];
		return Number.isInteger(line) ? CHATAI_LINES[line].map((i) => state.mat[i].rank) : [];
	}
	return state.mat.flatMap((card, i) => (state.open[i] && card.rank ? [card.rank] : []));
}

const chataiEvaluate = (cards, handState) => withWildRanks(cards, handState?.wildRanks ?? []);

export const chatai = Object.freeze({
	id: 'chatai',
	version: 1,
	rulesVersion: 'chatai-1',
	name: 'Chatai 3×3',
	description:
		'Nine cards face down on the mat. Pay your chaal, open one: every open card is a joker. ' +
		'When all nine are open, lock one line of three as your jokers.',
	evaluateHand: chataiEvaluate,
	compareHands: (left, right, handState) =>
		compareVectors(chataiEvaluate(left, handState), chataiEvaluate(right, handState)),
	prepareHand: ({ remainingDeck }) => {
		if (remainingDeck.length < 9) throw new Error('Not enough cards for the mat');
		return {
			state: {
				mat: remainingDeck.slice(0, 9).map(copy),
				open: Array(9).fill(false),
				lines: {},
				pendingOpen: null
			},
			cardsConsumed: 9
		};
	},
	stateFor: (state, playerId) => ({ wildRanks: chataiWildRanks(state, playerId) }),
	wildIndexes: (cards, handState) => wildIndexesFor(cards, handState?.wildRanks ?? []),
	publicState: (state, viewerId, revealed) => ({
		mat: state.mat.map((card, i) => (state.open[i] ? copy(card) : hidden())),
		open: [...state.open],
		pendingOpen: state.pendingOpen,
		// Your own line, and lines of hands already shown; others only show that they locked.
		lines: Object.fromEntries(
			Object.entries(state.lines).filter(([id]) => id === viewerId || revealed.has(id))
		),
		locked: Object.keys(state.lines)
	}),
	// The player who just paid opens a card; until they do, the next move on the table opens one.
	afterBet: (state, playerId) => {
		if (state.open.some((open) => !open)) state.pendingOpen = playerId;
	},
	beforeTurn: (state) => {
		if (state.pendingOpen === null) return;
		const closed = state.open.indexOf(false);
		if (closed >= 0) state.open[closed] = true;
		state.pendingOpen = null;
	},
	tableOptions: (state, player) => {
		if (player.isPacked) return [];
		if (state.pendingOpen === player.id)
			return state.open.flatMap((open, index) => (open ? [] : [{ kind: 'open', index }]));
		if (allOpen(state) && !Number.isInteger(state.lines[player.id]))
			return CHATAI_LINES.map((_, line) => ({ kind: 'line', line }));
		return [];
	},
	tableAction: (state, player, payload) => {
		if (payload?.kind === 'open') {
			if (state.pendingOpen !== player.id) throw new Error('Pay your chaal before you open a card');
			if (!Number.isInteger(payload.index) || state.open[payload.index] !== false)
				throw new Error('Choose a closed card on the mat');
			state.open[payload.index] = true;
			state.pendingOpen = null;
		} else if (payload?.kind === 'line') {
			if (!allOpen(state)) throw new Error('Lines open once all nine cards are showing');
			if (Number.isInteger(state.lines[player.id])) throw new Error('Your line is already locked');
			if (!Number.isInteger(payload.line) || !CHATAI_LINES[payload.line])
				throw new Error('Choose a row, column or diagonal');
			state.lines[player.id] = payload.line;
		} else throw new Error('Unknown table move');
	},
	// The last closed card may be about to open (paid for, not yet turned): count it as open.
	showBlocked: (state, playerId) =>
		state.open.filter((open) => !open).length <= (state.pendingOpen === null ? 0 : 1) &&
		!Number.isInteger(state.lines[playerId])
			? 'Lock your joker line before you Show'
			: null,
	getRules: () =>
		rules({
			mat: 9,
			wildSource: 'open-mat-cards, then your locked line',
			wildCards:
				'Every open mat card’s rank is wild. With all nine open, only your locked line’s ranks are wild.'
		})
});

// ——— Running ———

/** Pot amounts that open the first, second and third table card. */
export const RUNNING_THRESHOLDS = Object.freeze([200, 400, 600]);
const below = (rank) => (rank === 2 ? 14 : rank - 1);
const above = (rank) => (rank === 14 ? 2 : rank + 1);
const SUIT_ORDER = Object.freeze({ spades: 3, hearts: 2, clubs: 1, diamonds: 0 });

/** First card: one above and one below are wild. Second card: its rank and both neighbours. */
function runningWildRanks(state) {
	const ranks = [];
	const [first, second] = state?.table ?? [];
	if (state?.opened >= 1 && first?.rank) ranks.push(below(first.rank), above(first.rank));
	if (state?.opened >= 2 && second?.rank)
		ranks.push(second.rank, below(second.rank), above(second.rank));
	return ranks;
}
const killerSuit = (state) => (state?.opened >= 3 ? (state.table[2]?.suit ?? null) : null);
const holdsKiller = (state, cards) => {
	const suit = killerSuit(state);
	return !!suit && cards.some((card) => card.suit === suit);
};
/** Equal hands: the higher card, then the higher suit (♠ ♥ ♣ ♦), decides. */
function runningEvaluate(cards, state) {
	const base = withWildRanks(cards, runningWildRanks(state));
	const tiebreak = cards.map((c) => c.rank * 4 + SUIT_ORDER[c.suit]).sort((a, b) => b - a);
	return [...base, ...tiebreak];
}

export const running = Object.freeze({
	id: 'running',
	version: 1,
	rulesVersion: 'running-1',
	name: 'Running',
	description:
		'Three table cards open as the pot reaches ₹200, ₹400 and ₹600. The first two set jokers; ' +
		'the third card’s suit knocks out anyone holding it.',
	evaluateHand: runningEvaluate,
	// A hand holding the killer suit loses to one without it.
	compareHands: (left, right, state) => {
		const leftOut = holdsKiller(state, left);
		const rightOut = holdsKiller(state, right);
		if (leftOut !== rightOut) return leftOut ? -1 : 1;
		return compareVectors(runningEvaluate(left, state), runningEvaluate(right, state));
	},
	prepareHand: ({ remainingDeck }) => {
		if (remainingDeck.length < 3) throw new Error('Not enough cards for the table');
		return {
			state: { table: remainingDeck.slice(0, 3).map(copy), opened: 0, out: [] },
			cardsConsumed: 3
		};
	},
	wildIndexes: (cards, state) => wildIndexesFor(cards, runningWildRanks(state)),
	publicState: (state) => ({
		table: state.table.map((card, i) => (i < state.opened ? copy(card) : hidden())),
		opened: state.opened,
		thresholds: [...RUNNING_THRESHOLDS],
		killer: killerSuit(state),
		out: [...state.out]
	}),
	afterPot: (state, pot) => {
		const reached = RUNNING_THRESHOLDS.filter((amount) => pot >= amount).length;
		if (reached > state.opened) state.opened = reached;
	},
	// Seen players holding the killer suit are out. Blind players may still Show, but can't win.
	knockedOut: (state, player) => !player.isBlind && holdsKiller(state, player.cards),
	// Both hands at a Show hold the killer suit: the player who opens last (not the asker) wins.
	showOverride: (state, requester, other) =>
		holdsKiller(state, requester.cards) && holdsKiller(state, other.cards) ? other : null,
	getRules: () =>
		rules({
			tableCards: 3,
			thresholds: RUNNING_THRESHOLDS,
			wildCards:
				'First card: the ranks above and below it. Second card: its rank and the ranks above and below. Aces wrap.',
			killer: 'Third card: anyone holding its suit is out. Blind players may Show but cannot win.',
			ties: 'Higher card, then suit: spades, hearts, clubs, diamonds.'
		})
});

// ——— Rotating Joker and Revolving Joker ———

/** Three jokers open on the table; their ranks are wild for everyone. */
function jokerTableGame({ id, name, description, replace, wildCardsText }) {
	const ranks = (state) => (state?.jokers ?? []).map((card) => card.rank).filter(Boolean);
	const evaluate = (cards, state) => withWildRanks(cards, ranks(state));
	return Object.freeze({
		id,
		version: 1,
		rulesVersion: `${id}-1`,
		name,
		description,
		evaluateHand: evaluate,
		compareHands: (left, right, state) =>
			compareVectors(evaluate(left, state), evaluate(right, state)),
		prepareHand: ({ remainingDeck }) => {
			if (remainingDeck.length < 3) throw new Error('Not enough cards for the jokers');
			return {
				state: { jokers: remainingDeck.slice(0, 3).map(copy), before: [] },
				cardsConsumed: 3
			};
		},
		wildIndexes: (cards, state) => wildIndexesFor(cards, ranks(state)),
		publicState: (state) => structuredClone(state),
		onPack: (state, packed) => {
			const next = replace(packed);
			if (!next) return;
			state.before = state.jokers;
			state.jokers = next.map(copy);
		},
		getRules: () => rules({ jokers: 3, wildCards: wildCardsText })
	});
}

export const rotatingJoker = jokerTableGame({
	id: 'rotating-joker',
	name: 'Rotating Joker',
	description:
		'Three jokers are open on the table. When someone packs, their three cards become the new jokers.',
	replace: ({ cards }) => (cards.length === 3 ? cards : null),
	wildCardsText:
		'The ranks of the three open jokers. A player who packs turns their cards into the jokers.'
});

export const revolvingJoker = jokerTableGame({
	id: 'revolving-joker',
	name: 'Revolving Joker',
	description:
		'Three jokers are open on the table. When someone packs, three fresh jokers replace them.',
	replace: ({ deck }) => (deck.length >= 3 ? deck.splice(0, 3) : null),
	wildCardsText: 'The ranks of the three open jokers. Each pack deals three fresh ones.'
});

// ——— Kiss-Miss-Bliss and Kissing-Missing ———

const gap = (a, b) => {
	const plain = Math.abs(a - b);
	// The Ace also sits below the 2: A-2 is a Kiss and A-3 a Miss.
	const low = Math.abs((a === 14 ? 1 : a) - (b === 14 ? 1 : b));
	return Math.min(plain, low);
};
/** "kiss" (next to each other), "miss" (one apart) or "bliss" (same rank), or null. */
export function jokerPair(left, right) {
	if (left.rank === right.rank) return 'bliss';
	const distance = gap(left.rank, right.rank);
	return distance === 1 ? 'kiss' : distance === 2 ? 'miss' : null;
}

function pairJokerGame({ id, name, description, cards: dealt, kinds }) {
	const played = (cards) => {
		if (!Array.isArray(cards) || cards.length < 3 || cards.length > dealt)
			throw new Error(`${name} hands hold three to ${dealt} cards`);
		validateCards(cards, cards.length);
		return cards.slice(0, 3);
	};
	const evaluate = (cards, handState) => {
		const key = handState?.jokerKey;
		const three = played(cards);
		return key
			? bestWildHand(three, (card) => cardKey(card) === key, evaluateClassic)
			: evaluateClassic(three);
	};
	const pairs = (cards) => {
		const options = [];
		for (let i = 0; i < cards.length; i++)
			for (let j = i + 1; j < cards.length; j++)
				if (kinds.includes(jokerPair(cards[i], cards[j])))
					options.push({ kind: 'joker', indexes: [i, j] });
		return options;
	};
	return Object.freeze({
		id,
		version: 1,
		rulesVersion: `${id}-1`,
		name,
		description,
		cardsPerPlayer: dealt,
		discardTo: 3,
		played,
		evaluateHand: evaluate,
		compareHands: (left, right, handState) =>
			compareVectors(evaluate(left, handState), evaluate(right, handState)),
		prepareHand: () => ({ state: { jokers: {} }, cardsConsumed: 0 }),
		stateFor: (state, playerId) => ({ jokerKey: state?.jokers?.[playerId] ?? null }),
		wildIndexes: (cards, handState) =>
			handState?.jokerKey
				? cards.flatMap((card, i) => (i < 3 && cardKey(card) === handState.jokerKey ? [i] : []))
				: [],
		publicState: (state, viewerId, revealed) => ({
			jokers: Object.fromEntries(
				Object.entries(state.jokers).filter(([pid]) => pid === viewerId || revealed.has(pid))
			),
			made: Object.keys(state.jokers)
		}),
		// Seen, still holding every card dealt and no joker yet: any matching pair may become one.
		tableOptions: (state, player) =>
			player.isPacked || player.isBlind || state.jokers[player.id] || player.cards.length !== dealt
				? []
				: pairs(player.cards),
		tableAction: (state, player, payload) => {
			if (payload?.kind !== 'joker') throw new Error('Unknown table move');
			if (player.isBlind) throw new Error('Look at your cards first');
			if (state.jokers[player.id]) throw new Error('You already made your joker');
			if (player.cards.length !== dealt)
				throw new Error('Make your joker before you throw cards away');
			const [i, j] = Array.isArray(payload.indexes) ? payload.indexes : [];
			if (
				!Number.isInteger(i) ||
				!Number.isInteger(j) ||
				i === j ||
				!player.cards[i] ||
				!player.cards[j] ||
				!kinds.includes(jokerPair(player.cards[i], player.cards[j]))
			)
				throw new Error(`Pick two cards that make a ${kinds.join(', ')}`);
			// The pair becomes one joker: keep the first card (moved to the front), drop the second.
			const joker = player.cards[i];
			player.cards = [joker, ...player.cards.filter((_, index) => index !== i && index !== j)];
			state.jokers[player.id] = cardKey(joker);
		},
		keepsCard: (handState, card) => !!handState?.jokerKey && cardKey(card) === handState.jokerKey,
		getRules: () =>
			rules({
				cardsPerPlayer: dealt,
				keep: 3,
				jokerPairs: kinds,
				wildCards:
					'Two of your cards that make a pair type become one joker. No joker: throw cards away.',
				blindPlayers: 'A player who never looks plays their first three, with no joker.'
			})
	});
}

export const kissMissBliss = pairJokerGame({
	id: 'kiss-miss-bliss',
	name: 'Kiss-Miss-Bliss',
	description:
		'Get five. Two cards next to each other (Kiss), one apart (Miss) or the same (Bliss) become one joker. Keep three.',
	cards: 5,
	kinds: ['kiss', 'miss', 'bliss']
});

export const kissingMissing = pairJokerGame({
	id: 'kissing-missing',
	name: 'Kissing-Missing',
	description:
		'Get four. Two cards next to each other (Kiss) or one apart (Miss) become one joker. Keep three.',
	cards: 4,
	kinds: ['kiss', 'miss']
});

export const TABLE_GAMES = Object.freeze([
	chatai,
	running,
	rotatingJoker,
	revolvingJoker,
	kissMissBliss,
	kissingMissing
]);
