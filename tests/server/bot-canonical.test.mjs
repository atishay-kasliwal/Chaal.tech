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
	PHASE4_CHAMPIONS,
	GG_C034,
	MS_DHONI_C1,
	CHARACTER_STYLES_V3,
	STYLES
} from '../../server/bots/dna-styles.mjs';
import { DHONI41_CHALLENGERS } from '../../server/sim/challengers.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { runTable } from '../../server/sim/table.mjs';
import { createHash } from 'node:crypto';
import { member } from '../../server/sim/population.mjs';
import { DNA_POLICIES, FORMER_NAMES } from '../../server/bots/dna-policies.mjs';
import { canonicalJson } from '../../server/analytics/hash.mjs';

/* The canonical characters (docs/archive/bots/CANONICAL.md): Phase 2 for Rohit, Virat and Samay, Phase 3
 * c034 for GG, Phase 4.1 C1 for Dhoni. */

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

test('Dhoni is exactly the Phase 4.1 C1 the gates measured: configuration, hash and every decision', () => {
	const c1 = DHONI41_CHALLENGERS[0];
	assert.equal(c1.id, 'ms-dhoni@8-blindraises');
	assert.equal(MS_DHONI_C1.phase41.candidate, c1.id);
	assert.equal(MS_DHONI_C1.policy, c1.style.policy);
	assert.equal(MS_DHONI_C1.policy, 'tp-dna@8');
	assert.equal(canonicalJson(MS_DHONI_C1.tendencies), canonicalJson(c1.style.tendencies));
	assert.deepEqual(MS_DHONI_C1.supportedGames, c1.style.supportedGames);
	assert.equal(MS_DHONI_C1.configHash, c1.style.configHash);
	assert.equal(MS_DHONI_C1.configHash, '04254a1a0abbb72a');
	// Only the policy differs from the Phase 2 Dhoni it descends from.
	assert.equal(MS_DHONI_C1.parent, 'ms-dhoni@3');
	assert.equal(
		canonicalJson(MS_DHONI_C1.tendencies),
		canonicalJson(CHARACTER_STYLES_V3['ms-dhoni'].tendencies)
	);
	assert.ok(Object.isFrozen(MS_DHONI_C1));
	// Same decisions, traces, random draws and minds as the measured challenger, against the exploit
	// it fixes, the strategy that broke the first fix, and a mixed field.
	const play = (style) => {
		const out = [];
		for (const [x, field] of [
			['always-raise', null],
			['value-then-bluff', null],
			['mixed', ['gg@4', 'legacy-hard', 'samay-raina@3', 'virat-kohli@3']]
		])
			for (let t = 0; t < 3; t++) {
				const seats = [
					{ id: 'hero', style },
					...(field ??
						[1, 2, 3, 4].map((i) => ({ id: `a${i}`, adversary: EXPLOITS[x].g, target: 0 })))
				];
				const hands = runTable({
					seed: 48,
					table: 800 + t,
					seats,
					hands: 60,
					traces: true,
					matched: true
				});
				out.push(
					hands.map((h) => [
						h.decisions.map((d) => [d.seat, d.name, d.reason, d.draws, d.move?.trace ?? null]),
						h.minds ?? null,
						h.seats.map((s) => s.net)
					])
				);
			}
		return createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 16);
	};
	assert.equal(play(MS_DHONI_C1), play(c1.style));
	assert.notEqual(play(MS_DHONI_C1), play(CHARACTER_STYLES_V3['ms-dhoni']), 'C1 is not Dhoni@3');
});

test('the Phase 4 champions stay frozen for reproducing Phase 3.1, 4 and 4.1', () => {
	for (const id of ['rohit-sharma', 'virat-kohli', 'samay-raina', 'ms-dhoni'])
		assert.equal(PHASE4_CHAMPIONS[id], CHARACTER_STYLES_V3[id]);
	assert.equal(PHASE4_CHAMPIONS.gg, GG_C034);
	assert.equal(DHONI41_CHALLENGERS[0].champion, 'ms-dhoni@3');
	assert.ok(!DNA_POLICIES.has('tp-dna@9'), 'C2 stays offline');
});

test('the canonical lineup: Rohit, Virat, Samay on Phase 2, GG on c034, Dhoni on Phase 4.1 C1; none of the rejected candidates', () => {
	assert.deepEqual(Object.keys(CANONICAL_STYLES).sort(), [
		'gg',
		'ms-dhoni',
		'rohit-sharma',
		'samay-raina',
		'virat-kohli'
	]);
	for (const id of ['rohit-sharma', 'virat-kohli', 'samay-raina']) {
		assert.equal(CANONICAL_STYLES[id], CHARACTER_STYLES_V3[id]);
		assert.equal(CANONICAL_STYLES[id].policy, 'tp-dna@3');
	}
	assert.equal(CANONICAL_STYLES.gg, GG_C034);
	assert.equal(GG_C034.policy, 'tp-dna@4');
	assert.equal(CANONICAL_STYLES['ms-dhoni'], MS_DHONI_C1);
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
