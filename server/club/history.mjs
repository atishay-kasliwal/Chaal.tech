/** Public results only: never archive private cards, emails, or current balances. */
export const HANDS = 'club_hands';
const NON_GAME = new Set(['joinRoom', 'addBot', 'removeBot', 'answerChipRequest']);

export function trackClubHand(previous, before, after, movement, now) {
	let progress = previous;
	if (after.handId && after.handId !== before?.handId) {
		const participants = after.players.filter((player) => player.cards?.length);
		progress = {
			handId: after.handId,
			startedAt: now,
			practice: participants.some((player) => !!player.bot),
			players: participants.map((player) => ({
				playerId: player.id,
				nickname: player.username,
				bot: !!player.bot,
				net: 0
			}))
		};
	}
	if (!progress || progress.handId !== after.handId) return { progress, completed: null };
	progress = structuredClone(progress);
	if (movement && !NON_GAME.has(movement.kind)) {
		for (const player of progress.players) {
			player.net += movement.entries.find((entry) => entry.account === player.playerId)?.delta ?? 0;
		}
	}
	if (!after.result || before?.result?.handId === after.result.handId)
		return { progress, completed: null };
	const result = after.result;
	const winnerIds = result.payouts
		? result.payouts.filter((p) => p.payout > p.bet).map((p) => p.playerId)
		: (result.winners?.map((winner) => (typeof winner === 'string' ? winner : winner.id)) ?? [
				result.winnerId
			]);
	return {
		progress: null,
		completed: {
			_id: `${after.name}:${after.handId}`,
			room: after.name,
			handId: after.handId,
			gameType: after.gameType ?? 'teen-patti',
			rulesVersion: after.rulesVersion ?? null,
			startedAt: progress.startedAt,
			completedAt: now,
			practice: progress.practice,
			winnerName: result.winnerName,
			amount: result.amount,
			reason: result.reason,
			players: progress.players.map((player) => ({
				...player,
				won: winnerIds.includes(player.playerId)
			}))
		}
	};
}

export async function archiveHands(db, hands) {
	if (!hands.length) return;
	await db.collection(HANDS).createIndex({ practice: 1, completedAt: -1 });
	await db.collection(HANDS).bulkWrite(
		hands.map((hand) => ({
			updateOne: { filter: { _id: hand._id }, update: { $setOnInsert: hand }, upsert: true }
		}))
	);
}

/** Club calendar uses India time. UTC timestamps remain canonical in storage. */
export function historySince(period, now = Date.now()) {
	if (period === 'all') return 0;
	const offset = 330 * 60_000;
	const date = new Date(now + offset);
	return (
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			period === 'month' ? 1 : date.getUTCDate()
		) - offset
	);
}

export async function clubHistory(db, { period = 'all', page = 0, playerId, now = Date.now() }) {
	const match = { practice: false, completedAt: { $gte: historySince(period, now) } };
	const collection = db.collection(HANDS);
	const [total, hands, leaderboard, personal] = await Promise.all([
		collection.countDocuments(match),
		collection
			.find(match)
			.sort({ completedAt: -1, _id: -1 })
			.skip(page * 3)
			.limit(3)
			.toArray(),
		collection
			.aggregate([
				{ $match: match },
				{ $unwind: '$players' },
				{ $match: { 'players.bot': false } },
				{
					$group: {
						_id: '$players.playerId',
						net: { $sum: '$players.net' },
						wins: { $sum: { $cond: ['$players.won', 1, 0] } },
						hands: { $sum: 1 }
					}
				},
				{ $sort: { net: -1, wins: -1, _id: 1 } },
				{ $limit: 50 }
			])
			.toArray(),
		collection
			.aggregate([
				{ $match: { ...match, 'players.playerId': playerId } },
				{ $unwind: '$players' },
				{ $match: { 'players.playerId': playerId, 'players.bot': false } },
				{
					$group: {
						_id: null,
						net: { $sum: '$players.net' },
						wins: { $sum: { $cond: ['$players.won', 1, 0] } },
						hands: { $sum: 1 }
					}
				}
			])
			.toArray()
	]);
	const identities = await db
		.collection('members')
		.find(
			{ playerId: { $in: leaderboard.map((entry) => entry._id) } },
			{ projection: { playerId: 1, nickname: 1, characterId: 1 } }
		)
		.toArray();
	return {
		period,
		page,
		total,
		hasMore: (page + 1) * 3 < total,
		personal: personal[0]
			? { net: personal[0].net, wins: personal[0].wins, hands: personal[0].hands }
			: { net: 0, wins: 0, hands: 0 },
		leaderboard: leaderboard.map((entry, index) => {
			const member = identities.find((candidate) => candidate.playerId === entry._id);
			return {
				rank: index + 1,
				nickname: member?.nickname || 'A friend',
				characterId: member?.characterId,
				net: entry.net,
				wins: entry.wins,
				hands: entry.hands,
				isYou: entry._id === playerId
			};
		}),
		hands: hands.map((hand) => ({
			id: hand._id,
			room: hand.room,
			gameType: hand.gameType,
			completedAt: hand.completedAt,
			winnerName: hand.winnerName,
			amount: hand.amount,
			players: hand.players
				.filter((player) => !player.bot)
				.map((player) => ({
					nickname: player.nickname,
					net: player.net,
					won: player.won,
					isYou: player.playerId === playerId
				}))
		}))
	};
}
