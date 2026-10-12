# S6: Cloudflare backend validation (local part)

Status: **local checks pass; live checks run on 2026-10-12 (results below). Correctness passes; latency is unresolved, so S6 stays open.** Code: `spikes/s6-backend/` (Durable Object `Room` with SQLite ledger, hibernating WebSockets, alarms). Run with `npm test` there. Tests execute inside the real Workers runtime locally (workerd via `@cloudflare/vitest-plugin`), 15 tests, all pass, no unhandled errors.

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


## Live run on Cloudflare (katishay45 account, workers.dev, 2026-10-12)

Script: `spikes/s6-backend/scripts/measure.mjs` (8 concurrent WebSocket clients from one laptop in North Carolina, 60 hands: boot + 4 bets each + pot win). Deployed at `s6-backend-spike.s6-backend-spike.workers.dev` (no sign-in; throwaway, to be deleted).

| Item | Live result |
|---|---|
| 8 concurrent clients, 2,460 messages | All applied; ledger `verify` ok: balances 40,001 = minted 40,001, no mismatches |
| Real usage counters | 2,531 messages received, 12,362 row writes (identical to the local simulation), 64,701 row reads (higher than local because the script polls balances once per hand). Against daily free limits: 2.5%, 12.4%, 1.3% |
| Alarm | Requested 5 s, observed 6.5 s (includes 500 ms polling and about 1 s message latency) |
| Hibernation | **Inconclusive.** The connection survived 30 s of idle and the sequence state continued (301 then 302), but we did not prove the Durable Object actually hibernated (no eviction or wake observed). The local eviction test shows the restore path works in the simulator only |
| Point-in-time recovery | **State restoration succeeded.** After a bookmark, 5 transfers changed balances; restore via `onNextSessionRestoreBookmark` + `ctx.abort()` returned balances exactly to the bookmark state and `verify` stayed ok. The initiating client's response timed out because the restoration restarted the object and its connection. The undo bookmark was not exercised |
| Cloudflare dashboard usage | **Not checked.** Counters above are the object's own; the dashboard figures were not read |
| **Latency** | **p50 913 ms, p95 1,534 ms, p99 2,946 ms, max 4,308 ms per message, against our 250 ms target. Unresolved, see below** |

### Latency investigation (inconclusive)

- Ping to Cloudflare from the laptop: about 22 ms. www.cloudflare.com on a reused connection: about 14 ms.
- The deployed Worker, **even on a route that never touches the Durable Object** (`/nope`, immediate 404), takes about 0.9 to 1.1 s per request on a reused connection. Routes that do reach the object take about the same (0.8 to 1.0 s on the same object). So the delay is not the room object or the ledger.
- Served from Atlanta (cf-ray ends ATL), TCP connect 25 ms, but TLS handshake takes 0.9 to 1.3 s and time to first byte another 0.8 to 1.1 s. Server-side work in the Worker is nil.
- One other site (example.com) also showed a slow TLS handshake (0.97 s) in an earlier check, so this machine's path may be a factor, but www.cloudflare.com and github.com were fast.
- Hypotheses, not confirmed (investigation continues in the next section): (1) `workers.dev` hostnames on a brand-new account subdomain are slower to serve than custom domains; (2) a network issue specific to this laptop's path to that hostname; (3) something about the free plan. Not tested: a custom domain on `chaal.tech`, a second network or device, and a browser.

### Next for S6

1. Re-measure from a second vantage (phone hotspot or a browser) and via a custom hostname on `chaal.tech`. The custom hostname needs a DNS record on the owner's zone, so the owner must approve it first.
2. If latency stays near 1 s on a custom domain from several networks, treat it as a real problem and look at the Worker and object placement; if it drops, close S6 latency.
3. Read the Cloudflare dashboard usage and compare with the counters above.
4. Delete the throwaway deployment when done.


## Latency investigation, round 2 (2026-10-12): breakdown, network 1 only

**Conclusion: not yet recorded.** A second-network run (phone hotspot or similar) has not been received, so none of PASS, PASS WITH KNOWN CONNECTION SETUP LATENCY, RETEST REQUIRED or FAIL is assigned. The 250 ms p95 game-action target is unchanged. S6 stays open. No backend change decided.

Setup: `s6.chaal.tech` was added as a Worker custom domain (only that DNS record was created; apex, www, MX and nameservers unchanged, verified by lookup). The Worker and room object were instrumented with server timings (Date.now(), 1 ms resolution, so sub-millisecond work shows as 0). All runs below are from the same home network in North Carolina, served from Cloudflare Atlanta (ATL). Raw data: `docs/spikes/data/`.

