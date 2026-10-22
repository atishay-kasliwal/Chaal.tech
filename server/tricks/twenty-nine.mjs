import { buildDeck, cardKey, sameCard, legalPlays, trickWinner, fnv, SUITS } from './cards.mjs';
import { castMember } from '../../src/lib/bots/cast.js';
import { GameError } from '../engine.mjs';

/**
 * 29, Chaal V1 rules (docs/games/29_RULES.md, locked 2026-10-22; pagat.com standard rules with the
 * owner's choices: 28 points, minimum bid 15, a player who cannot follow before trump is known must ask
 * for it and may then play any card, no doubles or single hand).
 *
 * Four players in two partnerships (seats 0 and 2 against 1 and 3), clockwise; 32 cards, 7 to A, ranked
 * J 9 A 10 K Q 8 7 in every suit; J 3, 9 2, A 1, 10 1 point (28 in all).
 * - Four cards each, then the auction from the dealer's left: bid higher (15 to 28) or pass; three
 *   passes in a row end it; if the first three pass the dealer bids 15.
 * - The bidder sets one card of the trump suit face down (the indicator) and the rest is dealt: eight
 *   each, with the indicator counting as one of the bidder's eight.
 * - Trump is secret. The first player who cannot follow suit must ask for it (the bidder, if first,
 *   declares it); the indicator goes back to the bidder's hand. From that trick on the highest trump
 *   wins. If trump is never revealed the hand is annulled.
 * - The Pair (K and Q of trump in one hand), declared after that player's side wins a trick once trump is
 *   known: the bidder's target goes down by 4 (not below 15) for the bidding side, up by 4 (not above
 *   28) for the opponents.
 * - The bidding side scores +1 game point for making its target, -1 otherwise; a game ends at +6 or -6.
 *   The deal passes to the left.
 *
 * Same contract as the other engines: a pure transition with the deck and clock from ctx, a per-seat
 * projection, an invariant. The projection shows the current and the last trick and each team's points;
 * the bots remember the rest (server/bots/tricks/observation-29.mjs).
 */
export const RULES_VERSION = 'twenty-nine-1';
export const SEATS = 4;
const TRICKS = 8;
const MIN_BID = 15;
const MAX_BID = 28;
const GAME_POINTS = 6;
/** Rank within a suit (higher wins) and card points. */
export const STRENGTH = Object.freeze({ 11: 8, 9: 7, 14: 6, 10: 5, 13: 4, 12: 3, 8: 2, 7: 1 });
export const POINTS = Object.freeze({ 11: 3, 9: 2, 14: 1, 10: 1 });
const strength = (card) => STRENGTH[card.rank] ?? 0;
export const pointsOf = (cards) => cards.reduce((s, c) => s + (POINTS[c.rank] ?? 0), 0);

export const fresh29Deck = () =>
	buildDeck(Object.fromEntries(SUITS.map((s) => [s, [14, 13, 12, 11, 10, 9, 8, 7]])));
const DECK_KEYS = new Set(fresh29Deck().map(cardKey));

// Rule errors are GameErrors, so the room server shows players the reason, not a service failure.
const fail = (condition, message, code = 'INVALID_ACTION') => {
	if (!condition) throw new GameError(message, code);
};
const seated = (room) =>
	room.players.filter((p) => p.seatNumber !== null).sort((a, b) => a.seatNumber - b.seatNumber);
const active = (room) => seated(room).filter((p) => !p.departed);
export const playing = (room) => room.isStarted && !room.gameShow;
const byId = (room, id) => room.players.find((p) => p.id === id);
const teamOf = (room, id) => byId(room, id).seatNumber % 2;
const nextInOrder = (room, id) => room.order[(room.order.indexOf(id) + 1) % room.order.length];
/** Seats clockwise: the player to your left plays after you. */
const ring = (room) => active(room).map((p) => p.id);

function setTurn(room, id, ctx) {
	room.currentPlayerId = id;
	room.deadline = id ? ctx.now + ctx.turnMs : null;
	// A bidder whose only card left is the face-down indicator turns it up: trump is declared.
	if (id && room.stage === 'play' && !room.revealed && id === room.bidderId) {
		if (!byId(room, id).cards.length) reveal(room, id, true);
	}
}

