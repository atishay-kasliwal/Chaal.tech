# 3 2 5: Phase 2 report (stopped for review)

Branch `phase2-325` (from `trick-games-plan`). **Not merged, not deployed.** 10 Pakad has not been started.
Written 2026-10-21. Rules: [docs/archive/games/325_RULES.md](325_RULES.md). Plan: [TRICK_GAMES_PHASE1.md](TRICK_GAMES_PHASE1.md).

## 1. Summary

3 2 5 plays end to end on Chaal, against people or the five Chaal characters:

- **Engine** (`server/tricks/three-two-five.mjs`, shared primitives in `server/tricks/cards.mjs`):
  the 30-card deck, 5/3/2 quotas by role, trump chosen from the first five cards, the deal in packets
  of 5, 3 and 2, legal play and trick resolution, quota tracking, **pulling as its own phase with the
  pulled card unknown to the puller**, dealer rotation, scoring, timeouts, bot seats.
- **Room server**: a new game type alongside Hold'em, Blackjack and Rummy (`server/games`), a
  `trickAction` socket event, the 30-card deck, bots planned and moved by the existing runner.
- **Bots**: one Rohit, one Virat, one GG, one Samay, one Dhoni. Each is its canonical DNA plus the
  3 2 5 Game Brain plus session adaptation (`server/bots/tricks/`). No per-game characters.
- **UI**: a table screen (lobby, seats, trump choice, face-down pull, play, round results), 3 2 5 in
  Create room, and a development-only practice table (`/test-325`) on the real engine and bots.
- **Seats**: empty, person, bot and disconnected person are separate states. The host fills empty
  seats with characters; a disconnected person keeps their seat (and gets a simple automatic move only
  when their turn runs out); bots never take over a person's seat.

## 2. Rules implemented

Exactly [325_RULES.md](325_RULES.md) (Chaal V1): 8 to A of every suit plus 7♥ and 7♠; the 7s are ordinary
cards; quotas 5 (first player after the dealer), 3, 2 (dealer); the 5-player chooses trump after five
cards; follow suit, else trump or discard; highest trump, else highest of the suit led; score = tricks
minus quota, cumulative; pulls from the second round, one per extra trick, furthest above pulls first from
furthest below; the puller picks a face-down position and returns any other card.

## 3. Architecture (the Phase 1 interfaces, as built)

| Interface                | Where                                    | What it is                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Game engine              | `server/tricks/three-two-five.mjs`       | pure `transition`, `projection`, `invariant`, like the other games                                                                                                                                                        |
| **BotObservation**       | `server/bots/tricks/observation-325.mjs` | built from the seat projection only, deep-frozen: own cards, trump, quotas, tricks won, current and completed tricks, counts, public voids, unseen-card set, pull counts                                                  |
| **GameBrain**            | `brain()` in `bot-325.mjs`               | utilities a competent, personality-free player gives each move: Monte Carlo trick win chance over deals consistent with public voids, target pressure, card conservation                                                  |
| **CharacterPersonality** | `personality()` in `bot-325.mjs`         | the same DNA traits, translated: risk contests uncertain tricks, aggression spends strength early, patience keeps trumps, curiosity probes new suits; capped and **bounded by the brain's evidence clarity**              |
| **SessionAdaptation**    | `observe325`, `opponentModels`           | per opponent, how often they ruff when out of a suit and how often they play to win a trick; confidence grows with observations, older ones fade, weighted by adaptability; changes the opponent model inside the sampler |

Memory scopes: round and game (from the observation), session (the bot's mind in the room, one per bot,
folded only from its own views), character (canonical DNA, permanent). Personality for trick games comes
from each character's canonical DNA (`server/bots/dna-styles.mjs`), not the published Teen Patti style,
so the club directory seats any of the five characters at a 3 2 5 table.

## 4. Tests

| Suite                                                                                                                                                                                                                                                                                         | Result  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `tests/server/three-two-five.test.mjs` (deck, trick rules, a full round, nine random rounds, pulls, the secret pull order, swap invariance of seat views, timeouts and leaving, bots filling seats)                                                                                           | 9 / 9   |
| `tests/server/bot-325.test.mjs` (bot modules import no engine code; the observation is the seat view only and frozen; **swapping cards the bot cannot see, and the secret pull order, never changes its decision**; the live runner path with minds; every character clears a strength floor) | 5 / 5   |
| `tests/cloudflare/three-two-five.test.mjs` through the real Worker and Durable Object: three seats and a fourth refused, private hands, public trump, **a player drops (others see them away), comes back to the same seat and cards**, the first card reaches everyone                       | 1 / 1   |
| Full server and Worker suites, lint, svelte-check, build                                                                                                                                                                                                                                      | see §11 |

## 5. Simulation (22,320 rounds and about 787,000 decisions per run, three runs; 1.8 ms per decision)

