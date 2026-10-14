import { freshDeck } from '../classic.mjs';

const fail = (condition, message, code = 'INVALID_ACTION') => {
	if (!condition) {
		const error = new Error(message);
		error.code = code;
		throw error;
	}
};
const seated = (room) => room.players.filter((player) => player.seatNumber !== null).sort((a, b) => a.seatNumber - b.seatNumber);
const activePlayers = (room) => seated(room).filter((player) => !player.departed && player.balance >= 0);
const nextPlayer = (room, afterSeat) => {
	const candidates = activePlayers(room).filter((player) => player.status === 'playing');
	return candidates.find((player) => player.seatNumber > afterSeat) ?? candidates[0] ?? null;
};

export function handValue(cards) {
	let total = 0;
	let aces = 0;
	for (const card of cards) {
		fail(Number.isInteger(card.rank) && card.rank >= 2 && card.rank <= 14, 'Invalid Blackjack card', 'INVARIANT');
		if (card.rank === 14) {
			total += 11;
			aces++;
		} else total += Math.min(card.rank, 10);
	}
	while (total > 21 && aces > 0) {
		total -= 10;
		aces--;
	}
	return { total, soft: aces > 0 };
}

const natural = (cards) => cards.length === 2 && handValue(cards).total === 21;
const cardKey = (card) => `${card.rank}:${card.suit}`;
function validateDeck(deck) {
	const canonical = new Set(freshDeck().map(cardKey));
	fail(Array.isArray(deck) && deck.length === 52 && new Set(deck.map(cardKey)).size === 52 && deck.every((card) => canonical.has(cardKey(card))), 'Invalid server deck', 'INVARIANT');
}
function setTurn(room, player, ctx) {
	room.currentPlayerId = player?.id ?? null;
	room.deadline = player ? ctx.now + ctx.turnMs : null;
}
function dealerPlay(room) {
	room.stage = 'dealer';
	while (handValue(room.dealerCards).total < 17 && room.deck.length) room.dealerCards.push(room.deck.shift());
	const dealer = handValue(room.dealerCards).total;
	const dealerBust = dealer > 21;
	let returned = 0;
	const winners = [];
	const payouts = [];
	for (const player of room.players) {
		// `blackjackBet` is the player's next-hand setting and remains populated
		// for seated or previously departed players. `handBet` is cleared at
		// hand start and only set when this hand actually collects a wager.
		if (!player.handBet) continue;
		const bet = player.blackjackBet;
		const value = handValue(player.cards).total;
		let payout = 0;
		let outcome = 'lose';
		if (player.status === 'blackjack' && natural(room.dealerCards)) {
			payout = bet;
			outcome = 'push';
		} else if (player.status === 'blackjack') {
			payout = bet + Math.floor((bet * 3) / 2);
			outcome = 'blackjack';
		} else if (player.status !== 'bust' && natural(room.dealerCards)) {
			outcome = 'dealer-blackjack';
		} else if (player.status !== 'bust' && (dealerBust || value > dealer)) {
			payout = bet * 2;
			outcome = 'win';
		} else if (player.status !== 'bust' && value === dealer) {
			payout = bet;
			outcome = 'push';
		}
		player.balance += payout;
		player.blackjackOutcome = outcome;
		player.status = 'done';
		returned += payout;
		if (payout > bet) winners.push(player);
		payouts.push({ playerId: player.id, username: player.username, bet, payout, outcome });
	}
	const wagered = room.pot;
	room.pot = 0;
	room.issuedChips += returned - wagered;
	room.stage = 'settled';
	room.gameShow = true;
	room.currentPlayerId = null;
	room.deadline = null;
	const winnerName = winners.length ? winners.map((player) => player.username).join(' & ') : (payouts.every((entry) => entry.outcome === 'push') ? 'Push' : 'Dealer');
	room.result = {
		winnerId: winners[0]?.id ?? 'dealer',
		winnerName,
		amount: Math.max(0, returned - payouts.reduce((sum, entry) => sum + entry.bet, 0)),
		reason: 'blackjack-settlement',
		handId: room.handId,
		payouts
	};
	return room;
}
function advance(room, afterSeat, ctx) {
	const next = nextPlayer(room, afterSeat);
	if (next) setTurn(room, next, ctx);
	else dealerPlay(room);
}

