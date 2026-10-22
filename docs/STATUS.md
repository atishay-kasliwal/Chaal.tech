# Chaal: current status

The canonical current-state summary. Last verified **2026-10-22**. Phase reports elsewhere in `docs/`
are historical evidence and are not rewritten; when they disagree with this page, this page is
current.

Roadmap: **3 2 5** (done) → **10 Pakad** (planned, awaiting rule decisions) → 29 → cross-game
character evaluation → Phase 5 (long-term memory).

## Production

| Part                | State                                                                         | How verified                                                      |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| main                | `304b78ea` (PRs #23, #25, #26 merged 2026-10-22), plus this status page (#24) | GitHub                                                            |
| Worker (chaal-game) | `ENGINE_BUILD 304b78eaf992` (deployed 2026-10-22)                             | `/health`                                                         |
| Pages (chaal.tech)  | build `1792675886163`, from `304b78ea` (deployed 2026-10-22)                  | page source; `/`, `/club`, `/stats`, `/bots`, `/games` return 200 |
| Sign-in             | Google client configured in the build                                         | sign-in page source                                               |
| 3 2 5               | live: create-room option and `/games` guide                                   | production page source; `/test-325` returns the 404 page          |

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

**Publication to the production database: verified plan, not published (owner approval needed).**
Production tables seat what the bot directory has published, and every character is still on its
`@2` version (main's earlier line). The read-only plan, run 2026-10-22 against Atlas, matches the
source exactly:

| Bot   | Production now   | Would publish                   | Directory hash (plan = source) |
| ----- | ---------------- | ------------------------------- | ------------------------------ |
| Rohit | `rohit-sharma@2` | next version = `rohit-sharma@3` | `13657c11ca64694c` ✓           |
| Virat | `virat-kohli@2`  | next version = `virat-kohli@3`  | `35d9023fb9525120` ✓           |
| GG    | `gg@2`           | next version = `gg@4`           | `1c634dd3cf3e50f9` ✓           |
| Samay | `samay-raina@2`  | next version = `samay-raina@3`  | `43686ccfe4328696` ✓           |
| Dhoni | `ms-dhoni@2`     | next version = `ms-dhoni@4`     | `98d41082047cd70a` ✓           |

To publish (Atlas must allow the machine; a VPN can block it):

```sh
MONGODB_ADMIN_URI='<connection string>' npm run bots:publish-dna                              # plan
MONGODB_ADMIN_URI='<connection string>' npm run bots:publish-dna -- --publish --descriptions  # publish
```

The script publishes each bot's next immutable directory version, refuses unless the drafted hash and
genes equal the reference exactly, skips bots already on their reference, and never edits an earlier
version.

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

Deliberately after 10 Pakad and 29, so the memory architecture is not Teen-Patti-specific.

publicly observable information only → bounded summary → confidence → decay → returning-player prior
→ new evidence overrides stale memory.

No live retraining, no hidden cards, no automatic DNA changes, no neural or RL system. Gated by the
same eight gates. Name clash: [ANALYTICS_PHASE5.md](ANALYTICS_PHASE5.md) is the analytics
"intelligence layer", not this.

## Games

| Game                                                | State                                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Teen Patti (26 variants), Hold'em, Blackjack, Rummy | live; rule errors reach players as messages and a dropped player shows Away at once (PR #23)                         |
| 3 2 5                                               | **Phase 2 approved and live**; rules locked in [games/325_RULE_LOCK.md](games/325_RULE_LOCK.md) (canonical)          |
| 10 Pakad                                            | **planned, not implemented**: [games/10PAKAD_PLAN.md](games/10PAKAD_PLAN.md); six rule decisions for the owner (§15) |
| 29                                                  | not started; after 10 Pakad is implemented and reviewed                                                              |

3 2 5 known limits, for the cross-game character evaluation (not blockers): faint Rohit and Dhoni
identities and weak adaptation.

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

## ATO

Conference follow-ups are separate from Chaal and need the owner's contact and meeting details. No
contacts are invented.

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
