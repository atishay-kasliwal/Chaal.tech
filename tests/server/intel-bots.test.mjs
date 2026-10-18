import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { analyzeBots, humansAgainst, botResults, predictability, configDiff, lineage } from '../../server/bots/intel.mjs';
import { collectDecisions } from '../../server/analytics/compute/patterns.mjs';
import { exploitProfile, compareStyles, EXPLOITERS } from '../../server/bots/exploit-sim.mjs';
import { evolve, proposeChange, EVOLUTIONS } from '../../server/bots/evolution.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { CHARACTER_SEEDS } from '../../server/bots/characters.mjs';
import { PROFILES } from '../../server/bots/strategy.mjs';
import { hand, decide, T0 } from './helpers/records.mjs';
import { seeded, DAY, privacyViolations } from './helpers/intel.mjs';

/** Hands where `raju` faces a human raise and folds (or calls) with the given frequency. */
function foldingBot({ hands = 80, foldRate = 0.9, seed = 1, styleVersion = 1 }) {
	const rng = seeded(seed);
	return Array.from({ length: hands }, (_, i) => {
		const folds = rng() < foldRate;
		const r = hand({
			id: `f${i}`,
			at: T0 + Math.floor(i / 10) * DAY + (i % 10) * 60_000,
			night: `room:f${Math.floor(i / 10)}`,
			boot: 10,
			seats: [
				{ p: 'h1', net: folds ? 30 : -50 },
				{ p: 'bot-seat', bot: 'raju', net: folds ? -30 : 50, exit: folds ? 'fold' : 'won' }
			],
			events: [
				decide(0, 'h1', 'raise', { amount: 40, potBefore: 20 }),
				decide(1, 'bot-seat', folds ? 'fold' : 'call', { kind: 'bot', facing: 'raise', potBefore: 60, amount: folds ? undefined : 40 }),
				{ i: 2, t: 9000, p: 'system', a: 'result', kind: 'system' }
			]
		});
		r.seats[1].bot = { botId: 'raju', styleId: `raju@${styleVersion}`, styleVersion, configHash: 'abcd' };
		return r;
	});
}
const bot = { _id: 'raju', name: 'Raju', status: 'active', currentStyle: 'raju@1' };
const style = (version, tendencies = {}, extra = {}) => ({ _id: `raju@${version}`, botId: 'raju', version, status: 'published', policy: 'tp-character@1', tendencies: { call: 0.3, raise: 0.6, bluff: 0.05, randomness: 0.05, ...tendencies }, publishedAt: new Date(T0 + version * DAY), difficulty: { declared: 'balanced', measured: null }, ...extra });

test('bot analytics: usage, human results against it, and its own results use canonical definitions', () => {
	const records = foldingBot({ hands: 60, foldRate: 0.7 });
	const humans = humansAgainst(records, 'raju');
	const own = botResults(records, 'raju');
	assert.equal(humans.humanHands, 60);
	// The chips that moved between the two are the same chips, seen from each side.
	assert.ok(Math.abs(humans.perHand + own.perHand) < 0.01);
	const [analysis] = analyzeBots({ records, bots: [bot], styles: [style(1)], now: T0 + 30 * DAY });
	assert.equal(analysis.usage.hands, 60);
	assert.equal(analysis.performance.humansAgainst.humanHands, 60);
	assert.equal(analysis.versions[0].styleId, 'raju@1');
	assert.deepEqual(privacyViolations(analysis), []);
});

test('exploitability: a bot that folds to raises is flagged with evidence; a balanced one is not', () => {
	const folds = analyzeBots({ records: foldingBot({ hands: 120, foldRate: 0.92 }), bots: [bot], styles: [style(1)], now: T0 + 30 * DAY })[0];
	const f = folds.exploitability.find((x) => x.id === 'folds-too-often-to-raises');
	assert.ok(f, 'over-folding found');
	assert.ok(f.evidence.low > 0.62 && f.evidence.n >= 100);
	assert.ok(f.suggestion.strongRaiseChance < 0, 'a bounded, reviewable suggestion');
	const balanced = analyzeBots({ records: foldingBot({ hands: 120, foldRate: 0.35, seed: 4 }), bots: [bot], styles: [style(1)], now: T0 + 30 * DAY })[0];
	assert.equal(balanced.exploitability.find((x) => x.id === 'folds-too-often-to-raises'), undefined);
	const tiny = analyzeBots({ records: foldingBot({ hands: 12, foldRate: 1 }), bots: [bot], styles: [style(1)], now: T0 })[0];
	assert.deepEqual(tiny.exploitability, [], 'twelve hands never make a finding');
});

