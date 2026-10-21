import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { newRoom, transition } from '../../server/engine.mjs';
import { seedCharacters, botSeat } from '../../server/bots/directory.mjs';
import { publishV3 } from '../../server/bots/v3.mjs';
import { publishDna, CANONICAL_COPY } from '../../server/bots/publish-dna.mjs';
import { configErrors, characterHash } from '../../server/bots/config.mjs';
import { validateStyle } from '../../server/bots/validation.mjs';
import { styleConfigHash } from '../../server/bots/identity.mjs';
import {
	CANONICAL_STYLES,
	GG_C034,
	CHARACTER_STYLES_V3,
	STYLES
} from '../../server/bots/dna-styles.mjs';
import { member } from '../../server/sim/population.mjs';
import { DNA_POLICIES, FORMER_NAMES } from '../../server/bots/dna-policies.mjs';
import { canonicalJson } from '../../server/analytics/hash.mjs';

/* The canonical characters (docs/bots/CANONICAL.md): Phase 2 for four, Phase 3 c034 for GG. */

const league = JSON.parse(
	readFileSync(new URL('../../docs/bots/phase3/league-41.json', import.meta.url), 'utf8')
);
const finals = JSON.parse(
	readFileSync(new URL('../../docs/bots/phase3/finals-51.json', import.meta.url), 'utf8')
);

test('GG is exactly the c034 measured in PHASE3_REPORT.md: the league record, the finals and the measured hash', () => {
	const record = league.candidates['gg@4-c034'];
	assert.equal(league.final.gg.chosen, 'gg@4-c034');
	assert.deepEqual(GG_C034.tendencies.dna, record.genome.dna);
	assert.deepEqual(GG_C034.tendencies.quirks, record.genome.quirks);
	assert.deepEqual(GG_C034.tendencies, finals.gg);
	assert.equal(GG_C034.phase3.formerHash, record.configHash);
	assert.equal(
		styleConfigHash({
			policy: FORMER_NAMES[GG_C034.policy],
			tendencies: GG_C034.tendencies,
			supportedGames: GG_C034.supportedGames
		}),
		record.configHash,
		'the configuration measured under the former policy name'
	);
	assert.equal(record.parent, 'gg@4-c007×gg@4-c008');
	assert.equal(record.ancestor, 'gg@3');
	assert.ok(Object.isFrozen(GG_C034));
});

test('the canonical lineup: Rohit, Virat, Samay and Dhoni on Phase 2, GG on c034; none of the rejected candidates', () => {
	assert.deepEqual(Object.keys(CANONICAL_STYLES).sort(), [
		'gg',
		'ms-dhoni',
		'rohit-sharma',
		'samay-raina',
		'virat-kohli'
	]);
	for (const id of ['rohit-sharma', 'virat-kohli', 'samay-raina', 'ms-dhoni']) {
		assert.equal(CANONICAL_STYLES[id], CHARACTER_STYLES_V3[id]);
		assert.equal(CANONICAL_STYLES[id].policy, 'tp-dna@3');
	}
	assert.equal(CANONICAL_STYLES.gg, GG_C034);
	assert.equal(GG_C034.policy, 'tp-dna@4');
	const rejected = [
		'rohit-sharma@4-c026',
		'virat-kohli@4-c024',
		'samay-raina@4-c008',
		'ms-dhoni@4-c039'
	];
	for (const style of Object.values(CANONICAL_STYLES)) {
		for (const id of rejected)
			assert.notEqual(
				canonicalJson(style.tendencies.dna),
				canonicalJson(league.candidates[id].genome.dna),
				id
			);
		assert.ok(DNA_POLICIES.has(style.policy));
		assert.deepEqual(configErrors(style), []);
		const report = validateStyle(style, { hands: 6 });
		assert.ok(report.passed && report.invariance, `${style._id}: ${report.errors.join('; ')}`);
	}
});

test('every canonical reference is in the catalogue and seats in the simulator', () => {
	for (const ref of Object.values(CANONICAL_STYLES)) {
		assert.equal(STYLES[ref._id], ref, ref._id);
		const m = member(ref._id);
		assert.deepEqual(m.seat({}, 'bot-x').style, ref);
	}
});

test('publishing: each bot gets the next immutable version, exactly the reference; earlier versions untouched; idempotent', async () => {
	const mongo = await MongoMemoryServer.create();
	const client = new MongoClient(mongo.getUri());
	await client.connect();
	try {
		const db = client.db('dna');
		await seedCharacters(db);
		const owner = { _id: 'owner1', role: 'owner', status: 'active' };
		await publishV3(db, owner, { hands: 20 }); // production's history before the DNA line
		const before = await db.collection('bot_styles').find({}).toArray();
		const plan = await publishDna(db, owner);
		assert.equal(plan.length, 5);
		assert.ok(
			plan.every((r) => r.plan),
			JSON.stringify(plan)
		);
		assert.deepEqual(
			await db.collection('bot_styles').find({}).toArray(),
			before,
			'a plan writes nothing'
		);
		const done = await publishDna(db, owner, { publish: true });
		for (const r of done) {
			const ref = CANONICAL_STYLES[r.botId];
			const style = await db.collection('bot_styles').findOne({ _id: r.styleId });
			const bot = await db.collection('bots').findOne({ _id: r.botId });
			assert.equal(style.status, 'published');
			assert.equal(bot.currentStyle, r.styleId);
			assert.equal(style.policy, ref.policy);
			assert.equal(canonicalJson(style.tendencies), canonicalJson(ref.tendencies));
			assert.equal(style.configHash, characterHash(style));
			assert.equal(style.parent, r.previous);
			assert.ok(style.validation.passed);
		}
		for (const old of before)
			assert.deepEqual(
				await db.collection('bot_styles').findOne({ _id: old._id }),
				old,
				'earlier versions untouched'
			);
		assert.ok(
			(await publishDna(db, owner, { publish: true })).every((r) => r.skipped),
			'a second run changes nothing'
		);
		// New copy only on request, with the old text kept.
		const rohitBefore = await db.collection('bots').findOne({ _id: 'rohit-sharma' });
		await publishDna(db, owner, { publish: true, descriptions: true, now: 5 });
		const rohit = await db.collection('bots').findOne({ _id: 'rohit-sharma' });
		assert.equal(rohit.personality.title, CANONICAL_COPY['rohit-sharma'].title);
		assert.equal(rohit.name, rohitBefore.name);
		assert.deepEqual(rohit.avatar, rohitBefore.avatar);
		assert.equal(rohit.identityHistory.at(-1).previous.description, rohitBefore.description);
		for (const c of Object.values(CANONICAL_COPY))
			assert.ok(!/[\u2013\u2014]/.test(c.description + c.title), 'no dashes in player copy');
		// A live room seats the published DNA style through the directory, as the Worker does.
		let room = newRoom('dna-live', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
		room = transition(room, 'host', 'join', { username: 'Host' });
		const seat = await botSeat(db, room, 'gg');
		assert.equal(seat.style.policy, 'tp-dna@4');
		assert.equal(canonicalJson(seat.style.tendencies), canonicalJson(GG_C034.tendencies));
		room = transition(room, 'host', 'addBot', {
			botId: 'bot-live-gg',
			name: seat.name,
			level: seat.level,
			characterId: seat.characterId,
			mascotId: seat.mascotId,
			style: seat.style
		});
		assert.equal(room.players.find((p) => p.id === 'bot-live-gg').bot.style.policy, 'tp-dna@4');
	} finally {
		await client.close();
		await mongo.stop();
	}
});
