import {
	buildDeck,
	cardKey,
	sameCard,
	legalPlays,
	trickWinner,
	sortHand,
	fnv,
	SUITS
} from './cards.mjs';
import { castMember } from '../../src/lib/bots/cast.js';
import { GameError } from '../engine.mjs';

/**
 * 10 Pakad (Dehla Pakad), Chaal V1 rules (docs/archive/games/10PAKAD_PLAN.md §1, locked 2026-10-22): four
 * players in two partnerships (seats 0 and 2 against 1 and 3), 52 cards, play anticlockwise.
 *
 * - Five cards each; play starts with no trump. The first player who cannot follow suit sets trump
 *   with the card they play, already in that trick. If all five opening tricks are followed, a card
 *   drawn from them (a secret, replayable choice) sets it. After that trick the rest is dealt in
 *   fours: 13 cards each, 13 tricks.
 * - A trick's cards go to the centre pile. When the same player wins two tricks in a row they collect
 *   the whole pile for their team; the winner of the 13th trick collects whatever is left.
 * - Tens decide the hand: all four is a Kot; the non-dealing team wins the hand with 2 or 3 tens
 *   (a 2-2 split included), the dealing team with 3. Seven hands in a row is also a Kot.
 * - Next dealer: the same one after a non-dealing win; to the right after a dealing-team win or Kot;
 *   to the dealer's partner after a non-dealing Kot. The table plays as many hands as it likes.
 *
 * Same contract as the other engines (server/games/index.mjs): a pure transition with the deck and
 * clock from ctx, a per-seat projection (the only thing a client or a bot sees), and an invariant.
 * The projection shows the current and the last trick and, for the centre and captured piles, only
 * the number of cards and of tens (the owner's decision): a player remembers the rest, as at a real
 * table, and so do the bots (server/bots/tricks/observation-pakad.mjs).
 */
export const RULES_VERSION = 'ten-pakad-1';
export const SEATS = 4;
const TRICKS = 13;
const OPENING = 5;
const RUN_KOT = 7;

export const freshPakadDeck = () =>
	buildDeck(
		Object.fromEntries(SUITS.map((s) => [s, [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]]))
	);
const DECK_KEYS = new Set(freshPakadDeck().map(cardKey));
const tensIn = (cards) => cards.filter((c) => c.rank === 10).length;

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
/** Seats anticlockwise: the player to your right plays after you. */
const ring = (room) =>
	active(room)
		.slice()
		.sort((a, b) => b.seatNumber - a.seatNumber)
		.map((p) => p.id);

function setTurn(room, id, ctx) {
	room.currentPlayerId = id;
	room.deadline = id ? ctx.now + ctx.turnMs : null;
}

export function newRoom(name, table, hostId) {
	fail(typeof name === 'string' && /^[a-z0-9][a-z0-9-]{2,31}$/.test(name), 'Invalid room name');
	fail(Number.isSafeInteger(table) && table >= 0 && table <= 1_000_000, 'Invalid table');
	return {
		schema: 1,
		gameType: 'ten-pakad',
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
		order: [],
		trump: null,
		trumpSetBy: null,
		pending: [],
		trick: null,
		tricksPlayed: 0,
		lastTrick: null,
		centre: [],
		streak: null,
		captured: [[], []],
		match: { kots: [0, 0], handsWon: [0, 0], run: { team: null, hands: 0 } },
		secret: null,
		currentPlayerId: null,
		deadline: null,
		result: null
	};
}

export function invariant(room) {
	fail(room.pot === 0, '10 Pakad has no pot', 'INVARIANT');
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
			...room.trick.plays.map((p) => p.card),
			...room.centre,
			...room.captured.flat()
		];
		fail(
			all.length === 52 && new Set(all.map(cardKey)).size === 52,
			'Cards not conserved',
			'INVARIANT'
		);
	}
}

