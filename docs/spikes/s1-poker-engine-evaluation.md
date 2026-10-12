# S1: poker-engine-ts evaluation

Repo: Ge-limin/poker-engine-ts, v0.1.3, MIT, one runtime dependency (@noble/hashes). Evaluated at the commit cloned on 2026-10-11.
Method: read the source, installed with `pnpm install --frozen-lockfile --ignore-scripts` in an isolated folder, ran its own suite (**30 files, 192 tests, all pass**). I did **not** yet run our own rule cases against its public API, and did **not** run it inside the Workers runtime. Those are listed under "Still unproven".

## Verdict

**Promising; conditionally adopt behind our `CardGame` wrapper.** On every Hold'em rule in DECISIONS.md section C that I could check, its existing tests or code already match. Do not commit to it until the "Still unproven" items pass.

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

Keep Phase 8 sized **L** (not XL). Re-evaluate after step 2. If step 2 shows the wrapper is large or the engine leaks private state in ways we cannot contain, fall back to an in-house engine using the same patterns (Phase 8 becomes XL).
