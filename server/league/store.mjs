import snapshot from '../../shared/league-results.json' with { type: 'json' };

/** Only completed simulation summaries live here. Never returns club-player data or raw hands. */
export async function leagueHistory(db) {
	const stored = await db
		.collection('bot_league_runs')
		.find({ schema: 'chaal-league@1', kind: { $in: ['daily', 'exhibition'] } })
		.sort({ completedAt: -1 })
		.limit(90)
		.toArray();
	const byId = new Map(
		snapshot.reports
			.filter((report) => ['daily', 'exhibition'].includes(report.kind))
			.map((report) => [report.id, report])
	);
	for (const { _id, ...report } of stored) {
		void _id;
		byId.set(report.id, report);
	}
	const reports = [...byId.values()]
		.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
		.slice(0, 90);
	return { reports, schedule: { time: '07:00', timeZone: 'America/New_York', hands: 1_000_000 } };
}

/** A narrowly scoped publisher can append summaries, never replace results or touch game data. */
export function validateLeagueReport(input) {
	const fail = () => {
		throw new Error('Invalid completed league report');
	};
	if (
		!input ||
		input.schema !== 'chaal-league@1' ||
		!['daily', 'exhibition'].includes(input.kind) ||
		input.id !== `${input.kind}-${input.seed}` ||
		!Number.isSafeInteger(input.seed) ||
		input.seed < 0 ||
		input.seed > 2147483647
	)
		fail();
	if (
		input.game !== 'teen-patti' ||
		input.variant !== 'classic-1' ||
		!Number.isSafeInteger(input.hands) ||
		input.hands < 500 ||
		input.hands > 5_000_000 ||
		input.hands % 500 ||
		input.participations !== input.hands * 5 ||
		input.blocks !== input.hands / 500 ||
		input.rotations !== 5 ||
		input.blockHands !== 100
	)
		fail();
	if (
		!Number.isFinite(Date.parse(input.startedAt)) ||
		!Number.isFinite(Date.parse(input.completedAt)) ||
		Date.parse(input.completedAt) < Date.parse(input.startedAt) ||
		!Number.isFinite(input.durationSeconds) ||
		input.durationSeconds < 0
	)
		fail();
	const ids = ['rohit-sharma', 'virat-kohli', 'gg', 'samay-raina', 'ms-dhoni'];
	if (
		!Array.isArray(input.standings) ||
		input.standings.length !== 5 ||
		new Set(input.standings.map((s) => s.id)).size !== 5
	)
		fail();
	const standings = input.standings.map((s) => {
		if (
			!ids.includes(s.id) ||
			s.hands !== input.hands ||
			typeof s.name !== 'string' ||
			s.name.length > 24 ||
			typeof s.style !== 'string' ||
			s.style.length > 100 ||
			typeof s.hash !== 'string' ||
			s.hash.length > 64
		)
			fail();
		for (const k of ['net', 'profit100', 'interval95', 'wins', 'decisions', 'raises', 'folds'])
			if (!Number.isFinite(s[k]) || Math.abs(s[k]) > 1e12) fail();
		if (
			s.wins < 0 ||
			s.wins > s.hands ||
			s.interval95 < 0 ||
			s.decisions < 0 ||
			s.raises < 0 ||
			s.folds < 0 ||
			Math.abs(s.profit100 - (s.net / s.hands) * 100) > 1e-6
		)
			fail();
		return Object.fromEntries(
			[
				'id',
				'name',
				'style',
				'hash',
				'hands',
				'wins',
				'net',
				'profit100',
				'interval95',
				'decisions',
				'raises',
				'folds'
			].map((k) => [k, s[k]])
		);
	});
	if (
		Math.abs(standings.reduce((n, s) => n + s.net, 0)) > 1e-5 ||
		standings.some((s, i) => i > 0 && s.net > standings[i - 1].net)
	)
		fail();
	const gaps = Object.fromEntries(
		ids.map((a) => [
			a,
			Object.fromEntries(
				ids.map((b) => {
					const g = input.gaps?.[a]?.[b];
					if (!g || !Number.isFinite(g.mean) || !Number.isFinite(g.interval95) || g.interval95 < 0)
						fail();
					const left = standings.find((s) => s.id === a),
						right = standings.find((s) => s.id === b);
					if (Math.abs(g.mean - (left.profit100 - right.profit100)) > 1e-5) fail();
					return [b, { mean: g.mean, interval95: g.interval95 }];
				})
			)
		])
	);
	const leader = standings[0].id;
	const decisive = ids
		.filter((id) => id !== leader)
		.every((id) => gaps[leader][id].mean - gaps[leader][id].interval95 > 0);
	if (
		input.leader !== leader ||
		input.decisive !== decisive ||
		input.winner !== (decisive && input.kind === 'daily' ? leader : null)
	)
		fail();
	if (
		typeof input.method !== 'string' ||
		input.method.length > 1200 ||
		typeof input.commit !== 'string' ||
		!/^[a-f0-9]{40}$/.test(input.commit)
	)
		fail();
	return Object.fromEntries(
		[
			'id',
			'schema',
			'kind',
			'game',
			'variant',
			'seed',
			'startedAt',
			'completedAt',
			'hands',
			'participations',
			'durationSeconds',
			'blocks',
			'rotations',
			'blockHands',
			'leader',
			'winner',
			'decisive',
			'leadGap95',
			'method',
			'commit'
		]
			.map((k) => [k, input[k]])
			.concat([
				['standings', standings],
				['gaps', gaps]
			])
	);
}

export async function saveLeagueReport(db, input) {
	const report = validateLeagueReport(input);
	const collection = db.collection('bot_league_runs');
	const existing = await collection.findOne({ _id: report.id });
	if (
		existing &&
		(existing.completedAt !== report.completedAt ||
			existing.hands !== report.hands ||
			JSON.stringify(existing.standings) !== JSON.stringify(report.standings))
	)
		throw new Error('A different result already exists for this competition');
	const saved = await collection.updateOne(
		{ _id: report.id },
		{ $setOnInsert: report },
		{ upsert: true }
	);
	// Concurrent uploads cannot replace the first completion.
	if (!saved.upsertedCount && !existing) {
		const current = await collection.findOne({ _id: report.id });
		if (current.completedAt !== report.completedAt)
			throw new Error('A different result already exists for this competition');
	}
	return { id: report.id };
}
