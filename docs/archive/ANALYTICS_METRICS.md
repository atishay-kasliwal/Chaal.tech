# Metric definitions

Every number a player or owner sees has one definition. This table is the registry in `server/analytics/intel/definitions.mjs`; a test imports every entry so it cannot drift. Surfaces call these functions and never recompute.

| Metric | Defined in | Meaning |
|---|---|---|
| Boots, big blinds, bets | `server/analytics/compute/facts.mjs` `handFacts` | A hand’s net chips divided by that game’s stake unit, so stakes compare fairly. |
| Wins against a fair share | `server/analytics/compute/performance.mjs` `fairShare` | Wins against 1 divided by players dealt in, with a normal-approximation interval. |
| Boots a hand | `server/analytics/compute/performance.mjs` `results` | Mean units per hand with nights as clusters; the verdict needs the interval to exclude zero. |
| Rivalry | `server/analytics/compute/rivals.mjs` `rivalries` | Chips that moved directly between two seats, in the viewer’s units, by permanent identity. |
| Behaviour rates | `server/analytics/compute/patterns.mjs` `coreRates` | Rates over decisions where the action was legal, voluntary choices only. |
| What the cards were worth | `server/analytics/intel/skill-luck.mjs` `skillLuck` | Pot times (win chance − fair share), if everyone stayed to the end. Exact variance over the deck for Teen Patti. |
| What you did beyond the cards | `server/analytics/intel/skill-luck.mjs` `playRows` | Actual units minus cards value, per hand, with the Bernoulli variance of the pot. |
| Blackjack expected value | `server/analytics/intel/strength.mjs` `blackjackEv` | Exact infinite-deck EV of hit, stand, double for this table’s rules. |
| Improvement | `server/analytics/intel/improvement.mjs` `improvement` | Recent 30 days against the same player’s earlier history, headline from luck-free dimensions only. |
| Rivalry titles | `server/analytics/intel/rivalry.mjs` `rivalryBoard` | Plain-fact selection over the canonical rivalry list; no composite score. |
| Personal records | `server/analytics/intel/records.mjs` `personalRecords` | Pure function of a slice of history, so before and after a night can be compared. |
| Club records | `server/analytics/intel/records.mjs` `clubRecords` | Celebratory records over public hand summaries. |
| Achievements | `server/analytics/intel/achievements.mjs` `achievements` | Derived on demand from history; never stored. |
| Surprises | `server/analytics/intel/surprise.mjs` `nightSurprises` | A night against the same player’s own earlier baseline, with significance and effect-size gates. |
| Insight ranking | `server/analytics/intel/ranking.mjs` `rankInsights` | Fixed weighted sum of confidence, magnitude, novelty, relevance, recency, social and actionability. |
| Night recap | `server/analytics/intel/recap.mjs` `buildRecap` | Three to six ranked highlights over shared facts plus the viewer’s own. |
| Deck fairness | `server/analytics/intel/fairness.mjs` `fairnessCenter` | Chi-square and per-card tests on the viewer’s own cards, corrected for multiple comparisons. |
| Club overview | `server/analytics/intel/club.mjs` `clubOverview` | Counts and durations from public hand summaries. |
| Variant health | `server/analytics/intel/club.mjs` `variantHealth` | Independent signals per variant with sample sizes; no combined score. |
| Bot intelligence | `server/analytics/../bots/intel.mjs` `analyzeBots` | Usage, results, predictability, exploitability and lineage per character. |
| Data quality | `server/analytics/intel/quality.mjs` `recordProblems` | Per-hand integrity checks, plus operational checks over recorder, replay and memory. |
| Warehouse rows | `server/analytics/intel/export.mjs` `exportRows` | One canonical row per seat per completed hand. |

Stake units: Teen Patti the boot, Hold'em the big blind, Blackjack the opening bet. Rummy is points and never added to other games. A hand stopped before its result counts for nothing.
