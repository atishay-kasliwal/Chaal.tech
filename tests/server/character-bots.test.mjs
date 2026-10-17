import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import {
	migrateAnalytics,
	archiveRecorderRow,
	verifyStoredHands
} from '../../server/analytics/store.mjs';
import {
	adminBots,
	botDirectory,
	botSeat,
	manageBot,
	seedCharacters
} from '../../server/bots/directory.mjs';
import { CHARACTER_SEEDS } from '../../server/bots/characters.mjs';
import { characterHash, runtimeStyle } from '../../server/bots/config.mjs';
import { validateStyle } from '../../server/bots/validation.mjs';
import { identityForStyle, LEGACY_STYLES } from '../../server/bots/identity.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti } from './helpers/drivers.mjs';
import { seeded } from './helpers/table-sim.mjs';
import { projection } from '../../server/engine.mjs';
import { decide } from '../../server/bots/strategy.mjs';
import { listVariants } from '../../server/variants/index.mjs';

const mongo = await MongoMemoryServer.create();
const client = await new MongoClient(mongo.getUri()).connect();
test.after(async () => {
	await client.close();
	await mongo.stop();
});
let dbNumber = 0;
const owner = { _id: 'owner', role: 'owner', status: 'active', playerId: 'a' };
const member = { _id: 'friend', role: 'member', status: 'active', playerId: 'a' };
async function database() {
	const db = client.db(`characters-${++dbNumber}`);
	await migrateAnalytics(db);
	await seedCharacters(db);
	return db;
}
const config = () => structuredClone(CHARACTER_SEEDS[0].style);

test('seed is idempotent, preserves disabled characters, legacy IDs and exact hashes', async () => {
	const db = await database();
	await manageBot(db, owner, { action: 'status', botId: 'gg', status: 'disabled' });
	await seedCharacters(db);
	assert.equal(await db.collection('bots').countDocuments({}), 8);
	assert.equal(await db.collection('bot_styles').countDocuments({}), 8);
	assert.equal((await db.collection('bots').findOne({ _id: 'gg' })).status, 'disabled');
	for (const style of Object.values(LEGACY_STYLES)) {
		const stored = await db.collection('bot_styles').findOne({ _id: style._id });
		assert.equal(stored.configHash, style.configHash);
		assert.equal((await db.collection('bots').findOne({ _id: style.botId })).status, 'retired');
	}
});

test('normal users see character profiles and their own history, never unpublished config or traces', async () => {
	const db = await database();
	const data = await botDirectory(db, member);
	assert.equal(data.bots.length, 5);
	assert.ok(data.bots.every((b) => b.record === null && b.available && b.style.version === 1));
	assert.doesNotMatch(
		JSON.stringify(data),
		/tendencies|configHash|botTrace|preDeal|rngDraws|createdBy/
	);
	await assert.rejects(adminBots(db, member), /owners/);
	for (const action of [
		'create',
		'identity',
		'draft',
		'edit-style',
		'validate',
		'publish',
		'status',
		'availability'
	])
		await assert.rejects(manageBot(db, member, { action }), /owners/);
});

