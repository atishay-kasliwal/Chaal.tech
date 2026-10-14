# Production Audit

**Audit date:** 2026-10-14

**Scope:** Repository code, server tests, Svelte checks, lint, production build, and production dependency advisories. Read-only HTTPS checks for `chaal.tech` and `api.chaal.tech` could not resolve either hostname from the verification environment. The live Cloudflare account, live deployment settings, WAN behavior, and multi-replica runtime were not inspected.

## Overall assessment

The Teen Patti server has a solid authoritative foundation: it owns dealing, turns, betting, and winner calculation; it projects private card views per player; and the service tests cover six Socket.IO clients, races, stale actions, and restart recovery. The project is not yet production-ready. The findings below are ordered by impact.

## Findings

### F1 — High: Blackjack can pay players who were not dealt into the hand — RESOLVED

`dealerPlay` settles every room player with a nonzero `blackjackBet`, without checking that the player participated in the current hand. A seated but disconnected/unready player has no cards and is not charged at hand start, yet receives a payout if the dealer busts. A local reproduction with three players, two dealt hands, and a dealer bust increased the nonparticipant's balance from 50 to 54 and `issuedChips` from 150 to 158.

**Evidence:** [`server/blackjack/blackjack.mjs`](../server/blackjack/blackjack.mjs) lines 52–78 and 171–205.

**Resolution:** Settlement now skips players without a current-hand contribution (`handBet` stays zero for nonparticipants). A regression test covers a disconnected/unready seated player and checks their balance, payout list, and chip conservation. `node --test tests/server/blackjack.test.mjs` passes all five tests.

### F2 — High: Production frontend can fall back to localhost — RESOLVED

If `VITE_SERVER_URL` is missing at build time, the browser bundle targets `http://127.0.0.1:8080`, which means visitors try to connect to their own machine. Cloudflare Pages configuration must inject the public API URL before building; the repository does not fail the production build when it is absent. The live Pages build setting was not inspected.

**Evidence:** [`src/lib/config.ts`](../src/lib/config.ts) line 2; [`docs/cloudflare-deployment.md`](cloudflare-deployment.md) lines 16–20.

**Resolution:** Localhost remains the development-only default. Production Vite builds now require a public HTTPS origin and reject missing values, HTTP, localhost (including trailing-dot and subdomain forms), IP literals, credentials, and URL paths. Missing runtime configuration also produces a visible connection error. Positive and negative build-configuration tests pass. The live Pages build setting still needs verification.

### F3 — Medium: Short, guessable room names permit lobby griefing — RESOLVED FOR NEW ROOMS

Room names as short as three characters are accepted. An unauthenticated HTTP lookup exposes whether a room exists, its player count, and whether a game has started; joining an open room requires only the room name and a chosen username. An outsider who guesses a code can take a seat and remain unready, preventing the host from starting.

**Evidence:** [`server/engine.mjs`](../server/engine.mjs) lines 27–32; [`server/index.mjs`](../server/index.mjs) lines 124–146 and 253–258.

**Resolution:** The server now creates a 128-bit random room ID and ignores client-selected names, so new invite codes cannot be chosen or guessed from short aliases. The existing join-by-code flow and URL-based invite remain. Previously created short room IDs are still usable while those rooms exist; a later admission-approval flow would provide additional protection if a private link is exposed.

### F4 — Medium: Room and service data grow without retention — RESOLVED WITH RETENTION POLICY

Room creation stops at 1,000 database rows. No room deletion or retention process was found, so this is a lifetime cap. Session rows, idempotency receipts, and ledger entries also have no cleanup policy and continue to grow.

**Evidence:** [`server/index.mjs`](../server/index.mjs) line 241; [`server/store.mjs`](../server/store.mjs) lines 9–14 and 35–74.

**Resolution:** A daily server sweep removes rooms with fewer than three historical joiners after 30 inactive days and rooms with three or more joiners after 365 inactive days. Connected rooms and unfinished hands are protected. Room receipts are removed with their room; other receipts expire after 30 days, ledger entries after 365 days, and session identities after 365 days only when no retained room references them. Schema v2 timestamps room activity and adds retention metadata. Existing rows receive fresh timestamps during migration, so the upgrade itself does not trigger deletion. A client whose unreferenced identity eventually expires automatically creates a new identity on reconnect.

### F5 — Medium: An ungraceful host disconnect does not transfer host ownership — RESOLVED

The disconnect handler updates local presence but leaves `hostId` unchanged. Host transfer only happens after an explicit leave action. If a host never reconnects or leaves cleanly, the room cannot start its next hand.

