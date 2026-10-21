# 3 2 5: Chaal V1 rules (`three-two-five-1`)

The rules Chaal plays, approved for V1 (2026-10-21). They are product defaults, not a claim about
how every household plays. Regional variations are options for later (listed at the end); the engine
keeps each one behind a rules boundary.

## Players and cards

- **Three players**, no partners. A table needs exactly three seats filled (people or bots).
- **30 cards:** 8, 9, 10, J, Q, K, A of all four suits, plus the **7♥ and 7♠**.
- Ranks within a suit: A (high), K, Q, J, 10, 9, 8, 7. The 7s are ordinary cards (no special power in V1).

## Roles and quotas

- One player deals each round; the deal rotates clockwise every round.
- Clockwise from the dealer: the **first player must win 5 tricks**, the **second 3**, and the
  **dealer 2**. Quotas add up to the 10 tricks in a round. Everyone plays each quota as the deal rotates.

## The deal and trump

1. The dealer gives **5 cards** to each player, starting with the first player.
2. The **first player (quota 5) chooses trump** from any of the four suits, seeing only those 5 cards.
   Trump is then public.
3. The dealer gives **3 more**, then **2 more**: 10 cards each.

## Pulling (from the second round on)

After the deal, players who won **more** tricks than their quota last round **pull** from players
who won **fewer**: one pull per extra trick.

- Pulls are taken in order: the player furthest above quota first; each pull is from the player
  furthest below quota at that moment.
- **The pulled card is unknown to the puller.** The other player's cards are shown face down, in an
  order nobody at the table can know (shuffled per pull from the round's secret deck order), and the
  puller picks one position.
- The puller then **returns one card** of their choice to that player. It may be any card in their
  hand except the one they just pulled.
- Pulling is its own phase. Play starts only when every pull is complete.

## Play

- The **first player (quota 5) leads** the first trick; the winner of each trick leads the next.
- **Follow suit** if you can. If you cannot, play any card (a trump or a discard).
- The **highest trump** wins the trick; if no trump was played, the highest card of the suit led wins.

## End of round and scoring

- After 10 tricks, each player's round score is **tricks won minus quota** (for example 6 tricks as
  the 5-player scores +1; 1 trick as the 2-player scores -1).
- Scores accumulate across rounds. The round result also sets next round's pulls.
- V1 plays for points only, with no chips. The table plays as many rounds as it likes; the host starts each round.

## Seats, bots and connections

- A seat is **empty**, a **person**, a **bot**, or a **disconnected person**. These are different
  states. The host can fill empty seats with Chaal characters before a round.
- A disconnected person keeps their seat. When their turn runs out, a simple automatic move is made
  for them (lowest legal card; trump: their longest suit; pull: the first face-down card, returning
  their lowest card). Bots never take over a person's seat.
- A person leaving during a round ends that round without scores; the table can start a new one.

## Bot information boundary

Bots see exactly what a person in their seat sees: their own cards, trump once chosen, the current
and completed tricks, quotas, tricks won, scores, the number of cards each player holds, and during a
pull the number of face-down cards. They never see another player's cards, the deck order, or the
secret pull order.

## Options for later (not in V1)

- 7♥ / 7♠ as top trumps; other choices of the two 7s.
- The first player declining to choose trump (trump from the next cards dealt).
- Choosing the pulled card face up; returning a card of the same suit.
- Chips per trick; a match target.
