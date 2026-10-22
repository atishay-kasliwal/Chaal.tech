/**
 * Measure real analytics cost on synthetic history of a given size, against a throwaway MongoDB.
 * No production access. Results are the evidence behind docs/archive/ANALYTICS_PHASE5.md "Performance".
 *   node scripts/analytics-benchmark.mjs [hands=4000] [players=8]
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { migrateAnalytics, COLLECTIONS } from '../server/analytics/store.mjs';
import { migrateIntel } from '../server/analytics/intel/schema.mjs';
import { analyticsResponse } from '../server/analytics/api.mjs';
import { adminBotIntel, adminClubIntel, adminQuality } from '../server/analytics/intel/admin.mjs';
import { clearMemo } from '../server/analytics/intel/memo.mjs';
import { hand, decide, T0 } from '../tests/server/helpers/records.mjs';
import { seeded, DAY } from '../tests/server/helpers/intel.mjs';

const hands = Number(process.argv[2] ?? 4000);
const players = Number(process.argv[3] ?? 8);
const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('bench');
await migrateAnalytics(db);
await migrateIntel(db);

// A friends' club: ~16 hands a night, 4 to 6 people and a bot at a few tables, three games.
const random = seeded(2026);
const ids = Array.from({ length: players }, (_, i) => `p${i}`);
const records = [];
const owns = [];
for (let i = 0; i < hands; i++) {
	const night = Math.floor(i / 16);
	const here = ids.filter((_, k) => (k + night) % 3 !== 2 || k < 4).slice(0, 4 + (night % 3));
	const winner = here[Math.floor(random() * here.length)];
	const bot = night % 4 === 0;
	const seats = [...here.map((p) => ({ p, net: p === winner ? 10 * (here.length - 1 + (bot ? 1 : 0)) : -10, exit: p === winner ? 'won' : random() < 0.4 ? 'fold' : 'lost' })), ...(bot ? [{ p: 'bot-raju', bot: 'raju', net: -10, exit: 'lost' }] : [])];
	const game = i % 9 === 0 ? 'texas-holdem' : 'teen-patti';
	const at = T0 + night * 2 * DAY + (i % 16) * 90_000;
	const events = [
		{ i: 0, t: 0, p: here[0], kind: 'player', raw: 'start', a: 'deal', payload: {}, chips: {} },
		...here.slice(0, 3).flatMap((p, k) => [decide(1 + k * 2, p, random() < 0.5 ? 'raise' : 'call', { amount: 20 }), decide(2 + k * 2, here[(k + 1) % here.length], random() < 0.3 ? 'fold' : 'call', { facing: 'raise', amount: 10 })])
	];
	const r = hand({ id: `b${i}`, at, night: `room:n${night}`, handNo: (i % 16) + 1, game, boot: 10, bigBlind: 2, seats, winners: [winner], events });
	r.seats.forEach((s) => s.bot && (s.bot.botId = 'raju'));
	r.complete = true;
	r.verified = { replay: 'exact', stepCount: 8, botDecisions: 'reproduced' };
	r.versions = { engine: 'bench', recorder: 2 };
	r.recorder = { v: 2 };
	records.push(r);
	const card = (k) => ({ rank: 2 + ((i * 7 + k * 5) % 13), suit: ['hearts', 'spades', 'clubs', 'diamonds'][(i + k) % 4] });
	for (const p of here) owns.push({ _id: `${r._id}:${p}`, handId: r._id, p, gameType: game, rulesVersion: r.rulesVersion, completedAt: at, dealt: game === 'teen-patti' ? [card(0), card(1), card(2)] : [card(0), card(1)], final: game === 'teen-patti' ? [card(0), card(1), card(2)] : [] });
}
for (let i = 0; i < records.length; i += 500) await db.collection(COLLECTIONS.records).insertMany(records.slice(i, i + 500), { bypassDocumentValidation: true });
for (let i = 0; i < owns.length; i += 500) await db.collection(COLLECTIONS.private).insertMany(owns.slice(i, i + 500), { bypassDocumentValidation: true });
await db.collection('members').insertMany(ids.map((p) => ({ playerId: p, nickname: p, status: 'active' })));

const rows = [];
async function time(label, work) {
	global.gc?.();
	const before = process.memoryUsage().heapUsed;
	const start = performance.now();
	await work();
	rows.push({ view: label, ms: Math.round(performance.now() - start), heapMB: Math.round((process.memoryUsage().heapUsed - before) / 1e6) });
}
const me = { playerId: 'p0' };
const ask = (route, params = {}) => analyticsResponse(db, me, route, new URLSearchParams(params), T0 + 400 * DAY);
const night = (await ask('nights')).nights[0].nightId;
for (const route of ['overview', 'games', 'cards', 'patterns', 'rivals', 'insights', 'skill', 'records', 'fairness']) await time(`member · ${route}`, () => ask(route));
await time('member · recap', () => ask('recap', { night }));
await time('member · club records (cold)', () => ask('club'));
await time('member · club records (cached)', () => ask('club'));
clearMemo();
await time('owner · club + variants (cold)', () => adminClubIntel(db));
await time('owner · club + variants (cached)', () => adminClubIntel(db));
await time('owner · bots (cold)', () => adminBotIntel(db));
await time('owner · data quality', () => adminQuality(db));
console.log(`\n${hands} hands, ${players} players, ${owns.length} private rows\n`);
console.table(rows);
await client.close();
await mongo.stop();