`node scripts/sim/325-eval.mjs --seed 52 --persona <k>` writes `.sim/325/eval-52-p<k>.json`. Every
comparison is matched: the same deals and the same draws for the other seats; only the hero changes.
Rounds of 12 per table; 80 tables per hero for strength, 160 mixed-character sessions for identity,
30 tables per opponent habit for adaptation.

### 5.1 Personality strength: finding the middle ground

| Personality strength | Characters identified blind from 12 rounds (chance 20%) | Virat vs baseline |        Samay |        Rohit |        Dhoni |           GG |
| -------------------- | ------------------------------------------------------: | ----------------: | -----------: | -----------: | -----------: | -----------: |
| 1x                   |                                                     43% |      -0.37 ± 0.16 | -0.22 ± 0.15 | -0.14 ± 0.14 | -0.01 ± 0.13 | +0.03 ± 0.12 |
| **2x (chosen)**      |                                                 **51%** |      -0.53 ± 0.16 | -0.28 ± 0.14 | -0.12 ± 0.14 | -0.04 ± 0.13 | +0.13 ± 0.13 |
| 3x                   |                                                     56% |      -0.87 ± 0.18 | -0.36 ± 0.14 | -0.22 ± 0.15 | -0.01 ± 0.13 | +0.15 ± 0.14 |

(Tricks over quota per round, character minus the personality-free baseline in the same seat; 95%.)
At 1x the characters were too alike; at 3x Virat's play collapsed. **2x** (`PERSONA_SCALE`) keeps
everyone except Virat within a quarter trick of the baseline while identity rises to 51%.

### 5.2 Strength and roles (2x)

|                                 | Tricks over quota per round | Quota made as the 5 | as the 3 | as the 2 |
| ------------------------------- | --------------------------: | ------------------: | -------: | -------: |
| Random legal player             |                -1.71 ± 0.12 |                  3% |      28% |      41% |
| Baseline brain (no personality) |                +0.21 ± 0.20 |                 47% |      69% |      78% |
| GG                              |                       +0.42 |                 50% |      69% |      82% |
| Dhoni                           |                       +0.09 |                 40% |      65% |      78% |
| Rohit                           |                       +0.09 |                 40% |      67% |      78% |
| Samay                           |                       -0.19 |                 37% |      55% |      72% |
| Virat                           |                       -0.40 |                 36% |      50% |      63% |

(Characters from the mixed-character tables.) Every character is far above random (about +1.9 tricks a
round) and close to the baseline. **Seat and role advantage** among identical baseline players:
5-role -0.90 ± 0.13, 3-role +0.19 ± 0.12, 2-role +0.70 ± 0.11 tricks against quota. The 5 is the hardest
quota, which is the game's design; roles rotate, so it evens out over three rounds. Round-to-round
spread: about ±2 tricks (standard deviation) for every player.

### 5.3 How each character plays (fingerprints, mixed tables)

|          | Contests uncertain tricks | Leads trump in the first three tricks | Leads a new suit | Ruffs that win | Trumps that lose | Decisions where personality changed the best move |
| -------- | ------------------------: | ------------------------------------: | ---------------: | -------------: | ---------------: | ------------------------------------------------: |
| Baseline |                       83% |                                   28% |              39% |            95% |              38% |                      (24%: noise and close calls) |
| Virat    |                   **94%** |                               **36%** |              42% |            94% |          **46%** |                                           **35%** |
| Rohit    |                       92% |                                   32% |              40% |            95% |              38% |                                               25% |
| Samay    |                       91% |                                   35% |          **44%** |            92% |              42% |                                               27% |
| Dhoni    |                       88% |                                   25% |              39% |        **97%** |              39% |                                               21% |
| GG       |                       87% |                                   28% |              34% |            94% |          **36%** |                                               20% |

Blind identification (nearest centroid, leave one out, 160 sessions): Virat 72% recognised, GG 61%,
Samay 50%, Dhoni 41%, Rohit 31%. The confusions are honest: Rohit and Samay play alike in 3 2 5 (both
mid-risk, curious), and Dhoni and GG both play disciplined, trump-efficient cards.

### 5.4 Adaptation (adaptive minus the same character without session learning, tricks per round)

| Opponent habit                 |        Rohit |        Virat |           GG |        Samay |            Dhoni |
| ------------------------------ | -----------: | -----------: | -----------: | -----------: | ---------------: |
| Hoards trump (never ruffs)     | +0.03 ± 0.21 | +0.18 ± 0.26 | +0.17 ± 0.17 | +0.23 ± 0.22 |     +0.12 ± 0.26 |
| Ruffs whenever out of a suit   | +0.20 ± 0.26 | -0.02 ± 0.13 | +0.03 ± 0.16 | +0.13 ± 0.27 |     -0.18 ± 0.21 |
| Never contests a trick (ducks) | +0.13 ± 0.18 | -0.05 ± 0.23 | +0.18 ± 0.26 | +0.03 ± 0.29 | **+0.34 ± 0.23** |

