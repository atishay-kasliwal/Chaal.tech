# Phase 8: Room lobby and invites

Phase 8 extends the current create-room, room and waiting-table screens. It does not introduce a new screen system or replace the game table.

## Player flow

1. Create a room with its room code, starting-chip amount and initial variant, or open a friend's room link.
2. Enter a player name and join the existing room.
3. Use the optional camera/audio controls to preview media. Media permission or availability does not gate the game.
4. Review the seated players, host, online state, chip balances and readiness.
5. Mark yourself ready. The host can start after at least two connected players with chips are ready.
6. The host may select a variant and starts the hand using the existing game settings panel.

After a hand finishes, all players must confirm readiness again before the next hand. A disconnect removes a player's effective readiness for the start gate because the server counts only currently connected players.

## Implementation

- The existing `UsersTable.svelte` now renders physical seat number, host marker, connection status and ready status while preserving its table, balance and net columns.
- The existing room route provides an invite button that copies the room URL. Room name remains the join code and opening a link still passes through the normal room-existence and membership checks.
- `ready` is a server command. The pure room transition stores readiness; the server refuses a start unless every connected, funded participant is ready. Readiness resets at hand start. The client button is only a convenience; the server check is authoritative.
- `RoomMedia.svelte` already provides camera/audio preview and remains optional. Its own permission and disconnect behavior does not change game state.
- Initial variant and starting chips remain selected in the existing create-room form. The host can choose a different variant for a subsequent hand in the existing settings panel. Starting chips are shown in the lobby.

## Files changed

- `server/engine.mjs`, `server/index.mjs`: ready transition, projection and authoritative start validation.
- `src/routes/[roomName]/+page.svelte`: lobby ready controls, readiness count and invite copy.
- `src/routes/[roomName]/UsersTable.svelte`: seat and player status display.
- `src/routes/[roomName]/types.d.ts`: optional readiness fields in room data.
- `tests/server/engine.test.mjs`, `tests/server/service.test.mjs`, `tests/server/preservation.test.mjs`: transition, multi-client readiness and preservation coverage.

## Verification

The test suite covers that a host cannot start alone or while another connected player is unready, and that the hand starts after all eligible connected players mark ready. Existing multi-client privacy, reconnect, chip ledger and variant tests continue to cover the shared room flow. UI type checking and production build validate the extended existing screens.

Starting chips are chosen when the room is created, rather than editable after players have joined. Camera preview remains opt-in; there is no forced permission prompt during room entry.
