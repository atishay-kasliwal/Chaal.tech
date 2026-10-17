# Hand recorder: operations

How the recorder (docs/ANALYTICS_SPEC.md §10.3, Phase 1) is versioned, migrated, deployed,
monitored and validated in production.

## Versioning: replay never reinterprets history

Every hand records, in `versions` (public and sealed records):

| Field | Meaning | Source |
|---|---|---|
| `engine` | Deployed build (git commit) | `ENGINE_BUILD`, stamped by `npm run deploy:backend` |
| `recorder` | Record format | `RECORDER_VERSION` in `server/analytics/recorder.mjs` |
| `game`, `gameVersion` | Game engine and its behaviour version | `GAME_VERSIONS` in `server/games/versions.mjs` |
| `rulesVersion` | Rule set played (e.g. `classic-1`) | the room |
| `variant` | Teen Patti variant id and version | the variant registry |

Bot seats additionally carry `botId`, `styleId`, `styleVersion`, `configHash` and `policy`. The
storage schema version lives in `analytics_meta`.

**Rules for changing game code:**

1. A change that does not alter recorded hands is fine. `tests/server/recorder-versions.test.mjs`
   replays a committed corpus of real recorded hands (every game and variant). If they still
   replay, exactly or compatibly, the change is replay-safe.
2. A change that alters how an existing game or variant plays is a **new version**: a new
   `rulesVersion` (e.g. `classic-2`) for a variant, or a bump in `GAME_VERSIONS` for a game
   engine. Keep the old implementation registered if hands played under it must stay replayable.
3. Adding a game or variant: run `npm run analytics:corpus` to append its hands to the corpus.
   The corpus is append-only. Existing entries stand for production history and are never
   regenerated.
4. Removing an old implementation makes its hands report `replay-unavailable`. That is
   deliberate and visible; nothing is approximated with newer behaviour.

**What replay reports:**

| Result | Meaning |
|---|---|
| `exact` | Every intermediate snapshot hashes identically. |
| `compatible` | Snapshots differ only in bookkeeping, while seats, cards, chips, turn, table cards and result (the semantic hash) match at every step. Reported as such. |
| `replay-unavailable` | This code does not implement the hand's game, game version, rules or variant version, or the hand has no engine build. The raw capture is kept (`hand_sealed`, `status: replay-unavailable`) for code that can replay it. |
| `replay-mismatch` | A real divergence: a bug or tampering. A failure row names the step; the raw capture is kept. |

Bot decisions follow the same rule. A style this code no longer implements is reported
`policy-unavailable`, never re-run with today's behaviour.

## Engine build: production cannot run unidentified

- `npm run deploy:backend` (also used by CI) runs `scripts/deploy-backend.mjs`:
  - it stamps `ENGINE_BUILD=<12-char commit>`;
  - it refuses a dirty working tree unless `--allow-dirty`, which stamps
    `<commit>-dirty-<time>` so the record says the build is not reproducible from git;
  - after deploying, it polls `/health` until production reports exactly that build, or exits 1.
- The Worker refuses all game traffic (503) and reports `/health` as 503 when `ENGINE_BUILD` is
  missing or invalid. `unknown` is not accepted.
- Local and test runs use `dev` and `test` (`npm run dev:backend`, the Cloudflare test harness).
- A Durable Object that somehow runs without a build records the hand with `engine: null`. It
  becomes a `replay-unavailable` failure (`engine-build-missing`), never an unidentified record.

## MongoDB: runtime vs migration permissions

The Worker's account (`MONGODB_URI`) never administers schema. Before writing recorder rows it
checks `analytics_meta.schema.version`. If the schema is not migrated, it throws
`SchemaNotReady`, and the rows wait in each room's durable outbox. They are visible in health,
and no unvalidated collection is ever created. Bot styles are published by migration; the
runtime only checks them.

**Migration (a person, deliberately):**

```sh
MONGODB_ADMIN_URI='mongodb+srv://<admin-user>:<password>@<cluster>/?retryWrites=true' \
MONGODB_DB=chaal npm run analytics:migrate
```

It is idempotent: it creates collections with validators (or updates validators with `collMod`),
creates indexes, seeds the legacy bots and publishes code-defined styles. It refuses to change a
published style.

**Recommended Atlas users:**