/** The hand's result from the tens each team took (§1 "Hand result", "Next dealer", "Seven in a row"). */
export function scoreHand(tens, dealingTeam, run) {
	const other = 1 - dealingTeam;
	let winner;
	let kot = null;
	if (tens[0] === 4 || tens[1] === 4) {
		winner = tens[0] === 4 ? 0 : 1;
		kot = 'four-tens';
	} else winner = tens[other] >= 2 ? other : dealingTeam;
	let nextRun = kot
		? { team: null, hands: 0 }
		: { team: winner, hands: run.team === winner ? run.hands + 1 : 1 };
	if (!kot && nextRun.hands === RUN_KOT) {
		kot = 'seven-in-a-row';
		nextRun = { team: null, hands: 0 };
	}
	const dealer = winner === dealingTeam ? 'right' : kot === 'four-tens' ? 'partner' : 'same';
	return { winner, kot, run: nextRun, dealer };
}

function endHand(room, reason) {
	const dealingTeam = teamOf(room, room.dealerId);
	room.stage = 'hand-over';
	room.gameShow = true;
	room.currentPlayerId = null;
	room.deadline = null;
	if (reason !== 'hand-complete') {
		room.result = {
			reason,
			handId: room.handId,
			hand: room.hand,
			tens: null,
			winnerId: 'none',
			winnerName: 'Hand abandoned',
			amount: 0
		};
		return;
	}
	const tens = [tensIn(room.captured[0]), tensIn(room.captured[1])];
	const s = scoreHand(tens, dealingTeam, room.match.run);
	room.match.handsWon[s.winner]++;
	if (s.kot) room.match.kots[s.winner]++;
	room.match.run = s.run;
	// The dealer for the next hand, by the rule above; the ring is anticlockwise.
	const r = room.order.slice(-1).concat(room.order.slice(0, -1)); // dealer first, then to the right
	room.nextDealerId = s.dealer === 'same' ? r[0] : s.dealer === 'right' ? r[1] : r[2];
	const team = room.order.filter((id) => teamOf(room, id) === s.winner);
	room.result = {
		reason,
		handId: room.handId,
		hand: room.hand,
		tens,
		winnerTeam: s.winner,
		kot: s.kot,
		dealingTeam,
		winnerId: team[0],
		winnerName: team.map((id) => byId(room, id).username).join(' and '),
		amount: 0
	};
}

/** After the trick that set trump (or the fifth opening trick), the rest of the deal: fours, twice. */
function dealRest(room) {
	for (let packet = 0; packet < 2; packet++)
		for (const id of room.order)
			for (let k = 0; k < 4; k++) byId(room, id).cards.push(room.pending.shift());
	room.stage = 'play';
}

/** The automatic move for a person whose turn ran out (never a bot persona): simple and legal. */
export function autoMove(room, id) {
	const me = byId(room, id);
	const legal = legalPlays(me.cards, room.trick.plays[0]?.card.suit);
	const low = legal
		.slice()
		.sort(
			(a, b) =>
				(a.suit === room.trump) - (b.suit === room.trump) ||
				(a.rank === 10) - (b.rank === 10) ||
				a.rank - b.rank
		)[0];
	return { action: 'play', payload: { card: low } };
}

