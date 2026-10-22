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
 * 3 2 5 (Teen Do Paanch), Chaal V1 rules (docs/archive/games/325_RULES.md): three players, 30 cards, quotas
 * of 5, 3 and 2 tricks, trump chosen by the 5-player from their first five cards, and pulling between
 * rounds as its own phase with the pulled card unknown to the puller.
 *
 * Same contract as the other game engines (server/games/index.mjs): a pure
 * transition(snapshot, id, action, payload, ctx) with the deck and clock from ctx, a per-seat
 * projection (the only thing a client or a bot ever sees), and an invariant.
 */
export const RULES_VERSION = 'three-two-five-1';
export const SEATS = 3;
export const QUOTAS = Object.freeze([5, 3, 2]);
const TRICKS = 10;

/** The V1 deck: 8 to A in every suit, plus 7♥ and 7♠. Rules options would change `sevens`. */
export function fresh325Deck(sevens = ['hearts', 'spades']) {
	const high = [14, 13, 12, 11, 10, 9, 8];
	return buildDeck(
		Object.fromEntries(SUITS.map((s) => [s, sevens.includes(s) ? [...high, 7] : high]))
	);
}
const DECK_KEYS = new Set(fresh325Deck().map(cardKey));

// Rule errors are GameErrors, so the room server shows players the reason, not a service failure.
const fail = (condition, message, code = 'INVALID_ACTION') => {
	if (!condition) throw new GameError(message, code);
};
const seated = (room) =>
	room.players.filter((p) => p.seatNumber !== null).sort((a, b) => a.seatNumber - b.seatNumber);
const active = (room) => seated(room).filter((p) => !p.departed);
export const playing = (room) => room.isStarted && !room.gameShow;
const byId = (room, id) => room.players.find((p) => p.id === id);
const nextInOrder = (room, id) => room.order[(room.order.indexOf(id) + 1) % room.order.length];

function setTurn(room, id, ctx) {
	room.currentPlayerId = id;
	room.deadline = id ? ctx.now + ctx.turnMs : null;
}

/** The secret, replayable order in which a player's cards are offered face down for a pull. */
export function faceDownOrder(room, victimId, pullIndex) {
	const cards = byId(room, victimId).cards;
	return cards
		.map((card) => ({ card, k: fnv(`${room.secret.salt}|${pullIndex}|${cardKey(card)}`) }))
		.sort((a, b) => a.k - b.k)
		.map((x) => x.card);
}

/** One pull per extra trick: the furthest above quota pulls first, from the furthest below. */
export function pullQueue(diffs) {
	const over = Object.entries(diffs)
		.filter(([, d]) => d > 0)
		.sort((a, b) => b[1] - a[1]);
	const short = Object.fromEntries(
		Object.entries(diffs)
			.filter(([, d]) => d < 0)
			.map(([id, d]) => [id, -d])
	);
	const queue = [];
	for (const [puller, extra] of over)
		for (let k = 0; k < extra; k++) {
			const victim = Object.entries(short)
				.filter(([, n]) => n > 0)
				.sort((a, b) => b[1] - a[1])[0]?.[0];
			if (!victim) break;
			short[victim]--;
			queue.push({ puller, victim });
		}
	return queue;
}

export function newRoom(name, table, hostId) {
	fail(typeof name === 'string' && /^[a-z0-9][a-z0-9-]{2,31}$/.test(name), 'Invalid room name');
	fail(Number.isSafeInteger(table) && table >= 0 && table <= 1_000_000, 'Invalid table');
	return {
		schema: 1,
		gameType: 'three-two-five',
		rulesVersion: RULES_VERSION,
		rules: { sevens: ['hearts', 'spades'] },
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
		round: 0,
		dealerId: null,
		order: [],
		quotas: {},
		tricks: {},
		scores: {},
		last: null,
		trump: null,
		pending: [],
		trick: null,
		history: [],
		pulls: null,
		secret: null,
		deck: [],
		currentPlayerId: null,
		deadline: null,
		result: null
	};
}

