# 3 2 5: rule lock proposal and Phase 2 engineering review

Written 2026-10-21 for the Phase 2 review. Sources checked again for this proposal:
[pagat.com 3-2-5](https://pagat.com/whist/3-2-5.html) and
[gamerules.com Teen Do Paanch](https://gamerules.com/rules/teen-do-paanch/). The decisions are the
eight in [325_PHASE2_REPORT.md §9](325_PHASE2_REPORT.md).

## The eight decisions

| # | Current implementation | What the sources say | Alternative | Gameplay effect | Recommendation |
|---|---|---|---|---|---|
| 1 | **Pulls happen after the full deal and after trump is chosen** | Both: pulls happen in the next round with the hand of 10 fanned; trump is chosen during the deal from the first five | Pull before trump (after five cards) | Trump is always chosen on the chooser's own first five cards, as the sources describe | **RECOMMEND KEEP** |
| 2 | **The returned card is any card except the one just pulled** | gamerules: "any other card of his choice". **pagat: the same, plus the returner must keep at least two cards in the suit of the card returned** | Adopt pagat's restriction | Without it, a puller can return a card to empty a suit and then trump that suit; with it, voids cannot be created by returning | **AMBIGUOUS: owner decision.** Recommend KEEP (gamerules) for V1: simpler to explain and to show in the UI; pagat's restriction as a rules option |
| 3 | **With several pulls, the player furthest above quota pulls first, each time from the player furthest below** | Neither states an order | Seat order; random | Order only matters when two players pull or two are pulled from; this is deterministic and visible | **RECOMMEND KEEP** |
| 4 | **Pulls carry over only between the same three players** | Silent (they assume one table of three) | Carry a departed player's debt to their replacement | A newcomer is never pulled from for someone else's round | **RECOMMEND KEEP** |
| 5 | **A person leaving mid-round ends the round unscored** | Silent | A Chaal character finishes their hand | Nobody's score depends on a hand played half by someone else; a leaver cannot dump a bad round | **RECOMMEND KEEP** for V1 (the bot-finishes option is a separate product decision: it conflates a leaver with a bot seat) |
| 6 | **A disconnected person's timed-out turn gets an automatic move** (lowest legal card; trump: longest suit; pull: first face-down card, returning their lowest card) | Silent | Pause the table; let a bot play for them | The table keeps moving; the seat stays theirs; nothing clever is done on their behalf | **RECOMMEND KEEP** |
| 7 | **Points only, cumulative tricks minus quota, no match end** | pagat: 1 point per trick, no end stated. gamerules: a game is 3 rounds, most tricks wins | A 3-round game with a winner | Over every complete cycle of three rounds each player's quotas total 10, so ranking by tricks minus quota equals ranking by tricks: the two scorings agree whenever the round count is a multiple of three | **RECOMMEND KEEP** (open-ended, scored as tricks minus quota); a "game = 3 rounds" summary is a later UI option |
| 8 | **The first dealer is the first seat in seat order; the deal rotates clockwise** | pagat: "any convenient method" (suggests drawing 5/3/2); gamerules: draw 2/3/5, the 2 deals. Direction differs between the two | Draw for the first deal | Any fair start works; roles rotate so everyone plays each quota | **RECOMMEND KEEP** |

## 3-2-5 RULE LOCK PROPOSAL (Chaal V1)

1. Pulls happen after the full deal of ten, after trump has been chosen from the chooser's first five.
2. **[Owner decision]** The returned card may be any card except the one just pulled (recommended), or pagat's
   stricter rule (the returner must keep two cards in that suit).
3. The player furthest above quota pulls first, each time from the player furthest below quota.
4. Pulls carry over only between the same three players.
5. A person leaving mid-round ends that round with no scores.
6. A timed-out turn of a disconnected person gets the simple automatic move above; bots never take the seat.
7. Scoring is cumulative tricks minus quota; the table plays as many rounds as it likes.
8. The first dealer is the first seat; the deal rotates clockwise.

Everything else is as [325_RULES.md](325_RULES.md). Only rule 2 is genuinely ambiguous across the
sources; the rest are either supported by both or choices the sources leave open. **3 2 5 waits on rule 2**
before the rules are locked; the implementation already matches the recommended reading.

## Engineering review (Phase 2 branch `phase2-325`)

| Area | Verified by | Status |
|---|---|---|
| Exactly three seats; a fourth refused | engine test, Worker test | ✓ |
| 30-card deck (8 to A, 7♥ 7♠); deal 5 / 3 / 2 | engine tests | ✓ |
| Quotas 5 / 3 / 2 by role, rotating each round | engine tests (nine rounds, each seat deals three times) | ✓ |
| Trump chosen by the 5-player from five cards; public once chosen | engine test, Worker test | ✓ |
| Follow suit; trump or discard when void; highest trump else highest of the suit led | trick tests | ✓ |
| Scoring tricks minus quota; every round sums to zero | engine test | ✓ |
| Pulls: one per extra trick, queue order, face-down positions in a secret order, return any other card | pull tests, secret-order test | ✓ |
| Face-down boundary: the puller never sees the victim's cards; only the puller learns the card taken | pull test, swap tests | ✓ |
| Round and game transitions; cards conserved | invariant on every transition, nine-round run | ✓ |
| Reconnect: same seat, same cards; others see Away at once | Worker test | ✓ |
| Leaving mid-round: round ends unscored; host passes to a person | engine test | ✓ |
| Bot seat filling; one seat per character; bots always legal | engine test, live-runner test, every bot move goes through the engine | ✓ |
| **Bots cannot see hidden cards**: the observation is built from the seat projection; bot modules cannot import the engine; swapping any card a bot cannot see, or the secret pull order, never changes its decision | bot tests (kept) | ✓ |
| Deterministic replay: a recorded 3 2 5 hand with bot steps replays exactly | replay corpus | ✓ |
| Rule errors reach players as messages (GameError) | engine `fail` | ✓ |
| UI: lobby, trump, pull, give, play, results; desktop and phone | Playwright screenshots | ✓ |
| `/test-325` is development only (its API answers 404 outside `vite dev`) | code | ✓ |

**Behaviour to note, not a defect:** like Teen Patti, bots only act while a person is connected. If the
only person disconnects mid-round, their turns time out with the automatic move and the bots' turns time
out the same way (the engine's simple automatic move, not the character), until someone returns.

## Bot evaluation verdict

From [325_PHASE2_REPORT.md](325_PHASE2_REPORT.md) and `docs/games/325-phase2/results/eval-52-p*.json`:

| Question | Answer |
|---|---|
| Do the bots play 3 2 5 competently? | Yes: every character takes about 1.9 more tricks a round than a random player, close to the plain baseline brain; no illegal moves |
| Are they recognisably themselves? | Virat clearly (identified 72%: aggressive, spends trumps early); GG (61%: strongest, most trump-efficient); Samay (50%); Dhoni faint (41%, mistaken for GG); Rohit faint (31%, mistaken for Samay) |
| Do they adapt? | Weakly: Dhoni against players who duck +0.34 ± 0.23 tricks a round; other reads are within noise |
| Do they cheat? | No: decisions depend only on the seat projection (tested by swapping every hidden card) |

**Verdict: acceptable for Phase 2 approval.** Faint Rohit and Dhoni identities and weak adaptation are
known limits for a later tuning pass, not blockers.
