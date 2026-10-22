import { freshDeck } from '../classic.mjs';
import { GameError } from '../engine.mjs';

// Rule errors are GameErrors, so the room server shows players the reason, not a service failure.
const require = (ok, message, code = 'INVALID_ACTION') => {
	if (!ok) throw new GameError(message, code);
};

const seated = (room) => room.players.filter((p) => p.seatNumber !== null).sort((a, b) => a.seatNumber - b.seatNumber);
const contenders = (room) => seated(room).filter((p) => !p.folded && !p.departed);
const canAct = (room) => contenders(room).filter((p) => !p.isAllIn && p.balance > 0);
const nextAfter = (players, seat) => players.find((p) => p.seatNumber > seat) || players[0];
const rotate = (list, seat) => [...list.filter((p) => p.seatNumber > seat), ...list.filter((p) => p.seatNumber <= seat)];

export function newRoom(name, table, hostId) {
	require(typeof name === 'string' && /^[a-z0-9][a-z0-9-]{2,31}$/.test(name), 'Invalid room name');
	require(Number.isSafeInteger(table) && table >= 50 && table <= 1_000_000, 'Invalid starting chips');
	return {
		schema: 1, gameType: 'texas-holdem', rulesVersion: 'texas-holdem-1', name, table, hostId,
		players: [], readyEnabled: true, issuedChips: 0, revision: 0, handId: null,
		isStarted: false, gameShow: false, pot: 0, board: [], stage: 'waiting',
		buttonSeat: null, smallBlind: 1, bigBlind: 2, currentBet: 0, minRaise: 2,
		currentPlayerId: null, deadline: null, deck: [], result: null
	};
}

function settle(room) {
	const alive = contenders(room);
	if (alive.length === 1) {
		const winner = alive[0];
		winner.balance += room.pot;
		room.result = { winnerId: winner.id, winnerName: winner.username, amount: room.pot, reason: 'last-player', handId: room.handId, winners: [winner.id] };
	} else {
		const scores = new Map(alive.map((player) => [player.id, evaluateBestHand([...player.cards, ...room.board])]));
		const payouts = Object.fromEntries(room.players.map((p) => [p.id, 0]));
		const levels = [...new Set(room.players.map((p) => p.handBet).filter((amount) => amount > 0))].sort((a, b) => a - b);
		let previous = 0;
		for (const level of levels) {
			const contributors = room.players.filter((p) => p.handBet >= level);
			const amount = (level - previous) * contributors.length;
			const eligible = contributors.filter((p) => !p.folded);
			if (!eligible.length) {
				// When every contributor to a side-pot layer folded, its dead chips follow the surviving hands.
				const candidates = alive;
				let best = scores.get(candidates[0].id);
				for (const candidate of candidates.slice(1)) if (compareScores(scores.get(candidate.id), best) > 0) best = scores.get(candidate.id);
				const winners = candidates.filter((p) => compareScores(scores.get(p.id), best) === 0);
				for (const [id, share] of Object.entries(splitPot(amount, winners, room.buttonSeat))) payouts[id] += share;
			} else {
				let best = scores.get(eligible[0].id);
				for (const candidate of eligible.slice(1)) if (compareScores(scores.get(candidate.id), best) > 0) best = scores.get(candidate.id);
				const winners = eligible.filter((p) => compareScores(scores.get(p.id), best) === 0);
				for (const [id, share] of Object.entries(splitPot(amount, winners, room.buttonSeat))) payouts[id] += share;
			}
			previous = level;
		}
		for (const [id, amount] of Object.entries(payouts)) room.players.find((p) => p.id === id).balance += amount;
		const winnerIds = [...new Set(alive.filter((p) => payouts[p.id] > 0).map((p) => p.id))];
		const winners = winnerIds.map((id) => room.players.find((p) => p.id === id));
		room.result = { winnerId: winners[0].id, winnerName: winners.map((p) => p.username).join(' & '), amount: room.pot, reason: 'showdown', handId: room.handId, winners: winnerIds, scores: Object.fromEntries(scores) };
	}
	room.pot = 0;
	room.gameShow = true;
	room.stage = 'showdown';
	room.currentPlayerId = null;
	room.deadline = null;
	assertInvariant(room);
	return room;
}

function splitPot(pot, winners, buttonSeat) {
	const result = Object.fromEntries(winners.map((p) => [p.id, Math.floor(pot / winners.length)]));
	let odd = pot % winners.length;
	for (const player of rotate(winners, buttonSeat)) {
		if (!odd) break;
		result[player.id]++;
		odd--;
	}
	return result;
}

