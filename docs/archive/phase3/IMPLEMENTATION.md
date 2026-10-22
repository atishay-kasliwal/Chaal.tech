# Phase 3: Muflis in the existing application

Phase 3 adds Muflis without changing the table layout, player cards, action buttons, theme or animations. Classic remains the default, and the existing evaluator is unchanged. No dependencies or database migrations were added.

## Product behavior

Create a room using the existing Join the Table form and choose Classic or Muflis. Joining an existing room always uses that room's server-owned rules; the joiner's form selection cannot override them.

The existing Game Settings panel now offers **Next hand variant**. Only the connected host can choose it and start a hand. The server commits the selected version atomically with the new deal. Other players see a disabled selector. Active hands cannot change rules. After settlement, the room retains the finished hand's rules and winner until the host starts another hand. Selecting a different option locally does not change or reinterpret a completed result.

Switching Classic ↔ Muflis uses the same room, identities, seats, bankrolls, Socket.IO connection and game controls. Ordinary per-hand boot deductions still apply. A Muflis label appears below the existing room heading; Classic keeps the existing heading presentation.

## Exact `muflis-1` rules

This release uses the exact reverse of the app's documented `classic-1` hand ordering. It reverses both categories and comparisons within a category. This is a versioned product rule, not a claim that every Muflis house game uses identical rules. Published descriptions distinguish full reversal from other low-card conventions and recommend explicitly defining ace and sequence treatment. See [TeenPatti.com: Muflis rules and house-rule differences](https://www.teenpatti.com/blog/muflis-teen-patti/).

Strongest to weakest categories:

1. High card
2. Pair
3. Flush
4. Sequence
5. Pure sequence
6. Trail

Within each category, the lower Classic rank vector wins, including kickers. Aces keep their Classic value: they are not globally converted to low cards. Sequences and flushes still count. Classic sequence ordering A-K-Q > A-2-3 > K-Q-J is reversed; 4-3-2 is the strongest Muflis sequence. Mixed-suit 5-3-2 is the strongest high-card hand. Suits do not break ties.

Examples:

| Hands | Muflis winner |
|---|---|
| Mixed-suit 5-3-2 versus any pair | 5-3-2 |
| Pair of twos with 3 kicker versus pair of twos with 4 kicker | Twos with 3 |
| K-7-2 versus A-7-2, neither a flush | K-7-2 |
| K-Q-J versus A-2-3, neither a pure sequence | K-Q-J |
| Trail of twos versus trail of aces | Trail of twos |

Everything outside comparison stays shared: three cards, standard 52-card deck, server shuffle, boot, betting bands, blind/seen behavior, Pack, Show eligibility/fees, timeout and winner payment. Equal Show hands still lose for the requester. Folded cards remain hidden, and a last-player win does not reveal a blind hand.

## Small implementation boundary

| File | Change |
|---|---|
| `server/variants/muflis.mjs` | New immutable descriptor; reuse Classic validation/classification, reverse comparison by swapping operands, expose inverse evaluation vectors and rule metadata |
| `server/variants/index.mjs` | Register Muflis alongside Classic; Classic remains default |
| `server/engine.mjs` | Validate optional creation/start rules version, select it only when starting a legal new hand |
| `server/index.mjs` | Forward optional variant argument in the existing create/start handlers |
| `src/routes/create-room/+page.svelte` | Add selector and short rule explanation inside the existing form |
| `src/routes/[roomName]/+page.svelte` | Extend existing settings with next-hand selector and add Muflis heading label |
| Tests and existing browser script | Add Muflis, switching and preservation coverage |

The variant cannot access room state, money, networking, persistence or media. `server/classic.mjs` remains byte-identical to the Phase 1 reference. There is no new room abstraction, lobby system, frontend state store or component replacement.

Both frontend files are checked against their frozen Phase 1 hashes after removing only the documented additive selector/label changes and their command/state wiring. All other 28 frontend/static files retain their exact hashes. The original theme, card renderer, forms, player grid and controls are retained.

## Protocol, authority and recovery

The existing commands accept optional trailing version arguments before their unchanged command metadata:

```text
createRoom(name, startingChips, optionalRulesVersion, commandMetadata)
start(roomName, cutAt, cardsToDeal, optionalRulesVersion, commandMetadata)
```

Omitting a creation version preserves Classic. Omitting a start version preserves the room's current version, maintaining compatibility with existing clients. Unknown versions or invalid value types are rejected by the server. Versions remain stored in the existing `rulesVersion` snapshot field; no schema change is needed.

Start requires host membership, no active hand, matching revision/hand ID and an allowed version. Identity, command receipts and the existing atomic snapshot/ledger commit are reused. Simultaneous conflicting start requests commit only once; retries cannot deal twice or charge another boot. Join/other actions cannot rewrite rules. Direct client winner selection remains forbidden.

Persisted Classic and Muflis hands resume after restart with the same cards, version, identity, chips and receipts. The existing single-process server limitations from Phase 1 still apply.

## Verification

| Check | Result |
|---|---|
| `npm test` | 59 tests pass |
| Classic characterization | All 22,100 evaluations, 132,600 anchor comparisons and 228 captured transitions unchanged |
| Muflis characterization | All 22,100 evaluation vectors and 132,600 anchor comparisons are the exact Classic inverse |
| Shared infrastructure | Equivalent dealing, privacy, betting, turns, Pack settlement and ledger effects for 2–6 players |
| Switching | Both directions, host-only authorization, invalid versions, mid-hand rejection, unchanged seats/chips and simultaneous requests |
| Real Socket.IO | Six-client privacy and authoritative duplicate Show settlement for both variants |
| Durable restart | Same hand/version and idempotent bet recovery for both variants |
| `npm run lint` | Zero errors; nine existing frontend warnings |
| `npm run check` | Zero errors; three existing landing-page accessibility warnings |
| `npm run build` | Passed with existing accessibility warnings |
| Six isolated Chrome users | Both variants, including next-hand switching; evidence linked below |

Anchor comparisons are not exhaustive comparisons of every pair of physical hands. Exhaustive hand-vector checks, explicit independent rule examples, existing Classic golden traces and real server/browser settlement tests provide complementary evidence.

Browser captures and reports are saved separately in [visual-baselines/phase3](../../visual-baselines/phase3/README.md). They verify the existing flow, refresh recovery, private wire views, selected-variant winner calculation, host controls, switching, chip conservation and mobile form fit. Source hashes verify preservation; screenshots are not automated pixel-difference tests.

## Running and reviewing

Run `npm run server` and `npm run dev` in separate terminals. The reviewed production preview uses `http://127.0.0.1:5174/create-room`. Choose Muflis, invite friends using the same room URL, join and start. Between hands, the host can choose Classic and start again without recreating the room.

To reproduce browser evidence, build, start the backend on port 8080 and preview on port 5174, then run each sequentially:

```sh
CAPTURE_DIRECTORY=visual-baselines/phase3/muflis VARIANT_RULES_VERSION=muflis-1 node scripts/phase1/browser.mjs
CAPTURE_DIRECTORY=visual-baselines/phase3/classic VARIANT_RULES_VERSION=classic-1 node scripts/phase1/browser.mjs
```

No LiveKit, additional variants, redesign or deployment is included. Phase 4 is additive media integration into the existing player presentation; the game must continue working independently of media availability.
