# 10 Pakad: implementation report

Written 2026-10-22. Implements [10PAKAD_PLAN.md](10PAKAD_PLAN.md) with the ruleset locked that day
(trump set by the first player who cannot follow suit; 2-2 split to the non-dealing team; all 13 tricks;
seven-in-a-row Kot; open-ended; the centre pile shows its card count and tens).

## What was built

| Part                                                                                                                                                                               | Where                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Engine: deal 5 + 8, trump by first void (or a sealed draw after five followed tricks), centre pile with two-in-a-row collection, tens, Kots, dealer rules, leave and timeout rules | `server/tricks/ten-pakad.mjs`                                                                                |
| Bot: Game Brain `pakad@1` (Monte Carlo over hidden hands; values collections, streaks and tens), DNA personality bounded by clarity, session adaptation                            | `server/bots/tricks/bot-pakad.mjs`                                                                           |
| Bot observation and memory: the seat projection plus the tricks this seat saw                                                                                                      | `server/bots/tricks/observation-pakad.mjs`                                                                   |
| Room server, runner, directory (bots fill seats), versions (`ten-pakad@1`), replay corpus hand                                                                                     | `server/cloudflare/room-object.mjs`, `server/bots/runner.mjs`, `server/bots/directory.mjs`, `server/games/*` |
| Table UI (four seats, partner across, team scoreboard, centre pile, results with the reason), create-room option, `/games` guide                                                   | `src/lib/tricks/TenPakadTable.svelte`, `StartPanel`, `catalog.ts`                                            |
| Dev-only practice table (404 in production)                                                                                                                                        | `src/routes/test-pakad`                                                                                      |
| Simulator and evaluation                                                                                                                                                           | `server/sim/tricks/table-pakad.mjs`, `scripts/sim/pakad-eval.mjs`                                            |

## Fairness

The projection shows only the current and the last trick and, for every pile, the number of cards and of
tens. A bot remembers earlier tricks the way a person can: its mind folds each `lastTrick` it sees.
Tests swap hidden cards between other hands and the undealt pile, and change the secret salt; the bot's
decision never changes. Bot modules import no engine code.

## Evaluation (seed 61, 80 tables × 4 hands per character; `docs/games/10pakad/results/eval-61.json`)

**Competence.** The plain brain (no personality) wins 85% of hands against random players and 69%
against greedy players who always try to win the trick (2.86 and 2.58 tens a hand). Every character in
a seat of the plain brain's team is within noise of it (hands won −1 to −5 points, ± 6): personality
costs little.

**Identity** (the character in seat 0 against the plain brain in the same seat):

|             | Trumps early | Feeds a ten to a winning partner | Presses own streak (leads K, A or trump) | Contests a winnable trick |
| ----------- | -----------: | -------------------------------: | ---------------------------------------: | ------------------------: |
| Plain brain |         0.30 |                             0.90 |                                     0.57 |                      0.78 |
| Rohit       |         0.33 |                             0.89 |                                 **0.61** |                      0.80 |
| Virat       |     **0.45** |                         **0.94** |                                 **0.62** |                      0.78 |
| GG          |         0.30 |                         **0.85** |                                 **0.49** |                      0.80 |
| Samay       |     **0.41** |                             0.92 |                                     0.59 |                      0.79 |
| Dhoni       |     **0.26** |                             0.92 |                                     0.51 |                      0.77 |

Virat spends trumps early and backs his streaks; Rohit backs his own streak; GG keeps trumps, feeds tens
only when safe and rarely presses; Dhoni is the most patient with trumps. Samay's early trumping comes
from curiosity (probing suits) more than aggression. Identities are visible but modest, as in 3 2 5;
adaptation is the same session model as 3 2 5 and is not separately measured here. Both are inputs to the
cross-game character evaluation, not blockers.

## Tests

Engine 13, bots 7 (`tests/server/ten-pakad.test.mjs`, `tests/server/bot-pakad.test.mjs`), Worker 1
(`tests/cloudflare/ten-pakad.test.mjs`: four seats, a fifth refused, private hands, partnerships, rule
errors as messages, play, reconnect), replay corpus hand. Browser check of the practice table on desktop
and phone: no console errors, no horizontal overflow.