export function newRoom(name, table, hostId) {
	fail(typeof name === 'string' && /^[a-z0-9][a-z0-9-]{2,31}$/.test(name), 'Invalid room name');
	fail(Number.isSafeInteger(table) && table >= 50 && table <= 1_000_000, 'Invalid starting chips');
	return {
		schema: 1,
		gameType: 'blackjack',
		rulesVersion: 'blackjack-1',
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
		dealerCards: [],
		currentPlayerId: null,
		deadline: null,
		deck: [],
		result: null
	};
}

export function invariant(room) {
	fail(Number.isSafeInteger(room.pot) && room.pot >= 0, 'Invalid Blackjack pot', 'INVARIANT');
	fail(room.players.every((player) => Number.isSafeInteger(player.balance) && player.balance >= 0), 'Invalid Blackjack balance', 'INVARIANT');
	fail(room.players.reduce((sum, player) => sum + player.balance, room.pot) === room.issuedChips, 'Blackjack chip conservation failed', 'INVARIANT');
	const seats = seated(room).map((player) => player.seatNumber);
	fail(new Set(seats).size === seats.length && seats.every((seat) => seat >= 0 && seat < 6), 'Invalid Blackjack seats', 'INVARIANT');
	if (room.isStarted && !room.gameShow) fail(room.players.filter((player) => player.status !== 'waiting').reduce((sum, player) => sum + (player.blackjackBet ?? 0), 0) === room.pot, 'Blackjack wagers must equal the pot', 'INVARIANT');
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
			player = { id, username: payload.username.trim().toLowerCase(), balance: room.table, handBet: 0, seatNumber, cards: [], ready: false, departed: false, status: 'waiting', blackjackBet: 2 };
			room.players.push(player);
			room.issuedChips += room.table;
		} else Object.assign(player, { username: payload.username.trim().toLowerCase(), seatNumber, cards: [], ready: false, departed: false, status: 'waiting', blackjackBet: 2, handBet: 0 });
		if (!room.hostId) room.hostId = id;
	} else {
		fail(player && player.seatNumber !== null && !player.departed, 'Join this room first', 'NOT_MEMBER');
		if (action === 'ready') {
			fail(!room.isStarted || room.gameShow, 'Readiness is locked during a hand');
			fail(typeof payload.ready === 'boolean', 'Invalid ready state');
			player.ready = payload.ready;
		} else if (action === 'bet') {
			fail(!room.isStarted || room.gameShow, 'Wagers are locked during a hand');
			fail(Number.isSafeInteger(payload.amount) && payload.amount >= 2 && payload.amount % 2 === 0 && payload.amount <= player.balance, 'Blackjack bet must be an even amount from 2 up to your balance');
			player.blackjackBet = payload.amount;
			player.ready = false;
		} else if (action === 'start') {
			fail(id === room.hostId, 'Only the host can start a hand', 'FORBIDDEN');
			fail(!room.isStarted || room.gameShow, 'A hand is already in progress');
			const participants = seated(room).filter((candidate) => !candidate.departed && candidate.balance >= 2 && ctx.connected?.has(candidate.id));
			fail(participants.length >= 1, 'At least one connected player with chips is required');
			fail(participants.every((candidate) => candidate.ready), 'Every connected player must be ready');
			validateDeck(ctx.deck);
			for (const old of room.players) {
				old.cards = [];
				old.handBet = 0;
				if (old.balance >= 2) old.blackjackBet = Math.min(old.blackjackBet ?? 2, old.balance - (old.balance % 2));
				old.status = 'waiting';
				old.ready = false;
				delete old.blackjackOutcome;
			}
			for (const candidate of participants) fail(candidate.blackjackBet >= 2 && candidate.blackjackBet <= candidate.balance && candidate.blackjackBet % 2 === 0, `${candidate.username} needs a valid even wager`);
			room.deck = structuredClone(ctx.deck);
			room.dealerCards = [];
			room.handId = ctx.handId;
			room.pot = 0;
			room.result = null;
			room.gameShow = false;
			room.isStarted = true;
			room.stage = 'players';
			for (const candidate of participants) {
				candidate.balance -= candidate.blackjackBet;
				candidate.handBet = candidate.blackjackBet;
				room.pot += candidate.blackjackBet;
				candidate.status = 'playing';
			}
			for (let round = 0; round < 2; round++) {
				for (const candidate of participants) candidate.cards.push(room.deck.shift());
				room.dealerCards.push(room.deck.shift());
			}
			for (const candidate of participants) if (natural(candidate.cards)) candidate.status = 'blackjack';
			const first = nextPlayer(room, -1);
			if (first) setTurn(room, first, ctx);
			else dealerPlay(room);
		} else if (action === 'leave') {
			player.departed = true;
			if (room.isStarted && !room.gameShow && player.status === 'playing') {
				player.status = 'stand';
				if (room.currentPlayerId === id) advance(room, player.seatNumber, ctx);
			}
			if (!room.isStarted || room.gameShow) player.seatNumber = null;
			if (room.hostId === id) room.hostId = seated(room).find((candidate) => !candidate.departed)?.id ?? null;
		} else {
			fail(room.isStarted && !room.gameShow && room.stage === 'players', 'No active Blackjack hand');
			fail(room.currentPlayerId === id && player.status === 'playing', 'It is not your turn', 'OUT_OF_TURN');
			fail(ctx.now < room.deadline || action === 'timeout', 'Turn has expired', 'STALE_TURN');
			if (action === 'timeout' || action === 'stand') {
				if (action === 'timeout') fail(ctx.now >= room.deadline, 'Turn has not expired');
				player.status = 'stand';
			} else if (action === 'hit') {
				fail(room.deck.length > 0, 'No cards remain in the shoe');
				player.cards.push(room.deck.shift());
				const total = handValue(player.cards).total;
				if (total > 21) player.status = 'bust';
				else if (total === 21) player.status = 'stand';
			} else if (action === 'double') {
				fail(player.cards.length === 2 && player.balance >= player.blackjackBet, 'Double is available on your first two cards when you can match your wager');
				const extraWager = player.blackjackBet;
				player.balance -= extraWager;
				player.handBet += extraWager;
				player.blackjackBet += extraWager;
				room.pot += extraWager;
				fail(room.deck.length > 0, 'No cards remain in the shoe', 'INVARIANT');
				player.cards.push(room.deck.shift());
				player.status = handValue(player.cards).total > 21 ? 'bust' : 'stand';
			} else fail(false, 'Unknown Blackjack action');
			if (player.status !== 'playing') advance(room, player.seatNumber, ctx);
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
	const reveal = room.gameShow;
	return {
		name: room.name,
		gameType: 'blackjack',
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
		dealerCards: room.dealerCards.map((card, index) => index === 1 && !reveal ? { rank: 0, suit: '' } : structuredClone(card)),
		dealerTotal: reveal ? handValue(room.dealerCards).total : (room.dealerCards[0] ? handValue([room.dealerCards[0]]).total : null),
		currentPlayer: list.findIndex((candidate) => candidate.id === room.currentPlayerId),
		currentPlayerId: room.currentPlayerId,
		deadline: room.deadline,
		result: room.result ? structuredClone(room.result) : null,
		usersList: list.map((candidate) => ({
			id: candidate.id,
			username: candidate.username,
			balance: candidate.balance,
			handBet: candidate.handBet ?? null,
			seatNumber: candidate.seatNumber,
			isBlind: false,
			isPacked: candidate.status === 'bust' || candidate.status === 'done',
			status: candidate.status,
			wager: candidate.blackjackBet,
			blackjackOutcome: candidate.blackjackOutcome ?? null,
			connected: connected.has(candidate.id),
			ready: candidate.ready === true,
			hasLeft: candidate.departed,
			cardsInHand: candidate.id === id || reveal ? structuredClone(candidate.cards) : candidate.cards.map(() => ({ rank: 0, suit: '' }))
		})),
		legalActions: {
			start: id === room.hostId && (!room.isStarted || room.gameShow),
			ready: !room.isStarted || room.gameShow,
			setBet: !room.isStarted || room.gameShow,
			hit: room.stage === 'players' && room.currentPlayerId === id && player.status === 'playing',
			stand: room.stage === 'players' && room.currentPlayerId === id && player.status === 'playing',
			double: room.stage === 'players' && room.currentPlayerId === id && player.status === 'playing' && player.cards.length === 2 && player.balance >= player.blackjackBet
		}
	};
}
