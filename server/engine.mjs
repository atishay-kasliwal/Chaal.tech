import { freshDeck } from './classic.mjs';
import { DEFAULT_RULES_VERSION, getVariant } from './variants/index.mjs';
import { getGameEngine } from './games/index.mjs';

export class GameError extends Error {
	constructor(message, code = 'INVALID_ACTION') {
		super(message);
		this.code = code;
	}
}
const require = (condition, message, code) => {
	if (!condition) throw new GameError(message, code);
};
function variantFor(room) {
	const variant = getVariant(room.rulesVersion);
	require(variant, 'Unsupported game rules version', 'UNSUPPORTED_RULES');
	return variant;
}
const seated = (room) =>
	room.players.filter((p) => p.seatNumber !== null).sort((a, b) => a.seatNumber - b.seatNumber);
const active = (room) => {
	const cardCount = variantFor(room).cardsPerPlayer ?? 3;
	return seated(room).filter((p) => p.cards.length === cardCount && !p.isPacked && !p.departed);
};
export const playing = (room) => room.isStarted && !room.gameShow;

export function roomName(value) {
	require(typeof value === 'string' &&
		/^[a-z0-9][a-z0-9-]{2,31}$/.test(
			value
		), 'Use a room name of 3–32 lowercase letters, numbers or hyphens');
	return value;
}
export function newRoom(name, table, hostId, rulesVersion = DEFAULT_RULES_VERSION) {
	roomName(name);
	require(typeof rulesVersion === 'string' &&
		getVariant(rulesVersion), 'Unsupported game rules version', 'UNSUPPORTED_RULES');
	require(Number.isSafeInteger(table) &&
		table >= 50 &&
		table <= 1_000_000, 'Starting chips must be an integer from 50 to 1000000');
	return {
		schema: 1,
		rulesVersion,
		name,
		table,
		hostId,
		players: [],
		readyEnabled: false,
		issuedChips: 0,
		revision: 0,
		handId: null,
		isStarted: false,
		gameShow: false,
		pot: 0,
		maxStake: 2,
		currentPlayerId: null,
		initiator: null,
		deadline: null,
		deck: [],
		result: null
	};
}
export function limits(room, player) {
	return player.isBlind
		? { min: Math.ceil(room.maxStake / 2), max: room.maxStake }
		: { min: room.maxStake, max: room.maxStake * 2 };
}
function nextTurn(room, afterSeat, ctx) {
	const candidates = active(room);
	const player = candidates.find((p) => p.seatNumber > afterSeat) || candidates[0];
	room.currentPlayerId = player?.id ?? null;
	room.deadline = player ? ctx.now + ctx.turnMs : null;
}
function settle(room, winner, reason, revealed = []) {
	require(!room.result, 'Hand already settled');
	const amount = room.pot;
	winner.balance += amount;
	room.pot = 0;
	room.gameShow = true;
	room.currentPlayerId = null;
	room.deadline = null;
	room.result = {
		winnerId: winner.id,
		winnerName: winner.username,
		amount,
		reason,
		revealedPlayerIds: revealed,
		handId: room.handId
	};
}
function afterPack(room, seat, ctx) {
	const candidates = active(room);
	if (candidates.length === 1) settle(room, candidates[0], 'last-player');
	else nextTurn(room, seat, ctx);
}
export function invariant(room) {
	require(room.players.every(
		(p) => Number.isSafeInteger(p.balance) && p.balance >= 0
	), 'Invalid balance', 'INVARIANT');
	require(Number.isSafeInteger(room.pot) && room.pot >= 0, 'Invalid pot', 'INVARIANT');
	require(room.players.every(
		(p) => p.handBet === undefined || (Number.isSafeInteger(p.handBet) && p.handBet >= 0)
	), 'Invalid hand contribution', 'INVARIANT');
	require(!playing(room) ||
		room.players.some((p) => p.handBet === undefined) ||
		room.players.reduce((sum, p) => sum + p.handBet, 0) ===
			room.pot, 'Hand contributions must equal the live pot', 'INVARIANT');
	require(room.players.reduce((n, p) => n + p.balance, room.pot) ===
		room.issuedChips, 'Chip conservation failed', 'INVARIANT');
	const seats = seated(room).map((p) => p.seatNumber);
	require(new Set(seats).size === seats.length &&
		seats.every((s) => s >= 0 && s < 6), 'Invalid seats', 'INVARIANT');
}

