import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';
import { configErrors } from '../../server/bots/config.mjs';
import { draftErrors, draftStyle, boundsFor, LIMITS } from '../../scripts/tuning/bounds.mjs';
import { buildTuningGraph } from '../../scripts/tuning/graph.mjs';
import { parseArgs, runIdFor, runTuning } from '../../scripts/tuning/run.mjs';
import { mockProposer } from '../../scripts/tuning/proposers.mjs';

/* The offline tuning loop (docs/bots/TUNING_LOOP.md). */

const GG = CANONICAL_STYLES.gg;
const ok = (id, value = 0.45) => ({
	id,
	rationale: 'A small step in aggression for the test.',
	weakness: null,
	dna: [{ gene: 'aggression', value }],
	quirks: [],
	exploitTarget: null
});

test('validation: a small in-bounds draft passes and becomes a valid plain style config', () => {
	const draft = ok('t1');
	assert.deepEqual(draftErrors('gg', GG, draft), []);
	const style = draftStyle('gg', GG, draft);
	assert.deepEqual(configErrors(style), []);
	assert.equal(style._id, 'gg@5');
	assert.equal(style.parent, 'gg@4');
	assert.equal(style.policy, GG.policy);
	assert.equal(style.tendencies.dna.aggression, 0.45);
	assert.deepEqual(style.tendencies.tempo, GG.tendencies.tempo);
	assert.notEqual(style.configHash, GG.configHash);
	// The canonical config itself is untouched.
	assert.equal(GG.tendencies.dna.aggression, 0.42);
});

test('validation: out-of-bounds and malformed drafts are rejected with reasons', () => {
	const b = boundsFor('gg', GG);
	const reasons = (d) => draftErrors('gg', GG, d);
	const has = (d, re) =>
		assert.ok(
			reasons(d).some((r) => re.test(r)),
			JSON.stringify(reasons(d))
		);
	// Step too large, and outside GG's identity region (aggression 0.3-0.55).
	has(ok('t2', 0.77), /aggression = 0\.77 is out of bounds/);
	has(ok('t3', GG.tendencies.dna.aggression + LIMITS.maxGeneStep + 0.02), /out of bounds/);
	assert.equal(b.genes.aggression.max <= 0.55, true);
	has({ ...ok('t4'), dna: [{ gene: 'courage', value: 0.5 }] }, /Unknown gene: courage/);
	has({ ...ok('t5'), dna: [{ gene: 'aggression', value: 1.4 }] }, /out of bounds/);
	has({ ...ok('t6'), dna: [{ gene: 'aggression', value: 'high' }] }, /must be a number/);
	has({ ...ok('t7'), quirks: [{ id: 'blindPride', strength: 0.5 }] }, /Unknown quirk: blindPride/);
	has(
		{ ...ok('t8'), quirks: [{ id: 'survivalMode', strength: 1.2 }] },
		/quirk survivalMode = 1\.2 is out of bounds/
	);
	has({ ...ok('t9'), policy: 'tp-dna@9' }, /Unknown draft field: policy/);
	has({ ...ok('t10'), tempo: { thinkMs: [500, 600] } }, /Unknown draft field: tempo/);
	has({ ...ok('t11'), dna: [] }, /changes nothing/);
	has(ok('t12', GG.tendencies.dna.aggression), /no change from canonical/);
	has({ ...ok('t13'), rationale: 'why' }, /rationale/);
	has({ ...ok('T 14') }, /id must be/);
	has({ ...ok('t15'), exploitTarget: 'always-win' }, /exploitTarget/);
	has(
		{
			...ok('t16'),
			dna: ['aggression', 'patience', 'discipline', 'curiosity', 'riskTolerance'].map((gene) => ({
				gene,
				value: Math.round((GG.tendencies.dna[gene] + 0.02) * 1000) / 1000
			}))
		},
		/at most 4/
	);
	has(
		{
			...ok('t17'),
			dna: [
				{ gene: 'aggression', value: 0.45 },
				{ gene: 'aggression', value: 0.46 }
			]
		},
		/listed twice/
	);
	// A duplicate of an already accepted configuration.
	const seen = new Set([draftStyle('gg', GG, ok('t18')).configHash]);
	assert.ok(draftErrors('gg', GG, ok('t19'), { seen }).some((r) => /Same configuration/.test(r)));
});

/* ---------------------------------------- graph wiring ---------------------------------------- */

