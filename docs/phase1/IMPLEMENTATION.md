# Phase 1: authoritative Classic behind the existing UI

## What changed

The supplied repository still has no recoverable game-server source. Final checks of its branch/tag inventory and README found only `main` and no server reference. A small owned `server/` service now supplies the existing frontend's Socket.IO boundary. No monorepo, alternate frontend, variant framework or media integration was introduced.

The landing page, theme, typography, PlayingCard rendering/normalization, custom card backs, waiting table, player panel classes, animations and existing See/Blind/Chal/Pack/Show controls are retained. Room handlers now use stable player IDs and command acknowledgements. Player loops are keyed by those IDs. DeclareWinner retains its trophy/panel styling but displays a server-computed result instead of accepting a claimed winner. The original mobile Leave icon now has an accessible label.

The exact existing Cardmeister JavaScript is served from `static/vendor/` rather than an unpinned remote URL. The original renderer component changes only its script URL. The upstream analytics component is no longer mounted, so it cannot send data to the original tracking property. Browser checks reject unexpected third-party runtime requests. Attribution and the asset hash are recorded alongside the vendored asset.

## Run locally

Use Node 24 or later; local checks were executed on Node 26.10.0. Install the locked dependencies:

```sh
npm ci --ignore-scripts
```

Terminal 1:

```sh
npm run server
```

Terminal 2:

```sh
npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173/. The default game service is http://127.0.0.1:8080/. There is no automatic fallback to the unsafe Render backend.

For a stable browser verification build:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 5174
npm run phase1:browser
```

The capture tool uses installed Chrome on macOS, with `PHASE0_CHROME` available to override its executable path. Its room and all game state stay on the owned local service. Each synthetic player uses an isolated browser context.

`.env.example` documents public frontend and backend-only settings. The backend loads `.env` if present; the development frontend uses Vite environment handling. Use `VITE_SERVER_URL` for a different owned service. Backend `ALLOWED_ORIGINS` must explicitly include each UI origin. Production needs HTTPS, a privately stored durable database and appropriate hosting; no deployment was performed here.

## State and persistence

Four backend modules are sufficient at this stage:

- `classic.mjs`: canonical deck, unbiased server CSPRNG shuffle and hand comparison.
- `engine.mjs`: deterministic Classic transitions, recipient projections, chip invariants and balanced movement entries.
- `store.mjs`: SQLite sessions, confidential snapshots, command receipts and ledger transactions.
- `index.mjs`: HTTP/Socket.IO authorization, session takeover, command sequencing and timeout recovery.

This is a single-process local service. SQLite was chosen to establish durable transactions without requiring new hosted infrastructure or changing the frontend. It is not a claim that multi-instance game ownership is implemented. A future migration can preserve this boundary and its tests.

SQLite uses WAL and immediate transactions. Each mutation writes its snapshot, idempotency receipt and any balanced chip entries atomically. The commit checks the expected persisted room revision. A failed ledger write rolls back everything, so retrying the same command can succeed once. A committed command with a lost acknowledgement returns its recorded result without debiting again. Broadcast follows commit; reconnect obtains a fresh full view.

Database files live under ignored `data/`. The CLI sets a restrictive file-creation mask. Back up the complete SQLite database safely, including WAL handling; do not copy a live file casually or commit it. Private hands/deck remain server-side, including in persisted recovery state. Receipt results and ledger entries contain no card values or session bearer tokens.

## Identity, admission and recovery

A server-issued opaque guest session keeps the existing signup-free experience. Only its SHA-256 hash and stable player ID are stored by the server. The browser stores the bearer token locally for refresh/reconnect; clearing browser storage loses this guest identity. If browser storage is unavailable, only in-memory recovery is possible. No account recovery UI is claimed.

The authenticated session binds commands to a player; client-supplied player IDs and winners have no authority. One socket owns that player at a time. A new connection using the same session explicitly replaces the previous connection; the old tab does not automatically fight to reconnect. The existing Reconnect control can take ownership back.

Public room HTTP metadata allows the Svelte route to load during a hand. Socket membership determines whether the person may resume, join, or receives an admission error. Nonmembers cannot join a hand already in progress. Sessions preserve seats, balances and private seen/blind state across refresh and service restart.

A network disconnect reserves the player's seat; its current turn still expires. A host who does not resume within the configurable 30-second grace period transfers host privileges to the next connected seated player clockwise. Explicit Leave packs an active player, preserves their existing room balance and transfers host privileges immediately. Joining again does not mint a fresh bankroll. Departed seats are released at a safe hand boundary. A disconnected player must resume before being included in a new hand.

## Privacy and authority

