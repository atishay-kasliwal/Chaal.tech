/**
 * Build the /test-stats fixture: a simulated club history run through the real analytics API,
 * so the Stats UI can be viewed and screenshotted without signing in.
 *   node scripts/analytics/stats-fixture.mjs
 */
import { writeFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { migrateAnalytics, archiveRecorderRow, COLLECTIONS } from '../../server/analytics/store.mjs';
import { analyticsResponse } from '../../server/analytics/api.mjs';
import { analyticsUrl } from './url.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti, holdemTable, playHoldem, blackjackTable, playBlackjack } from '../../tests/server/helpers/drivers.mjs';

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('fixture');
await migrateAnalytics(db);
const DAY = 86_400_000;
let room = 0;
for (let night = 0; night < 8; night++) {
	const sims = [];
	const tp = teenPattiTable({ seed: 100 + night, humans: ['a', 'b', 'c', 'd'], bots: night % 3 === 0 ? ['hard'] : [], table: 20000, options: { potLimit: 128 } });
	for (const v of ['classic-1', 'muflis-1', 'classic-1', 'ak47-1', 'classic-1', '4-card-1', 'classic-1', 'joker-1', 'classic-1', 'classic-1']) {
		dealTeenPatti(tp, v);
		playTeenPatti(tp, { packBias: 0.12 });
	}
	sims.push(tp);
	if (night % 2) {
		const h = holdemTable({ seed: 200 + night, players: ['a', 'b', 'c'] });
		for (let k = 0; k < 4; k++) { try { playHoldem(h); } catch { break; } }
		sims.push(h);
	}
	if (night % 3 === 1) {
		const b = blackjackTable({ seed: 300 + night, players: ['a', 'd'] });
		for (let k = 0; k < 3; k++) { try { playBlackjack(b); } catch { break; } }
		sims.push(b);
	}
	for (const sim of sims) {
		room++;
		const shift = (7 - night) * 3 * DAY;
		for (const row of sim.rows) {
			let text = JSON.stringify(row.payload).replaceAll('sim-room', `table-${room}`);
			const payload = JSON.parse(text);
			if (payload.type === 'capture') {
				for (const step of payload.hand.steps) step.t -= shift;
				payload.hand.startedAt -= shift;
			}
			await archiveRecorderRow(db, payload).catch(() => {});
		}
		// Shift completed times so nights spread over three weeks.
		await db.collection(COLLECTIONS.records).updateMany({ room: `table-${room}` }, [{ $set: { completedAt: { $subtract: ['$completedAt', shift] }, startedAt: { $subtract: ['$startedAt', shift] } } }]);
		await db.collection(COLLECTIONS.private).updateMany({ room: `table-${room}` }, [{ $set: { completedAt: { $subtract: ['$completedAt', shift] } } }]);
	}
}
await db.collection('members').insertMany([
	{ playerId: 'a', nickname: 'asha', characterId: 'royal-tiger', status: 'active' },
	{ playerId: 'b', nickname: 'bina', status: 'active' },
	{ playerId: 'c', nickname: 'chirag', status: 'active' },
	{ playerId: 'd', nickname: 'dev', status: 'active' }
]);
const me = { playerId: 'a' };
const fixture = {};
const add = async (route, params = {}) => {
	fixture[analyticsUrl(route, params)] = { ok: true, ...(await analyticsResponse(db, me, route, new URLSearchParams(params))) };
};
const base = { window: 'all', company: 'all' };
for (const route of ['overview', 'insights', 'games', 'cards', 'patterns', 'rivals', 'nights']) await add(route, route === 'games' ? { window: 'all', company: 'all' } : base);
const rivals = fixture[analyticsUrl('rivals', base)].rivals;
await add('rival', { ...base, opponent: rivals[0].subject });
const night = fixture[analyticsUrl('nights', base)].nights[0];
await add('hands', { ...base, night: night.nightId, page: 0 });
const hand = fixture[analyticsUrl('hands', { ...base, night: night.nightId, page: 0 })].hands[0];
await add('hand', { id: hand.handId });
// Phase 5 views.
await add('skill', base);
await add('records', {});
await add('fairness', base);
await add('club', {});
await add('timeline', {});
await add('recap', {});
await add('recap', { night: night.nightId });
writeFileSync(new URL('../../src/routes/test-stats/fixture.json', import.meta.url), JSON.stringify(fixture));
console.log(`fixture: ${Object.keys(fixture).length} responses, ${fixture[analyticsUrl('overview', base)].overview.hands} hands for asha`);
await client.close();
await mongo.stop();
