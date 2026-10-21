# Phase 3 artifacts

The Phase 3 study (`docs/bots/PHASE3_REPORT.md`): a staged population search over the five
characters (8.5M hands) and a final validation of each character's best candidate (2.1M hands).

## Files here

| File               | What it is                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `league-41.json`   | The search league (seed 41): every candidate (240), its parent, genome, stage results and status, and the finalist decision per character |
| `finals-51.json`   | The genomes the final study validated, one per character                                                                                  |
| `final-51.json`    | The final study's measurements (seed 51) that the report was written from                                                                 |
| `baseline-31.json` | The baseline used to set the target bands (seed 31)                                                                                       |

Policy names in these files are the former ones (`tp-character@3`, `@4`); see
`docs/bots/CANONICAL.md` for the mapping. Config hashes in the league were computed under those
names.

## Reproducing

From a tree at the Phase 3.1 baseline:

```
npm run sim:phase3            # search: seed 41, 4 generations x 12 children per character (about 2.5 h)
npm run sim:phase3:report     # final study: seed 51, from .sim/phase3/league-41.json (about 35 min)
npm run sim:phase3:all        # both, keeping the Mac awake
```

- Search configuration: `scripts/sim/phase3.mjs` (stages, selection gates, mutation and crossover),
  `server/sim/candidates.mjs` (genes and identity regions), `server/sim/targets.mjs` (bands,
  `targets@1`), `server/sim/evaluate.mjs` (population pool, matched tables, adaptation scenarios),
  `server/sim/archetypes.mjs` (human archetypes).
- Final study: `scripts/sim/phase3-report.mjs` (populations, scenarios, matchups, sessions, traces).
- Versions: `sim@1`, `fp@4`, `judge@2`, `sum@1`, `targets@1`, `mind@1` (v3) and `mind@2` (v4),
  `obs@1`. Decisions are seeded per table and seat, so the same seeds give the same league.
- The search and study write to `.sim/phase3/` (not in git). To regenerate the report from the
  committed league: `cp docs/bots/phase3/league-41.json .sim/phase3/` and run `sim:phase3:report`.
- Large intermediate files are not kept: per-table summaries live only in memory during a run, and
  the trial league (`league-99.json`, seed 99) and small-scale trial reports stayed local.
