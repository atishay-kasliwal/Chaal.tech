import test from 'node:test';
import assert from 'node:assert/strict';
import { teenPattiTable, dealTeenPatti } from './helpers/drivers.mjs';
import { seeded } from './helpers/table-sim.mjs';
import { adaptiveStyle, learnedMemory, T0, DAY } from './helpers/bot-memory.mjs';
import { MemoryProvider, decisionScope } from '../../server/bots/memory/provider.mjs';
import { adaptiveDecision, readLine } from '../../server/bots/memory/adaptive.mjs';
import { characterHash, configErrors } from '../../server/bots/config.mjs';
import { canonicalJson } from '../../server/analytics/hash.mjs';

const reading = (focus = 'bluffs', lineWeight = 0.15) => {
	const style = adaptiveStyle();
	style.memory = { ...style.memory, lineWeight, focus };
	style.configHash = characterHash(style);
	return style;
};
function live(memory, style) {
	const sim = teenPattiTable({ humans: ['a'] });
	sim.now = T0 + DAY;
	sim.act('a', 'addBot', { botId: 'bot-memorytest', name: 'Memory', level: 'normal', style });
	dealTeenPatti(sim);
	if (sim.room.currentPlayerId === 'a') sim.act('a', 'bet', { amount: sim.view('a').legalActions.maxBet });
	const view = sim.view('bot-memorytest');
	const spec = decisionScope(view, 'bot-memorytest', style.botId, sim.state, sim.now + 1);
	return { sim, view, spec, snapshot: new MemoryProvider(spec, memory).freeze() };
}

test('line-reading is configuration, validated like everything else, and absent means off', () => {
	assert.deepEqual(configErrors(reading()), []);
	for (const focus of ['balanced', 'bluffs', 'overbets', 'tilt', 'careful']) assert.deepEqual(configErrors(reading(focus)), []);
	assert.ok(configErrors(reading('mind-reading')).some((e) => /focus/.test(e)));
	assert.ok(configErrors(reading('bluffs', 0.9)).some((e) => /lineWeight/.test(e)));
	const plain = adaptiveStyle();
	assert.equal(plain.memory.lineWeight, undefined);
	assert.deepEqual(configErrors(plain), []);
});

test('a style without line-reading plays exactly as before, and with it a big push is taken more seriously', () => {
	const memory = learnedMemory({ hands: 200 });
	const live0 = live(memory, adaptiveStyle());
	const { snapshot } = live0;
	// The same table, but the other player has just put in 90 and looked at their cards.
	const view = structuredClone(live0.view);
	Object.assign(view.usersList.find((u) => u.id === 'a'), { handBet: 90, isBlind: false });
	const before = adaptiveDecision(view, 'bot-memorytest', seeded(7), adaptiveStyle(), snapshot);
	assert.equal(before.adaptive.lineRead, undefined);
	const style = reading();
	const read = adaptiveDecision(view, 'bot-memorytest', seeded(7), style, snapshot);
	assert.ok(read.adaptive.lineRead.threat > 0, 'a seen opponent who put in the maximum is a threat');
	assert.ok(read.adaptive.lineRead.adjust < 0 && read.adaptive.lineRead.adjust >= -0.15);
	let packsBase = 0;
	let packsRead = 0;
	for (let seed = 1; seed <= 200; seed++) {
		packsBase += adaptiveDecision(view, 'bot-memorytest', seeded(seed), adaptiveStyle(), snapshot).action === 'pack' ? 1 : 0;
		packsRead += adaptiveDecision(view, 'bot-memorytest', seeded(seed), style, snapshot).action === 'pack' ? 1 : 0;
	}
	assert.ok(packsRead >= packsBase, `reading the line never makes it fold less to a big push (${packsBase} → ${packsRead})`);
});

