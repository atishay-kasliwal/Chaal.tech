import type { ComponentProps } from 'svelte';
import type TableMat from './TableMat.svelte';
import type { MatCard, MatLine } from './TableMat.svelte';

/**
 * What the mat in the middle shows for games with cards on the table, worked out from the
 * viewer's own projection. The server decides everything; this only lays it out.
 */

type Mat = ComponentProps<typeof TableMat>;
/** Games whose table cards stay up after the hand, and for how long before the next deal. */
export const REVIEW_GAMES = new Set([
	'chatai-1',
	'running-1',
	'rotating-joker-1',
	'revolving-joker-1'
]);
export const REVIEW_MS = 60 * 1000;
const COLOUR_NAMES = ['gold', 'blue', 'green', 'pink', 'purple', 'orange'];
const SUIT_SYMBOL: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RANK: Record<number, string> = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' };
export const rankText = (rank: number) => RANK[rank] ?? String(rank);
export const cardText = (card: Card) => `${rankText(card.rank)}${SUIT_SYMBOL[card.suit] ?? ''}`;
const uniqueRanks = (ranks: number[]) =>
	[...new Set(ranks)]
		.sort((a, b) => a - b)
		.map(rankText)
		.join(' · ');

/** Rows, columns and diagonals of the 3×3 mat (same order as the server). */
export const CHATAI_LINES = [
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 6],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6]
] as const;
const lineEnds = (line: number): Pick<MatLine, 'from' | 'to'> => {
	const cells = CHATAI_LINES[line];
	const at = (cell: number): [number, number] => [Math.floor(cell / 3), cell % 3];
	return { from: at(cells[0]), to: at(cells[2]) };
};
/** One colour per seat, for drawing each player's line at the Show. */
const SEAT_COLOURS = ['#f4d68c', '#3fa7ff', '#55d38a', '#ff8b98', '#c49bff', '#ffb35c'];

/** Kiss (next to each other), Miss (one apart) or Bliss (same rank), the Ace on both ends. */
export function jokerPair(left: Card, right: Card): 'kiss' | 'miss' | 'bliss' | null {
	if (left.rank === right.rank) return 'bliss';
	const low = (rank: number) => (rank === 14 ? 1 : rank);
	const distance = Math.min(
		Math.abs(left.rank - right.rank),
		Math.abs(low(left.rank) - low(right.rank))
	);
	return distance === 1 ? 'kiss' : distance === 2 ? 'miss' : null;
}
export const PAIR_LABEL = { kiss: '💋 Kiss', miss: '🙈 Miss', bliss: '✨ Bliss' } as const;

export interface MatUi {
	/** The line a Chatai player is trying before locking it. */
	previewLine: number | null;
	onopen: (index: number) => void;
	onpreview: (line: number) => void;
	onlock: (line: number) => void;
	/** Send any other table move (buy, bid). */
	onmove: (move: TableMove) => void;
}

const nameOf = (room: RoomData, id: string | null | undefined) =>
	room.usersList.find((user) => user.id === id)?.username ?? 'Someone';

export function matFor(room: RoomData, selfId: string, ui: MatUi): Mat | null {
	const state = room.variantState;
	if (!state || !room.isStarted) return null;
	switch (room.rulesVersion) {
		case 'chatai-1':
			return chatai(room, selfId, ui);
		case 'running-1':
			return running(room);
		case 'rotating-joker-1':
		case 'revolving-joker-1':
			return jokers(room);
		case 'kiss-miss-bliss-1':
		case 'kissing-missing-1':
			return pairJoker(room);
		case 'community-1':
			return community(room);
		case 'hukum-1':
			return hukum(room);
		case 'progressive-joker-1':
			return progressive(room);
		case 'buying-joker-1':
			return buying(room, ui);
		case 'auction-1':
			return auction(room, ui);
		case 'knockout-1':
		case 'sudden-death-1':
		case 'survivor-1':
			return laps(room);
		case 'banko-1':
			return banko(room);
		default:
			return null;
	}
}

