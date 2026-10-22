import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runTable } from '../../server/sim/table.mjs';
import {
	candidateStyle,
	ancestorGenome,
	phase31Genome,
	EVENT_QUIRKS
} from '../../server/sim/candidates.mjs';
import { CHARACTER_POLICY_V4 } from '../../server/bots/character-v4.mjs';
import { CHARACTER_POLICY_V5, recallEvents } from '../../server/bots/character-v5.mjs';
import { QUIRKS_V5 } from '../../server/bots/quirks.mjs';
import { emptyMind } from '../../server/bots/mind.mjs';
import { POLICIES, MIND_RULES } from '../../server/bots/policies.mjs';
import { STYLES, CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';

/* Phase 3.1: tp-dna@5 (recent-event recall and event quirks), mind@3, and the new search gates. */

const digest = (hands) =>
	createHash('sha256')
		.update(
			JSON.stringify(hands.map((h) => h.decisions.map((d) => [d.seat, d.name, d.reason, d.draws])))
		)
		.digest('hex');
const seated = (policy, character = 'ms-dhoni', genome = ancestorGenome(character)) => ({
	id: `${character}-${policy}`,
	style: candidateStyle(character, genome, {
		id: `${character}@x`,
		parent: `${character}@3`,
		generation: 0,
		policy
	})
});

test('tp-dna@5 without event quirks decides exactly as tp-dna@4', () => {
	for (const character of ['ms-dhoni', 'rohit-sharma', 'samay-raina'])
		for (const table of [1, 2]) {
			const field = ['legacy-hard', 'human-maniac', 'human-station', 'legacy-normal'];
			const play = (policy) =>
				digest(
					runTable({
						seed: 31,
						table,
						seats: [seated(policy, character), ...field],
						hands: 60,
						matched: true
					})
				);
			assert.equal(
				play(CHARACTER_POLICY_V5),
				play(CHARACTER_POLICY_V4),
				`${character} table ${table}`
			);
		}
});

test('tp-dna@5 is offline only: registered, keeps a mind@3, and no published or canonical style uses it', () => {
	assert.ok(POLICIES[CHARACTER_POLICY_V5]);
	assert.equal(MIND_RULES[CHARACTER_POLICY_V5], 3);
	assert.ok(!Object.values(STYLES).some((s) => s.policy === CHARACTER_POLICY_V5));
	assert.ok(!Object.values(CANONICAL_STYLES).some((s) => s.policy === CHARACTER_POLICY_V5));
	assert.deepEqual(
		phase31Genome('samay-raina').quirks.map((q) => q.id),
		['bluffCatcher', ...EVENT_QUIRKS['samay-raina'].map((q) => q.id)]
	);
	assert.deepEqual(
		phase31Genome('ms-dhoni'),
		ancestorGenome('ms-dhoni'),
		'only Samay gets event quirks'
	);
});

test('mind@3 stamps each cue with its hand; mind@2 does not', () => {
	const hands = runTable({
		seed: 5,
		table: 3,
		seats: [
			seated(CHARACTER_POLICY_V5, 'samay-raina', phase31Genome('samay-raina')),
			seated(CHARACTER_POLICY_V4, 'ms-dhoni'),
			'legacy-hard',
			'human-bluffer',
			'human-maniac'
		],
		hands: 40,
		traces: true,
		matched: true
	});
	const minds = Object.values(hands.at(-1).minds);
	const v3 = minds.find((m) => m.v === 'mind@3');
	const v2 = minds.find((m) => m.v === 'mind@2');
	assert.ok(v3.cues.length && v3.cues.every((c) => Number.isInteger(c.n) && c.n <= v3.hands));
	assert.ok(v2.cues.every((c) => c.n === undefined));
});

test('recent events fade over four hands, and a losing run counts at half weight', () => {
	const mind = {
		...emptyMind(3),
		hands: 10,
		cues: [
			{ cue: 'BIG_LOSS', n: 9 },
			{ cue: 'CAUGHT_THEIR_BLUFF', n: 7 }
		]
	};
	assert.deepEqual(recallEvents(null, mind).events, { bigLoss: 1, caughtBluff: 0.5 });
	assert.deepEqual(recallEvents(null, { ...mind, hands: 14 }).events, {
		bigLoss: 0,
		caughtBluff: 0
	});
	const run = { ...emptyMind(3), self: { ...emptyMind(3).self, streak: -3 } };
	assert.equal(recallEvents(null, run).events.bigLoss, 0.5);
});

test('event quirks act only in their moment: seen, under pressure, after the event', () => {
	const seen = { seen: true };
	const stub = QUIRKS_V5.stubbornStreak,
		on = QUIRKS_V5.onToYou;
	assert.equal(
		stub.apply({ seen: false }, 1, null, { events: { bigLoss: 1 }, pressure: 2 }),
		null,
		'blind'
	);
	assert.equal(
		stub.apply(seen, 1, null, { events: { bigLoss: 0 }, pressure: 2 }),
		null,
		'no event'
	);
	assert.equal(
		stub.apply(seen, 1, null, { events: { bigLoss: 1 }, pressure: 0, facing: null }),
		null,
		'no pressure'
	);
	const s = stub.apply(seen, 1, null, { events: { bigLoss: 1 }, pressure: 1 });
	assert.ok(s.chaal > 0 && s.pack < 0);
	assert.equal(
		on.apply(seen, 1, null, { events: { caughtBluff: 1 }, facing: null }),
		null,
		'not facing a raise'
	);
	const o = on.apply(seen, 1, null, { events: { caughtBluff: 0.5 }, facing: { id: 'x' } });
	assert.ok(o.chaal > 0 && o.pack < 0);
});
