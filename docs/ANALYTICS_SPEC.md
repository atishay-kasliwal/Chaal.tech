# Chaal analytics: design and specification

Status: Phase 1 (the hand recorder, §10.3 and §15.11) is built; everything else is a proposal.
See "Phase 1 as built" below. Grounded in the code as of `private-club` @ 05066112.

### Phase 1 as built

- Code: `server/analytics/recorder.mjs` (capture, replay, records), `server/analytics/store.mjs`
  (MongoDB tiers, validators, outbox writer, `verifyStoredHands`), `server/bots/identity.mjs`
  (legacy bots and immutable styles), wired into every commit path of
  `server/cloudflare/room-object.mjs`.
- Capture runs inside the commit transaction; replay and record building run when the outbox is
  flushed, so gameplay never waits on them. A hand that does not replay exactly becomes a
  `recorder_failures` row, never a partial record.
- Deviations from §10.3: consequences (results, knock-outs) are events with `p: 'system'` and a
  `sub` index on the step that caused them; public table cards live in `table`; late reveals
  are appended to `lateShown`; chip `flows` share each loser's loss among winners in proportion
  to their gains (exact for one pot; an attribution for multiple Hold'em side pots).
- Phase 1.1 hardening:
  - every hand records engine, recorder, game, rules and variant versions;
  - replay is gated on them (`replay-unavailable`, never approximated);
  - a semantic hash allows `compatible` replays;
  - a committed replay corpus guards existing versions;
  - deploys must carry a commit build id;
  - late and in-hand reveals record who was actually present;
  - bot randomness is a per-decision seed;
  - sealed inputs are gzipped;
  - the runtime never administers schema;
  - per-room status feeds `npm run analytics:health`.
- Operations, versioning rules, storage estimate and the production validation plan:
  docs/ANALYTICS_OPERATIONS.md.

Contents

1. Current analytics capabilities
2. Gaps in the data model and the minimum telemetry to close them
3. Analytics taxonomy
4. Metrics by category (the specification)
5. Player analytics experience
6. Game analytics experience
7. Head to head experience
8. Insight engine
9. Skill versus luck: statistical methodology
10. Data and event architecture
11. API and database changes
12. Roadmap (P0 to P3)
13. Ideas beyond the brief
14. What should not be built, and why
15. Pattern discovery, bots and human vs bot analytics

Two framing points before anything else, because they change many answers below:

- **This is a private club, not a public poker site.** A busy member might play a few thousand
  hands a year; a pair of friends a few hundred hands together. The architecture should scale to
  millions of hands, but the binding constraint is statistical, not computational. Most of the
  hard design work is deciding what *not* to say on small samples.
- **Hidden cards are hidden on purpose.** `deckProof()` in `server/engine.mjs` reveals only
  cards that were shown; packed hands stay secret even in the fairness proof. Any analytic that
  tells Player A what Player B held when B packed undoes that guarantee and hands A a strategic
  edge in the next game. Card-derived analytics about a player are therefore **visible only to
  that player** unless built purely from shown hands. This rules out several of the requested
  public rankings (§14) and shapes the architecture (§10).

---

## 1. Current analytics capabilities

### 1.1 Where data lives today

| Store | Contents | Lifetime | Analytics use |
|---|---|---|---|
| Room Durable Object SQLite `room_state` | Current snapshot only (cards, seats, bets, pot, `handSeal`) | Overwritten every commit | None: history is lost |
| Room DO `receipts` | Per command: player, command id, hashed fingerprint, result | 30 days, per room | None: no action name, deleted with room |
| Room DO `ledger` | Every chip-moving commit: `kind` (socket event, e.g. `bet`, `bot-bet`, `timeout`), per-account deltas, `hand_id`, revision, time | 365 days, but `deleteAll()` when the room closes | Partial bet history while a room lives; never exported |
| Room DO `room_meta.clubHand` | In-progress hand: players, running net | Until hand ends | Feeds `club_hands` |
| Mongo `club_hands` | Per completed hand: room, handId, gameType, rulesVersion, startedAt, completedAt (epoch ms), practice, winnerName, pot `amount`, `reason`, players `[{playerId, nickname, bot, net, won}]` | Permanent | **The only durable per-hand record** |
| Mongo `club_nights` | Per ended table-night: hands, games played counts, biggest pot, `realNet`, `settleUp` | Permanent | Night summaries |
| Mongo `members` | playerId, nickname, role, status, claimedAt, `lastSeenAt` (new) | Permanent | Identity, activity |
| Google Analytics | Page views, `login`, `table_create`, `table_join` (member id as user_id) | GA retention | Product usage only |

### 1.2 Field-by-field audit

Legend: ✅ durable · ⚠️ exists only transiently in the live snapshot · ❌ not captured.

| Requested field | Status | Where / notes |
|---|---|---|
| Players | ✅ | `club_hands.players[].playerId`, `members` |
| Games, variants | ✅ | `gameType`, `rulesVersion` (26 Teen Patti variants + Hold'em, Blackjack, Rummy) |
| Sessions | ⚠️ | No session id. `club_nights` per table-night; `nightStartedAt` lives on the room |
| Tables | ✅ / ⚠️ | Room name ✅; config (`boot`, `potLimit`, `table` chips, blinds) ⚠️ not archived |
| Rounds / hands | ✅ | `_id = room:handId`, start and end times |
| Dealt cards | ⚠️ | `players[].cards` and `handSeal.deck` live only during the hand |
| Community cards | ⚠️ | Hold'em `board`; variant `variantState` (jokers, table cards) |
| Positions | ⚠️ | `seatNumber` (0 to 5); Hold'em `buttonSeat` |
| Turn order | ⚠️ | Teen Patti: first actor is the seat after the hand's initiator; derivable only live |
| Bets / raises / calls / checks | ⚠️ / ❌ | Chip-moving actions in per-room `ledger` (lost on room close). **Checks, folds, packs, see and show-requests move no chips (beyond the show fee) and are never recorded anywhere** |
| Folds | ❌ | Not recorded (no ledger row) |
| All-ins | ⚠️ | Hold'em `isAllIn` flag |
| Side pots | ⚠️ | Computed inside Hold'em showdown, not stored |
| Blind amounts / boot | ⚠️ | Room config, not archived |
| Pot sizes | ✅ final only | `amount`; no per-action pot trajectory |
| Balances | ⚠️ | Live only; players may hide theirs (`hideBalance`) |
| Borrowing / lending | ⚠️ | `requestChips` / `answerChipRequest`; ledger kind only, never archived |
| Winners / losers | ✅ | `won`, `net` |
| Hand rankings | ⚠️ / ❌ | Hold'em `result.scores` transient; Teen Patti never stored |
| Timestamps / duration | ✅ hand level | No per-action times |
| Action sequence | ❌ | |
| Opponents | ✅ | Co-participants in `players` (only those dealt in) |
| Table size | ✅ | `players.length` |
| Real money flows between people | ⚠️ | `recordReal()` computes exact payer to winner flows, then keeps only per-night totals |

### 1.3 What can be computed correctly today

From `club_hands` alone: hands, wins, net chips, win rate, per game and variant, per period,
nights attended, last played, streaks of wins/losses, pot size distribution, table size, time of
day, co-occurrence (who plays with whom), and "who won when both were dealt in". Head-to-head
money is exact only for two-player hands; in multiway pots, pairwise flows cannot be recovered
from per-player net.

Nothing about cards, actions, position, style, bluffing or decision quality can be computed, and
**it cannot be backfilled**: decks are discarded after each hand.

### 1.4 What was just built, and what is wrong with it

The admin Analytics tab (`memberAnalytics` in `server/club/history.mjs`) shows hands, win %,
net, nights, best and worst hand, favourite game. Two issues, to fix in P0:

- **Net is summed in raw chips across tables with different boots.** A ₹100-boot table
  dominates a ₹5-boot one. Results must be normalised to boot units (§9.1).
- **Win % ignores table size.** Winning 30% at six-handed tables is excellent; at heads-up it is
  poor. Win rate needs a 1/n baseline (§9.2).

---

## 2. Gaps and minimum additional telemetry

Everything below is captured in the room Durable Object inside the existing commit transaction
and shipped through the existing `history_outbox`, so it inherits the current exactly-once,
retry-until-archived guarantees. No new service, no new secret.

| # | Telemetry | Fields | Unlocks | Visibility |
|---|---|---|---|---|
| T1 | **Hand header** | night id, hand number in night, config (boot, potLimit, table chips, blinds), seats `[{playerId, bot, seat, actOrder}]`, button / first actor, public variant state (wild rank, table cards, board), deck commitment and cutter | Position, table config, stakes normalisation, sessions | Public |
| T2 | **Action log** | Every decision, including non-chip ones: `{i, t, player, action (canonical), raw, amount, potBefore, stakeBefore, toCall, blind, street}` | All betting, behaviour, style, sequence analytics | Public (everyone at the table saw them) |
| T3 | **Outcome detail** | Per player: contributed, net, exit (`won`, `lost-show`, `packed@i`, `timeout@i`), shown; winners with amounts; side-pot layers | Fold timing, showdown stats, side pots | Public |
| T4 | **Pairwise flows** | `[{from, to, amount}]` from the same proportional rule as `recordReal()`, human to human | Exact head-to-head money | Public |
| T5 | **Private cards** | Per player: dealt cards, final cards (after discards / jokers), hand category and rank vector, when they saw | Card, hand and luck analytics | **Owner of the cards only**; shown hands also copied to T3 |
| T6 | **Equity** | Per player at deal: showdown equity vs the actual number of opponents; Hold'em per street | Luck vs skill, decision quality | Owner only |
| T7 | **Chip lending** | `{from, to, amount, accepted, at}` | Lending network, comeback correction | Public at the table |
| T8 | **Decision time** | ms from turn start to action (already derivable from `deadline` and `turnMs`) | Tempo, timeouts | Self only (it is a tell) |

T6 is derived, not captured: compute it after the hand from T5 (offline or in the archive step),
never on the gameplay path.

**Minimum viable set:** T1 + T2 + T3 + T4 + T5. T6 to T8 are cheap additions once those exist.

**Engine fact that makes this cheap and verifiable:** `transition()` is pure (no clock, no
randomness). Given the sealed deck (T5), the header (T1) and the action log (T2), every hand can
be **replayed** and must reproduce the archived outcome. That gives a built-in correctness test
for the whole analytics pipeline (§10.6).

---

## 3. Analytics taxonomy

The requested categories, plus the ones marked ★ that the brief did not mention.

| Category | The question it serves |
|---|---|
| Player | How am I doing overall, and is it real? |
| Game and variant | Where am I strongest, where do I spend my time? |
| Card (descriptive) | What did the deck give me? (randomness, fairness) |
| Hand (performance) | What do I do with what I'm given? |
| Betting | How do I put chips in? |
| Behaviour and sequence | How do my decisions change with context and history? |
| Opponent | Who do I play well or badly against? |
| Head to head | The story of me versus one friend |
| Session and night | How do my nights go, start to finish? |
| Position and turn order | Does where I sit or act matter? |
| Risk and variance | How swingy am I, how deep do I go? |
| Profitability | Where does my money come from and go? |
| Win / loss and streaks | Runs, and what I do during them |
| Comeback | Recovering from short stacks |
| Strategy and style | What kind of player am I, with evidence? |
| Skill and decision quality | Are my choices good, independent of results? |
| Luck versus skill | How much of my result is cards? |
| Table | What is this table like? |
| Social | Who plays with whom, who shows up |
| Historical trends | Am I improving? |
| Anomaly | Unusual patterns worth a look |
| ★ Fairness and RNG | Is the deck fair? (turns "what cards do I get" into a trust feature) |
| ★ Blind play (Teen Patti) | How long I stay blind and what it earns me |
| ★ Show economics | Who asks for the Show, and does it pay? |
| ★ Variant design (owner) | Which variants make good nights: tempo, pot sizes, fold rates |
| ★ Game picking | Do people pick the games they are good at? |
| ★ Chip economy and lending | Who lends, who borrows, how debt affects play |
| ★ Tempo and etiquette | Decision speed, timeouts, mid-hand leaves |
| ★ Learning curve | How fast someone gets good at a new variant |
| ★ Night arc | Performance by hour into the night (fatigue, tilt) |
| ★ Milestones and records | Personal bests: first trail, biggest pot, longest streak |
| ★ Integrity | Soft play and chip dumping between pairs (real money settles up) |

---

## 4. Metrics specification

### 4.0 Conventions used in every table

**Data codes:** H = available now (`club_hands`) · R = public hand record (T1 to T4) ·
C = private cards (T5) · E = equity (T6) · L = lending (T7) · T = timing (T8).

**Units:** chips are always shown in **boots** (chips ÷ table boot) for Teen Patti, **big
blinds** for Hold'em, **base bets** for Blackjack, **points** for Rummy. "/100" means per 100
hands. Raw rupees appear only in the money / settle-up views where they are the point.

**Standard filters (F):** period, game, variant, table size, opponent(s), practice
(excluded by default). Extra filters are listed per metric.

**Minimum sample (n):** below it the metric is hidden or shown greyed with "not enough hands
yet". Values are guidance; §9.5 gives the rule.

**Canonical actions** (mapping each game's actions to one vocabulary, used everywhere):

| Canonical | Teen Patti | Hold'em | Blackjack | Rummy |
|---|---|---|---|---|
| `post` | boot | blinds | bet | (none) |
| `see` | see | (none) | (none) | (none) |
| `check` | (none) | check | (none) | (none) |
| `call` | bet at min ("chaal") | call | (none) | (none) |
| `raise` | bet above min (up to 2× min) | raise / bet | double | (none) |
| `fold` | pack | fold | (none) | drop |
| `timeout` | timeout (auto-pack) | timeout | timeout (stand) | timeout |
| `show` | show | (showdown) | (none) | declare |
| `hit` / `stand` | | | hit / stand | |
| `draw` / `discard` | discard (discard variants) | | | draw-stock / draw-discard / discard |
| `table` | variant table moves | | | |

Teen Patti bet sizes are normalised as **stake multiple** = amount ÷ min allowed (1.0 is a chaal,
2.0 is the maximum raise), which removes the blind/seen halving.

Priority: **P0** fundamental · **P1** highly valuable · **P2** advanced · **P3** experimental.

### 4.1 Player overview

| Metric | Question | Definition / formula | Data | n | Level | Viz | Caveats | P |
|---|---|---|---|---|---|---|---|---|
| Hands played | How much do I play? | Count of hands dealt in | H | none | player × F | Number | Practice separate | P0 |
| Nights played | How often do I show up? | Distinct table-nights (P0: IST days) | H/R | none | player | Number, calendar | | P0 |
| Result (boots/100) | Am I winning? | 100 × Σ net_boots ÷ hands | H+R | 200 | player × F | Number with CI band | Heavy-tailed; show shrunk estimate and CI (§9) | P0 |
| Real money net | What do I actually owe / am owed? | Σ realNet flows (human to human) | H/R | none | player × period | Number | Different from chips: excludes bots, gifts | P0 |
| Wins over expectation | Do I win more than my share? | Σ won_i − Σ 1/n_i (n_i = players dealt) | H | 100 | player × F | Number ± CI | Split pots count fractionally | P0 |
| Win rate (raw) | How often do I win? | wins ÷ hands | H | 50 | player × F | Secondary text only | Meaningless across table sizes; always shown next to the 1/n baseline | P0 |
| Biggest pot won | Bragging right | max pot won, in boots and ₹ | H | none | player | Record card | Descriptive | P0 |
| Last played / last seen | Is this person active? | max(completedAt), `lastSeenAt` | H | none | player | Text | | P0 |

### 4.2 Game and variant

| Metric | Question | Definition | Data | n | Viz | Caveats | P |
|---|---|---|---|---|---|---|---|
| Hands per game / variant (share) | Favourite game | count, share of hands | H | none | Sorted bar | **Favourite ≠ best** | P0 |
| Result per game (boots/100, shrunk) | Best game | per-game boots/100 with empirical-Bayes shrinkage toward the player's overall rate | H+R | 200 per game | Dot + CI forest plot | Units differ across games: compare within units, or rank by z-score | P0 |
| Wins over expectation per game | Where I win more than my share | §4.1 per game | H | 100 | Forest plot | | P0 |
| Best / weakest game | Answer in one line | argmax / argmin of shrunk result **only if** CIs separate; otherwise "no clear best game yet" | H+R | 2 games ≥ 200 | Headline card | Never pick a winner from overlapping CIs | P0 |
| Result per variant | Strongest variant | Same as per game, shrunk toward the player's Teen Patti rate | H+R | 150 | Forest plot, top 5 / bottom 5 | 26 variants: heavy multiple comparisons; FDR (§9.6) | P1 |
| Risk-adjusted result per game | Best game, adjusting for swings | mean ÷ SD of per-night result ("Sharpe per night") | R | 8 nights | Table column | Few nights means unstable | P2 |
| Result by table size | Do I do better short-handed? | boots/100 by 2, 3–4, 5–6 players | R | 150 per bucket | Dot plot | Confounded with who shows up early/late | P1 |
| Learning curve ★ | Am I getting better at this variant? | Rolling result vs hand index in that variant (1–50, 51–150, 150+) | R | 150 | Line with CI ribbon | Opponent pool changes over time | P2 |
| Variant pick-and-win ★ | Do I pick games I'm good at? | Result in hands of games the player chose vs others chose | R (+ chooser) | 100 each | Two dots | Needs chooser recorded in T1 | P2 |

### 4.3 Card intelligence (descriptive: randomness, not skill)

Shown in a "Your cards" section for the player themselves, and as club-wide aggregates in a
Fairness view. **Nothing in this section ever goes into a skill rating, a style label or an
insight about ability.**

| Metric | Question | Definition | Data | n | Viz | Caveats | P |
|---|---|---|---|---|---|---|---|
| Card frequency (club) ★ | Is the deck fair? | Count of each of 52 cards dealt vs expected; χ² test | C | 5,000 cards | 4×13 grid heatmap of deviation, p-value | The right home for "which cards do I get most" | P0 |
| Rank / suit frequency (self) | What ranks / suits do I get? | Counts vs expected | C | 300 hands | Small bar vs expected line | **Pure chance.** Labelled as such; no insight ever generated | P1 |
| Hand category distribution (self vs expected) | How good have my cards been? | Share of Trail, Pure sequence, Sequence, Colour, Pair, High card (variant-specific categories) vs theoretical | C | 200 | Paired bars, actual vs expected | Expected depends on variant (jokers change everything) | P0 |
| Average deal equity ("card luck") | Have I been card-dead? | mean(equity_i − 1/n_i) | E | 100 | Number + percentile vs simulation | Measures luck only | P1 |
| Rare hands log | Fun: my trails and pure sequences | List of hands at or above category X | C | none | Timeline | | P1 |
| Hold'em starting hand frequency | 13×13 matrix of what I was dealt | Counts per 169 class vs expected | C | 1,000 | 13×13 heatmap (frequency only) | Descriptive only | P2 |
| Cutter fairness ★ | Does cutting help? | Cutter's win rate vs 1/n | C/R | 500 hands | Single number + CI | Should be null; shown as reassurance | P2 |

### 4.4 Hand performance (what the player does with their cards; self only)

Buckets, never exact holdings (§14): Teen Patti uses **hand category × equity tercile**
(roughly 6 × 3 = 18 cells, with sparse cells merged); Hold'em uses **10 starting-hand groups**.

| Metric | Question | Definition | Data | n | Viz | Caveats | P |
|---|---|---|---|---|---|---|---|
| Result by hand category | Which hand types make or lose me money? | boots/100 per category | C+R | 30 per cell | Bar with CI; grey below n | High-card hands lose by construction; compare to club baseline per category | P1 |
| Win rate by category vs club | Do I get more out of the same cards than others? | player win% − club win% for the same category and table size | C+R | 30 | Diverging bar | Club baseline itself noisy at small club size | P1 |
| Strong hands lost | Do I lose with good cards? | hands with deal equity ≥ 0.7 that lost, with exit type (packed vs lost at show) | E+R | 30 strong | Count + list (drill-down) | Losing strong hands at a show is mostly luck; **packing** strong hands is a decision | P1 |
| Weak hands won | Do I win with weak cards? | equity ≤ 0.3 hands won, split by won-at-show vs opponents packed | E+R | 50 weak | Count + split bar | Only "opponents packed" reflects play | P1 |
| Premium / mediocre / weak performance | How I play each strength tier | boots/100 by equity tercile | E+R | 50 per tier | Three dots + club line | | P1 |
| Value extraction ★ | When I'm strong, do I get paid? | mean pot (boots) won with top-tercile hands vs club | E+R | 30 | Number vs club | Depends on opponents' cards | P2 |
| Hold'em showdown value | W$SD | won at showdown ÷ went to showdown | R | 50 showdowns | Number | | P1 |

### 4.5 Betting

| Metric | Question | Definition | Data | n | Viz | Caveats | P |
|---|---|---|---|---|---|---|---|
| Action mix | What do I do when it's my turn? | share of canonical actions over decisions (excludes `post`) | R | 100 decisions | 100% stacked bar vs club | Per game only | P0 |
| Aggression frequency | How often do I push? | raise ÷ (raise + call + check + fold) | R | 100 | Number vs club percentile | | P0 |
| Aggression factor (Hold'em) | Classic AF | raise ÷ call | R | 100 | Number | Undefined with 0 calls; cap | P1 |
| Teen Patti stake multiple | How big are my bets? | mean amount ÷ min allowed | R | 100 bets | Histogram (1.0 vs 2.0 spikes) | Only two meaningful sizes in TP | P1 |
| Bet relative to pot | Sizing (Hold'em) | bet ÷ potBefore | R | 50 bets | Histogram | | P1 |
| Hold'em VPIP / PFR / 3-bet | Standard poker tightness and aggression | % hands voluntarily put money pre-flop; % raised pre-flop; % re-raised | R | 100 hands | Numbers vs club | | P1 |
| Fold to raise | Do I fold under pressure? | P(fold \| facing a raise) | R | 30 spots | Number vs club | Conditioning on card strength needs C (self view) | P1 |
| Continuation in hand (Teen Patti) | How long do I stay in? | mean number of betting rounds before exit; % hands reaching a show | R | 100 | Survival curve | Depends on table aggression | P1 |
| Show initiative ★ | Do I ask for the Show? | shows requested ÷ hands reaching last two; success % | R | 20 shows | Two numbers | "Tie: requester loses" rule matters | P1 |
| Blind play ★ | How long do I stay blind? | % of decisions made blind; rounds before seeing; result blind vs seen | R | 100 | Number + split bar | Signature Teen Patti stat | P1 |
| Pot-limit pushes ★ | Do I drive pots to the limit? | % hands ending in pot-limit forced show where player raised last | R | 50 | Number | | P2 |

### 4.6 Behaviour and sequences

All conditional rates compare the player **to themself** (their baseline), with a CI on the
difference. With C/E available (self view), conditioning on equity tercile removes most card
confounding; in public views it cannot, and the wording must say so.

| Metric | Question | Definition | Data | n | Viz | Caveats | P |
|---|---|---|---|---|---|---|---|
| Aggression after win / loss | Do I change after results? | aggression freq in hand k+1 by outcome of hand k (won, lost small, lost big ≥ 10 boots) | R (+E) | 50 decisions per state | Three dots + baseline line | Not causal; stack size changes too | P1 |
| Tilt index | Do I get loose after losing streaks? | Δ aggression and Δ VPIP / stay-rate after ≥ 2 consecutive losses, equity-adjusted | R+E | 40 post-streak hands | Small multiple | Self only; never a public label | P2 |
| Behaviour during streaks | Hot-hand behaviour | as above for win streaks | R+E | 40 | Small multiple | Regression to the mean | P2 |
| Stack depth behaviour | Short-stacked play | aggression by stack bucket (< 20, 20–50, > 50 boots) | R | 50 per bucket | Line | Hidden balances: self only for others' stacks | P2 |
| Sequence patterns | "Pack, pack, pack, then raise" | frequency of n-gram patterns over a player's hand-level summaries vs shuffled baseline | R | 300 hands | Pattern list with lift and n | Mining many patterns means FDR | P3 |
| Big-bet bluff success (self) | Weak cards + big bet → opponent folds | count of raises with equity ≤ 0.3 that won without a show ÷ such raises | E+R | 20 | Number + list | Self only (needs hidden cards) | P2 |
| Slow-play rate (self) | Strong hand, quiet, then big | top-tercile hands where first k actions are calls then a raise | E+R | 20 | Number | Definition is game-specific | P3 |

### 4.7 Opponent analytics (one player against everyone)

| Metric | Question | Definition | Data | n | Viz | P |
|---|---|---|---|---|---|---|
| Result by opponent present | Who do I do well with at the table? | boots/100 in hands where X was dealt in, vs without X | R | 150 with X | Forest plot | P1 |
| Toughest / softest opponent | One-line answer | from head-to-head net flow (§4.8), shrunk, only if CI excludes 0 | R (T4) | 100 together | Headline | P1 |
| Behaviour change vs opponent | Does my strategy change against X? | aggression and fold-to-raise when X is the last aggressor vs when others are | R | 30 spots each | Paired dots | P2 |
| Result by opponent mix | Do I struggle at tough tables? | boots/100 by mean opponent skill tercile (opponents' shrunk results) | R | 150 per tercile | Three dots | P2 |

### 4.8 Head to head (pair A, B)

| Metric | Definition | Data | n | P |
|---|---|---|---|---|
| Hands together | both dealt in | H | none | P0 |
| Nights together | distinct table-nights with both | H/R | none | P0 |
| Net flow A↔B | Σ flows A→B minus B→A (boots and ₹) | R (T4); H for heads-up hands only | 50 | P0 |
| Direct contests | hands where A and B were the last two (show or one packed to the other's bet) | R | 20 | P0 |
| Direct contest win % | A wins ÷ direct contests, Wilson CI | R | 20 | P0 |
| Show record | shows between them, who requested, who won | R | 10 | P1 |
| Fold-to-their-raise | P(A packs \| B raised last) vs A's baseline | R | 20 spots | P1 |
| Aggression against | A's aggression freq when B is still in vs not | R | 50 decisions | P1 |
| Largest pot won from / lost to | max single-hand flow | R | none | P0 |
| By game / variant | all of the above filtered | R | per metric | P1 |
| Streak | current and longest run of direct-contest wins | R | none | P1 |
| Trend | cumulative net flow over time | R | 50 | P1 |

**Rivalry and dominance scores, defined (and kept small):**

- *Dominance* = net flow A→B per 100 hands together, in boots, with a 90% CI. Shown as "A has
  the edge" only if the CI excludes 0. This is the only "who beats whom" number.
- *Rivalry* is not a score. "Rivals" is a list filter: pairs with ≥ 30 direct contests whose
  contest win % CI contains 50%, sorted by contests. It means "close and frequent", and that
  can be explained in one sentence.

### 4.9 Session and night

| Metric | Definition | Data | n | Viz | P |
|---|---|---|---|---|---|
| Night result | net boots and ₹ per table-night | H/R | none | Strip of nights, green/red | P0 |
| Night length, hands per hour | from night start/end | R | none | Numbers | P0 |
| Max drawdown in a night | largest peak-to-trough in running stack | R | none | Number, sparkline | P1 |
| Night arc ★ | result by hour into the night (1st, 2nd, 3rd+) | R | 300 hands | Three dots | P2 |
| Winning nights % | nights with result > 0 | H/R | 10 nights | Number + CI | P1 |
| Consistency | SD of per-night boots/100 | R | 8 nights | Number vs club | P1 |

### 4.10 Position and turn order

| Metric | Definition | Data | n | Viz | Caveats | P |
|---|---|---|---|---|---|---|
| Result by act order (Teen Patti) | boots/100 by position relative to first actor (first, middle, last) | R | 150 per bucket | Three dots | First actor is the seat after the initiator, so not a rotating button | P1 |
| Result by position (Hold'em) | BTN, CO, MP, EP, SB, BB | R | 100 per position | Six dots | Classic, needs many hands | P2 |
| Action mix by position | aggression by position | R | 50 per position | Small multiple | | P2 |

### 4.11 Risk, variance, profitability

| Metric | Definition | Data | n | P |
|---|---|---|---|---|
| SD of result per hand | in boots | H+R | 200 | P1 |
| Risk appetite | mean boots committed per hand; share of hands committing ≥ 10 boots | R | 100 | P1 |
| Profit source split | won at show vs won without a show (opponents packed) | R | 100 wins | P1 |
| Loss source split | lost at show vs packed after investing k boots | R | 100 losses | P1 |
| Expected vs actual (luck chart) | cumulative result vs cumulative card-expected result (§9.3) | E+R | 300 | P1 |

### 4.12 Streaks and comebacks

| Metric | Definition | Data | n | Caveats | P |
|---|---|---|---|---|---|
| Longest win / loss streak | consecutive hands won / lost | H | none | Descriptive record only; streaks are expected by chance | P0 |
| Comeback | night where stack fell below 25% of the buy-in **without borrowing** and the night ended at or above the buy-in | R+L | none | Lending invalidates; count, not a rate | P2 |
| Comeback rate | comebacks ÷ nights that reached < 25% | R+L | 10 such nights | Tiny n; P3 for any label | P3 |

### 4.13 Style (definitions in §4.18)

| Metric | Definition | Data | n | P |
|---|---|---|---|---|
| Looseness | Teen Patti: % hands still in after the first full betting round; Hold'em: VPIP | R | 150 hands | P1 |
| Aggression | aggression frequency (§4.5) | R | 150 decisions | P1 |
| Blind tendency (TP) | % decisions blind | R | 150 | P1 |
| Pressure response | fold to raise | R | 30 spots | P1 |
| Volatility | SD per night | R | 8 nights | P1 |
| Style quadrant | percentile of looseness × aggression within club and game | R | as above | P2 |

### 4.14 Skill and decision quality

| Metric | Question | Definition | Data | n | P |
|---|---|---|---|---|---|
| Edge beyond cards | Do I do more with my cards than an average club player would? | mean residual of net_boots after a club model on equity, table size, variant (§9.3) | E+R | 500 | P1 |
| Blackjack strategy accuracy | Do I play correctly? | % decisions matching basic strategy (6-deck, dealer rules of this engine); EV lost per 100 hands | C+R | 100 decisions | **P1**: exact, cheap, unambiguous |
| Hold'em all-in luck | Did I get unlucky all-in? | Σ (all-in equity × pot − actual) | C+R | 20 all-ins | P2 |
| Teen Patti pot-odds check | Do I pack and stay at the right times? | at each decision, equity vs live opponents compared to the call's break-even; "loose calls" and "over-folds" | E+R | 100 decisions | P2 (approximate: single-step) |
| Rummy discipline | Drops, points conceded, wrong pickups | drop rate; mean points when losing; % discard-pile draws later discarded | R+C | 50 hands | P2 |
| Skill rating | Opponent-adjusted strength | multiway Bradley-Terry / TrueSkill-style on direct contests, per game | R | 200 | P3 |

### 4.15 Table, social, club (owner and club pages)

| Metric | Definition | Data | P |
|---|---|---|---|
| Attendance | members per night; nights per member; retention (played in last 4 weeks) | H | P0 |
| Co-play graph | hands together per pair; clusters | H | P1 |
| Variant health ★ | per variant: hands/hour, mean pot (boots), fold rate, show rate, % pot-limit endings | R | P1 |
| Lineup effect ★ | hands per night and night length by lineup used | R | P2 |
| Timeouts and AFK ★ | timeout rate per player, per night | R | P1 |
| Mid-hand leaves | leaves during a hand | R | P2 |
| Lending network ★ | who lends to whom, amounts, acceptance rate | L | P1 |

### 4.16 Historical trends

| Metric | Definition | n | P |
|---|---|---|---|
| Rolling result | rolling 300-hand boots/100 with CI ribbon | 300 | P1 |
| Rolling style | rolling aggression and looseness | 150 | P2 |
| Change detection | flag when the last 300 hands differ from the previous 300 beyond CI (style, not result) | 600 | P2 |

### 4.17 Anomaly and integrity

| Metric | Definition | Data | P |
|---|---|---|---|
| Soft play | pair A, B: rate of raising each other vs raising others, given hands together | R | P3 |
| Chip dumping | flows A→B far above expectation with A packing strong hands to B's bets | E+R | P3 |
| RNG drift | rolling χ² of card frequencies | C | P2 |

Integrity output goes **only to owners**, as "worth a look", never as accusations, and only
with large samples.

### 4.18 Style classification (quantitative and explainable)

Labels are a **presentation of percentiles**, not hidden models. Computed per game (Teen Patti
and Hold'em separately), only over real hands, with minimum n = 150 decisions, against the
club distribution of players who also meet the minimum.

| Label | Rule (percentile within club, same game) | "Why" shown to the player |
|---|---|---|
| Loose | looseness ≥ 67th pct | "You stay in after the first round in 58% of hands (club median 41%)." |
| Tight | looseness ≤ 33rd pct | same metric |
| Aggressive | aggression ≥ 67th pct | "31% of your decisions are raises (club median 18%)." |
| Passive | aggression ≤ 33rd pct | same |
| Blind player (TP) | blind tendency ≥ 67th pct | "You make 64% of your bets blind." |
| Pressure-sensitive | fold-to-raise ≥ 67th pct (n ≥ 30 spots) | "You pack 72% of the time after a raise (club 51%, 46 spots)." |
| Steady / Swingy | per-night SD ≤ 33rd / ≥ 67th pct (≥ 8 nights) | "Your nights range from −40 to +55 boots." |
| Value bettor (self only) | aggression with top-tercile equity ≥ 2× aggression with bottom tercile | equity-split numbers |
| Bluffer (self only) | aggression with bottom-tercile equity ≥ 67th pct of club (computed privately) | equity-split numbers; never public |

Combined quadrant names (Teen Patti): Tight + Aggressive = "Sharp", Loose + Aggressive =
"Fearless", Tight + Passive = "Careful", Loose + Passive = "Along for the ride". Hysteresis: a
label changes only when the percentile crosses the boundary by 5 points, so people don't flip
weekly.

Requested labels deliberately **not** offered: "weak hand specialist", "comeback player",
"opportunistic", "late folder" (see §14).

---

## 5. Player analytics experience

Information hierarchy: **one screen that answers "how am I doing and is it real", with
everything else one tap deeper.**

**Overview (default)**

1. Four headline tiles:
   - **Result** in boots/100 with a confidence word ("Clearly winning", "Probably winning",
     "Too early to tell") instead of a raw CI.
   - **Hands · nights**.
   - **Best game**, or "No clear best game yet".
   - **Style** label, tap for the why.
2. **Luck chart** (signature visual, P1): cumulative result vs what an average club player would
   have made with your cards. The gap between the lines is the most honest skill picture we can
   give.
3. **Three insights** from the insight engine (§8), each with its evidence and n.
4. **Recent nights** strip: green and red blocks, tap through to the night.

**Deeper sections (tabs)**

| Tab | Content | Main visuals |
|---|---|---|
| Games | favourite vs best side by side; per-variant forest plot; table size | Forest plot (dot + CI), never plain bars for comparisons |
| Cards (self only) | what the deck gave you vs expected; rare hands log; **clearly labelled "this is luck"** | Paired bars; rare-hand timeline |
| Hands (self only) | performance by hand category and equity tier; strong hands lost, weak hands won, each a list | Category × outcome grid (cells greyed below n) |
| Style | style quadrant (you vs club), the metrics behind each label, blind play, show initiative | 2D scatter with you highlighted |
| Behaviour (self only) | after wins / losses, streaks, stack depth, night arc | Small multiples with baseline line |
| Opponents | list of friends sorted by hands together, with edge and contest record | Sortable table |
| Nights | calendar, per-night results, drawdown | Calendar heatmap, strip |
| Trends | rolling result and style | Line with CI ribbon |
| History | filterable hand list → hand replay | Table |

**Drill-down rule:** every number is a link to the filtered hand list that produced it, and every
hand opens a replay (actions in order, your cards, shown cards, the deck proof). The replay is
what makes a statistic believable.

**Tooltip rule:** every metric has a "?" with the definition in one sentence and the n.

## 6. Game analytics experience

- **Per-player game view:** a two-column comparison, "Most played" vs "Best results", because
  they are usually different and that difference is itself interesting.
- **Per-variant card (club level, owner):** hands played, hands/hour, mean pot in boots, fold
  rate, show rate, pot-limit endings, who plays it best (shrunk, n-gated). Helps choose the
  night's lineup.
- **Variant comparison:** a table, not a chart. Rows are variants, columns are tempo, pot size,
  volatility and popularity, with sparklines for trend.
- **Game-specific panels:** Teen Patti (blind play, shows), Hold'em (VPIP / PFR / AF / position),
  Blackjack (strategy accuracy, EV lost), Rummy (drops, points).

## 7. Head to head experience

- **Entry:** from the Opponents tab, or a friend's profile ("You vs Riya").
- **Header:** hands together · nights together · direct contests (W–L) · net flow in ₹ and
  boots, with "edge" stated only when the CI excludes 0.
- **Story line:** cumulative net flow between the two over time.
- **Breakdowns:** by game, show record, biggest pots each way.
- **"How you play against them"** (P1): your fold-to-their-raise and aggression vs your
  baseline, phrased as "You pack more often when Riya raises (68% vs your usual 51%, 41 spots)".
- **Club matrix (owner and club page):** heatmap of pairwise net flow per 100 hands, cells
  greyed below n. This doubles as the friendly-rivalry wall.
- Blackjack is excluded: players don't play against each other.

## 8. Insight engine

### 8.1 Pipeline

1. **Hypothesis families**, each a template with a fixed test:
   - Game comparison: result or wins-over-expectation, game A vs B.
   - Opponent: edge vs X; behaviour change vs X.
   - After-outcome: aggression after loss vs baseline.
   - Card luck vs result ("profitable despite below-average cards").
   - Style: percentile extremes.
   - Records: new personal bests (no test needed: descriptive).
   - Trends: change point in style or result.
   - Night recap: tonight vs your usual.
2. **Evaluate** each hypothesis for each player after every night ends (hook on `endNight` and
   `saveNight`) and on a daily cron. Store the effect, CI, n, test statistic and q-value.
3. **Gate:**
   - n at or above the template's minimum;
   - effect size above a practical threshold (e.g. ≥ 5 percentage points or ≥ 2 boots/100);
   - Benjamini–Hochberg FDR ≤ 10% across all hypotheses tested for that player that run.
4. **Rank** by interestingness = |standardised effect| × confidence × novelty (decays if
   shown before) × relevance (recent games weigh more).
5. **Scope:** each template declares `self`, `friends` (public data only) or `owner`. A
   template that touches C/E is `self` by construction.
6. **Phrase** with tiered language by confidence: "consistently" (q < 0.01, n large), "tends
   to" (q < 0.1), otherwise not shown. Always include n and the comparison. Absolute
   differences ("12 points more often"), not relative ("31% more"), unless both bases are
   large.
7. **Feedback:** 👍 / 👎 per insight, used to tune template weights.

### 8.2 Example outputs (as players would read them)

- "In Teen Patti you win 9 points more often than your fair share at the table; in Hold'em you're
  right at it. (412 and 180 hands)"
- "Against Riya you've won 23 of 35 head-to-head showdowns, and you're up ₹1,240 over 290 hands
  together."
- "After two losses in a row you raise 14 points more often than usual, even with similar cards.
  (52 hands after back-to-back losses)" (self only)
- "Your cards over the last 300 hands were below average (bottom 20% of what the deck usually
  deals), and you still finished +18 boots." (self only)
- "New record: your biggest pot, 42 boots, in Muflis on 12 Oct."
- "You pack 72% of the time after a raise from Arjun, compared with 51% against everyone else.
  (39 spots)"

### 8.3 Where insights appear

Overview tab (three), the existing thank-you email after a night (one personal insight plus
the night's facts), and the head-to-head page.

## 9. Skill versus luck: statistical methodology

### 9.1 Normalise before comparing

- Chips → **boots** (Teen Patti), **big blinds** (Hold'em), **base bets** (Blackjack),
  **points** (Rummy). Never mix games in one money number except for real rupees.
- Win rate → **wins over expectation** with baseline 1/n per hand (fractional for splits).

### 9.2 Intervals and shrinkage

- Proportions: Wilson intervals. Comparisons: Newcombe's difference interval.
- Mean result per hand: heavy-tailed. Use a **night-level block bootstrap** (hands within a night
  are correlated through stacks and mood) for CIs.
- **Empirical Bayes shrinkage** for every displayed per-player rate:
  - beta-binomial for proportions;
  - normal-normal for boots/100, with between-player variance estimated from the club.

  A player with 40 hands is pulled strongly toward the club mean, which is what makes
  leaderboards of rates sane.

### 9.3 Separating card luck from play

- **Card luck** = Σ_i (equity_i − 1/n_i), where equity_i is showdown equity at deal against
  the actual number of opponents (exact enumeration for 3-card heads-up; Monte Carlo with 2,000
  samples otherwise, reusing `winChance()` from `server/bots/strategy.mjs` with more samples).
  Each hand's luck is compared to a simulated distribution, so a percentile can be shown.
- **Edge beyond cards:**
  1. Fit a club-wide model of net_boots on equity bucket × table size × variant family, pooling
     all players (gradient-boosted or simple cell means with smoothing).
  2. A player's edge is the mean residual (actual − model prediction), with a block-bootstrap CI.
  3. Read it as: "with the same cards at the same tables, an average club player would have made
     X; you made Y."
  4. It controls for cards, not for opponents. Opponent adjustment is the P3 rating.
- **Showdown luck (Hold'em all-ins):** replace realised all-in results with equity × pot for an
  "all-in adjusted" result line.
- **Blackjack** is the cleanest case: expected value per decision is known exactly, so decision
  quality is measured directly.

### 9.4 Sample size, made explicit

Detecting an edge of δ boots/hand with per-hand SD σ needs roughly n ≈ (1.96·σ/δ)² hands.
With an illustrative σ = 8 boots and δ = 0.5, that is about 1,000 hands. We will measure σ per
game from the data once T2 exists and print the real "hands needed" in the UI ("About 600 more
hands before we can tell").

### 9.5 Minimum sample rule

A metric is shown with a value only when n ≥ its minimum. Between the minimum and 3× the
minimum it carries a "early read" marker. Labels and insights require the full test in §8.1.

### 9.6 Multiple comparisons

26 variants × opponents × conditions means hundreds of implicit tests per player. Any surface
that picks "the best / worst / most" from many candidates (best variant, toughest opponent,
lucky time) uses shrunk estimates and FDR control, or says "no clear answer yet".

### 9.7 Things that look like skill and aren't

- High raw win rate at small tables.
- Big net from one huge pot.
- "Wins with weak cards" when opponents simply had weaker cards at the show.
- Streaks: expected under chance; shown as records, never as "hot hand".

## 10. Data and event architecture

### 10.1 Principles

- **Capture once, at the source of truth:** the room Durable Object, inside the existing
  `commit()` transaction, through the existing `history_outbox`.
- **Raw hand records are the source; everything else is derived and rebuildable.**
- **Privacy by storage boundary:** hidden cards live in a separate collection that queries reach
  only through a player-scoped API.
- **Counters, not ratios,** in aggregates, so any period can be rolled up.

### 10.2 Capture path (changes to existing code)

- `RoomDurableObject.commit()` already receives `before`, `after` and the movement. Extend
  `trackClubHand()` (server/club/history.mjs) into a **hand recorder**:
  - pass the event name and actor id;
  - on each commit, append a canonical action to the in-progress record in
    `room_meta.clubHand` (where the running net is kept today);
  - at completion, emit the full record to `history_outbox`.
- Header fields (T1) come from the `after` snapshot at the deal. Cards (T5) come from the
  snapshot at the deal and at completion (after discards). Pairwise flows (T4): factor the
  proportional rule out of `recordReal()` so it returns the flows it already computes.
- Bots: recorded the same way, flagged; the hand stays `practice: true`.
- `club_hands` stays as is for compatibility. From the switch-over, it is produced as a
  projection of the new record (same writer), so the two never disagree.

### 10.3 Records (revised: replayable, tiered, built for sequence and bot analysis)

The first draft stored a convenient summary of each hand. **It did not support decision-level
modelling** of P(action | state, cards, position, pot, stack, previous actions, opponents,
session), so it was revised (see §15.1 for the gap list). The revised model rests on one idea:

> **A hand record is the hand's starting state plus every input to `transition()`, in order.**

`transition()` is pure. Given the pre-deal state, the deck and each input `(actor, action,
payload, ctx)`, it reproduces every intermediate state exactly. Every feature anyone will ever
want at any decision (stacks, pot, live opponents, last aggressor, what was visible to whom) is
therefore *derivable*, and new questions never require a change to the historical data. The
convenience fields below are denormalised copies, checked against replay.

**Three information tiers**, stored separately and enforced by storage, not by convention:

| Tier | Contains | Who may read |
|---|---|---|
| **public** | Everything every seated player could observe: seats, stacks (except hidden balances), every action and amount, timings, shown cards, results | Anyone who was dealt in; aggregate analytics; bot opponent models |
| **private** (per player) | That player's own cards, when they saw them, their equity | That player; population-level (anonymous) models only |
| **sealed** (system) | Full deck order and salts, hidden-balance stacks, bot internals | Replay, enrichment and audits only; no API |

```js
// hand_records: public tier. One per hand.
{
  _id: 'room:handId', v: 2, recorder: 2, engine: '<build id>', rulesVersion, gameType,
  room, nightId: 'room:nightStartedAt', handNo,            // hand number within the night
  prevHandId,                                              // chain for session context
  startedAt, completedAt, practice,
  config: { boot, potLimit, tableChips, smallBlind, bigBlind, turnMs, autoReady },
  pick: { chooser, source: 'keep'|'next'|'random'|'lineup'|'mystery' },  // how this game was chosen
  seal: { commitment, cutBy, cutAt },
  seats: [{
    p, kind: 'human'|'bot', seat, order,                   // order = act order this hand
    stack,                                                 // starting stack; null when hidden (value in sealed)
    hidden: false,                                         // hideBalance at deal
    connected: true,
    bot: { botId, styleId, styleVersion, configHash,      // bots only (§15.3, §15.4)
           policy, memoryAsOf, memoryVersion }             // pinned memory snapshot (§15.5)
  }],
  firstActor, buttonSeat,
  events: [{                                               // every transition input, in order
    i, t,                                                  // index, ms since deal
    p,                                                     // actor id, or 'system'
    a, raw,                                                // canonical action (§4.0), engine action
    payload,                                               // public payload: amount, discard index, table move
    cause,                                                 // system events: 'timeout'|'pot-limit'|'knockout'|'auto-pack'
    decision: {                                            // present when the actor had a choice
      legal: { see, show, pack, bet: [min, max], check, call, raise: [min, max], table: n, discard: n },
      turnStartT, ms,                                      // decision time (bots: artificial delay, flagged)
      toCall, stakeMultiple,                               // TP: amount / min allowed
      potBefore, stackBefore, blind, street,
      live: n, lastAggressor, facing: 'none'|'call'|'raise'
    },
    connected: [ids]                                       // ctx.connected, needed for exact replay
  }],
  outcome: {
    reason, pot,
    winners: [{ p, amt }],
    sidePots: [{ amount, eligible: [p] }],
    players: [{ p, contributed, net, exit: 'won'|'lost-show'|'packed'|'timeout'|'knocked-out'|'left',
                exitAt: i, shown: bool }]
  },
  observers: [ids],                                        // everyone seated for the hand (players and bots)
  shown: [{ p, cards, category, rank, at: i | 'after',     // includes voluntary reveals after the hand
            observedBy: [ids] }],                           // who was still at the table to see it
  flows: [{ from, to, amt }],                              // human to human, recordReal rule
  verified: { replay: true, at }                           // set by the replay check
}

// hand_private: one per (hand, player)
{
  _id: 'room:handId:p', handId, p, completedAt, gameType, rulesVersion,
  dealt: [cards], final: [cards], seenAt: i | null,
  category, rank,
  equity: { deal, atDecision: [{ i, actorKnown, oracle }] }  // filled by enrichment
}

// hand_sealed: system tier, one per hand
{
  _id: 'room:handId', deck: [cards], salts, ctx: { recycledDeck, handId },
  hiddenStacks: { p: stack },
  botTrace: [{ i, p, botId, styleId, styleVersion, chosen, params,
              probs: { action: p }, features: {...}, reason, confidence,
              memoryRefs: [...], rngDraws: [...] }]           // §15.6
}

// night_events: between-hand behaviour, one per table-night
{
  _id: nightId, room, startedAt, endedAt,
  events: [{ t, p, a: 'join'|'leave'|'sit-out'|'sit-in'|'chip-ask'|'chip-answer'|'pick'|'cut'
             |'bot-add'|'bot-remove'|'end', payload, afterHand: handId }]
}
```

Notes:

- **Late reveals.** A player can show their cards after packing or after the hand ends. These
  arrive after the result, so they are appended to `shown` by an idempotent `$addToSet`
  amendment through the same outbox.
- **System events** (timeouts, pot-limit forced shows, Running knock-outs) are events with
  `p: 'system'` and a `cause`. They are never counted as decisions. A timeout while
  disconnected is not a "fold under pressure".
- **`decision.legal`** is what makes choice modelling possible. A pack when Show was unavailable
  is a different choice from a pack when it was available.
- **`engine` build id.** Replay is only valid against the engine that produced the record. Rules
  are versioned already (`rulesVersion`); the build id covers bug fixes.

Size: a Teen Patti hand is about 2 to 4 KB across the tiers. 1M hands is 2 to 4 GB, well
within MongoDB Atlas; the club will be orders of magnitude smaller for years.

### 10.4 Derived layers

1. **Enrichment job** (cron Worker, after archive): computes equity (T6), canonical hand
   categories for every variant, and tags (`strongLost`, `weakWon`, `directContest`). It is
   idempotent and keyed by `enrichVersion`.
2. **Daily aggregates:**
   - `player_day`: `{playerId, day (IST), gameType, rulesVersion, sizeBucket}`, with counters
     (hands, wins, expected wins, Σ net_boots, Σ net², decisions by canonical action, faced
     raises, folds to raise, shows, blind decisions, …).
   - `pair_day`: `{a, b, day, gameType}`, with counters (hands together, contests, contest wins,
     Σ flow, …).

   Computed by recomputing the affected `(player, day)` buckets from raw records after each
   archive. That is deterministic and idempotent, unlike `$inc` on retry.
3. **Period roll-ups** at query time: sum counters across days. Cheap at club scale; add
   materialised monthly buckets when needed.
4. **Decisions table** (`decisions`, rebuildable): one row per decision point, produced by
   replaying each hand. It is the training and analysis set for P(action | state):
   - **Label:** the canonical action and its size.
   - **Actor-known features**, each tagged `tier: actor`:
     - own cards if seen, and blind status;
     - position and act order;
     - pot, own stack, visible stacks, to-call and the legal set;
     - live opponents and their blind/seen status;
     - the action history this hand;
     - last aggressor and what they are facing;
     - this player's earlier results tonight, streak and hand number in the night;
     - who the opponents are;
     - the opponents' **public** history.
   - **Oracle features**, tagged `tier: oracle`: true equity against the actual hidden hands.
     Used for evaluation, never as an input to a bot or to anything shown about another player.
   - For bots, the logged action probabilities (§15.4).

   Rebuilt whenever feature definitions change (`featureVersion`).
5. **Insights** collection: `{playerId, template, scope, params, effect, ci, n, q, text,
   createdAt, shownCount, feedback, version}`.

### 10.5 Recompute and versioning

`npm run analytics:rebuild` regenerates enrichment, aggregates and insights from
`hand_records` + `hand_private`. Every metric definition carries a version. A definition change
bumps the version and triggers a rebuild, so historical numbers never mix definitions.

### 10.6 Correctness and testing

- **Replay check:** for each archived hand, run `transition()` from the header, the sealed deck
  and the action log, and assert the outcome matches. Run in tests over generated hands, and as
  a nightly sample check in production. This validates capture end to end.
- **Invariants:**
  - Σ net over all players = 0 for each hand;
  - Σ flows = Σ realNet changes;
  - Σ contributions = pot;
  - every seat's exit is consistent with the action log.
- **Aggregate check:** incremental `player_day` equals full recompute.
- **Metric unit tests** on fixed fixtures with hand-computed answers.
- **Statistical tests:** simulate fair players (bots with identical strategy). The engine must
  report "no clear difference" at the stated FDR. This tests that we don't invent skill.

### 10.7 Performance

- Capture adds one small JSON append per commit inside an existing transaction.
- Enrichment runs off the gameplay path.
- Equity is about 18k evaluations for exact 3-card heads-up, or 2k Monte Carlo samples multiway;
  milliseconds per hand.

### 10.8 Privacy

- `hand_private` is reachable only through `/me/...` endpoints keyed by the signed-in player,
  and through club-wide anonymous aggregates (fairness).
- Owners do **not** get other members' hidden-card analytics. Owners play too, so this keeps
  the table fair.
- Stack-depth analytics for a player who hides their balance are self only.
- Members can export or delete their analytics (delete `hand_private` rows; public records
  keep anonymised seats).
- GA receives no cards, amounts or names.

### 10.9 Real time

No live opponent HUD. Players can see their own stats between hands; nothing about opponents
is overlaid at the table (§14).

### 10.10 Google Analytics 4: how people use Chaal, not how they play

Division of labour:

| Layer | Answers | Source of truth |
|---|---|---|
| GA4 | Who opens the app, which screens and features they use, funnels, drop-off, devices | Browser events (`src/lib/analytics.ts`) |
| Hand records (§10.3) | Everything about play: cards, actions, results, head to head, style, skill | Room Durable Object → MongoDB |
| Analytics API (§11) | What players and owners see | Derived from hand records |

GA4 is **not** sent per-action gameplay events (`player_raised`, `player_folded`):
- they duplicate the authoritative record;
- they arrive from browsers, so they are lossy and unauthoritative;
- they burn GA4's quotas (distinct event names, 25 params per event, sampling in explorations);
- they would push game state into a third party for no gain.

GA4 never receives cards, chip amounts, balances, names or emails, and table names are reported
as `/table`.

**GA4 event catalogue** (user_id = member id, user property `club_role`):

| Event | When | Params | Status |
|---|---|---|---|
| `page_view` | every navigation | page_path (tables as `/table`) | Built |
| `login` | Google sign-in succeeds | method | Built |
| `table_create` | start panel creates a table | game_type, with_bots, invite | Built |
| `table_join` | seated at a table | game_type | Built |
| `hand_played` | client sees a hand result it was in (once per hand) | game_type, variant, table_size, practice | P1 |
| `night_ended` | night summary shown | hands_bucket (1–10, 11–50, 51+) | P1 |
| `variant_selected` | next game chosen when it's your pick | variant, source (pick / random / lineup) | P1 |
| `invite_copied` / `invite_opened` | invite link copied / opened | game_type | P1 |
| `chip_request` | ask / answer for chips | action (ask, accept, decline); no amounts | P2 |
| `analytics_viewed` | an analytics tab opened | section (overview, games, cards, …) | P1, with the dashboards |
| `insight_feedback` | 👍 / 👎 on an insight | template, value | P1 |
| `profile_updated` | nickname, character or photo changed | field | P2 |

Key GA4 reports to set up: retention cohorts by first night, the funnel invite opened → sign-in →
table joined → hand played, feature adoption of analytics tabs, and device mix (phone vs desktop
at the table).

**BigQuery export:** optional. GA4's free export suits joining usage with play (e.g. "do people
who open their analytics play more nights?"). That needs member id on both sides, which already
holds. It is not needed for game intelligence, which stays in MongoDB where the data is
authoritative. Revisit if usage questions outgrow GA4's interface.

## 11. API and database changes

**Collections and indexes**

| Collection | Indexes |
|---|---|
| `hand_records` | `{completedAt:-1}`; `{'seats.playerId':1, completedAt:-1}`; `{gameType:1, rulesVersion:1, completedAt:-1}`; `{nightId:1, handNo:1}` |
| `hand_private` | unique `{handId:1, playerId:1}`; `{playerId:1, completedAt:-1}` |
| `player_day` | unique `{playerId, day, gameType, rulesVersion, sizeBucket}` |
| `pair_day` | unique `{a, b, day, gameType}` (a < b) |
| `insights` | `{playerId:1, createdAt:-1}`; `{playerId, template, params}` unique |
| `hand_sealed`, `night_events` | `_id` only (system access) |
| `bots` | `_id` (bot_id slug); `{status:1}` |
| `bot_styles` | `{botId:1, version:-1}` unique |
| `bot_player_memory` (phase 2) | unique `{botId, playerId}` |
| `bot_episodes` (phase 3) | `{botId:1, playerId:1}`; vector index only if adopted |
| `club_hands` | unchanged (becomes a projection) |

**Endpoints** (Worker, same auth as today)

| Endpoint | Who | Returns |
|---|---|---|
| `GET /me/analytics/overview?period&game&variant&size` | self | headline, luck chart series, insights |
| `GET /me/analytics/games` | self | per game / variant metrics |
| `GET /me/analytics/cards` | self | card and hand-category data (private) |
| `GET /me/analytics/style` | self | style metrics, labels and reasons |
| `GET /me/analytics/behaviour` | self | conditional behaviour |
| `GET /me/analytics/opponents` | self | per opponent summary |
| `GET /analytics/h2h/:playerId` | self + that friend | head-to-head (public data only) |
| `GET /me/hands?filters&cursor` | self | drill-down list |
| `GET /hands/:id` | anyone who was dealt in | replay: public record + own private cards |
| `GET /club/analytics` | members | public club views (attendance, rivalry wall, records) |
| `GET /admin?analytics=` | owners | existing tab; extended with variant health, timeouts, integrity flags |
| `POST /me/insights/:id/feedback` | self | 👍 / 👎 |
| `GET /bots` | members | directory: active bots, current style summary, public stats |
| `GET /bots/:botId` | members | bot page; plus the caller's own history with that bot |
| `GET/POST /admin/bots` | owners | create, edit, enable/disable/retire |
| `POST /admin/bots/:botId/styles` | owners | draft, validate, publish a style version |
| `GET /admin/bots/:botId/analytics` | owners | performance by version, predictability, humans vs bot |

## 12. Roadmap

**P0: capture and fundamentals**

1. Hand recorder v2 (T1 to T5, T7), `hand_records` + `hand_private`, outbox, replay test, invariants.
2. Boot normalisation and wins over expectation; fix the existing admin tab with them.
3. Player overview (hands, nights, result with CI and shrinkage, best vs favourite game).
4. Head to head basics (hands together, exact net flow, direct contests).
5. Hand history and replay (the drill-down destination).
6. Club fairness view (card frequency χ²).
7. Attendance and retention for owners.

**P1: understanding play**

1. Enrichment job: equity, categories, tags.
2. Luck chart and edge beyond cards.
3. Betting and style metrics: Teen Patti blind play, show initiative, aggression, fold to raise;
   Hold'em VPIP / PFR / AF / WTSD.
4. Behaviour after outcomes (self).
5. Blackjack strategy accuracy.
6. Insight engine v1 with FDR; one insight in the thank-you email.
7. Variant health for owners; lending network; timeouts.

**P2: depth**

1. Style labels with hysteresis.
2. Position.
3. Tilt.
4. Stack depth.
5. Teen Patti pot-odds check.
6. Hold'em all-in adjusted results.
7. Learning curves.
8. Night arc.
9. Opponent-adjusted results.
10. Change detection.
11. RNG drift monitoring.

**P3: experimental**

1. Multiway skill rating.
2. Sequence mining.
3. Slow-play detection.
4. Integrity (soft play, chip dumping).
5. Decision-time tells (self).
6. Comeback rate.

## 13. Ideas beyond the brief

1. **Fairness view.** The sealed, cut deck is already a trust feature. Card distribution
   belongs there, as proof the deck is fair, not as a personal trait.
2. **Blind play.** Teen Patti's distinctive choice. Players will love "you stay blind 3 rounds
   on average, and it pays: +4 boots/100 blind vs −1 seen".
3. **Show economics.** Who asks for the Show, how often it works, and the tie-goes-against-you
   rule in practice.
4. **Variant health for the owner.** Which games make good nights (tempo, pot size, fold rate).
   It feeds straight into the lineup editor that already exists.
5. **Game picking.** When it's your pick, do you choose games you're good at?
6. **Cutter effect.** Does cutting the deck help? It shouldn't, and showing that builds trust.
7. **Lending network.** Who bails out whom, and whether borrowed chips are played differently.
8. **Night arc.** Do you fade after midnight?
9. **Learning curve.** How many hands until you break even in a new variant.
10. **Personal records and milestones.** First trail, biggest pot, longest run, 1,000th hand.
    Descriptive, fun, statistically safe.
11. **Night recap in the thank-you email.** Your night vs your usual, plus one insight.
12. **"Expected vs actual" per night.** "You had the 2nd-best cards tonight and finished 4th."
    Honest and gently funny.
13. **Rivalry wall.** The club head-to-head matrix as a social object.
14. **Integrity monitoring.** Real money settles up between friends; soft play and chip
    dumping are worth a quiet owner-only check.
15. **Replay as evidence.** Every statistic links to the hands behind it.
16. **Fair-player simulation.** Run bots with identical strategy through the analytics and
    check it reports no skill difference. A test of the analytics, not of the players.

## 14. What should not be built, and why

| Requested idea | Recommendation | Why |
|---|---|---|
| "What cards does this player receive most often" as a personal trait | Fairness view and a "this is luck" self panel only | Pure randomness. Presenting it personally invites gambler's fallacy ("I always get bad cards") |
| Win rate per exact starting hand | Buckets only | 22,100 Teen Patti combos, 169 Hold'em classes; per-player samples are tiny |
| "Who bluffs the most" public ranking | Self only; public only "caught bluffing at shows" with a bias caveat | Requires opponents' hidden cards; publishing undoes the secrecy the deck proof protects and gives an edge next game |
| "Who folds under pressure" with card context, public | Public version without cards only | Same leak |
| Live opponent stats (HUD) at the table | Don't | Spoils the social game and makes an information race |
| "Performs best with weak cards" / "wastes strong hands" as labels | Self-only lists with equity context; no labels | Overwhelmingly luck at club sample sizes |
| "Comeback ability" as a score | Count of comebacks only | Tiny n, and chip lending confounds it |
| "Weak hand specialist", "opportunistic", "late folder" labels | Don't | No defensible definition separate from luck or from looseness / aggression |
| Composite skill, rivalry or dominance scores | Only the defined edge with CI (§4.8); rating at P3 | Unexplainable numbers erode trust |
| "What time / conditions correlate with best performance" | Night arc only, FDR-gated | Classic forking-paths result: something will always look significant |
| Relative % differences ("31% more often") on small bases | Absolute differences with n | Inflates tiny effects |
| Raw win % and raw chip totals across tables | Normalise (§9.1) | Misleading across table sizes and stakes |
| Blackjack head to head | Exclude | Players don't play against each other |
| "Behaviour changes after losses" stated causally | Descriptive wording only | Stack, cards and opponents change too |
| Admins seeing everyone's hidden-card analytics | Don't | Owners play at the table too |


---

## 15. Pattern discovery, bots and human vs bot analytics

### 15.1 Does the first schema support this? No. What was missing, now fixed in §10.3

| Needed for | Missing in the first draft | Fixed by |
|---|---|---|
| Exact state at every decision | Starting stacks, `turnMs`, connected set, Rummy reshuffle, deck order | Replayable record: pre-deal state + every transition input; `hand_sealed` |
| Choice modelling | What the actor *could* have done | `decision.legal` |
| Separating decisions from automation | Timeouts, forced shows, knock-outs mixed with actions | `p: 'system'` events with `cause` |
| Disconnect vs pressure | Connection state | `connected` per event |
| What each actor knew | Blind / seen timing, hidden balances, late reveals | `seenAt`, `hidden`, `shown[].at`, amendments |
| Session context | Night chain, hand number, between-hand behaviour (sit-out after a loss, leaving, borrowing) | `nightId`, `handNo`, `prevHandId`, `night_events` |
| Game selection behaviour | Who picked the game and how | `pick` |
| Bot identity over time | Bots exist per table only (`bot-xxxx`, level, random name) | Persistent club bots (§15.3) with `botId`, style id and version, and config hash per seat |
| Bot evaluation | Why a bot chose, and with what probability | `botTrace` in the sealed tier (§15.4) |
| Valid replay over code changes | Engine version | `engine` build id |
| Feature leakage control | No tagging of what a feature reveals | `tier: actor | oracle` on every derived feature |

With these, P(action | game state, cards, position, pot, stack, previous actions, opponents,
session context) can be estimated for any player or bot from history, without changing the
stored model. New features are new derivations in the decisions table.

### 15.2 Information boundaries (humans and bots alike)

1. **A decision may use only the actor's information set:**
   - their own cards, once seen;
   - public events at that table so far;
   - public records of earlier, already completed hands at which **this specific actor** was
     seated, limited to what they observed (`observers`, `shown[].observedBy`).

   Bot A never receives Bot B's observations. A style version change keeps the bot's memory,
   because memory belongs to the bot's identity, not to its style.
2. **Hidden cards never become known.** A packed hand that was never shown stays unknown
   forever. Not to opponents, not to bots, not to opponent models, not to owners.
3. **Opponent-specific models** (of one named human) use only public-tier data from hands the
   observer sat in. That is exactly what a sharp human at the table could remember.
4. **Population-level models** (how people in general play a weak hand) may use private-tier data
   **only in aggregate**, never keyed to an individual, never surfaced per person. This keeps
   the user's rule: internal pattern detection is fine; scouting is not.
5. **Oracle features** exist for evaluation and for the player's own self-view only.

Enforcement, not trust:

- Bots read the world only through `projection(room, botId)`, as they do today (`nextBotMove`
  in `server/bots/runner.mjs`), plus a memory snapshot from the **MemoryProviders** (§15.5).
  The providers can see only an observer-filtered history view. Bots get no database handle,
  and no access to admin analytics, oracle features or other bots' memory.
- **Hidden-card invariance test:** for random hands, replace every opponent's hidden cards and
  re-run the bot with the same random draws. The decision must not change. This runs in CI for
  every bot policy and style version.
- The decisions table refuses (by schema) to feed `oracle` columns into the bot training set.

### 15.3 Bot identity, directory and lineage

Bots are **persistent characters**, not difficulty settings. Five default bots ship first (names
and artwork to come); owners can add more. Anonymous easy / normal / hard bots stop being the
product. Their existing behaviour becomes three legacy styles so history stays labelled (§15.11).

```js
// bots: one per character. Never deleted.
{
  _id: 'raju',                        // bot_id: stable slug, used in every record
  name: 'Raju', avatar: { assetId, mascotId? },
  description: 'Plays blind for ages and loves a big raise',
  personality: { traits: ['patient', 'stubborn'], voice: 'teasing' },  // presentation only
  status: 'draft' | 'active' | 'disabled' | 'retired',
  currentStyle: 'raju@3',
  createdAt, createdBy, retiredAt?
}

// bot_styles: immutable once published. The lineage of a bot is its list of styles.
{
  _id: 'raju@3', botId: 'raju', version: 3, parent: 'raju@2',
  status: 'draft' | 'published' | 'superseded',
  policy: 'tp-tendencies@1',          // which policy code interprets the config
  supportedGames: ['teen-patti'], supportedVariants: ['*'] | [...],
  tendencies: { ... },                // §15.4
  difficulty: { declared: 'tough', measured: { ... } },  // measured is filled from its fingerprint
  configHash,                         // hash of policy + tendencies + supported games
  source: 'manual' | 'ai-assisted',   // AI-assisted still publishes plain config (§15.4)
  validation: { schema, invariance, simulation: { hands, vsReference }, predictability },
  publishedAt, publishedBy, notes
}
```

- **Lineage:** Raju → `raju@1` → `raju@2` → `raju@3`. Publishing a style creates a new immutable
  version and moves `currentStyle`. Nothing already played changes.
- **Every historical decision** carries `botId`, `styleId`, `styleVersion` and `configHash`
  on the seat, plus the full trace in the sealed tier. That is enough to know exactly which
  policy produced it.
- **Retire** means: no new seats, the directory shows it as retired, history and memory are
  kept. **Disable** is a temporary hide.
- **Seating:** a host adds one or more directory bots to a table whose game the bot's current
  style supports. The table seat id stays per table (`bot-xxxx`). Today bots play Teen Patti
  only (`botDue` in `server/bots/runner.mjs`), so `supportedGames` gates the picker.

### 15.4 Styles as versioned policies

A style is **explicit, deterministic configuration** interpreted by versioned policy code: a
function from actor-known features to a probability distribution over legal actions, built
from state-dependent tendencies.

```js
tendencies: {
  blindRounds: { mean: 3, sd: 1 },                       // how long it stays blind
  raiseWhen: { strength: '>= 0.62', bluff: 0.06 },
  showWhen:  { strength: '>= 0.5', liveOpponents: 1 },
  pressure:  { foldToRaise: { strengthBelow: 0.4, p: 0.7 } },
  afterLoss: { bigLossBoots: 10, aggressionDelta: +0.1, hands: 3 },   // tilts a little
  stack:     { short: '< 15 boots', shoveBias: +0.15 },
  memory:    { use: false, weight: 0.2, minHands: 50,             // how much it trusts memory
               uses: ['player.foldToRaise', 'player.blindRounds'] }
}
```

**Publishing pipeline:**

1. Draft.
2. Schema check.
3. Hidden-card invariance test (§15.2).
4. Simulation against the reference bots in the pure engine: result, fingerprint, and
   predictability.
5. Owner review of measured vs intended tendencies.
6. Publish, which makes the version immutable.

**AI-assisted authoring.** Claude or another tool may *propose* a style: a JSON draft, an
explanation, and suggested tests. The proposal enters the same pipeline as a manual draft and
is published as plain configuration. **No LLM runs in the live game loop.** Live decisions are a
deterministic function of style config, observable state, memory snapshot and recorded random
draws.

### 15.5 Bot memory

Four kinds, with one source of truth:

| Kind | What | Store | Phase |
|---|---|---|---|
| **Historical truth** | The immutable hands the bot played: public tier plus the bot's own private tier | `hand_records`, `hand_private` (§10.3) | 1 (the recorder) |
| **Structured player memory** | Per (bot, player): hands together, games together, fold / raise tendencies, blind duration, bet sizing, response to pressure, behaviour after wins and losses, position behaviour, recent changes. **Each tendency carries n and a confidence interval** | `bot_player_memory` in MongoDB, rebuildable from historical truth | 2 |
| **Episodic memory** | Notable situations from hands the bot played: a reference (`handId`, event range) plus a feature vector of observable facts, e.g. "this player raised big while blind after 3 losses" | `bot_episodes`; a vector index **only if** retrieval measurably improves play | 3 |
| **Lineage** | Which style produced what; memory spans styles | `bot_styles`, seat fields | 1 (identity fields) |

**MemoryProvider abstraction** (the only way bots, or code acting for bots, read memory):

```ts
interface HistoryView {        // the root of every provider: observer-filtered and time-bounded
  hands(botId, { before: Date, players?: string[] }): AsyncIterable<ObservedHand>;
}
interface StructuredMemoryProvider {
  snapshot(botId, playerIds, asOf): Promise<{ version, players: Record<id, Tendencies> }>;
  rebuild(botId): Promise<void>;
}
interface EpisodicMemoryProvider {
  ingest(botId, hand: ObservedHand): Promise<void>;
  recall(botId, situation: ObservableSituation, { k, asOf }): Promise<EpisodeRef[]>;
}
```

- `ObservedHand` is constructed **only** from the public tier filtered by `observers` /
  `observedBy`, plus the bot's own private tier. It is the same view a human seated in that
  chair would have had.
- **Vector retrieval cannot widen the boundary.** Episodes are embedded from `ObservedHand`
  data only, filtered by `botId` at query time, and returned as references that resolve back
  through `HistoryView`.
- **No future information:**
  - memory is snapshotted when the hand is dealt (`memoryAsOf`, `memoryVersion` on the seat),
    so a decision can never see a hand that finished later;
  - within the hand, the bot uses only the live projection.
- **Authoritative hands never live only in a vector store.** Structured and episodic memory are
  caches that can always be rebuilt.

### 15.6 Bot decision context and trace

Input (built by the room Durable Object at decision time):
- legal game state: `projection(room, botId)`, which includes its own cards, public table
  information and legal actions;
- the style config;
- the structured memory snapshot for the players at the table;
- recalled episodes (later);
- confidence for each memory item.

Output, written to `hand_sealed.botTrace` and linked by event index:

| Field | Meaning |
|---|---|
| `chosen`, `params` | The action and its amount or index |
| `probs` | Probability of each legal action, where the policy has one |
| `styleId`, `styleVersion`, `configHash` | What produced it |
| `memoryRefs` | Which structured items (player, tendency, version) and episodes were used |
| `reason` | A short category from a fixed list, e.g. `strong-raise`, `pot-odds-call`, `bluff`, `memory-exploit-fold-to-raise`, `blind-hold`, `show-strong`, `mistake` |
| `confidence` | The policy's own confidence where meaningful |
| `rngDraws` | The random draws consumed, so the decision can be reproduced exactly |

There is no free-text reasoning and no chain of thought: only structured metadata.

### 15.7 Bot directory and admin bot management

**Bots page (members).** A card per active bot:
- artwork, name, description and personality;
- playing style in plain words, generated from its **measured** fingerprint;
- supported games;
- difficulty characteristics;
- style version;
- public statistics, n-gated: hands played, club record, current form.

Members pick one or more bots to add to a table. Personal lines on each card come from the
member's own history with that bot:

- "Raju has played 412 hands with you."
- "You are 38 boots up against Raju." (CI-gated wording: "up" only when the CI excludes 0,
  otherwise "about even")
- "Raju has started folding more often to your large raises." (only from structured memory
  with a significant change)
- "You have beaten Raju in 6 of your last 10 nights."
- "Raju remembers 27 notable hands involving you." (counts episodes; phase 3)

**Admin → Bots (owners):**
- create a bot (name, artwork, description, personality);
- edit a draft style;
- run validation;
- publish a new version;
- enable, disable or retire;
- view lineage and diffs between versions;
- inspect performance by style version;
- inspect predictability curves;
- see how humans do against it, who exploits it and through which pattern (§15.9).

Admin analytics are read-only to the runtime: nothing on these pages feeds a live decision.

### 15.8 Bot fingerprint (same metrics as humans, plus these)

Every human metric in §4.5 to §4.13 applies to bots unchanged, because bots use the same record.
The fingerprint includes:

- aggression;
- passivity;
- blind duration;
- bluff frequency (oracle tier; fine to show for bots);
- fold pressure;
- bet sizing;
- Show behaviour;
- reaction to raises;
- reaction to losses;
- stack-dependent play;
- drift over versions.

Bot-specific additions:

| Metric | Definition | P |
|---|---|---|
| Policy entropy | mean entropy of the logged action distribution per decision type; low means rigid | P2 |
| Predictability (model-based) | accuracy and log-loss of a simple next-action model (features → action) trained on the bot's first k hands, tested on the next; plotted against k | P2 |
| Hands to predictable | smallest k at which accuracy is within 2 points of its plateau | P2 |
| Exploitability | EV (boots/100) a best-response policy gains against the style version, estimated by simulation in the pure engine. The best response is approximated by search over a counter-policy family | P3 |
| Adaptation | change in the bot's action distribution vs a given opponent as hands together accumulate; only meaningful with `adaptation.enabled` | P3 |
| Consistency with style | measured tendencies vs the configured ones; catches bugs | P2 |

### 15.9 Human vs bot analytics

| Question | Method | P |
|---|---|---|
| Which players exploit a particular bot? | Net flow human → bot per 100 hands together, shrunk; only for real hands vs bots (practice hands) | P1 |
| What pattern allowed it? | Split the human's edge by decision context (e.g. "bot faces a raise while seen, weak equity"). Report the contexts where the bot's response is furthest from best response, weighted by frequency × EV. Uses the bot's oracle data (the bot's own cards), which is allowed for bots | P2 |
| Which bot exploits a style? | Bot result vs human style quadrant (§4.18), n-gated | P2 |
| Can a player learn a bot? | The human's edge and their fold-to-bot-raise as a function of hands played against that bot: a learning curve | P2 |
| Is the bot too predictable? | §15.8 predictability curve; flag style versions above a threshold | P2 |
| Can bots adapt fairly? | Adaptation uses only BotMemory (public tier, hands it sat in), verified by the invariance test | P3 |

### 15.10 Human pattern discovery

From the decisions table, with the same statistical guards as §9:

- **Conditional tendencies:** aggression after wins and losses, reactions to raises, blind vs
  seen, bet sizing, position, Show, stack depth, night progression, streaks. Each one is a
  comparison against the player's own baseline, with a CI and FDR.
- **Sequence mining (P3):** frequent hand-level sequences, e.g. "pack, pack, pack, then a raise
  blind". Mined per player and scored by lift over a shuffled baseline, so patterns that appear
  by chance are discarded. FDR-controlled.
- **Strategy drift:** change-point detection on rolling style vectors.
- **Scope:**
  - patterns built from public-tier features may be shown to friends (as with any public stat);
  - patterns that need the player's private cards are self-only;
  - nothing about one person is computed from another person's hidden cards.

### 15.11 What phase 1 builds vs reserves

**Phase 1 (the recorder) builds:**

1. `hand_records`, `hand_private`, `hand_sealed`, `night_events`, with the replay check and
   invariants. **Deterministic replay** is the acceptance test.
2. **Session identity:** `nightId`, `handNo`, `prevHandId`.
3. **Observer boundaries:** `observers` per hand, `observedBy` on late reveals, public, private
   and sealed tiers in separate collections.
4. **Permanent bot identity and style identity:**
   - `bots` and `bot_styles` collections;
   - today's easy / normal / hard become legacy bots `legacy-easy`, `legacy-normal`,
     `legacy-hard`, each with style `@1` describing the current `PROFILES` in
     `server/bots/strategy.mjs`;
   - every bot seat records `botId`, `styleId`, `styleVersion`, `configHash`.

   When the five characters arrive, they are new bots with their own styles. The legacy bots
   are retired from the picker but keep their history.
5. `botTrace` with `chosen`, `reason` (mapped from today's branches), style fields and
   `rngDraws`, so each bot decision can be replayed. `probs` and `memoryRefs` are present and
   empty.

**Reserved for later, with no change to the stored data:**
- the Bots page UI (waiting on names and artwork);
- admin bot management;
- the style editor and publishing pipeline;
- structured and episodic memory (`bot_player_memory`, `bot_episodes`);
- full propensities;
- the decisions table;
- every model.
