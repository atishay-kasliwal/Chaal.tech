import { buildDeck, cardKey, SUITS } from '../../tricks/cards.mjs';

/**
 * BotObservation for 29: the only input a 29 bot gets. Built from its seat's projection (never the
 * room) plus what this seat remembered this hand (each completed trick, as it happened). The trump
 * suit is in it only when this seat may know it: the bidder from the start, everyone once revealed.
 * The bidder's face-down card is in it only for the bidder. Deep-frozen; no engine code imported.
 */
const DECK = buildDeck(Object.fromEntries(SUITS.map((s) => [s, [14, 13, 12, 11, 10, 9, 8, 7]])));

function freeze(o) {
	if (o && typeof o === 'object') {
		Object.freeze(o);
		for (const v of Object.values(o)) freeze(v);
	}
	return o;
}

/** Fold this seat's view into its memory: each completed trick once, per hand. */
export function remember29(view, memory) {
	if (memory.handId !== view.handId) {
		memory.handId = view.handId;
		memory.tricks = [];
	}
	const t = view.lastTrick;
	if (t && !memory.tricks.some((x) => x.n === t.n))
		memory.tricks.push({
			n: t.n,
			winner: t.winner,
			trump: view.revealed ? view.trump : null,
			plays: t.plays.map((p) => ({ id: p.id, card: { ...p.card } }))
		});
	return memory;
}

export function observation29(view, memory = {}) {
	const self = view.selfId;
	const me = view.usersList.find((u) => u.id === self);
	const hand = me.cardsInHand
		.filter((c) => c.rank > 0)
		.map((c) => ({ rank: c.rank, suit: c.suit }));
	const remembered = memory.handId === view.handId ? (memory.tricks ?? []) : [];
	const open = view.trick?.plays?.length ? [{ plays: view.trick.plays }] : [];
	const tricks = [...remembered, ...open];
	const played = tricks.flatMap((t) => t.plays.map((p) => p.card));
	const voids = Object.fromEntries(view.order.map((id) => [id, []]));
	for (const t of tricks) {
		const led = t.plays[0]?.card.suit;
		for (const p of t.plays.slice(1))
			if (p.card.suit !== led && !voids[p.id]?.includes(led)) voids[p.id]?.push(led);
	}
	const seen = new Set(
		[...played, ...hand, ...(view.indicator ? [view.indicator] : [])].map(cardKey)
	);
	const team = view.teams[self];
	const counts = Object.fromEntries(view.usersList.map((u) => [u.id, u.cardCount]));
	// The bidder also holds the face-down card (unseen by everyone else) until trump is revealed.
	if (view.indicatorDown && view.bidderId && view.bidderId !== self) counts[view.bidderId]++;
	return freeze({
		self,
		team,
		partner: view.order.find((id) => id !== self && view.teams[id] === team) ?? null,
		teams: { ...view.teams },
		stage: view.stage,
		order: view.order.slice(),
		dealerId: view.dealerId,
		bids: view.bids.map((b) => ({ ...b })),
		high: view.high ? { ...view.high } : null,
		bidderId: view.bidderId,
		bidTeam: view.bidderId ? view.teams[view.bidderId] : null,
		target: view.target,
		trump: view.trump,
		revealed: view.revealed,
		indicator: view.indicator ? { ...view.indicator } : null,
		hand,
		trick: view.trick
			? {
					leader: view.trick.leader,
					plays: view.trick.plays.map((p) => ({ id: p.id, card: { ...p.card } }))
				}
			: null,
		completed: view.tricksPlayed,
		remembered: remembered.map((t) => ({ winner: t.winner, plays: t.plays })),
		points: view.points.slice(),
		counts,
		voids,
		unseen: DECK.filter((c) => !seen.has(cardKey(c))),
		legal: {
			bid: view.legalActions.bid.slice(),
			pass: view.legalActions.pass,
			chooseTrump: view.legalActions.chooseTrump.map((c) => ({ ...c })),
			reveal: view.legalActions.reveal,
			pair: view.legalActions.pair,
			play: view.legalActions.play.map((c) => ({ ...c }))
		},
		suits: SUITS
	});
}
