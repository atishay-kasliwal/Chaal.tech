# Execution Plan

Order of authority: DECISIONS.md, then the two specs, then this plan. This plan sequences the work; it adds no product rules.
Sizes are relative effort for a small team or agent pairs: **S** under 2 days, **M** 3-5 days, **L** 1-2 weeks, **XL** over 2 weeks. They are estimates, not commitments. Re-estimate after Phase 1.

## Assumptions (correct me if wrong)

- Small team or solo owner working with coding agents; one phase in flight at a time.
- Stack as in the spec: TypeScript monorepo, React/Vite, Node game server, PostgreSQL, LiveKit.
- V1 goal: six friends play in a private room (spec section 20). No public launch in V1.
- Teen Patti is the lead game; Hold'em follows.

## Working rules

1. Merge in phase order. Each phase ends only when its exit gate passes (DECISIONS.md section A).
2. Small PRs: one concern each (never schema + UI redesign + rules in one PR). Every PR lists scope, test evidence, screenshots for UI, migration and rollback notes.
3. Tests precede engines. Rules in DECISIONS.md become failing tests first.
4. Anything not decided in DECISIONS.md is a question to the owner, not a coding choice.

## Phase P: Pre-work spikes (before Phase 0 merges)

Docs and throwaway code only. Nothing here ships. Output goes to `docs/spikes/`.

| Spike | Question answered | Size | Done when |
|---|---|---|---|
| S1 poker-engine-ts evaluation | Does it satisfy DECISIONS.md section C (min-raise, short all-in, side pots, odd chip, heads-up blinds)? Can it sit behind our `CardGame` contract? | M | Written verdict plus a test table of pass/fail per rule |
| S2 Teen Patti engine shape | Can poker-engine-ts's rules-as-data express Teen Patti? If not, what do we copy (event log, reducer, replay)? | S | Decision recorded: reuse descriptor, or own reducer using its pattern |
| S3 Teen Patti test spec | Every rule in DECISIONS.md section B as a named test case with inputs and expected outcome | M | Reviewed by owner against how the group really plays |
| S4 LiveKit sizing | Cost and limits for 8 publishers, simulcast, mobile; iOS Safari behavior | S | Numbers plus a go/no-go on hosted vs self-hosted |
| S5 Layout feasibility | Can 8 tiles fit 360x640 with action tray and overlays? | S | One HTML fixture, screenshots |

Gate: owner signs off S1-S3 results. If S1 fails on core rules, Hold'em becomes an in-house engine and Phase 8 grows from L to XL.

## Phase 0: Foundation (M)

Tasks: monorepo (pnpm workspaces, Turborepo or equivalent), strict TS config, ESLint/Prettier, Vitest, Playwright skeleton, env validation, CI (typecheck, lint, unit, build), design tokens package, deployment skeleton with preview environments, `AGENTS.md` wired to the docs.
Gate: CI green on an empty app; preview URL works; no product features.

## Phase 1: Static UX proof (L)

Tasks: layout engine for 2-8 tiles (desktop, mobile portrait, mobile landscape), 100dvh room route, fake video tiles with active speaker, blue card component and back, pot/community overlay band, contextual action tray, banker tile and borrow popover mock, fixture routes for every player count and state (loading, reconnecting, failure).
Gate: screenshots at 2/4/6/8 players on desktop and mobile approved by owner; zero scroll; anti-AI review table passes.
Risk: layout takes longer than estimated (see R1). Owner approval is the real gate, so schedule it.

## Phase 2: Identity + Rooms (M)

Tasks: create/join API, guest token issue and verify, invite link only (no short codes) with rate limits and revoke/regenerate, join flow UI (name, device preview, consent, 18+ attestation), room lifecycle (created, active, closed, expired), host controls, spectator role, kick with 10-minute block, host migration after 60 s.
Gate: tests for reconnect with token, kick, wrong-token rejection, host migration, spectator cap (players + spectators <= 8).

## Phase 3: Database + Ledger (L)

Tasks: migration tooling and first schema (rooms, participants, accounts, transactions, debts, chip_requests, hands, game_actions), transfer service with row locking and idempotency keys, pot escrow accounts, mint events, balance-vs-ledger invariant checker, history queries.
Gate: conservation property test (thousands of random transfers), concurrent transfer test, duplicate key test, negative balance rejected, fresh and upgrade migrations pass.

## Phase 4: Live video (L)

Tasks: LiveKit server setup, token service tied to participant identity, camera/mic gate and permission-denied states, presence, active speaker, simulcast and adaptive subscription, track-loss handling (20 s grace, sit-out at hand boundary), spectator receive-only, reconnect UI naming what is reconnecting.
Gate: 6+ real or synthetic participants stable for 30 minutes on desktop and mobile; permission denial and device change handled.

## Phase 5: Realtime protocol (M)

Tasks: shared versioned event schemas (runtime-validated), WebSocket gateway, connection identity from guest token, snapshot on connect, sequence numbers and resync, duplicate and stale event handling, per-connection private channel for private state.
Gate: stale client, duplicate event, reconnect and out-of-order tests pass before any game rules.

## Phase 6: Card core (M)

Tasks: deck, cryptographically secure shuffle with injectable seeded RNG for tests, public/private state split, deal and flip event model, deal animation.
Gate: test proves no connection other than the owner ever receives private cards; deterministic replay of a shuffled deal.

