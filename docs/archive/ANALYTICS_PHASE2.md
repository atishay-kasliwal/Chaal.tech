# Analytics Phase 2: computation layer and Stats

Phase 2 turns the permanent hand history (Phase 1, docs/archive/ANALYTICS_OPERATIONS.md) into one reusable
analytics layer and a player-facing Stats page. Everything here is computed from the public and
private tiers that the recorder writes. Nothing reads the sealed tier.

## Architecture

```
hand_records / hand_private        raw, permanent (Phase 1)
        │  server/analytics/data.mjs        loaders with purpose-built projections
        ▼
server/analytics/compute/
  facts.mjs        one public record → canonical per-seat facts (the only place chips become units)
  performance.mjs  filters, results, fair share, games/variants, trends, windows
  patterns.mjs     decision extraction with legal-option denominators; rates; situations
  cards.mjs        own-card analytics; deck fairness
  rivals.mjs       head to head from shared hands
  history.mjs      nights, hands, observer-filtered hand detail
  insights.mjs     structured insight engine with multiple-comparison control
  stats.mjs        intervals, tests, shrinkage, BH, chi-square, evidence wording
        ▼
server/analytics/api.mjs           validated filters → computation → response (no raw documents)
        ▼
Worker GET /analytics/:view        signed-in member only; the viewer is never a parameter
Worker GET /admin?analytics=…      owners; same layer, public records only
        ▼
src/lib/analytics/                 StatsView + sections + SVG charts; /stats (members)
```

Every compute function is pure and takes a subject: a playerId, or `bot:<botId>` for a permanent
bot. Bot analytics, human-vs-bot views, post-game summaries and admin insights reuse the same
functions; there is no separate bot analytics stack (see the "bot" test in
tests/server/analytics-compute.test.mjs).

## Canonical definitions

