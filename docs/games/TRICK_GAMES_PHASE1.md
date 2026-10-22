# 3 2 5, 10 Pakad and 29 with the Chaal characters: Phase 1 (audit and design)

Status: **Phase 1 draft, stopped for review.** Nothing is built. Written against `main` at
`81ea2287` (2026-10-21).

The goal: Rohit, Virat, GG, Samay and Dhoni sit at a 3 2 5, 10 Pakad or 29 table and are still
recognisably themselves, play each game well, learn the table during a session, and never see a card
a person in their seat could not see. One Rohit, many games: **character** and **game intelligence**
are separate, and decisions come from game knowledge + personality + what the bot has learned tonight.

Decisions needed from you are collected in **§9**.

---

## 1. Repository audit

### 1.1 Games

| Game | Engine | Interface | Bots |
|---|---|---|---|
| Teen Patti (26 variants) | `server/engine.mjs` + `server/variants/*` | `transition`, `projection`, `invariant` | yes (the characters) |
| Texas Hold'em | `server/poker/holdem.mjs` | `newRoom`, `transition`, `projection`, `invariant` | no |
| Blackjack | `server/blackjack/blackjack.mjs` | same | no |
| Indian Rummy | `server/rummy/rummy.mjs` | same | no |

Non-Teen-Patti games plug in through `server/games/index.mjs` (`getGameEngine(gameType)`); the main
engine delegates `transition` and `projection` to them (`server/engine.mjs:553`, `:1088`). Hands
are versioned for replay (`server/games/versions.mjs`) and recorded by the analytics recorder.

**Implication:** the three new games are new plug-in engines (`server/tricks/…`). Teen Patti code is
not touched.

### 1.2 Bots today

- **Teen Patti only.** `server/bots/runner.mjs` returns early for any other `gameType` (`:98`, `:152`,
  `:194`). Styles declare `supportedGames: ['teen-patti']`, and the engine refuses a bot in a game its
  style does not support (`server/engine.mjs:734`).
- **Information boundary already exists.** A bot decides from `projection(room, botId)`, its own seat
  view with hidden cards masked. Its mind is built only from `observe(prevView, nextView)`
  (`server/bots/observe.mjs`, `obs@1`), so it can hold nothing it did not see. Tests swap unseen
  cards and require identical minds and decisions (`tests/server/bot-mind.test.mjs`,
  `tests/server/bot-phase4.test.mjs` on `phase4`).
- **The policy is a named-node graph** (`server/bots/character-v3.mjs`): perceive → recall → assess
  (base brain) → personalize (DNA traits) → state (mood) → social (relationships) → beliefs
  (opponent models) → quirks → **bound** → choose (softmax) → explain.
- **"Strong evidence constrains personality; ambiguity gives it room" is already the bound node:**
  personality, mood, social and quirk pushes are capped per group, then scaled by
  `λ = 1 / (1 + (clarity / reach)²)`, where clarity is how clearly the base brain separates the best
  move from the next. Disciplined characters have a smaller reach. Opponent reads are capped but not
  shrunk by clarity, since they are evidence about a move's value.
- **Character = data.** DNA (19 traits in [0, 1]), quirks and tempo per style
  (`server/bots/dna-styles.mjs`, `docs/bots/CANONICAL.md`); published styles are immutable versions.
- **Mind** (`server/bots/mind.mjs`): mood (5 dimensions with night form and decay), relationships
  (rivalry, annoyance, respect, fear), opponent models (counts with decay and confidence), and session
  self. Session scope only; no per-person learning across sessions (approved principle).
- **Simulation** (`server/sim/*`, `scripts/sim/*`): deterministic seeded tables on the real engine,
  matched (duplicate) play, a worker pool, fingerprints, judges, target bands, identifiability, and a
  Phase 4 exploit and adaptation harness (`phase4` branch). All Teen Patti specific today.

### 1.3 Reusable as is, reusable with work, new