test('draft identity, validation, immutable publication and next version work end to end', async () => {
	const db = await database();
	const identity = {
		name: 'New friend',
		description: 'Patient.',
		personality: { title: 'Patient player', traits: ['calm'] },
		avatar: { mascotId: 'bot-ms-dhoni' }
	};
	await manageBot(db, owner, { action: 'create', botId: 'new-friend', identity });
	await assert.rejects(
		manageBot(db, owner, { action: 'create', botId: 'new-friend', identity }),
		/exists/
	);
	await manageBot(db, owner, {
		action: 'identity',
		botId: 'new-friend',
		identity: { ...identity, name: 'Good friend' }
	});
	await assert.rejects(
		manageBot(db, owner, { action: 'status', botId: 'new-friend', status: 'active' }),
		/Publish/
	);
	await manageBot(db, owner, { action: 'draft', botId: 'new-friend', config: config() });
	await assert.rejects(
		manageBot(db, owner, { action: 'publish', botId: 'new-friend', styleId: 'new-friend@1' }),
		/Validate/
	);
	await manageBot(db, owner, { action: 'validate', botId: 'new-friend', styleId: 'new-friend@1' });
	let style = await db.collection('bot_styles').findOne({ _id: 'new-friend@1' });
	assert.equal(style.validation.passed, true);
	// Editing invalidates validation, even when the owner supplied a previous report.
	await manageBot(db, owner, {
		action: 'edit-style',
		botId: 'new-friend',
		styleId: style._id,
		revision: style.revision,
		config: { ...config(), tendencies: { ...config().tendencies, blindRounds: 2 } }
	});
	await assert.rejects(
		manageBot(db, owner, { action: 'publish', botId: 'new-friend', styleId: style._id }),
		/Validate/
	);
	await assert.rejects(
		manageBot(db, owner, {
			action: 'edit-style',
			botId: 'new-friend',
			styleId: style._id,
			revision: 0,
			config: config()
		}),
		/changed/
	);
	await manageBot(db, owner, { action: 'validate', botId: 'new-friend', styleId: style._id });
	await manageBot(db, owner, { action: 'publish', botId: 'new-friend', styleId: style._id });
	await manageBot(db, owner, { action: 'status', botId: 'new-friend', status: 'active' });
	style = await db.collection('bot_styles').findOne({ _id: style._id });
	assert.equal(style.configHash, characterHash(style));
	for (const action of ['edit-style', 'validate'])
		await assert.rejects(
			manageBot(db, owner, { action, botId: 'new-friend', styleId: style._id, config: config() }),
			/immutable/
		);
	await assert.rejects(
		manageBot(db, owner, { action: 'identity', botId: 'new-friend', identity }),
		/draft/
	);
	await manageBot(db, owner, { action: 'draft', botId: 'new-friend', config: config() });
	assert.equal(
		(await db.collection('bot_styles').findOne({ _id: 'new-friend@2' })).parent,
		'new-friend@1'
	);
	await manageBot(db, owner, { action: 'publish', botId: 'new-friend', styleId: style._id });
	assert.deepEqual(await db.collection('bot_styles').findOne({ _id: style._id }), style);
});

test('availability, disable and retirement gate new seats without deleting histories', async () => {
	const db = await database();
	const sim = teenPattiTable({ humans: ['a'] });
	await manageBot(db, owner, { action: 'availability', botIds: ['gg'] });
	assert.deepEqual(
		(await botDirectory(db, member)).bots.map((b) => b.botId),
		['gg']
	);
	await assert.rejects(botSeat(db, sim.room, 'rohit-sharma'), /not available/);
	const seat = await botSeat(db, sim.room, 'gg');
	assert.equal(seat.style.botId, 'gg');
	await assert.rejects(botSeat(db, { ...sim.room, gameType: 'blackjack' }, 'gg'), /Teen Patti/);
	await manageBot(db, owner, { action: 'status', botId: 'gg', status: 'disabled' });
	await assert.rejects(botSeat(db, sim.room, 'gg'), /published style/);
	await manageBot(db, owner, { action: 'status', botId: 'gg', status: 'active' });
	await manageBot(db, owner, { action: 'status', botId: 'gg', status: 'retired' });
	assert.equal((await botDirectory(db, member, { id: 'gg' })).bot.status, 'retired');
	assert.equal((await botDirectory(db, member)).bots.length, 0);
	await assert.rejects(
		manageBot(db, owner, { action: 'status', botId: 'gg', status: 'active' }),
		/permanent/
	);
	assert.ok(await db.collection('bot_styles').findOne({ _id: 'gg@1' }));
	await manageBot(db, owner, { action: 'availability', botIds: [] });
	await assert.rejects(botSeat(db, sim.room), /not available/);
});

test('multiple characters, duplicate prevention, host permission and public seat projection', async () => {
	const db = await database();
	const sim = teenPattiTable({ humans: ['a', 'b'] });
	for (let i = 0; i < 3; i++)
		sim.act('a', 'addBot', {
			botId: `bot-character${i}`,
			...(await botSeat(db, sim.room, CHARACTER_SEEDS[i].bot._id))
		});
	await assert.rejects(botSeat(db, sim.room, 'rohit-sharma'), /already/);
	assert.throws(
		() =>
			sim.act('a', 'addBot', {
				botId: 'bot-duplicate',
				...CHARACTER_SEEDS[0].bot,
				name: 'Different',
				level: 'normal',
				style: { ...runtimeStyle(CHARACTER_SEEDS[0].style), status: 'published' }
			}),
		/already/
	);
	const seat = await botSeat(db, sim.room, 'gg');
	assert.throws(() => sim.act('b', 'addBot', { botId: 'bot-permission', ...seat }), /host/);
	const view = projection(sim.room, 'a', sim.connected);
	assert.equal(view.usersList.find((u) => u.bot)?.botId, 'rohit-sharma');
	assert.deepEqual(
		view.usersList.filter((u) => u.bot).map((u) => u.username),
		['Rohit Sharma', 'Virat Kohli', 'MS Dhoni']
	);
	assert.doesNotMatch(JSON.stringify(view), /tendencies|configHash|validation|tp-character/);
});