| Metric | Definition |
|---|---|
| Stake unit | Teen Patti: the table's boot. Hold'em: big blind. Blackjack: the player's own opening bet. Rummy: points (no stake). |
| Boots (`units`) | Hand net ÷ stake unit. Teen Patti, Hold'em and Blackjack add up as "boots"; Rummy is reported in points and never added in. |
| Complete hand | Has a result. A hand stopped mid-way (night ended, refunds) counts for nothing in results. |
| Win credit | 1 for a sole winner, 1/k for each of k winners of a split pot. Blackjack: a net-positive hand. |
| Fair share | 1 / players dealt in. Blackjack has none (it is against the dealer). |
| Wins vs fair share | Σ win credit against Σ fair share. Variance Σ p(1−p), giving a z-test, a ratio and its range. |
| Boots a hand | Ratio of totals with nights as clusters (hands in one night are not independent), with a 95% interval. |
| Verdict | `winning` / `losing` only when the interval excludes 0; `about-even` otherwise; `insufficient` under 20 hands. |
| Best / worst game | The top two groups, each with at least 50 hands, differ at p < 0.05; otherwise "no clear best game yet". Ranked on shrunk values. |
| Most played / most won | By hands; by total boots (at least 50 hands). Reported separately from "best". |
| Rival result | Σ chip flows between the two players only (the recorder's flow rule), in the viewer's units, night-clustered. |
| Showdown | Both players reached the end of the hand (won or lost, not packed). |
| Opportunity | A decision where the action was legal, from the recorded legal options. Timeouts and system events are never decisions. |

Loans, rebuys and hidden balances are handled before analytics by the recorder's outcome nets:
loans never count, and a hidden stack never appears.

## Statistical methodology

- **Minimums.**
  - 20 hands for results;
  - 20 hands with a fair share for win verdicts;
  - 50 hands per game before "best", "worst" or "most won";
  - 15 hands for a rivalry verdict;
  - 20 opportunities for a behaviour rate;
  - 10 cards per rank (130 in all) for deck fairness.

  Below the minimum, the UI says so in words.
- **Intervals.**
  - Wilson for proportions;
  - night-clustered standard errors for boots a hand;
  - normal intervals for card-strength groups.
- **Shrinkage.**
  - A game's boots a hand is shrunk toward the player's overall result (weight 50 hands);
  - a variant's toward the player's Teen Patti result (weight 40);
  - behaviour rates toward the club-wide pooled rate (weight 20 opportunities).
- **Multiple comparisons.**
  - Situational contrasts (about 25 per player) and insights are corrected with
    Benjamini–Hochberg at q = 0.1.
  - The Style page's gold mark means "survives that correction". The uncorrected p < 0.05 mark
    from the first draft lit up false positives on simulated data and was replaced.
- **Insight eligibility.** An insight is shown only when all three hold:
  - it is significant after correction;
  - its effect is large enough to matter (8 percentage points for a rate, 0.5 boots a hand,
    15% on fair share);
  - it has at least moderate evidence.

  Records (best night, biggest pot) are descriptive and need no test.
- **Wording.**
  - "consistently" for q < 0.01, "tends to" for q < 0.1.
  - Absolute differences ("60% of the time against 20%"), never relative percentages.
  - Every sentence carries its sample size.

## Privacy model in Phase 2

| View | Data | Who |
|---|---|---|
| Overview, Games, Style, Rivals, History lists | Public records of hands the viewer was dealt into | The viewer |
| Cards, deck fairness | The viewer's own `hand_private` only | The viewer |
| Hand detail | Events while the viewer was seated; other players' cards only if shown while the viewer was connected (`observedBy`); own decision context only | The viewer, if they were at the table (403 otherwise) |
| Rivals | Results between the two (flows, wins, showdowns); never the opponent's tendencies or hidden cards | The viewer |
| "With particular people in the hand" | The viewer's own behaviour when someone was in the hand (public facts) | The viewer |
| Admin analytics | Public records, normalised; no private cards | Owners |
| Club prior | Pooled public decisions of all humans, anonymous | Server only |

Deliberately not built:
- another player's style profile (it would be a scouting report usable at the table);
- exact-hand win rates (too rare to mean anything);
- "cards you get most" as a trait (it lives in the fairness panel, worded as chance).

Stats are a separate page, not shown at the table.

GA4 receives only:
- `analytics_opened`;
- `analytics_section_viewed {section}`;
- `analytics_filter_used {filter, value}` (fixed option values only);
- `analytics_rival_opened {kind}`;
- `hand_history_opened`;
- `hand_detail_opened`.

No ids, names, cards, amounts or results.

## APIs

All `GET`, signed-in member (club token, fresh guest-list check):

| Route | Returns |
|---|---|
| `/analytics/overview` | Results, fair share, running total, recent nights, trend, biggest pot |
| `/analytics/games` | Per game and per variant (shrunk), labels with reasons |
| `/analytics/trends` | The same summary for each time window |
| `/analytics/cards` | Own-card analytics and deck fairness |
| `/analytics/patterns` | Core rates, club prior, situations with q values, style change |
| `/analytics/insights` | Structured insights (type, subject, metric, value, baseline, difference, n, confidence, window, game, variant, opponent, supporting hands, eligibility, text) |
| `/analytics/rivals`, `/analytics/rival?opponent=` | Head-to-head list and detail |
| `/analytics/nights`, `/analytics/hands?night=&page=`, `/analytics/hand?id=` | History and hand detail |

Filters: `window` (all, 30d, recent-nights, recent-hands), `game`, `variant`, `company` (all,
friends, bots), `opponent`, `night`. Unknown values are refused (400), never widened.

## Performance

Measured locally (in-memory MongoDB) on one player with 3,009 hands, about 100 nights:

| View | Data loaded | Compute + query |
|---|---|---|
| overview, games, trends, nights, hands, rivals | 5.2 MB (summary projection) | 75–85 ms |
| cards | summary + own private | 115 ms |
| patterns, insights | 13 MB (last 1,500 hands, decisions only) | 140–175 ms |
| hand detail | 1 record | 2 ms |
| admin (whole club) | summary projection | 280 ms |

Projections matter more than computation: a full record is about 12 KB, the summary projection
about 1.7 KB. Patterns use the most recent 1,500 hands, which is enough to describe current style.

**When to pre-aggregate:**
- when any player passes about 1,500 recorded hands;
- or when p95 Worker latency on `/analytics/*` passes about 1 second (Atlas round-trips add to
  the figures above).

The boundary is already in place:
- `handFacts()` output (about 300 bytes per seat-hand) can be written to a `player_hand_facts`
  collection at archive time;
- `decisionsIn()` rows to `player_decisions`.

The compute functions take facts and decisions, so only `data.mjs` changes. Club priors are
cached for 10 minutes per isolate.

## Deferred on purpose

- Equity-based hand strength (needs enrichment): tiers are category-based approximations, and
  Muflis is reversed.
- Visual hand replay: the hand detail response is shaped for it.
- Post-game summaries and insight emails: the insight engine serves them; nothing sends yet.
- Bot directory, bot memory and bot analytics UI (Phase 3+).
- Pre-aggregation (see above).
- Club-wide fairness for owners: `deckFairness()` works on any card set; no route yet.
- Legacy `club_hands` history: it has no boot or table data, so it cannot be normalised and stays
  on the leaderboard only.
