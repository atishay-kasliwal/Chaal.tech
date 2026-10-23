# The Chaal League

The `/bots` page is one members-only page: championship scene, net-profit standings, expandable character profiles, paired profit gaps, history, and the development journal. Existing `/bots/[botId]` routes remain compatible.

## Recorded inaugural result

`shared/league-results.json` contains the completed 2026-10-22 New York competition, not a placeholder. It ran 1,000,000 shared Classic Teen Patti hands (5,000,000 player participations) in 2,373.952 seconds with five simulation workers. Dhoni `ms-dhoni@4` won. All five canonical reference hashes are recorded. The engine baseline commit is in the report; the competition protocol is `chaal-league@1`.

The initial 5,000-hand benchmark used an archived roster and is excluded from public history. The first interrupted million-hand attempt also used that archived roster; it produced no published result. The completed inaugural run uses `CANONICAL_STYLES`, including Dhoni's approved Phase 4.1 policy.

## Competition rules

- Five canonical characters, Classic Teen Patti, 100 starting bets per player, automatic rebuys excluded from net profit.
- A shuffled 100-hand deck block is replayed under five cyclic seat rotations. Every character receives every seat's cards. Decision draws are seeded independently per seat.
- Fresh per-session minds, no production-player histories, no automatic policy changes.
- Rank by net profit in starting bets; display profit per 100 hands and hand wins separately.
- Per-player 95% intervals and paired between-player gaps are computed over independent five-rotation blocks, not individual correlated hands.
- Award a daily title only if the leader's paired 95% gap exceeds zero against every other player. This is a comparison rule, not a simultaneous family-wise 95% guarantee. Close results have a leader but no title.
- The rivalry grid is relative earnings at the same five-player tables, not heads-up win rates.

## Run and publish

```sh
npm run league:run
npm run league:run -- --kind benchmark --hands 5000
npm run league:run -- --kind exhibition --hands 10000 --seed 1234
npm run league:publish -- data/league/daily-20261022.json
```

Default daily size is 1,000,000 shared hands. Hands must be a multiple of 500. Five workers are used by default, or fewer on smaller machines. `--threads N` changes the cap. Results are atomically saved under ignored `data/league/`; failed or interrupted runs never publish partial standings. A PID lock prevents overlap and a dead runner's lock can be recovered automatically. Completed history is immutable, so uploading the same file is safe but replacing it with different results is refused. Keep local completed reports and publication markers.

The preferred publisher POSTs summaries to `/admin/bots/league` using `LEAGUE_PUBLISH_URL` and `LEAGUE_PUBLISH_KEY`. This credential can append validated league summaries only; it grants no access to members, player histories, bot policies or live tables. Configure it with:

```sh
node scripts/league/configure-publisher.mjs --configure
```

This installs the Worker secret and saves the local credential in ignored `.env`, never source control or command arguments. Deploy the new Worker route before uploading a result. Direct Mongo publishing is also supported with `MONGODB_ADMIN_URI` or an application `MONGODB_URI` that can write `bot_league_runs`. The Mac's direct Atlas connection timed out during implementation, so HTTPS publishing avoids that dependency.

`GET /bots/league` requires club membership. It merges the inaugural snapshot with the latest 90 database records and exposes no storage IDs. On refresh failures the page retains its bundled result and clearly says it may be stale. Simulation history never counts as a member's real games.

## Daily schedule

The accepted timezone is **America/New_York**, including daylight saving transitions. Install after the production endpoint and publisher credential are ready:

```sh
npm run league:install
```

This installs `~/Library/LaunchAgents/tech.chaal.bot-league.plist`. Launchd checks every five minutes and starts one run for the current New York date at or shortly after 07:00. It catches up when the Mac wakes. It does not run missed historical days. The Mac must be awake and online. Completed local runs are uploaded without replaying them; a failed upload retries on the next check. Logs: `data/league/schedule.log` and `schedule-error.log`. Hourly matches are deliberately disabled: the measured million-hand run costs about 40 minutes on this machine.

The production runner lives in the ignored `.league-runner/` worktree, pinned to its release commit. It uses its own copy of the league-only publisher credential. Update this checkout deliberately when adopting a new canonical bot version; a competition never changes its bots midway through a run. The LaunchAgent uses this pinned checkout path. Install it from the permanent checkout intended to host the competition; do not remove or rename that checkout. To disable:

```sh
launchctl bootout gui/$(id -u)/tech.chaal.bot-league
```

## Verification

- `node --test tests/server/bot-league.test.mjs`: seat fairness, complete/zero-sum accounting, close finishes, New York DST boundaries and publisher validation.
- `CF_TEST_ONLY=league.test.mjs npm run test:cloudflare`: real Worker, database and browser; membership, scoped uploads, immutability, inline history/player selection and desktop/phone layout.
- `/test-league` is development-only and returns 404 in production.