function nextStreet(room, ctx) {
	const next = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' }[room.stage];
	if (next === 'showdown') return settle(room);
	room.stage = next;
	room.currentBet = 0;
	room.minRaise = room.bigBlind;
	room.players.forEach((p) => { p.streetBet = 0; });
	room.acted = [];
	room.deck.shift(); // Burn one card before each community-card street.
	if (next === 'flop') room.board.push(room.deck.shift(), room.deck.shift(), room.deck.shift());
	else room.board.push(room.deck.shift());
	const actors = canAct(room);
	if (actors.length <= 1) {
		if (actors.length === 1 && contenders(room).some((p) => p.id !== actors[0].id && !p.isAllIn)) {
			room.currentPlayerId = actors[0].id;
			room.deadline = ctx.now + ctx.turnMs;
			return room;
		}
		return nextStreet(room, ctx);
	}
	room.currentPlayerId = nextAfter(actors, room.buttonSeat)?.id ?? null;
	room.deadline = room.currentPlayerId ? ctx.now + ctx.turnMs : null;
	return room;
}

function advance(room, actorSeat, ctx) {
	const alive = contenders(room);
	if (alive.length === 1) return settle(room);
	const actors = canAct(room);
	const acted = new Set(room.acted);
	const complete = actors.every((p) => p.streetBet === room.currentBet && acted.has(p.id));
	if (complete) return nextStreet(room, ctx);
	const next = nextAfter(actors, actorSeat);
	room.currentPlayerId = next?.id ?? null;
	room.deadline = next ? ctx.now + ctx.turnMs : null;
	if (!next) return nextStreet(room, ctx);
	return room;
}

export function invariant(room) {
	require(Number.isSafeInteger(room.pot) && room.pot >= 0, 'Invalid pot', 'INVARIANT');
	require(room.players.every((p) => Number.isSafeInteger(p.balance) && p.balance >= 0 && Number.isSafeInteger(p.handBet) && p.handBet >= 0), 'Invalid player chips', 'INVARIANT');
	require(room.players.reduce((sum, p) => sum + p.balance, room.pot) === room.issuedChips, 'Chip conservation failed', 'INVARIANT');
	require(new Set(seated(room).map((p) => p.seatNumber)).size === seated(room).length && seated(room).every((p) => p.seatNumber >= 0 && p.seatNumber < 6), 'Invalid seats', 'INVARIANT');
	if (room.isStarted && !room.gameShow) require(room.players.reduce((sum, p) => sum + p.handBet, 0) === room.pot, 'Contributions must equal pot', 'INVARIANT');
}

