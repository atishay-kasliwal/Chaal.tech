import test from 'node:test';
import assert from 'node:assert/strict';
import { METRICS } from '../../server/analytics/intel/definitions.mjs';
import { acceptable, summarise, summaryInput, templateSummary } from '../../server/analytics/intel/ai.mjs';
import { inLiveHand } from '../../server/analytics/intel/api.mjs';
import { privacyViolations } from './helpers/intel.mjs';

test('every metric names a real function, so surfaces cannot quietly drift to their own definition', async () => {
	assert.equal(new Set(METRICS.map((m) => m.id)).size, METRICS.length, 'ids are unique');
	for (const m of METRICS) {
		const mod = await import(`../../server/analytics/${m.module}`);
		assert.equal(typeof mod[m.fn], 'function', `${m.id}: ${m.module}#${m.fn}`);
		assert.ok(m.meaning.length > 20);
	}
});

const recap = { minutes: 95, hands: 40, you: { hands: 40, units: 12.5 }, highlights: [{ scope: 'social', text: 'Biggest pot of the night: 40 boots.', evidence: { hands: ['secret-hand-id'] }, why: { confidence: 1 } }, { scope: 'personal', text: 'A comeback: you were 8 boots down and finished +12.5 boots.' }], dealt: [{ rank: 14 }], seal: 'x' };

test('the optional AI door only ever receives text the viewer could already read', async () => {
	const input = summaryInput(recap);
	assert.deepEqual(Object.keys(input).sort(), ['facts', 'hands', 'kind', 'minutes', 'you']);
	assert.deepEqual(privacyViolations(input), []);
	assert.doesNotMatch(JSON.stringify(input), /secret-hand-id|dealt|seal|why/);
	let seen;
	const out = await summarise(recap, { summarise: async (i) => ((seen = i), 'A big night: the biggest pot reached 40 boots and you finished +12.5 boots.') });
	assert.equal(out.source, 'model');
	assert.deepEqual(seen, input);
});

test('a model that invents a number, runs long, errors or is absent falls back to the template', async () => {
	const input = summaryInput(recap);
	assert.equal(acceptable('You won 99 boots.', input), false, 'a number that was not in the input');
	assert.equal(acceptable('x'.repeat(700), input), false);
	assert.equal(acceptable('Nice — night', input), false, 'no em dashes');
	assert.equal((await summarise(recap, { summarise: async () => 'You won 99 boots.' })).source, 'template');
	assert.equal((await summarise(recap, { summarise: async () => { throw new Error('down'); } })).source, 'template');
	const none = await summarise(recap, null);
	assert.equal(none.source, 'template');
	assert.equal(none.text, templateSummary(input));
});

test('live-hand check is exact: only a connected member at a started table', () => {
	const tables = [{ isStarted: true, connectedMembers: ['m1'] }, { isStarted: false, connectedMembers: ['m2'] }];
	assert.equal(inLiveHand(tables, 'm1'), true);
	assert.equal(inLiveHand(tables, 'm2'), false, 'an idle table is not a live hand');
	assert.equal(inLiveHand(tables, 'm3'), false);
	assert.equal(inLiveHand(undefined, 'm1'), false);
});
