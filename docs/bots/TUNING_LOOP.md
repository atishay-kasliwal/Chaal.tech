# Bot tuning loop (Phase 6, part 4)

An offline, AI-assisted loop for tuning one character's DNA: **propose, validate, simulate, gate,
review**. Claude (or a deterministic mock) proposes small, explained DNA edits of a canonical
character; the project's own validation, simulator and Phase 4 gates judge them; a human reads the
report. The loop never publishes anything.

Code: `scripts/tuning/`. Tests: `tests/server/bot-tuning-loop.test.mjs`. Output:
`.sim/tuning/<run-id>/` (gitignored, like all of `.sim/`).

## Safety

- **Offline only.** The loop reads the frozen canonical references in `server/bots/dna-styles.mjs`
  and writes only into `.sim/tuning/<run-id>/`. It never publishes, never connects to MongoDB, never
  edits `dna-styles.mjs`, `publish-dna.mjs` or any policy.
- **Human review is required.** The output is a report and plain style configs. Adopting one is the
  usual manual pipeline (below), never something this tool does.
- **Not in the product.** `@langchain/langgraph`, `@langchain/core` and `@anthropic-ai/sdk` are
  devDependencies, imported only from `scripts/tuning/`. A test fails if any file under `server/`,
  `src/` or `shared/` mentions them, and neither the Pages build nor the Worker bundle contains them
  (checked when this was built: see the PR).
- **The API key** is read from `ANTHROPIC_API_KEY` (environment or `.env`, which is gitignored). It
  is never printed or written to the run folder.

## The graph

```
START
  |
load_context        canonical style, identity bands, bounds, known weaknesses
  |
measure_baseline    simulate canonical + the other four + <character>@2; gate canonical alone
  |
propose  <-------+  Claude or mock: up to N drafts, given the baseline and earlier feedback
  |              |
validate --------+  invalid drafts go back with reasons, while fewer than N are valid and rounds < K
  |
  +---- no valid draft after K rounds -----------------+
  |                                                    |
simulate            each valid candidate on the        |
  |                 baseline's matched tables          |
gate                the Phase 4 gates vs canonical     |
  |                                                    |
review  <----------------------------------------------+
  |                 report.md, result.json, candidates/*.json, timing.json
END
```

Built with LangGraph JS (`StateGraph`, `Annotation`), in `scripts/tuning/graph.mjs`. Every node's
work is injected, so tests wire the graph with stubs.

### State

| field                         | what                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| `options`                     | character, budget, N drafts, K rounds, proposer, model, seed, run id        |
| `context`                     | canonical config, bands, bounds, weaknesses (`scripts/tuning/context.mjs`)  |
| `baseline`, `baselineSummary` | canonical's measured statistics, and the fingerprint the proposer sees      |
| `round`                       | proposal rounds so far                                                      |
| `drafts`                      | this round's drafts                                                         |
| `accepted`, `rejected`        | accumulated over rounds; rejected drafts carry their reasons (the feedback) |
| `simulation`, `gates`         | candidate statistics and gate verdicts                                      |
| `usage`, `trace`              | API usage per round; node order (tests check it)                            |

## Drafts and validation

A draft lists only what changes, as absolute values:

```json
{
	"id": "c1-monster-raise",
	"rationale": "why, the mechanism expected, and the risk",
	"weakness": "the tunable weakness it targets",
	"dna": [{ "gene": "aggression", "value": 0.46 }],
	"quirks": [{ "id": "survivalMode", "strength": 0.5 }],
	"exploitTarget": null
}
```

`scripts/tuning/bounds.mjs` checks, in order:

1. Shape: known fields only. **Policy, tempo, games and variants cannot change** (a policy change is
   code and goes through a Phase 4 challenger).
2. Bounds (new tuning-loop rules): at most **4** values changed; a gene moves at most **0.1**, stays
   in [0, 1], inside the character's identity region (`REGIONS` in `server/sim/candidates.mjs`,
   the Phase 3 search regions) or within **0.15** of canonical for genes without a region; only the
   character's own quirks, strength in **[0.3, 1]** (the Phase 3 range) and at most **0.2** from
   canonical; a rationale of 10 to 1,200 characters; an optional `exploitTarget` from the fixed
   exploit suite.
