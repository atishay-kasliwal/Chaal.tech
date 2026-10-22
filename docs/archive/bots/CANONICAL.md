# Canonical bot lineage

Recorded 2026-10-21, when the private-club character line (Phases 1, 1.1, 2 and the Phase 3
search) was brought onto `main` and approved as the canonical characters. This is the baseline
Phase 3.1 starts from.

## The two lines and why one name changed

Before this, two different bot systems used the same names:

|          | main (published to production)                                                                       | private-club (the Phase line)                                   |
| -------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Model    | numeric tendencies on the heuristic (`server/bots/strategy.mjs`), plus cross-session adaptive memory | personality DNA on a base brain, quirks, and a per-session mind |
| Policies | `tp-character@1`, `tp-adaptive@1`                                                                    | `tp-character@1` to `@4`                                        |
| Versions | immutable `<bot>@<n>` in the database (bot directory)                                                | frozen in code                                                  |

Both lines named their first policy `tp-character@1`. main's is published in production and
immutable, so the Phase line's policies were renamed:

| Before                          | Now        | What it is                           |
| ------------------------------- | ---------- | ------------------------------------ |
| `tp-character@1` (private-club) | `tp-dna@1` | Phase 1: personality only            |
| `tp-character@2`                | `tp-dna@2` | Phase 1.1: bounded personality       |
| `tp-character@3`                | `tp-dna@3` | Phase 2: with a mind (`mind@1`)      |
| `tp-character@4`                | `tp-dna@4` | Phase 3: the policy fixes (`mind@2`) |

Only names changed. `server/bots/dna-policies.mjs` keeps the former names (`FORMER_NAMES`).
main's `tp-character@1` and `tp-adaptive@1` are untouched.

## Canonical characters

| Character | Reference        | Policy     | Reference hash     | Directory hash     | Source                                          |
| --------- | ---------------- | ---------- | ------------------ | ------------------ | ----------------------------------------------- |
| Rohit     | `rohit-sharma@3` | `tp-dna@3` | `f2015fc5daf490a9` | `13657c11ca64694c` | Phase 2                                         |
| Virat     | `virat-kohli@3`  | `tp-dna@3` | `ecd01fe38fca321d` | `35d9023fb9525120` | Phase 2                                         |
| GG        | `gg@4`           | `tp-dna@4` | `862f1cd78b2c4597` | `1c634dd3cf3e50f9` | Phase 3 candidate `gg@4-c034`                   |
| Samay     | `samay-raina@3`  | `tp-dna@3` | `7d7e81874eb7ddf7` | `43686ccfe4328696` | Phase 2                                         |
| Dhoni     | `ms-dhoni@4`     | `tp-dna@8` | `04254a1a0abbb72a` | `98d41082047cd70a` | Phase 4.1 candidate C1 `ms-dhoni@8-blindraises` |

- **Reference hash**: `styleConfigHash` over policy, tendencies and games (the simulator's identity).
- **Directory hash**: `characterHash`, which also covers supported variants: the hash the published
  database version carries.
- References live in `server/bots/dna-styles.mjs` (`CANONICAL_STYLES`); the DNA itself in
  `server/bots/dna-characters.mjs`.

**GG c034.** A crossover of two generation-0 mutants of the Phase 2 GG (`c007`: curiosity,
riskTolerance, pressureResistance; `c008`: showPreference, ego) plus one mutation (moodRecovery),
generation 2 of the search. Measured under the former policy name as `af244057d0c062cc`; recomputing
that hash from the ported configuration gives the same value
(`tests/server/bot-canonical.test.mjs`). Not adopted: Virat `c024`, Samay `c008`, Dhoni `c039`,
any Rohit candidate (reasons in `docs/archive/bots/PHASE3_REPORT.md`).

**Dhoni C1 (Phase 4.1, approved 2026-10-22).** Dhoni's Phase 2 DNA, quirks and tempo, unchanged, on
`tp-dna@8`: tp-dna@3 plus one base factor (from the second distinct opponent still in the hand who
has raised only while blind, +0.2 to look each, at most +0.6). It fixes the repeated-blind-raise
exploit Phase 4 found (+1,227 ± 33 boots/100 against it) at neutral strength (-1 ± 140) and passes
all eight gates ([PHASE41_REPORT.md](PHASE41_REPORT.md)). The canonical reference `ms-dhoni@4` is
exactly the measured challenger: same configuration and hash, and the same decisions, traces, random
draws and minds on fixed tables (`tests/server/bot-canonical.test.mjs`;
`node scripts/sim/phase41-canonical.mjs` replays the 4.1 screen and requires 0 ± 0 against C1 on every
strategy). `ms-dhoni@3` stays in code as history; the Phase 3.1, 4 and 4.1 harnesses use the frozen
`PHASE4_CHAMPIONS` (the lineup before 4.1), so their recorded results still reproduce. C2
(`tp-dna@9`) was rejected and stays offline.

**Historical versions.** The DNA references v1 to v3 stay in code with golden digests
(`tests/server/bot-legacy-golden.test.mjs`); main's published database versions are never edited.

## How a canonical character reaches a table

1. `npm run bots:publish-dna` (plan only), then `npm run bots:publish-dna -- --publish`, with
   `MONGODB_ADMIN_URI`. Each bot gets its next directory version through draft, validate and
   publish. A version is published only if its hash and genes equal the reference exactly; a bot
   already on its canonical style is skipped. `--descriptions` also applies the new player-facing
   copy (`CANONICAL_COPY` in `server/bots/publish-dna.mjs`), keeping the old text in
   `identityHistory`.
2. The room seats the published style from the directory (`botSeat`); the engine validates it
   (`configErrors`, which knows the DNA schema) and embeds it in the seat.
3. The runner decides by the seat's policy: `tp-adaptive@1` with its loaded memory, `tp-dna@*` with
   its per-session mind (kept in the room's `botMinds`, recorded at each deal for replay), anything
   else on the heuristic.

Until step 1 runs against production, production plays main's existing versions unchanged.

## Equivalence checks (2026-10-21)

- **Phase line unchanged by the merge and rename.** 16,348 decisions on fixed seeds (DNA v1, v2, v3,
  all five Phase 3 finals including c034, and mixed tables with legacy bots), with every trace,
  random draw and mind: byte-identical before (private-club Phase 3 tree) and after (this tree),
  sha256 prefix `460c2fdbe14da294`. The golden digests for v1, v2 and v3 also pass unchanged.
- **main's live bots unchanged.** 6,943 decisions of main's five `tp-character@1` seed styles, their
  `tp-adaptive@1` v3 versions and a legacy bot: byte-identical on `main` and on this tree,
  `e18d345cc94ae4de`.

## What happened to private-club

| Commit     | Content                                         | Outcome                                                                                                  |
| ---------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `877d35be` | Phase 1 to 2 bots, simulator, Phase 3 machinery | Ported here, adapted to main's directory, seating and runtime                                            |
| `c68cb569` | Mascot size setting, `/club/settings`           | Obsolete: main already had it (mascot rollout)                                                           |
| `b14adfd7` | Frontend redesign and navbar                    | Obsolete: main had the redesign; the navbar, footer, landing, `/club` and `/stats` merged as #15 and #16 |

The branch is kept as an archive; nothing on it remains unmerged that is still wanted.

## Not changed, on purpose

- Think time: live rooms keep main's per-character tempo (`TEMPO`, `thinkingContext`). The DNA
  `tempo.thinkMs` stays in the data but does not drive live timing.
- The shared runner names characters in main's tempo table; the "personality is data" check covers
  the DNA policy files only.
