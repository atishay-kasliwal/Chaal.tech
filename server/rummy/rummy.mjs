import { freshDeck } from '../classic.mjs';
import { GameError } from '../engine.mjs';

// Rule errors are GameErrors, so the room server shows players the reason, not a service failure.
const fail = (condition, message, code = 'INVALID_ACTION') => {
	if (!condition) throw new GameError(message, code);
};
const seated = (room) => room.players.filter((player) => player.seatNumber !== null).sort((a, b) => a.seatNumber - b.seatNumber);
const alive = (room) => seated(room).filter((player) => !player.departed && !player.dropped);
const cardKey = (card) => `${card.rank}:${card.suit}:${card.copy ?? 0}`;
const isWild = (card, wildRank) => card.suit === 'joker' || card.rank === wildRank;
const faceValue = (card) => card.rank === 0 ? 0 : Math.min(card.rank, 10);

export function freshRummyDeck() {
	const pack = (copy) => freshDeck().map((card) => ({ ...card, copy }));
	return [
		...pack(0),
		...pack(1),
		{ rank: 0, suit: 'joker', copy: 0 },
		{ rank: 0, suit: 'joker', copy: 1 },
		{ rank: 0, suit: 'joker', copy: 2 },
		{ rank: 0, suit: 'joker', copy: 3 }
	];
}

export function isValidIndianRummyHand(cards, wildRank) {
	return minimumPenalty(cards, wildRank) === 0;
}

export function minimumPenalty(cards, wildRank) {
	if (!Array.isArray(cards) || cards.length !== 13 || !Number.isInteger(wildRank) || wildRank < 2 || wildRank > 14) return 80;
	const groups = enumerateMelds(cards, wildRank);
	const byCard = Array.from({ length: cards.length }, () => []);
	for (const group of groups) for (let i = 0; i < cards.length; i++) if ((group.mask & (1 << i)) !== 0) byCard[i].push(group);
	const memo = new Map();
	function solve(mask, pureSeen, sequences) {
		if (!mask) return pureSeen && sequences >= 2 ? 0 : 80;
		const key = `${mask}:${pureSeen ? 1 : 0}:${Math.min(sequences, 2)}`;
		if (memo.has(key)) return memo.get(key);
		const i = Math.clz32(mask & -mask) ^ 31;
		const without = mask & ~(1 << i);
		let best = Math.min(80, faceValue(cards[i]) + solve(without, pureSeen, sequences));
		for (const group of byCard[i]) {
			if ((group.mask & mask) !== group.mask) continue;
			best = Math.min(best, solve(mask ^ group.mask, pureSeen || group.pure, sequences + (group.sequence ? 1 : 0)));
			if (best === 0) break;
		}
		memo.set(key, best);
		return best;
	}
	return Math.min(80, solve((1 << cards.length) - 1, false, 0));
}

function enumerateMelds(cards, wildRank) {
	const groups = [];
	const limit = 1 << cards.length;
	for (let mask = 1; mask < limit; mask++) {
		const size = popcount(mask);
		if (size < 3) continue;
		const selected = [];
		for (let i = 0; i < cards.length; i++) if (mask & (1 << i)) selected.push(cards[i]);
		const naturals = selected.filter((card) => !isWild(card, wildRank));
		const wildCount = size - naturals.length;

		let sequence = false;
		let pure = false;
		const suit = naturals[0]?.suit;
		const ranks = naturals.map((card) => card.rank);
		const oneSuit = naturals.every((card) => card.suit === suit);
		const distinctRanks = new Set(ranks).size === ranks.length;
		if (oneSuit && distinctRanks) {
			if (size === 3 && ranks.includes(14) && ranks.includes(2) && ranks.includes(3)) sequence = true;
			for (let start = 2; !sequence && start + size - 1 <= 14; start++) {
				if (ranks.every((rank) => rank >= start && rank < start + size)) sequence = true;
			}
			pure = sequence && wildCount === 0;
		}
		if (sequence) groups.push({ mask, sequence: true, pure });

		const distinctSuits = new Set(naturals.map((card) => card.suit)).size === naturals.length;
		const sameRank = naturals.length === 0 || naturals.every((card) => card.rank === naturals[0].rank);
		if (size <= 4 && distinctSuits && sameRank) groups.push({ mask, sequence: false, pure: false });
	}
	return groups;
}