3. The project's own checks: `configErrors` (`server/bots/config.mjs`, the style contract) and
   `validateStyle` (`server/bots/validation.mjs`: a short real-engine game with the hidden-card
   invariance check). Duplicates of canonical or of an accepted draft are rejected.

The candidate config is canonical's with the draft's values: same policy and tempo, `_id`
`<botId>@<canonical version + 1>`, `parent` the canonical id, `status: "candidate"`,
`source: "tuning-loop"`, and a recomputed `configHash`.

## Simulation

`scripts/tuning/simulate.mjs` plays exactly the tables the Phase 4 gates play
(`scripts/sim/phase4-gates.mjs`), on the simulator's process pool (`scripts/sim/pool.mjs`), matched
(duplicate) play throughout:

- **population**: the hero against four opponents drawn from the Phase 3/4 population
  (`opponents(seed, 'gates', t)`), seat rotating, 50-hand windows kept for identity;
- **exploits**: four copies of each fixed exploit strategy (`server/sim/adversary.mjs`) aimed at the hero;
- **nights**: the same table replayed with different decision seeds, for night variety.

The baseline plays canonical in full, plus the other four canonical characters and
`<character>@2` (the stateless reference the event bands are measured against) on the population
tables. Each candidate then plays only its own tables. All canonical characters are seated as their
frozen reference styles (Dhoni is `ms-dhoni@4`, tp-dna@8), so the comparison is against today's
canonical lineup, not the Phase 4 champions.

## Gates

`scripts/tuning/gates.mjs`, same thresholds as the Phase 4 gates (the ones Dhoni C1 passed,
`docs/archive/bots/PHASE41_REPORT.md`):

| gate            | passes when                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| regression      | no core band newly failed, no fewer bands passed, violation at most +0.5 (`judgeBands`, `server/sim/targets.mjs`) |
| personality     | identified as its character in 50-hand windows at most 5 points below canonical                                   |
| identifiability | **new:** five-way identification accuracy at most 5 points below canonical's (a candidate must not blur the cast) |
| strength        | not clearly weaker: upper 95% bound of the paired population difference at least -50 boots/100                    |
| exploit         | only if the draft names one: that exploit clearly improves (lower bound above 0)                                  |
| counter         | no fixed exploit clearly worse (no paired upper bound below -100)                                                 |
| variety         | night variety at least 0.6 of canonical's                                                                         |
| bad actions     | at most 0.5 points above canonical's                                                                              |
| performance     | mean decision time at most 1.5 times canonical's (+0.02 ms); only with timing on                                  |

Not run: the Phase 4 adaptation and Samay event scenarios (exploit targets of kind `adapt` and
`event`). A DNA step adds no new mechanism; a candidate that passes here still goes through the full
`node scripts/sim/phase4.mjs gates` at full budget before adoption.

As in the Phase 4 gates, bands measured by the adaptation study (Dhoni's `bluffIndex`,
`callIndex` and the like) have no value in the population run and count as missed, equally for
canonical and candidate. Canonical Dhoni therefore shows 4/10 bands, violation 7.00, exactly the
figure in PHASE41_REPORT.md; the regression gate compares like with like.

Passing every gate means "not worse within noise". The report lists separately the candidates that
are also clearly better (population strength, or the named exploit, with the interval above zero).

## Running it

```sh
# Offline, deterministic, no API calls: smoke budget, about 10 s on 8+ cores
npm run bots:tune-ai -- --character gg --mock

# Claude proposer, real budget (needs ANTHROPIC_API_KEY in the environment or .env)
npm run bots:tune-ai -- --character gg
```