export function transition(snapshot, id, action, payload = {}, ctx = {}) {
	const room = structuredClone(snapshot);
	let player = room.players.find((p) => p.id === id);
	if (action === 'join') {
		require(typeof payload.username === 'string' && payload.username.trim().length >= 1 && payload.username.trim().length <= 24, 'Enter a player name of 1–24 characters');
		if (player && player.seatNumber !== null && !player.departed) return room;
		require(!room.isStarted || room.gameShow, 'Room already has a game in process');
		for (const departed of room.players) if (departed.departed) departed.seatNumber = null;
		const used = new Set(seated(room).map((p) => p.seatNumber));
		const seatNumber = Array.from({ length: 6 }, (_, n) => n).find((n) => !used.has(n));
		require(seatNumber !== undefined, 'Room is full');
		if (!player) {
			player = { id, username: payload.username.trim().toLowerCase(), balance: room.table, handBet: 0, streetBet: 0, seatNumber, cards: [], folded: false, isAllIn: false, ready: false, departed: false };
			room.players.push(player);
			room.issuedChips += room.table;
		} else Object.assign(player, { username: payload.username.trim().toLowerCase(), seatNumber, cards: [], folded: false, isAllIn: false, ready: false, departed: false });
		if (!room.hostId) room.hostId = id;
	} else {
		require(player && player.seatNumber !== null && !player.departed, 'Join this room first', 'NOT_MEMBER');
		if (action === 'start') {
			require(id === room.hostId, 'Only the host can start a hand', 'FORBIDDEN');
			require(!room.isStarted || room.gameShow, 'A hand is already in progress');
			const participants = seated(room).filter((p) => !p.departed && p.balance > 0 && ctx.connected?.has(p.id));
			require(participants.length >= 2, 'At least two connected players with chips are required');
			require(!room.readyEnabled || participants.every((p) => p.ready), 'Every connected player must be ready');
			const canonicalDeck = new Set(freshDeck().map((c) => `${c.rank}:${c.suit}`));
			require(Array.isArray(ctx.deck) && ctx.deck.length === 52 && new Set(ctx.deck.map((c) => `${c.rank}:${c.suit}`)).size === 52 && ctx.deck.every((c) => canonicalDeck.has(`${c.rank}:${c.suit}`)), 'Invalid server deck', 'INVARIANT');
			room.players.forEach((p) => { p.cards = []; p.handBet = 0; p.streetBet = 0; p.folded = true; p.isAllIn = false; p.ready = false; });
			participants.forEach((p) => { p.folded = false; });
			const previousButton = room.buttonSeat;
			const button = previousButton === null ? participants[0] : nextAfter(participants, previousButton);
			room.buttonSeat = button.seatNumber;
			room.smallBlind = 1;
			room.bigBlind = 2;
			room.deck = structuredClone(ctx.deck);
			room.board = [];
			for (let i = 0; i < 2; i++) for (const p of rotate(participants, button.seatNumber)) p.cards.push(room.deck.shift());
			const small = participants.length === 2 ? button : nextAfter(participants, button.seatNumber);
			const big = nextAfter(participants, small.seatNumber);
			for (const [p, blind] of [[small, room.smallBlind], [big, room.bigBlind]]) {
				const paid = Math.min(p.balance, blind);
				p.balance -= paid; p.handBet += paid; p.streetBet = paid; room.pot += paid;
				if (!p.balance) p.isAllIn = true;
			}
			room.currentBet = room.bigBlind;
			room.minRaise = room.bigBlind;
			room.acted = [];
			room.stage = 'preflop';
			room.isStarted = true; room.gameShow = false; room.result = null; room.handId = ctx.handId;
			room.currentPlayerId = nextAfter(canAct(room), big.seatNumber)?.id ?? null;
			room.deadline = room.currentPlayerId ? ctx.now + ctx.turnMs : null;
			if (!room.currentPlayerId) nextStreet(room, ctx);
		} else if (action === 'ready') {
			require((!room.isStarted || room.gameShow) && typeof payload.ready === 'boolean', 'Readiness is unavailable');
			player.ready = payload.ready;
		} else if (action === 'leave') {
			player.departed = true;
			if (room.isStarted && !player.folded) { player.folded = true; advance(room, player.seatNumber, ctx); }
			if (!room.isStarted || room.gameShow) player.seatNumber = null;
			if (room.hostId === id) room.hostId = seated(room).find((p) => !p.departed)?.id ?? null;
		} else {
			require(room.isStarted && !player.folded && room.currentPlayerId === id, 'It is not your turn', 'OUT_OF_TURN');
			require(ctx.now < room.deadline || action === 'timeout', 'Turn has expired', 'STALE_TURN');
			const toCall = Math.max(0, room.currentBet - player.streetBet);
			if (action === 'fold' || action === 'timeout') {
				if (action === 'timeout') require(ctx.now >= room.deadline, 'Turn has not expired');
				player.folded = true;
			} else if (action === 'check') require(toCall === 0, 'Cannot check while facing a bet');
			else if (action === 'call') {
				require(toCall > 0, 'Nothing to call');
				const paid = Math.min(player.balance, toCall);
				player.balance -= paid; player.handBet += paid; player.streetBet += paid; room.pot += paid;
				if (!player.balance) player.isAllIn = true;
			} else if (action === 'raise') {
				const target = payload.amount;
				require(Number.isSafeInteger(target) && target > room.currentBet, 'Raise must exceed the current bet');
				const raiseBy = target - room.currentBet;
				const isAllIn = target - player.streetBet === player.balance;
				require(!room.acted.includes(id), 'A short all-in does not reopen raising');
				require(raiseBy >= room.minRaise || isAllIn, `Minimum raise is ${room.minRaise}`);
				const paid = target - player.streetBet;
				require(paid <= player.balance, 'Insufficient chips');
				player.balance -= paid; player.handBet += paid; player.streetBet = target; room.pot += paid;
				if (raiseBy >= room.minRaise) room.acted = [];
				room.minRaise = Math.max(room.minRaise, raiseBy); room.currentBet = target;
				if (!player.balance) player.isAllIn = true;
			} else throw new GameError('Unknown Poker action');
			if (!room.acted.includes(id)) room.acted.push(id);
			advance(room, player.seatNumber, ctx);
		}
	}
	room.revision++;
	assertInvariant(room);
	return room;
}

