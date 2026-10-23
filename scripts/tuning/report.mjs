/**
 * Tuning loop: the review step (docs/bots/TUNING_LOOP.md). Writes, and only writes, into
 * .sim/tuning/<run-id>/:
 *
 *   report.md            for the human reviewer
 *   result.json          everything decided in the run (deterministic for a given seed and proposer)
 *   candidates/<id>.json each valid candidate as a plain style config
 *   timing.json          wall-clock, decision timing and API usage (varies run to run)
 *
 * Nothing is published, nothing is written to a database, no canonical config is touched.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { budgetHands } from './simulate.mjs';

const r0 = (x) => (x == null || Number.isNaN(x) ? 'n/a' : String(Math.round(x)));
const mark = (p) => (p === null ? '-' : p ? 'ok' : 'FAIL');

/** The deterministic record of a run (no timing, no wall-clock). */
export function runResult(state) {
	const { options, context, baselineSummary, accepted, rejected, gates } = state;
	const verdicts = gates?.candidates ?? [];
	const strip = (c) => {
		const { perf, ...rest } = c;
		void perf;
		return rest;
	};
	return {
		tool: 'tuning-loop@1',
		character: options.character,
		canonical: context.canonical,
		proposer: { name: options.proposer, model: options.model ?? null, seed: options.seed },
		budget: options.budget,
		drafts: options.drafts,
		maxRounds: options.maxRounds,
		rounds: state.round,
		baseline: baselineSummary,
		accepted: accepted.map((a) => ({
			round: a.round,
			key: a.key,
			draft: a.draft,
			configHash: a.style.configHash
		})),
		rejected: rejected.map((r) => ({ round: r.round, draft: r.draft, reasons: r.reasons })),
		canonicalGates: gates ? strip(gates.canonical) : null,
		candidates: verdicts.map(strip),
		passed: verdicts.filter((c) => c.pass).map((c) => c.key),
		// Clearly better, not just "not worse": strength or the named exploit improves beyond noise.
		improved: verdicts
			.filter(
				(c) => c.pass && (c.strength.mean - c.strength.ci > 0 || c.gates.exploit?.pass === true)
			)
			.map((c) => c.key)
	};
}

function changes(context, draft) {
	const lines = [];
	for (const { gene, value } of draft.dna ?? [])
		lines.push(`| ${gene} | ${context.canonical.dna[gene]} | ${value} |`);
	for (const { id, strength } of draft.quirks ?? [])
		lines.push(
			`| quirk ${id} | ${context.canonical.quirks.find((q) => q.id === id)?.strength} | ${strength} |`
		);
	return ['| value | canonical | candidate |', '|---|---:|---:|', ...lines].join('\n');
}

