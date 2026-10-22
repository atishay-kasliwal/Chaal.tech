# Chaal: current status

The one place for "where is everything". Last verified **2026-10-21**. Phase reports elsewhere in
`docs/` are historical records and are not rewritten; when they disagree with this page, this page is
current.

## Production

| Part | State | How verified |
|---|---|---|
| Pages (chaal.tech) | build `1792632850685`, from `origin/main` `9262e929` (PR #22) | page source; `/`, `/club`, `/stats`, `/bots`, `/games` return 200; Google sign-in configured |
| Worker (chaal-game) | `ENGINE_BUILD a090679aa7eb` | `/health` |
| Worker vs main | nothing to deploy: `a090679a..9262e929` changes no `server/`, `shared/`, `wrangler` or package files (PRs #19 to #22 were frontend only) | `git diff --stat` |

Deploys are manual from the owner's Mac: Worker (`npm run deploy:backend`, which stamps and checks
`ENGINE_BUILD`), then Pages. Deploy only `origin/main`. No redeploy is needed today.

## Canonical bots (Teen Patti)

Source: [bots/CANONICAL.md](bots/CANONICAL.md), frozen in [bots/phase4/champions.json](bots/phase4/champions.json) (on the `phase4` branch).

| Character | Reference | Policy | Reference hash |
|---|---|---|---|
| Rohit | `rohit-sharma@3` | `tp-dna@3` / `mind@1` | `f2015fc5daf490a9` |
| Virat | `virat-kohli@3` | `tp-dna@3` / `mind@1` | `ecd01fe38fca321d` |
| GG | `gg@4` | `tp-dna@4` / `mind@2` | `862f1cd78b2c4597` |
| Samay | `samay-raina@3` | `tp-dna@3` / `mind@1` | `7d7e81874eb7ddf7` |
| Dhoni | `ms-dhoni@3` | `tp-dna@3` / `mind@1` | `2db238f3b5d01784` |

**Publication to the production database: unverified.** The read-only plan
(`npm run bots:publish-dna`, which prints what would be published) could not reach Atlas from the
build machine (connection reset: the Atlas network access list). To check, from an allowed machine:

```sh
MONGODB_ADMIN_URI='<admin connection string>' npm run bots:publish-dna                              # plan only
MONGODB_ADMIN_URI='<admin connection string>' npm run bots:publish-dna -- --publish --descriptions  # only with approval
```

**Known, intentional weaknesses (kept; they are the characters):**

- **Rohit**, blind pride: stays blind longer than is wise, so repeated blind raising costs him.
- **GG**, reads by style: a player who plays tight and then switches to bluffing can push GG off
  hands for a while.
- **Samay**, the caller: calls too often and rarely takes the initiative; a patient value player
  profits.
- **Virat**, temporary tilt: after a painful loss he plays looser for a few hands.
- **Dhoni** (the shared base brain, all tp-dna@3 characters): blind play does not price a stake that
  other blind players keep raising. Phase 4.1 has a candidate fix awaiting approval (below).

**Samay finding (design, not a bug):** Phase 4 could not make Samay take the initiative without
breaking his identity: the quirk form is capped (about -0.012 in fold rate), the read form costs
regression bands and bad actions. His passivity needs memory across nights (what this table punishes),
which is Phase 5, not a tuning change.

## Bot phases

| Phase | State | Where |
|---|---|---|
| 1, 1.1, 2, 3 | done, on main | [bots/](bots/) reports |
| 3.1 | done; baseline `a090679a` | branch `phase3.1` (report and results) |
| 4 (exploit search, league, gates) | **closed**: every champion kept | branch `phase4`, `docs/bots/PHASE4_REPORT.md` |
| 4.1 (Dhoni blind raises) | **candidate awaiting approval**: `ms-dhoni@8-blindraises` passes all 8 gates (exploit +1,227 ± 33 boots/100, strength -1 ± 140, no counter-exploit regression); `ms-dhoni@9` fails personality | branch `phase4`, `docs/bots/PHASE41_REPORT.md` |
| 5 (long-term memory) | **direction only, not started** | below |

`phase4` is not merged. Adopting C1 would mean: merge `phase4`, add `ms-dhoni@4` as canonical with its
hash, update `CANONICAL.md` and the digest lock, deploy the Worker, then publish. Until then
`ms-dhoni@3` is canonical.

### Phase 5 direction (not started)

Per-character memory across nights, built only from what that character could observe at the table
(its own projections), stored per club, decaying with time. It is where Samay learns which tables
punish passivity and where reads of regulars persist. It must not change identities, must stay
interpretable (counts with confidence, no neural or RL policy), and is gated by the same eight gates.
Note the name clash: [ANALYTICS_PHASE5.md](ANALYTICS_PHASE5.md) is the analytics "intelligence layer"
(already on main), not this.

## Games

| Game | State | Waiting on |
|---|---|---|
| Teen Patti (26 variants), Hold'em, Blackjack, Rummy | live | |
| Rummy "Game service unavailable" | **fixed in PR #23** (open, not merged): rule errors in Rummy, Blackjack and Hold'em are `GameError`s, so players see the reason; a dropped player shows Away at once | review and merge; then Worker deploy only |
| 3 2 5 | Phase 2 built on branch `phase2-325` (engine, bots, UI, Worker test); not merged, not deployed | rule 2 of [games/325_RULE_LOCK.md](https://github.com/atishay-kasliwal/teenpatti/blob/phase2-325/docs/games/325_RULE_LOCK.md) (return-card restriction), then Phase 2 approval |
| 10 Pakad | not started | 3 2 5 approval; then one pinned written ruleset (decision R4 in `TRICK_GAMES_PHASE1.md`: trump selection, 2-2 tens tie-break, early stop, Kot scoring) |
| 29 | not started | 10 Pakad review |

## Analytics

All analytics code (recorder, compute, `/stats`, intelligence, bot memory) is on main. **Production
recording is not active yet:** the Atlas schema migration has not run, so the Worker refuses recorder
writes (`SchemaNotReady`) and rows wait in each room's outbox.

**Not complete.** The procedure, with every check, is in
[ANALYTICS_OPERATIONS.md: First production validation](ANALYTICS_OPERATIONS.md#first-production-validation). In short:

1. Allow the owner's machine in Atlas Network Access; create `chaal-admin` (dbAdmin + readWrite on
   `chaal`) and, separately, `chaal-runtime` for the Worker (custom role in that doc).
2. `MONGODB_ADMIN_URI='…' MONGODB_DB=chaal npm run analytics:migrate`, then
   `npm run analytics:health` (expect zeros, no errors).
3. Play a validation night (4+ people, 20+ hands, the scenario list in the doc).
4. `npm run analytics:validate -- --since <night start ISO time>`: every check PASS.

**Rollback:** the migration only creates collections, validators, indexes and published styles and is
idempotent; it deletes nothing. If recording misbehaves, rotate the Worker's `MONGODB_URI` to a user
without access to the analytics collections: the recorder then fails closed and rooms keep playing,
with rows held in their outboxes. Dropping the new collections (`hand_records`, `hand_private`,
`hand_sealed`, `night_events`, `recorder_failures`, `recorder_status`, `analytics_meta`) returns the
database to its pre-migration state; existing club data is in other collections. **Never drop `bots` or
`bot_styles`:** the migration only adds missing entries there, and the bot directory depends on them.

## Art: Blender (external dependency)

The pipeline works (`scripts/blender/directions_atlas.py`, branch `blender-pilot`,
`docs/mascots/BLENDER_PIPELINE.md`), but its stand-in bust is not usable art. It needs a base model, one
of:

1. **Image to 3D** from the approved 2D art: fastest; needs mesh cleanup and a head/body split.
2. **An artist** sculpts and rigs the five busts: best quality and consistency.
3. **A licensed base head** restyled per character.

Owner decision and an outside art source. No code work is waiting on it.

## Branches and worktrees

| Branch | State |
|---|---|
| `main` | production |
| `phase4` | Phase 4 + 4.1, unmerged (decision pending) |
| `shared-room-fixes` | PR #23, open |
| `phase2-325` | 3 2 5 Phase 2 + rule lock, unmerged |
| `phase3.1`, `blender-pilot`, `trick-games-plan` | pushed; records |
| `mascot-rollout` (local only) | one unpushed commit; keep |
| `private-club` | the older parallel bot line; do not deploy |

Removed worktrees on 2026-10-21 (branches kept): `bots-memory-fix`, `phase31`, `blender-pilot`,
`bots-phase3`, `navbar`. Their uncommitted work and simulation outputs (including the Phase 3 trial
files) are archived outside the repo in `~/chaal-archive/2026-10-21-worktree-*`.
