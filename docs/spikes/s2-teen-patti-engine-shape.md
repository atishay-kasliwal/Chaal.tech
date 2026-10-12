# S2: Teen Patti Engine Shape

## Question
Can poker-engine-ts's rules-as-data express Teen Patti? If not, what do we copy (event log, reducer, replay)?

## Analysis
Poker-engine-ts is designed to be variant-agnostic, with rules defined in a `RuleSetDescriptor`. The descriptor includes:
- `streets`: sequence of betting rounds
- `postingOrder`: order of blinds/antes
- `minRaisePolicy`: how minimum raise is calculated
- `showdownOrdering': hand ranking method
- `cardDistribution`: hole cards per player, burn cards, community cards per street
- `evaluationPolicy`: hand evaluator configuration

### Teen Patti Requirements
1. **Card distribution**: 3 hole cards per player, 0 community cards.
2. **Betting structure**: 
   - Boot (ante) paid by all dealt players.
   - Chaal (call) cost: `S` for blind players, `2S` for seen players.
   - Raise cost: `2S` for blind players (sets `S = 2S`), `4S` for seen players (sets `S = 2S`).
   - Max stake: `S` capped at `maxStake` (default 16 × boot).
   - A raise may only double the stake.
3. **Hand ranking**: Trail (three of a kind) > Pure Sequence > Sequence > Color > Pair > High Card, with specific sequence order (A-K-Q highest, A-2-3 second, no wrap-around).
4. **Game flow**: Single betting round after the deal, followed by showdown.

### Evaluation of poker-engine-ts Capabilities
- **Card distribution**: Configurable via `holeCardsPerPlayer = 3` and `communityReveal = [0]` (assuming one betting street). The engine supports arbitrary numbers of hole cards and community cards per street.
- **Hand ranking**: The engine supports custom hand evaluators via `evaluationPolicy.engine` and `evaluatorId`. We could implement a Teen Patti hand evaluator and plug it in.
- **Betting structure**: This is the main challenge. The engine's betting model is centered around a `minRaisePolicy` (e.g., fixed increment, double-last-bet, pot-limit). Teen Patti's betting is not based on the last bet amount but on the current stake `S`, which changes differently for blind vs seen players and for chaal vs raise. The engine does not appear to have a concept of "state-dependent bet cost" that varies by player status (blind/seen) and action type (chaal/raise) in the manner required.
  - The `postingOrder` can configure blind posts, but the cost of calling or raising is derived from the betting round's `minRaisePolicy` and the last aggressive action.
  - Teen Patti's chaal and raise costs are not simple functions of the last bet; they depend on the player's blind/seen status and the current stake.
  - The engine's legal action derivation likely assumes that the cost to call is the difference between the player's contribution and the current bet, and the cost to raise is at least the minimum raise on top of that. This does not map directly to Teen Patti's chaal/raise rules.

Given the mismatch in betting structure, it is unlikely that poker-engine-ts's rules-as-data alone can express Teen Patti without modifying the engine's core betting logic.

## Decision
**Do not rely solely on poker-engine-ts's rules-as-data for Teen Patti.** Instead, copy the event-sourced architecture (event log, reducer pattern, replay capabilities) and implement a custom Teen Patti reducer that handles:
- Card dealing (3 hole cards per player, no community cards)
- Teen Patti-specific betting logic (boot, chaal, raise with blind/seen distinctions)
- Hand ranking and showdown resolution
- Event logging and state reconstruction

We can reuse useful utilities from poker-engine-ts such as:
- Event sourcing framework (if the core reducer pattern is exposed)
- Card and seat data types
- Hand evaluation logic (if we adapt it) or replace it with our own Teen Patti evaluator
- Session management infrastructure (checkpointing, replay) if it is generic enough

However, given the time constraints and the need for a correct implementation, building a small, focused Teen Patti reducer using the same event-sourced principles (append-only log, pure reducer) may be more straightforward than attempting to force the engine into an ill-fitting mold.

## Next Steps for S2
1. Expose the reducer interface from poker-engine-ts (if possible) to confirm reusability.
2. If the reducer is not easily reusable, implement a Teen Patti-specific reducer following the same event-sourced pattern.
3. Validate that the reducer can:
   - Generate correct initial state after dealing
   - Process chaal, raise, fold, show, side show actions
   - Maintain chip conservation
   - Support replay from event log
   - Provide public and private state views (no hole card leak)

This decision affects the sizing of Phase 6 (Card core) and Phase 7 (Teen Patti Classic), as the engine shape will influence the implementation effort.

---
*This document records the decision for S2. It should be reviewed by the owner to confirm the approach.*