export function markdown(state, result, runId) {
	const { context, options } = state;
	const b = options.budget;
	const hands = budgetHands(b);
	const smoke = b.tables < 60;
	const out = [];
	out.push(`# Tuning run ${runId}: ${context.name}`);
	out.push('');
	out.push(
		`Offline tuning loop (docs/bots/TUNING_LOOP.md). **Nothing was published or written to a database, and no canonical config was changed.** The candidates below are plain style configs for a human to review.`
	);
	out.push('');
	out.push(
		`- Character: ${context.name} (\`${context.character}\`), canonical \`${context.canonical._id}\` on ${context.canonical.policy}, hash \`${context.canonical.configHash}\``
	);
	out.push(
		`- Proposer: ${options.proposer}${options.model ? ` (${options.model})` : ''}, seed ${options.seed}; ${result.rounds} round(s) of at most ${options.maxRounds}, ${options.drafts} draft(s) wanted`
	);
	out.push(
		`- Budget: seeds ${b.seeds.join(', ')}; ${b.tables} population tables x ${b.hands} hands; ${b.exploitTables} tables x ${b.exploitHands} hands per exploit (${b.exploits.length} exploits); ${b.nights} nights x ${b.nightHands} hands; timing ${b.perf ? 'on' : 'off'}`
	);
	out.push(
		`- Hands: ${hands.baseline.toLocaleString('en-US')} for the baseline, ${hands.candidate.toLocaleString('en-US')} per candidate`
	);
	if (smoke)
		out.push(
			'- **Smoke budget.** Intervals at this size are far too wide to decide anything; this run only shows the loop works. Use the real budget for a decision.'
		);
	out.push('');
	out.push('## Verdict');
	out.push('');
	if (!result.candidates.length) out.push('No valid candidate reached simulation.');
	else {
		out.push(
			'| candidate | all gates | ' +
				Object.keys(result.candidates[0].gates).join(' | ') +
				' | strength vs canonical |'
		);
		out.push(
			'|---|---|' +
				Object.keys(result.candidates[0].gates)
					.map(() => '---')
					.join('|') +
				'|---:|'
		);
		for (const c of result.candidates)
			out.push(
				`| \`${c.draft.id}\` | ${c.pass ? '**PASS**' : 'fail'} | ${Object.values(c.gates)
					.map((g) => mark(g.pass))
					.join(' | ')} | ${r0(c.strength.mean)} ± ${r0(c.strength.ci)} |`
			);
		out.push('');
		out.push(
			result.passed.length
				? `Passing every gate at this budget: ${result.passed.map((k) => `\`${k}\``).join(', ')}.`
				: 'No candidate passes every gate at this budget. Canonical stays as it is.'
		);
		out.push('');
		out.push(
			result.improved.length
				? `Passing and clearly better (population strength or the named exploit, interval above zero): ${result.improved.map((k) => `\`${k}\``).join(', ')}.`
				: 'None is clearly better than canonical: passing the gates means "not worse within noise", not "an improvement".'
		);
	}
	out.push('');
	out.push('## Canonical in this run');
	out.push('');
	const bs = result.baseline;
	out.push(
		`Identified as ${context.name} in ${bs.identity.identified == null ? 'n/a' : Math.round(100 * bs.identity.identified) + '%'} of 50-hand windows (five-way accuracy ${bs.identity.fiveWayAccuracy == null ? 'n/a' : Math.round(100 * bs.identity.fiveWayAccuracy) + '%'}); ${r0(bs.fingerprint.bootsPer100)} boots/100 in the population; bad actions ${bs.fingerprint.badActionRate == null ? 'n/a' : (100 * bs.fingerprint.badActionRate).toFixed(2) + '%'}.`
	);
	out.push('');
	out.push('| band | value | range | core | pass |');
	out.push('|---|---:|---|---|---|');
	for (const x of bs.bands)
		out.push(
			`| ${x.key} | ${x.value ?? 'n/a'} | ${x.band[0]} to ${x.band[1]} | ${x.core ? 'yes' : ''} | ${x.pass ? 'ok' : 'miss'} |`
		);
	out.push('');
	out.push('## Candidates');
	for (const c of result.candidates) {
		out.push('');
		out.push(`### \`${c.draft.id}\` (${c.pass ? 'passes every gate' : 'fails'})`);
		out.push('');
		out.push(`Weakness: ${c.draft.weakness ?? 'not stated'}`);
		out.push('');
		out.push(`Rationale: ${c.draft.rationale}`);
		out.push('');
		out.push(changes(context, c.draft));
		out.push('');
		for (const [k, g] of Object.entries(c.gates)) out.push(`- ${k}: ${mark(g.pass)}, ${g.detail}`);
		out.push(
			`- exploits (boots/100 vs canonical): ${Object.entries(c.xPaired)
				.map(([x, v]) => `${x} ${r0(v.mean)} ± ${r0(v.ci)}`)
				.join('; ')}`
		);
		out.push(`- config: \`candidates/${c.draft.id}.json\``);
	}
	if (result.rejected.length) {
		out.push('');
		out.push('## Rejected drafts');
		out.push('');
		for (const r of result.rejected)
			out.push(`- round ${r.round}, \`${r.draft?.id ?? '?'}\`: ${r.reasons.join('; ')}`);
	}
	out.push('');
	out.push('## Next steps (by hand only)');
	out.push('');
	out.push(
		[
			'1. Read the rationale and the changes. Drop anything that makes the character less like itself, whatever the numbers say.',
			'2. Re-run the loop on the chosen candidate at the real budget, and on a fresh seed, before believing a pass.',
			'3. To adopt: add the config as a frozen reference in `server/bots/dna-styles.mjs` and to the canonical lineup, update `docs/archive/bots/CANONICAL.md` and the golden digests, review, merge to main, deploy, then publish with `npm run bots:publish-dna` (plan first, then `--publish`).',
			'4. This tool never does any of step 3.'
		].join('\n')
	);
	out.push('');
	return out.join('\n');
}

/** The review node's writer: the files in .sim/tuning/<run-id>/. Returns what it wrote. */
export function writeReview(state, { root = '.sim/tuning' } = {}) {
	const runId = state.options.runId;
	const dir = join(root, runId);
	mkdirSync(join(dir, 'candidates'), { recursive: true });
	const result = runResult(state);
	writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, '\t') + '\n');
	for (const a of state.accepted)
		writeFileSync(
			join(dir, 'candidates', `${a.draft.id}.json`),
			JSON.stringify(a.style, null, '\t') + '\n'
		);
	writeFileSync(join(dir, 'report.md'), markdown(state, result, runId));
	writeFileSync(
		join(dir, 'timing.json'),
		JSON.stringify(
			{
				canonicalPerf: state.baseline?.perf ?? null,
				candidatePerf: Object.fromEntries(
					(state.gates?.candidates ?? []).map((c) => [c.key, c.perf ?? null])
				),
				usage: state.usage,
				...(state.options.timing ?? {})
			},
			null,
			'\t'
		) + '\n'
	);
	return {
		dir,
		passed: result.passed,
		candidates: result.candidates.length,
		rejected: result.rejected.length
	};
}
