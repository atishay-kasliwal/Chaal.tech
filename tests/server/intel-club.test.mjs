import test from 'node:test';
import assert from 'node:assert/strict';
import { clubOverview, variantHealth } from '../../server/analytics/intel/club.mjs';
import { clubTimeline } from '../../server/analytics/intel/timeline.mjs';
import { recordProblems, PUBLIC_ROOT_KEYS } from '../../server/analytics/intel/quality.mjs';
import { exportRows, toNdjson, EXPORT_SCHEMA } from '../../server/analytics/intel/export.mjs';
import { fairnessCenter } from '../../server/analytics/intel/fairness.mjs';
import { parseFilter } from '../../server/analytics/api.mjs';
import { filterFacts } from '../../server/analytics/compute/performance.mjs';
import { hand, factsFor, privacyViolations, shuffle, seeded, DAY, T0 } from './helpers/intel.mjs';
import { freshDeck } from '../../server/classic.mjs';

const NOW = T0 + 90 * DAY;
const names = { a: { name: 'Asha' }, b: { name: 'Bina' }, c: { name: 'Chirag' }, d: { name: 'Dev' }, 'bot:raju': { name: 'Raju' } };

/** A club history: three nights a week for a few weeks, shifting variants, a bot at some tables. */
function clubHistory() {
	const out = [];
	for (let n = 0; n < 24; n++) {
		const night = `room:n${n}`;
		const day = T0 + n * 3 * DAY;
		const variant = n < 12 ? 'classic-1' : n % 2 ? 'muflis-1' : 'classic-1';
		const players = n % 3 === 0 ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'c'];
		for (let h = 0; h < 14; h++) {
			const winner = players[(n + h) % players.length];
			const seats = players.map((p) => ({ p, net: p === winner ? 10 * (players.length - 1) : -10 }));
			if (n % 4 === 0) seats.push({ p: 'bot-raju', bot: 'raju', net: 0, exit: 'fold' });
			out.push(hand({ id: `c${n}-${h}`, at: day + h * 120_000, night, boot: 10, rulesVersion: variant, seats, winners: [winner] }));
		}
	}
	out.forEach((r) => r.seats.forEach((s) => { if (s.bot) s.bot.botId = 'raju'; }));
	return out;
}

test('owner analytics: counts, popularity, retention and recurring groups, from public records only', () => {
	const records = clubHistory();
	const o = clubOverview(records, { now: NOW, names });
	assert.equal(o.nights, 24);
	assert.equal(o.hands, records.length);
	assert.equal(o.players, 4);
	assert.ok(o.avgNightMinutes >= 25);
	assert.ok(o.variants.find((v) => v.key === 'teen-patti|classic-1').hands > o.variants.find((v) => v.key === 'teen-patti|muflis-1').hands);
	assert.equal(o.bots[0].botId, 'raju');
	assert.ok(o.retention.cohorts.length >= 1 && o.retention.cohorts.every((c) => c.rate !== null));
	assert.ok(o.groups[0].players.length >= 3 && o.groups[0].nights >= 3);
	assert.deepEqual(privacyViolations(o), []);
	assert.deepEqual(clubOverview([], {}), { empty: true });
});

test('variant health lists signals with sample sizes, flags quick abandonment, and never ranks', () => {
	const records = clubHistory();
	// A variant tried for a single hand at a time, over and over: players keep switching away.
	for (let i = 0; i < 10; i++) {
		records.push(hand({ id: `try${i}`, at: T0 + 200 * DAY + i * 3_600_000, night: `room:try${i}`, rulesVersion: 'muflis-1', seats: [{ p: 'a', net: 10 }, { p: 'b', net: -10 }] }));
		records.push(hand({ id: `back${i}`, at: T0 + 200 * DAY + i * 3_600_000 + 1000, night: `room:try${i}`, rulesVersion: 'classic-1', seats: [{ p: 'a', net: 10 }, { p: 'b', net: -10 }] }));
	}
	const health = variantHealth(records, { now: NOW + 300 * DAY });
	const muflis = health.variants.find((v) => v.key === 'teen-patti|muflis-1');
	assert.ok(muflis.flags.includes('often-switched-away'));
	assert.ok(muflis.uniquePlayers >= 2 && muflis.completionRate === 1 && muflis.repeatRate >= 0);
	for (const v of health.variants) {
		assert.ok(['insufficient', 'early', 'moderate', 'strong'].includes(v.evidence));
		assert.ok(!('score' in v) && !('rank' in v));
	}
	assert.match(health.note, /Popularity is not quality/);
});

test('the club timeline is built from structured events and stays light', () => {
	const records = clubHistory();
	const t = clubTimeline({ records, bots: [{ botId: 'raju', name: 'Raju', at: T0 + 10 * DAY }], names, now: NOW });
	const types = new Set(t.events.map((e) => e.type));
	for (const type of ['first-night', 'milestone', 'new-variant', 'new-bot']) assert.ok(types.has(type), type);
	assert.ok(t.events.every((e) => e.at <= NOW && e.text && !/—/.test(e.text)));
	assert.deepEqual(clubTimeline({ records: [], now: NOW }), { empty: true, events: [] });
});