export function invariant(room) {
	fail(room.pot === 0, '3 2 5 has no pot', 'INVARIANT');
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
			...room.history.flatMap((t) => t.plays.map((p) => p.card))
		];
		fail(
			all.length === 30 && new Set(all.map(cardKey)).size === 30,
			'Cards not conserved',
			'INVARIANT'
		);
	}
}

function endRound(room, reason) {
	const diffs = Object.fromEntries(
		room.order.map((id) => [id, (room.tricks[id] ?? 0) - room.quotas[id]])
	);
	if (reason === 'round-complete') {
		for (const [id, d] of Object.entries(diffs)) room.scores[id] = (room.scores[id] ?? 0) + d;
		room.last = { ids: room.order.slice(), diffs };
	} else room.last = null;
	const best = room.order.slice().sort((a, b) => diffs[b] - diffs[a])[0];
	room.stage = 'round-over';
	room.gameShow = true;
	room.currentPlayerId = null;
	room.deadline = null;
	room.pulls = null;
	room.result = {
		reason,
		handId: room.handId,
		round: room.round,
		quotas: { ...room.quotas },
		tricks: { ...room.tricks },
		diffs: reason === 'round-complete' ? diffs : null,
		winnerId: reason === 'round-complete' ? best : 'none',
		winnerName: reason === 'round-complete' ? byId(room, best)?.username : 'Round abandoned',
		amount: 0
	};
}

function dealRest(room, ctx) {
	for (const packet of [3, 2])
		for (const id of room.order)
			for (let k = 0; k < packet; k++) byId(room, id).cards.push(room.pending.shift());
	if (room.pulls?.queue.length) {
		room.stage = 'pull';
		room.pulls.index = 0;
		room.pulls.step = 'take';
		room.pulls.taken = null;
		setTurn(room, room.pulls.queue[0].puller, ctx);
	} else beginPlay(room, ctx);
}

function beginPlay(room, ctx) {
	room.stage = 'play';
	room.pulls = room.pulls ? { ...room.pulls, done: true } : null;
	room.trick = { leader: room.order[0], plays: [] };
	setTurn(room, room.order[0], ctx);
}

