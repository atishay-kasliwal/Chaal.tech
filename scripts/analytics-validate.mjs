/**
 * The production validation checklist (docs/archive/ANALYTICS_OPERATIONS.md), read-only, in one report.
 *   npm run analytics:validate [-- --since 2026-10-18T00:00:00Z]
 * Exits 1 if any check fails.
 */
import { MongoClient } from 'mongodb';
import { COLLECTIONS, recorderHealth, verifyStoredHands, readSealed } from '../server/analytics/store.mjs';

const args = process.argv.slice(2);
const sinceArg = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;
const since = sinceArg ? Date.parse(sinceArg) : 0;
const uri = process.env.MONGODB_URI;
if (!uri) {
	console.error('Set MONGODB_URI (and optionally MONGODB_DB).');
	process.exit(1);
}

const SEALED_KEYS = ['preDeal', 'steps', 'deck', 'salts', 'leaves', 'hiddenStacks', 'botTrace', 'draws', 'rngDraws', 'rngSeed', 'recycledDeck', 'ctx'];
const cardKey = (c) => `${c.rank}:${c.suit}:${c.copy ?? 0}`;
function walk(value, visit) {
	if (Array.isArray(value)) value.forEach((v) => walk(v, visit));
	else if (value && typeof value === 'object') {
		visit(value);
		Object.values(value).forEach((v) => walk(v, visit));
	}
}
const cardsIn = (value) => {
	const out = [];
	walk(value, (n) => 'rank' in n && 'suit' in n && (n.rank > 0 || n.suit === 'joker') && out.push(cardKey(n)));
	return out;
};
const keysIn = (value) => {
	const out = new Set();
	walk(value, (n) => Object.keys(n).forEach((k) => out.add(k)));
	return out;
};

const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

