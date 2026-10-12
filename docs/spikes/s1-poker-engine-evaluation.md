# S1: poker-engine-ts evaluation

Repo: Ge-limin/poker-engine-ts, v0.1.3, MIT, one runtime dependency (@noble/hashes). Evaluated at the commit cloned on 2026-10-11.
Method: read the source, installed with `pnpm install --frozen-lockfile --ignore-scripts` in an isolated folder, ran its own suite (**30 files, 192 tests, all pass**). I did **not** yet run our own rule cases against its public API, and did **not** run it inside the Workers runtime. Those are listed under "Still unproven".

## Verdict (updated after running our own cases)

**Not adoptable as-is. Two defects found on the live `SessionManager` path; the pure parts (side pots, odd chip, short all-in reopen logic, conservation) look sound.** Options: (a) vendor a pinned copy and patch the two defects, (b) report upstream and wait, (c) build our own engine reusing its settlement and evaluation ideas. Decide after the two checks listed under "Next".

## Results of our own cases (spikes/s1-poker, engine 0.1.3 from npm, 15 tests: 14 pass, 1 skipped)

| Case | Result |
|---|---|
| 3-handed: blinds left of button, button acts first | Pass |
| Heads-up: button posts small blind and acts first | Pass |
| Raise below minimum rejected | Pass |
| Short all-in does not reopen betting for players who already acted | Pass |
| Full all-in raise reopens betting | Pass |
| 8 seats: blinds and first actor correct | Pass |
| Unequal all-ins (100/300/1000): layered side pots, chips conserved | Pass |
| Chips conserved across folds and calls | Pass |
| Duplicate intent id not applied twice; stale snapshot version rejected | Pass |
| Public table view contains no hole cards (server snapshot does) | Pass |
| **Defect 1: preflop min re-raise** after an open to 30 over a 10 big blind is offered as 60; standard no-limit (and our rule) gives 50 | **Fail** (recorded with `test.fails`) |
| **Defect 2: blind credit.** Heads-up small blind calling the big blind is charged 10 more on top of the 5 posted: contribution 15, pot 25 instead of 20; the big blind is then offered call 10 with no check option | **Fail** (recorded with `test.fails`) |
| Postflop min raise (bet 30, min raise-to 60) | Skipped: cannot reach the flop through normal play because of Defect 2 |

Root-cause notes (read from source, not patched):
- Defect 1: `analyzeTurns` in `round-context.ts` starts `highestContribution` at 0 and blind posts are not in the round's `turns` on the live path (they live in `round.highestBet` and the pot), so an open raise to 30 counts as a raise of 30, not 20.
- Defect 2: the same cause: the call amount is derived from turn contributions only, so blinds posted at session creation are not credited.
- The engine's own 192 tests mostly build snapshots by hand with blinds as turn events, which is why they pass. I used the documented entry point (`SessionManager.create`), so these may affect real use. I have not confirmed whether another start path (for example `advanceHand`) posts blinds differently.

## Next

1. Try the other hand-start path (`advanceHand` / `bootstrapSession` with posted blind turns) to see whether the defects are specific to `SessionManager.create`.
2. If they are, try the one-line fix in a vendored copy (start round contributions from `round.highestBet` and credit posted blinds) and rerun our suite plus the engine's 192 tests.
3. Then decide (a), (b) or (c). Until then Phase 8 stays sized L-to-XL, not L.


## Rule-by-rule (DECISIONS.md section C)

| Our rule | Finding | Evidence |
|---|---|---|
| Fixed blinds, cash-game style | Supported; blind schedule exists but can be a single level | `blindSchedule` in config |
| Heads-up: dealer posts small blind, acts first preflop | **Matches** | `batch-s2-heads-up-session.test.ts` "button seat posts the small blind and acts first preflop" |
| Min raise = last full raise | Likely matches; policy is a rule-data field (`double-last-bet`, `fixed-increment`, `pot-limit`). Naming differs from our wording, so verify the arithmetic with our own case | `ledger-invariants.phase.test.ts` "enforces minimum raise sizing"; `config.ts` |
| Short all-in below a full raise does not reopen betting | **Matches**, including several short all-ins that add up to a full raise (it reopens). Our DECISIONS.md does not say what happens with cumulative short all-ins; this engine reopens when they total a full raise, which is standard | `short-all-in-reopen.test.ts` (8 tests) |
| Side pots from contribution levels | **Matches** | `ledger-invariants` "splits pots when a short stack calls all-in"; settlement property test with unequal stacks |
| Odd chip to first winner left of the button | **Matches** | `settle-pots.ts` `orderWinnersByPosition` starts at button + 1; tests in `batch-u1` and `batch-r1` for three-way ties |
| Chip conservation | **Strong**: property test over randomized settlement | `settlement-conservation.property.test.ts`, `chip-conservation.property.test.ts` |
| No straddle / run-it-twice / rake | Not present or not needed | n/a |
| Seats 2-8 | `maxSeats` is configurable | config |
| Turn timers | Has an action clock and timeout intents with fold/check fallback | `clock/action-clock.ts`, `session-manager.ts` |
| Runs in Workers | No `node:`/fs/crypto imports in non-test source; only @noble/hashes. Looks compatible but is untested in workerd | grep of `src` |
| Deterministic seeded tests | The caller **supplies the deck**; the engine does not shuffle. Good fit: our server does the secure shuffle (Web Crypto) and hands the engine a deck. `Math.random` appears only in simulation helpers | `SessionManager.create(config, seats, { deck })` |

## Mismatches and gaps to resolve

1. **Private card separation is not provided.** The README says the session does not deal hole cards by default, and I found no redaction or per-viewer selector. Our public/private state split (Phase 6, no-leak gate) must be built by us around it. This is the main design cost of wrapping it.
2. **Event-sourced shape differs from our `CardGame` interface** (`SessionManager`, intents, envelopes). A wrapper is needed; its size is unknown until S1 step 2.
3. **Pinning risk.** 4 stars, v0.1.3, single maintainer. Vendor a pinned copy with the MIT notice instead of tracking latest.
4. **Optional deps (Supabase persistence, React adapter) are not needed**; import only the core entry.
5. **Persistence model.** Its persistence targets Supabase. We persist the event log to Durable Object SQLite; the event-sourced design should allow this, but unproven.

## Still unproven (next steps for S1)

1. Write our own Hold'em cases as tests against the public API: min-raise arithmetic after a raise, odd chip with 3 winners, side pots with 3 unequal all-ins, heads-up button blinds, 8 seats.
2. Prototype the `CardGame` wrapper and check we can expose `getPublicState` / `getPrivateState(playerId)` with no hole-card leak.
3. Run the engine and its tests in the Workers runtime (shared with S6).
4. Confirm replay: rebuild a hand from the event log held in Durable Object SQLite and compare to live state.

## Decision

Phase 8 sizing is **L to XL** until the defects are resolved (see Next). Private-state separation remains our wrapper's job.