Learning responds to specific behaviour (against duckers, Dhoni, the most adaptable, gains a third of a
trick a round; against trump hoarders most characters gain a little), and it does not simply turn
aggressive over time. But the effects are small and most intervals include zero. **This is the weakest
part of Phase 2** (see §8).

## 6. For each character

|           | Same character?                                           | Personality visible?               | Does it hurt competence?                              | Useful adaptation?             | Information it should not have? |
| --------- | --------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | ------------------------------ | ------------------------------- |
| **Rohit** | Mid-risk contests, average trumping                       | Weakly: most confused with Samay   | No (-0.12)                                            | Small, mostly within noise     | No                              |
| **Virat** | Yes: contests everything, leads trump early, burns trumps | Clearly (72% recognised)           | Yes, the most (-0.53): his weakness, as in Teen Patti | Little                         | No                              |
| **GG**    | Yes: patient, wastes fewest trumps                        | Clearly (61%)                      | No: the strongest (+0.13)                             | Small, helps against hoarders  | No                              |
| **Samay** | Curious: leads new suits most                             | Moderately (50%)                   | Some (-0.28)                                          | Small                          | No                              |
| **Dhoni** | Disciplined, most efficient ruffs                         | Moderately (41%, confused with GG) | No (-0.04)                                            | The clearest (against duckers) | No                              |

No bot can see hidden information: the observation is built from the seat projection alone, bot modules
cannot import the engine (test), and swapping any card a bot cannot see (or the secret pull order)
leaves every decision identical (test, across 40+ decisions per run).

## 7. Screenshots

Desktop: [lobby](325-phase2/lobby-1440.png), [choosing trump](325-phase2/t325-trump-1440.png),
[a trick](325-phase2/t325-play-1440.png), [round results](325-phase2/t325-results2-1440.png).
Phone: [a trick](325-phase2/t325-play-390.png), [pulling face down](325-phase2/t325-pull-390.png),
[returning a card](325-phase2/t325-give-390.png).

## 8. Known weaknesses

- **Adaptation is weak.** The opponent model has two numbers per player (ruff rate, contest rate) and
  only changes trick win estimates. It does not yet model leads, trump counts left, or a player's quota
  pressure. Next: richer opponent features and longer sessions.
- **The brain looks one trick ahead.** It does not plan sequences (drawing trumps, setting up a long suit).
  Strong enough to be credible, not expert.
- **Rohit's 3 2 5 identity is faint.** His Teen Patti signature (blind pride) has no 3 2 5 analogue,
  so his identity here rests on mid-range traits shared with Samay. A per-game expression for "pride"
  (for example refusing to give way when challenged for a trick) would help.
- **Trump choice is near-identical across characters** (all pick their longest suit). Personality
  could show in choosing a strong short suit versus a long weak one.
- **Pull return is a simple rule** (return the least useful card, prefer creating a void when holding
  trump). It does not consider what the receiver might need.
- **Turn time** uses the room's existing turn length (60 s); 3 2 5 has ten quick decisions per round,
  so a shorter turn might suit it (product decision).

## 9. Rule decisions that surfaced during implementation (please confirm)

1. **Pulls happen after the full deal and after trump is chosen.** The 5-player chooses trump from their
   own first five cards, before any card changes hands.
2. **The returned card can be any card except the one just pulled.**
3. **Order with several pulls:** the player furthest above quota pulls first, each time from the player
   furthest below quota.
4. **Pulls carry over only between the same three players.** If anyone changed, the next round has no pulls.
5. **A person leaving mid-round ends the round unscored.** (Alternative: a bot finishes their hand.)
6. **A disconnected person's timed-out turn gets an automatic move:** lowest legal card; trump: their
   longest suit; pull: the first face-down card, returning their lowest card.
7. **Points only, no chips, no match end.** The host deals as many rounds as the table likes.
8. **The first dealer** is the first seat in seat order; the deal rotates clockwise.

## 10. Shared fixes found along the way

- **The room server reported rule errors as "Game service unavailable"** unless they were `GameError`s.
  3 2 5 now throws `GameError`s. Rummy has the same problem (not changed here).
- **A dropped player was shown as connected until the next update.** The room server now leaves the
  closing socket out when it announces the disconnect, so others see "Away" at once (all games).

## 11. Final checks

| Check                                   | Result                                                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (server)                     | **657 / 657**                                                                                                                                                                       |
| `npm run test:cloudflare` (real Worker) | **27 / 28**: the one failure is the Bots memory-card text regression from the Games and Bots redesign (#20), already fixed in PR #22 (27 / 27 there); this branch predates that fix |
| Replay corpus                           | a recorded 3 2 5 hand (with bot steps) added; it replays exactly (`npm run analytics:corpus`, `recorder-versions.test.mjs` 12 / 12)                                                 |
| `npm run lint`, `npm run check`         | clean (0 errors, 0 warnings)                                                                                                                                                        |
| Production build                        | passes                                                                                                                                                                              |

Not merged, not deployed. 10 Pakad not started. Stopped for review.