/** The cards a player may play now: their hand, with the indicator only once trump is known. */
const legalFor = (room, id) => legalPlays(byId(room, id).cards, room.trick.plays[0]?.card.suit);
/** Before trump is known, a player who cannot follow must ask for it first. */
const mustAsk = (room, id) => {
	const led = room.trick?.plays[0]?.card.suit;
	return (
		room.stage === 'play' &&
		!room.revealed &&
		!!led &&
		!byId(room, id).cards.some((c) => c.suit === led)
	);
};

function reveal(room, by, forced = false) {
	room.revealed = true;
	room.revealedAt = { by, trick: room.tricksPlayed + 1, ...(forced ? { forced: true } : {}) };
	byId(room, room.bidderId).cards.push(room.indicator);
	room.indicator = null;
	room.wonSinceReveal = [false, false];
}

export function newRoom(name, table, hostId) {
	fail(typeof name === 'string' && /^[a-z0-9][a-z0-9-]{2,31}$/.test(name), 'Invalid room name');
	fail(Number.isSafeInteger(table) && table >= 0 && table <= 1_000_000, 'Invalid table');
	return {
		schema: 1,
		gameType: 'twenty-nine',
		rulesVersion: RULES_VERSION,
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
		hand: 0,
		dealerId: null,
		nextDealerId: null,
		order: [],
		bids: [],
		high: null,
		passes: 0,
		bidderId: null,
		bid: null,
		target: null,
		trump: null,
		indicator: null,
		revealed: false,
		revealedAt: null,
		pair: null,
		wonSinceReveal: [false, false],
		pending: [],
		trick: null,
		tricksPlayed: 0,
		lastTrick: null,
		captured: [[], []],
		match: { gamePoints: [0, 0], games: [0, 0] },
		secret: null,
		currentPlayerId: null,
		deadline: null,
		result: null
	};
}

export function invariant(room) {
	fail(room.pot === 0, '29 has no pot', 'INVARIANT');
	fail(
		room.players.reduce((s, p) => s + p.balance, 0) === room.issuedChips,
		'Chip conservation failed',
		'INVARIANT'
	);
	const seats = seated(room).map((p) => p.seatNumber);
	fail(
		new Set(seats).size === seats.length && seats.every((s) => s >= 0 && s < SEATS),
		'Invalid seats',
		'INVARIANT'
	);
	if (playing(room)) {
		const all = [
			...room.order.flatMap((id) => byId(room, id).cards),
			...room.pending,
			...(room.indicator ? [room.indicator] : []),
			...room.trick.plays.map((p) => p.card),
			...room.captured.flat()
		];
		fail(
			all.length === 32 && new Set(all.map(cardKey)).size === 32,
			'Cards not conserved',
			'INVARIANT'
		);
	}
}

/** The hand's result: whether the bidding side made its target, and the game points that follow. */
export function scoreHand({ revealed, points, bidTeam, target }, gamePoints) {
	if (!revealed)
		return { annulled: true, made: null, gamePoints: gamePoints.slice(), gameOver: null };
	const made = points[bidTeam] >= target;
	const next = gamePoints.slice();
	next[bidTeam] += made ? 1 : -1;
	let gameOver = null;
	if (next[bidTeam] >= GAME_POINTS) gameOver = bidTeam;
	else if (next[bidTeam] <= -GAME_POINTS) gameOver = 1 - bidTeam;
	return { annulled: false, made, gamePoints: next, gameOver };
}

