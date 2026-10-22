import { buildDeck, cardKey, SUITS } from '../../tricks/cards.mjs';

/**
 * BotObservation for 10 Pakad (docs/games/10PAKAD_PLAN.md §6): the only input a 10 Pakad bot gets.
 * Built from its seat's projection (never the room) plus what this seat has remembered this hand:
 * the tricks it saw completed (each one as it happened, from `lastTrick`). The projection shows only
 * the current and last trick and the number of cards and tens in each pile, so remembering earlier
 * tricks is the bot's own memory, exactly what a person in the seat could remember. Deep-frozen.
 * Bot modules import no engine code: tests/server/bot-pakad.test.mjs checks that.
 */
const DECK = buildDeck(
	Object.fromEntries(SUITS.map((s) => [s, [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]]))
);

function freeze(o) {
	if (o && typeof o === 'object') {
		Object.freeze(o);
		for (const v of Object.values(o)) freeze(v);
	}
	return o;
}

/** Fold this seat's view into its memory: each completed trick once, per hand. */
export function rememberPakad(view, selfId, memory) {
	if (memory.handId !== view.handId) {
		memory.handId = view.handId;
		memory.tricks = [];
	}
	const t = view.lastTrick;
	if (t && !memory.tricks.some((x) => x.n === t.n))
		memory.tricks.push({
			n: t.n,
			winner: t.winner,
			trump: view.trump,
			plays: t.plays.map((p) => ({ id: p.id, card: { ...p.card } }))
		});
	return memory;
}

export function observationPakad(view, memory = {}) {
	const self = view.selfId;
	const me = view.usersList.find((u) => u.id === self);
	const hand = me.cardsInHand
		.filter((c) => c.rank > 0)
		.map((c) => ({ rank: c.rank, suit: c.suit }));
	const remembered = memory.handId === view.handId ? (memory.tricks ?? []) : [];
	const open = view.trick?.plays?.length ? [{ plays: view.trick.plays }] : [];
	const tricks = [...remembered, ...open];
	const played = tricks.flatMap((t) => t.plays.map((p) => p.card));
	// A player who did not follow the suit led has none of it left (public).
	const voids = Object.fromEntries(view.order.map((id) => [id, []]));
	for (const t of tricks) {
		const led = t.plays[0]?.card.suit;
		for (const p of t.plays.slice(1))
			if (p.card.suit !== led && !voids[p.id]?.includes(led)) voids[p.id]?.push(led);
	}
	const seen = new Set([...played, ...hand].map(cardKey));
	const team = view.teams[self];
	return freeze({
		self,
		team,
		partner: view.order.find((id) => id !== self && view.teams[id] === team) ?? null,
		teams: { ...view.teams },
		stage: view.stage,
		handNo: view.hand,
		order: view.order.slice(),
		dealerId: view.dealerId,
		trump: view.trump,
		hand,
		trick: view.trick
			? {
					leader: view.trick.leader,
					plays: view.trick.plays.map((p) => ({ id: p.id, card: { ...p.card } }))
				}
			: null,
		completed: view.tricksPlayed,
		remembered: remembered.map((t) => ({ winner: t.winner, plays: t.plays })),
		centre: { ...view.centre },
		captured: view.captured.map((c) => ({ ...c })),
		streak: view.streak ? { ...view.streak } : null,
		counts: Object.fromEntries(view.usersList.map((u) => [u.id, u.cardCount])),
		voids,
		// Cards this seat has not seen: in the other three hands or not dealt yet.
		unseen: DECK.filter((c) => !seen.has(cardKey(c))),
		legal: { play: (view.legalActions.play ?? []).map((c) => ({ ...c })) },
		suits: SUITS
	});
}