// Synchronous pure transition: no sockets, storage, clock reads or randomness.
export function transition(snapshot, id, action, payload = {}, ctx) {
	if (snapshot.gameType && snapshot.gameType !== 'teen-patti') {
		const game = getGameEngine(snapshot.gameType);
		require(game, 'Unsupported game type', 'UNSUPPORTED_GAME');
		return game.transition(snapshot, id, action, payload, ctx);
	}
	const room = structuredClone(snapshot);
	let variant = variantFor(room);
	let player = room.players.find((p) => p.id === id);
	if (action === 'join') {
		require(typeof payload.username === 'string' &&
			payload.username.trim().length >= 1 &&
			payload.username.trim().length <= 24, 'Enter a player name of 1–24 characters');
		if (player && player.seatNumber !== null && !player.departed) return room;
		require(!playing(room), 'Room already has a game in process');
		// A finished hand no longer reserves departed seats; start already does this cleanup.
		for (const departed of room.players) if (departed.departed) departed.seatNumber = null;
		const used = new Set(seated(room).map((p) => p.seatNumber));
		const seatNumber = Array.from({ length: 6 }, (_, n) => n).find((n) => !used.has(n));
		require(seatNumber !== undefined, 'Room is full');
		if (!player) {
			player = {
				id,
				username: payload.username.trim().toLowerCase(),
				balance: room.table,
				handBet: 0,
				seatNumber,
				cards: [],
				isBlind: true,
				isPacked: false,
				ready: false,
				departed: false
			};
			room.players.push(player);
			room.issuedChips += room.table;
		} else {
			Object.assign(player, {
				seatNumber,
				username: payload.username.trim().toLowerCase(),
				cards: [],
				isPacked: false,
				isBlind: true,
				ready: false,
				departed: false
			});
		}
		if (!room.hostId) room.hostId = id;
	} else {
		require(player &&
			player.seatNumber !== null &&
			!player.departed, 'Join this room first', 'NOT_MEMBER');
		if (action === 'start') {
			require(id === room.hostId, 'Only the room host can start a hand', 'FORBIDDEN');
			require(!playing(room), 'A hand is already in progress');
			const nextVersion =
				payload.rulesVersion === undefined ? room.rulesVersion : payload.rulesVersion;
			require(typeof nextVersion === 'string' &&
				getVariant(nextVersion), 'Unsupported game rules version', 'UNSUPPORTED_RULES');
			variant = getVariant(nextVersion);
			const cardsPerPlayer = variant.cardsPerPlayer ?? 3;
			require(payload.cardsToDeal ===
				cardsPerPlayer, `${variant.name} uses ${cardsPerPlayer} cards per player`);
			require(Number.isInteger(payload.cutAt) &&
				payload.cutAt >= 0 &&
				payload.cutAt <= 51, 'Invalid deck cut');
			for (const p of room.players) if (p.departed) p.seatNumber = null;
			const participants = seated(room).filter(
				(p) => !p.departed && p.balance >= 1 && ctx.connected.has(p.id)
			);
			require(participants.length >= 2, 'At least two connected players with chips are required');
			if (ctx.requireReady)
				require(participants.every((p) => p.ready), 'Every connected player must be ready');
			const canonical = new Set(freshDeck().map((c) => `${c.rank}:${c.suit}`));
			require(Array.isArray(ctx.deck) &&
				ctx.deck.length === 52 &&
				new Set(ctx.deck.map((c) => `${c.rank}:${c.suit}`)).size === 52 &&
				ctx.deck.every((c) =>
					canonical.has(`${c.rank}:${c.suit}`)
				), 'Invalid server deck', 'INVARIANT');
			const deck = structuredClone(ctx.deck);
			room.rulesVersion = nextVersion;
			room.deck = [...deck.slice(payload.cutAt), ...deck.slice(0, payload.cutAt)];
			room.handId = ctx.handId;
			room.initiator = id;
			room.result = null;
			room.isStarted = true;
			room.gameShow = false;
			room.pot = 0;
			room.maxStake = 2;
			for (const p of room.players) {
				p.cards = [];
				p.handBet = 0;
				p.isBlind = true;
				p.isPacked = true;
				p.ready = false;
			}
			for (const p of participants) {
				p.balance--;
				p.handBet++;
				room.pot++;
				p.isPacked = false;
			}
			for (let card = 0; card < cardsPerPlayer; card++)
				for (const p of participants) p.cards.push(room.deck.shift());
			delete room.variantState;
			if (variant.prepareHand) {
				const prepared = variant.prepareHand({ remainingDeck: room.deck });
				require(prepared &&
					Number.isSafeInteger(prepared.cardsConsumed) &&
					prepared.cardsConsumed >= 0 &&
					prepared.cardsConsumed <= room.deck.length, 'Invalid variant hand setup', 'INVARIANT');
				room.variantState = structuredClone(prepared.state);
				room.deck.splice(0, prepared.cardsConsumed);
			}
			// Original first hand advances from the initiator to the next seat.
			nextTurn(room, player.seatNumber, ctx);
		} else if (action === 'ready') {
			require(!playing(room), 'Readiness is locked during a hand');
			require(typeof payload.ready === 'boolean', 'Invalid ready state');
			room.readyEnabled = true;
			player.ready = payload.ready;
		} else if (action === 'leave') {
			const wasTurn = room.currentPlayerId === id;
			player.departed = true;
			if (playing(room) && !player.isPacked) {
				player.isPacked = true;
				if (active(room).length === 1) settle(room, active(room)[0], 'last-player');
				else if (wasTurn) nextTurn(room, player.seatNumber, ctx);
			}
			if (!playing(room)) player.seatNumber = null;
			if (room.hostId === id) room.hostId = seated(room).find((p) => !p.departed)?.id ?? null;
		} else {
			require(playing(room), 'No active hand');
			require(!player.isPacked &&
				player.cards.length === (variant.cardsPerPlayer ?? 3), 'You are not active in this hand');
			if (action === 'see') {
				require(player.isBlind, 'Cards already seen');
				player.isBlind = false;
			} else {
				require(room.currentPlayerId === id, 'It is not your turn', 'OUT_OF_TURN');
				require(ctx.now < room.deadline || action === 'timeout', 'Turn has expired', 'STALE_TURN');
				if (action === 'pack' || action === 'timeout') {
					if (action === 'timeout') require(ctx.now >= room.deadline, 'Turn has not expired');
					player.isPacked = true;
					afterPack(room, player.seatNumber, ctx);
				} else if (action === 'bet') {
					const { min, max } = limits(room, player);
					require(Number.isSafeInteger(payload.amount) &&
						payload.amount >= min &&
						payload.amount <= max, `Bet must be an integer from ${min} to ${max}`);
					require(payload.amount <= player.balance, 'Insufficient chips');
					player.balance -= payload.amount;
					if (player.handBet !== undefined) player.handBet += payload.amount;
					room.pot += payload.amount;
					room.maxStake = player.isBlind ? payload.amount * 2 : payload.amount;
					nextTurn(room, player.seatNumber, ctx);
				} else if (action === 'show') {
					const candidates = active(room);
					require(candidates.length === 2, 'Show requires exactly two active players');
					const other = candidates.find((p) => p.id !== id);
					require(player.isBlind ||
						!other.isBlind, 'A seen player cannot request Show against a blind player');
					const fee = limits(room, player).min;
					require(player.balance >= fee, 'Insufficient chips for Show');
					player.balance -= fee;
					if (player.handBet !== undefined) player.handBet += fee;
					room.pot += fee;
					const comparison = variant.compareHands(player.cards, other.cards, room.variantState);
					settle(
						room,
						comparison > 0 ? player : other,
						comparison === 0 ? 'show-tie-requester-loses' : 'show',
						[player.id, other.id]
					);
				} else throw new GameError('Unknown action');
			}
		}
	}
	room.revision++;
	invariant(room);
	return room;
}