function endHand(room, reason) {
	room.stage = 'hand-over';
	room.gameShow = true;
	room.currentPlayerId = null;
	room.deadline = null;
	if (reason !== 'hand-complete') {
		room.result = {
			reason,
			handId: room.handId,
			hand: room.hand,
			winnerId: 'none',
			winnerName: 'Hand abandoned',
			amount: 0
		};
		return;
	}
	const points = room.captured.map(pointsOf);
	const bidTeam = teamOf(room, room.bidderId);
	const s = scoreHand(
		{ revealed: room.revealed, points, bidTeam, target: room.target },
		room.match.gamePoints
	);
	room.match.gamePoints = s.gamePoints;
	if (s.gameOver !== null) {
		room.match.games[s.gameOver]++;
		room.match.gamePoints = [0, 0];
	}
	room.nextDealerId = room.order[0]; // the deal passes to the left
	const winnerTeam = s.annulled ? null : s.made ? bidTeam : 1 - bidTeam;
	const team =
		winnerTeam === null ? [] : room.order.filter((id) => teamOf(room, id) === winnerTeam);
	room.result = {
		reason: s.annulled ? 'annulled' : reason,
		handId: room.handId,
		hand: room.hand,
		bidderId: room.bidderId,
		bidTeam,
		bid: room.bid,
		target: room.target,
		trump: room.trump,
		points,
		made: s.made,
		winnerTeam,
		gameOver: s.gameOver,
		winnerId: team[0] ?? 'none',
		winnerName: team.length ? team.map((id) => byId(room, id).username).join(' and ') : 'No score',
		amount: 0
	};
}

/** The automatic move for a person whose turn ran out (never a bot persona): simple and legal. */
export function autoMove(room, id) {
	const me = byId(room, id);
	if (room.stage === 'bid') return { action: 'pass', payload: {} };
	if (room.stage === 'trump') {
		const len = (s) => me.cards.filter((c) => c.suit === s).length;
		const suit = SUITS.slice().sort((a, b) => len(b) - len(a))[0];
		const card = me.cards
			.filter((c) => c.suit === suit)
			.sort((a, b) => strength(a) - strength(b))[0];
		return { action: 'chooseTrump', payload: { card } };
	}
	if (mustAsk(room, id)) return { action: 'reveal', payload: {} };
	const trump = room.revealed ? room.trump : null;
	const low = legalFor(room, id)
		.slice()
		.sort(
			(a, b) =>
				(a.suit === trump) - (b.suit === trump) ||
				(POINTS[a.rank] ?? 0) - (POINTS[b.rank] ?? 0) ||
				strength(a) - strength(b)
		)[0];
	return { action: 'play', payload: { card: low } };
}

function endAuction(room, ctx) {
	room.bidderId = room.high.id;
	room.bid = room.high.bid;
	room.target = room.high.bid;
	room.stage = 'trump';
	setTurn(room, room.bidderId, ctx);
}

function completeTrick(room, ctx) {
	const plays = room.trick.plays;
	const trump = room.revealed ? room.trump : null;
	const w = plays[trickWinner(plays, trump, strength)].id;
	const team = teamOf(room, w);
	room.tricksPlayed++;
	room.captured[team].push(...plays.map((p) => p.card));
	if (room.revealed) room.wonSinceReveal[team] = true;
	room.lastTrick = {
		plays,
		winner: w,
		points: pointsOf(plays.map((p) => p.card)),
		n: room.tricksPlayed
	};
	room.trick = { leader: w, plays: [] };
	if (room.tricksPlayed === TRICKS) return endHand(room, 'hand-complete');
	setTurn(room, w, ctx);
}

const hasPair = (room, id) =>
	room.revealed &&
	!room.pair &&
	room.wonSinceReveal[teamOf(room, id)] &&
	[13, 12].every((r) => byId(room, id).cards.some((c) => c.rank === r && c.suit === room.trump));

