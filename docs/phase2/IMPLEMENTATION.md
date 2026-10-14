# Phase 2: smallest useful variant boundary

Phase 2 is complete. Classic is the only registered variant. All 30 Phase 1 frontend source and static files, including the vendored card renderer, remain byte-for-byte unchanged. No dependencies were added.

The application still runs with `npm run server` and `npm run dev`. The verified production preview is available locally at `http://127.0.0.1:5174` while the preview process is running.

## What changed and why

| File | Change | Reuse |
|---|---|---|
| `server/classic.mjs` | None | Entire existing deck, shuffle, evaluator and comparer retained |
| `server/variants/classic.mjs` | Small immutable Classic descriptor | Wraps existing evaluator/comparer directly |
| `server/variants/index.mjs` | Versioned, read-only registry | Uses the existing persisted `classic-1` identifier |
| `server/engine.mjs` | Resolve room rules and delegate showdown comparison | Existing betting, dealing, chips, turns, settlement and private views retained |
| `server/index.mjs` | Isolate timeout errors per room | Existing Socket.IO handlers and protocol retained |
| `scripts/phase1/browser.mjs` | Optional capture-directory environment variable | Entire existing six-player browser sequence reused |

The only new production directory is `server/variants/`. No frontend extraction, repository reorganization, UI selector, protocol change or database migration was needed.

## Variant contract

Each registered descriptor supplies:

- `id`, numeric `version`, persisted `rulesVersion`, `name`, `description`.
- `evaluateHand(cards)`: deterministic hand rank vector.
- `compareHands(leftCards, rightCards)`: negative, zero or positive comparison, currently normalized to -1/0/1.
- `getRules()`: immutable hand-ranking description.

The registry exports `getVariant(rulesVersion)`, `listVariants()` and `DEFAULT_RULES_VERSION`. Descriptors are frozen and registration is static. New rooms still store `rulesVersion: 'classic-1'`; existing saved rooms load without migration. Unknown versions fail closed with `UNSUPPORTED_RULES`, rather than silently changing a saved hand's rules. A room with unsupported rules cannot prevent valid rooms from processing their turn deadlines.

Variants receive card arrays only. The engine owns room state, chip accounting, turn validation, show eligibility, requester-loses-ties policy, dealing and private projections. Networking, persistence, identities, frontend and future media remain outside variants.

Deck preparation, wildcards, configurable hand sizes and special settlement hooks are deliberately deferred until a concrete variant needs them. The current engine still assumes a standard deck and three cards; Phase 7 must explicitly extend and test those assumptions before adding 2 Card, 4 Card or joker variants. This contract does not pretend those variants already work.

## Preservation evidence

Before extraction, a fixed characterization fixture was captured from Phase 1 in `tests/fixtures/phase1-classic.json`. Tests compare the extracted implementation against those frozen expectations, rather than regenerating expectations from the new implementation.

- All 22,100 standard three-card hands retain their evaluation vectors.
- 132,600 comparisons against six fixed ranking anchors retain their results. This is not an exhaustive test of every possible pair of hands.
- Fifteen scenarios cover 2–6 players and three fixed deck orders: 228 total transitions, including joins, starts, blind bets, seeing cards, packs, paid shows, settlement, timeouts and host departure.
- Replay hashes cover each intermediate full state, every player's private projection and chip ledger movements.
- File hashes prove the Classic implementation and all Phase 1 frontend/static files were preserved.

The reference is the documented authoritative Phase 1 Classic implementation. It does not claim compatibility with undocumented behavior inside the unavailable upstream backend.

## Narrow reliability correction

Characterization exposed an existing six-seat rejoin defect: a player who explicitly left during a hand retained their seat reservation after settlement, so rejoining could incorrectly return “Room full.” Join now clears departed seat reservations after the hand has finished, using the same cleanup already performed on starting another hand. A regression test proves rejoin preserves the player's balance and total issued chips and restores six unique seats.

This is a separate, intentional correction, excluded from the replay equivalence claim. No visuals or ordinary hand rules changed.

## Verification

| Check | Result |
|---|---|
| `npm test` | 43 passing tests |
| `npm run lint` | Zero errors; nine existing frontend warnings |
| `npm run check` | Zero errors; three existing landing-page accessibility warnings |
| `npm run build` | Passed; existing accessibility warnings remain |
| Six isolated browser users | Passed; see separate Phase 2 capture report |

The suite retains Phase 1 privacy, authority, duplicate-command, race, persistence, restart and storage-failure coverage. New tests cover the immutable registry, unsupported rules, characterization parity, source preservation, seat recovery and timeout isolation.

Browser evidence is saved under [visual-baselines/phase2](../../visual-baselines/phase2/README.md); Phase 0 and Phase 1 captures remain untouched. Reproduce with backend on port 8080, production preview on port 5174 and:

```sh
CAPTURE_DIRECTORY=visual-baselines/phase2 node scripts/phase1/browser.mjs
```

These are functional captures, not a claim of automated pixel-perfect screenshot comparison. Source preservation is independently verified by hashes.

## Next phase

Phase 3 can add Muflis behind this boundary, characterize its exact ranking rules, and introduce the smallest necessary create-room option. Room membership, seats, Socket.IO transport, chip accounting and the existing game UI should continue to be reused. Do not change Classic's persisted rules version in place. Mid-hand rule switching must remain forbidden.

LiveKit, additional variants and Poker are outside this phase. The existing single-process service and operational limitations documented in Phase 1 remain.
