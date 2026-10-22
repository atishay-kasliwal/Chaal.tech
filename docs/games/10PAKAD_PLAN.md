# 10 Pakad (Dehla Pakad): plan

Status: **planning only, not implemented. Ruleset locked 2026-10-22** (the owner answered all six
questions in §15). Written 2026-10-22, after 3 2 5 Phase 2 was approved and its rules locked
([325_RULE_LOCK.md](325_RULE_LOCK.md)). Nothing here is built; implementation starts only after this
plan is reviewed.

Sources: [pagat.com: Dehla Pakad](https://www.pagat.com/pointtrk/dehlapakad.html),
[gamerules.com: Dehla Pakad](https://gamerules.com/rules/dehla-pakad-card-game/), and the earlier
survey in [TRICK_GAMES_PHASE1.md](TRICK_GAMES_PHASE1.md) §2.2.

## 1. Canonical Chaal ruleset (locked 2026-10-22)

Rules marked **(sources agree)** are taken directly from the sources. Rules marked **(owner)** were
decided by the owner where the sources differ or are silent (§15).

| Topic          | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Players        | Exactly 4, in two fixed partnerships; partners sit opposite. **(sources agree)**                                                                                                                                                                                                                                                                                                                                                                                    |
| Deck           | 52 cards, A high to 2 low in every suit. **(sources agree)**                                                                                                                                                                                                                                                                                                                                                                                                        |
| Deal           | The dealer deals 5 cards to each player. Trump is set by play (below); after the trick in which it is set, the rest is dealt in batches of 4: 13 each. **(sources agree)**                                                                                                                                                                                                                                                                                          |
| Direction      | Deal and play go anticlockwise (to the dealer's right), as pagat. On screen: the next player is the one to your right. **(pagat; gamerules does not say)**                                                                                                                                                                                                                                                                                                          |
| First dealer   | Random (secure shuffle draw). **(pagat)**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Trump          | Method 1: play starts on the first 5 cards with no trump. The first player who cannot follow suit sets trump with the card they play; it counts as trump in that same trick (a later player who also cannot follow may beat it with a higher trump). The rest of the deal follows that trick. If all five tricks are followed, a card drawn at random from those tricks sets trump. The player to the dealer's right leads first. **(pagat; owner chose method 1)** |
| Tricks         | Follow suit if you can; otherwise any card. Highest trump wins, else the highest card of the suit led. The winner leads next. **(sources agree)**                                                                                                                                                                                                                                                                                                                   |
| Collecting     | A trick's cards go to the centre pile. When the **same player** wins **two tricks in a row**, they collect the whole centre pile for their team. Two in a row by partners does not collect. After a collection the count restarts: a third win in a row does not collect unless that player also wins the next one. **(sources agree)**                                                                                                                             |
| Last trick     | The winner of the 13th trick collects everything left in the centre. **(sources agree)**                                                                                                                                                                                                                                                                                                                                                                            |
| Objective      | Capture tens.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Hand result    | All four tens: that team wins a **Kot**. Non-dealing team with 2 or 3 tens: it wins the hand. Dealing team with 3 tens: it wins the hand. **(sources agree)** A 2-2 split: **the non-dealing team wins the hand (owner)**.                                                                                                                                                                                                                                          |
| Next dealer    | Non-dealing team wins the hand: the same dealer deals again. Dealing team wins: the deal passes to the right. Non-dealing team wins a Kot: the deal passes to the dealer's partner. **(pagat)**                                                                                                                                                                                                                                                                     |
| Seven in a row | A team that wins 7 hands in a row also scores a Kot; a Kot from four tens resets the run to zero. **(pagat; owner)**                                                                                                                                                                                                                                                                                                                                                |
| Early stop     | None: every hand is played to the 13th trick. **(owner)**                                                                                                                                                                                                                                                                                                                                                                                                           |
| Match end      | Open-ended like 3 2 5: Kots and hands won are shown throughout. **(owner)**                                                                                                                                                                                                                                                                                                                                                                                         |

### Known variants (not used in V1)

- **Trump method 2** (both sources): the player to the dealer's right picks trump from their first 5
  cards before the rest are dealt. Not used: the owner chose method 1. (Pagat's worry about method 1,
  honesty about following suit, does not apply online: the server enforces following suit.)
- **Game end** by fixed time, fixed number of hands, or a Kot target.
- **"First seven tricks" bonus** (gamerules mentions it without rules): not used.
- **Related family**: Mendikot (different trump and scoring rules) and Court Piece / Rung (no
  collecting rule). Out of scope.

## 2. Round and game lifecycle

`lobby` (4 seats, bots fill empty seats; the host starts) → `deal5` → `open` (tricks on 5 cards with
no trump, until a player cannot follow suit and sets trump, or 5 tricks pass and a random played card
sets it) → `deal8` (after that trick) → `play` (the remaining tricks, 13 in all) → `handOver` (tens per team, result, Kot, next dealer)
→ `deal5` … until the table ends. Each phase transition is a pure `transition`, as in 3 2 5.
Leaving and disconnects follow 3 2 5's locked rules 5 and 6: a person leaving mid-hand ends that hand
unscored, and a disconnected person's timed-out turn gets a simple automatic move (lowest legal card).

## 3. Legal actions

| Phase      | Actor         | Action        | Validation                                                                |
| ---------- | ------------- | ------------- | ------------------------------------------------------------------------- |
| lobby      | host          | `start`       | 4 seats filled (people + bots)                                            |
| open, play | player to act | `play {card}` | card in hand; follows suit if able; in `open`, a card off suit sets trump |
| any        | anyone        | `leave`       | as 3 2 5                                                                  |

Errors are `GameError`s with the player-facing reason (PR #23 pattern).

## 4. Server state

```
{ gameType: 'ten-pakad', rulesVersion: 'pakad-1',
  players: [{ id, seat, team: 0|1, hand: Card[], bot? }],
  dealer, phase, trump: suit|null, trumpSetBy: { seat, trick } | { drawn: card } | null,
  trick: { leader, cards: [{ seat, card }] }, tricksPlayed,
  centre: Card[],               // face down, uncollected
  streak: { seat, wins },       // consecutive tricks by the same player since the last collection
  captured: [Card[], Card[]],   // by team
  hands: [{ dealer, tens: [n, n], result, kot }],   // history for scoring and replay
  kots: [n, n], handsWon: [n, n], run: { team, hands }, deck, deckSeal }
```

The `invariant` checks that all 52 cards are conserved across hands, the centre pile and the
captured piles, and that the turn order is legal.

## 5. Client projection (per seat)

- Your own hand; everyone's card counts.
- The current trick and the last completed trick, face up (everyone saw them played).
- The centre pile: **its card count and the tens in it**, but not every card (owner decision). Physically the pile
  is face down, but its cards were all seen, so a player with perfect memory knows them; the count and
  the tens are what matters, shown to everyone equally.
- Captured piles: count and tens per team.
- Trump once chosen; the dealer, the chooser, whose turn, the streak holder (whose next win
  collects), Kots, hands won and the seven-in-a-row run.

## 6. Bot projection (observation)

As in 3 2 5: `botObservation(projection(room, seat))`, frozen, built only from the seat projection.
Bot modules cannot import the engine. The bot's own memory adds only what that seat saw played (each
trick as it happened), which a person could also remember. Tests swap every card the seat cannot see
(other hands, and the undealt cards during the opening tricks) and require identical decisions.

## 7. Game Brain (`pakad@1`)

Game-specific strategy; nothing is copied from Teen Patti or 3 2 5 except the shared trick core.

- **Perceive:** the tens still out and where they could be (void inference from failures to follow),
  centre value (tens in the pile), the streak holder, partner position in the trick, trump count, and
  likely winners of the current trick.
- **Candidates:** the legal cards. In the opening tricks, a player who cannot follow suit chooses
  trump by choosing which card to play, so that choice is also a trump choice.
- **Base factors:** win the trick when the next trick can also be won (a collection); give a ten to
  the partner when the partner will win two in a row; hold a ten when the opponents hold the streak;
  break an opponent's streak; when the centre is rich, keep a trump to take the 13th trick; when void in the opening tricks,
  set trump in the suit where this seat is longest and strongest (on 5 known cards, with 8 unseen to
  come), or discard low to keep trump open; in the opening tricks, value voids, which is new to Chaal
  bots.
- **Evidence:** Monte Carlo over hidden hands consistent with the observation (as 3 2 5's win
  probability), cut to a fixed sample count for the performance budget.
- **Gate:** the base brain alone must beat random play and a greedy "win every trick" player by a
  clear margin before personality is added.

## 8. Personality mapping (identity transfers; strategy does not)

Same 19 DNA traits and the same bound/clarity node: traits only decide between moves the brain rates
as close.

| Character | Identity           | In 10 Pakad                                                                                                                          |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Rohit     | blind pride, bold  | backs his own streak: plays for the second consecutive trick even when risky; sets trump at the first chance, even from a short suit |
| Virat     | aggression, fire   | contests every rich centre pile, spends trumps early to break streaks; gets fiercer after losing a Kot                               |
| GG        | tight, disciplined | holds trumps for the 13th trick and for collections; gives tens to the partner only when it is safe                                  |
| Samay     | curious caller     | follows suits to learn the distribution, slow to commit his tens, reads partner signals                                              |
| Dhoni     | calm, adaptive     | starts balanced, learns which opponent hoards tens or trumps tonight and adjusts                                                     |

Adaptation (session only, from observations): who protects tens, who breaks streaks, partner
support, trump-early vs trump-late. Weak 3 2 5 adaptation is a known limit to watch here too.

## 9. Bot seat filling

The host can start with 1 to 4 people; Chaal characters fill the remaining seats (one seat per
character, as 3 2 5). A single person always gets a bot partner. Bots act only while a person is
connected (as every game). Partnerships are by seat: seats 1 and 3, seats 2 and 4.

## 10. Simulation

- A table simulator on the shared trick core: seeded deals, matched seating (the same deals with
  partnerships rotated), and every bot decision through the engine.
- Measurements: tens per hand, Kot rate, collections per hand, streak breaks, 13th-trick captures,
  bad actions (a ten given to the opponents when it could have been kept), decision time.
- Evaluation as 3 2 5: competence against random and greedy players, character identification by
  fingerprint, adaptation against fixed styles (ten-hoarders, streak-breakers).

## 11. Tests required

Engine: deal 5 + 8 = 13; no trump until the first player who cannot follow suit sets it (in that trick); the random fallback after five followed tricks (seeded, sealed, replayable); deal of the remaining 8 after that trick; follow suit; trick winner (trump and led suit);
collection on two in a row by the same player only; partners do not collect; streak reset after a
collection; the 13th trick collects the rest; tens counted correctly; every hand result in §1
including 2-2; next dealer in each case; Kot from four tens; Kot from seven in a row and the reset;
cards conserved (invariant on every transition); leave/disconnect rules; rule errors are
GameErrors. Bots: always legal; hidden-card swap invariance; one seat per character; deterministic
with a seed; performance budget. Worker: four seats, a fifth refused, private hands, public trump,
reconnect. Replay: a recorded hand in the corpus replays exactly. UI: Playwright on desktop and
phone.

## 12. Code layout

`server/tricks/ten-pakad.mjs` (engine on `server/tricks/cards.mjs`),
`server/bots/tricks/bot-pakad.mjs` and `observation-pakad.mjs`, `src/lib/tricks/TenPakadTable.svelte`,
a `trickAction` extension in the room server, a `GAME_VERSIONS` entry, a `/games` guide and a
create-room option. 3 2 5 code is reused, not changed.

## 13. Not in scope

29 (after 10 Pakad is implemented and reviewed), cross-game character evaluation, Phase 5 long-term
memory, and any neural or RL policy.

## 14. Risks

- The collection rule makes tricks unequal in value; a brain that only counts tricks will play badly.
  The base brain must value the centre pile and the streak.
- Partner play is new for Chaal bots: a bot must never "help" its partner with information a person
  in the seat would not have.

## 15. Owner decisions (answered 2026-10-22)

| #   | Question             | Decision                                                                                                                                                                  |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Trump method         | **Method 1:** the first player who cannot follow suit sets trump (pagat's details: it counts in that trick; a random played card if all five opening tricks are followed) |
| 2   | 2-2 split of tens    | **The non-dealing team wins the hand** (same dealer deals again)                                                                                                          |
| 3   | Early stop           | **None:** always play all 13 tricks                                                                                                                                       |
| 4   | Seven hands in a row | **As pagat:** a Kot; a Kot from four tens resets the run                                                                                                                  |
| 5   | Match end            | **Open-ended**, Kots and hands won shown throughout                                                                                                                       |
| 6   | Centre pile display  | **Card count and the tens in it**, shown to everyone                                                                                                                      |

No rule question remains open. Next step: review this plan, then implement (not started).