**Evidence:** [`server/index.mjs`](../server/index.mjs) lines 503–508; [`server/engine.mjs`](../server/engine.mjs) lines 237–246.

**Resolution:** A disconnected host retains ownership for the configurable 30-second grace period. If they do not resume and another seated player is connected, host ownership moves clockwise and the updated state is persisted. A rejoin during the grace period cancels the transfer. Tests cover both paths. Explicit host leave still transfers immediately.

### F6 — Medium: Multiple game-server replicas do not share presence or broadcasts — SINGLE-INSTANCE LAUNCH LIMIT

Presence and room publication use process-local maps. SQLite revision checks prevent some conflicting writes, but sockets connected to other processes will not receive updates and each process sees an incomplete connected-player set. The project documents single-process operation as a current limit.

**Evidence:** [`server/index.mjs`](../server/index.mjs) lines 58 and 194–212; [`docs/phase9/IMPLEMENTATION.md`](phase9/IMPLEMENTATION.md) lines 23–28.

**Resolution:** The supported launch shape is one game-server process, documented in the deployment guide. Six-player rooms work within that shape. Multi-replica support still requires shared presence/broadcast and transactional room ownership; it is not needed for the current launch target and remains future work.

### F7 — Medium: Self-hosted LiveKit participant removal is not full token revocation — CLOUD PATH HARDENED

The project notes that a removed participant may reconnect using a previously issued self-hosted LiveKit token. The short token lifetime mitigates exposure but does not provide a complete revocation guarantee.

**Evidence:** [`server/media.mjs`](../server/media.mjs) lines 28–43; [`docs/phase4/IMPLEMENTATION.md`](phase4/IMPLEMENTATION.md) line 84.

**Resolution:** LiveKit Cloud URLs automatically pass the token revocation cutoff when a participant is removed; other compatible providers can enable it with `LIVEKIT_REVOKE_TOKENS=true`. Tokens expire after 60 seconds. Self-hosted LiveKit still has no immediate revocation guarantee. The actual production provider and its credentials were not available for an end-to-end check.

### F8 — Release issue: The test suite has one failing preservation check — RESOLVED

`npm test` reported 150 passing tests and one failure. The frozen Phase 4 preservation check fails on `RoomMedia.svelte`: the current file hash differs from the fixture, but the test still treats it as unchanged. This is a test-policy/review issue; it does not by itself establish a runtime defect.

**Evidence:** [`tests/server/seat-layout.test.mjs`](../tests/server/seat-layout.test.mjs) lines 48–86; [`tests/fixtures/phase4-preservation.json`](../tests/fixtures/phase4-preservation.json).

**Resolution:** Reviewed the approved UI commit: `RoomMedia.svelte` intentionally removed its enclosing panel styling, and `SeatVideo.svelte` changed to cover the seat. Updated the frozen hash and assertion to match that approved behavior. The focused seat-layout test now passes.

### F9 — Low: Three clickable landing-page cards are not keyboard-operable — RESOLVED

The cards have `role="button"` and `tabindex="0"`, but no keyboard activation handler. Svelte reports three accessibility warnings for these elements.

**Evidence:** [`src/routes/+page.svelte`](../src/routes/+page.svelte) lines 155, 209, and 272.

**Resolution:** The three interactive mechanics cards now activate with Enter and Space. Static hand-ranking examples no longer claim button semantics. `npm run check` reports zero accessibility warnings.

## Verification results

- `npm test`: **passed**, 162 tests, 0 failures.
- `npm run check`: **passed**, 0 errors and 0 warnings.
- `npm run lint`: **passed**, 0 warnings and 0 errors.
- `VITE_SERVER_URL=https://api.chaal.tech npm run build`: **passed**. A negative build check with an IPv6 loopback URL failed as intended. The build emits a 560 KB minified optional LiveKit chunk (about 146 KB gzip), loaded dynamically; the bundle-size warning remains.
- `npm run format:check`: **fails** on 36 existing source, documentation, and fixture files. The affected files are not part of the production runtime; bulk formatting would add unrelated changes and was not applied.
- `npm audit --omit=dev`: **0 known vulnerabilities** in production dependencies; development dependencies were not included in this scan.
- Live HTTPS check: **not reached**; DNS lookup failed for both `chaal.tech` and `api.chaal.tech`, so no site, health, or readiness response could be verified.

The audit is saved. Repository-level fixes and verification are complete for the findings marked resolved. Public DNS, live Cloudflare build settings, production host configuration, backups/restore, WAN behavior, and the actual LiveKit provider still require production access and deployment verification.