function chatai(room: RoomData, selfId: string, ui: MatUi): Mat | null {
	const state = room.variantState!;
	const mat = state.mat ?? [];
	const open = state.open ?? [];
	const lines = state.lines ?? {};
	const options = room.legalActions.table ?? [];
	const canOpen = options.some((move) => move.kind === 'open');
	const choosing = options.some((move) => move.kind === 'line');
	const allOpen = open.length === 9 && open.every(Boolean);
	const mine = lines[selfId];
	const shown = allOpen ? (choosing ? ui.previewLine : (mine ?? null)) : null;
	const highlight = new Set<number>(shown === null ? [] : CHATAI_LINES[shown]);
	const cards: MatCard[] = mat.map((card, index) =>
		open[index]
			? {
					card,
					open: true,
					// Still closing: every open card is a joker. All open: only your line.
					wild: allOpen ? highlight.has(index) : true,
					picked: allOpen && highlight.has(index) && choosing,
					dim: allOpen && shown !== null && !highlight.has(index)
				}
			: { tappable: canOpen }
	);
	const drawn: MatLine[] = [];
	if (choosing) {
		for (let line = 0; line < 8; line++)
			drawn.push({ ...lineEnds(line), color: '#ffffff', faint: true });
		if (ui.previewLine !== null) drawn.push({ ...lineEnds(ui.previewLine), color: '#f4d68c' });
	} else if (allOpen) {
		// Every line this viewer may see: their own, and everyone's after the Show.
		const seats = room.usersList.map((user) => user.id);
		const entries = Object.entries(lines);
		// Players who locked the same line get parallel strokes side by side, so each one shows.
		entries.forEach(([id, line]) => {
			const same = entries.filter(([, other]) => other === line);
			const slot = same.findIndex(([other]) => other === id);
			drawn.push({
				...lineEnds(line),
				color: id === selfId ? '#f4d68c' : SEAT_COLOURS[(seats.indexOf(id) + 1) % 6],
				offset: (slot - (same.length - 1) / 2) * 0.9
			});
		});
	}
	const openRanks = mat.filter((_, i) => open[i]).map((card) => card.rank);
	const openCount = open.filter(Boolean).length;
	const pending = state.pendingOpen;
	const over = room.gameShow;
	// After the hand: name whose line is which colour.
	const seats = room.usersList.map((user) => user.id);
	const lineKey = Object.keys(lines)
		.map((id) =>
			id === selfId
				? 'you gold'
				: `${nameOf(room, id)} ${COLOUR_NAMES[(seats.indexOf(id) + 1) % 6]}`
		)
		.join(' · ');
	const prompt = canOpen
		? '<b>Tap a card on the mat to open it</b>'
		: pending && room.isStarted && !room.gameShow
			? `${nameOf(room, pending)} is opening a card`
			: choosing
				? '<b>Pick your joker line.</b> Once locked, it can’t change.'
				: '';
	const lineCards = (line: number) =>
		CHATAI_LINES[line].map((cell) => cardText(mat[cell])).join(' ');
	return {
		layout: 'grid',
		cards,
		lines: drawn,
		prompt,
		caption: over
			? allOpen
				? lineKey
					? `Lines: ${lineKey}`
					: 'No lines were locked'
				: `${openCount} of 9 opened before the end`
			: allOpen
				? ''
				: `${openCount} of 9 open`,
		tray: over
			? undefined
			: allOpen
				? mine !== undefined
					? {
							title: 'Your jokers',
							ranks: uniqueRanks(CHATAI_LINES[mine].map((cell) => mat[cell].rank)),
							note: '🔒 Line locked'
						}
					: {
							title: 'Jokers',
							note: 'Lock a row, column or diagonal: its three cards become your jokers'
						}
				: openRanks.length
					? { title: 'Jokers', ranks: uniqueRanks(openRanks), note: 'any card of these ranks' }
					: { title: 'Jokers', note: 'Every card opened on the mat becomes a joker' },
		actions:
			choosing && ui.previewLine !== null
				? [
						{
							label: `🔒 Lock ${lineCards(ui.previewLine)} as my jokers`,
							primary: true,
							onclick: () => ui.onlock(ui.previewLine!)
						}
					]
				: [],
		onCardClick: canOpen ? ui.onopen : undefined,
		onLineClick: choosing ? ui.onpreview : undefined
	};
}

