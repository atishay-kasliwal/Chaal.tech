# S6: Cloudflare backend validation (local part)

Status: **local checks pass; deployed checks not yet run.** Code: `spikes/s6-backend/` (Durable Object `Room` with SQLite ledger, hibernating WebSockets, alarms). Run with `npm test` there. Tests execute inside the real Workers runtime locally (workerd via `@cloudflare/vitest-plugin`), 15 tests, all pass, no unhandled errors.

## Results against the S6 list

| S6 item | Result | Evidence / caveat |
|---|---|---|
| Durable Object room ownership | Pass (local) | One object per room id via `idFromName`; each room has its own ledger and sockets |
| WebSocket messaging | Pass (local) | Round trip and broadcast to all connected players |
| SQLite persistence | Pass (local) | State identical after `evictDurableObject`; replayed operation key still deduplicated after eviction |
| Ledger atomicity | Pass | Injected failure between debit and credit rolls back; operation key reusable afterwards |
| Chip conservation | Pass | Property test (fast-check, 40 runs of up to 40 random valid/invalid/replayed transfers): total balances = total minted, no negative balance, balances equal the sum recomputed from the transaction log |
| Idempotency | Pass | Same key applies once, over RPC and over WebSocket; duplicate mint also ignored |
| Concurrency | Pass | 50 concurrent transfers of 100 from a 1,000 balance: exactly 10 succeed, balance 0, invariant holds |
| Turn timers / alarms | Pass (simulated) | Alarm handler runs and records the timeout; a timer set before eviction still fires after eviction. Alarm timing precision was not measured (the test harness triggers alarms directly) |
| Hibernation and restoration | Pass (simulated) | After `evictDurableObject` with hibernate, the same socket keeps working and its attachment (sequence number, player) is restored. Real idle hibernation timing not observed |
| Engine compatibility with Workers | Pass for poker-engine-ts | A real hand runs inside the object. Our Teen Patti engine does not exist yet, so it is untested. Note: the engine's types only allow `maxSeats` of 2, 6 or 9, while 8 works at runtime (S1 test) |
| Backup and recovery options | Documented, **not tested** | Cloudflare documents point-in-time recovery for SQLite-backed objects: `getBookmarkForTime` (within the last 30 days), `onNextSessionRestoreBookmark`, then `ctx.abort()` to complete the restore; recovery covers SQL and KV data and can be undone via the returned bookmark. It is not supported in local development, so it must be tested after deployment. Source: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ |
| Expected free-tier consumption | Estimated from local counters; **not measured on Cloudflare** | See below |

## Simulated session: 60 hands x 8 players (boot + 4 bets each, pot paid to a winner)

Counters from the room object (local run):

| Measure | Value | Share of free daily limit |
|---|---|---|
| Incoming WebSocket messages | 2,400 | 2.4% of 100,000 requests (worst case: every message billed as one request) |
| SQLite rows written | 12,362 | 12.4% of 100,000 |
| SQLite rows read | 17,781 | 0.36% of 5,000,000 |
| Ledger transactions | 2,469 | n/a; invariant verified after the run |

Limits quoted from Cloudflare's Durable Objects pricing page for the Free plan (SQLite backend). These counters cover game and ledger traffic only. They exclude video signaling (S4), presence and heartbeats, reconnects, hand history writes, and chat, so real usage will be higher. Local counters count rows the way the local runtime reports them; Cloudflare's billing may count differently.

## Not yet validated (needs a deployment to the owner's Cloudflare account)

1. Real usage on the Cloudflare dashboard for a 2-hour session with 8 real clients.
2. Point-in-time recovery: bookmark, restore, undo.
3. Behavior under real hibernation (idle sockets) and alarm timing.
4. Latency from client to object, and cold-start effects on the first message.
5. Two clients writing to the same room at the same time over real sockets.
6. D1 for the allowlist and users (not yet built).

## Verdict so far

No blocker found locally. Ledger design (single-threaded room object + SQLite transaction + idempotency key) behaves as required. S6 stays open until items 1-6 above pass on a real deployment. If any fail, the Node + PostgreSQL fallback in STACK.md applies; the ledger code is plain SQL and ports directly.
