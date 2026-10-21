/**
 * Observation stream obs@1 (docs/BOT_BRAIN.md §5.3): what one bot saw happen between two of its
 * own projections. This is the only input to a bot's mind, so a mind can hold nothing the bot
 * could not have seen on screen: hidden cards appear only when the projection itself reveals them
 * (a show, or a hand the player chose to show).
 *
 * Versioned interface: adding an optional field is a minor change; renaming, removing or changing
 * what a field means or when an event fires is obs@2, and every mind records its version.
 *
 * Events, in order:
 *   { k: 'deal',   hand, seats: [id], stacks: { id: balance|null }, bets: { id: handBet }, boot }
 *   { k: 'rebuy',  who, amount }                       stack event only (approval A11)
 *   { k: 'see',    who, committed }                    committed: boots in before looking
 *   { k: 'bet',    who, amount, boots, blind, raised } raised: the stake went up
 *   { k: 'pack',   who }
 *   { k: 'result', winners: [{ id, amount }], reason, bets: { id: handBet }, revealed: { id: cards } }
 */
export const OBSERVATION_VERSION = 'obs@1';

const visible = (cards) => cards?.length && cards.every((c) => c.rank > 0);

export function observe(prev, next) {
	if (!next) return [];
	const events = [];
	const boot = Math.max(next.boot ?? 1, 1);
	const newHand = !!next.handId && next.handId !== prev?.handId;
	const prevUser = new Map((prev?.usersList ?? []).map((u) => [u.id, u]));
	if (newHand && next.usersList.some((u) => u.cardsInHand.length)) {
		const dealt = next.usersList.filter((u) => u.cardsInHand.length);
		events.push({
			k: 'deal',
			hand: next.handId,
			seats: dealt.map((u) => u.id),
			stacks: Object.fromEntries(dealt.map((u) => [u.id, u.balance ?? null])),
			bets: Object.fromEntries(dealt.map((u) => [u.id, u.handBet ?? 0])),
			boot
		});
		for (const u of dealt) {
			const before = prevUser.get(u.id);
			if (before?.balance == null || u.balance == null) continue;
			const topUp = u.balance + (u.handBet ?? 0) - before.balance;
			if (topUp > 0) events.push({ k: 'rebuy', who: u.id, amount: topUp });
		}
	} else if (!newHand && prev) {
		const raised = (next.maxStake ?? 0) > (prev.maxStake ?? 0);
		for (const u of next.usersList) {
			const before = prevUser.get(u.id);
			if (!before || !u.cardsInHand.length) continue;
			if (before.isBlind && !u.isBlind)
				events.push({ k: 'see', who: u.id, committed: (before.handBet ?? 0) / boot });
			const amount = (u.handBet ?? 0) - (before.handBet ?? 0);
			if (amount > 0)
				events.push({
					k: 'bet',
					who: u.id,
					amount,
					boots: amount / boot,
					blind: before.isBlind,
					raised
				});
			if (!before.isPacked && u.isPacked) events.push({ k: 'pack', who: u.id });
		}
	}
	const result = next.result;
	if (
		result &&
		result.handId === next.handId &&
		(!prev?.result || prev.result.handId !== result.handId)
	) {
		const revealed = {};
		for (const id of result.revealedPlayerIds ?? []) {
			const u = next.usersList.find((x) => x.id === id);
			if (u && visible(u.cardsInHand))
				revealed[id] = u.cardsInHand.map((c) => ({ rank: c.rank, suit: c.suit }));
		}
		events.push({
			k: 'result',
			reason: result.reason ?? null,
			winners: result.winners
				? result.winners.map((w) => ({ id: w.id, amount: w.amount }))
				: [{ id: result.winnerId, amount: result.amount }],
			bets: Object.fromEntries(
				next.usersList.filter((u) => u.cardsInHand.length).map((u) => [u.id, u.handBet ?? 0])
			),
			revealed
		});
	}
	return events;
}