function ctxReadySupported(room) {
	return room.readyEnabled === true;
}

export function projection(room, id, connected) {
	if (room.gameType && room.gameType !== 'teen-patti') {
		const game = getGameEngine(room.gameType);
		require(game, 'Unsupported game type', 'UNSUPPORTED_GAME');
		return game.projection(room, id, connected);
	}
	variantFor(room);
	const player = room.players.find((p) => p.id === id);
	require(player &&
		player.seatNumber !== null &&
		!player.departed, 'Not a room member', 'NOT_MEMBER');
	const list = seated(room);
	const reveal = new Set(room.result?.revealedPlayerIds || []);
	const myTurn = playing(room) && room.currentPlayerId === id && !player.isPacked;
	return {
		name: room.name,
		table: room.table,
		selfId: id,
		hostId: room.hostId,
		revision: room.revision,
		handId: room.handId,
		rulesVersion: room.rulesVersion,
		isStarted: room.isStarted,
		gameShow: room.gameShow,
		initiator: room.initiator,
		currentPlayer: list.findIndex((p) => p.id === room.currentPlayerId),
		pot: room.pot,
		maxStake: room.maxStake,
		...(room.variantState === undefined
			? {}
			: { variantState: structuredClone(room.variantState) }),
		deadline: room.deadline,
		result: room.result
			? {
					winnerId: room.result.winnerId,
					winnerName: room.result.winnerName,
					amount: room.result.amount,
					reason: room.result.reason,
					handId: room.result.handId
				}
			: null,
		usersList: list.map((p) => ({
			id: p.id,
			username: p.username,
			balance: p.balance,
			handBet: p.handBet ?? null,
			seatNumber: p.seatNumber,
			isBlind: p.isBlind,
			isPacked: p.isPacked,
			...(ctxReadySupported(room) ? { ready: p.ready === true } : {}),
			connected: connected.has(p.id),
			hasLeft: p.departed,
			cardsInHand:
				(p.id === id && !p.isBlind) || reveal.has(p.id)
					? structuredClone(p.cards)
					: p.cards.map(() => ({ rank: 0, suit: '' }))
		})),
		legalActions: {
			start: id === room.hostId && !playing(room),
			...(ctxReadySupported(room) ? { ready: !playing(room) } : {}),
			see: playing(room) && !player.isPacked && player.isBlind,
			pack: myTurn,
			bet: myTurn && player.balance >= limits(room, player).min,
			minBet: limits(room, player).min,
			maxBet: Math.min(player.balance, limits(room, player).max),
			show:
				myTurn &&
				active(room).length === 2 &&
				(player.isBlind || active(room).every((p) => !p.isBlind)) &&
				player.balance >= limits(room, player).min
		}
	};
}

