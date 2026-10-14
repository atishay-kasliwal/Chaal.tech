# Phase 6 mobile evidence

The browser driver uses actual multiplayer room state with synthetic identities and no camera permission. It checks 2–6 players at 390px portrait and six players at 320, 360, 390, 430px portrait plus 844×390 landscape. It verifies the table comes first, your seat follows it, fixed actions fit in the viewport, the inline duplicate controls are hidden, there is no horizontal overflow, and a mobile bet reaches the server.

| State | Capture |
|---|---|
| Two-player portrait | [390px](2-players-mobile-390.png) |
| Six-player portrait | [390px](6-players-mobile-390.png) |
| Six-player landscape | [844×390px](6-players-mobile-landscape.png) |

Full per-count checks are in the [browser report](browser-report.json). The screenshots are taken after transient toast messages clear. These are browser viewport checks; physical iOS and Android permission prompts and media quality still need device testing.