| Part | Status for trick games |
|---|---|
| Decision graph, bound node, softmax choice, explanations | **reuse**: the graph is game-agnostic; nodes get game-specific rules (the pattern tp-dna@4 already uses) |
| DNA traits, quirk framework, style versions, publish path | **reuse**; add a per-game translation (§5) |
| Mood, relationships, night form, decay | **reuse** unchanged (appraisal events per game) |
| Opponent model (counts + confidence + decay) | **reuse the mechanism**; new features per game (§6) |
| Projection boundary, obs stream, swap tests | **reuse the pattern**; each game gets its own projection, `BotObservation` and `obs` events |
| Seeds, matched play, worker pool, CI helpers, league and exploit harness | **reuse**; new table runners per game |
| Base brain (`brain.mjs`: strength, pot odds) | **new per game**: the Game Brains |
| Fingerprints, judges, target bands | **new per game** |

---

## 2. Rules (research; pinned versions need your approval)

Sources: [pagat.com: 3-2-5](https://pagat.com/whist/3-2-5.html), [gamerules.com: Teen Do Paanch](https://gamerules.com/rules/teen-do-paanch/), [catsatcards: 3-2-5](https://catsatcards.com/Games/ThreeTwoFive.html), [pagat.com: Twenty-Nine](https://www.pagat.com/jass/29.html), [pagat.com: Dehla Pakad](https://www.pagat.com/pointtrk/dehlapakad.html), [gamerules.com: Dehla Pakad](https://gamerules.com/rules/dehla-pakad-card-game/), [gambiter: Mendikot](https://gambiter.com/cards/point-trick/mendikot.html).

### 2.1 3 2 5 (Teen Do Paanch): 3 players, no partners

- **Deck:** 30 cards. Sources agree on 8 to A in all four suits (24) plus 6 more, but **disagree on
  which 7s**: one says 7♥ 7♠, another 7♥ 7♦. **Decision R1.**
- **Deal:** packets of 5, 3, 2. The player whose target is 5 sees their first 5 cards and **chooses
  trump**; if they decline, the suit of the highest of their next 3 cards is trump.
- **Targets by seat:** first player 5, second 3, dealer 2 (a total of 10 = all tricks). Targets rotate
  with the deal.
- **Play:** must follow suit; otherwise trump or discard. Highest trump, else highest of the led suit.
- **Score:** each player's tricks minus their target.
- **Pulling (carry-over):** next deal, a player who made more than their target takes one card per
  extra trick from a player who fell short, giving back one of their own. Sources differ on **random
  versus chosen** card. **Decision R2.**
- **7s as top trumps** in some versions. **Decision R3** (recommended: off, plain 7s).

### 2.2 10 Pakad (Dehla Pakad): 4 players, fixed partnerships

- **Deck:** 52 cards, A high to 2.
- **Deal:** 5 each, trump is chosen, then the rest in fours (13 each).
- **Play:** follow suit; highest trump, else highest of the led suit.
- **Distinctive rule (pagat):** a trick's cards are **gathered only when one player wins two
  consecutive tricks**; otherwise they stay in the centre and accumulate. Two consecutive tricks
  won by different partners do not collect.
- **Goal:** capture tens. A majority of tens wins the hand; all four is a **Kot**; some versions add
  a Kot for seven consecutive hands won.
- **Big variation across sources:** how trump is chosen (several methods exist in the Mendikot family),
  tie-breaks when tens are split 2-2, whether play stops early, Kot scoring. **Decision R4** is the
  whole ruleset: we should pin one written version before any engine work, as your brief says.

### 2.3 29: 4 players, fixed partnerships (best documented)

- **Deck:** 32 cards (7 to A). Rank in every suit: J, 9, A, 10, K, Q, 8, 7. **Points:** J 3, 9 2, A 1,
  10 1 (28 in all). **Variant:** +1 for the last trick (29). **Decision R5.**
- **Deal and bid:** 4 cards each; bids 15 to 28 (16 minimum in some versions), each higher than the
  last, until three passes; dealer forced to 15 if all pass. The bidder **secretly** chooses trump
  (face-down indicator), then 4 more cards each.
- **Hidden trump:** play without a known trump until someone cannot follow suit and **asks for trump
  to be revealed**. From that trick on, trumps win. (Variants: optional asking, "seventh card"
  trump.) **Decision R6.**
- **Pair (K+Q of trump):** declared after the pair's side wins a trick once trump is revealed; moves
  the bidder's requirement by 4 (down for the bidding side, up for the defenders), bounded 15 to 28.
- **Score:** the bidding side gains a game point if it reaches its bid, otherwise loses one; play to
  +6 / -6 (the red and black six markers).
- **Optional extras:** double / redouble, single hand, auto-double at 21+. **Decision R7**
  (recommended for v1: none; add later).

---

## 3. Shared trick-taking infrastructure

One small core (`server/tricks/core.mjs`), used by all three engines and their bots:

- **Cards and decks** per game (30, 52, 32 cards), rank order and point values as data.
- **Legal plays:** follow suit if able; game hooks for "must trump" variants.
- **Trick resolution:** led suit, trump (known or hidden), winner.
- **Hidden-state model:** trump known / hidden-to-me / hidden-to-all; per-seat visibility of each card.
- **Seats and turn order** (clockwise default, configurable for 29 regional rules).
- **Determinism:** pure `transition(snapshot, id, action, payload, ctx)`, seeded decks from `ctx`,
  no clock or randomness inside, exactly like the existing engines; replay versions per game.

Each engine (`threeTwoFive.mjs`, `tenPakad.mjs`, `twentyNine.mjs`) adds its own phases (deal packets,
trump choice, bidding, pulling, scoring) on the core.

---

## 4. The bot boundary: `BotObservation`

Cheating must be structurally hard, not a convention.

- **One builder per game:** `botObservation(room, seatId)` returns a frozen, plain object that
  contains only: own hand; public bids and passes; completed tricks and the current trick; the
  centre pile (10 Pakad); scores and targets; trump **if revealed to this seat** (in 29, the bidder
  knows their own trump; the others do not until it is revealed); turn and legal moves; public
  history.
- **Built from the projection, not the room:** the builder takes `projection(room, seatId)` (already
  the masked seat view), never the server room. A bot module **cannot import the engine or the room
  type**: a lint rule and a test forbid imports from `server/tricks/*Engine*` into `server/bots/*`.
- **Swap-invariance tests per game**, as Teen Patti has: re-deal so that every card this seat
  cannot see is permuted, and require identical observations, minds and decisions. For 29, also swap
  the hidden trump indicator for non-bidders before the reveal.
- **No cross-bot state:** each bot's mind is stored per seat and only ever folded from its own
  observations (existing `updateMinds` pattern).

---

## 5. Character across games

### 5.1 Game Brain interface

```
GameBrain = {
  id: 'tt5@1' | 'pakad@1' | 'g29@1',
  perceive(observation)         -> situation (derived facts: target pressure, trick power,
                                   cards out per suit, partner signals, contract margin…)
  candidates(situation)         -> legal moves (plays, bids, trump choices, pulls)
  baseFactors(situation, cands) -> named utilities a competent, personality-free player assigns
  evidence(situation, cands)    -> how clear the choice is (feeds the bound node)
}
```

The base brain alone must play well, with no personality (a review gate, §7).

### 5.2 Character Personality interface: semantic translation

The same 19 DNA traits; each game maps a trait to the decisions where it belongs. **Not identical
numbers everywhere: the same meaning, expressed through each game's decisions.**

| Trait | Teen Patti (today) | 3 2 5 | 10 Pakad | 29 |
|---|---|---|---|---|
| riskTolerance / aggression | raise borderline hands | contest uncertain tricks; chase the target when behind | go for tens early; take on the centre pile | wider bidding range; accept marginal contracts |
| patience / discipline | release weak hands | hold trump for late tricks; duck when ahead of target | wait to win the second consecutive trick | bid only on evidence; keep control of trumps |
| bluffAffinity | bluff-raise | lead to make opponents spend trump | false leads to draw tens | bid a little over the hand; shape the trump ask |
| curiosity | call to see | follow the suit to learn the distribution | test suits early | ask for trump early |
| blindPreference | play blind | (no analogue: unused) | (unused) | delay trump reveal |
| adaptability | learn opponents | learn who hoards trump | learn partner support | learn partner and opponent bidding |

Personality acts only through the bound node: when the brain's evidence is clear (one card is
clearly right), traits barely move the choice; when moves are close, they decide.

