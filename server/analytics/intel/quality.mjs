/**
 * Data quality (docs/archive/ANALYTICS_PHASE5.md, "Data quality"): problems must be visible before anyone
 * trusts a number. `recordProblems` is a pure per-hand check; `dataQuality` runs it over the history
 * plus the operational checks (recorder, replay, memory, stale caches). Output carries ids and counts
 * only, never hand contents.
 */
import { getVariant } from '../../variants/index.mjs';
import { GAMES } from '../compute/facts.mjs';
import { COLLECTIONS, recorderHealth, verifyStoredHands } from '../store.mjs';
import { memoryHealth } from '../../bots/memory/diagnostics.mjs';
import { handFacts } from '../compute/facts.mjs';

/** Keys a public record may carry. Anything else at the root is unexpected and could be private. */
export const PUBLIC_ROOT_KEYS = new Set([
	'_id', 'v', 'room', 'handId', 'nightId', 'handNo', 'gameType', 'rulesVersion', 'startedAt', 'completedAt', 'practice', 'config', 'pick',
	'seal', 'prevHandId', 'recorder', 'seats', 'firstActor', 'buttonSeat', 'observers', 'table', 'events', 'outcome', 'shown', 'lateShown', 'flows', 'verified', 'complete', 'engine', 'versions'
]);
/** Fields no public record may ever hold, at any depth of a seat. */
const PRIVATE_SEAT_KEYS = ['dealt', 'final', 'cards', 'hole', 'deck', 'salt', 'hand'];

export function recordProblems(record, { knownBots = null } = {}) {
	const problems = [];
	if (!GAMES.includes(record.gameType)) problems.push('unknown-game');
	else if (record.gameType === 'teen-patti' && !getVariant(record.rulesVersion)) problems.push('unknown-variant-version');
	const complete = record.outcome?.pot !== null && record.outcome?.pot !== undefined;
	if (!record.outcome) problems.push('missing-outcome');
	if (!record.observers?.length) problems.push('missing-observers');
	if (complete) {
		const players = record.outcome.players ?? [];
		const sum = players.reduce((s, p) => s + p.net, 0);
		// Blackjack is played against the dealer, so only zero-sum games can be checked this way.
		if (record.gameType !== 'blackjack' && Math.abs(sum) > 0.5) problems.push('nets-do-not-balance');
		if (players.some((p) => !Number.isFinite(p.net) || !Number.isFinite(p.contributed))) problems.push('non-numeric-net');
		if (record.gameType !== 'blackjack' && players.some((p) => p.net > record.outcome.pot + 0.5)) problems.push('win-exceeds-pot');
		try {
			handFacts(record);
		} catch {
			problems.push('facts-failed');
		}
	}
	for (const seat of record.seats ?? []) {
		if (seat.kind === 'bot') {
			if (!seat.bot?.styleId || !Number.isInteger(seat.bot?.styleVersion) || !seat.bot?.configHash) problems.push('missing-bot-version');
			else if (knownBots && !knownBots.has(seat.bot.styleId)) problems.push('bot-style-not-found');
		}
		if (PRIVATE_SEAT_KEYS.some((k) => k in seat)) problems.push('private-field-in-public-record');
	}
	if (Object.keys(record).some((k) => !PUBLIC_ROOT_KEYS.has(k))) problems.push('unexpected-root-field');
	return [...new Set(problems)];
}

const check = (id, label, count, examples = [], detail = null, warnAt = 1) => ({ id, label, count, status: count >= warnAt ? 'attention' : 'ok', examples: examples.slice(0, 5), detail });

