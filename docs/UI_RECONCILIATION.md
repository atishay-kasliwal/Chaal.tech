# UI changes to reconcile with the private club work

Two sessions changed this repo at the same time:

- **Table session**: table look, chips, seats, player panel, balance privacy, chip requests, start/invite flow.
- **Club session**: Google sign-in, member profiles and characters (see `PRIVATE_CLUB_EXECUTION_PLAN.md`).

This lists everything the table session changed, where it overlaps with the club work, and what to decide. Status as of 15 Oct 2026, while the club session was still in progress. Re-check the "Overlap" column once it is finished.

Status key: **Keep**: independent of sign-in. **Kept by club**: club session already merged it. **Decide**: needs a call. **Superseded**: replaced by sign-in, can be removed.

## 1. Start and join flow

| Change | Files | Overlap with club work | Status |
|---|---|---|---|
| Removed the "Take a Seat" name form; rooms seat you automatically | `[roomName]/+page.svelte`, deleted `UsernameForm.svelte` | Club seats you under your club nickname instead of a typed name | Kept by club |
| Fixed auto-join never retrying (effect stopped tracking `autoJoinAttempts` and `socket.connected`) | `[roomName]/+page.svelte` | None; the club version keeps the fix | Kept by club |
| After 5 failed join attempts, toast and go back to `/create-room` | `[roomName]/+page.svelte` | None | Keep |
| Invite link opened with no saved name → Start panel "Your seat is waiting" join mode (`?join=<code>`) | `StartPanel.svelte` | Club members always have a nickname, so the "no name" case may never happen | Decide: keep for the copy, or drop the `?join=` redirect |
| Email invites from the Start panel: addresses staged in session storage, sent once seated | `StartPanel.svelte`, `player-name.ts` (`stageInviteEmails`, `takeInviteEmails`), `[roomName]/+page.svelte` | Club may want invites to go to members, not free email addresses | Decide |
| Name helpers `savedName`, `saveName`, `stageJoinName`, `pendingJoinName` | `player-name.ts` | Replaced by `club.member.nickname`; `savedName`/`pendingJoinName` are already unused | Superseded: delete the unused helpers |

## 2. Table look (no club overlap)

| Change | Files | Status |
|---|---|---|
| Racetrack table tilted into perspective (20° desktop, 14° phone), wooden edge, floor shadow | `TeenPattiTable.svelte` | Keep |
| Padded leather rail with stitching, wood trim, textured felt, printed betting line, overhead lamp lighting | `TeenPattiTable.svelte` | Keep |
| "chaal.tech" stamped into the rail at the top right (follows the curve on phones) | `TeenPattiTable.svelte` | Keep |
| Player tiles: brushed-gold bezel, glass sheen, shadow on the felt | `TpSeat.svelte` | Keep |
| Name tag moved into the tile's top-right corner with a chip icon; turn clock just below it | `TpSeat.svelte` | Decide: the club adds character avatars, which may belong in or replace this tag |
| Recent-actions feed moved from under the pot to the top-left corner | `TeenPattiTable.svelte` | Keep (checked on desktop and phone) |

## 3. Chips

| Change | Files | Status |
|---|---|---|
| `ChipStack`: real chips lying on the felt (PROBO artwork face, striped rim, gloss, contact shadow) | `src/lib/components/ChipStack.svelte` | Keep |
| One stack per denomination with a ×N count badge; stacks drawn up to 5 high (bets 4) | `ChipStack.svelte` | Keep (checked on desktop and phone) |
| Pot uses smaller chips (`spread={4}`) so it reads as a pile | `TeenPattiTable.svelte` | Keep |
| Bet markers, pot and flying chip use the PROBO chips | `TpSeat.svelte`, `TeenPattiTable.svelte` | Keep |
| `CasinoChip` component, chip SVGs, `/test-chips` preview, zip | from a separate chip session | Decide: keep `/test-chips` as a design page or remove it before release |

## 4. Your panel (bottom dock)