export function movements(before, after, kind) {
	if (after.gameType && after.gameType !== 'teen-patti' && after.gameType !== 'texas-holdem') {
		const accounts = new Map();
		for (const player of after.players) {
			const previous = before?.players.find((candidate) => candidate.id === player.id);
			const delta = player.balance - (previous?.balance ?? 0);
			if (delta) accounts.set(player.id, delta);
		}
		const potDelta = after.pot - (before?.pot ?? 0);
		if (potDelta) accounts.set('pot', potDelta);
		const issuedDelta = after.issuedChips - (before?.issuedChips ?? 0);
		if (issuedDelta) accounts.set('issued', -issuedDelta);
		const rummyLosses = after.result?.losses;
		if (Array.isArray(rummyLosses)) for (const loss of rummyLosses) {
			const previous = before?.players.find((candidate) => candidate.id === loss.playerId);
			const original = previous?.balance ?? 0;
			const final = after.players.find((candidate) => candidate.id === loss.playerId)?.balance ?? 0;
			const settlementDelta = final - original - (accounts.get(loss.playerId) ?? 0);
			if (settlementDelta) accounts.set(loss.playerId, (accounts.get(loss.playerId) ?? 0) + settlementDelta);
		}
		const entries = [...accounts].map(([account, delta]) => ({ account, delta }));
		if (entries.reduce((sum, entry) => sum + entry.delta, 0) !== 0) {
			const conservationDelta = entries.reduce((sum, entry) => sum + entry.delta, 0);
			const issued = entries.find((entry) => entry.account === 'issued');
			if (issued) issued.delta -= conservationDelta;
			else entries.push({ account: 'issued', delta: -conservationDelta });
		}
		return entries.length ? { kind, entries } : null;
	}
	const entries = after.players.flatMap((p) => {
		const delta = p.balance - (before?.players.find((old) => old.id === p.id)?.balance ?? 0);
		return delta ? [{ account: p.id, delta }] : [];
	});
	const pot = after.pot - (before?.pot ?? 0);
	if (pot) entries.push({ account: 'pot', delta: pot });
	const issued = after.issuedChips - (before?.issuedChips ?? 0);
	if (issued) entries.push({ account: 'issued', delta: -issued });
	require(entries.reduce((sum, e) => sum + e.delta, 0) === 0, 'Unbalanced ledger', 'INVARIANT');
	return entries.length ? { kind, entries } : null;
}
