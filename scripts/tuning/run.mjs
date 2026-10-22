/**
 * Tuning loop: options and one run of the graph (docs/bots/TUNING_LOOP.md). The CLI is
 * scripts/tuning/tune-ai.mjs; tests call runTuning directly.
 */
import { performance } from 'node:perf_hooks';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { fingerprint64, canonicalJson } from '../../server/analytics/hash.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { BUDGETS } from './simulate.mjs';
import { buildTuningGraph } from './graph.mjs';
import { mockProposer, claudeProposer } from './proposers.mjs';
import { writeReview } from './report.mjs';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const ALIASES = {
	rohit: 'rohit-sharma',
	virat: 'virat-kohli',
	samay: 'samay-raina',
	dhoni: 'ms-dhoni'
};

/** Parse argv (`--name value`, `--name=value`, bare flags) into run options. */
export function parseArgs(argv, env = process.env) {
	const a = {};
	for (let i = 0; i < argv.length; i++) {
		const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
		if (!m) throw new Error(`Unexpected argument ${argv[i]}`);
		if (m[2] !== undefined) a[m[1]] = m[2];
		else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) a[m[1]] = argv[++i];
		else a[m[1]] = true;
	}
	const proposer = a.mock ? 'mock' : ((a.proposer === 'fixture' ? 'mock' : a.proposer) ?? 'claude');
	if (!['mock', 'claude'].includes(proposer)) throw new Error('--proposer must be claude or mock');
	const character = ALIASES[a.character] ?? a.character;
	if (!CHARACTER_IDS.includes(character))
		throw new Error(
			`--character one of: ${CHARACTER_IDS.join(', ')} (or rohit, virat, samay, dhoni)`
		);
	const base = BUDGETS[a.budget ?? (proposer === 'mock' ? 'smoke' : 'real')];
	if (!base) throw new Error('--budget must be smoke or real');
	const num = (k, d) => {
		if (a[k] === undefined) return d;
		const n = Number(a[k]);
		if (!Number.isInteger(n) || n < 0) throw new Error(`--${k} must be a whole number`);
		return n;
	};
	const exploits = a.exploits ? String(a.exploits).split(',') : base.exploits;
	for (const x of exploits) if (!EXPLOITS[x]) throw new Error(`Unknown exploit ${x}`);
	const budget = {
		seeds: a.seeds ? String(a.seeds).split(',').map(Number) : base.seeds,
		tables: num('tables', base.tables),
		hands: num('hands', base.hands),
		exploitTables: num('exploit-tables', base.exploitTables),
		exploitHands: num('exploit-hands', num('hands', base.exploitHands)),
		exploits,
		nights: num('nights', base.nights),
		nightHands: num('night-hands', num('hands', base.nightHands)),
		perf: a['no-perf'] ? false : a.perf ? true : base.perf
	};
	if (budget.seeds.some((s) => !Number.isInteger(s)))
		throw new Error('--seeds is a list like 61,62');
	if (budget.tables < 2 || budget.hands < 50)
		throw new Error('Identity needs at least 2 population tables of at least 50 hands');
	if (budget.nights < 2) throw new Error('Variety needs at least 2 nights');
	return {
		character,
		proposer,
		model: proposer === 'claude' ? (a.model ?? env.TUNE_AI_MODEL ?? DEFAULT_MODEL) : null,
		effort: a.effort ?? 'high',
		seed: num('seed', 1),
		mockInvalid: num('mock-invalid', 1),
		drafts: Math.max(1, num('drafts', 3)),
		maxRounds: Math.max(1, num('max-rounds', 3)),
		threads: a.threads ? num('threads', 1) : undefined,
		budget,
		root: a.out ?? '.sim/tuning',
		runId: a['run-id'] ?? null
	};
}

/** A deterministic run id: character, proposer, seed and a hash of every option that matters. */
export function runIdFor(o) {
	const h = fingerprint64(
		canonicalJson({
			c: o.character,
			p: o.proposer,
			m: o.model,
			e: o.proposer === 'claude' ? o.effort : null,
			s: o.seed,
			i: o.proposer === 'mock' ? o.mockInvalid : null,
			n: o.drafts,
			k: o.maxRounds,
			b: o.budget
		})
	).slice(0, 8);
	return `${o.character}-${o.proposer}-s${o.seed}-${h}`;
}

/** Run the graph once. `deps` can replace the proposer or any node's work (tests). */
export async function runTuning(o, deps = {}) {
	const proposer =
		deps.proposer ??
		(o.proposer === 'mock'
			? mockProposer({ seed: o.seed, invalid: o.mockInvalid })
			: claudeProposer({ model: o.model, effort: o.effort }));
	const runId = o.runId ?? runIdFor(o);
	const t0 = performance.now();
	const graph = buildTuningGraph({
		review: (s) => writeReview(s, { root: o.root }),
		...deps,
		proposer
	});
	const state = await graph.invoke(
		{
			options: {
				...o,
				runId,
				timing: { startedAt: new Date().toISOString() }
			}
		},
		{ recursionLimit: 10 + 2 * o.maxRounds }
	);
	return { runId, state, seconds: (performance.now() - t0) / 1000 };
}
