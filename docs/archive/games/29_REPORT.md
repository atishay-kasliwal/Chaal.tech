# 29: implementation report

Written 2026-10-22. Implements [29_RULES.md](29_RULES.md) (locked that day).

## What was built

| Part                                                                                                                                                                                                                                                     | Where                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Engine: deal 4 + 4, auction, secret trump with the face-down card, asking for trump, the Pair, scoring to ±6, annulment, leave and timeout rules                                                                                                         | `server/tricks/twenty-nine.mjs`                             |
| Bot: Game Brain `g29@1` (bid estimate, trump choice, Monte Carlo play over hidden hands including the face-down card), DNA personality bounded by clarity, session adaptation (opponents' beat and trump rates; how often the other side makes its bids) | `server/bots/tricks/bot-29.mjs`                             |
| Observation and memory: the seat projection plus the tricks this seat saw; trump only when the seat may know it                                                                                                                                          | `server/bots/tricks/observation-29.mjs`                     |
| Room server, runner, directory, versions (`twenty-nine@1`), replay corpus hand                                                                                                                                                                           | shared trick-game registry                                  |
| Table UI (bidding, secret trump for the bidder, Ask for trump, Declare Pair, points and target, ±6 game track), create-room option, `/games` guide                                                                                                       | `src/lib/tricks/TwentyNineTable.svelte`                     |
| Dev-only practice table (404 in production)                                                                                                                                                                                                              | `src/routes/test-29`                                        |
| Simulator and evaluation                                                                                                                                                                                                                                 | `server/sim/tricks/table-29.mjs`, `scripts/sim/29-eval.mjs` |

## Fairness

Trump is in a seat's projection only for the bidder, or for everyone once asked for; the face-down card
only for the bidder. Tests swap hidden cards and the face-down card itself (changing the trump suit) and
require the same decision from any seat that cannot know it.

## Evaluation

**Bid calibration.** The bid estimate's offset was chosen by simulation (seed 3, 240 hands per value):
the plain brain's team wins the most hands at offset 5 (75% against random players, 63% against greedy
players who bid on two J/9 cards and take every trick they can), making 67% of its bids against greedy
players. Higher offsets overbid (11: 42% made against greedy).

**Characters** (seed 71, 60 tables × 6 hands; `docs/games/29/results/eval-71.json`): every character in
a seat of the plain brain's team is within noise of it (hands won −1.4 to +1.9 points, ± 2 to 4).

|             | Bids when it may | Makes its bid | Trumps while able to follow | Gives points to a winning partner |
| ----------- | ---------------: | ------------: | --------------------------: | --------------------------------: |
| Plain brain |             0.28 |          0.65 |                        0.61 |                              0.96 |
| Rohit       |         **0.35** |          0.61 |                        0.61 |                              0.97 |
| Virat       |         **0.37** |          0.61 |                        0.63 |                              0.97 |
| GG          |         **0.26** |          0.65 |                        0.61 |                              0.95 |
| Samay       |             0.29 |      **0.67** |                        0.61 |                              0.96 |
| Dhoni       |         **0.26** |      **0.67** |                        0.59 |                              0.97 |

Identity shows in the bidding: Virat and Rohit bid more and make less; GG and Dhoni bid less and make
more. In card play the characters are close to the brain (trick play in 29 is mostly forced by points
and following suit, and the brain's evidence is clear more often than in 3 2 5 or 10 Pakad, so the
clarity bound leaves personality little room). Recorded for the cross-game character evaluation.

## Tests

Engine 10, bots 6 (`tests/server/twenty-nine.test.mjs`, `tests/server/bot-29.test.mjs`), Worker 1
(`tests/cloudflare/twenty-nine.test.mjs`: four seats, the auction, trump secret to all but the bidder,
out-of-turn errors as messages, a reconnect with trump still secret), replay corpus hand. Browser check
of the practice table on desktop and phone: no console errors, no horizontal overflow.
