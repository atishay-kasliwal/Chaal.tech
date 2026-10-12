# S3: Teen Patti rules review

Reviewed DECISIONS.md section B for internal consistency, missing cases and edge cases. Cross-checked against the C++ LanGameplayEngine (reference only; no license, no code copied). That repo's comparator matches our tie rule (the player who requested Show or Side Show loses a tie) and accepts both A-2-3 and Q-K-A as sequences; I did not verify its ordering of those two.

Items marked **OWNER** need a decision. Everything else is a proposed default.

## Findings

| # | Finding | Proposed resolution |
|---|---|---|
| F1 | **Short-stack Show is under-specified and contradicts "no side pots".** If a short player calls Show with fewer chips than the opponent has contributed, the winner must not win more than they matched. | Two players remain. Let X be the short player with total contribution cx and Y the other with cy > cx. Main pot = dead money (packed players) + cx + cx. The excess (cy - cx) returns to Y before comparison. Winner takes the main pot. This is a one-case side pot only for Show. **OWNER** to confirm |
| F2 | **Side-show payment and turn flow undefined.** Who pays, and does the requester's turn end? | Requester pays their normal chaal cost (2S) when requesting; that payment is their action for the turn. Accept or reject, the turn then passes. A pending side show blocks other actions |
| F3 | **What do the two players see in a side show?** "Compares privately" does not say whether both players see each other's cards. In the physical game they do | **OWNER:** (a) both see each other's cards, or (b) server compares and tells only the result. Default (b) because it leaks less; (a) is closer to the real game |
| F4 | **"Previous active player" is ambiguous** when the previous seat has packed | Previous active = nearest still-active seat counter-clockwise from the requester. Must also be seen |
| F5 | **Seeing cards on your own turn**: does the cost change immediately? | Yes. Becoming seen takes effect at once, including for the current turn's cost |
| F6 | **Players with fewer chips than the boot** | Not dealt in; moved to sit-out until they can afford it |
| F7 | **Raise limits and cap interplay.** Raise only allowed if 2S <= maxStake. A seen raise may cost up to 4 x (maxStake/2) | State legal-action rule: server returns raise only if the new stake <= maxStake and the player can afford the cost; otherwise chaal only |
| F8 | **Tie handling differs across paths**: Show and side show tie goes against the requester; pot-limit forced reveal ties split | Intentional. Document in the engine and test it |
| F9 | **End-of-hand reveal** | **OWNER DECIDED: voluntary.** Server always settles; each player chooses whether to show cards after the hand (default hidden). History shows cards after the hand per DECISIONS section H only for cards players chose to show, plus the audit record |
| F10 | **Fewer than 3 players** after a start: 2 can finish the hand; with 2 seated and ready, hands do not start | Matches DECISIONS. Add UI copy "Need 3 players to start" |
| F11 | **Timeout on a pending side-show target** | Auto-reject after 15 s; the side-show timer is separate from the 30 s turn timer |
| F12 | **Blind players and Show**: blind may not Show against seen (toggle default on). If both remaining are blind, either may Show | Test both |
| F13 | **Boot with sit-outs and dealer rotation**: first action is left of dealer among dealt-in players | Dealer advances to the next dealt-in seat |
| F14 | **Ranking details to lock** | Trail AAA > ... > 222. Pure sequence and sequence order: A-K-Q, A-2-3, K-Q-J ... 4-3-2. Color: compare highest card, then second, then third. Pair: pair rank, then the odd card. Suits never break ties |

## Test case list (written before the engine; each is a named test)

**Ranking and compare**
1. Pattern classification for every pattern class, including A-2-3 and A-K-Q as sequences and K-A-2 not a sequence.
2. A-K-Q > A-2-3 > K-Q-J > ... > 4-3-2, for both pure sequence and sequence.
3. Trail: AAA beats KKK ... beats 222.
4. Color compares high card, then second, then third.
5. Pair compares pair rank, then kicker. Same pair rank, different kickers.
6. Equal ranks with different suits tie.

**Stake and bets**
7. Blind chaal costs S; seen chaal costs 2S.
8. Blind raise costs 2S and sets S = 2S; seen raise costs 4S and sets S = 2S.
9. Raise unavailable when the new stake would exceed maxStake (16 x boot).
10. Becoming seen changes the cost immediately.
11. Raise offered only if affordable; otherwise chaal only.

**Pack, show, side show**
12. Pack forfeits contributions; last player standing wins the pot with no reveal.
13. Show only available with exactly 2 players.
14. Blind may not Show against seen; both blind may Show.
15. Show tie: requester loses.
16. Side show: only seen to previous active seen player, only with 3+ players.
17. Side show accept: lower hand packs; tie: requester packs.
18. Side show reject, and timeout after 15 s treated as reject.
19. Requester pays chaal on request; turn passes after resolution.
20. Side show cannot target a blind player or a packed seat.

**Limits and money**
21. Pot limit (100 x boot) forces all remaining to reveal; best hand wins; ties split.
22. Odd chips in a split go to the first winner left of the dealer.
23. Short stack with 3+ remaining must pack.
24. Short stack Show with 2 remaining: excess returns to the opponent (F1).
25. Players below the boot are not dealt in.
26. Chip conservation over thousands of seeded hands (property test).
27. Every settlement posts ledger rows that reconcile to the pot (BOOT, BET, POT_WIN).
28. Duplicate action ID is rejected; stale sequence is rejected.

**Timers and flow**
29. Turn timeout auto-packs; two consecutive timeouts sit the player out.
30. Dealer rotates among dealt-in players with sit-outs.
31. Hand needs 3 ready players to start; 2 can finish a hand in progress.

## Owner decisions from this review

- **Decided 2026-10-11:** showing cards at the end of a hand is voluntary (F9).
- **Still open:** F1 (short-stack Show settlement) and F3 (do side-show participants see each other's cards). The F9 decision does not settle them. Working default stays: F1 uses the excess-return rule, F3 is server-only compare with the result told to both players, and a side-show participant may choose to show afterwards.

- F1 short-stack Show settlement (proposed rule above).
- F3 whether side-show participants see each other's cards.
- Confirm the rest against how your group actually plays.