function running(room: RoomData): Mat {
	const state = room.variantState!;
	const table = state.table ?? [];
	const opened = state.opened ?? 0;
	const thresholds = state.thresholds ?? [200, 400, 600];
	const killer = state.killer ?? null;
	const ranks: number[] = [];
	const below = (rank: number) => (rank === 2 ? 14 : rank - 1);
	const above = (rank: number) => (rank === 14 ? 2 : rank + 1);
	if (opened >= 1 && table[0]?.rank) ranks.push(below(table[0].rank), above(table[0].rank));
	if (opened >= 2 && table[1]?.rank)
		ranks.push(table[1].rank, below(table[1].rank), above(table[1].rank));
	const cards: MatCard[] = table.map((card, index) => {
		const isOpen = index < opened;
		const last = index === 2;
		return {
			card,
			open: isOpen,
			wild: isOpen && index === 1,
			killer: isOpen && last,
			tag: isOpen
				? last
					? `☠ ${SUIT_SYMBOL[killer ?? ''] ?? ''} is out`
					: `✓ ₹${thresholds[index]}`
				: `${last ? '☠ ' : ''}₹${thresholds[index]}`,
			tagTone: isOpen ? (last ? 'danger' : 'done') : last ? 'danger' : ''
		};
	});
	const next = thresholds[opened];
	const prev = opened ? thresholds[opened - 1] : 0;
	const out = (state.out ?? []).map((id) => nameOf(room, id));
	const symbol = SUIT_SYMBOL[killer ?? ''] ?? '';
	return {
		layout: 'row',
		cards,
		prompt: killer
			? `<b>${symbol} is out.</b>${out.length ? ` ${out.join(', ')} packed` : ' Nobody seen holds it'}`
			: '',
		promptTone: killer ? 'danger' : '',
		progress:
			next !== undefined
				? {
						label: `₹${room.pot} of ₹${next} · next card soon`,
						value: Math.max(0, Math.min(1, (room.pot - prev) / (next - prev)))
					}
				: undefined,
		tray: ranks.length
			? {
					title: 'Jokers',
					ranks: uniqueRanks(ranks),
					danger: killer ? `☠ any ${symbol} is out` : undefined
				}
			: { title: 'Jokers', note: 'The first card opens at ₹200 of pot' }
	};
}

function jokers(room: RoomData): Mat {
	const state = room.variantState!;
	const now = Array.isArray(state.jokers) ? state.jokers : [];
	const before = state.before ?? [];
	return {
		layout: 'none',
		prompt: before.length
			? `New jokers: <b>${now.map(cardText).join(' ')}</b>`
			: room.rulesVersion === 'rotating-joker-1'
				? 'A player who packs turns their cards into the jokers'
				: 'Every pack deals three fresh jokers',
		tray: {
			title: before.length ? 'Jokers now' : 'Jokers',
			cards: now,
			before: before.length ? before : undefined
		}
	};
}

function pairJoker(room: RoomData): Mat | null {
	const moves = (room.legalActions.table ?? []).filter((move) => move.kind === 'joker');
	if (!moves.length) return null;
	const bliss = room.rulesVersion === 'kiss-miss-bliss-1';
	return {
		layout: 'none',
		prompt: 'Tap two of your cards to make your joker',
		tray: {
			title: 'Make your joker',
			rules: [
				{ icon: '💋', name: 'Kiss', text: 'Next to each other, like 2-3' },
				{ icon: '🙈', name: 'Miss', text: 'One gap between, like 8-10' },
				...(bliss ? [{ icon: '✨', name: 'Bliss', text: 'Same rank, like K-K' }] : [])
			]
		}
	};
}