export function transition(snapshot, id, action, payload = {}, ctx = {}) {
	const room = structuredClone(snapshot);
	let player = byId(room, id);
	if (action === 'join') {
		fail(
			typeof payload.username === 'string' &&
				payload.username.trim().length >= 1 &&
				payload.username.trim().length <= 24,
			'Enter a player name of 1–24 characters'
		);
		if (player && player.seatNumber !== null && !player.departed) return room;
		fail(!playing(room), 'A hand is in progress: join when it ends');
		for (const old of room.players) if (old.departed) old.seatNumber = null;
		const used = new Set(seated(room).map((p) => p.seatNumber));
		const seatNumber = Array.from({ length: SEATS }, (_, n) => n).find((n) => !used.has(n));
		fail(seatNumber !== undefined, '29 is for four players: this table is full');
		const fresh = {
			username: payload.username.trim().toLowerCase(),
			seatNumber,
			cards: [],
			ready: false,
			departed: false
		};
		if (!player) {
			player = { id, balance: 0, handBet: 0, ...fresh };
			room.players.push(player);
		} else Object.assign(player, fresh);
		if (!room.hostId) room.hostId = id;
	} else if (action === 'timeout') {
		fail(playing(room) && room.currentPlayerId && ctx.now >= room.deadline, 'Turn has not expired');
		const actor = room.currentPlayerId;
		const auto = autoMove(room, actor);
		const next = transition(snapshot, actor, auto.action, auto.payload, { ...ctx, auto: true });
		const who = byId(next, actor);
		who.autoMoves = (who.autoMoves ?? 0) + 1;
		return next;
	} else {
		fail(
			player && player.seatNumber !== null && !player.departed,
			'Join this room first',
			'NOT_MEMBER'
		);
		if (action === 'ready') {
			fail(!playing(room), 'Readiness is locked during a hand');
			fail(typeof payload.ready === 'boolean', 'Invalid ready state');
			player.ready = payload.ready;
		} else if (action === 'addBot') {
			fail(id === room.hostId, 'Only the host can add bots', 'FORBIDDEN');
			fail(!playing(room), 'Add bots between hands');
			fail(
				typeof payload.botId === 'string' &&
					/^bot-[a-z0-9-]{4,40}$/.test(payload.botId) &&
					!byId(room, payload.botId),
				'Invalid bot'
			);
			const characterId = payload.characterId ?? payload.style?.botId;
			fail(!!castMember(characterId), 'Choose a Chaal character');
			fail(
				!room.players.some((p) => !p.departed && p.bot?.characterId === characterId),
				'That character is already at the table'
			);
			for (const old of room.players) if (old.departed) old.seatNumber = null;
			const used = new Set(seated(room).map((p) => p.seatNumber));
			const seatNumber = Array.from({ length: SEATS }, (_, n) => n).find((n) => !used.has(n));
			fail(seatNumber !== undefined, 'This table is full');
			room.players.push({
				id: payload.botId,
				username: castMember(characterId).name,
				balance: 0,
				handBet: 0,
				seatNumber,
				cards: [],
				ready: true,
				departed: false,
				bot: {
					characterId,
					mascotId: payload.mascotId ?? `bot-${characterId}`,
					level: 'normal',
					rebuys: 0
				}
			});
		} else if (action === 'removeBot') {
			fail(id === room.hostId, 'Only the host can remove bots', 'FORBIDDEN');
			fail(!playing(room), 'Remove bots between hands');
			const bot = byId(room, payload.botId);
			fail(bot?.bot && !bot.departed, 'No such bot');
			bot.departed = true;
			bot.seatNumber = null;
		} else if (action === 'start') {
			fail(id === room.hostId, 'Only the host can start a hand', 'FORBIDDEN');
			fail(!playing(room), 'A hand is already in progress');
			const players = active(room);
			fail(
				players.length === SEATS,
				'29 needs exactly four players: fill the empty seats with bots'
			);
			fail(
				players.every((p) => p.bot || ctx.connected?.has(p.id)),
				'Every person at the table must be connected'
			);
			fail(
				players.every((p) => p.bot || p.ready),
				'Every player must be ready'
			);
			const deck = ctx.deck;
			fail(
				Array.isArray(deck) &&
					deck.length === 32 &&
					new Set(deck.map(cardKey)).size === 32 &&
					deck.every((c) => DECK_KEYS.has(cardKey(c))),
				'Invalid 29 deck',
				'INVARIANT'
			);
			for (const old of room.players) if (old.departed) old.seatNumber = null;
			room.secret = { salt: deck.map(cardKey).join('') };
			const r = ring(room);
			const known = room.nextDealerId && r.includes(room.nextDealerId);
			const dealer = known ? room.nextDealerId : r[fnv(`${room.secret.salt}|dealer`) % SEATS];
			const d = r.indexOf(dealer);
			room.order = [1, 2, 3, 0].map((k) => r[(d + k) % SEATS]); // dealer's left first, dealer last
			room.dealerId = dealer;
			room.hand++;
			room.pending = structuredClone(deck);
			for (const p of room.players) p.cards = [];
			for (const pid of room.order)
				for (let k = 0; k < 4; k++) byId(room, pid).cards.push(room.pending.shift());
			Object.assign(room, {
				bids: [],
				high: null,
				passes: 0,
				bidderId: null,
				bid: null,
				target: null,
				trump: null,
				indicator: null,
				revealed: false,
				revealedAt: null,
				pair: null,
				wonSinceReveal: [false, false],
				trick: { leader: room.order[0], plays: [] },
				tricksPlayed: 0,
				lastTrick: null,
				captured: [[], []],
				handId: ctx.handId,
				result: null,
				isStarted: true,
				gameShow: false,
				stage: 'bid'
			});
			setTurn(room, room.order[0], ctx);
		} else if (action === 'leave') {
			player.departed = true;
			if (playing(room)) endHand(room, 'abandoned');
			player.seatNumber = null;
			if (room.hostId === id) room.hostId = active(room).find((p) => !p.bot)?.id ?? null;
			if (room.nextDealerId === id) room.nextDealerId = null;
		} else {
			fail(playing(room) && room.currentPlayerId === id, 'It is not your turn', 'OUT_OF_TURN');
			fail(ctx.auto || ctx.now < room.deadline, 'Turn has expired', 'STALE_TURN');
			if (action === 'bid' || action === 'pass') {
				fail(room.stage === 'bid', 'The bidding is over');
				if (action === 'bid') {
					const floor = room.high ? room.high.bid + 1 : MIN_BID;
					fail(
						Number.isInteger(payload.value) && payload.value >= floor && payload.value <= MAX_BID,
						`Bid from ${floor} to ${MAX_BID}`
					);
					room.high = { id, bid: payload.value };
					room.passes = 0;
				} else room.passes++;
				room.bids.push({ id, bid: action === 'bid' ? payload.value : null });
				if (!room.high && room.passes === 3) {
					// The first three passed: the dealer bids 15.
					room.high = { id: room.dealerId, bid: MIN_BID };
					room.bids.push({ id: room.dealerId, bid: MIN_BID, forced: true });
					endAuction(room, ctx);
				} else if (room.high && room.passes === 3) endAuction(room, ctx);
				else setTurn(room, nextInOrder(room, id), ctx);
			} else if (action === 'chooseTrump') {
				fail(room.stage === 'trump' && id === room.bidderId, 'Not time to choose trump');
				const card = payload.card;
				fail(
					card && player.cards.some((c) => sameCard(c, card)),
					'Set aside a card from your hand'
				);
				player.cards = player.cards.filter((c) => !sameCard(c, card));
				room.indicator = { rank: card.rank, suit: card.suit };
				room.trump = card.suit;
				for (const pid of room.order) {
					const want = pid === room.bidderId ? 7 : 8;
					while (byId(room, pid).cards.length < want)
						byId(room, pid).cards.push(room.pending.shift());
				}
				room.stage = 'play';
				setTurn(room, room.order[0], ctx);
			} else if (action === 'reveal') {
				fail(mustAsk(room, id), 'Ask for trump only when you cannot follow suit');
				reveal(room, id);
			} else if (action === 'pair') {
				fail(room.stage === 'play' && hasPair(room, id), 'No Pair to declare');
				const team = teamOf(room, id);
				const bidTeam = teamOf(room, room.bidderId);
				room.pair = { id, team };
				room.target =
					team === bidTeam
						? Math.max(MIN_BID, room.target - 4)
						: Math.min(MAX_BID, room.target + 4);
			} else if (action === 'play') {
				fail(room.stage === 'play', 'Not time to play');
				fail(!mustAsk(room, id), 'You cannot follow suit: ask for trump first');
				const card = payload.card;
				fail(card && player.cards.some((c) => sameCard(c, card)), 'Play a card from your hand');
				fail(
					legalFor(room, id).some((c) => sameCard(c, card)),
					'Follow the suit that was led'
				);
				player.cards = player.cards.filter((c) => !sameCard(c, card));
				room.trick.plays.push({ id, card: { rank: card.rank, suit: card.suit } });
				if (room.trick.plays.length < SEATS) setTurn(room, nextInOrder(room, id), ctx);
				else completeTrick(room, ctx);
			} else fail(false, 'Unknown 29 action');
		}
	}
	room.revision++;
	invariant(room);
	return room;
}