test('predictability is judged walk-forward: a robot is predictable, a coin flip is not', () => {
	const mk = (rule) => collectDecisions(foldingBot({ hands: 200, foldRate: 1 }).map((r, i) => ({ ...r, events: [decide(0, 'h1', 'raise', { amount: 40 }), decide(1, 'bot-seat', rule(i), { kind: 'bot', facing: 'raise', potBefore: 60 })] })), () => ['bot-seat']).decisions;
	const robot = predictability(mk(() => 'fold'));
	const rng = seeded(9);
	const coin = predictability(mk(() => (rng() < 0.5 ? 'fold' : 'call')));
	assert.ok(robot.accuracy >= 0.98);
	assert.ok(coin.accuracy < 0.65, `coin flip accuracy ${coin.accuracy}`);
	assert.equal(predictability(mk(() => 'fold').slice(0, 30)).status, 'insufficient');
});

test('bot lineage shows each version, what changed, the hands it played and why it was replaced', () => {
	const v1 = foldingBot({ hands: 50, foldRate: 0.9, styleVersion: 1 });
	const v2 = foldingBot({ hands: 50, foldRate: 0.5, seed: 8, styleVersion: 2 }).map((r) => ({ ...r, _id: `v2-${r._id}`, startedAt: r.startedAt + 40 * DAY, completedAt: r.completedAt + 40 * DAY }));
	const styles = [style(1), style(2, { strongRaiseChance: 0.5, call: 0.25 })];
	const evolutions = [{ botId: 'raju', draftStyleId: 'raju@2', finding: { title: 'Folds too often when raised' }, review: { note: 'Fewer raise wars it cannot finish.' } }];
	const rows = lineage({ bot: { ...bot, currentStyle: 'raju@2' }, styles, records: [...v1, ...v2], evolutions });
	assert.equal(rows.length, 2);
	assert.equal(rows[0].hands, 50);
	assert.equal(rows[1].current, true);
	assert.deepEqual(rows[1].changes.map((c) => c.key).sort(), ['tendencies.call', 'tendencies.strongRaiseChance']);
	assert.equal(rows[1].reason.note, 'Fewer raise wars it cannot finish.');
	assert.ok(rows[0].performance.humansAgainst.perHand > rows[1].performance.humansAgainst.perHand, 'the replacement gives players less');
	assert.deepEqual(configDiff(style(1), style(1)), []);
});

/* ---------------------------------------- simulation ---------------------------------------- */

test('exploit simulation is deterministic and compares styles on identical deals', () => {
	const a = exploitProfile(PROFILES.normal, { hands: 24, only: ['always-raise', 'tight-value'] });
	const b = exploitProfile(PROFILES.normal, { hands: 24, only: ['always-raise', 'tight-value'] });
	assert.deepEqual(a, b);
	assert.ok(Object.keys(EXPLOITERS).length >= 5);
	const same = compareStyles(PROFILES.normal, PROFILES.normal, { hands: 20, only: ['call-station'] });
	assert.equal(same.verdict, 'no-clear-difference');
	assert.ok(same.rows.every((r) => r.change === 0), 'a style is identical to itself on the same deals');
	assert.match(same.limitations, /Compare styles with each other/);
});

/* ---------------------------------------- the evolution workflow ---------------------------------------- */

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('bot-evolution');
test.after(async () => { await client.close(); await mongo.stop(); });

test('proposals are bounded: deltas clamp to the allowed ranges and an empty change is refused', () => {
	const base = style(1, { strongRaiseChance: 0.1, call: 0.3, raise: 0.6 });
	const out = proposeChange(base, { strongRaiseChance: -0.5, call: 0.5 });
	assert.equal(out.tendencies.strongRaiseChance, 0);
	assert.ok(out.tendencies.raise >= out.tendencies.call, 'raise never drops below call');
	assert.equal(proposeChange(base, { strongRaiseChance: 0 }), null);
	assert.equal(proposeChange(base, { notAThing: 1 }), null);
});