| Change | Files | Status |
|---|---|---|
| Smaller panel so the table and friends get more room | `ActionDock.svelte` | Keep |
| Your cards drawn 1.6× and rising out over the panel's top edge | `ActionDock.svelte` | Keep |
| Name on its own line, "You" badge removed | `ActionDock.svelte` | Decide: club may want the avatar here |

## 5. Game rules and server

| Change | Files | Overlap | Status |
|---|---|---|---|
| **Hide my balance**: eye button; others get `balance: null` plus `coversBoot`/`hasChips` flags; choice remembered per device | `engine.mjs`, both servers, `format.ts`, `ActionDock.svelte`, `TpSeat.svelte`, `TeenPattiTable.svelte`, `types.d.ts`; test `balance-privacy.test.mjs` | With accounts, the choice could live on the member profile instead of `localStorage` | Decide where the setting lives |
| **Chip requests**: under 10% of the buy-in, ask a friend for 10/25/50% of the buy-in; the friend gives or declines; chips move balance to balance | `engine.mjs`, both servers, `ChipAsk.svelte`, `ActionDock.svelte`, `TeenPattiTable.svelte`, `types.d.ts`; test `chip-requests.test.mjs` | Club identities make "ask a friend" more meaningful; the club session has also edited `ChipAsk.svelte` | Keep; review the club edits to `ChipAsk.svelte` |
| Hidden balance and chip requests are Teen Patti only (Poker, Blackjack, Rummy unchanged) | — | — | Decide whether other games need them |

Known limit: hiding your balance hides the number, but every bet is public, so someone tracking every bet since the start could work it out.

## 5b. Fixed during the end-to-end check

| Problem | Fix | Files |
|---|---|---|
| "Ask a friend" panel grew the dock and pushed the table into the pot | Panel floats above the dock | `ChipAsk.svelte` |
| Two-player layout: the friend's tile took half the screen and pushed the pot under your hand | Smaller tiles for 1–2 friends; pot kept clear of the rising hand | `TeenPattiTable.svelte` |
| Phone actions feed squeezed beside the top seat (four lines per action) | Phones show only the newest action, as one pill above your hand | `TeenPattiTable.svelte` |
| ×N chip count badge rendered as a large dark oval | Renamed to `chip-count` (a global `.count` style clashed) with a fixed size | `ChipStack.svelte` |

## 6. Open problems

1. **Local play needs sign-in.** The game server refuses sessions without `MONGODB_URI` and `GOOGLE_CLIENT_ID`. Real Atlas is now configured in `.env` / `.dev.vars` (git-ignored). For screenshots, run the Worker in test sign-in mode (`ALLOW_TEST_SIGN_IN=true` + `TEST_GOOGLE_JWKS`) against a throwaway in-memory MongoDB, never the real one: a test sign-in would link the member's email to a fake Google account.
2. **4 failing "original files unchanged" tests**, all on `src/routes/[roomName]/+page.server.ts` (changed by the club work). Add it to the intentionally-changed lists in `tests/server/preservation.test.mjs`, `seat-layout.test.mjs` and `variants.test.mjs`, the same way `UsernameForm.svelte` was added.
3. **Files edited by both sessions**: `StartPanel.svelte`, `[roomName]/+page.svelte`, `ChipAsk.svelte`, `engine.mjs`, `room-object.mjs`, `index.mjs`, `types.d.ts`. Review each before committing so neither side's work is lost.
4. Untracked leftover `src/routes/create-room/+page.svelte.bak` from before both sessions: delete or keep.

## 7. Before committing

- [ ] Club session finished and local test sign-in works
- [ ] Decisions above made
- [ ] Unused name helpers removed from `player-name.ts`
- [ ] Hash tests updated; `npm test`, `npm run check` and `npx eslint .` pass
- [ ] Table checked on desktop and phone in a real bot game
- [ ] Changes split into commits by area (table look, chips, dock, balance privacy, chip requests, club)