export function assertInvariant(room) { invariant(room); }

export function projection(room, id, connected) {
	const player = room.players.find((p) => p.id === id);
	require(player && player.seatNumber !== null && !player.departed, 'Not a room member', 'NOT_MEMBER');
	const list = seated(room);
	const reveal = room.gameShow && room.result?.reason === 'showdown';
	const toCall = Math.max(0, room.currentBet - player.streetBet);
	return {
		name: room.name, gameType: 'texas-holdem', table: room.table, selfId: id, hostId: room.hostId,
		revision: room.revision, handId: room.handId, rulesVersion: room.rulesVersion,
		isStarted: room.isStarted, gameShow: room.gameShow, stage: room.stage,
		board: structuredClone(room.board), buttonSeat: room.buttonSeat, smallBlind: room.smallBlind, bigBlind: room.bigBlind,
		currentBet: room.currentBet, minRaise: room.minRaise,
		currentPlayer: list.findIndex((p) => p.id === room.currentPlayerId), pot: room.pot, deadline: room.deadline,
		result: room.result ? structuredClone(room.result) : null,
		usersList: list.map((p) => ({ id: p.id, username: p.username, balance: p.balance, handBet: p.handBet,
			seatNumber: p.seatNumber, isBlind: false, isPacked: p.folded, folded: p.folded, isAllIn: p.isAllIn,
			streetBet: p.streetBet, connected: connected.has(p.id), ready: p.ready === true, hasLeft: p.departed,
			cardsInHand: (p.id === id || (reveal && !p.folded)) ? structuredClone(p.cards) : p.cards.map(() => ({ rank: 0, suit: '' })) })),
		legalActions: { start: id === room.hostId && (!room.isStarted || room.gameShow), ready: !room.isStarted || room.gameShow,
			check: room.isStarted && room.currentPlayerId === id && toCall === 0,
			call: room.isStarted && room.currentPlayerId === id && toCall > 0,
			fold: room.isStarted && room.currentPlayerId === id,
				raise: room.isStarted && room.currentPlayerId === id && player.balance > toCall && !room.acted.includes(id),
			toCall, minRaiseTo: room.currentBet + room.minRaise, maxRaiseTo: player.streetBet + player.balance }
	};
}

export function evaluateBestHand(cards) {
	require(cards.length >= 5 && cards.length <= 7, 'Hold’em hand evaluation requires five to seven cards');
	require(cards.every((c) => Number.isInteger(c.rank) && c.rank >= 2 && c.rank <= 14 && ['hearts', 'spades', 'diamonds', 'clubs'].includes(c.suit)), 'Invalid Hold’em card');
	require(new Set(cards.map((c) => `${c.rank}:${c.suit}`)).size === cards.length, 'Duplicate Hold’em card');
	let best = null;
	for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
		for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
			for (let e = d + 1; e < cards.length; e++) {
				const score = scoreFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
				if (!best || compareScores(score, best) > 0) best = score;
			}
	return best;
}

function scoreFive(cards) {
	const ranks = cards.map((c) => c.rank === 14 ? 14 : c.rank).sort((a, b) => b - a);
	const counts = new Map();
	for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
	const groups = [...counts].map(([rank, count]) => ({ rank, count })).sort((a, b) => b.count - a.count || b.rank - a.rank);
	const flush = cards.every((c) => c.suit === cards[0].suit);
	const unique = [...new Set(ranks)];
	const straightHigh = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0] :
		(unique.join(',') === '14,5,4,3,2' ? 5 : 0);
	if (flush && straightHigh) return [8, straightHigh];
	if (groups[0].count === 4) return [7, groups[0].rank, groups[1].rank];
	if (groups[0].count === 3 && groups[1].count === 2) return [6, groups[0].rank, groups[1].rank];
	if (flush) return [5, ...ranks];
	if (straightHigh) return [4, straightHigh];
	if (groups[0].count === 3) return [3, groups[0].rank, ...groups.slice(1).map((g) => g.rank).sort((a, b) => b - a)];
	if (groups[0].count === 2 && groups[1].count === 2) return [2, groups[0].rank, groups[1].rank, groups[2].rank];
	if (groups[0].count === 2) return [1, groups[0].rank, ...groups.slice(1).map((g) => g.rank).sort((a, b) => b - a)];
	return [0, ...ranks];
}

export function compareScores(a, b) {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const delta = (a[i] ?? 0) - (b[i] ?? 0);
		if (delta) return delta;
	}
	return 0;
}

