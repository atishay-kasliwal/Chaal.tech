import { freshDeck } from './classic.mjs';
import { DEFAULT_RULES_VERSION, getVariant } from './variants/index.mjs';
import { getGameEngine } from './games/index.mjs';
import { describeHand, wildIndexes } from './variants/describe.mjs';

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
// Dealt players still in the hand. Discard variants shrink hands, so any dealt hand counts.
const active = (room) => {
	variantFor(room);
	return seated(room).filter((p) => p.cards.length > 0 && !p.isPacked && !p.departed);
};
/** A seen player in a discard variant must throw cards away before betting or Show. */
const mustDiscard = (variant, player) =>
	Number.isInteger(variant.discardTo) && !player.isBlind && player.cards.length > variant.discardTo;
export const playing = (room) => room.isStarted && !room.gameShow;
/** Bots are seated by the server and never disconnect. */
const present = (p, connected) => !!p.bot || connected.has(p.id);
export const BOT_LEVELS = Object.freeze(['easy', 'normal', 'hard']);

export function roomName(value) {
	require(typeof value === 'string' &&
		/^[a-z0-9][a-z0-9-]{2,31}$/.test(
			value
		), 'Use a room name of 3–32 lowercase letters, numbers or hyphens');
	return value;
}
// Rooms created without table options keep the original 1-chip boot and explicit ready flow.
export function tableOptions(table, options) {
	if (options === undefined || options === null) return {};
	require(typeof options === 'object' && !Array.isArray(options), 'Invalid table options');
	const boot = options.boot ?? 1;
	require(Number.isSafeInteger(boot) &&
		boot >= 1 &&
		boot * 20 <= table, 'Boot must be an integer from 1 to 1/20 of the starting chips');
	const potLimit = options.potLimit ?? 0;
	require(POT_LIMITS.includes(potLimit), 'Pot limit must be off or 64, 128, 256 or 512 boots');
	return { boot, autoReady: options.autoReady === true, potLimit };
}
/** Pot limit, in boots. 0 turns it off. Reaching it forces a Show among everyone still in. */
export const POT_LIMITS = Object.freeze([0, 64, 128, 256, 512]);
export function newRoom(name, table, hostId, rulesVersion = DEFAULT_RULES_VERSION, options) {
	roomName(name);
	require(typeof rulesVersion === 'string' &&
		getVariant(rulesVersion), 'Unsupported game rules version', 'UNSUPPORTED_RULES');
	require(Number.isSafeInteger(table) &&
		table >= 50 &&
		table <= 1_000_000, 'Starting chips must be an integer from 50 to 1000000');
	const { boot, autoReady, potLimit } = tableOptions(table, options);
	return {
		schema: 1,
		...(boot === undefined ? {} : { boot, autoReady, ...(potLimit ? { potLimit } : {}) }),
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
const bootOf = (room) => room.boot ?? 1;
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
	if (room.boot !== undefined) room.turnMs = player ? ctx.turnMs : null;
}
function settle(room, winner, reason, revealed = []) {
	require(!room.result, 'Hand already settled');
	const amount = room.pot;
	winner.balance += amount;
	room.pot = 0;
	room.gameShow = true;
	room.currentPlayerId = null;
	room.deadline = null;
	if (room.boot !== undefined) room.turnMs = null;
	room.result = {
		winnerId: winner.id,
		winnerName: winner.username,
		amount,
		reason,
		revealedPlayerIds: revealed,
		handId: room.handId
	};
}
/**
 * Pot limit reached: everyone still in shows. The best hand takes the pot; exact ties
 * split it evenly, any odd rupee going to the first tied player clockwise.
 */
function forcedShow(room, variant) {
	const contenders = active(room);
	let best = [contenders[0]];
	for (const player of contenders.slice(1)) {
		const comparison = variant.compareHands(player.cards, best[0].cards, room.variantState);
		if (comparison > 0) best = [player];
		else if (comparison === 0) best.push(player);
	}
	const revealed = contenders.map((p) => p.id);
	if (best.length === 1) {
		settle(room, best[0], 'pot-limit', revealed);
		return;
	}
	require(!room.result, 'Hand already settled');
	const pot = room.pot;
	const share = Math.floor(pot / best.length);
	const winners = best.map((p, index) => ({
		id: p.id,
		name: p.username,
		amount: share + (index < pot - share * best.length ? 1 : 0)
	}));
	for (const winner of winners)
		room.players.find((p) => p.id === winner.id).balance += winner.amount;
	room.pot = 0;
	room.gameShow = true;
	room.currentPlayerId = null;
	room.deadline = null;
	room.turnMs = null;
	room.result = {
		winnerId: winners[0].id,
		winnerName: winners.map((w) => w.name).join(' & '),
		amount: pot,
		reason: 'pot-limit-split',
		revealedPlayerIds: revealed,
		winners,
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
				ready: room.autoReady === true,
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
				ready: room.autoReady === true,
				departed: false
			});
		}
		if (room.autoReady) room.readyEnabled = true;
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
			const boot = bootOf(room);
			// Broke bots buy back in so a practice table can keep going all evening.
			for (const p of seated(room))
				if (p.bot && !p.departed && p.balance < boot) {
					p.balance += room.table;
					room.issuedChips += room.table;
					p.bot.rebuys++;
				}
			// Auto-ready tables deal everyone who has not chosen to sit out.
			const participants = seated(room).filter(
				(p) =>
					!p.departed &&
					p.balance >= boot &&
					present(p, ctx.connected) &&
					(!room.autoReady || p.ready !== false)
			);
			require(participants.length >= 2, 'At least two connected players with chips are required');
			if (ctx.requireReady && !room.autoReady)
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
			room.maxStake = boot * 2;
			for (const p of room.players) {
				p.cards = [];
				p.handBet = 0;
				p.isBlind = true;
				p.isPacked = true;
				if (!room.autoReady) p.ready = false;
			}
			for (const p of participants) {
				p.balance -= boot;
				p.handBet += boot;
				room.pot += boot;
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
		} else if (action === 'addBot') {
			require(id === room.hostId, 'Only the host can add bots', 'FORBIDDEN');
			require(room.boot !== undefined, 'Bots need a table created with table options');
			require(!playing(room), 'Add bots between hands');
			require(BOT_LEVELS.includes(payload.level), 'Choose easy, normal or hard');
			require(typeof payload.botId === 'string' &&
				/^bot-[a-z0-9-]{4,40}$/.test(payload.botId) &&
				!room.players.some((p) => p.id === payload.botId), 'Invalid bot');
			require(typeof payload.name === 'string' &&
				payload.name.trim().length >= 1 &&
				payload.name.trim().length <= 24, 'Invalid bot name');
			for (const departed of room.players) if (departed.departed) departed.seatNumber = null;
			const used = new Set(seated(room).map((p) => p.seatNumber));
			const seatNumber = Array.from({ length: 6 }, (_, n) => n).find((n) => !used.has(n));
			require(seatNumber !== undefined, 'Room is full');
			room.players.push({
				id: payload.botId,
				username: payload.name.trim().toLowerCase(),
				balance: room.table,
				handBet: 0,
				seatNumber,
				cards: [],
				isBlind: true,
				isPacked: false,
				ready: true,
				departed: false,
				bot: { level: payload.level, rebuys: 0 }
			});
			room.issuedChips += room.table;
		} else if (action === 'setPotLimit') {
			require(id === room.hostId, 'Only the host can change the pot limit', 'FORBIDDEN');
			require(room.boot !== undefined, 'Pot limits need a table created with table options');
			require(!playing(room), 'Change the pot limit between hands');
			require(POT_LIMITS.includes(
				payload.potLimit
			), 'Pot limit must be off or 64, 128, 256 or 512 boots');
			if (payload.potLimit) room.potLimit = payload.potLimit;
			else delete room.potLimit;
		} else if (action === 'removeBot') {
			require(id === room.hostId, 'Only the host can remove bots', 'FORBIDDEN');
			require(!playing(room), 'Remove bots between hands');
			const target = room.players.find(
				(p) => p.id === payload.botId && p.bot && p.seatNumber !== null && !p.departed
			);
			require(target, 'That bot is not at the table');
			target.departed = true;
			target.seatNumber = null;
		} else if (action === 'ready') {
			// Auto-ready tables let players choose to sit out the next hand at any time.
			require(!playing(room) || room.autoReady, 'Readiness is locked during a hand');
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
			if (room.hostId === id)
				room.hostId = seated(room).find((p) => !p.departed && !p.bot)?.id ?? null;
		} else {
			require(playing(room), 'No active hand');
			require(!player.isPacked && player.cards.length > 0, 'You are not active in this hand');
			if (action === 'see') {
				require(variant.allowSee !==
					false, `${variant.name} keeps every hand blind until the Show`);
				require(player.isBlind, 'Cards already seen');
				player.isBlind = false;
			} else if (action === 'discard') {
				require(mustDiscard(variant, player), 'There is nothing to discard');
				require(Number.isInteger(payload.index) &&
					payload.index >= 0 &&
					payload.index < player.cards.length, 'Choose one of your cards to discard');
				player.cards.splice(payload.index, 1);
			} else {
				require(room.currentPlayerId === id, 'It is not your turn', 'OUT_OF_TURN');
				require(ctx.now < room.deadline || action === 'timeout', 'Turn has expired', 'STALE_TURN');
				if (action === 'pack' || action === 'timeout') {
					if (action === 'timeout') require(ctx.now >= room.deadline, 'Turn has not expired');
					player.isPacked = true;
					afterPack(room, player.seatNumber, ctx);
				} else if (action === 'bet') {
					require(!mustDiscard(variant, player), 'Discard a card before you bet');
					const { min, max } = limits(room, player);
					require(Number.isSafeInteger(payload.amount) &&
						payload.amount >= min &&
						payload.amount <= max, `Bet must be an integer from ${min} to ${max}`);
					require(payload.amount <= player.balance, 'Insufficient chips');
					player.balance -= payload.amount;
					if (player.handBet !== undefined) player.handBet += payload.amount;
					room.pot += payload.amount;
					room.maxStake = player.isBlind ? payload.amount * 2 : payload.amount;
					if (room.potLimit && room.pot >= room.potLimit * bootOf(room)) forcedShow(room, variant);
					else nextTurn(room, player.seatNumber, ctx);
				} else if (action === 'show') {
					require(!mustDiscard(variant, player), 'Discard a card before you Show');
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
	const variant = getVariant(room.rulesVersion);
	const explain = room.boot !== undefined;
	return {
		name: room.name,
		table: room.table,
		...(room.boot === undefined
			? {}
			: {
					boot: room.boot,
					autoReady: room.autoReady === true,
					turnMs: room.turnMs ?? null,
					potLimit: room.potLimit ?? 0
				}),
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
					handId: room.result.handId,
					...(room.boot === undefined
						? {}
						: {
								revealedPlayerIds: [...(room.result.revealedPlayerIds ?? [])],
								...(room.result.winners ? { winners: structuredClone(room.result.winners) } : {})
							})
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
			connected: present(p, connected),
			...(p.bot ? { bot: p.bot.level } : {}),
			hasLeft: p.departed,
			cardsInHand:
				(p.id === id && !p.isBlind) || reveal.has(p.id)
					? structuredClone(p.cards)
					: p.cards.map(() => ({ rank: 0, suit: '' })),
			// Names and joker positions only for hands this viewer may already see.
			...(explain && ((p.id === id && !p.isBlind) || reveal.has(p.id)) && p.cards.length
				? {
						handName: describeHand(variant, p.cards, room.variantState),
						wildCards: wildIndexes(variant, p.cards, room.variantState)
					}
				: {})
		})),
		legalActions: {
			start: id === room.hostId && !playing(room),
			...(ctxReadySupported(room) ? { ready: !playing(room) || room.autoReady === true } : {}),
			see: playing(room) && !player.isPacked && player.isBlind && variant.allowSee !== false,
			...(explain
				? {
						discard: playing(room) && !player.isPacked && mustDiscard(variant, player),
						addBot: id === room.hostId && !playing(room) && seated(room).length < 6
					}
				: {}),
			pack: myTurn,
			bet: myTurn && player.balance >= limits(room, player).min && !mustDiscard(variant, player),
			minBet: limits(room, player).min,
			maxBet: Math.min(player.balance, limits(room, player).max),
			show:
				myTurn &&
				!mustDiscard(variant, player) &&
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
		if (Array.isArray(rummyLosses))
			for (const loss of rummyLosses) {
				const previous = before?.players.find((candidate) => candidate.id === loss.playerId);
				const original = previous?.balance ?? 0;
				const final =
					after.players.find((candidate) => candidate.id === loss.playerId)?.balance ?? 0;
				const settlementDelta = final - original - (accounts.get(loss.playerId) ?? 0);
				if (settlementDelta)
					accounts.set(loss.playerId, (accounts.get(loss.playerId) ?? 0) + settlementDelta);
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