- The public room response is an explicit allowlist of room name, active/show status, participant count and capacity. It never includes `cardsRemaining`, player identities, balances or hands.
- Every Socket.IO update is a complete view for one authenticated member.
- Blind hands are rank-zero/count placeholders, including the owner's hand.
- See changes the server state before the owner's card identities are released.
- Opponent cards remain placeholders until an authorized showdown.
- Folded hands stay hidden from opponents; an owner who already saw their own cards can still see their own hand.
- Last-player settlement does not expose an otherwise blind winner.
- Full view replacement clears old private state at a new hand; a room snapshot is not shallow-merged with a prior hand.
- `confirmWin` is rejected. Show or last-player resolution computes and settles the winner server-side.
- Commands are membership/turn/phase/balance validated, revision/hand bound and idempotent. Conflicting payload reuse is rejected.

No cards or tokens are included in operational error logging. CORS and WebSocket admission use an explicit origin list; new connections and mutations have basic rate/size limits. This is a Phase 1 foundation, not a completed production abuse, retention or account-security system.

## Explicit Classic defaults

The complete original rules could not be recovered. The following defaults are documented rather than presented as proven original server behavior:

- Six seats, three cards each; server shuffles then applies the existing deck-cut interaction.
- Original room `table` input supplies starting play chips, minimum 50; boot is 1 chip per participating hand.
- At least two connected players with chips; host starts. A one-minute server deadline auto-packs an expired turn.
- Trail > pure sequence > sequence > flush > pair > high card. A-K-Q is first sequence, A-2-3 second, then K-Q-J. Suits do not break equal ranks.
- Blind bets are 1–2 current units; seen bets 2–4 units. The server supplies exact integer chip limits to the same numeric input. Internally an integer seen-equivalent stake avoids fractional chip balances.
- Show needs exactly two active players on the requester's turn. A seen player cannot request against a blind opponent. A blind requester pays the blind minimum; a seen requester pays the seen minimum. Equal evaluated hands lose for the requester.
- Unaffordable bets/Show are rejected; no all-in, side pot or sideshow is implemented. Pack remains available on the player's turn.
- One remaining active player wins without public card disclosure. Show credits the winner exactly once, empties the live pot and retains the revealed result until the host starts the next hand.
- The Classic card-count control stays recognizable but is fixed to three. Arbitrary 2/4-card deals wait for specified, tested variants.

These policies can be adjusted during rules review. The original valid create/join/See/Blind/Chal/Pack/Show flow is preserved; insecure disclosure and manually chosen winners are intentional exceptions. Starting stake display and bounds now reflect the documented legal Classic bets rather than unchecked client arithmetic.

## Verification

```sh
npm run lint
npm run check
npm test
npm run build
npm run phase1:browser
```

The rules suite independently checks category totals for every one of the 22,100 physical three-card hands. Multiplayer tests exercise six actual Socket.IO clients, private views, public HTTP serialization, forged winner denial, stale/out-of-turn actions, repeated and concurrent commands, host admission, duplicate connection fencing, timeout settlement and confidential restart recovery. A ledger failure is deliberately injected to verify rollback.

The deterministic wrong-winner regression recreates 4–5–6 versus 6–7–8 and proves that the stronger hand wins regardless of the old manual-selection behavior. Tests also assert chip conservation, unique dealt cards, private folded hands, tie policy and no bankroll reset on rejoin.

The browser smoke uses the existing actual forms/controls for six participants, See, bet, Pack, Show, new hand, refresh resume, mobile and host departure. Its report and screenshots are under `visual-baselines/phase1/`; original Phase 0 references remain untouched under `visual-baselines/original/`.

Lint/type-check now execute successfully. Legacy unused imports/unkeyed lists remain lint warnings and the preserved landing page retains its three keyboard accessibility compiler warnings; no unrelated template rewrite was performed to erase those warnings. The CI workflow now uses the original npm lockfile and Node 24 instead of the previous unrelated pnpm/Node 20 assumptions. Remote CI has not run because nothing was pushed.

## Recorded results

- 22 automated tests pass, including 22,100-hand exhaustive classification and two source-preservation checks.
- Six isolated browser players complete the actual UI path, with 12 captured references and zero browser-smoke errors.
- Build, lint and type checks pass; nine legacy lint warnings and three preserved landing accessibility warnings remain visible.
- Runtime dependency audit reports zero known vulnerabilities after targeted overrides for `socket.io-parser` and `ws`. Reasons: [Socket.IO parser advisory](https://github.com/advisories/GHSA-2m8v-j782-fhvr) and [WebSocket advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p). No transport or framework migration was performed.
- 18 original source/static files remain byte-identical. PlayingCard's original rendering instructions match byte-for-byte after normalizing only its delivery URL. `app.css` and the landing page are unchanged.
- The development file server explicitly denies local database/secret paths; production assets do not include game storage.

See [browser evidence](../../visual-baselines/phase1/README.md) and [runtime dependency check](runtime-dependencies.json).

## Remaining scope

This work does not implement variants, LiveKit, social seat layout, mobile redesign, account login, multi-process ownership, production monitoring/backups, rolling deployment or load/soak validation. SQLite storage and guest sessions are appropriate for this local stage, not an assurance of production readiness. Upstream source reuse permission remains an open project dependency. The next milestone is rules review and the small Classic/Muflis boundary, after this preserved-UI foundation is reviewed.