function popcount(value) {
	let count = 0;
	while (value) {
		value &= value - 1;
		count++;
	}
	return count;
}

function nextTurn(room, afterSeat, ctx) {
	const players = alive(room);
	const next = players.find((player) => player.seatNumber > afterSeat) ?? players[0] ?? null;
	room.currentPlayerId = next?.id ?? null;
	room.deadline = next ? ctx.now + ctx.turnMs : null;
	room.hasDrawn = false;
}
function finish(room, winner, ctx) {
	const losses = [];
	for (const player of room.players) {
		if (player.id === winner?.id || !player.cards?.length) continue;
		const points = Math.min(player.balance, minimumPenalty(player.cards, room.wildRank));
		player.balance -= points;
		losses.push({ playerId: player.id, points });
	}
	const amount = losses.reduce((sum, loss) => sum + loss.points, 0);
	if (winner) winner.balance += amount;
	room.pot = 0;
	room.isStarted = true;
	room.gameShow = true;
	room.stage = 'settled';
	room.currentPlayerId = null;
	room.deadline = null;
	room.result = {
		winnerId: winner?.id ?? 'none',
		winnerName: winner?.username ?? 'No winner',
		amount,
		reason: winner ? 'valid-declaration' : 'abandoned',
		handId: room.handId,
		losses
	};
	void ctx;
	return room;
}
function assertDeck(deck) {
	const canonical = new Set(freshRummyDeck().map(cardKey));
	fail(Array.isArray(deck) && deck.length === 108 && new Set(deck.map(cardKey)).size === 108 && deck.every((card) => canonical.has(cardKey(card))), 'Invalid Rummy deck', 'INVARIANT');
}

export function newRoom(name, table, hostId) {
	fail(typeof name === 'string' && /^[a-z0-9][a-z0-9-]{2,31}$/.test(name), 'Invalid room name');
	fail(Number.isSafeInteger(table) && table >= 50 && table <= 1_000_000, 'Invalid starting chips');
	return {
		schema: 1,
		gameType: 'rummy',
		rulesVersion: 'indian-rummy-13-1',
		name,
		table,
		hostId,
		players: [],
		readyEnabled: true,
		issuedChips: 0,
		revision: 0,
		handId: null,
		isStarted: false,
		gameShow: false,
		pot: 0,
		stage: 'waiting',
		deck: [],
		discardPile: [],
		wildRank: 14,
		indicator: null,
		currentPlayerId: null,
		deadline: null,
		result: null
	};
}

export function invariant(room) {
	fail(Number.isSafeInteger(room.pot) && room.pot === 0, 'Rummy does not use a betting pot', 'INVARIANT');
	fail(room.players.every((player) => Number.isSafeInteger(player.balance) && player.balance >= 0), 'Invalid Rummy balance', 'INVARIANT');
	fail(room.players.reduce((sum, player) => sum + player.balance, 0) === room.issuedChips, 'Rummy chip conservation failed', 'INVARIANT');
	const seats = seated(room).map((player) => player.seatNumber);
	fail(new Set(seats).size === seats.length && seats.every((seat) => seat >= 0 && seat < 6), 'Invalid Rummy seats', 'INVARIANT');
	if (room.stage === 'players') for (const player of room.players) if (!player.departed && !player.dropped) fail(player.cards.length === (player.id === room.currentPlayerId && room.hasDrawn ? 14 : 13), 'Indian Rummy hand must contain 13 cards outside a draw', 'INVARIANT');
}