/* ---------------------------------------- data quality and export ---------------------------------------- */

test('the per-hand quality checks catch what they should (real recorded history is checked in intel-api)', () => {
	const good = hand({ seats: [{ p: 'a', net: 10 }, { p: 'b', net: -10 }] });
	assert.deepEqual(recordProblems(good), []);
	const bad = hand({ seats: [{ p: 'a', net: 10 }, { p: 'b', net: -3, bot: 'x' }] });
	bad.seats[1].bot = { botId: 'x' };
	bad.seats[0].dealt = [{ rank: 2, suit: 'hearts' }];
	bad.secret = 1;
	bad.rulesVersion = 'nonsense-9';
	const codes = recordProblems(bad);
	for (const code of ['nets-do-not-balance', 'missing-bot-version', 'private-field-in-public-record', 'unexpected-root-field', 'unknown-variant-version'])
		assert.ok(codes.includes(code), code);
	assert.ok(PUBLIC_ROOT_KEYS.has('events') && !PUBLIC_ROOT_KEYS.has('deck'));
});

test('export rows are canonical facts with no cards, deck or bot internals', () => {
	const record = hand({ boot: 20, seats: [{ p: 'a', net: 40 }, { p: 'b', net: -20 }, { p: 'bot-r', bot: 'raju', net: -20 }] });
	const rows = exportRows(record);
	assert.equal(rows.length, 3);
	assert.ok(rows.every((r) => r.schema === EXPORT_SCHEMA && r.units === r.net / 20));
	assert.deepEqual(privacyViolations(rows), []);
	assert.equal(toNdjson(rows).split('\n').length, 3);
	assert.ok(!JSON.stringify(rows).includes('dealt'));
	assert.deepEqual(exportRows(hand({ stopped: true, seats: [{ p: 'a', net: 0 }, { p: 'b', net: 0 }] })), [], 'a stopped hand is not a result');
});

/* ---------------------------------------- fairness ---------------------------------------- */

function dealt(hands, seed) {
	const rng = seeded(seed);
	return Array.from({ length: hands }, (_, i) => ({ handId: `h${i}`, gameType: 'teen-patti', rulesVersion: 'classic-1', dealt: shuffle(freshDeck(), rng).slice(0, 3), final: [] }));
}

test('fairness center: a fair deck looks fair, short-term unevenness is not alarmed about, a rigged deck is', () => {
	const fair = fairnessCenter({ owns: dealt(300, 1), integrity: { hands: 300, sealed: 300, cutByPlayer: 290, replayVerified: 300 } });
	assert.equal(fair.you.verdict, 'fair');
	assert.ok(fair.you.outsideBand <= 4, 'about one bar in twenty may sit outside by chance');
	assert.equal(fair.integrity.sealedBeforeDealing, 300);
	assert.match(fair.explain.cannot.join(' '), /cannot prove a shuffle was random in a single hand/);
	assert.doesNotMatch(JSON.stringify(fair), /"deck"|salt|commitment/);
	const few = fairnessCenter({ owns: dealt(10, 2) });
	assert.equal(few.you.verdict, 'insufficient');
	// A deal that heavily favours aces.
	const rigged = dealt(300, 3).map((o, i) => ({ ...o, dealt: i % 2 ? [{ rank: 14, suit: 'spades' }, ...o.dealt.slice(1)] : o.dealt }));
	assert.equal(fairnessCenter({ owns: rigged }).you.verdict, 'unusual');
	// Across many fair decks the center almost never cries wolf.
	let unusual = 0;
	for (let t = 0; t < 80; t++) if (fairnessCenter({ owns: dealt(120, 100 + t) }).you.verdict === 'unusual') unusual++;
	assert.ok(unusual <= 3, `false alarms: ${unusual} of 80`);
});

/* ---------------------------------------- filters ---------------------------------------- */

test('filters: date range, bot and recent-versus-all-time compose and validate', () => {
	const filter = parseFilter(new URLSearchParams({ from: '2026-10-01', until: '2026-10-10', bot: 'raju', game: 'teen-patti', variant: 'muflis-1' }));
	assert.equal(filter.opponent, 'bot:raju');
	assert.equal(filter.until - filter.from, 10 * DAY);
	assert.throws(() => parseFilter(new URLSearchParams({ from: 'yesterday' })), /Dates look like/);
	assert.throws(() => parseFilter(new URLSearchParams({ bot: 'Raju;drop' })), /Unknown bot/);
	const records = [0, 5, 9, 15].map((d) => hand({ id: `d${d}`, at: T0 + d * DAY, seats: [{ p: 'me', net: 10 }, { p: 'bot-raju', bot: 'raju', net: -10 }] }));
	records.forEach((r) => (r.seats[1].bot.botId = 'raju'));
	const facts = factsFor(records, 'me');
	assert.equal(filterFacts(facts, { from: T0 + 4 * DAY, until: T0 + 10 * DAY }).length, 2);
	assert.equal(filterFacts(facts, { opponent: 'bot:raju', window: 'recent-hands' }).length, 4);
	assert.equal(filterFacts(facts, { opponent: 'bot:other' }).length, 0);
});