### 5.3 Adaptation interface

Session opponent models (the existing count + confidence + decay mechanism) with new features per
game, all from observations only:

- **3 2 5:** trump-early vs trump-late, leads from strength or weakness, how hard they chase their
  target, ducking when ahead.
- **10 Pakad:** ten-protection (keeps tens back or throws them on a partner's trick), centre-pile
  aggression, partner support.
- **29:** bid level vs points later shown (calibration), trump-ask timing, partner signalling, pair
  declarations.

Adaptation changes specific responses to specific observed tendencies (it must not simply drift
toward aggression); validated as in Teen Patti Phase 4: adaptive vs non-adaptive, matched, against
opponents with known tendencies, with a no-reads control.

### 5.4 Memory scopes

| Scope | Holds | Lifetime |
|---|---|---|
| Round | bids, trump state, current trick, centre pile | one deal |
| Game | cards seen, voids inferred, score | one game |
| Session opponent model | tendencies per player at this table | the table session |
| Character | DNA, quirks, tempo | permanent, versioned |

No permanent learning about real people without a separate product review (as today).

---

## 6. Game Brain sketches (strategy the base brains must handle)

- **3 2 5:** target pressure (tricks needed vs tricks left), trick power of each card given cards
  seen, trump preservation vs forcing others to spend trump, ducking when ahead of target, the pull
  value of over-achieving, and pulling choices (which card to give back).
- **10 Pakad:** trick value is the tens in the centre pile, not the trick count; the two-in-a-row
  collection rule (a second consecutive win matters more than the first); protecting partner's tens;
  sacrifice to break an opponent's run.
- **29:** hand evaluation (points held, trump length, jacks and nines), contract probability per bid
  level, trump choice, the decision to ask for the trump reveal, point-card play (counting 28),
  partner inference (leads, voids, bids), pair timing. Bidding = evaluation + contract probability +
  context + a bounded character adjustment, never a random bid.

---

## 7. Simulation and validation (per game, before any human table)

Reuse the Teen Patti harness pattern: deterministic seeded deals, matched play, worker pool.

- **Players:** baseline brain, each character, adaptive vs non-adaptive, mixed seats, rotated seats
  and partners.
- **Metrics:** illegal-move rate (must be 0), target / contract success, bid calibration, trump
  efficiency, point efficiency, decision quality against a strong reference (e.g. a perfect-information
  oracle **for evaluation only**, never available to bots), seat advantage, partner effects,
  variance, character identifiability, adaptation impact.
- **Gates per game:** baseline competent; characters distinguishable but not much weaker than
  baseline; adaptation helps against matching tendencies; swap-invariance and replay tests pass.
- **Cross-game audit (your Phase 5):** each character's identity measured in every game by blind
  classification from public play.

---

## 8. Plan by phase (as your brief, with what each gate checks)

1. **Phase 1 (this document):** audit, rules, interfaces. Stop for review.
2. **3 2 5:** engine + tests → baseline brain + sim → characters + sim → adaptation + sim → table UI
   and bots → human vs bot testing. Stop.
3. **10 Pakad:** same, on the proven core. Stop.
4. **29:** same, with bidding, hidden trump, partner reasoning. Stop.
5. **Cross-game character audit.** Stop.
6. **Production integration and polish.**

Effort guide: 3 2 5 is the smallest (3 players, no partners, no bidding); 29 is the largest (bidding,
hidden trump, partnership inference). Each phase ends with a report like the Teen Patti bot reports.

---

## 9. Decisions needed before Phase 2

- **R1** 3 2 5 deck: which two 7s (7♥ 7♠ or 7♥ 7♦)?
- **R2** 3 2 5 pulling: random card or chosen card? And how many pulls are allowed?
- **R3** 3 2 5: are any 7s top trumps? (recommended: no)
- **R4** 10 Pakad: the exact ruleset you play: trump selection method, the two-consecutive-tricks
  collection rule, the 2-2 tens tie-break, when play ends, and Kot scoring. A written house rule
  from your group is the best source.
- **R5** 29: last-trick point (28 or 29)?
- **R6** 29: trump asking (mandatory when unable to follow, or optional), and the minimum bid (15 or 16).
- **R7** 29 extras for v1: none (recommended), or double / redouble / single hand.
- **Q1** Which game first: 3 2 5 (recommended, simplest) or another?
- **Q2** Seat count: 3 2 5 is strictly 3 players and 10 Pakad and 29 strictly 4: should bots fill
  empty seats automatically so a game can start with fewer people?