const masked = (n) => Array.from({ length: n }, () => ({ rank: 0, suit: '' }));
const sortHand29 = (cards) =>
	cards
		.slice()
		.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || strength(b) - strength(a));

/** What one seat sees. Everything a client or a bot receives about the table comes from here. */
export function projection(room, id, connected) {
	const self = byId(room, id);
	fail(self && self.seatNumber !== null && !self.departed, 'Not a room member', 'NOT_MEMBER');
	const list = seated(room);
	const turn = playing(room) && room.currentPlayerId === id;
	const knowsTrump = room.revealed || (id === room.bidderId && !!room.trump);
	const floor = room.high ? room.high.bid + 1 : MIN_BID;
	return {
		name: room.name,
		gameType: 'twenty-nine',
		rulesVersion: room.rulesVersion,
		table: room.table,
		selfId: id,
		hostId: room.hostId,
		revision: room.revision,
		handId: room.handId,
		isStarted: room.isStarted,
		gameShow: room.gameShow,
		stage: room.stage,
		hand: room.hand,
		pot: 0,
		dealerId: room.dealerId,
		order: room.order.slice(),
		teams: Object.fromEntries(list.map((p) => [p.id, p.seatNumber % 2])),
		bids: structuredClone(room.bids),
		high: room.high ? { ...room.high } : null,
		bidderId: room.bidderId,
		bid: room.bid,
		target: room.target,
		trump: knowsTrump ? room.trump : null,
		revealed: room.revealed,
		revealedAt: room.revealedAt ? { ...room.revealedAt } : null,
		// The face-down card: only the bidder sees it.
		indicator: id === room.bidderId && room.indicator ? { ...room.indicator } : null,
		indicatorDown: !!room.indicator,
		pair: room.pair ? { ...room.pair } : null,
		trick: room.trick ? structuredClone(room.trick) : null,
		lastTrick: room.lastTrick ? structuredClone(room.lastTrick) : null,
		tricksPlayed: room.tricksPlayed,
		points: room.captured.map(pointsOf),
		match: structuredClone(room.match),
		currentPlayer: list.findIndex((p) => p.id === room.currentPlayerId),
		currentPlayerId: room.currentPlayerId,
		deadline: room.deadline,
		result: room.result ? structuredClone(room.result) : null,
		usersList: list.map((p) => ({
			id: p.id,
			username: p.username,
			balance: p.balance,
			handBet: null,
			seatNumber: p.seatNumber,
			team: p.seatNumber % 2,
			isBlind: false,
			isPacked: false,
			connected: p.bot ? true : connected.has(p.id),
			ready: p.bot ? true : p.ready === true,
			hasLeft: p.departed,
			isBot: !!p.bot,
			characterId: p.bot?.characterId ?? null,
			mascotId: p.bot?.mascotId ?? null,
			autoMoves: p.autoMoves ?? 0,
			cardCount: p.cards.length,
			cardsInHand: p.id === id ? sortHand29(p.cards) : masked(p.cards.length)
		})),
		legalActions: {
			start: id === room.hostId && !playing(room) && active(room).length === SEATS,
			ready: !playing(room),
			addBot: id === room.hostId && !playing(room) && active(room).length < SEATS,
			bid:
				turn && room.stage === 'bid'
					? Array.from({ length: Math.max(0, MAX_BID - floor + 1) }, (_, k) => floor + k)
					: [],
			pass: turn && room.stage === 'bid',
			chooseTrump: turn && room.stage === 'trump' ? sortHand29(self.cards) : [],
			reveal: turn && mustAsk(room, id),
			pair: turn && room.stage === 'play' && hasPair(room, id),
			play:
				turn && room.stage === 'play' && !mustAsk(room, id) ? sortHand29(legalFor(room, id)) : []
		}
	};
}