function stubs(proposals) {
	const calls = { propose: [], candidates: [] };
	let round = 0;
	return {
		calls,
		deps: {
			proposer: {
				async propose(input) {
					calls.propose.push(input);
					return { drafts: proposals(++round, input), usage: null };
				}
			},
			baseline: async () => ({
				measured: { hands: 0 },
				champion: { key: 'gg@4' },
				otherKeys: [],
				others: {}
			}),
			candidates: async (character, list) => {
				calls.candidates.push(list.map((c) => c.key));
				return { stats: Object.fromEntries(list.map((c) => [c.key, {}])) };
			},
			gate: (character, baseline, list) => ({
				canonical: {
					bands: { results: [] },
					identity: { perClass: 0.5, accuracy: 0.9 },
					x: {}
				},
				candidates: list.map((c) => ({ key: c.key, draft: c.draft, pass: true, gates: {} }))
			}),
			review: async (s) => ({ accepted: s.accepted.length, rejected: s.rejected.length })
		}
	};
}

const options = (extra = {}) => ({
	character: 'gg',
	budget: {},
	drafts: 2,
	maxRounds: 3,
	...extra
});

test('graph: nodes run in order, and invalid drafts loop back to propose with the reasons', async () => {
	const { deps, calls } = stubs((round) =>
		round === 1 ? [ok('a1'), ok('bad', 0.9)] : [ok('b1', 0.39)]
	);
	const graph = buildTuningGraph(deps);
	const s = await graph.invoke({ options: options() }, { recursionLimit: 20 });
	assert.deepEqual(s.trace, [
		'load_context',
		'measure_baseline',
		'propose',
		'validate',
		'propose',
		'validate',
		'simulate',
		'gate',
		'review'
	]);
	assert.equal(s.round, 2);
	// The second round asks only for what is missing, with the feedback on the rejected draft.
	assert.equal(calls.propose[1].want, 1);
	assert.equal(calls.propose[1].feedback.length, 1);
	assert.equal(calls.propose[1].feedback[0].draft.id, 'bad');
	assert.match(calls.propose[1].feedback[0].reasons.join(' '), /out of bounds/);
	assert.deepEqual(
		calls.propose[1].accepted.map((d) => d.id),
		['a1']
	);
	assert.deepEqual(calls.candidates, [['gg@tune-a1', 'gg@tune-b1']]);
	assert.deepEqual(s.output, { accepted: 2, rejected: 1 });
});

test('graph: stops after max rounds; with no valid draft it goes straight to review', async () => {
	const { deps, calls } = stubs(() => [ok('x', 0.99)]);
	const s = await buildTuningGraph(deps).invoke(
		{ options: options({ maxRounds: 2 }) },
		{ recursionLimit: 20 }
	);
	assert.deepEqual(s.trace, [
		'load_context',
		'measure_baseline',
		'propose',
		'validate',
		'propose',
		'validate',
		'review'
	]);
	assert.equal(calls.propose.length, 2);
	assert.equal(calls.candidates.length, 0);
	assert.equal(s.accepted.length, 0);
	assert.equal(s.rejected.length, 2);
});

test('graph: some valid drafts at max rounds are simulated anyway', async () => {
	const { deps, calls } = stubs((round) =>
		round === 1 ? [ok('v1'), ok('bad', 0.9)] : [ok('bad2', 0.9)]
	);
	const s = await buildTuningGraph(deps).invoke(
		{ options: options({ maxRounds: 2 }) },
		{ recursionLimit: 20 }
	);
	assert.deepEqual(s.trace.slice(-3), ['simulate', 'gate', 'review']);
	assert.deepEqual(calls.candidates, [['gg@tune-v1']]);
});

test('mock proposer: deterministic, in bounds apart from the deliberate bad draft', async () => {
	const ctx = (await import('../../scripts/tuning/context.mjs')).characterContext('ms-dhoni');
	const a = await mockProposer({ seed: 7 }).propose({ context: ctx, round: 1, want: 3 });
	const b = await mockProposer({ seed: 7 }).propose({ context: ctx, round: 1, want: 3 });
	assert.deepEqual(a, b);
	const errors = a.drafts.map((d) => draftErrors('ms-dhoni', CANONICAL_STYLES['ms-dhoni'], d));
	assert.ok(errors[0].length > 0, 'the first round carries one out-of-bounds draft');
	const later = await mockProposer({ seed: 7 }).propose({ context: ctx, round: 2, want: 3 });
	for (const d of later.drafts)
		assert.deepEqual(draftErrors('ms-dhoni', CANONICAL_STYLES['ms-dhoni'], d), []);
});

