# Phase 5: the intelligence layer

Phase 5 turns the permanent hand history (Phase 1), the analytics computation layer (Phase 2), character bots (Phase 3) and bot memory (Phase 4) into one product: what happened tonight, how you play, who your rivals are, what the club has done, and how the bots are doing. It adds no new data source and no parallel pipeline. Every number starts from `compute/facts.mjs`.

## Architecture

```
hand_records / hand_private / hand_sealed        (authoritative, Phase 1)
        |
compute/*   facts, performance, patterns, rivals, cards, insights   (Phase 2, one definition each)
        |
intel/*     strength, skill-luck, improvement, rivalry, records, achievements,
            surprise, ranking, recap, fairness, timeline, club, quality, export, ai
bots/       intel (usage, exploitability, lineage), exploit-sim, evolution
        |
intel/api.mjs (members)   intel/admin.mjs (owners)   -> Worker routes -> Svelte
```

Rules: pure functions over a slice of history; loaders in `data.mjs` only; the API composes and authorises; the UI only lays out. Metric registry: [ANALYTICS_METRICS.md](ANALYTICS_METRICS.md).

## Skill versus luck

There is no universal skill score. Each game has the method it can defend, labelled in the output as **exact**, **estimated** or **results only**.

The split, in the game's own unit, always adds up exactly: **cards + play = outcome**.

- **Cards**: what the dealt cards were worth. If everyone stayed to the end, a hand with win chance *e* from a pot *P* is worth *P(e - 1/n)*. Zero for an average deal. The pot used is the one the player would have faced had they stayed (`stayPotUnits` in facts), so folding cannot make their own cards look better or worse. Simulation confirms the cards component is identical for careful and reckless players on the same deals.
- **Play**: actual units minus cards value. Packing a hand worth less than nothing counts in the player's favour; packing a strong one costs. It mixes skill, bluffing and opponents' luck, and is described that way.
- **Outcome**: boots won or lost.

| Game | Method | Basis |
|---|---|---|
| Teen Patti (card-only variants) | Estimated | Exact hand-value tables per variant (`tp-strength.mjs`, generated), opponents as independent random hands. Exact deck variance gives the cards interval. |
| Teen Patti (jokers, table cards, discards) | None | No card-only model; left out and said so. |
| Hold'em | Estimated | Heads-up preflop equity for the 169 classes (`holdem-equity.mjs`, seeded Monte Carlo), scaled to table size. Preflop pot-odds checks only when heads-up. Ignores position and later streets. |
| Blackjack | Exact | Infinite-deck EV of hit, stand and double for this engine's rules (no splits, dealer stands on 17, no peek). Each decision's cost is `best - chosen` in bets. |
| Rummy | Results only | No defensible model. Points kept apart from boots. |

Limitations are part of every response (`limitations`) and shown under "How this is worked out".

Verdicts need 30 hands and an interval that excludes zero; below that the answer is "too early".

## Improvement

Last 30 days against the same player's earlier play. The headline uses only luck-free dimensions: play beyond the cards (per game) and exact Blackjack decision quality. Results and style (aggression, packing under pressure, bet size, consistency) are shown beside them; style is never scored better or worse. If results move without the skill dimensions, the page says it is mostly the cards.

## Rivalries

`compute/rivals.mjs` stays the one definition of head to head (chips that moved between two seats, by permanent identity, with first meeting, last 30 days and pots added). `intel/rivalry.mjs` only chooses titles: Closest, Longest, Most played, Biggest swing, Recent challenger (doing better against you lately than usual), Bot nemesis and Bot you handle best (bots only, and only when the interval excludes zero). Each lists the plain facts behind it; no composite score is exposed. No title says worst, loser, weakest or exploitable about a person.

The rivalry page adds recent form, largest pots, public moments (labels of hands they showed while you watched, never cards), game and variant splits, and for bots what the bot remembers of you.

## Records and achievements

