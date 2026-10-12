# S3: Teen Patti Test Specification

This document outlines the test cases for Teen Patti Classic rules based on DECISIONS.md section B and the S3 rules review. Each test case should be implemented as a unit or property test to verify the game engine's correctness.

## Test Cases

### Ranking and Compare
1. **Pattern classification**: Verify correct identification of all pattern classes (Trail, Pure Sequence, Sequence, Color, Pair, High Card), including A-2-3 and A-K-Q as valid sequences and K-A-2 as invalid.
2. **Sequence ordering**: Confirm A-K-Q > A-2-3 > K-Q-J > ... > 4-3-2 for both Pure Sequence and Sequence.
3. **Trail comparison**: AAA beats KKK ... beats 222.
4. **Color comparison**: Compare highest card, then second, then third.
5. **Pair comparison**: Compare pair rank, then kicker (same pair rank, different kickers).
6. **Equal rank ties**: Equal ranks with different suits tie (suits never break ties).

### Stake and Bets
7. **Chaal costs**: Blind chaal costs S; seen chaal costs 2S.
8. **Raise costs and stake update**: Blind raise costs 2S and sets S = 2S; seen raise costs 4S and sets S = 2S.
9. **Raise limit**: Raise unavailable when new stake would exceed maxStake (16 × boot).
10. **Cost change on seeing**: Becoming seen changes the cost immediately.
11. **Raise affordability**: Raise offered only if affordable; otherwise chaal only.

### Pack, Show, Side Show
12. **Pack forfeits**: Pack forfeits contributions; last player standing wins the pot with no reveal.
13. **Show availability**: Show only available with exactly 2 players.
14. **Show visibility rules**: Blind may not Show against seen; both blind may Show.
15. **Show tie outcome**: Show tie: requester loses.
16. **Side show eligibility**: Only seen to previous active seen player, only with 3+ players.
17. **Side show accept**: Lower hand packs; tie: requester packs.
18. **Side show reject/timeout**: Side show reject, and timeout after 15 s treated as reject.
19. **Side show payment and turn**: Requester pays chaal on request; turn passes after resolution.
20. **Side show restrictions**: Cannot target a blind player or a packed seat.

### Limits and Money
21. **Pot limit**: Pot limit (100 × boot) forces all remaining to reveal; best hand wins; ties split.
22. **Odd chips in split**: Odd chips in a split go to the first winner left of the dealer.
23. **Short stack with 3+**: Short stack with 3+ remaining must pack.
24. **Short stack Show with 2**: Short stack Show with 2 remaining: excess returns to the opponent (see open item F1).
25. **Boot eligibility**: Players below the boot are not dealt in.
26. **Chip conservation**: Chip conservation over thousands of seeded hands (property test).
27. **Settlement reconciliation**: Every settlement posts ledger rows that reconcile to the pot (BOOT, BET, POT_WIN).
28. **Action ID integrity**: Duplicate action ID is rejected; stale sequence is rejected.

### Timers and Flow
29. **Turn timeout**: Turn timeout auto-packs; two consecutive timeouts sit the player out.
30. **Dealer rotation**: Dealer rotates among dealt-in players with sit-outs.
31. **Hand start requirement**: Hand needs 3 ready players to start; 2 can finish a hand in progress.

## Open Items Requiring Owner Decision
The following items from the S3 review remain unresolved and require owner confirmation:

- **F1: Short-stack Show settlement**  
  Proposed resolution: With 2 players, let X be short player with contribution cx and Y with cy > cx. Main pot = dead money + cx + cx. Excess (cy - cx) returns to Y before comparison. Winner takes main pot.  
  (This creates a one-case side pot only for Show.)

- **F3: Side show card visibility**  
  Options:  
  (a) Both players see each other's cards (closer to physical game).  
  (b) Server compares privately and tells only the result to both players (less information leakage).  
  Current working default: (b) server-only compare with result told to both players, and a side-show participant may choose to show cards afterwards.

## Already Decided Items
- **F9: End-of-hand reveal** (Decided 2026-10-11): Showing cards at the end of a hand is voluntary. Server always settles; each player chooses whether to show cards after the hand (default hidden). History shows cards only for players who chose to show, plus the audit record.

## Notes
- All test cases should be implemented as automated tests where possible.
- Items marked with (F#) refer to findings in the S3 review document.
- The test suite should achieve conservation property test over thousands of seeded hands.
- Test cases 26 and 27 are critical for ledger integrity.

---
*This test spec is derived from the S3 review and DECISIONS.md section B. It should be reviewed by the owner to confirm test correctness and resolve open items.*