test('invalid configuration cannot publish; supported games, hashes, policy and ranges are checked', async () => {
	const db = await database();
	for (const change of [
		{ policy: 'future@9' },
		{ supportedGames: ['blackjack'] },
		{ supportedVariants: ['classic-1'] },
		{ tendencies: { ...config().tendencies, bluff: 1 } },
		{ tendencies: { ...config().tendencies, memory: 1 } },
		{ tendencies: { ...config().tendencies, constructor: 1 } },
		{ difficulty: { declared: 'magic' } }
	])
		await assert.rejects(
			manageBot(db, owner, { action: 'draft', botId: 'gg', config: { ...config(), ...change } })
		);
	const unknown = { ...config(), tendencies: { ...config().tendencies, constructor: 1 } };
	unknown.configHash = characterHash(unknown);
	assert.equal(validateStyle(unknown).passed, false);
	assert.equal(validateStyle({ ...config(), configHash: 'tampered' }).passed, false);
	assert.equal(validateStyle({ ...config(), _id: 'wrong' }).passed, false);
});

test('recorded character identities, style changes, canonical rivalry and sealed replay stay exact', async () => {
	const db = await database();
	const sim = teenPattiTable({ humans: ['a'] });
	const seat = await botSeat(db, sim.room, 'rohit-sharma');
	sim.act('a', 'addBot', { botId: 'bot-character-history', ...seat });
	dealTeenPatti(sim);
	playTeenPatti(sim);
	assert.deepEqual(sim.failures, []);
	assert.equal(sim.finished()[0].ok, true, JSON.stringify(sim.finished()[0]));
	const record = sim.finished()[0].records.public;
	assert.deepEqual(record.seats.find((s) => s.bot).bot, identityForStyle(seat.style));
	for (const row of sim.rows) await archiveRecorderRow(db, row.payload);
	const nights = await db.collection('night_events').find({}).toArray();
	const addEvent = nights.flatMap((night) => night.events).find((event) => event.a === 'addBot');
	assert.deepEqual(addEvent.identity, identityForStyle(seat.style));
	assert.deepEqual(addEvent.payload, {});
	assert.doesNotMatch(
		JSON.stringify(nights),
		/"tendencies"|"blindRounds"|"strongRaiseChance"|"style"|"validation"/
	);
	const frozen = await db.collection('bot_styles').findOne({ _id: 'rohit-sharma@1' });
	const next = config();
	next.tendencies.blindRounds = 1;
	await manageBot(db, owner, { action: 'draft', botId: 'rohit-sharma', config: next });
	await manageBot(db, owner, {
		action: 'validate',
		botId: 'rohit-sharma',
		styleId: 'rohit-sharma@2'
	});
	await manageBot(db, owner, {
		action: 'publish',
		botId: 'rohit-sharma',
		styleId: 'rohit-sharma@2'
	});
	assert.equal(
		(await botSeat(db, teenPattiTable({ humans: ['a'] }).room, 'rohit-sharma')).style.version,
		2
	);
	assert.equal(sim.room.players.find((p) => p.bot).bot.style.version, 1);
	assert.deepEqual(await db.collection('bot_styles').findOne({ _id: 'rohit-sharma@1' }), frozen);
	const report = await verifyStoredHands(db);
	assert.equal(report.reproduced + report.compatible, 1);
	assert.deepEqual(report.mismatched, []);
	const detail = (await botDirectory(db, member, { id: 'rohit-sharma' })).bot;
	assert.equal(detail.record.hands, 1);
	assert.equal(detail.style.version, 2);
	assert.equal(
		(await botDirectory(db, { ...member, playerId: 'other' }, { id: 'rohit-sharma' })).bot.record,
		null
	);
});

test('five styles have distinct measured action fingerprints and fair hidden-card invariance', () => {
	const fingerprints = CHARACTER_SEEDS.map((seed) => {
		const result = validateStyle(seed.style);
		assert.equal(result.passed, true, JSON.stringify(result.errors));
		assert.ok(result.simulation.decisions > 0);
		return JSON.stringify(result.simulation.actions);
	});
	assert.equal(new Set(fingerprints).size, 5);
});

