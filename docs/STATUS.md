# Chaal: current status

The canonical current-state summary. Last verified **2026-10-22**. Phase reports elsewhere in `docs/`
are historical evidence and are not rewritten; when they disagree with this page, this page is
current.

Roadmap: **3 2 5** (done) → **10 Pakad** (done) → **29** (done) → **cross-game character evaluation**
(done) → Phase 5 (long-term memory, not started).

## Production

| Part                | State                                                                                                                           | How verified                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| main                | deployed from `304b78ea` (PRs #23, #25, #26); later merges change nothing deployed: #27 (validation script) and #24 (this page) | GitHub                                                            |
| Worker (chaal-game) | `ENGINE_BUILD 304b78eaf992` (deployed 2026-10-22)                                                                               | `/health`                                                         |
| Pages (chaal.tech)  | build `1792675886163`, from `304b78ea` (deployed 2026-10-22)                                                                    | page source; `/`, `/club`, `/stats`, `/bots`, `/games` return 200 |
| Sign-in             | Google client configured in the build                                                                                           | sign-in page source                                               |
| 3 2 5               | live: create-room option and `/games` guide                                                                                     | production page source; `/test-325` returns the 404 page          |

Deploys are manual from the owner's Mac: Worker (`npm run deploy:backend`, which stamps and checks
`ENGINE_BUILD`), then Pages. Deploy only `origin/main`.

## Canonical bots (Teen Patti)

Source of truth: [bots/CANONICAL.md](bots/CANONICAL.md) (`CANONICAL_STYLES` in
`server/bots/dna-styles.mjs`). The pre-4.1 lineup is frozen as `PHASE4_CHAMPIONS`
([bots/phase4/champions.json](bots/phase4/champions.json)) for reproducing Phases 3.1 to 4.1.

| Character | Reference        | Policy                | Reference hash     | Directory hash     | Source                  |
| --------- | ---------------- | --------------------- | ------------------ | ------------------ | ----------------------- |
| Rohit     | `rohit-sharma@3` | `tp-dna@3` / `mind@1` | `f2015fc5daf490a9` | `13657c11ca64694c` | Phase 2                 |
| Virat     | `virat-kohli@3`  | `tp-dna@3` / `mind@1` | `ecd01fe38fca321d` | `35d9023fb9525120` | Phase 2                 |
| GG        | `gg@4`           | `tp-dna@4` / `mind@2` | `862f1cd78b2c4597` | `1c634dd3cf3e50f9` | Phase 3 c034            |
| Samay     | `samay-raina@3`  | `tp-dna@3` / `mind@1` | `7d7e81874eb7ddf7` | `43686ccfe4328696` | Phase 2                 |
| Dhoni     | `ms-dhoni@4`     | `tp-dna@8` / `mind@1` | `04254a1a0abbb72a` | `98d41082047cd70a` | Phase 4.1 C1 (approved) |

**Published to production 2026-10-22** (owner-approved; `npm run bots:publish-dna -- --publish
--descriptions`). Each bot got its next immutable directory version, exactly the reference; the `@2`
versions are kept. A rerun of the plan reports every bot "already on" its reference.

| Bot   | Directory version (live) | Reference        | Policy     | Directory hash     | Previous         |
| ----- | ------------------------ | ---------------- | ---------- | ------------------ | ---------------- |
| Rohit | `rohit-sharma@3`         | `rohit-sharma@3` | `tp-dna@3` | `13657c11ca64694c` | `rohit-sharma@2` |
| Virat | `virat-kohli@3`          | `virat-kohli@3`  | `tp-dna@3` | `35d9023fb9525120` | `virat-kohli@2`  |
| GG    | `gg@3`                   | `gg@4`           | `tp-dna@4` | `1c634dd3cf3e50f9` | `gg@2`           |
| Samay | `samay-raina@3`          | `samay-raina@3`  | `tp-dna@3` | `43686ccfe4328696` | `samay-raina@2`  |
| Dhoni | `ms-dhoni@3`             | `ms-dhoni@4`     | `tp-dna@8` | `98d41082047cd70a` | `ms-dhoni@2`     |

Directory versions number each bot's database history; reference ids number the code family. They are
told apart by policy and hash, which every recorded seat carries. Player-facing copy was updated
(`CANONICAL_COPY`), with the old text kept in each bot's `identityHistory`. Atlas must allow the
machine running the script (a VPN can block it).

**Known, intentional weaknesses (kept; they are the characters):**

- **Rohit**, blind pride: stays blind longer than is wise, so repeated blind raising costs him.
- **GG**, reads by style: a player who plays tight and then switches to bluffing can push GG off
  hands for a while.
- **Samay**, the caller: calls too often and rarely takes the initiative; a patient value player
  profits.
- **Virat**, temporary tilt: after a painful loss he plays looser for a few hands.

Dhoni's repeated-blind-raise flaw is fixed by C1. Rohit, Virat and Samay still share the base brain's
blind pricing; Rohit's blind pride is meant to keep him blind. Offering the factor to others is a
separate decision.

**Samay finding (design, not a bug):** Phase 4 could not make Samay take the initiative without
breaking his identity. His passivity needs memory across nights, which is Phase 5, not a tuning change.

## Bot phases

