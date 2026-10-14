# Phase 5 browser evidence

The captures document both the incremental extraction checkpoint and the final layout. They were made against the local app with isolated browser sessions; synthetic media devices are used for LiveKit checks.

| Run | Report and references |
|---|---|
| Original panels after component extraction, before layout change | [Browser report](extracted-grid/browser-report.json) and [six-video game](extracted-grid/04-six-video-game.png) |
| Final table, two through six players, every viewer at bottom center | [Layout report](layout/browser-report.json), [six-player desktop](layout/6-players-desktop.png), [packed and refreshed](layout/6-players-packed-refresh.png), [six-player narrow fallback](layout/6-players-narrow-fallback.png) |
| Six-player LiveKit and game actions | [Media report](media/browser-report.json), [six-video game](media/04-six-video-game.png), [winner with media](media/08-winner-with-media.png) |
| Original Classic flow and same-room Classic/Muflis switch | [Classic report](classic/browser-report.json), [variant switched](classic/13-variant-switched.png) |

The layout driver checks counts 2–6 at 1440, 1280, 1100, 800 and 390 CSS pixels for seat identity, geometry, overflow, keyboard betting, contribution display and packing. The media run verifies six actual LiveKit participants, decoded video, unique remote audio ownership, permission failures, refresh and media interruption. The Classic run verifies private hands, recovery, betting, settlement and switching the next hand's variant without changing room identities or seats. Each report lists its full checks and has an empty `errors` array.

The narrow captures show the Phase 5 stacked/two-column fallback with the existing aesthetic. Phase 6 adds the dedicated mobile action layout documented in [its evidence index](../phase6/README.md). Earlier reference directories remain unchanged.