export async function dataQuality(db, { now = Date.now(), sample = 40, scan = 20000 } = {}) {
	const styles = new Set((await db.collection(COLLECTIONS.styles).find({}, { projection: { _id: 1 } }).toArray()).map((s) => s._id));
	// Per-hand checks never need the event list, which is most of a record's size.
	const records = await db.collection(COLLECTIONS.records).find({}, { projection: { seal: 0, events: 0 } }).sort({ completedAt: -1 }).limit(scan).toArray();
	const found = new Map();
	for (const record of records) for (const code of recordProblems(record, { knownBots: styles.size ? styles : null })) {
		if (!found.has(code)) found.set(code, []);
		found.get(code).push(record._id);
	}
	const count = (...codes) => codes.reduce((s, c) => s + (found.get(c)?.length ?? 0), 0);
	const ids = (...codes) => codes.flatMap((c) => found.get(c) ?? []);
	// A night's hand numbers should run 1..n; a gap means a hand went missing.
	const nights = new Map();
	for (const r of records) {
		const n = nights.get(r.nightId) ?? [];
		if (Number.isInteger(r.handNo)) n.push(r.handNo);
		nights.set(r.nightId, n);
	}
	const gaps = [...nights.entries()].filter(([, list]) => {
		const sorted = [...new Set(list)].sort((a, b) => a - b);
		return sorted.length > 1 && sorted.at(-1) - sorted[0] + 1 !== sorted.length;
	}).map(([id]) => id);
	const health = await recorderHealth(db).catch(() => null);
	const replay = await verifyStoredHands(db, { limit: sample }).catch((error) => ({ error: String(error.message) }));
	const memory = await memoryHealth(db, now).catch(() => null);
	const lastHand = records[0]?.completedAt ?? 0;
	const memoryBad = (memory?.bots ?? []).filter((b) => b.status?.status === 'retrying' || b.status?.lastError);
	const stale = (memory?.bots ?? []).filter((b) => b.status?.lastUpdated && lastHand - b.status.lastUpdated > 6 * 3_600_000);
	const checks = [
		check('missing-hands', 'Hands the recorder expected but did not store', (health?.unaccountedHands?.length ?? 0) + gaps.length, [...(health?.unaccountedHands ?? []), ...gaps], 'Unaccounted archive hands plus nights with a gap in hand numbers.'),
		check('replay-failures', 'Stored hands that no longer replay exactly', (replay.mismatched?.length ?? 0) + (replay.missingPublic?.length ?? 0), [...(replay.mismatched ?? []).map((m) => m.id), ...(replay.missingPublic ?? [])], `Sampled ${replay.checked ?? 0} hands.`),
		check('replay-unavailable', 'Hands from rule versions this code cannot replay', replay.unavailable?.length ?? 0, (replay.unavailable ?? []).map((u) => u.id), null, 1),
		check('impossible-nets', 'Hands whose chips do not balance', count('nets-do-not-balance', 'win-exceeds-pot', 'non-numeric-net'), ids('nets-do-not-balance', 'win-exceeds-pot', 'non-numeric-net')),
		check('missing-bot-versions', 'Bot seats without a recorded style version', count('missing-bot-version', 'bot-style-not-found'), ids('missing-bot-version', 'bot-style-not-found')),
		check('unknown-versions', 'Games or variants this code does not know', count('unknown-game', 'unknown-variant-version'), ids('unknown-game', 'unknown-variant-version')),
		check('computation-failures', 'Hands analytics could not compute', count('facts-failed'), ids('facts-failed')),
		check('memory-failures', 'Bot memory that is failing or retrying', memoryBad.length, memoryBad.map((b) => b.botId), memory?.status === 'not-migrated' ? 'Bot memory is not migrated yet.' : null),
		check('private-fields', 'Public records with fields that should be private', count('private-field-in-public-record', 'unexpected-root-field'), ids('private-field-in-public-record', 'unexpected-root-field')),
		check('stale-aggregates', 'Derived data that is behind the hand history', stale.length + (health?.keptForRebuild ?? 0), stale.map((b) => b.botId), 'Bot memory last updated long before the newest hand, or hands waiting to be rebuilt.')
	];
	return { generatedAt: now, scanned: records.length, status: checks.every((c) => c.status === 'ok') ? 'ok' : 'attention', checks };
}