export function transition(snapshot, id, action, payload = {}, ctx = {}) {
	const room = structuredClone(snapshot);
	let player = room.players.find((candidate) => candidate.id === id);
	if (action === 'join') {
		fail(typeof payload.username === 'string' && payload.username.trim().length >= 1 && payload.username.trim().length <= 24, 'Enter a player name of 1–24 characters');
		if (player && player.seatNumber !== null && !player.departed) return room;
		fail(!room.isStarted || room.gameShow, 'Room already has a game in process');
		for (const old of room.players) if (old.departed) old.seatNumber = null;
		const used = new Set(seated(room).map((candidate) => candidate.seatNumber));
		const seatNumber = Array.from({ length: 6 }, (_, n) => n).find((n) => !used.has(n));
		fail(seatNumber !== undefined, 'Room is full');
		if (!player) {
			player = { id, username: payload.username.trim().toLowerCase(), balance: room.table, handBet: 0, seatNumber, cards: [], ready: false, departed: false, dropped: false };
			room.players.push(player);
			room.issuedChips += room.table;
		} else Object.assign(player, { username: payload.username.trim().toLowerCase(), seatNumber, cards: [], ready: false, departed: false, dropped: false, handBet: 0 });
		if (!room.hostId) room.hostId = id;
	} else {
		fail(player && player.seatNumber !== null && !player.departed, 'Join this room first', 'NOT_MEMBER');
		if (action === 'ready') {
			fail(!room.isStarted || room.gameShow, 'Readiness is locked during a round');
			fail(typeof payload.ready === 'boolean', 'Invalid ready state');
			player.ready = payload.ready;
		} else if (action === 'start') {
			fail(id === room.hostId, 'Only the host can start a round', 'FORBIDDEN');
			fail(!room.isStarted || room.gameShow, 'A round is already in progress');
			const participants = seated(room).filter((candidate) => !candidate.departed && !candidate.dropped && candidate.balance > 0 && ctx.connected?.has(candidate.id));
			fail(participants.length >= 2, 'At least two connected players with chips are required');
			fail(participants.every((candidate) => candidate.ready), 'Every connected player must be ready');
			assertDeck(ctx.deck);
			for (const old of room.players) if (old.departed) old.seatNumber = null;
			room.players.forEach((candidate) => { candidate.cards = []; candidate.handBet = 0; candidate.dropped = true; candidate.ready = false; });
			participants.forEach((candidate) => { candidate.dropped = false; });
			room.deck = structuredClone(ctx.deck);
			const indicatorIndex = room.deck.findIndex((card) => card.rank > 0);
			room.indicator = room.deck.splice(indicatorIndex, 1)[0];
			room.wildRank = room.indicator.rank;
			for (let dealt = 0; dealt < 13; dealt++) for (const candidate of participants) candidate.cards.push(room.deck.shift());
			room.discardPile = [room.deck.shift()];
			room.handId = ctx.handId;
			room.pot = 0;
			room.result = null;
			room.gameShow = false;
			room.isStarted = true;
			room.stage = 'players';
			nextTurn(room, player.seatNumber, ctx);
		} else if (action === 'leave') {
			player.departed = true;
			if (room.stage === 'players') {
				player.dropped = true;
				if (alive(room).length <= 1) finish(room, alive(room)[0] ?? null, ctx);
				else if (room.currentPlayerId === id) nextTurn(room, player.seatNumber, ctx);
			}
			if (!room.isStarted || room.gameShow) player.seatNumber = null;
			if (room.hostId === id) room.hostId = seated(room).find((candidate) => !candidate.departed)?.id ?? null;
		} else {
			fail(room.stage === 'players' && room.currentPlayerId === id && !player.dropped, 'It is not your turn', 'OUT_OF_TURN');
			fail(ctx.now < room.deadline || action === 'timeout', 'Turn has expired', 'STALE_TURN');
			if (action === 'draw-stock' || action === 'timeout') {
				if (action === 'timeout') fail(ctx.now >= room.deadline, 'Turn has not expired');
				if (!room.deck.length) {
					const top = room.discardPile.at(-1);
					fail(Array.isArray(ctx.recycledDeck) && ctx.recycledDeck.length > 0, 'Stock is empty; discard pile cannot be recycled', 'NO_STOCK');
					room.deck = structuredClone(ctx.recycledDeck);
					room.discardPile = [top];
				}
				player.cards.push(room.deck.shift());
				room.hasDrawn = true;
				if (action === 'timeout') {
					room.discardPile.push(player.cards.pop());
					nextTurn(room, player.seatNumber, ctx);
				}
			} else if (action === 'draw-discard') {
				fail(!room.hasDrawn && room.discardPile.length > 0, 'There is no discard available to draw');
				player.cards.push(room.discardPile.pop());
				room.hasDrawn = true;
			} else if (action === 'discard') {
				fail(room.hasDrawn && player.cards.length === 14, 'Draw a card before discarding');
				fail(Number.isInteger(payload.index) && payload.index >= 0 && payload.index < player.cards.length, 'Select a card to discard');
				room.discardPile.push(player.cards.splice(payload.index, 1)[0]);
				nextTurn(room, player.seatNumber, ctx);
			} else if (action === 'declare') {
				fail(room.hasDrawn && player.cards.length === 14, 'Draw before declaring');
				fail(Number.isInteger(payload.index) && payload.index >= 0 && payload.index < player.cards.length, 'Select the card to discard with your declaration');
				const discarded = player.cards[payload.index];
				const finalHand = player.cards.filter((_, index) => index !== payload.index);
				fail(isValidIndianRummyHand(finalHand, room.wildRank), 'Invalid declaration: make 13 cards with two sequences, including one pure sequence');
				player.cards = finalHand;
				room.discardPile.push(discarded);
				finish(room, player, ctx);
			} else fail(false, 'Unknown Indian Rummy action');
		}
	}
	room.revision++;
	invariant(room);
	return room;
}

