# Phase 4: optional media inside the existing UI

The [media browser report](browser-report.json) records six actual LiveKit participant connections using isolated Chrome contexts and synthetic camera/microphone devices. This is a real local SFU/WebRTC test, not six mocked video rectangles. No user's camera or microphone is used by the automation.

| State | Screenshot |
|---|---|
| Camera denied while microphone works | [Image](01-camera-denied-audio-works.png) |
| Microphone denied while camera works | [Image](02-microphone-denied-video-works.png) |
| Six media participants before start | [Image](03-six-media-lobby.png) |
| Six videos inside the existing game cards | [Image](04-six-video-game.png) |
| Audio-only fallback | [Image](05-audio-only.png) |
| Refreshed player reconnects media with same game identity | [Image](06-refresh-media-rejoined.png) |
| Media participant removed; game bet still accepted | [Image](07-media-interrupted-game-bet.png) |
| Server-owned Muflis winner with media | [Image](08-winner-with-media.png) |
| Existing mobile grid with additive media | [Image](09-mobile-existing-grid.png) |

The [no-media report](no-media/browser-report.json) separately runs the existing Classic flow without joining media, including switching the next hand to Muflis. This confirms optional media does not become a prerequisite for playing.

The six-video table and permission-failure captures were visually inspected. Videos use the existing player grid and styling. These references do not claim the future six-seat perimeter layout or dedicated mobile design is implemented. Screenshots supplement deterministic source-preservation tests and are not automated pixel-difference tests.

See the [implementation and local setup guide](../../docs/phase4/IMPLEMENTATION.md), including the exact test boundaries and self-hosted token-replay limitation. Original through Phase 3 capture directories remain unchanged.
