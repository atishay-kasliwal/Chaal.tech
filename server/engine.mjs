import { freshDeck } from './classic.mjs';
import { DEFAULT_RULES_VERSION, getVariant, listVariants } from './variants/index.mjs';
import { getGameEngine } from './games/index.mjs';
import { describeHand, describeKeep, wildIndexes } from './variants/describe.mjs';
import { compareVectors } from './variants/hand-utils.mjs';
import { settleUp } from './settle-up.mjs';
import { botCharacter } from '../shared/bot-characters.mjs';
import { configErrors } from './bots/config.mjs';

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
/** Throw one card from a hand: folded cards stay last in hand, and the variant hears about it. */
function throwCard(room, variant, player, index) {
	const [thrown] = player.cards.splice(index, 1);
	// Retain folded cards outside the played three; publish only what the variant makes public.
	if (variant.foldsToEnd) {
		player.cards.push(thrown);
		player.folded = true;
	}
	if (variant.onDiscard) {
		// Rooms saved before a variant gained public state can still finish their hand.
		room.variantState ??= variant.prepareHand({ remainingDeck: room.deck }).state;
		variant.onDiscard(room.variantState, { card: thrown, playerId: player.id });
	}
}
/** A seen player in a discard variant must throw cards away before betting or Show. */
const mustDiscard = (variant, player) =>
	Number.isInteger(variant.discardTo) &&
	!player.isBlind &&
	!player.folded &&
	player.cards.length > variant.discardTo;
export const playing = (room) => room.isStarted && !room.gameShow;
/** The hand state one player's cards are scored with: their own jokers in some games. */
const handStateOf = (variant, room, playerId) =>
	variant.stateFor ? variant.stateFor(room.variantState, playerId) : room.variantState;
/** Compare two players' hands, each with their own jokers where the game gives them. */
function compareFor(variant, room, left, right) {
	if (!variant.stateFor) return variant.compareHands(left.cards, right.cards, room.variantState);
	return compareVectors(
		variant.evaluateHand(left.cards, handStateOf(variant, room, left.id)),
		variant.evaluateHand(right.cards, handStateOf(variant, room, right.id))
	);
}
/** A variant hook that rejects a move throws a plain Error: report it like any illegal move. */
function variantMove(fn) {
	try {
		return fn();
	} catch (error) {
		if (error instanceof GameError) throw error;
		throw new GameError(error.message);
	}
}
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

/** Between hands, one player at a time picks the next game, for up to this long. */
export const CHOOSE_MS = 60 * 1000;
/** Alone with bots, the pick is yours every hand: a shorter window keeps the game moving. */
export const SOLO_CHOOSE_MS = 15 * 1000;
/** When the turn passes to someone new, they get this long to keep or change the standing game. */
export const HANDOVER_CHOOSE_MS = 20 * 1000;
const CHOICES = new Set(['keep', 'next', 'random']);
/** Once the next game is settled, everyone gets this long to read its rules before the deal. */
export const REVEAL_MS = 15 * 1000;
/** Alone with bots the rules card is short. */
export const SOLO_REVEAL_MS = 5 * 1000;
/** The same game again needs no rules card: a short pause, then deal. */
export const SAME_GAME_MS = 4 * 1000;

const humansSeated = (room) => seated(room).filter((p) => !p.bot && !p.departed).length;

/**
 * End the night: the table's last word. Records how the night went and who settles with whom,
 * then the table takes no more hands.
 */
function finishNight(room, by, ctx) {
	const people = room.players
		.filter((p) => !p.bot && room.realNet?.[p.id] !== undefined)
		.map((p) => ({ id: p.id, name: p.username, net: room.realNet[p.id] }));
	const stats = room.nightStats ?? { hands: 0, games: {}, biggest: null };
	room.ended = {
		at: ctx?.now ?? 0,
		by,
		startedAt: room.nightStartedAt ?? null,
		hands: stats.hands,
		games: { ...stats.games },
		biggest: stats.biggest ? { ...stats.biggest } : null,
		realNet: people,
		settleUp: settleUp(people),
		players: room.players
			.filter((p) => !p.bot && (p.seatNumber !== null || room.realNet?.[p.id] !== undefined))
			.map((p) => ({ id: p.id, name: p.username }))
	};
	delete room.ending;
	delete room.chooser;
	delete room.upNext;
	dropCut(room);
}

/** Time the cutter gets to cut the sealed deck before the deal (alongside the rules card). */
export const CUT_MS = 15 * 1000;

/**
 * Open the cut: the person whose turn it was to pick (the host for the first hand) cuts the deck
 * the server sealed for the next hand. Bots never cut; a cut that doesn't come is made at random.
 */
function openCut(room, by, ctx) {
	delete room.cut;
	delete room.seal;
	const cutter = room.players.find((p) => p.id === by && !p.bot && !p.departed);
	if (room.boot === undefined || !cutter || !Number.isFinite(ctx?.now)) return;
	// One person against bots: nobody else could be cheated, so there is nothing to cut and no wait.
	if (humansSeated(room) <= 1) return;
	room.cut = { by, ms: CUT_MS, deadline: ctx.now + CUT_MS, at: null };
}
/** Forget a cut (and its sealed deck) when the next game is no longer settled. */
function dropCut(room) {
	delete room.cut;
	delete room.seal;
}

/**
 * What everyone may know of the sealed deck: before the deal, its fingerprint; after the hand,
 * the proof for every card shown (its place in the sealed deck and its secret). Packed hands that
 * were never shown stay hidden: only their fingerprints are listed.
 */
function deckProof(room, reveal) {
	const seal = room.handSeal;
	if (!seal?.commitment) return null;
	if (!room.result)
		return { commitment: seal.commitment, cutAt: seal.cutAt, by: seal.cutBy ?? null };
	const position = new Map(seal.deck.map((card, index) => [`${card.rank}:${card.suit}`, index]));
	const cards = room.players
		.filter((p) => reveal.has(p.id))
		.flatMap((p) => p.cards)
		.map((card) => {
			const pos = position.get(`${card.rank}:${card.suit}`);
			return { pos, rank: card.rank, suit: card.suit, salt: seal.salts[pos] };
		})
		.filter((card) => Number.isInteger(card.pos));
	return {
		commitment: seal.commitment,
		cutAt: seal.cutAt,
		by: seal.cutBy ?? null,
		leaves: [...seal.leaves],
		cards
	};
}

/** A lineup slot that draws a surprise game (same rule as Random) when its turn comes. */
export const MYSTERY = 'mystery';

/**
 * Where the night's lineup goes next. Each slot plays for `hands` hands (0 = one round: a hand
 * per player seated), then the next slot; the lineup loops. A table that hasn't followed the
 * lineup yet starts after the game it is playing (or at the top).
 */