const client = new MongoClient(uri);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	const records = await db.collection(COLLECTIONS.records).find({ completedAt: { $gte: since } }).sort({ completedAt: 1 }).toArray();
	const ids = records.map((r) => r._id);

	// 1. Health
	const health = await recorderHealth(db);
	check('health: no failures', health.failed === 0, JSON.stringify(health.failureReasons));
	check('health: nothing waiting for retry', health.waitingForRetry.rows === 0, JSON.stringify(health.waitingForRetry));
	check('health: no repeated retries', health.repeatedlyRetrying.length === 0, JSON.stringify(health.repeatedlyRetrying));
	check('health: no unaccounted hands', health.unaccountedHands.length === 0, health.unaccountedHands.join(', '));
	check('health: attempted = captured', health.attempted === health.captured, `${health.attempted} attempted, ${health.captured} captured, ${health.recorded} recorded`);

	// 2. Replay from stored data
	const replay = await verifyStoredHands(db, { filter: { _id: { $in: ids } } });
	check(
		'replay: every stored hand reproduces',
		replay.checked === ids.length && replay.reproduced + replay.compatible === ids.length,
		JSON.stringify({ ...replay, unavailable: replay.unavailable.length, mismatched: replay.mismatched, missingPublic: replay.missingPublic.length })
	);

	// 3. Per-hand inspection, privacy, reconciliation, bots
	const leaks = [];
	const sums = [];
	const flowGaps = [];
	const botIssues = [];
	const leaderboardGaps = [];
	const games = new Map();
	let bots = 0;
	for (const record of records) {
		const key = `${record.gameType}${record.rulesVersion ? `/${record.rulesVersion}` : ''}`;
		games.set(key, (games.get(key) ?? 0) + 1);
		const privates = await db.collection(COLLECTIONS.private).find({ handId: record._id }).toArray();
		const sealedDoc = await db.collection(COLLECTIONS.sealed).findOne({ _id: record._id });
		if (privates.length !== record.seats.length) leaks.push(`${record._id}: ${privates.length} private records for ${record.seats.length} seats`);
		if (!sealedDoc) leaks.push(`${record._id}: no sealed record`);

		// Privacy
		const shown = new Set([...record.shown.map((s) => s.p), ...(record.lateShown ?? []).map((s) => s.p)]);
		const publicCards = cardsIn(record);
		const tableCards = new Set(cardsIn(record.table));
		const shownCards = cardsIn([...record.shown, ...(record.lateShown ?? [])]);
		for (const own of privates) {
			const mine = new Set([...own.dealt, ...own.final].map(cardKey));
			for (const c of cardsIn(own)) if (!mine.has(c)) leaks.push(`${own._id} holds someone else's ${c}`);
			if (shown.has(own.p)) continue;
			for (const c of own.final.map(cardKey)) {
				if (tableCards.has(c)) continue;
				// Two-deck games: the same card may legitimately belong to someone who showed.
				const publicCount = publicCards.filter((x) => x === c).length - shownCards.filter((x) => x === c).length;
				if (publicCount > 0) leaks.push(`${record._id}: ${own.p}'s hidden ${c} appears publicly`);
			}
		}
		for (const doc of [record, ...privates]) {
			const keys = keysIn(doc);
			for (const k of SEALED_KEYS) if (keys.has(k)) leaks.push(`${doc._id}: system-only key ${k}`);
		}
		for (const seat of record.seats.filter((s) => s.hidden)) {
			if (seat.stack !== null) leaks.push(`${record._id}: hidden stack of ${seat.p} is public`);
			for (const e of record.events.filter((ev) => ev.p === seat.p && ev.decision))
				if (e.decision.stackBefore !== null) leaks.push(`${record._id}: hidden stack in event ${e.i}`);
		}

		// Nets and flows
		const players = record.outcome.players;
		const total = players.reduce((s, p) => s + p.net, 0);
		const finished = record.outcome.pot !== null && record.gameType !== 'blackjack';
		if (finished && total !== 0) sums.push(`${record._id}: nets sum to ${total}`);
		for (const p of players) {
			const inflow = record.flows.filter((f) => f.to === p.p).reduce((s, f) => s + f.amt, 0);
			const outflow = record.flows.filter((f) => f.from === p.p).reduce((s, f) => s + f.amt, 0);
			if (record.outcome.pot !== null && Math.abs(inflow - outflow - p.net) > 0.05 * (players.length + 1))
				flowGaps.push(`${record._id}: ${p.p} flows ${inflow - outflow} vs net ${p.net}`);
		}

		// Leaderboard archive (club_hands): human nets must agree hand by hand. The archive keeps only
		// hands that reached a result; a hand cut off with no result (e.g. the night ended) and no chips
		// moved is recorded but correctly not archived. One with chips moved must be archived.
		const club = await db.collection('club_hands').findOne({ _id: record._id });
		const noResult =
			record.outcome.pot === null && !record.outcome.winners?.length && players.every((p) => p.net === 0);
		if (!club) {
			if (!noResult) leaderboardGaps.push(`${record._id}: not in club_hands`);
		} else
			for (const entry of club.players.filter((p) => !p.bot)) {
				const mine = players.find((p) => p.p === entry.playerId);
				if (!mine || mine.net !== entry.net) leaderboardGaps.push(`${record._id}: ${entry.playerId} club ${entry.net} vs recorder ${mine?.net}`);
			}

		// Bots
		const botSeats = record.seats.filter((s) => s.bot);
		bots += botSeats.length;
		if (botSeats.length && sealedDoc) {
			const sealed = await readSealed(sealedDoc);
			for (const seat of botSeats) {
				const style = await db.collection(COLLECTIONS.styles).findOne({ _id: seat.bot.styleId });
				if (!style || style.configHash !== seat.bot.configHash || style.version !== seat.bot.styleVersion || style.botId !== seat.bot.botId)
					botIssues.push(`${record._id}: ${seat.p} does not resolve to a published style`);
			}
			for (const trace of sealed.botTrace)
				if (trace.verified !== 'reproduced') botIssues.push(`${record._id}: bot decision ${trace.i} ${trace.verified}`);
		}
	}
	check('privacy: no hidden card, system-only field or hidden stack is exposed', leaks.length === 0, leaks.slice(0, 10).join('\n'));
	check('chips: nets sum to zero per hand', sums.length === 0, sums.slice(0, 10).join('\n'));
	check('chips: flows reconcile to every net', flowGaps.length === 0, flowGaps.slice(0, 10).join('\n'));
	check('leaderboard: club_hands agrees hand by hand', leaderboardGaps.length === 0, leaderboardGaps.slice(0, 10).join('\n'));
	check('bots: every bot seat and decision resolves exactly', botIssues.length === 0, `${bots} bot seats. ${botIssues.slice(0, 10).join('\n')}`);

	// Night summaries: each person's chip total for a bot-free night equals the summary's real net.
	const nightGaps = [];
	const nights = await db.collection('club_nights').find({ savedAt: { $gte: new Date(since) } }).toArray();
	for (const night of nights) {
		const hands = records.filter((r) => r.room === night.table);
		if (!hands.length || hands.some((h) => h.practice)) continue;
		for (const person of night.realNet ?? []) {
			const total = hands.reduce((s, h) => s + (h.outcome.players.find((p) => p.p === person.id)?.net ?? 0), 0);
			if (Math.abs(total - person.net) > hands.length) nightGaps.push(`${night.table}: ${person.name} recorder ${total} vs summary ${person.net}`);
		}
	}
	check('night summaries agree with recorded nets (bot-free nights)', nightGaps.length === 0, `${nights.length} night summaries. ${nightGaps.join('\n')}`);

	// Failures
	const failures = await db.collection(COLLECTIONS.failures).find({ at: { $gte: since } }).toArray();
	check('recorder_failures is empty', failures.length === 0, failures.map((f) => `${f.handId}: ${f.reason} ${f.detail?.message ?? ''}`).join('\n'));

	// Volume
	const volume = {};
	for (const name of [COLLECTIONS.records, COLLECTIONS.private, COLLECTIONS.sealed, COLLECTIONS.nights, COLLECTIONS.status]) {
		const stats = await db.command({ collStats: name }).catch(() => null);
		volume[name] = stats
			? { count: stats.count, dataKB: +(stats.size / 1024).toFixed(1), storageKB: +(stats.storageSize / 1024).toFixed(1), indexKB: +(stats.totalIndexSize / 1024).toFixed(1) }
			: 'unavailable';
	}
	const perHand = records.length
		? +(([COLLECTIONS.records, COLLECTIONS.private, COLLECTIONS.sealed].reduce((s, n) => s + (volume[n]?.dataKB ?? 0), 0)) / records.length).toFixed(1)
		: 0;

	const sealedEngines = await db.collection(COLLECTIONS.sealed).distinct('engine', { _id: { $in: ids } });
	console.log(JSON.stringify({
		engineBuilds: [...new Set(records.map((r) => r.engine))],
		sealedEngineBuilds: sealedEngines,
		hands: records.length,
		nights: new Set(records.map((r) => r.nightId)).size,
		games: Object.fromEntries(games),
		health,
		replay: { checked: replay.checked, reproduced: replay.reproduced, compatible: replay.compatible, unavailable: replay.unavailable, mismatched: replay.mismatched, missingPublic: replay.missingPublic },
		volume,
		mongoKBPerHand: perHand
	}, null, 2));
	console.log('\nChecks:');
	for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok || !c.detail ? '' : `\n      ${c.detail.replaceAll('\n', '\n      ')}`}`);
	if (checks.some((c) => !c.ok)) process.exitCode = 1;
} finally {
	await client.close();
}
