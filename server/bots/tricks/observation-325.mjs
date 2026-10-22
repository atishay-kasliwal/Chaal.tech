import { buildDeck, cardKey, SUITS } from '../../tricks/cards.mjs';

/**
 * BotObservation for 3 2 5 (docs/games/TRICK_GAMES_PHASE1.md §4): the only input a 3 2 5 bot gets,
 * built from its seat's projection (never the room), deep-frozen so nothing downstream can add to it.
 * Holds: its own cards, trump once chosen, quotas, tricks won, the current and completed tricks,
 * the cards everyone has played, which suits each player has shown they lack, the number of cards
 * each player holds, and during a pull only the number of face-down cards (and, for the puller, the
 * card it took). Bot modules import no engine code: tests/server/bot-325.test.mjs checks that.
 */
const DECK = buildDeck({
	spades: [14, 13, 12, 11, 10, 9, 8, 7],
	hearts: [14, 13, 12, 11, 10, 9, 8, 7],
	diamonds: [14, 13, 12, 11, 10, 9, 8],
	clubs: [14, 13, 12, 11, 10, 9, 8]
});

function freeze(o) {
	if (o && typeof o === 'object') {
		Object.freeze(o);
		for (const v of Object.values(o)) freeze(v);
	}
	return o;
}

export function observation325(view) {
	const self = view.selfId;
	const me = view.usersList.find((u) => u.id === self);
	const hand = me.cardsInHand
		.filter((c) => c.rank > 0)
		.map((c) => ({ rank: c.rank, suit: c.suit }));
	const tricks = [
		...(view.history ?? []),
		...(view.trick?.plays?.length ? [{ plays: view.trick.plays, open: true }] : [])
	];
	const played = tricks.flatMap((t) => t.plays.map((p) => p.card));
	// A player who did not follow the suit led has none of it left (public).
	const voids = Object.fromEntries(view.order.map((id) => [id, []]));
	for (const t of tricks) {
		const led = t.plays[0]?.card.suit;
		for (const p of t.plays.slice(1))
			if (p.card.suit !== led && !voids[p.id].includes(led)) voids[p.id].push(led);
	}
	const seen = new Set([...played, ...hand].map(cardKey));
	return freeze({
		self,
		stage: view.stage,
		round: view.round,
		order: view.order.slice(),
		quotas: { ...view.quotas },
		won: { ...view.tricks },
		scores: { ...view.scores },
		trump: view.trump,
		hand,
		trick: view.trick
			? {
					leader: view.trick.leader,
					plays: view.trick.plays.map((p) => ({ id: p.id, card: { ...p.card } }))
				}
			: null,
		history: (view.history ?? []).map((t) => ({
			winner: t.winner,
			plays: t.plays.map((p) => ({ id: p.id, card: { ...p.card } }))
		})),
		completed: (view.history ?? []).length,
		counts: Object.fromEntries(view.usersList.map((u) => [u.id, u.cardCount])),
		voids,
		// Cards this seat has not seen: all in the other two hands once the deal is complete.
		unseen: DECK.filter((c) => !seen.has(cardKey(c))),
		pull: view.pull
			? {
					step: view.pull.step,
					victim: view.pull.victim,
					faceDown: view.pull.faceDown,
					taken: view.pull.taken
				}
			: null,
		legal: {
			chooseTrump: !!view.legalActions.chooseTrump,
			pull: view.legalActions.pull ?? 0,
			give: (view.legalActions.give ?? []).map((c) => ({ ...c })),
			play: (view.legalActions.play ?? []).map((c) => ({ ...c }))
		},
		suits: SUITS
	});
}