test('each character finishes every supported variant fairly using only its own projection', () => {
	for (const variant of listVariants())
		for (let i = 0; i < CHARACTER_SEEDS.length; i++) {
			const seed = CHARACTER_SEEDS[i];
			const sim = teenPattiTable({
				humans: ['a'],
				rulesVersion: variant.rulesVersion,
				seed: 20 + i
			});
			sim.act('a', 'addBot', {
				botId: 'bot-fair-character',
				name: seed.bot.name,
				level: 'normal',
				style: { ...runtimeStyle(seed.style), status: 'published' }
			});
			dealTeenPatti(sim);
			playTeenPatti(sim, {
				beforeStep: (n) => {
					const room = sim.room;
					const bot = room.players.find((p) => p.bot);
					const changed = structuredClone(room);
					for (const p of changed.players.filter((p) => !p.bot))
						p.cards = p.cards.map((_, j) => ({ rank: 2 + j, suit: 'clubs' }));
					const first = decide(
						projection(room, bot.id, sim.connected),
						bot.id,
						seeded(n + 1),
						seed.style.tendencies
					);
					const second = decide(
						projection(changed, bot.id, sim.connected),
						bot.id,
						seeded(n + 1),
						seed.style.tendencies
					);
					assert.deepEqual(first, second, `${seed.bot._id}/${variant.rulesVersion}`);
				}
			});
			assert.equal(sim.playing(), false);
			assert.deepEqual(sim.failures, []);
			assert.ok(sim.finished().length);
			for (const finished of sim.finished())
				assert.equal(finished.ok, true, JSON.stringify(finished));
		}
});

test('publication retries repair the current pointer without mutating history or rolling it back', async () => {
	const db = await database();
	await manageBot(db, owner, { action: 'draft', botId: 'gg', config: config() });
	await manageBot(db, owner, { action: 'validate', botId: 'gg', styleId: 'gg@2' });
	await manageBot(db, owner, { action: 'publish', botId: 'gg', styleId: 'gg@2' });
	const published = await db.collection('bot_styles').findOne({ _id: 'gg@2' });
	// Model a connection failing after the immutable write but before the current pointer write.
	await db
		.collection('bots')
		.updateOne({ _id: 'gg' }, { $set: { currentStyle: 'gg@1', currentVersion: 1 } });
	await manageBot(db, owner, { action: 'publish', botId: 'gg', styleId: 'gg@2' });
	assert.equal((await db.collection('bots').findOne({ _id: 'gg' })).currentStyle, 'gg@2');
	await manageBot(db, owner, { action: 'publish', botId: 'gg', styleId: 'gg@1' });
	assert.equal((await db.collection('bots').findOne({ _id: 'gg' })).currentStyle, 'gg@2');
	assert.deepEqual(await db.collection('bot_styles').findOne({ _id: 'gg@2' }), published);
});

test('old automatic practice links choose an active unoccupied character and reject invalid IDs', async () => {
	const db = await database();
	const sim = teenPattiTable({ humans: ['a'] });
	await manageBot(db, owner, { action: 'status', botId: 'rohit-sharma', status: 'disabled' });
	const seat = await botSeat(db, sim.room);
	assert.equal(seat.style.botId, 'virat-kohli');
	sim.act('a', 'addBot', { botId: 'bot-auto-practice', ...seat });
	assert.equal((await botSeat(db, sim.room)).style.botId, 'ms-dhoni');
	await assert.rejects(botSeat(db, sim.room, { $ne: null }), /Choose/);
});

test('character addBot night_events store only identity and never any style tendency', async () => {
	const db = await database();
	const sim = teenPattiTable({ humans: ['a'] });
	const seat = await botSeat(db, sim.room, 'samay-raina');
	sim.act('a', 'addBot', { botId: 'bot-public-night', ...seat });
	for (const row of sim.rows) await archiveRecorderRow(db, row.payload);
	const rows = await db.collection('night_events').find({}).toArray();
	const add = rows.flatMap((night) => night.events).find((event) => event.a === 'addBot');
	assert.deepEqual(add.identity, identityForStyle(seat.style));
	assert.deepEqual(add.payload, {});
	const keys = new Set();
	function visit(value) {
		if (value && typeof value === 'object')
			for (const [key, item] of Object.entries(value)) {
				keys.add(key);
				visit(item);
			}
	}
	visit(rows);
	for (const tendency of Object.keys(seat.style.tendencies))
		assert.equal(keys.has(tendency), false, `Public night event contains ${tendency}`);
	for (const forbidden of ['style', 'tendencies', 'validation', 'rngDraws', 'botTrace'])
		assert.equal(keys.has(forbidden), false, forbidden);
});