function completeTrick(room, ctx) {
	const plays = room.trick.plays;
	const w = plays[trickWinner(plays, room.trump)].id;
	room.tricksPlayed++;
	room.centre.push(...plays.map((p) => p.card));
	const last = room.tricksPlayed === TRICKS;
	const collects = last || (room.streak?.id === w && room.streak.wins === 1);
	room.lastTrick = { plays, winner: w, collected: collects, n: room.tricksPlayed };
	if (collects) {
		room.captured[teamOf(room, w)].push(...room.centre);
		room.centre = [];
		room.streak = null;
	} else room.streak = { id: w, wins: 1 };
	room.trick = { leader: w, plays: [] };
	if (last) return endHand(room, 'hand-complete');
	if (room.stage === 'open') {
		if (!room.trump && room.tricksPlayed === OPENING) {
			// Everyone followed all five: a card drawn from those tricks sets trump.
			const opened = room.centre.concat(room.captured.flat());
			const drawn = opened
				.map((card) => ({ card, k: fnv(`${room.secret.salt}|trump|${cardKey(card)}`) }))
				.sort((a, b) => a.k - b.k)[0].card;
			room.trump = drawn.suit;
			room.trumpSetBy = { drawn: { ...drawn } };
		}
		if (room.trump) dealRest(room);
	}
	setTurn(room, w, ctx);
}

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
		fail(seatNumber !== undefined, '10 Pakad is for four players: this table is full');
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
				'10 Pakad needs exactly four players: fill the empty seats with bots'
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
					deck.length === 52 &&
					new Set(deck.map(cardKey)).size === 52 &&
					deck.every((c) => DECK_KEYS.has(cardKey(c))),
				'Invalid 10 Pakad deck',
				'INVARIANT'
			);
			for (const old of room.players) if (old.departed) old.seatNumber = null;
			room.secret = { salt: deck.map(cardKey).join('') };
			const r = ring(room);
			// The first dealer is drawn from the shuffled deck; later dealers follow the hand results.
			const known = room.nextDealerId && r.includes(room.nextDealerId);
			const dealer = known ? room.nextDealerId : r[fnv(`${room.secret.salt}|dealer`) % SEATS];
			const d = r.indexOf(dealer);
			room.order = [1, 2, 3, 0].map((k) => r[(d + k) % SEATS]); // dealer's right first, dealer last
			room.dealerId = dealer;
			room.hand++;
			room.pending = structuredClone(deck);
			for (const p of room.players) p.cards = [];
			for (const pid of room.order)
				for (let k = 0; k < 5; k++) byId(room, pid).cards.push(room.pending.shift());
			Object.assign(room, {
				trump: null,
				trumpSetBy: null,
				trick: { leader: room.order[0], plays: [] },
				tricksPlayed: 0,
				lastTrick: null,
				centre: [],
				streak: null,
				captured: [[], []],
				handId: ctx.handId,
				result: null,
				isStarted: true,
				gameShow: false,
				stage: 'open'
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
			if (action === 'play') {
				const card = payload.card;
				const led = room.trick.plays[0]?.card.suit;
				fail(card && player.cards.some((c) => sameCard(c, card)), 'Play a card from your hand');
				fail(
					legalPlays(player.cards, led).some((c) => sameCard(c, card)),
					'Follow the suit that was led'
				);
				// The first card played off suit before trump is known sets trump, in this trick already.
				if (!room.trump && led && card.suit !== led) {
					room.trump = card.suit;
					room.trumpSetBy = {
						id,
						trick: room.tricksPlayed + 1,
						card: { rank: card.rank, suit: card.suit }
					};
				}
				player.cards = player.cards.filter((c) => !sameCard(c, card));
				room.trick.plays.push({ id, card: { rank: card.rank, suit: card.suit } });
				if (room.trick.plays.length < SEATS) setTurn(room, nextInOrder(room, id), ctx);
				else completeTrick(room, ctx);
			} else fail(false, 'Unknown 10 Pakad action');
		}
	}
	room.revision++;
	invariant(room);
	return room;
}

const masked = (n) => Array.from({ length: n }, () => ({ rank: 0, suit: '' }));
const pile = (cards) => ({ count: cards.length, tens: tensIn(cards) });

/** What one seat sees. Everything a client or a bot receives about the table comes from here. */
export function projection(room, id, connected) {
	const self = byId(room, id);
	fail(self && self.seatNumber !== null && !self.departed, 'Not a room member', 'NOT_MEMBER');
	const list = seated(room);
	const turn = playing(room) && room.currentPlayerId === id;
	const led = room.trick?.plays[0]?.card.suit;
	return {
		name: room.name,
		gameType: 'ten-pakad',
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
		trump: room.trump,
		trumpSetBy: room.trumpSetBy ? structuredClone(room.trumpSetBy) : null,
		trick: room.trick ? structuredClone(room.trick) : null,
		lastTrick: room.lastTrick ? structuredClone(room.lastTrick) : null,
		tricksPlayed: room.tricksPlayed,
		centre: pile(room.centre),
		captured: room.captured.map(pile),
		streak: room.streak ? { ...room.streak } : null,
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
			cardsInHand: p.id === id ? sortHand(p.cards) : masked(p.cards.length)
		})),
		legalActions: {
			start: id === room.hostId && !playing(room) && active(room).length === SEATS,
			ready: !playing(room),
			addBot: id === room.hostId && !playing(room) && active(room).length < SEATS,
			play:
				turn && (room.stage === 'open' || room.stage === 'play')
					? sortHand(legalPlays(self.cards, led))
					: []
		}
	};
}