function lineupStep(room, slots, hands) {
	const at = room.lineupAt;
	const perGame = hands === 0 ? Math.max(1, seated(room).filter((p) => !p.departed).length) : hands;
	if (
		at &&
		slots[at.index] !== undefined &&
		at.rulesVersion === room.rulesVersion &&
		at.played < perGame
	)
		return { index: at.index, slot: slots[at.index], repeat: true };
	const from = at && slots[at.index] !== undefined ? at.index : slots.indexOf(room.rulesVersion);
	const index = (from + 1) % slots.length;
	return { index, slot: slots[index], repeat: false };
}

/** A game Random just played sits out this many hands before it can come up again. */
export const RANDOM_COOLDOWN = 4;

/**
 * Random plays like a shuffled playlist: every game in the pool once, in a random order, then a
 * fresh shuffle. On top of that, the last RANDOM_COOLDOWN games played never come up (so AK47
 * played now is out for the next four hands); a pool too small for that gets the game played
 * longest ago. `randomInt(n)` is 0..n-1.
 */
function drawRandom(room, pool, randomInt) {
	const key = [...pool].sort().join(',');
	const recent = (room.recentGames ?? []).slice(-RANDOM_COOLDOWN);
	const shuffle = (list) => {
		const out = [...list];
		for (let i = out.length - 1; i > 0; i--) {
			const j = randomInt(i + 1);
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	};
	let bag = room.randomBag?.pool === key ? room.randomBag.left.filter((v) => pool.includes(v)) : [];
	if (!bag.some((v) => !recent.includes(v)))
		bag = [...bag, ...shuffle(pool.filter((v) => !bag.includes(v)))];
	let at = bag.findIndex((v) => !recent.includes(v));
	let next;
	if (at >= 0) next = bag.splice(at, 1)[0];
	else {
		// Every game in the pool was played lately: take the one played longest ago.
		const lastPlayed = (v) => recent.lastIndexOf(v);
		next = [...pool].sort((x, y) => lastPlayed(x) - lastPlayed(y))[0];
		at = bag.indexOf(next);
		if (at >= 0) bag.splice(at, 1);
	}
	room.randomBag = { pool: key, left: bag };
	return next;
}

/**
 * Settle what the next hand plays, as soon as the pick is final, so everyone can be shown the
 * game and its rules before the deal. A pick nobody made falls back to tonight's lineup, or to
 * Random. Needs ctx.randomInt; without it the deal settles the game instead (older callers).
 */
function settleNext(room, ctx) {
	if (!room.chooser || room.upNext || !ctx?.randomInt || !Number.isFinite(ctx.now)) return;
	const chooser = room.chooser;
	// The lineup's slots (games and Mystery slots), and just its games for Random to draw from.
	const slots = (ctx.lineup ?? []).filter((v) => v === MYSTERY || getVariant(v));
	const lineup = slots.filter((version) => getVariant(version));
	const choice = chooser.choice ?? room.standing?.choice ?? (slots.length ? 'next' : 'random');
	const everyGame = listVariants().map((variant) => variant.rulesVersion);
	const pool = lineup.length ? lineup : everyGame;
	let lineupIndex;
	let rulesVersion;
	if (choice === 'random') rulesVersion = drawRandom(room, pool, ctx.randomInt);
	else if (choice === 'next' && slots.length) {
		const step = lineupStep(room, slots, ctx.lineupHands ?? 1);
		lineupIndex = step.index;
		rulesVersion = step.repeat
			? room.rulesVersion
			: step.slot === MYSTERY
				? drawRandom(room, everyGame, ctx.randomInt)
				: step.slot;
	} else if (choice === 'next') rulesVersion = room.rulesVersion;
	else rulesVersion = choice === 'keep' ? room.rulesVersion : choice;
	const by = chooser.choice ? chooser.playerId : (room.standing?.by ?? null);
	const changed = rulesVersion !== room.rulesVersion;
	const revealMs = changed ? (humansSeated(room) <= 1 ? SOLO_REVEAL_MS : REVEAL_MS) : 0;
	room.upNext = {
		rulesVersion,
		mode: choice === 'random' ? 'random' : choice === 'next' ? 'lineup' : 'picked',
		by,
		changed,
		revealMs,
		dealAt: ctx.now + (changed ? revealMs : SAME_GAME_MS),
		...(lineupIndex === undefined ? {} : { lineupIndex })
	};
	openCut(room, chooser.playerId, ctx);
}

/**
 * Hand over the pick to the next person in seat order after the last chooser (bots never pick).
 * Only tables created with options take part; older tables keep the host choosing.
 */
function assignChooser(room, now) {
	const people = seated(room)
		.filter((p) => !p.bot && !p.departed)
		.sort((a, b) => a.seatNumber - b.seatNumber);
	if (!people.length) {
		delete room.chooser;
		return;
	}
	const lastSeat = room.players.find((p) => p.id === room.lastChooserId)?.seatNumber ?? -1;
	const next = people.find((p) => p.seatNumber > lastSeat) ?? people[0];
	// Nothing picked yet: a full window. A standing pick (random stays random): no wait for the
	// person who set it or a solo player; anyone else gets a short turn to keep or change it.
	const window = !room.standing
		? people.length === 1
			? SOLO_CHOOSE_MS
			: CHOOSE_MS
		: people.length === 1 || room.standing.by === next.id
			? 0
			: HANDOVER_CHOOSE_MS;
	room.chooser = {
		playerId: next.id,
		handId: room.result.handId,
		deadline: now + window,
		choice: null
	};
	delete room.upNext;
	dropCut(room);
}

/**
 * What the next deal should play, from the chooser's pick: { mode, rulesVersion }, or null when
 * nobody is picking. Throws while the pick is still open. A pick that times out keeps the game.
 */
/** The game after the current one in a lineup; the first when the current one isn't in it. */
export function nextInLineup(lineup, current) {
	if (!lineup?.length) return null;
	const at = lineup.indexOf(current);
	return lineup[(at + 1) % lineup.length];
}

export function nextHandChoice(room, now, lineup = []) {
	const chooser = room.chooser;
	if (!chooser) return null;
	if (!chooser.choice && now < chooser.deadline) {
		const name = room.players.find((p) => p.id === chooser.playerId)?.username ?? 'Someone';
		throw new GameError(`${name} is picking the next game`, 'PICKING');
	}
	// This hand's pick, else the standing mode, else the lineup, else Random.
	const choice = chooser.choice ?? room.standing?.choice ?? (lineup.length ? 'next' : 'random');
	if (choice === 'random')
		return lineup.length ? { mode: 'random', pool: lineup } : { mode: 'random' };
	if (choice === 'next')
		return {
			mode: 'selected',
			rulesVersion: nextInLineup(lineup, room.rulesVersion) ?? room.rulesVersion
		};
	return { mode: 'selected', rulesVersion: choice === 'keep' ? room.rulesVersion : choice };
}

/** Players below 10% of the buy-in may ask a friend at the table for chips. */
export const CHIP_REQUEST_SHARES = [10, 25, 50];
export const chipRequestAmounts = (room) =>
	CHIP_REQUEST_SHARES.map((share) => Math.max(1, Math.floor((room.table * share) / 100)));
export const canRequestChips = (room, player) => player.balance < room.table / 10;

/** Table message for an accepted request; null when there is nothing to announce. */
export function chipGiftText(room, fromId, lenderId, accept) {
	if (accept !== true) return null;
	const request = (room.chipRequests ?? []).find((r) => r.from === fromId && r.to === lenderId);
	const name = (id) => room.players.find((p) => p.id === id)?.username;
	return request ? `${name(lenderId)} gave ${name(fromId)} ${request.amount} chips` : null;
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
	if (room.boot !== undefined) room.turnMs = player ? ctx.turnMs : null;
}
/**
 * Real money: only what moves between people counts. Each bet in the pot goes to the winners in
 * proportion to what they were paid; a flow counts only when both ends are people. So chips won
 * from a bot, or lost to one, never change anyone's real result, and real results always sum to 0.
 */
function recordReal(room, winners) {
	if (room.boot === undefined) return;
	const pot = winners.reduce((sum, winner) => sum + winner.amount, 0);
	if (!pot) return;
	const person = (id) => room.players.some((p) => p.id === id && !p.bot);
	const delta = {};
	for (const payer of room.players) {
		const bet = payer.handBet ?? 0;
		if (!bet || payer.bot) continue;
		for (const winner of winners) {
			if (winner.id === payer.id || !person(winner.id)) continue;
			const flow = (bet * winner.amount) / pot;
			delta[winner.id] = (delta[winner.id] ?? 0) + flow;
			delta[payer.id] = (delta[payer.id] ?? 0) - flow;
		}
	}
	const ids = Object.keys(delta);
	if (!ids.length) return;
	// Whole rupees that still add up to zero.
	const rounded = ids.map((id) => Math.round(delta[id]));
	const drift = rounded.reduce((sum, value) => sum + value, 0);
	if (drift) {
		const largest = ids.reduce(
			(top, id, i) => (Math.abs(delta[id]) > Math.abs(delta[ids[top]]) ? i : top),
			0
		);
		rounded[largest] -= drift;
	}
	const net = { ...(room.realNet ?? {}) };
	ids.forEach((id, i) => {
		if (rounded[i]) net[id] = (net[id] ?? 0) + rounded[i];
	});
	room.realNet = net;
}

function settle(room, winner, reason, revealed = []) {
	require(!room.result, 'Hand already settled');
	const amount = room.pot;
	recordReal(room, [{ id: winner.id, amount }]);
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
function forcedShow(room, variant, reason = 'pot-limit') {
	const contenders = active(room);
	let best = [contenders[0]];
	for (const player of contenders.slice(1)) {
		const comparison = compareFor(variant, room, player, best[0]);
		if (comparison > 0) best = [player];
		else if (comparison === 0) best.push(player);
	}
	const revealed = contenders.map((p) => p.id);
	if (best.length === 1) {
		settle(room, best[0], reason, revealed);
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
	recordReal(room, winners);
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
		reason: `${reason}-split`,
		revealedPlayerIds: revealed,
		winners,
		handId: room.handId
	};
}
/** Pay several winners from the pot and close the hand; `amounts` are whole rupees summing to the pot. */
function settleMany(room, winners, reason, revealed) {
	require(!room.result, 'Hand already settled');
	const pot = room.pot;
	recordReal(room, winners);
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
		reason,
		revealedPlayerIds: revealed,
		winners,
		handId: room.handId
	};
}
/** Split evenly among players, the odd rupees going to the first ones clockwise. */
const evenShares = (players, total) =>
	players.map((p, index) => ({
		id: p.id,
		name: p.username,
		amount: Math.floor(total / players.length) + (index < total % players.length ? 1 : 0)
	}));
/**
 * Split Pot: three or more players reached the split amount. Everyone still in shows; the best
 * hand takes half the pot and the worst hand the other half (the odd rupee goes to the best).
 * Tied hands share their half. If every hand ties, everyone shares the whole pot.
 */
function splitShow(room, variant) {
	const contenders = active(room);
	const best = [contenders[0]];
	const worst = [contenders[0]];
	for (const player of contenders.slice(1)) {
		const high = compareFor(variant, room, player, best[0]);
		if (high > 0) best.splice(0, best.length, player);
		else if (high === 0) best.push(player);
		const low = compareFor(variant, room, player, worst[0]);
		if (low < 0) worst.splice(0, worst.length, player);
		else if (low === 0) worst.push(player);
	}
	const revealed = contenders.map((p) => p.id);
	const everyone = best.length === contenders.length;
	const lowHalf = everyone ? 0 : Math.floor(room.pot / 2);
	const winners = everyone
		? evenShares(best, room.pot)
		: [...evenShares(best, room.pot - lowHalf), ...evenShares(worst, lowHalf)];
	settleMany(room, winners, 'split-pot', revealed);
}
/** Chips a table move or hook spends into the pot: [{ id, amount }], capped at what the player holds. */
function payIn(room, variant, pays) {
	for (const { id, amount } of pays) {
		const payer = room.players.find((p) => p.id === id);
		const paid = Math.min(Math.max(0, Math.floor(amount)), payer?.balance ?? 0);
		if (!paid) continue;
		payer.balance -= paid;
		if (payer.handBet !== undefined) payer.handBet += paid;
		room.pot += paid;
	}
	variant.afterPot?.(room.variantState, room.pot);
}
/**
 * Banko: with three or more players in and the pot at the banko amount, everyone shows. Players
 * who beat the banker (the dealer) split the pot; if none does, the banker takes it. Ties go to the
 * banker.
 */
function bankoShow(room, variant) {
	const contenders = active(room);
	const banker = contenders.find((p) => p.id === room.initiator);
	const beaters = contenders.filter(
		(p) => p.id !== banker.id && compareFor(variant, room, p, banker) > 0
	);
	const revealed = contenders.map((p) => p.id);
	if (!beaters.length) settle(room, banker, 'banko-banker', revealed);
	else settleMany(room, evenShares(beaters, room.pot), 'banko-players', revealed);
}
/**
 * Lap games (Knockout, Sudden Death, Survivor): after every lap of bets (one per player still in)
 * the stake may double and the lowest hand may be knocked out.
 */
function lapEffects(room, variant) {
	const lap = variant.lap;
	const state = room.variantState;
	if (!lap || !state) return;
	state.lapSize = Math.min(state.lapSize ?? Infinity, active(room).length);
	state.bets = (state.bets ?? 0) + 1;
	if (state.bets < state.lapSize) return;
	state.bets = 0;
	state.laps = (state.laps ?? 0) + 1;
	if (lap.double) room.maxStake *= 2;
	if (lap.keep) eliminateLowest(room, variant, lap.keep);
	if (playing(room)) state.lapSize = active(room).length;
}
/**
 * Pack the lowest hand (every tied lowest hand), showing it to the table, while more than `keep`
 * players remain. Nobody goes if everyone ties or if it would leave fewer than `keep`.
 */
function eliminateLowest(room, variant, keep) {
	const live = active(room);
	if (live.length <= keep) return;
	const worst = [live[0]];
	for (const player of live.slice(1)) {
		const comparison = compareFor(variant, room, player, worst[0]);
		if (comparison < 0) worst.splice(0, worst.length, player);
		else if (comparison === 0) worst.push(player);
	}
	if (worst.length === live.length || live.length - worst.length < keep) return;
	for (const player of worst) {
		player.isPacked = true;
		room.shownIds = [...new Set([...(room.shownIds ?? []), player.id])];
		if (Array.isArray(room.variantState.out))
			room.variantState.out = [...new Set([...room.variantState.out, player.id])];
	}
	const left = active(room);
	if (left.length === 1) settle(room, left[0], 'last-standing', worst.map((p) => p.id));
}
/** How long the player asked for a side show has to answer; no answer counts as a decline. */
export const SIDE_SHOW_MS = 15 * 1000;
/** The player still in who sits just before this one: the only one a side show may be asked of. */
function previousInHand(room, player) {
	const live = active(room);
	const at = live.findIndex((p) => p.id === player.id);
	return at < 0 ? null : live[(at - 1 + live.length) % live.length];
}
/**
 * Who `player` may ask for a side show right now, or null. A seen player on their own turn, with
 * three or more still in (with two it is a Show), asks the previous player, who must have seen
 * their cards too.
 */
function sideShowTarget(room, variant, player) {
	if (!variant.sideShow || !playing(room) || room.sideShow) return null;
	if (room.currentPlayerId !== player.id || player.isPacked || player.isBlind) return null;
	if (active(room).length < 3 || player.balance < limits(room, player).min) return null;
	const target = previousInHand(room, player);
	return target && target.id !== player.id && !target.isBlind ? target : null;
}
/** Ask the previous player for a side show: the turn waits for the answer (or the clock). */
function requestSideShow(room, variant, player, ctx) {
	require(room.currentPlayerId === player.id, 'It is not your turn', 'OUT_OF_TURN');
	require(ctx.now < room.deadline, 'Turn has expired', 'STALE_TURN');
	const target = sideShowTarget(room, variant, player);
	require(target, 'You cannot ask for a side show now');
	room.sideShow = { from: player.id, to: target.id };
	room.deadline = ctx.now + SIDE_SHOW_MS;
}
/**
 * The answer is in (or the time ran out, which declines). Accepted: the stronger hand stays, the
 * weaker leaves, and a tie goes against the one who asked. Either way the asker pays their chaal
 * and the hand carries on exactly as after any bet. Returns the new table.
 */
function resolveSideShow(room, variant, accept, ctx) {
	const { from, to } = room.sideShow;
	const asker = room.players.find((p) => p.id === from);
	const target = room.players.find((p) => p.id === to);
	const loser = accept ? (compareFor(variant, room, asker, target) > 0 ? target : asker) : null;
	delete room.sideShow;
	room.lastSideShow = { from, to, accepted: !!accept, loser: loser?.id ?? null };
	// A weaker target leaves before the bet, so the turn passes over them.
	if (loser === target) target.isPacked = true;
	room.deadline = ctx.now + 1;
	const next = transition(room, from, 'bet', { amount: limits(room, asker).min }, ctx);
	// A weaker (or tied) asker has paid and now leaves, unless that bet already ended the hand.
	if (loser === asker && playing(next)) next.players.find((p) => p.id === from).isPacked = true;
	return next;
}
/**
 * Who `player` may show their cards to right now: friends who have packed (people, not bots),
 * not yet shown. You must have looked at your own cards; players still in never see each other's.
 */
function shareTargets(room, variant, player) {
	if (!variant.friendShow || !playing(room)) return [];
	if (player.departed || player.isBlind || !player.cards.length) return [];
	const already = room.sharedCards?.[player.id] ?? [];
	return room.players
		.filter(
			(p) =>
				p.id !== player.id &&
				p.isPacked &&
				p.cards.length > 0 &&
				!p.departed &&
				!p.bot &&
				!already.includes(p.id)
		)
		.map((p) => p.id);
}
/** Show your cards to one friend who has packed. They see them until the hand ends; the table is told. */
function shareCards(room, variant, player, payload) {
	require(playing(room), 'The hand is over');
	require(!player.isBlind, 'Look at your cards first');
	require(
		shareTargets(room, variant, player).includes(payload.target),
		'You can show your cards to a friend who has packed'
	);
	room.sharedCards = {
		...(room.sharedCards ?? {}),
		[player.id]: [...(room.sharedCards?.[player.id] ?? []), payload.target]
	};
}
/**
 * Faceoff: on your turn, pay the Show fee and challenge one player. Both hands are shown, the
 * loser is out (a tie goes against the challenger) and the hand carries on without them.
 */
function faceoff(room, variant, player, payload, ctx) {
	require(room.currentPlayerId === player.id, 'It is not your turn', 'OUT_OF_TURN');
	require(ctx.now < room.deadline, 'Turn has expired', 'STALE_TURN');
	const other = active(room).find((p) => p.id === payload.target && p.id !== player.id);
	require(other, 'Choose a player to face off against');
	require(player.isBlind || !other.isBlind, 'A seen player cannot challenge a blind player');
	const fee = limits(room, player).min;
	require(player.balance >= fee, 'Insufficient chips for a Faceoff');
	player.balance -= fee;
	if (player.handBet !== undefined) player.handBet += fee;
	room.pot += fee;
	variant.afterPot?.(room.variantState, room.pot);
	const loser = compareFor(variant, room, player, other) > 0 ? other : player;
	loser.isPacked = true;
	room.shownIds = [...new Set([...(room.shownIds ?? []), player.id, other.id])];
	if (Array.isArray(room.variantState?.faceoffs))
		room.variantState.faceoffs.push({
			challenger: player.id,
			target: other.id,
			loser: loser.id
		});
	afterPack(room, player.seatNumber, ctx);
}
/**
 * Games that knock players out (Running's killer suit): seen players who are out are packed and
 * their cards shown. If that would leave nobody, everyone still in shows instead.
 */
function knockOut(room, variant, ctx) {
	if (!variant.knockedOut || !playing(room)) return;
	const live = active(room);
	const out = live.filter((p) => variant.knockedOut(room.variantState, p));
	if (!out.length) return;
	if (out.length === live.length) {
		forcedShow(room, variant, 'knockout');
		return;
	}
	for (const p of out) {
		p.isPacked = true;
		room.variantState.out = [...new Set([...(room.variantState.out ?? []), p.id])];
		room.shownIds = [...new Set([...(room.shownIds ?? []), p.id])];
	}
	const left = active(room);
	if (left.length === 1) settle(room, left[0], 'last-player');
	else if (out.some((p) => p.id === room.currentPlayerId)) {
		const seat = room.players.find((p) => p.id === room.currentPlayerId).seatNumber;
		nextTurn(room, seat, ctx);
	}
}
function afterPack(room, seat, ctx) {
	const candidates = active(room);
	const variant = getVariant(room.rulesVersion);
	const moved = variant?.afterPack?.(room.variantState, { players: candidates, boot: bootOf(room) });
	if (moved?.pays) payIn(room, variant, moved.pays);
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
	// A move's payload is always a plain object; anything else is refused before it is read.
	if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
		throw new GameError('Invalid move');
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
		require(!room.ended || action === 'leave', 'This table has ended for the night', 'TABLE_ENDED');
		if (action === 'start') {
			require(id === room.hostId, 'Only the room host can start a hand', 'FORBIDDEN');
			require(!playing(room), 'A hand is already in progress');
			require(!room.ending, 'The table is ending after this hand');
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
			if (room.boot !== undefined && room.nightStartedAt === undefined && Number.isFinite(ctx?.now))
				room.nightStartedAt = ctx.now;
			// The last few games dealt, so Random can let each one rest a while.
			// Only tables with the next-game pick need it; older tables keep their exact state.
			if (room.boot !== undefined)
				room.recentGames = [...(room.recentGames ?? []), nextVersion].slice(-RANDOM_COOLDOWN);
			room.deck = [...deck.slice(payload.cutAt), ...deck.slice(0, payload.cutAt)];
			room.handId = ctx.handId;
			room.initiator = id;
			room.result = null;
			delete room.shownIds;
			delete room.sideShow;
			delete room.lastSideShow;
			delete room.sharedCards;
			// The pick is used up; the next one goes to whoever sits after this chooser.
			if (room.chooser) {
				room.lastChooserId = room.chooser.playerId;
				delete room.chooser;
			}
			// The sealed deck (if the server sealed one) belongs to this hand now, with the cut used.
			delete room.handSeal;
			if (room.seal) {
				room.handSeal = { ...room.seal, cutAt: payload.cutAt, cutBy: room.cut?.by ?? null };
				delete room.seal;
			}
			delete room.cut;
			// Follow the lineup: which slot this hand plays, and how many hands it has had.
			const lineupIndex = room.upNext?.lineupIndex ?? payload.lineupIndex;
			if (Number.isInteger(lineupIndex) && lineupIndex >= 0) {
				const same =
					room.lineupAt?.index === lineupIndex && room.lineupAt.rulesVersion === nextVersion;
				room.lineupAt = {
					index: lineupIndex,
					rulesVersion: nextVersion,
					played: same ? room.lineupAt.played + 1 : 1
				};
			}
			delete room.upNext;
			room.isStarted = true;
			room.gameShow = false;
			room.pot = 0;
			room.maxStake = boot * 2;
			for (const p of room.players) {
				p.cards = [];
				p.handBet = 0;
				p.isBlind = true;
				delete p.folded;
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
			if (payload.characterId !== undefined) {
				require(!!botCharacter(payload.characterId), 'Unknown bot character');
				if (!payload.style) require(!room.players.some(p => !p.departed && p.bot?.characterId === payload.characterId), 'That bot is already at the table');
			}
			if (payload.style) {
				require(payload.style.status === 'published' && configErrors(payload.style).length === 0, 'Invalid published bot style');
				require(typeof payload.style.botId === 'string' && /^[a-z][a-z0-9-]{1,47}$/.test(payload.style.botId) && Number.isSafeInteger(payload.style.version) && payload.style.version >= 1 && payload.style._id === `${payload.style.botId}@${payload.style.version}`, 'Invalid bot identity');
				require(payload.style.supportedGames.includes(room.gameType ?? 'teen-patti'), 'Bot does not support this game');
				require(!room.players.some(p => !p.departed && p.bot?.style?.botId === payload.style.botId), 'That character is already at the table');
			}
			for (const departed of room.players) if (departed.departed) departed.seatNumber = null;
			const used = new Set(seated(room).map((p) => p.seatNumber));
			const seatNumber = Array.from({ length: 6 }, (_, n) => n).find((n) => !used.has(n));
			require(seatNumber !== undefined, 'Room is full');
			room.players.push({
				id: payload.botId,
				username: payload.style ? payload.name.trim() : payload.name.trim().toLowerCase(),
				balance: room.table,
				handBet: 0,
				seatNumber,
				cards: [],
				isBlind: true,
				isPacked: false,
				ready: true,
				departed: false,
				bot: { level: payload.level, rebuys: 0, ...(payload.characterId ? { characterId: payload.characterId } : {}), ...(payload.style ? { style: structuredClone(payload.style), mascotId: payload.mascotId } : {}) }
			});
			room.issuedChips += room.table;
		} else if (action === 'openPick') {
			// This hand's chooser wants to change the standing game: hold the deal while they pick.
			require(room.chooser &&
				!playing(room) &&
				room.chooser.playerId === id, 'It’s not your turn to pick');
			const solo = seated(room).filter((p) => !p.bot && !p.departed).length === 1;
			room.chooser.choice = null;
			room.chooser.deadline = (ctx?.now ?? 0) + (solo ? SOLO_CHOOSE_MS : CHOOSE_MS);
			// Changing the game un-settles it until the new pick.
			delete room.upNext;
			dropCut(room);
		} else if (action === 'chooseNext') {
			require(room.chooser && !playing(room), 'Nobody is picking the next game right now');
			const picker = room.players.find((p) => p.id === room.chooser.playerId);
			require(room.chooser.playerId ===
				id, `It’s ${picker?.username ?? 'someone else'}’s turn to pick`);
			require(CHOICES.has(payload.choice) ||
				(typeof payload.choice === 'string' &&
					getVariant(payload.choice)), 'Pick keep, random or a Teen Patti variant');
			room.chooser.choice = payload.choice;
			// A pick stands for later hands until someone changes it. "Keep" stands as this game.
			room.standing = {
				choice: payload.choice === 'keep' ? room.rulesVersion : payload.choice,
				by: id
			};
			delete room.upNext;
			dropCut(room);
			settleNext(room, ctx);
		} else if (action === 'endNight') {
			// Club owners end the table: after this hand (the default), or now with every bet refunded.
			require(ctx?.canEnd === true, 'Only club owners can end the table', 'FORBIDDEN');
			require(room.boot !== undefined, 'This table closes on its own');
			require(payload.mode === 'after-hand' ||
				payload.mode === 'now', 'End after this hand, or now');
			if (playing(room) && payload.mode === 'after-hand') room.ending = { by: id };
			else {
				if (playing(room)) {
					// Nobody wins or loses this hand: everyone gets back what they put in.
					for (const p of room.players) {
						p.balance += p.handBet ?? 0;
						if (p.handBet !== undefined) p.handBet = 0;
					}
					room.pot = 0;
					room.isStarted = false;
					room.currentPlayerId = null;
					room.deadline = null;
					room.turnMs = null;
				}
				finishNight(room, id, ctx);
			}
		} else if (action === 'prepareStart') {
			// The night's first hand: settle its game (the lineup's first, or the host's choice) and
			// open the cut, so everyone sees the rules and the deck is cut before the first deal.
			require(id === room.hostId, 'Only the host can start the game', 'FORBIDDEN');
			require(!playing(room) && !room.chooser && !room.upNext, 'The game is already under way');
			require(room.boot !== undefined, 'This table starts with a plain deal');
			const slots = (ctx?.lineup ?? []).filter((v) => v === MYSTERY || getVariant(v));
			const fromLineup = slots.length > 0;
			const rulesVersion = fromLineup
				? slots[0] === MYSTERY
					? drawRandom(
							room,
							listVariants().map((variant) => variant.rulesVersion),
							ctx.randomInt
						)
					: slots[0]
				: typeof payload.rulesVersion === 'string' && getVariant(payload.rulesVersion)
					? payload.rulesVersion
					: room.rulesVersion;
			require(Number.isFinite(ctx?.now), 'Missing clock');
			const revealMs = humansSeated(room) <= 1 ? SOLO_REVEAL_MS : REVEAL_MS;
			room.upNext = {
				rulesVersion,
				mode: fromLineup ? 'lineup' : 'picked',
				by: id,
				changed: true,
				revealMs,
				dealAt: ctx.now + revealMs,
				...(fromLineup ? { lineupIndex: 0 } : {})
			};
			openCut(room, id, ctx);
		} else if (action === 'cutDeck') {
			// The cutter cuts the sealed deck: the deal starts this many cards down.
			require(room.cut && !playing(room), 'There is no deck to cut right now');
			require(room.cut.by === id, 'It is not your turn to cut', 'FORBIDDEN');
			require(room.cut.at === null, 'The deck is already cut');
			require(Number.isInteger(payload.at) &&
				payload.at >= 1 &&
				payload.at <= 51, 'Cut somewhere between the first and last card');
			room.cut.at = payload.at;
		} else if (action === 'settleNext') {
			// The pick window ran out with no pick: settle the next game now (the server's timer).
			require(room.chooser && !playing(room) && !room.upNext, 'Nothing to settle');
			require(Number.isFinite(ctx?.now) &&
				ctx.now >= room.chooser.deadline, 'The pick is still open');
			settleNext(room, ctx);
			require(room.upNext, 'Could not settle the next game');
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
		} else if (action === 'requestChips') {
			require(room.boot !== undefined, 'Chip requests need a table created with table options');
			require(canRequestChips(
				room,
				player
			), 'You can ask for chips when you are below 10% of the buy-in');
			const lender = seated(room).find((p) => p.id === payload.to && !p.departed);
			require(lender && lender.id !== id && !lender.bot, 'Ask a friend who is at the table');
			require(chipRequestAmounts(room).includes(
				payload.amount
			), 'Choose one of the offered amounts');
			// One open request per player: a new ask replaces the old one.
			room.chipRequests = [
				...(room.chipRequests ?? []).filter((r) => r.from !== id),
				{ from: id, to: lender.id, amount: payload.amount }
			];
		} else if (action === 'cancelChipRequest') {
			room.chipRequests = (room.chipRequests ?? []).filter((r) => r.from !== id);
		} else if (action === 'answerChipRequest') {
			const request = (room.chipRequests ?? []).find((r) => r.from === payload.from && r.to === id);
			require(request, 'That request is no longer open');
			require(typeof payload.accept === 'boolean', 'Invalid answer');
			room.chipRequests = room.chipRequests.filter((r) => r !== request);
			if (payload.accept) {
				const borrower = seated(room).find((p) => p.id === request.from && !p.departed);
				require(borrower, 'That player has left the table');
				require(player.balance >= request.amount, 'You do not have enough chips to give');
				player.balance -= request.amount;
				borrower.balance += request.amount;
			}
		} else if (action === 'setBalanceHidden') {
			// Privacy only: the amount is withheld from other players' views, play is unchanged.
			require(typeof payload.hidden === 'boolean', 'Invalid balance visibility');
			if (payload.hidden) player.hideBalance = true;
			else delete player.hideBalance;
		} else if (action === 'ready') {
			// Auto-ready tables let players choose to sit out the next hand at any time.
			require(!playing(room) || room.autoReady, 'Readiness is locked during a hand');
			require(typeof payload.ready === 'boolean', 'Invalid ready state');
			room.readyEnabled = true;
			player.ready = payload.ready;
		} else if (action === 'leave') {
			const wasTurn = room.currentPlayerId === id;
			player.departed = true;
			// A chooser who leaves forfeits the pick: the current game carries on.
			if (room.chooser?.playerId === id && !room.chooser.choice)
				room.chooser.deadline = ctx.now ?? 0;
			if (room.chipRequests)
				room.chipRequests = room.chipRequests.filter((r) => r.from !== id && r.to !== id);
			if (playing(room) && !player.isPacked) {
				player.isPacked = true;
				variant.onPack?.(room.variantState, { cards: player.cards, deck: room.deck });
				if (active(room).length === 1) settle(room, active(room)[0], 'last-player');
				else if (wasTurn) nextTurn(room, player.seatNumber, ctx);
			}
			if (!playing(room)) player.seatNumber = null;
			if (room.hostId === id)
				room.hostId = seated(room).find((p) => !p.departed && !p.bot)?.id ?? null;
		} else if (action === 'table' && variant.friendShow && payload?.kind === 'share') {
			variantMove(() => shareCards(room, variant, player, payload));
		} else if (
			(action === 'see' || action === 'reveal') &&
			player.cards.length > 0 &&
			(player.isPacked || !playing(room))
		) {
			// Out of the hand (packed, or the hand is over): you may still look at your own
			// cards, and choose to show them to the whole table.
			player.isBlind = false;
			if (action === 'reveal') room.shownIds = [...new Set([...(room.shownIds ?? []), id])];
		} else {
			require(action !== 'reveal', 'You can show your cards after you pack or the hand ends');
			require(playing(room), 'No active hand');
			require(!player.isPacked && player.cards.length > 0, 'You are not active in this hand');
			if (action === 'see') {
				require(variant.allowSee !==
					false, `${variant.name} keeps every hand blind until the Show`);
				require(player.isBlind, 'Cards already seen');
				player.isBlind = false;
				knockOut(room, variant, ctx);
			} else if (action === 'table') {
				if (variant.sideShow && payload?.kind === 'sideshow')
					variantMove(() => requestSideShow(room, variant, player, ctx));
				else if (variant.sideShow && payload?.kind === 'sideshow-answer') {
					require(room.sideShow?.to === id, 'There is no side show for you to answer');
					require(typeof payload.accept === 'boolean', 'Accept or decline the side show');
					require(ctx.now < room.deadline, 'The side show request has expired');
					return variantMove(() => resolveSideShow(room, variant, payload.accept, ctx));
				} else if (variant.faceoff && payload?.kind === 'faceoff') variantMove(() => faceoff(room, variant, player, payload, ctx));
				else {
					require(variant.tableAction, `${variant.name} has no table moves`);
					const moved = variantMove(() =>
						variant.tableAction(room.variantState, player, payload, {
							deck: room.deck,
							players: active(room),
							boot: bootOf(room)
						})
					);
					if (moved?.pays) payIn(room, variant, moved.pays);
				}
			} else if (action === 'discard') {
				require(mustDiscard(variant, player), 'There is nothing to discard');
				require(Number.isInteger(payload.index) &&
					payload.index >= 0 &&
					payload.index < player.cards.length, 'Choose one of your cards to discard');
				require(!variant.keepsCard?.(
					handStateOf(variant, room, id),
					player.cards[payload.index]
				), 'Keep your joker');
				throwCard(room, variant, player, payload.index);
			} else {
				require(room.currentPlayerId === id, 'It is not your turn', 'OUT_OF_TURN');
				if (room.sideShow) {
					// The turn is on hold until the side show is answered; running out of time declines it.
					require(action === 'timeout' && ctx.now >= room.deadline, 'Waiting for the side show answer');
					return resolveSideShow(room, variant, false, ctx);
				}
				require(ctx.now < room.deadline || action === 'timeout', 'Turn has expired', 'STALE_TURN');
				// A card the last player paid to open, but didn't, opens now.
				variant.beforeTurn?.(room.variantState);
				if (action === 'pack' || action === 'timeout') {
					if (action === 'timeout') require(ctx.now >= room.deadline, 'Turn has not expired');
					// Folding Joker 3: nobody packs without adding a joker to the table.
					if (variant.foldBeforePack && !player.folded && player.cards.length > variant.discardTo) {
						require(action === 'timeout' || player.isBlind, 'Fold a card onto the table before you pack');
						throwCard(room, variant, player, player.cards.length - 1);
					}
					player.isPacked = true;
					variant.onPack?.(room.variantState, { cards: player.cards, deck: room.deck });
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
					variant.afterPot?.(room.variantState, room.pot);
					if (room.potLimit && room.pot >= room.potLimit * bootOf(room)) forcedShow(room, variant);
					else if (
						variant.splitAt &&
						active(room).length >= 3 &&
						room.pot >= variant.splitAt * bootOf(room)
					)
						splitShow(room, variant);
					else if (
						variant.bankoAt &&
						active(room).length >= 3 &&
						active(room).some((p) => p.id === room.initiator) &&
						room.pot >= variant.bankoAt * bootOf(room)
					)
						bankoShow(room, variant);
					else {
						variant.afterBet?.(room.variantState, id);
						lapEffects(room, variant);
						if (playing(room)) {
							nextTurn(room, player.seatNumber, ctx);
							knockOut(room, variant, ctx);
						}
					}
				} else if (action === 'show') {
					require(!mustDiscard(variant, player), 'Discard a card before you Show');
					const blocked = variant.showBlocked?.(room.variantState, id);
					require(!blocked, blocked);
					require(!variant.noShow, `${variant.name} has no Show`);
					const candidates = active(room);
					require(candidates.length === 2, 'Show requires exactly two active players');
					const declare = payload.declare;
					if (variant.declareShow)
						require(declare === 'high' || declare === 'low', 'Say whether the high or the low hand wins');
					const other = candidates.find((p) => p.id !== id);
					require(player.isBlind ||
						!other.isBlind, 'A seen player cannot request Show against a blind player');
					const fee = limits(room, player).min;
					require(player.balance >= fee, 'Insufficient chips for Show');
					player.balance -= fee;
					if (player.handBet !== undefined) player.handBet += fee;
					room.pot += fee;
					variant.afterPot?.(room.variantState, room.pot);
					const override = variant.showOverride?.(room.variantState, player, other);
					let comparison = override ? 0 : compareFor(variant, room, player, other);
					// High Low: the requester says which end of the two hands wins.
					if (variant.declareShow && declare === 'low') comparison = -comparison;
					// Banko: equal hands go to the banker (the dealer), whoever asked.
					const banker =
						variant.banker && !override && comparison === 0
							? [player, other].find((p) => p.id === room.initiator)
							: undefined;
					settle(
						room,
						override ?? banker ?? (comparison > 0 ? player : other),
						override
							? 'show'
							: banker
								? 'show-banker'
								: comparison === 0
								? 'show-tie-requester-loses'
								: variant.declareShow
									? `show-${declare}`
									: 'show',
						[player.id, other.id]
					);
				} else throw new GameError('Unknown action');
			}
		}
	}
	// The night so far: hands played, games, the biggest pot. Ending after this hand happens now.
	if (
		room.boot !== undefined &&
		!playing(room) &&
		room.result &&
		room.nightStats?.lastHand !== room.result.handId
	) {
		const stats = room.nightStats ?? { hands: 0, games: {}, biggest: null };
		room.nightStats = {
			lastHand: room.result.handId,
			hands: stats.hands + 1,
			games: { ...stats.games, [room.rulesVersion]: (stats.games[room.rulesVersion] ?? 0) + 1 },
			biggest:
				!stats.biggest || room.result.amount > stats.biggest.amount
					? {
							amount: room.result.amount,
							winner: room.result.winnerName,
							rulesVersion: room.rulesVersion
						}
					: stats.biggest
		};
		if (room.ending) finishNight(room, room.ending.by, ctx);
	}
	// A hand just ended on a table with options: remember it (the last five games played), then
	// open the pick for the next game.
	if (
		room.boot !== undefined &&
		!playing(room) &&
		room.result &&
		room.gameLog?.at(-1)?.handId !== room.result.handId
	)
		room.gameLog = [
			...(room.gameLog ?? []),
			{
				handId: room.result.handId,
				rulesVersion: room.rulesVersion,
				winner: room.result.winnerName
			}
		].slice(-5);
	// A hand just ended on a table with options: open the pick for the next game.
	if (
		room.boot !== undefined &&
		!room.ended &&
		!playing(room) &&
		room.result &&
		room.chooser?.handId !== room.result.handId &&
		Number.isFinite(ctx?.now)
	)
		assignChooser(room, ctx.now);
	// No wait for this pick (a standing pick for its owner, or a solo table): settle it now.
	if (
		room.chooser &&
		!room.upNext &&
		!playing(room) &&
		Number.isFinite(ctx?.now) &&
		ctx.now >= room.chooser.deadline
	)
		settleNext(room, ctx);
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
	// Cards everyone may see: hands compared at a Show, and hands a player chose to show.
	const reveal = new Set([...(room.result?.revealedPlayerIds || []), ...(room.shownIds || [])]);
	// Hands this viewer may see: their own once looked at, any shown to the whole table, and any a
	// friend showed them in private (Side Show 2).
	const canSee = (p) =>
		(p.id === id && !p.isBlind) || reveal.has(p.id) || !!room.sharedCards?.[p.id]?.includes(id);
	const myTurn = playing(room) && room.currentPlayerId === id && !player.isPacked && !room.sideShow;
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
		// Who picks the next game, until when, and what they picked (null while undecided).
		...(room.chooser ? { chooser: { ...room.chooser } } : {}),
		...(room.standing ? { standing: { ...room.standing } } : {}),
		// Real money tonight (people only, bots never count) and the fewest payments to settle it.
		...(room.realNet
			? (() => {
					const people = room.players
						.filter((p) => !p.bot && room.realNet[p.id] !== undefined)
						.map((p) => ({ id: p.id, name: p.username, net: room.realNet[p.id] }));
					return { realNet: people, settleUp: settleUp(people) };
				})()
			: {}),
		// The table is ending after this hand, or has ended (with the night's summary).
		...(room.ending ? { ending: true } : {}),
		...(room.ended ? { ended: structuredClone(room.ended) } : {}),
		// The last five hands played here: the game and who won.
		...(room.gameLog ? { gameLog: room.gameLog.map((entry) => ({ ...entry })) } : {}),
		// The cut before the deal (who cuts, where, and the sealed deck's fingerprint), and once the
		// hand is dealt, the seal and later the proof for the cards that were shown.
		...(room.cut
			? {
					cut: {
						...room.cut,
						...(room.seal?.commitment ? { commitment: room.seal.commitment } : {})
					}
				}
			: {}),
		...(room.handSeal ? { deckProof: deckProof(room, reveal) } : {}),
		// Where the night is in tonight's lineup: the slot playing and how many hands it has had.
		...(room.lineupAt ? { lineupAt: { ...room.lineupAt } } : {}),
		// The settled next game: what, how it was chosen, and when it will be dealt.
		...(room.upNext ? { upNext: { ...room.upNext } } : {}),
		// Chip requests are private to the two players involved.
		...(room.chipRequests?.some((r) => r.from === id || r.to === id)
			? {
					chipRequests: room.chipRequests
						.filter((r) => r.from === id || r.to === id)
						.map((r) => ({ ...r }))
				}
			: {}),
		...(explain && canRequestChips(room, player)
			? { chipRequestAmounts: chipRequestAmounts(room) }
			: {}),
		...(room.variantState === undefined
			? {}
			: {
					variantState: variant.publicState
						? variant.publicState(room.variantState, id, reveal)
						: structuredClone(room.variantState)
				}),
		deadline: room.deadline,
		// A side show waiting for its answer, and how the last one went (cleared with the next hand).
		...(room.sideShow ? { sideShow: { ...room.sideShow } } : {}),
		...(room.lastSideShow ? { lastSideShow: { ...room.lastSideShow } } : {}),
		// Who showed their cards to whom (never the cards themselves, which only the friend sees).
		...(room.sharedCards
			? {
					shares: Object.entries(room.sharedCards).flatMap(([from, tos]) =>
						tos.map((to) => ({ from, to }))
					)
				}
			: {}),
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
			// A hidden balance reaches only its owner; others get just what the table needs.
			...(p.hideBalance && p.id !== id
				? {
						balance: null,
						balanceHidden: true,
						coversBoot: p.balance >= bootOf(room),
						hasChips: p.balance > 0
					}
				: { balance: p.balance, ...(p.hideBalance ? { balanceHidden: true } : {}) }),
			handBet: p.handBet ?? null,
			seatNumber: p.seatNumber,
			isBlind: p.isBlind,
			isPacked: p.isPacked,
			...(ctxReadySupported(room) ? { ready: p.ready === true } : {}),
			connected: present(p, connected),
			...(p.bot ? { bot: p.bot.level, ...(p.bot.characterId ? { botCharacterId: p.bot.characterId } : {}), ...(p.bot.style ? { botId: p.bot.style.botId, botStyleId: p.bot.style._id, botMascotId: p.bot.mascotId } : {}) } : {}),
			hasLeft: p.departed,
			...(p.folded ? { folded: true } : {}),
			cardsInHand:
				canSee(p)
					? structuredClone(p.cards)
					: p.cards.map(() => ({ rank: 0, suit: '' })),
			// Names and joker positions only for hands this viewer may already see.
			// Open-card games: the leading cards everyone may see, while the rest stay hidden.
			...(() => {
				const open = variant.openCount?.(room.variantState) ?? 0;
				const seen = canSee(p);
				return open > 0 && !seen && p.cards.length
					? {
							openCards: p.cards
								.slice(0, open)
								.map((card, index) => ({ index, card: { rank: card.rank, suit: card.suit } }))
						}
					: {};
			})(),
			...(explain && canSee(p) && p.cards.length
				? variant.foldsToEnd && !p.folded && playing(room) && !p.isPacked
					? // Folding Joker before the fold: no hand yet, the folded card decides the joker.
						{ handName: variant.rulesVersion === 'folding-joker-1' ? 'Fold one card: it becomes your joker' : 'Fold one card: its rank becomes a joker for everyone', wildCards: [] }
					: playing(room) && !p.isPacked && mustDiscard(variant, p)
						? // Still throwing cards away: the best cards to keep, with their jokers.
							describeKeep(variant, p.cards, handStateOf(variant, room, p.id))
						: {
								handName: describeHand(variant, p.cards, handStateOf(variant, room, p.id)),
								wildCards: wildIndexes(variant, p.cards, handStateOf(variant, room, p.id))
							}
				: {})
		})),
		legalActions: {
			start: id === room.hostId && !playing(room),
			...(ctxReadySupported(room) ? { ready: !playing(room) || room.autoReady === true } : {}),
			see: playing(room) && !player.isPacked && player.isBlind && variant.allowSee !== false,
			// Out of the hand: peek at your own cards, or show them to everyone.
			...(explain && player.cards.length && (player.isPacked || !playing(room))
				? {
						peek: player.isBlind,
						reveal: !(room.shownIds ?? []).includes(id) && !reveal.has(id)
					}
				: {}),
			...(explain
				? {
						discard: playing(room) && !player.isPacked && mustDiscard(variant, player),
						// Moves on the table cards: open a mat card, lock a line, make a joker.
						...(variant.tableOptions && playing(room) && room.variantState
							? {
								table: variant.tableOptions(room.variantState, player, {
									players: active(room),
									boot: bootOf(room)
								})
							}
							: {}),
						addBot: id === room.hostId && !playing(room) && seated(room).length < 6
					}
				: {}),
			...(variant.friendShow ? { share: shareTargets(room, variant, player) } : {}),
			...(variant.sideShow
				? {
						// The player you may ask for a side show now, and a request waiting for your answer.
						sideShow: sideShowTarget(room, variant, player)?.id ?? null,
						sideShowAnswer: room.sideShow?.to === id
					}
				: {}),
			...(variant.faceoff
				? {
						faceoff:
							myTurn && player.balance >= limits(room, player).min
								? active(room)
										.filter((p) => p.id !== id && (player.isBlind || !p.isBlind))
										.map((p) => p.id)
								: []
					}
				: {}),
			// Folding Joker 3: a seen player folds onto the table before packing.
			pack: myTurn && !(variant.foldBeforePack && mustDiscard(variant, player)),
			bet: myTurn && player.balance >= limits(room, player).min && !mustDiscard(variant, player),
			minBet: limits(room, player).min,
			maxBet: Math.min(player.balance, limits(room, player).max),
			show:
				myTurn &&
				!mustDiscard(variant, player) &&
				active(room).length === 2 &&
				(player.isBlind || active(room).every((p) => !p.isBlind)) &&
				player.balance >= limits(room, player).min &&
				!variant.noShow &&
				!variant.showBlocked?.(room.variantState, id)
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