export function projection(room, id, connected) {
	const player = room.players.find((candidate) => candidate.id === id);
	fail(player && player.seatNumber !== null && !player.departed, 'Not a room member', 'NOT_MEMBER');
	const list = seated(room);
	return {
		name: room.name,
		gameType: 'rummy',
		table: room.table,
		selfId: id,
		hostId: room.hostId,
		revision: room.revision,
		handId: room.handId,
		rulesVersion: room.rulesVersion,
		isStarted: room.isStarted,
		gameShow: room.gameShow,
		stage: room.stage,
		pot: room.pot,
		wildRank: room.wildRank,
		indicator: structuredClone(room.indicator),
		stockCount: room.deck.length,
		discardPile: room.discardPile.length ? [structuredClone(room.discardPile.at(-1))] : [],
		hasDrawn: room.currentPlayerId === id && room.hasDrawn,
		currentPlayer: list.findIndex((candidate) => candidate.id === room.currentPlayerId),
		currentPlayerId: room.currentPlayerId,
		deadline: room.deadline,
		result: room.result ? structuredClone(room.result) : null,
		usersList: list.map((candidate) => ({
			id: candidate.id,
			username: candidate.username,
			balance: candidate.balance,
			handBet: null,
			seatNumber: candidate.seatNumber,
			isBlind: false,
			isPacked: candidate.dropped,
			status: candidate.dropped ? 'Dropped' : undefined,
			connected: connected.has(candidate.id),
			ready: candidate.ready === true,
			hasLeft: candidate.departed,
			cardCount: candidate.cards.length,
			cardsInHand: candidate.id === id || room.gameShow ? structuredClone(candidate.cards) : candidate.cards.map(() => ({ rank: 0, suit: '' }))
		})),
		legalActions: {
			start: id === room.hostId && (!room.isStarted || room.gameShow),
			ready: !room.isStarted || room.gameShow,
			drawStock: room.stage === 'players' && room.currentPlayerId === id && !room.hasDrawn,
			drawDiscard: room.stage === 'players' && room.currentPlayerId === id && !room.hasDrawn && room.discardPile.length > 0,
			discard: room.stage === 'players' && room.currentPlayerId === id && room.hasDrawn,
			declare: room.stage === 'players' && room.currentPlayerId === id && room.hasDrawn
		}
	};
}
