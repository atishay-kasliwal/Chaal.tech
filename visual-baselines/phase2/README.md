# Phase 2 preserved UI verification

The existing six-browser capture sequence passed against the Classic registry integration with no automation errors and no third-party runtime requests. See [browser-report.json](browser-report.json) for checks and capture time. The script retains its historical `phase1-` test-room prefix; these captures ran against the Phase 2 server.

| State | Reference |
|---|---|
| Home | [Screenshot](01-home.png) |
| Card renderer | [Screenshot](02-card-deck.png) |
| Create/join | [Screenshot](03-create-join.png) |
| Six-player waiting | [Screenshot](04-six-player-waiting.png) |
| Six-player blind | [Screenshot](05-six-player-blind.png) |
| Seen | [Screenshot](06-seen.png) |
| Refresh recovery | [Screenshot](07-refresh-resumed.png) |
| Bet | [Screenshot](08-bet.png) |
| Packed | [Screenshot](09-packed.png) |
| Server-calculated winner | [Screenshot](10-server-winner.png) |
| Mobile | [Screenshot](11-mobile.png) |
| Host transfer | [Screenshot](12-host-transfer.png) |

All Phase 1 frontend/static file hashes are unchanged, including theme, components, socket store and card renderer. These functional captures supplement source-preservation tests; they are not automated pixel-difference tests. Random hands and generated room identifiers naturally differ between runs. The six-player blind capture was also visually inspected.

Read the [Phase 2 implementation report](../../docs/archive/phase2/IMPLEMENTATION.md) for the registry boundary, deterministic parity evidence and separately tested seat-recovery correction. Earlier capture directories remain unchanged.
