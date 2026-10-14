# Phase 7: Teen Patti variants

Each variant has an independent server module in `server/variants/` and an independent rule test file in `tests/server/`. Shared hand helpers live in `hand-utils.mjs`; the room engine continues to own dealing, chips, turns, card privacy, networking and settlement. The existing UI uses one variant catalog for create-room options, next-hand settings and player-facing rule labels.

Classic remains the default and its original evaluator is unchanged. The 2 Card and 4 Card variants declare their hand size; the engine now deals that count, tracks active players by that count and keeps the same six-seat, betting and private-projection behavior. Joker's indicator is stored as public per-hand rule state and removed from the undealt deck after dealing.

## Implemented variants and chosen rules

Variant house rules differ, especially for 999, Joker and two-card play. These versioned defaults are intentionally explicit so every room resolves the same way. Changing one later requires a new rules version.

| Variant      | Rules in this implementation                                                                   | Server module        | Rule tests                             |
| ------------ | ---------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------- |
| Classic      | Existing three-card ranking and comparison                                                     | `classic.mjs`        | `engine.test.mjs`, `variants.test.mjs` |
| Muflis       | Exact inverse of Classic ranking                                                               | `muflis.mjs`         | `muflis.test.mjs`                      |
| AK47         | A, K, 4 and 7 are wild; best valid Classic hand wins                                           | `ak47.mjs`           | `ak47.test.mjs`                        |
| Joker        | After the deal, reveal the next undealt card; all dealt cards of that rank are wild            | `joker.mjs`          | `joker.test.mjs`                       |
| Lowest Joker | Every card of the lowest rank in a player's hand is wild; equal-low cards all become wild      | `lowest-joker.mjs`   | `lowest-joker.test.mjs`                |
| 999          | A=1, 2–9 face value, 10/J/Q/K=0; sort digits descending and the largest three-digit value wins | `nine-nine-nine.mjs` | `nine-nine-nine.test.mjs`              |
| 2 Card       | Deal two; a pair beats high card, then compare rank vectors high to low                        | `two-card.mjs`       | `two-card.test.mjs`                    |
| 4 Card       | Deal four; compare the best of the four possible three-card Classic hands                      | `four-card.mjs`      | `four-card.test.mjs`                   |

Equal best hands do not use suit tiebreaks. Existing Show behavior remains shared: an equal Show hand loses for the requester. No variant accepts client-calculated results.

## Rule references and house-rule limits

- AK47 descriptions commonly make A, K, 4 and 7 wild: [Teen Patti Craze](https://www.teenpaticraze.in/ak47teenpatti), [6patti](https://6patti.com/learn-teen-patti/variations.html).
- The indicator-rank Joker and Lowest Joker patterns are described by [Octro's Teen Patti variants guide](https://www.octroteenpatti.com/learn-teen-patti/variations.html). Octro's Joker rule draws a card after player cards and makes the matching rank wild; its Lowest Joker rule marks each player's lowest card wild.
- [Octro's 999 rules](https://www.octroteenpatti.com/learn-teen-patti/variations.html) specify A=1, 10/J/Q/K=0 and aim for 999. This implementation treats the hand as a high-to-low digit string; some tables instead compare totals or distances differently.
- Four cards with the best three selected is also called Best-of-Four: [Teen Patti variants](https://en.wikipedia.org/wiki/Teen_patti#Variations).
- There is no single common 2 Card ranking in the guides reviewed. Pair-over-high-card is the product's explicit house rule for this version.

These are community rules and game-guide references, not a universal governing ruleset. The two-card and 999 conventions should be visible to players before a hand starts.

## Safety and compatibility

- Hand evaluators validate card counts, ranks, suits and physical duplicates. Wild substitutions cannot duplicate natural cards or each other.
- Joker indicator selection runs on the server after the deal. The indicator rank is shared publicly, while all player card projections remain private.
- 2 Card and 4 Card keep the 52-card deck and enforce the same six-player limit; six four-card hands use 24 cards.
- Room tests cover 2–6 players, shared chip/turn/seat behavior, server-authoritative Show outcomes, six-client privacy, durable restart and switching from 2 Card to Classic between hands.
- No dependency was added. No room, LiveKit, betting, lobby or table redesign was required.

## Verification

Run `npm test`, `npm run check`, `npm run lint` and `npm run build` from the repository root. The isolated variant tests can also be run individually with `node --test tests/server/<variant>.test.mjs`.