test('evolution: observe → propose → simulate → validate → review → publish, one owner step at a time, never editing a published style', async () => {
	await seedCharacters(db);
	const botDoc = await db.collection('bots').findOne({ _id: CHARACTER_SEEDS[0].bot._id });
	const botId = botDoc._id;
	const owner = { _id: 'owner1', role: 'owner', status: 'active' };
	const before = await db.collection('bot_styles').findOne({ _id: botDoc.currentStyle });
	const finding = { id: 'folds-too-often-to-raises', title: 'Folds too often when raised', evidence: { n: 100 }, why: 'x', suggestion: { strongRaiseChance: -0.2 } };
	const deps = { findings: async () => [finding], simulate: () => ({ hands: 20, rows: [], regressions: [], verdict: 'no-clear-difference' }) };
	await assert.rejects(evolve(db, { role: 'member' }, { action: 'observe', botId, findingId: finding.id }, deps), /Only owners/);
	const { id } = await evolve(db, owner, { action: 'observe', botId, findingId: finding.id }, deps);
	await assert.rejects(evolve(db, owner, { action: 'observe', botId, findingId: finding.id }, deps), /already has an open proposal/);
	await assert.rejects(evolve(db, owner, { action: 'publish', id }, deps), /must be approved first/, 'steps cannot be skipped');
	await evolve(db, owner, { action: 'propose', id }, deps);
	const proposed = await db.collection(EVOLUTIONS).findOne({ _id: id });
	assert.equal(proposed.status, 'proposed');
	assert.notEqual(proposed.draftStyleId, before._id);
	assert.equal((await db.collection('bot_styles').findOne({ _id: proposed.draftStyleId })).status, 'draft');
	await evolve(db, owner, { action: 'simulate', id }, deps);
	await evolve(db, owner, { action: 'validate', id }, deps);
	await assert.rejects(evolve(db, owner, { action: 'review', id, decision: 'approve', note: '' }, deps), /Say why/);
	await evolve(db, owner, { action: 'review', id, decision: 'approve', note: 'Fewer raise wars it cannot finish.' }, deps);
	assert.equal((await db.collection('bots').findOne({ _id: botId })).currentStyle, before._id, 'nothing is live until publish');
	await evolve(db, owner, { action: 'publish', id }, deps);
	const after = await db.collection(EVOLUTIONS).findOne({ _id: id });
	assert.equal(after.status, 'published');
	assert.deepEqual(after.history.map((h) => h.status), ['observed', 'proposed', 'simulated', 'validated', 'approved', 'published']);
	const bot2 = await db.collection('bots').findOne({ _id: botId });
	assert.equal(bot2.currentStyle, proposed.draftStyleId, 'the new version is current');
	assert.deepEqual(await db.collection('bot_styles').findOne({ _id: before._id }), before, 'the old published version is untouched');
	assert.equal(bot2.name, botDoc.name, 'identity does not change');
});

test('a regression found in simulation must be acknowledged; a rejected proposal publishes nothing', async () => {
	const botId = CHARACTER_SEEDS[1].bot._id;
	const owner = { _id: 'owner1', role: 'owner', status: 'active' };
	const current = (await db.collection('bots').findOne({ _id: botId })).currentStyle;
	const finding = { id: 'too-predictable', title: 'Its next action is easy to guess', evidence: {}, why: 'x', suggestion: { randomness: 0.05 } };
	const deps = { findings: async () => [finding], simulate: () => ({ hands: 20, rows: [], regressions: ['always-raise'], verdict: 'candidate-more-exploitable-in-some-strategies' }) };
	const { id } = await evolve(db, owner, { action: 'observe', botId, findingId: finding.id }, deps);
	for (const action of ['propose', 'simulate', 'validate']) await evolve(db, owner, { action, id }, deps);
	await assert.rejects(evolve(db, owner, { action: 'review', id, decision: 'approve', note: 'Try it anyway.' }, deps), /easier to exploit/);
	await evolve(db, owner, { action: 'review', id, decision: 'reject', note: 'Worse in simulation.' }, deps);
	await assert.rejects(evolve(db, owner, { action: 'publish', id }, deps), /must be approved/);
	assert.equal((await db.collection('bots').findOne({ _id: botId })).currentStyle, current);
});
