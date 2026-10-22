# Bot Brain Phase 4.1: Dhoni and repeated blind raises

Written 2026-10-21. Follows [PHASE4_REPORT.md](PHASE4_REPORT.md) (unchanged). **Nothing adopted,
merged or published.** One challenger passes every gate and awaits approval.

## The flaw

Phase 4's exploit search found that four players who raise every blind bet beat Dhoni (raw -1,505
boots/100, gap 700 ± 164 against a neutral player). Root cause in the shared base brain (tp-dna@3):

- blind play is priced with a flat "blind is cheap" bonus and a look-timing term on this bot's own
  stake; there is no notion of the stake being driven up by others;
- pressure to look counts only players who **bet after looking** (`countPressure`): a player raising
  blind adds none.

So against blind raisers Dhoni keeps paying an escalating stake on unseen cards (0.92 blind bets a hand
against 0.53 for a neutral player). His opponent reads are not the cause (switching them off makes
it worse).

## Why the first fix failed

`ms-dhoni@7-blindcost` made looking more attractive as the blind stake grew, whoever had raised it.
Seen bluff-raises also grow the stake, so against a tight player who later bluffs ("value-then-bluff")
Dhoni looked early and then folded seen hands to the bluffs: -802 ± 510 boots/100 (counter-exploit gate failed).

## The narrow correction

Separate the concepts the first fix mixed:

| Concept | Where it lives |
|---|---|
| Cost escalation from raises by players **still blind** (no information about their cards) | the new base factor |
| Evidence about cards from **seen** raises | unchanged: the reads, suspicion of bluffers, pressure |
| Opponent aggression tendency | unchanged: the opponent model |
| Own stake and stack exposure | unchanged |

Two challengers on tp-dna@3 (`server/bots/character-v8.mjs`; the policy graph's base-factor hook now
also receives the decision context, nothing else changes):

- **C1 `ms-dhoni@8-blindraises` (tp-dna@8):** from the second distinct opponent still in the hand who
  has raised only while blind, +0.2 to look for each (at most +0.6). One blind raiser changes nothing.
- **C2 `ms-dhoni@9-blindcost` (tp-dna@9):** every such blind raiser adds pressure to look, scaled by
  the current stake (stake over four boots), at most +0.6.

## Screen (matched, 160 tables × 100 hands per strategy; boots/100 vs the champion)

| Strategy | Champion | rejected @7 | C1 | C2 |
|---|---:|---:|---:|---:|
| always-raise (the exploit) | -1,471 ± 191 | +1,084 ± 192 | **+1,072 ± 191** | +1,080 ± 190 |
| value-then-bluff (broke @7) | +42 ± 134 | +87 ± 116 | **0 ± 0** | 0 ± 0 |
| bluff-a-lot | +1,668 ± 357 | +85 ± 335 | **0 ± 0** | 0 ± 0 |
| raise-often | +81 ± 402 | +100 ± 557 | -35 ± 522 | +235 ± 537 |
| loose-then-value | -281 ± 160 | -69 ± 180 | -74 ± 184 | -47 ± 173 |
| sudden-change | -206 ± 148 | -69 ± 145 | -71 ± 140 | -14 ± 146 |

The new factors act only where blind raises repeat: where Dhoni faces seen aggression, decisions are
identical to the champion's (0 ± 0 on the same tables).

## The eight gates (seed 49: 240 population tables, 96 per scenario, 64 per exploit, 60 nights; 1.65M hands)

| | C1 `ms-dhoni@8-blindraises` | C2 `ms-dhoni@9-blindcost` |
|---|---|---|
| Regression (bands) | ✓ 4/10, violation 7.00 (champion 4/10, 7.00) | ✓ same |
| Personality (identified as Dhoni) | ✓ | ✗ |
| Strength (population, paired) | ✓ -1 ± 140 | ✓ +57 ± 206 |
| Exploit (always-raise) | ✓ +1,227 ± 33 | ✓ +1,230 ± 35 |
| Counter-exploit (15 fixed strategies + the searched one) | ✓ none clearly worse | ✓ none clearly worse |
| Night variety | ✓ 1.43 ± 0.28 (champion 1.83; floor 60%) | ✓ 1.57 ± 0.35 |
| Bad actions | ✓ 1.19% (champion 1.26%) | ✓ 1.21% |
| Performance | ✓ 0.092 ms mean, p99 0.186 (champion 0.103) | ✓ 0.088 ms |
| **All gates** | **PASS** | fail (personality) |

C1 per strategy against the champion: always-raise +1,227 ± 33, attack-short +298 ± 104, stay-blind
+140 ± 247, pressure-weakness +86 ± 188, raise-often -210 ± 780, sudden-change -127 ± 458, the rest
0 or within noise. Scenarios: switchers -204 ± 291 and -217 ± 281 (within noise, not clearly worse).

## Recommendation

**C1 `ms-dhoni@8-blindraises` is a candidate for adoption, awaiting your approval.** It fixes the one
real logic flaw Phase 4 found, without the first fix's regression, and keeps Dhoni Dhoni. Adopting it
would mean (only on approval): making tp-dna@8 a published policy, adding `ms-dhoni@4` as a canonical
reference with its configuration hash, updating `docs/archive/bots/CANONICAL.md` and the baseline digest lock,
deploying the Worker, then publishing through `npm run bots:publish-dna`. Until then **current Dhoni
(`ms-dhoni@3`) stays canonical.**

The same flaw lives in the shared base brain, so every tp-dna@3 character has it; Rohit's blind pride is
meant to keep him blind longer. Whether to offer the factor to other characters is a separate decision.

Results: `docs/bots/phase4/results/gates-dhoni41-49.json`; screen: `node scripts/sim/phase41-screen.mjs 160`.

## Decision (2026-10-22)

**C1 approved and adopted** as canonical Dhoni `ms-dhoni@4` (tp-dna@8, reference hash
`04254a1a0abbb72a`), checked identical to the challenger measured above. C2 not used. The results above
are unchanged. See [CANONICAL.md](CANONICAL.md).