## Phase 7: Teen Patti Classic (XL)

Sub-slices, each its own PR chain:
1. Hand ranking and comparison (all ties, A-K-Q / A-2-3 ordering).
2. Stake model: boot, blind/seen, chaal, raise, 16x cap.
3. Pack and last-player settlement through the ledger.
4. Show (2 players), tie rule, pot-limit forced reveal.
5. Side show request/accept/reject/timeout/tie.
6. Short-stack rules.
7. Turn timers and timeout actions, sit-out after two timeouts.
8. UI wiring: action tray legality from server, private cards, animations.
Gate: seeded simulation of thousands of hands with chip conservation; every S3 test passes; E2E hand completes in the UI.

## Phase 8: Texas Hold'em (L, XL if S1 fails)

Tasks: wrap or build the engine behind `CardGame`; blinds and button; streets; legal actions; all-in; side pots; showdown; odd-chip rule; UI.
Gate: side-pot and showdown matrix passes; simulation with chip conservation.

## Phase 9: Banker (M)

Tasks: borrow with presets and cap, repay full or partial, reserve exhaustion handling, host top-up (logged mint), scripted comment templates and triggers, banker tile wiring.
Gate: no negative or duplicate transfers; debt reconciles with ledger.

## Phase 10: Social lending (M)

Tasks: gift, loan, request, accept/reject, repayment, forgive, debt view, mid-hand transfer lock with "after this hand" message.
Gate: concurrent and idempotency tests pass; lock tested at every hand state.

## Phase 11: Variations (L)

Tasks: Teen Patti strategy registry; implement prioritized variants one at a time with isolated rule tests. Variants and order are an **owner decision** (spec lists many).
Gate: each variant passes its own rule tests; Classic unchanged.

## Phase 12: Polish + hardening (L)

Tasks: audio cues with ducking, chip and card motion, folded-state treatment, winner moment, host-migration and timeout edge cases, rate limits, accessibility pass, performance budget, load test (10 rooms / 80 participants), failure injection (kill game server mid-hand, drop DB).
Gate: load and failure tests pass; a11y checks pass; budgets in DECISIONS.md section J met.

## Phase 13: Production release (M)

Tasks: production DB with backups and a tested restore, secrets in the deploy store, observability and alerts (ledger invariant, reconnect rate), health checks that verify readiness, runbook, rollback rehearsal, staging soak.
Gate: soak complete, migration dry run complete, rollback rehearsed, owner approval.

## Critical path and parallelism

```
P spikes -> 0 -> 1 -> 2 -> 3 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 12 -> 13
                      \-> 4 (video) joins before 7's UI wiring
11 (variations) can slip past V1 without blocking 13
```

Phase 4 (video) can run beside Phase 3 or 5 if two people or agents are available, as long as each merges in order. Phase 7's engine slices 1-6 are pure TypeScript and can be built against a seeded RNG while Phase 4 finishes; only slice 8 needs video.

## Risk register

| ID | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | 8-tile layout with overlays does not fit small phones | High | Spike S5 first; set minimum viewport; allow 3-column compact grid |
| R2 | poker-engine-ts fails our Hold'em rules | Medium | Spike S1; fallback is in-house engine, budget XL |
| R3 | Teen Patti rules differ from how the group plays | Medium | S3 review by owner before coding; rules live in config where possible |
| R4 | Video cost or quality on mobile | Medium | S4; simulcast, 360p cap on mobile |
| R5 | Ledger race conditions | Medium | Phase 3 concurrency tests before any game uses it |
| R6 | Agents invent product decisions | High | AGENTS.md; "ask, do not invent" rule; review every PR against DECISIONS.md |
| R7 | Scope creep into variants and animations | High | Variants only after Phase 10; cut list below |
| R8 | Legal exposure from poker-style play-money game | Low-Medium | Invite-only, 18+ gate, no real-money path; counsel review before public launch |
| R9 | Private card leak | Low, severe | Phase 6 gate; never log card values; dedicated leak test in CI |

## Cut list if time runs short (in order)

1. Variations (Phase 11).
2. Banker comment variety (keep borrow and repay).
3. Audio cues and winner effects.
4. Spectators.
5. Host migration polish (fall back to manual hand-over).

Never cut: ledger invariants, private-card separation, reconnect handling, the one-viewport rule.

## Owner decisions needed

- Confirm Teen Patti rules (S3) against how the group plays.
- Prioritize Teen Patti variants for Phase 11.
- Infrastructure monthly budget ceiling.
- Hosted vs self-hosted LiveKit (after S4).
- Counsel review timing, if V1 ever goes beyond friends.

## First ten tasks

1. S3: draft the Teen Patti test spec for owner review.
2. S1: run poker-engine-ts tests and our rule cases in an isolated folder.
3. S2: record the engine-shape decision.
4. S5: one HTML fixture for 8 tiles at 360x640.
5. S4: LiveKit sizing note.
6. Phase 0: monorepo scaffold and CI.
7. Phase 0: tokens package and spacing/radius scales.
8. Phase 0: preview deployment.
9. Phase 1: layout engine with 2-8 fixtures.
10. Phase 1: owner screenshot review.