/** The automatic move for a person whose turn ran out (never a bot persona): simple and legal. */
export function autoMove(room, id) {
	const me = byId(room, id);
	if (room.stage === 'trump') {
		const count = (s) => me.cards.filter((c) => c.suit === s).reduce((n, c) => n + 100 + c.rank, 0);
		return {
			action: 'chooseTrump',
			payload: { suit: SUITS.slice().sort((a, b) => count(b) - count(a))[0] }
		};
	}
	if (room.stage === 'pull' && room.pulls.step === 'take')
		return { action: 'pull', payload: { position: 0 } };
	if (room.stage === 'pull') {
		const options = me.cards.filter((c) => !sameCard(c, room.pulls.taken));
		const low = options
			.slice()
			.sort((a, b) => (a.suit === room.trump) - (b.suit === room.trump) || a.rank - b.rank)[0];
		return { action: 'give', payload: { card: low } };
	}
	const legal = legalPlays(me.cards, room.trick.plays[0]?.card.suit);
	return {
		action: 'play',
		payload: {
			card: legal
				.slice()
				.sort((a, b) => (a.suit === room.trump) - (b.suit === room.trump) || a.rank - b.rank)[0]
		}
	};
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
		fail(!playing(room), 'A round is in progress: join when it ends');
		for (const old of room.players) if (old.departed) old.seatNumber = null;
		const used = new Set(seated(room).map((p) => p.seatNumber));
		const seatNumber = Array.from({ length: SEATS }, (_, n) => n).find((n) => !used.has(n));
		fail(seatNumber !== undefined, '3 2 5 is for three players: this table is full');
		if (!player) {
			player = {
				id,
				username: payload.username.trim().toLowerCase(),
				balance: 0,
				handBet: 0,
				seatNumber,
				cards: [],
				ready: false,
				departed: false
			};
			room.players.push(player);
		} else
			Object.assign(player, {
				username: payload.username.trim().toLowerCase(),
				seatNumber,
				cards: [],
				ready: false,
				departed: false
			});
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
			fail(!playing(room), 'Readiness is locked during a round');
			fail(typeof payload.ready === 'boolean', 'Invalid ready state');
			player.ready = payload.ready;
		} else if (action === 'addBot') {
			fail(id === room.hostId, 'Only the host can add bots', 'FORBIDDEN');
			fail(!playing(room), 'Add bots between rounds');
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
			fail(!playing(room), 'Remove bots between rounds');
			const bot = byId(room, payload.botId);
			fail(bot?.bot && !bot.departed, 'No such bot');
			bot.departed = true;
			bot.seatNumber = null;
		} else if (action === 'start') {
			fail(id === room.hostId, 'Only the host can start a round', 'FORBIDDEN');
			fail(!playing(room), 'A round is already in progress');
			const players = active(room);
			fail(
				players.length === SEATS,
				'3 2 5 needs exactly three players: fill the empty seats with bots'
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
					deck.length === 30 &&
					new Set(deck.map(cardKey)).size === 30 &&
					deck.every((c) => DECK_KEYS.has(cardKey(c))),
				'Invalid 3 2 5 deck',
				'INVARIANT'
			);
			for (const old of room.players) if (old.departed) old.seatNumber = null;
			const ids = players.map((p) => p.id);
			const dealer = ids[room.round % SEATS];
			const d = ids.indexOf(dealer);
			room.order = [ids[(d + 1) % SEATS], ids[(d + 2) % SEATS], dealer];
			room.dealerId = dealer;
			room.quotas = Object.fromEntries(room.order.map((pid, i) => [pid, QUOTAS[i]]));
			room.tricks = Object.fromEntries(room.order.map((pid) => [pid, 0]));
			for (const pid of ids) room.scores[pid] ??= 0;
			// Pulls carry over only between the same three players.
			const carry = room.last && room.last.ids.every((pid) => ids.includes(pid));
			room.pulls = carry
				? { queue: pullQueue(room.last.diffs), index: 0, step: null, taken: null }
				: null;
			room.round++;
			room.secret = { salt: deck.map(cardKey).join('') };
			room.pending = structuredClone(deck);
			for (const p of room.players) p.cards = [];
			for (const pid of room.order)
				for (let k = 0; k < 5; k++) byId(room, pid).cards.push(room.pending.shift());
			room.trump = null;
			room.trick = { leader: room.order[0], plays: [] };
			room.history = [];
			room.handId = ctx.handId;
			room.result = null;
			room.isStarted = true;
			room.gameShow = false;
			room.stage = 'trump';
			setTurn(room, room.order[0], ctx);
		} else if (action === 'leave') {
			player.departed = true;
			if (playing(room)) endRound(room, 'abandoned');
			player.seatNumber = null;
			if (room.hostId === id) room.hostId = active(room).find((p) => !p.bot)?.id ?? null;
		} else {
			fail(playing(room) && room.currentPlayerId === id, 'It is not your turn', 'OUT_OF_TURN');
			fail(ctx.auto || ctx.now < room.deadline, 'Turn has expired', 'STALE_TURN');
			if (action === 'chooseTrump') {
				fail(room.stage === 'trump', 'Trump is already chosen');
				fail(SUITS.includes(payload.suit), 'Choose a suit');
				room.trump = payload.suit;
				dealRest(room, ctx);
			} else if (action === 'pull') {
				fail(room.stage === 'pull' && room.pulls.step === 'take', 'Not time to pull');
				const { victim } = room.pulls.queue[room.pulls.index];
				const offered = faceDownOrder(room, victim, room.pulls.index);
				fail(
					Number.isInteger(payload.position) &&
						payload.position >= 0 &&
						payload.position < offered.length,
					'Pick one of the face-down cards'
				);
				const card = offered[payload.position];
				const from = byId(room, victim);
				from.cards = from.cards.filter((c) => !sameCard(c, card));
				player.cards.push(card);
				room.pulls.taken = card;
				room.pulls.step = 'give';
			} else if (action === 'give') {
				fail(room.stage === 'pull' && room.pulls.step === 'give', 'Not time to return a card');
				const card = payload.card;
				fail(card && player.cards.some((c) => sameCard(c, card)), 'Return a card from your hand');
				fail(!sameCard(card, room.pulls.taken), 'Return a different card from the one you pulled');
				const { victim } = room.pulls.queue[room.pulls.index];
				player.cards = player.cards.filter((c) => !sameCard(c, card));
				byId(room, victim).cards.push({ rank: card.rank, suit: card.suit });
				room.pulls.index++;
				room.pulls.taken = null;
				if (room.pulls.index < room.pulls.queue.length) {
					room.pulls.step = 'take';
					setTurn(room, room.pulls.queue[room.pulls.index].puller, ctx);
				} else beginPlay(room, ctx);
			} else if (action === 'play') {
				fail(room.stage === 'play', 'Not time to play');
				const card = payload.card;
				const led = room.trick.plays[0]?.card.suit;
				fail(card && player.cards.some((c) => sameCard(c, card)), 'Play a card from your hand');
				fail(
					legalPlays(player.cards, led).some((c) => sameCard(c, card)),
					'Follow the suit that was led'
				);
				player.cards = player.cards.filter((c) => !sameCard(c, card));
				room.trick.plays.push({ id, card: { rank: card.rank, suit: card.suit } });
				if (room.trick.plays.length < SEATS) setTurn(room, nextInOrder(room, id), ctx);
				else {
					const w = room.trick.plays[trickWinner(room.trick.plays, room.trump)].id;
					room.tricks[w]++;
					room.history.push({ leader: room.trick.leader, plays: room.trick.plays, winner: w });
					if (room.history.length === TRICKS) {
						room.trick = { leader: w, plays: [] };
						endRound(room, 'round-complete');
					} else {
						room.trick = { leader: w, plays: [] };
						setTurn(room, w, ctx);
					}
				}
			} else fail(false, 'Unknown 3 2 5 action');
		}
	}
	room.revision++;
	invariant(room);
	return room;
}