test('it reads only public betting: hidden opponent cards cannot change the decision or the reading', () => {
	const { sim, view, snapshot } = live(learnedMemory({ hands: 200 }), reading());
	const changed = structuredClone(sim.room);
	for (const p of changed.players) if (p.id !== 'bot-memorytest') p.cards = p.cards.map((_, i) => ({ rank: 2 + i, suit: 'clubs' }));
	const other = sim.view('bot-memorytest');
	void changed;
	for (let seed = 1; seed < 30; seed++) {
		const a = adaptiveDecision(view, 'bot-memorytest', seeded(seed), reading(), snapshot);
		const b = adaptiveDecision(other, 'bot-memorytest', seeded(seed), reading(), snapshot);
		assert.equal(canonicalJson(a), canonicalJson(b));
	}
});

test('without usable memory the reading is skipped and the base style plays; early history never shifts the habit', () => {
	const { view, spec } = live(learnedMemory({ hands: 200 }), reading());
	const none = new MemoryProvider(spec, null).freeze();
	const move = adaptiveDecision(view, 'bot-memorytest', seeded(3), reading(), none);
	assert.equal(move.adaptive.lineRead, undefined);
	// Habit needs 3 nights and 20 hands: a short history reads as neutral (habit 1).
	const short = live(learnedMemory({ hands: 12 }), reading());
	const line = readLine(short.view, 'bot-memorytest', short.snapshot, reading().memory);
	assert.equal(line.habit, 1);
});

import { exploitProfile } from '../../server/bots/exploit-sim.mjs';
import { CHARACTER_SEEDS } from '../../server/bots/characters.mjs';

test('blind match closes the "keep raising" exploit: staying blind against a blind raiser, on identical deals', () => {
	const style = CHARACTER_SEEDS.find((s) => s.bot._id === 'ms-dhoni').style;
	const base = exploitProfile(style.tendencies, { hands: 100, only: ['always-raise'] }).strategies['always-raise'];
	const matched = exploitProfile({ ...style.tendencies, blindMatch: 1 }, { hands: 100, only: ['always-raise'] }).strategies['always-raise'];
	assert.ok(base.low > 3, `the exploit is real without it (${base.perHand})`);
	assert.ok(matched.high < base.low, `and gone with it (${matched.perHand} against ${base.perHand})`);
	const withTrait = { ...style, tendencies: { ...style.tendencies, blindMatch: 1 } };
	withTrait.configHash = characterHash(withTrait);
	assert.deepEqual(configErrors(withTrait), []);
	const bad = { ...withTrait, tendencies: { ...withTrait.tendencies, blindMatch: 2 } };
	bad.configHash = characterHash(bad);
	assert.ok(configErrors(bad).some((e) => /blindMatch/.test(e)));
});

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { publishV3, FOCUS } from '../../server/bots/v3.mjs';

test('publishing version 3: a new immutable version per bot, with its reason, and a second run changes nothing', async () => {
	const mongo = await MongoMemoryServer.create();
	const client = new MongoClient(mongo.getUri());
	await client.connect();
	try {
		const db = client.db('v3');
		await seedCharacters(db);
		const owner = { _id: 'owner1', role: 'owner', status: 'active' };
		const before = await db.collection('bot_styles').find({}).toArray();
		const first = await publishV3(db, owner, { hands: 30 });
		assert.equal(first.length, 5);
		assert.ok(first.every((r) => r.styleId?.endsWith('@2') || r.held), JSON.stringify(first));
		for (const r of first.filter((x) => x.styleId)) {
			const style = await db.collection('bot_styles').findOne({ _id: r.styleId });
			assert.equal(style.status, 'published');
			assert.equal(style.tendencies.blindMatch, 1);
			assert.equal(style.memory.focus, FOCUS[style.botId]);
			assert.equal((await db.collection('bots').findOne({ _id: style.botId })).currentStyle, r.styleId);
			assert.ok((await db.collection('bot_evolution').findOne({ draftStyleId: r.styleId })).review.note.length > 20);
		}
		for (const old of before) assert.deepEqual(await db.collection('bot_styles').findOne({ _id: old._id }), old, 'earlier versions untouched');
		assert.ok((await publishV3(db, owner, { hands: 30 })).every((r) => r.skipped));
	} finally {
		await client.close();
		await mongo.stop();
	}
});