const suitName = (suit: string | null | undefined) =>
	({ spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs' })[suit ?? ''] ?? '';

/** Community Teen Patti: three shared cards that open as the pot grows. */
function community(room: RoomData): Mat {
	const state = room.variantState!;
	const board = state.community ?? [];
	const opened = state.opened ?? 1;
	const thresholds = state.thresholds ?? [100, 200];
	const cards: MatCard[] = board.map((card, index) => {
		const isOpen = index < opened;
		return {
			card,
			open: isOpen,
			tag: index === 0 ? 'open' : `${isOpen ? '✓ ' : ''}₹${thresholds[index - 1]}`,
			tagTone: isOpen && index > 0 ? 'done' : ''
		};
	});
	const next = thresholds[opened - 1];
	const prev = opened > 1 ? thresholds[opened - 2] : 0;
	return {
		layout: 'row',
		cards,
		caption: 'Community cards',
		prompt: 'Your hand is the <b>best three</b> of your two cards and the open ones here',
		progress:
			next !== undefined
				? {
						label: `₹${room.pot} of ₹${next} · next card soon`,
						value: Math.max(0, Math.min(1, (room.pot - prev) / (next - prev)))
					}
				: undefined
	};
}

/** Hukum: the open card names the trump suit. */
function hukum(room: RoomData): Mat {
	const state = room.variantState!;
	const indicator = state.indicator;
	return {
		layout: 'none',
		prompt: indicator?.suit
			? `<b>${suitName(indicator.suit)}</b> is trump. More trump cards win inside a hand type`
			: '',
		tray: { title: 'Trump', cards: indicator?.rank ? [indicator] : [], note: 'more trump wins ties' }
	};
}

/** Progressive Joker: the hidden indicator turns over at the first pot mark. */
function progressive(room: RoomData): Mat {
	const state = room.variantState!;
	const stage = state.stage ?? 0;
	const thresholds = state.thresholds ?? [100, 200, 400];
	const ranks = state.wildRanks ?? [];
	const next = thresholds[stage];
	const prev = stage ? thresholds[stage - 1] : 0;
	return {
		layout: 'none',
		prompt: stage
			? `Jokers are <b>${uniqueRanks(ranks)}</b>${state.wildSuit ? ` and every ${suitName(state.wildSuit)} card` : ''}`
			: `No jokers yet: they start at ₹${thresholds[0]}`,
		progress:
			next !== undefined
				? {
						label: `₹${room.pot} of ₹${next} · jokers grow`,
						value: Math.max(0, Math.min(1, (room.pot - prev) / (next - prev)))
					}
				: undefined,
		tray: {
			title: 'Jokers',
			cards: stage && state.indicator?.rank ? [state.indicator] : [],
			ranks: ranks.length ? uniqueRanks(ranks) : undefined,
			note: stage ? undefined : 'The hidden card turns over soon'
		}
	};
}

/** Buying Joker: pay to learn the hidden joker rank, for your hand only. */
function buying(room: RoomData, ui: MatUi): Mat {
	const state = room.variantState!;
	const move = (room.legalActions.table ?? []).find((m) => m.kind === 'buy');
	const bought = state.bought ?? [];
	const mine = state.rank ? rankText(state.rank) : null;
	return {
		layout: 'none',
		prompt: mine
			? `Your joker is <b>${mine}</b>: every ${mine} in your hand is wild`
			: `<b>One hidden joker.</b> Pay to learn its rank, for your hand only`,
		caption: bought.length
			? `Bought by ${bought.map((id) => nameOf(room, id)).join(', ')}`
			: 'Nobody has bought the joker',
		tray: { title: 'Joker', note: mine ? `wild ${mine}` : 'hidden until you buy' },
		actions: move
			? [
					{
						label: `Buy the joker ₹${move.price ?? ''}`,
						primary: true,
						onclick: () => ui.onmove({ kind: 'buy' })
					}
				]
			: []
	};
}

/** Auction: one sealed bid each; the top bid pays and wins the hidden joker. */
function auction(room: RoomData, ui: MatUi): Mat {
	const state = room.variantState!;
	const bids = (room.legalActions.table ?? []).filter((m) => m.kind === 'bid');
	const bid = state.bid ?? [];
	const mine = state.rank ? rankText(state.rank) : null;
	const prompt = state.done
		? state.winner
			? `<b>${nameOf(room, state.winner)}</b> won the joker for ₹${state.amount}${mine ? `: wild ${mine} for you` : ''}`
			: 'Nobody bid: no joker this hand'
		: bids.length
			? '<b>Sealed bid for the hidden joker.</b> Highest bid pays it into the pot and wins'
			: `Waiting for bids: ${bid.length} in`;
	return {
		layout: 'none',
		prompt,
		tray: {
			title: 'Joker auction',
			note: state.done ? (state.winner ? 'sold' : 'unsold') : `${bid.length} sealed bids in`
		},
		actions: bids.map((m) => ({
			label: m.bid ? `Bid ₹${m.amount}` : 'No bid',
			primary: !!m.bid && m.bid === bids.at(-1)?.bid,
			onclick: () => ui.onmove({ kind: 'bid', bid: m.bid ?? 0 })
		}))
	};
}

/** Knockout, Sudden Death and Survivor: who is out and what comes next. */
function laps(room: RoomData): Mat {
	const state = room.variantState!;
	const out = (state.out ?? []).map((id) => nameOf(room, id));
	const rules: Record<string, string> = {
		'knockout-1': 'The lowest hand goes after every lap, until two are left',
		'sudden-death-1': 'The stake doubles and the lowest hand goes after every lap',
		'survivor-1': 'No Show: the lowest hand goes after every lap until one is left'
	};
	return {
		layout: 'none',
		prompt: `${rules[room.rulesVersion] ?? ''}${out.length ? `. <b>Out:</b> ${out.join(', ')}` : ''}`,
		tray: { title: `Lap ${(state.laps ?? 0) + 1}`, note: `${out.length} knocked out` }
	};
}

/** Banko: the dealer is the banker. */
function banko(room: RoomData): Mat {
	return {
		layout: 'none',
		prompt: `<b>${nameOf(room, room.initiator)}</b> is the banker. Ties go to the banker`,
		tray: { title: 'Banker', note: nameOf(room, room.initiator) }
	};
}