const masked = (n) => Array.from({ length: n }, () => ({ rank: 0, suit: '' }));

/** What one seat sees. Everything a client or a bot receives about the table comes from here. */
export function projection(room, id, connected) {
	const self = byId(room, id);
	fail(self && self.seatNumber !== null && !self.departed, 'Not a room member', 'NOT_MEMBER');
	const list = seated(room);
	const turn = playing(room) && room.currentPlayerId === id;
	let pull = null;
	if (room.stage === 'pull' && room.pulls) {
		const { puller, victim } = room.pulls.queue[room.pulls.index];
		pull = {
			index: room.pulls.index,
			total: room.pulls.queue.length,
			puller,
			victim,
			step: room.pulls.step,
			faceDown: byId(room, victim).cards.length,
			// Only the puller learns what was taken; the victim sees it gone from their own hand.
			taken: id === puller && room.pulls.taken ? { ...room.pulls.taken } : null
		};
	}
	const led = room.trick?.plays[0]?.card.suit;
	return {
		name: room.name,
		gameType: 'three-two-five',
		rulesVersion: room.rulesVersion,
		table: room.table,
		selfId: id,
		hostId: room.hostId,
		revision: room.revision,
		handId: room.handId,
		isStarted: room.isStarted,
		gameShow: room.gameShow,
		stage: room.stage,
		round: room.round,
		pot: 0,
		dealerId: room.dealerId,
		order: room.order.slice(),
		quotas: { ...room.quotas },
		tricks: { ...room.tricks },
		scores: { ...room.scores },
		lastRound: room.last ? { ...room.last.diffs } : null,
		trump: room.trump,
		trick: room.trick ? structuredClone(room.trick) : null,
		history: structuredClone(room.history),
		pull,
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
			chooseTrump: turn && room.stage === 'trump',
			pull: turn && room.stage === 'pull' && room.pulls.step === 'take' ? pull.faceDown : 0,
			give:
				turn && room.stage === 'pull' && room.pulls.step === 'give'
					? sortHand(self.cards.filter((c) => !sameCard(c, room.pulls.taken)))
					: [],
			play: turn && room.stage === 'play' ? sortHand(legalPlays(self.cards, led)) : []
		}
	};
}
