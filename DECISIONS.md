# V1 Decisions

Resolves the 22 gaps found in review of the product spec and execution playbook.
Status: **PROPOSED**. Each item is a concrete default so agents never invent product behavior. Items marked **OWNER** need a human confirmation before launch.
When this file conflicts with the two .docx files, this file wins until the docs are revised.

---

## A. Phase sequence (items 16, 17)

One authoritative sequence replaces both existing lists. The ledger now lands before any game settles chips.

| # | Phase | Exit gate |
|---|-------|-----------|
| 0 | Foundation: monorepo, strict TS, lint, CI, env validation, tokens, deploy skeleton | CI green, preview deploys |
| 1 | Static UX proof: fake video grid 2-8, 100dvh, blue cards, overlays, banker mock | Screenshots approved, no scroll, anti-AI review passes |
| 2 | Identity + Rooms: guest tokens, invite links, room lifecycle, host controls | Join/reconnect/kick tests pass |
| 3 | Database + Ledger: migrations, accounts, immutable transactions, idempotency | Conservation + concurrency tests pass |
| 4 | Live video: LiveKit, media gate, presence, active speaker, media-failure states | 6+ participants stable |
| 5 | Realtime protocol: versioned events, snapshots, resync | Stale/reconnect/duplicate tests pass |
| 6 | Card core: secure shuffle, public/private state split, deal animation | No private-card leak; deterministic tests pass |
| 7 | Teen Patti Classic | Simulation + E2E hands complete; ledger-backed settlement |
| 8 | Texas Hold'em | Side-pot and showdown matrix passes |
| 9 | Banker | No negative/duplicate transfers; debt reconciles |
| 10 | Social lending: gift, loan, request, repay | Concurrency/idempotency pass |
| 11 | Variations (strategy registry) | Isolated rule tests per variant |
| 12 | Polish + Hardening: audio, motion, timeouts, host migration, rate limits, a11y, load | Load/failure tests pass |
| 13 | Production release | Staging soak, migration dry run, rollback tested |

Deviation from the pasted plan: Phase 1 (static UX proof) is kept. It is the cheapest way to prove the product identity and both docs rely on it.

---

## B. Teen Patti Classic rules (item 1)

- Deck: 52 cards, 3 per player. Start requires 3+ seated, ready players. Players dropping to 2 mid-hand is normal. Seats: up to 8.
- Hand ranking, high to low: Trail (AAA highest, 222 lowest), Pure Sequence, Sequence, Color, Pair, High Card.
- Sequence order: A-K-Q (highest), A-2-3 (second), K-Q-J, ..., 4-3-2 (lowest). No wraparound (Q-K-A is A-K-Q; K-A-2 is invalid).
- Suits never break ties. Equal-rank hands: compare by rank as above; pair by pair rank then kicker; high card down the cards.
- Boot: every dealt player pays the boot into the pot. Dealer rotates clockwise; action starts left of dealer.
- Stake model: current stake `S` starts at boot.
  - Blind player: chaal costs `S`; raise costs `2S` and sets `S = 2S`.
  - Seen player: chaal costs `2S`; raise costs `4S` and sets `S = 2S`.
  - A raise may only double the stake. `S` is capped at `maxStake` (default 16 × boot).
- Seen: a blind player may look at cards at any time. They become seen immediately and cannot go back.
- Pack: forfeits everything contributed. Folded player stays in the call.
- Side show: seen player only; target must be the previous active player and also seen; only while 3+ players remain. Requester first pays the chaal cost. Target accepts or rejects within 15 s (timeout = reject). On accept the server compares privately and the lower hand is packed; **tie: requester packs**. Neither hand is shown to the table.
- Show: only when exactly 2 players remain. A blind player may not call Show against a seen player (host toggle, default on). Requester pays the chaal cost. **Tie: requester loses.**
- Pot limit: default 100 × boot. When reached, all remaining players reveal and the best hand wins. A tie splits the pot equally.
- Last player standing wins without showing. Cards stay hidden unless the host enables "reveal winner cards" (default off).
- Short stack: a player who cannot afford the required bet may go all-in only to call Show when 2 remain (uncalled excess returns). With 3+ remaining they must pack. No side pots in Teen Patti V1.
- Rake: none. Odd chips: remainder goes to the first winner left of the dealer.

## C. Texas Hold'em (items 2, 3)

- Cash-game format, fixed blinds from room config. No blind levels, no tournament in V1.
- 2-8 players. Heads-up: dealer posts small blind and acts first preflop.
- Minimum raise = size of the last full raise. A short all-in below a full raise does not reopen betting.
- Side pots built from contribution levels. Split pots: odd chip goes to the first winner left of the dealer button.
- No straddle, no run-it-twice, no rake. Winner by fold is not required to show.
- A player at 0 chips sits out and may borrow from the banker or receive chips to rejoin. They are never removed automatically.
- Seat counts: Teen Patti starts at 3+; Poker at 2+.

---

## D. Economy and ledger (items 4-9)