| option                                              | default                                             |                                                                                                |
| --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `--character`                                       | required                                            | `rohit-sharma`, `virat-kohli`, `gg`, `samay-raina`, `ms-dhoni` (or rohit, virat, samay, dhoni) |
| `--mock`, `--proposer`                              | `claude`                                            | `mock` (alias `fixture`) is the deterministic local proposer                                   |
| `--model`                                           | `claude-opus-5-5`                                   | or `TUNE_AI_MODEL`                                                                             |
| `--effort`                                          | `high`                                              | Claude effort (`low` to `max`)                                                                 |
| `--drafts` N                                        | 3                                                   | candidates wanted                                                                              |
| `--max-rounds` K                                    | 3                                                   | proposal rounds at most                                                                        |
| `--seed`                                            | 1                                                   | proposer seed (mock) and part of the run id                                                    |
| `--budget`                                          | `smoke` with mock, `real` with Claude               |                                                                                                |
| `--seeds`                                           | 61                                                  | simulation seeds, comma separated; tables repeat per seed                                      |
| `--tables`, `--hands`                               | 4 x 50 smoke, 120 x 200 real                        | population tables per seed, hands per table (at least 2 x 50)                                  |
| `--exploit-tables`, `--exploit-hands`, `--exploits` | 2 x 50 on 3 exploits smoke, 32 x 200 on all 15 real |                                                                                                |
| `--nights`, `--night-hands`                         | 3 x 50 smoke, 30 x 200 real                         |                                                                                                |
| `--perf` / `--no-perf`                              | off smoke, on real                                  | decision timing (and the performance gate)                                                     |
| `--threads`, `--run-id`, `--out`                    | cores - 1, derived, `.sim/tuning`                   |                                                                                                |
| `--mock-invalid`                                    | 1                                                   | out-of-bounds drafts the mock puts in round 1 (exercises the loop back)                        |

The run id is `<character>-<proposer>-s<seed>-<hash of the options>`, so the same inputs write to
the same folder.

**Determinism.** With the mock proposer, the same seed and options give byte-identical
`result.json`, `report.md` and candidate configs (tested). Wall-clock, decision timing and API usage
go to `timing.json` only. With timing on, the performance gate depends on the machine. A Claude run
is not deterministic (the proposals vary), but everything after the proposal is.

## Cost and runtime

- **Hands.** Smoke: 1,650 baseline + 650 per candidate. Real: 246,000 baseline + 126,000 per
  candidate (3 candidates: about 624,000 hands).
- **Runtime.** Smoke about 10 s. Real budget with 3 candidates (624,000 hands): about 22 minutes on
  the 8-core development Mac (measured with the mock proposer for Dhoni, sharing the machine with a
  build). Each extra candidate adds about 5 minutes. Phase 4.1's full gates were 1.65M hands.
- **API cost.** One Claude request per round, at most K (3). Each request is about 5,000 to 8,000
  input tokens (context, bounds, bands, fingerprint, feedback) and a few thousand output tokens
  including thinking. At Claude Opus 5.5 rates ($4 / $20 per million) a run costs well under $1.
  The simulation, not the API, is the expensive part.

## After the review (by hand)

1. Read the rationale and the changes; reject anything that makes the character less like itself.
2. Re-run on a fresh `--seeds` at the real budget, then the full Phase 4 gates.
3. To adopt: add the config as a frozen reference in `server/bots/dna-styles.mjs` and to the
   canonical lineup, update `docs/archive/bots/CANONICAL.md` and the golden digests, review and merge
   to main, deploy the Worker, then `npm run bots:publish-dna` (plan, then `--publish`).

## Files

| file                           | role                                              |
| ------------------------------ | ------------------------------------------------- |
| `scripts/tuning/tune-ai.mjs`   | CLI (`npm run bots:tune-ai`)                      |
| `scripts/tuning/run.mjs`       | options, run id, one run of the graph             |
| `scripts/tuning/graph.mjs`     | the LangGraph graph and state                     |
| `scripts/tuning/context.mjs`   | character context and known weaknesses            |
| `scripts/tuning/bounds.mjs`    | draft limits, bounds and validation               |
| `scripts/tuning/proposers.mjs` | mock and Claude proposers                         |
| `scripts/tuning/simulate.mjs`  | budgets, table specs, baseline and candidate runs |
| `scripts/tuning/gates.mjs`     | the gates                                         |
| `scripts/tuning/report.mjs`    | the review files                                  |