test('claude proposer: refuses to run without ANTHROPIC_API_KEY and never calls out', async () => {
	const { claudeProposer } = await import('../../scripts/tuning/proposers.mjs');
	const saved = process.env.ANTHROPIC_API_KEY;
	delete process.env.ANTHROPIC_API_KEY;
	try {
		const p = claudeProposer();
		assert.equal(p.model, 'claude-opus-5-5');
		await assert.rejects(p.propose({}), /ANTHROPIC_API_KEY is not set/);
	} finally {
		if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
	}
});

test('options: mock defaults to the smoke budget, real runs to the real budget and Opus 5.5', () => {
	const mock = parseArgs(['--character', 'dhoni', '--mock']);
	assert.equal(mock.character, 'ms-dhoni');
	assert.equal(mock.proposer, 'mock');
	assert.equal(mock.budget.tables, 4);
	assert.equal(parseArgs(['--character=gg', '--proposer=fixture']).proposer, 'mock');
	const real = parseArgs(['--character', 'gg'], {});
	assert.equal(real.proposer, 'claude');
	assert.equal(real.model, 'claude-opus-5-5');
	assert.equal(real.budget.tables, 120);
	assert.equal(parseArgs(['--character', 'gg'], { TUNE_AI_MODEL: 'x' }).model, 'x');
	assert.throws(() => parseArgs(['--character', 'nobody', '--mock']));
	assert.throws(() => parseArgs(['--character', 'gg', '--mock', '--hands', '20']));
});

test(
	'mock run end to end: same seed, same inputs, identical outputs',
	{ timeout: 300000 },
	async () => {
		const root = mkdtempSync(join(tmpdir(), 'tuning-'));
		try {
			const o = parseArgs([
				'--character',
				'gg',
				'--mock',
				'--tables',
				'2',
				'--exploits',
				'always-raise',
				'--exploit-tables',
				'2',
				'--nights',
				'2',
				'--drafts',
				'2',
				'--threads',
				'2',
				'--out',
				root
			]);
			assert.equal(runIdFor(o), runIdFor({ ...o }));
			const one = await runTuning({ ...o, runId: 'one' });
			const two = await runTuning({ ...o, runId: 'two' });
			assert.deepEqual(one.state.trace, two.state.trace);
			assert.ok(one.state.trace.includes('simulate'));
			const read = (run, f) => readFileSync(join(root, run, f), 'utf8');
			assert.equal(read('one', 'result.json'), read('two', 'result.json'));
			assert.equal(
				read('one', 'report.md').replace('Tuning run one:', 'Tuning run two:'),
				read('two', 'report.md')
			);
			const files = readdirSync(join(root, 'one', 'candidates')).sort();
			assert.deepEqual(files, readdirSync(join(root, 'two', 'candidates')).sort());
			assert.ok(files.length >= 1);
			for (const f of files) {
				assert.equal(read('one', `candidates/${f}`), read('two', `candidates/${f}`));
				assert.deepEqual(configErrors(JSON.parse(read('one', `candidates/${f}`))), []);
			}
			const result = JSON.parse(read('one', 'result.json'));
			assert.ok(result.rejected.length >= 1, 'the deliberate bad draft was rejected');
			assert.equal(result.candidates.length, files.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
);

/* ------------------------------------ offline-only isolation ------------------------------------ */

function sources(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...sources(p));
		else if (/\.(m?js|ts|svelte|cjs)$/.test(name)) out.push(p);
	}
	return out;
}

test('no runtime file imports LangGraph, LangChain, the Anthropic SDK or the tuning loop', () => {
	const root = new URL('../../', import.meta.url).pathname;
	const files = ['server', 'src', 'shared'].flatMap((d) => sources(join(root, d)));
	assert.ok(files.length > 100);
	const bad = files.filter((f) =>
		/@langchain\/|@anthropic-ai\/|langgraph|scripts\/tuning/.test(readFileSync(f, 'utf8'))
	);
	assert.deepEqual(bad, []);
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	for (const dep of ['@langchain/langgraph', '@langchain/core', '@anthropic-ai/sdk']) {
		assert.ok(pkg.devDependencies[dep], `${dep} is a devDependency`);
		assert.equal(pkg.dependencies[dep], undefined, `${dep} is not a runtime dependency`);
	}
});