| Phase        | State                                                                                                              | Where                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1, 1.1, 2, 3 | done                                                                                                               | [bots/](bots/) reports                                                |
| 3.1          | done; nothing adopted                                                                                              | [bots/PHASE31_REPORT.md](bots/PHASE31_REPORT.md)                      |
| 4            | **closed**: every champion kept                                                                                    | [bots/PHASE4_REPORT.md](bots/PHASE4_REPORT.md)                        |
| 4.1          | **closed**: C1 `ms-dhoni@8-blindraises` adopted as `ms-dhoni@4`, checked identical to the measured C1; C2 rejected | [bots/PHASE41_REPORT.md](bots/PHASE41_REPORT.md), `phase41-canonical` |
| 5            | **not started** (direction below)                                                                                  |                                                                       |

### Phase 5 direction: long-term cross-session memory (not started)

Deliberately after 10 Pakad and 29 (now done), so the memory architecture is not
Teen-Patti-specific.

publicly observable information only → bounded summary → confidence → decay → returning-player prior
→ new evidence overrides stale memory.

No live retraining, no hidden cards, no automatic DNA changes, no neural or RL system. Gated by the
same eight gates. Name clash: [ANALYTICS_PHASE5.md](ANALYTICS_PHASE5.md) is the analytics
"intelligence layer", not this.

## Games

| Game                                                | State                                                                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Teen Patti (26 variants), Hold'em, Blackjack, Rummy | live; rule errors reach players as messages and a dropped player shows Away at once (PR #23)                                           |
| 3 2 5                                               | **Phase 2 approved and live**; rules locked in [games/325_RULE_LOCK.md](games/325_RULE_LOCK.md) (canonical)                            |
| 10 Pakad                                            | **live**: rules locked 2026-10-22 ([games/10PAKAD_PLAN.md](games/10PAKAD_PLAN.md)); [games/10PAKAD_REPORT.md](games/10PAKAD_REPORT.md) |
| 29                                                  | **live**: rules locked 2026-10-22 ([games/29_RULES.md](games/29_RULES.md)); [games/29_REPORT.md](games/29_REPORT.md)                   |

Cross-game character evaluation ([bots/CROSS_GAME_EVAL.md](bots/CROSS_GAME_EVAL.md)): identity carries
across all four games (boldness agrees with the DNA at 0.8 to 1.0 in the trick games; patience at 0.8
to 0.9 in three of four). Known limits carried to Phase 5: faint Rohit and Dhoni in 3 2 5, weak
in-session adaptation in trick games, 29 card play close to the brain.

## Analytics

**ANALYTICS PENDING: REQUIRES THE VALIDATION NIGHT.** The Atlas side is done: the schema migration
has run and production is recording. Checked read-only on 2026-10-22: 149 hands attempted, captured
and recorded, 0 failures, nothing waiting or unaccounted, across engine builds `4d00796b` to
`a090679a`; `npm run analytics:validate` passes all 13 checks (replay, privacy, chips, leaderboard,
bots, night summaries) after PR #27 fixed one false positive.

What the data does not cover yet: every recorded hand is a practice hand by one person with bots, Teen
Patti only. The validation night still needs 4+ people for 20+ hands with a Show, a pot-limit forced
show, a timeout, a disconnect and reconnect, a late reveal, a chip loan, a hidden balance, two
variants including a joker or table game, and one Hold'em or Rummy (and now 3 2 5) table. Then:

```sh
MONGODB_URI='…' npm run analytics:health
MONGODB_URI='…' npm run analytics:validate -- --since <night start ISO time>
```

Plus the two manual steps in [ANALYTICS_OPERATIONS.md](ANALYTICS_OPERATIONS.md#first-production-validation):
inspect one hand's public, private and sealed records, and compare Durable Object rows written
(Cloudflare dashboard) with the volume table.

**Rollback:** if recording misbehaves, rotate the Worker's `MONGODB_URI` to a user without access to
the analytics collections: the recorder fails closed and rooms keep playing. Dropping `hand_records`,
`hand_private`, `hand_sealed`, `night_events`, `recorder_failures`, `recorder_status` and
`analytics_meta` removes the recorded history. **Never drop `bots` or `bot_styles`:** the bot directory
depends on them.

## Art: Blender

**BLENDER PIPELINE READY: PRODUCTION ART ASSET REQUIRED.** The pipeline works
(`scripts/blender/directions_atlas.py`, branch `blender-pilot`, `docs/mascots/BLENDER_PIPELINE.md`);
its stand-in bust is not usable art. It needs one base model, from:

1. **image to 3D** from the approved 2D art (fastest; needs cleanup and a head/body split);
2. **a commissioned artist or modeller** (best quality and consistency);
3. **a properly licensed base head**, restyled per character.

No engineering work is waiting on it, and it does not block the game roadmap.

## Branches, worktrees and archives

| Branch                                                         | State                                  |
| -------------------------------------------------------------- | -------------------------------------- |
| `main`                                                         | production                             |
| `phase4`, `dhoni-canonical`, `phase2-325`, `shared-room-fixes` | merged (kept on GitHub as history)     |
| `phase3.1`, `blender-pilot`, `trick-games-plan`                | pushed records                         |
| `mascot-rollout` (local only)                                  | one unpushed commit; keep              |
| `private-club`                                                 | older parallel bot line; do not deploy |

No working worktrees remain beyond the owner's own checkout. Simulation outputs and uncommitted work
from removed worktrees are archived outside the repo in `~/chaal-archive/` (2026-10-21: bots-phase3,
navbar, phase31, blender-pilot; 2026-10-22: phase4 and phase2-325 `.sim`). Measured results that
reports cite are committed under `docs/bots/phase3`, `phase31`, `phase4/results` and
`docs/games/325-phase2/results`.
