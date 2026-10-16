export type FeedKind =
	'deal' | 'blind' | 'chaal' | 'raise' | 'see' | 'pack' | 'show' | 'win' | 'join' | 'leave';

export interface FeedEvent {
	id: number;
	kind: FeedKind;
	playerId?: string;
	text: string;
	amount?: number;
}

let nextId = 1;

/**
 * Turn two consecutive room snapshots into human sentences. The server only sends
 * whole snapshots, so the table narrates by comparing what changed.
 */
export function describeChange(before: RoomData | null, after: RoomData): FeedEvent[] {
	const events: FeedEvent[] = [];
	const push = (event: Omit<FeedEvent, 'id'>) => events.push({ id: nextId++, ...event });
	if (!before) return events;

	if (after.handId && after.handId !== before.handId && after.isStarted && !after.gameShow) {
		const dealt = after.usersList.filter((user) => !user.isPacked).length;
		push({ kind: 'deal', text: `New hand · ${dealt} players · boot ${after.boot ?? 1} each` });
		return events;
	}
	if (after.handId !== before.handId) return events;

	for (const user of after.usersList) {
		const old = before.usersList.find((candidate) => candidate.id === user.id);
		if (!old) {
			push({ kind: 'join', playerId: user.id, text: `${user.username} sat down` });
			continue;
		}
		if (old.isBlind && !user.isBlind)
			push({ kind: 'see', playerId: user.id, text: `${user.username} saw their cards` });
		const paid = (user.handBet ?? 0) - (old.handBet ?? 0);
		const showdown = after.result && !before.result && after.result.reason.startsWith('show');
		if (paid > 0 && !showdown) {
			const stakeBefore = before.maxStake;
			const raised = user.isBlind ? paid * 2 > stakeBefore : paid > stakeBefore;
			push({
				kind: user.isBlind ? 'blind' : raised ? 'raise' : 'chaal',
				playerId: user.id,
				amount: paid,
				text: `${user.username} ${user.isBlind ? 'played blind' : raised ? 'raised to' : 'chaal'} ₹${paid}`
			});
		}
		if (!old.isPacked && user.isPacked && !user.hasLeft)
			push({ kind: 'pack', playerId: user.id, text: `${user.username} packed` });
		if (!old.hasLeft && user.hasLeft)
			push({ kind: 'leave', playerId: user.id, text: `${user.username} left the table` });
	}
	for (const old of before.usersList)
		if (!after.usersList.some((user) => user.id === old.id))
			push({ kind: 'leave', playerId: old.id, text: `${old.username} left the table` });

	if (after.result && !before.result) {
		const { winnerName, amount, reason, winnerId, winners } = after.result;
		if (reason.startsWith('show')) push({ kind: 'show', text: 'Show! Cards on the table' });
		if (reason.startsWith('pot-limit'))
			push({ kind: 'show', text: 'Pot limit reached: everyone shows' });
		if (winners?.length)
			for (const share of winners)
				push({
					kind: 'win',
					playerId: share.id,
					amount: share.amount,
					text: `${share.name} takes ₹${share.amount} (split)`
				});
		else push({ kind: 'win', playerId: winnerId, amount, text: `${winnerName} won ₹${amount}` });
	}
	return events;
}