Records (personal and club) are pure functions of a slice of history, each carrying a night or hand id. "Record broken" compares the records before a night with those including it, and only counts when a previous holder existed. Club records are celebratory only. Achievements are derived on demand and never stored: first Show win, 100 and 1,000 hands, every game, five variants, weak-hand win, long blind run, 50/100 hands or 10 nights with someone, beat every bot. None rewards bigger bets or pots.

## Night recap, surprises, ranking

The recap has a shared layer (public facts: results, biggest swing and pot, closest pair, variant, bot moment) and a personal layer (your cards warm or cold, surprises for you, records broken). All candidates go through one ranking: a fixed weighted sum of confidence (also a floor), magnitude, novelty, relevance, recency, social and actionability; two per topic at most; a 14-day cooldown on repeats. What was shown is remembered per player (`insight_shown`), idempotent per night, so a refresh never changes a recap.

Surprises compare a night with the same person's own earlier history: aggression, packing under pressure, blind length, large pot, comeback, rare hand, cards warm/cold, rivalry reversal. Each needs a baseline and a significance and effect-size gate.

Language rules (`language.mjs`): strong evidence states it, moderate says "tends to", weak shows raw counts. All text is templates over structured facts. No model writes routine text.

An optional AI door exists (`intel/ai.mjs`): input is only the recap's own highlight text and counts; output is rejected if it is long, contains a link or an em dash, or any number not in the input; any failure falls back to the template. It is not connected to anything.

## Fairness center

