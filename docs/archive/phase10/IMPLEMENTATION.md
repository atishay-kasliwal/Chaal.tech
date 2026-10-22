# Phase 10: Texas Hold’em added alongside Teen Patti

## Scope

The first Poker game is server-authoritative Texas Hold’em for 2–6 seated players. It is a separate game engine, not a Teen Patti rules variant. Existing Teen Patti rooms and the eight Teen Patti variants keep their current engine and UI path.

## Reused application infrastructure

- Room creation, room codes, Socket.IO sessions, stable player IDs, seat assignment, readiness, persistence, command IDs, revision checks, and chip ledger.
- LiveKit room identity, player seat association, camera/audio controls, reconnect handling, and media fallback.
- Existing table scene, responsive seat placement, visual theme, button styles, and card asset renderer.
- A Poker-specific seat renderer was added to show two hole cards, fold/all-in state, bet, balance, video, and connection state.
- The existing table scene now fits six seats, central cards and mobile actions inside one viewport; compact mobile seats keep video, identity and private cards together around the table.
- Teen Patti rooms open in Classic. After a hand, the host chooses a specific next variant or asks the server to select one with cryptographic randomness. Poker has its own ready/start-again control.

## Hold’em rules in this initial slice

- Standard 52-card deck, two private hole cards per player, and five shared community cards, with burn cards before flop, turn, and river.
- Dealer button rotates by seat. Small and big blinds are 1 and 2 chips.
- Fold, check, call, minimum no-limit raise, short all-in raises, and timeout-as-fold.
- Server-side best-five-of-seven evaluation, tie splitting with a positional odd chip, and contribution-level side pots.
- Opponent hole cards remain redacted in every viewer projection. At showdown, only non-folded hands are revealed. Fold wins do not expose the winner’s cards.
- No client-provided cards, bets, winners, or hand scores are accepted.

## Code map

- `server/poker/holdem.mjs`: standalone room transitions, Hold’em evaluator, settlement, and recipient-specific projection.
- `server/engine.mjs`: dispatches `gameType: texas-holdem` to the new engine; Teen Patti behavior remains the default for legacy rooms.
- `server/index.mjs`: room creation and Poker action routing through the existing authenticated, revision-checked command boundary.
- `src/routes/create-room/+page.svelte`: additive game selection; Teen Patti variants remain selectable for Teen Patti rooms.
- `src/routes/[roomName]/+page.svelte`: renders the Hold’em community board and actions through the existing table shell.
- `src/lib/components/PokerSeat.svelte`: Poker cards and player state with the existing video-seat presentation.
- `tests/server/poker.test.mjs`: deterministic Poker rules, privacy, transitions, chip conservation, and side-pot tests.
- `scripts/phase10/poker-browser.mjs`: six independent browsers play Hold’em to showdown and verify card privacy, readable private cards, fixed-screen layout and mobile actions.
- `scripts/phase10/teen-patti-browser.mjs`: verifies Classic room creation without variant selection, then starts a server-randomized next hand while preserving seats.
- `scripts/phase6/browser.mjs`: verifies 2–6 Teen Patti seat layouts and no-scroll mobile layouts, including 320px portrait and landscape.

## Remaining production work

This is a playable first implementation, not a production certification of Poker rules. Broader randomized evaluator comparisons against an independent reference, exhaustive side-pot and short-all-in conformance cases, and real-device table usability checks remain before public launch. The room currently fixes blinds at 1/2 and does not implement tournament formats, rake, cash-value chips, spectators, Omaha, or other Poker variants.