All values are p50 in ms unless noted. "Node" = `scripts/latency.mjs` (curl for HTTP phases, built-in WebSocket); "Browser" = Chrome via the `/test` page (connection already open, so DNS/TCP/TLS read 0).

| Phase | Custom host, Node | workers.dev, Node | Custom host, Browser | workers.dev, Browser ("home") |
|---|---|---|---|---|
| DNS lookup | 2.3 | 3.5 | n/a (reused) | n/a (reused) |
| TCP connect | 25 | 24 | n/a | n/a |
| TLS handshake | 873 (p95 1,242) | 1,385 (p95 1,543) | n/a | n/a |
| Time to first byte after TLS | 913 | 1,412 | about 1,060 (reused connection) | about 1,385 (reused connection) |
| Total HTTP request, fresh connection | 1,805 (p95 2,589) | 2,834 (p95 3,126) | n/a | n/a |
| WebSocket connection establishment | 2,194 (range 315 to 3,313) | 2,075 (range 497 to 2,864) | 2,080 (range 1,035 to 3,265) | 1,861 (range 370 to 3,583) |
| WS message round trip, no database (echo) | 1,078 (p95 1,370) | 1,363 (p95 3,450) | 704 (p95 1,323) | 1,243 (p95 3,144) |
| WS round trip with SQLite read | 948 (p95 1,227) | 1,327 (p95 2,949) | 726 (p95 1,371) | 1,246 (p95 1,442) |
| WS round trip with ledger write | 1,040 (p95 1,289) | 1,276 (p95 1,572) | 1,088 (p95 1,459) | 1,288 (p95 1,513) |
| Server: Worker to Durable Object and back | 26 | 26 | about 25 | about 40 |
| Server: Durable Object processing | 0 | 0 | 0 | 0 |
| Server: SQLite operation | 0 | 0 | 0 | 0 |

How to read it:
- **WebSocket message latency is measured on an already-established socket and is kept separate from HTTP setup,** as required. It is still 0.7 to 1.4 s at the median, so the slowness is not only connection setup.
- **Server-side work is near zero.** Worker-to-object routing is about 25 to 45 ms; object and SQLite time are below the 1 ms clock resolution. The delay therefore sits between the client and Cloudflare's edge, before the request reaches our code.
- **Two clients (curl/Node and Chrome) show the same pattern,** so it is not an artifact of my tooling.
- **Browser runs overlapped in time** with each other and with the Node runs on the same connection, which may inflate them.
- **Known limitation:** the Node script's reused-connection summary printed null (a bug in my summarizing code), so steady state for reused connections comes from the browser data only.

### Control experiments (same network, same session)

| Test | Result |
|---|---|
| Same Cloudflare edge IP, SNI `s6.chaal.tech` | TLS 0.6 to 1.3 s |
| Same edge IP, SNI `www.cloudflare.com` | TLS about 0.05 s, total 0.08 s |
| Same edge IP, SNI `discord.com` (a Cloudflare customer) | TLS 0.05 to 0.14 s |
| Cloudflare-owned `workers.cloudflare.com`, `pages.dev`, `cloudflare-dns.com` | Total 0.09 to 0.18 s |
| Owner's older Cloudflare zone `atishaykasliwal.com` | TLS 0.7 to 1.5 s, total up to 6.5 s: **also slow** |
| Plain HTTP (no TLS) to `s6.chaal.tech` | 1.09 s, then 0.17 s, then 0.07 s |
| TLS 1.2 only, HTTP/1.1 vs HTTP/2, the second edge IP | No improvement |
| Ping to Cloudflare | about 22 ms |

### What this does and does not show

- Shows: our Worker, Durable Object and ledger are not the source of the delay; it depends on the hostname and the path from this network, not on the TLS version, HTTP version or edge address.
- Does not show: whether the cause is this home network (a filter or router treating some hostnames differently) or Cloudflare's handling of free-plan customer hostnames for everyone. The owner's unrelated older zone being slow points toward the network or the free-plan path generally, not toward anything specific to the spike.

### Remaining steps before a conclusion

1. Second network: run `https://s6.chaal.tech/test` and `https://s6-backend-spike.s6-backend-spike.workers.dev/test` from a different network (for example a phone hotspot) with nothing else running, naming the network in the box.
2. Clean rerun on this network with nothing else running.
3. If the second network is fast: conclusion is PASS or PASS WITH KNOWN CONNECTION SETUP LATENCY depending on the setup numbers. If it is equally slow: RETEST REQUIRED with a look at Cloudflare plan and routing, and only then a decision about the backend.
4. Delete the throwaway deployment and the `s6.chaal.tech` record when finished.