- **chaal-admin** (used only for migrations, from a person's machine): `dbAdmin@chaal` plus
  `readWrite@chaal`. Do not give this connection string to the Worker.
- **chaal-runtime** (the Worker's `MONGODB_URI`), as a custom role on database `chaal` with:
  - `find`, `insert`, `update` on `hand_records`, `hand_private`, `hand_sealed`, `night_events`,
    `recorder_failures`, `recorder_status`;
  - `find` on `analytics_meta`, `bot_styles`, `bots`;
  - the app's existing needs: `find`, `insert`, `update`, `remove` on `members`, `club_settings`,
    `club_hands`, `club_nights` and `availability`, plus `createIndex` on `club_hands` (the
    existing archive creates its index at runtime).

  No `collMod`, `createCollection` on analytics collections, `dropCollection`, or `dbAdmin`. If
  you keep the built-in `readWrite@chaal` for simplicity, the recorder still never calls schema
  operations, but the account could.

## Recorder health

```sh
MONGODB_URI=... npm run analytics:health     # read-only; exits 1 when something needs attention
```

| Question | Field |
|---|---|
| How many hands were attempted? | `attempted` (hands dealt, summed from each room's counters) |
| How many were recorded? | `recorded` |
| How many failed? Why? | `failed`, `failureReasons` (count, last time) |
| How many are waiting for retry? | `waitingForRetry.hands` / `.rows` / `.rooms` (with last error) |
| Last successful hand | `lastSuccessfulHand` |
| Anything retrying repeatedly? | `repeatedlyRetrying` (rooms with ≥ 3 consecutive failed flushes, error, since when) |
| Raw inputs kept for later rebuild | `keptForRebuild` |
| Anything silently missing? | `unaccountedHands`: hands the leaderboard archive (`club_hands`) has since recording began, with neither a record nor a failure |

Each room writes `recorder_status` after every flush. On a failed flush it still tries a separate
best-effort write, so a room stuck behind, say, a missing migration shows up with its error.
Replay verification of stored data: `npm run analytics:replay [-- --room <name> | --hand <id> | --limit n]`.

## Storage and write volume

Measured with the table simulator, including two production deck seals (6.7 KB JSON each) in
the pre-deal snapshot. Sealed inputs are gzipped. Bot randomness is one 128-bit seed per
decision, not a log of every draw.

| Six seats | Saves / hand (avg, max) | In-progress state, max | Rewritten / hand | MongoDB / hand (public + private + sealed gz) |
|---|---|---|---|---|
| 6 humans, Classic, typical | 35, 53 | 33 KB | 0.8 MB | 27 KB (16 + 2 + 9) |
| 6 humans, Classic, heavy action | 17, 52 | 33 KB | 0.4 MB | 18 KB |
| 5 humans + bot | 35, 62 | 37 KB | 0.8 MB | 28 KB |
| 4 humans + 2 bots, Kiss-Miss-Bliss, heavy | 41, 66 | 39 KB | 1.1 MB | 32 KB |

**Envelope:**

- **A two-hour night** is about 80 hands (40 an hour; 60–120 is realistic). That is roughly
  2,800–3,600 saves.
- **Durable Object, per night:**
  - the recorder adds about one SQLite row write per save, plus about 2 per hand and 2 per
    between-hand event (outbox insert and delete): about 5,000 extra rows a night;
  - the room's own saves are about 15,000 rows a night;
  - bytes rewritten are about 65 MB a night, but they are not billed (rows written and stored
    GB are);
  - CPU is about 1–2 ms per save to serialise at most 40 KB;
  - the largest single value is under 100 KB, far below Durable Object limits.
- **MongoDB:**
  - about 2.4 MB a night per table (including night events);
  - one club at 2 nights a week is about 5 MB a week, or about 250 MB a year (plus indexes);
  - ten such clubs are about 2.5 GB a year.
- **Plan limits:**
  - the free Workers plan allows 100,000 rows written a day; the paid plan includes 50 million a
    month;
  - Atlas M0 has 512 MB, which is about 1.5–2 years for one club's hands. Several clubs need a
    paid tier (M10 includes 10 GB).

**Decision: keep the full rewrite.** It is well within the envelope and is the simplest design
that is crash-safe (the in-progress hand commits atomically with the game state). If a
heavier future game pushes in-progress state past roughly 200 KB, switch to appending each step
to a `recorder_steps` SQLite table in the same transaction, assembling the capture at hand end.
That keeps the same atomicity and replay inputs.

## First production validation

`npm run analytics:validate [-- --since <ISO time>]` runs steps 4 and 6–11 below (except
Durable Object writes, which come from the Cloudflare dashboard) and prints PASS or FAIL per check.

1. **Commit and deploy.**
   - Run `npm test`, `npm run test:cloudflare`, `npm run check` and lint.
   - Commit.
   - Run `npm run deploy:backend`. It must end with `Production reports ENGINE_BUILD=<sha>`.
   - Then deploy Pages as usual.
2. **Migrate.**
   - Run `MONGODB_ADMIN_URI=… npm run analytics:migrate`.
   - Then `npm run analytics:health`: expect zeros and no errors.
3. **Play a real test night:** at least 4 people for 20 or more hands, with:
   - one table with a bot;
   - a Show;
   - a pot-limit forced show;
   - a timeout;
   - someone disconnecting and reconnecting;
   - a late reveal;
   - a chip loan;
   - a hidden balance;
   - two variants, including a joker or table game;
   - one Hold'em or Rummy table if those are played.
4. **Check health** with `npm run analytics:health`. Expect:
   - `attempted` = `recorded`;
   - `failed` = 0;
   - nothing waiting or retrying;
   - `unaccountedHands` empty.
5. **Inspect the records** for one hand: `hand_records` (public), each `hand_private`, and
   `hand_sealed` (`readSealed`).
6. **Replay** with `npm run analytics:replay`: every hand `reproduced` (or `compatible`), none
   unavailable or mismatched.
7. **Check `recorder_failures`:** expect it to be empty.
8. **Check bot identity.** Each bot seat should show `legacy-<level>`, `legacy-<level>@1`,
   version 1, the pinned `configHash`, `policy: tp-heuristic@1`, and `botTrace[].verified =
   reproduced`.
9. **Check for leaks.**
   - `hand_records` has no card of a player who never showed.
   - No `deck`, `salts`, `preDeal`, `steps` or `hiddenStacks` keys.
   - Hidden balances are null.
   - Each private record holds only its owner's cards.
10. **Check totals.**
    - Per hand, nets sum to 0 (Blackjack: against the dealer).
    - Flows reconcile to each net.
    - Each person's sum of nets over the night equals `club_hands` and the night summary's
      chips; real money agrees with settle-up.
11. **Check volume.** Collection sizes from `db.<collection>.stats()` (or the Atlas UI) per hand,
    compared with the table above; and the Durable Object's rows written from the Cloudflare
    dashboard for the night.