Your own dealt cards against a fair deck with 95% bands (about one bar in twenty is outside by chance and the page says so), exact hand-category counts, convergence as the sample grows, and a verdict only when tests survive a multiple-comparison correction. Integrity: counts of hands sealed before dealing, cut by a player, and replay-verified. It explains what cannot be proven (one deal's randomness) and never exposes deck order, seals or salts. Club-wide card counts appear only when at least 5 people contribute, so nobody can subtract their own cards from the total.

## Owner analytics

`/admin/intel`: club overview (active players, nights, night length, games, variants with trend, bots, monthly retention, recurring tables), variant health, bot intelligence, data quality. Variant health lists independent signals with sample sizes (selections, players, repeat rate, run length, quick switch-away rate, finished rate, bot share, hand duration). No combined score; popularity is not quality.

## Bot intelligence, exploitability, evolution

Per bot: usage, people's results against it and its own (same canonical definitions), decision distribution, walk-forward predictability, adaptation counts and reasons, how many players' histories it knows, per game and variant, and every published version (deployment, hands, predictability, performance, config diff, reason).

Exploit findings (need 50+ decisions and an interval that excludes chance): folds too often to raises, never raises blind, too predictable, adaptation hands doing worse, memory possibly manipulated (aggregate counts only, no player named), people beat it comfortably. `exploit-sim.mjs` plays five scripted exploiting strategies against any style on identical seeded deals at the club's default pot limit.

Evolution workflow, one explicit owner step at a time, nothing automatic: observed, proposed (a normal draft style through `manageBot`), simulated (candidate against current), validated (existing validator), reviewed (a reason is required and becomes the history note; a regression must be acknowledged), published (a new immutable version). A published style is never edited and the bot's identity never changes.

## Data quality

`recordProblems` per hand (unknown versions, chips that do not balance, missing bot versions, private fields in a public record, unexpected root fields, facts failing) plus recorder health, replay sampling, memory failures and stale aggregates. Ids and counts only.

## Privacy and live-game boundary

Audit result: no member response carries cards of another player; a canary test seeds other players' private rows and asserts no view, owner views included, contains it. Skill and fairness use only the viewer's own cards. The recap's shared layer is public. Owner views read public records and derived bot caches, never sealed traces. Export rows are public facts only.

While a member is connected to a table whose hand is in progress, opponent-specific routes (rivals, rival, patterns, insights) return 423 "open up between hands". Skill, records, fairness and club views stay open. Nothing analytic is sent over the game socket.

## Performance (measured)

`npm run analytics:benchmark` on synthetic history, one machine, in-process MongoDB:

| View | 4,000 hands | 20,000 hands |
|---|---|---|
| overview / games / rivals / insights | 80 to 120 ms | 110 to 145 ms |
| skill / records / recap | 205 to 270 ms | 250 to 340 ms |
| fairness | 138 ms | 243 ms |
| club records cold / cached | 100 / 20 ms | 500 / 90 ms |
| owner club + variants cold / cached | 140 / 2 ms | 650 / 2 ms |
| owner bots cold | 130 ms | 300 ms |
| owner data quality | 140 ms | 410 ms |

Player views read at most 5,000 of the player's newest hands and 1,500 with events. Only club-wide views are cached, keyed by the head of the history (count and newest hand), so a new hand invalidates them. Strength tables are generated data because building one at request time cost up to 900 ms for wild-card variants.

Migrate to stored per-night and per-player aggregates when any of: the club passes about 15,000 recorded hands, club-wide views exceed 1 s, or heap use on an owner view passes about 100 MB. `export.mjs` rows are the shape for that and for a warehouse; product usage analytics (GA4) is separate and never mixed in.

## Validation (`npm run analytics:simulate`, 120 trials unless noted)

| Check | Result |
|---|---|
| Honest play, honest deal: cards called warm/cold | 5.7% over 600 trials (nominal 5%); cards z has mean -0.03, sd 1.00 |
| Honest play: play called above / below | 2.2% / 1.2% (conservative) |
| Careful player (packs hands worth less than nothing), 240 hands: play found above | 92.5% |
| Reckless player (packs strong hands): play found below | 100% |
| Luckier cards, no skill: cards found above / play wrongly flagged | 100% / 1.7% |
| Cards component for careful, honest and reckless play on identical deals | identical |
| Fewer than 30 hands | always "insufficient" |
| Surprise detection: false positive when nothing changed / found when raising doubles | 1.8% / 73.7% (1,200 trials) |
| Fairness: false alarm on fair decks / catches an ace every third hand / every tenth hand (300 hands) | 0% / 100% / 100% |
| Bot exploit edge (boots a hand, always-raise strategy, 60 hands, pot limit 128) | rohit-sharma 4.8, virat-kohli -9.4, ms-dhoni 11.0, gg 10.6, samay-raina 1.7 |
| Style comparison: a style against itself | no clear difference |

Honest finding for owners: a player who keeps raising wins from several styles because they escalate and then fold. A proposal's suggested change is only a starting point: simulating "call more" made one style easier to exploit, which is exactly what the simulate and review steps exist to catch.

## Operations

```
npm run analytics:intel:migrate   # indexes (operator, needs MONGODB_ADMIN_URI)
npm run analytics:quality         # data-quality report
npm run analytics:export          # NDJSON of public seat-hand facts
npm run analytics:benchmark | analytics:simulate
node scripts/generate-tp-strength.mjs   # after adding a Teen Patti variant (a test fails if missing)
```

## Known limitations

- Teen Patti and Hold'em card values are estimates; Hold'em ignores position and later streets; wild-card and discard variants have no model.
- A hand's value uses the pot actually played, which depends a little on how everyone bet.
- Blackjack is exact for an infinite deck; a real single deck differs slightly.
- Rivalry and records read the newest 5,000 hands per player and 20,000 per club.
- Exploit simulation is two-player Classic with the exploiter seated first: compare styles with each other, not with a real table.
- Insight shown-state is per player and per recap; it is not shared across devices of different members.

## Considered and rejected

- A single skill score or rating: not defensible across games, and invites hostility.
- Win-count "play" measure: punishes correct folds (found by simulation and replaced).
- Live opponent scouting during a hand: changes the game.
- Public "worst", "easiest opponent" or "most exploitable" labels for people.
- Automatic bot patching from analytics: every change is an owner-reviewed new version.
- An LLM in the normal path: templates are deterministic, free and cannot invent facts.
- A warehouse now: MongoDB handles current scale; thresholds above say when to revisit.