- **Source of truth is the transaction table.** `accounts.balance` is a cached value updated in the same DB transaction as the ledger rows, with `CHECK (balance >= 0)` on player accounts. A per-hand invariant check recomputes balances from transactions and alerts on mismatch.
- Accounts: one per player, one banker, one pot escrow per hand. Chips are minted only by explicit events: starting grant on join, initial banker reserve, host reserve top-up (logged).
- **Conservation invariant:** sum of all room account balances (players + banker + pot escrow) = total minted. Debts are obligations, not chips, and are excluded.
- Banker defaults: reserve 50,000. Presets 1,000 / 2,500 / 5,000. Max outstanding per player = 2 × starting chips. No interest, no due date.
- Reserve exhausted: borrow is rejected with a banker message. Host may top up the reserve.
- Forgiveness: a lender may forgive a debt. It is a ledger entry type with no chip movement.
- **Mid-hand rule:** a player still in an active hand cannot send, receive, borrow, repay or accept requests. The server rejects with "after this hand". Folded players and non-participants may transact.
- Leaving with debt: debt stays attached to the guest identity for the life of the room. When the room closes, outstanding debts void; the ledger remains as history. Chips do not carry across rooms in V1.
- Compensating transactions only; never delete or edit ledger rows. Idempotency key on every transfer.

## E. Identity and security (items 10-12)

- Guest identity: on first join the server issues a 256-bit random token in an httpOnly, secure, same-site cookie, bound to one participant in one room. Display name is never identity. Reconnect requires the token. Kick revokes the token and blocks that guest for 10 minutes.
- Invite: link token with 128 bits of entropy; optional short code (8 chars from a 32-symbol alphabet) with strict rate limits and host approval toggle.
- Host: creator holds host role. After 60 s disconnected, host migrates to the longest-connected player. The original host does not auto-reclaim; the current host can hand it back.
- Spectators: off by default. When enabled, up to 4. They see the grid (receive only), publish nothing, see no private cards, and cannot transact. They take a seat when one opens. Spectator is a participant role in the data model.
- **Non-goals (explicit):** preventing players from sharing cards by voice or a second device; preventing screen recording by participants. Platform never records video.

## F. Media (items 13, 14, 15, 22)

- Camera and mic are required to hold a seat. There are no mute or camera-off controls in a seat.
- Privacy and break path: a player may **move to spectator** (no publishing) or **sit out** between hands. Camera is still required while sitting out.
- Mid-hand track loss: the hand continues; game state is independent of media. Tile shows a reconnecting state. If not restored within 20 s the player is sat out at the next hand boundary. Never kicked automatically.
- Publish: 720p/30 for 4 or fewer tiles, 360p on mobile and for 5+ tiles. Simulcast and adaptive subscription on; offscreen/tiny tiles use the lowest layer. Max 8 publishers.
- Minimum supported viewport: 360 × 640 portrait, 640 × 360 landscape. Below that, show an "enlarge or rotate" notice. Minimum mobile tile 88 × 66 px.
- Audio: game sounds are short local assets (not a media track), low volume, ducked while anyone speaks, mutable in settings. Echo cancellation and noise suppression on; recommend headphones in the join flow.

## G. Layout consistency (item 18)

- Video tiles occupy at least 80% of the viewport at all times. Pot and community cards sit in a reserved band between tile rows (desktop) or above the action tray (mobile), and may overlap tile edges, never faces' centers.
- Revised statement: "video dominates; overlays are lightweight" replaces the fixed 85-95% number.
- The external "UX/UI Design Taste" and similar skills are **optional references only**. The Project UI Constitution in the playbook is authoritative. No mandatory third-party skill.

## H. Host controls, timers, data (item 19)

- Host can: kick, start/pause between hands, change settings between hands only, force sit-out, toggle spectators, hand over host, top up banker reserve, close room. Host cannot mute others.
- Timers (host-configurable where noted): turn 30 s (15/30/45/60); side-show response 15 s; result display 5 s; between hands 8 s; seat hold on disconnect 120 s.
- Timeout behavior: Teen Patti auto-pack; Poker check if free, else fold. Two consecutive timeouts put the player in sit-out.
- Retention: hand history and ledger kept 30 days after the room closes; rooms expire 24 h after last activity. Card-level audit records live in a restricted store, 30 days, never in ordinary logs.
- Folded players' cards become visible in history only after the hand completes.

## I. Legal (item 20)

- 18+ self-attestation before create/join; play-money disclaimer in room and footer; terms and privacy pages before public launch. No real-money path. No geo-blocking in V1 (invite-only rooms). **OWNER:** have counsel confirm before any public launch.

## J. Non-functional targets (item 21)

- Browsers: latest 2 versions of Chrome, Edge, Firefox; Safari 17+ (desktop and iOS); Chrome on Android.
- Latency (same region): game action round trip p95 under 250 ms; server action processing under 50 ms; media glass-to-glass p95 under 400 ms.
- V1 capacity: 50 concurrent rooms, 400 concurrent participants, single region. Availability goal 99% best effort.
- Performance: room route JS under 300 KB gzipped (excluding video SDK), no long tasks over 100 ms during deal animation.
- **OWNER:** monthly infrastructure budget ceiling (not set here).

---

## Next steps

1. Owner reviews this file and marks anything to change.
2. Revise both .docx files so they match (phase list, Teen Patti rules, economy rules, layout statement, remove the mandatory design skill).
3. Add `AGENTS.md` pointing at the docs and this file; then start Phase 0.
