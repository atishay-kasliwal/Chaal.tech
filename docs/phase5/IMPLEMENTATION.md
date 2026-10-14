# Phase 5: evolve the original player panels into a social table

This phase changes the room presentation and adds a server-owned per-hand contribution counter for the requested bet display. Existing chip movement, turn and winner logic remain unchanged. Classic and Muflis rules, networking, persistence, session store, LiveKit controller, global theme and original PlayingCard renderer are retained.

## Experience

The existing gold-on-dark-green Teen Patti presentation is retained. Player panels now sit around a central game area containing the original animated pot/stake/player-count strip, a variant label and turn status. The existing server-calculated winner component is reused centrally after settlement. This is still three-card Teen Patti; there are no invented community cards or Poker rules.

Every viewer sees their own seat at bottom center on desktop. The remaining seats follow physical seat order clockwise around the table. Camera-off placeholders keep seat geometry stable when media is disabled; joining media fills the same seat rather than introducing a separate video meeting layout.

| Players | Desktop positions, beginning with the viewer |
|---|---|
| 2 | Bottom, top |
| 3 | Bottom, upper left, upper right |
| 4 | Bottom, left, top, right |
| 5 | Bottom, lower left, upper left, upper right, lower right |
| 6 | Bottom, lower left, upper left, top, upper right, lower right |

Server seat numbers do not change. Turn, Pack, refresh, temporary disconnect and media state changes do not rotate players into new seats. Between hands, an actual change in the roster can redistribute other seats for the new count; the viewer stays bottom center.

The local player's See, Blind/Chaal, stake input, Pack and Show controls remain attached to that player's seat. Names truncate visually with a full-name tooltip, and balances, hand contributions, connection state, blind/seen state and the active-turn marker remain visible. Cards retain the original renderer and hover animation at a smaller table size. Passive cards no longer pretend to be keyboard action buttons; keyboard betting uses the actual existing controls.

Packed presentation now covers only the card fan. It no longer masks the player's face, name or microphone status. Audio has the same single owner in the unchanged RoomMedia component, so repositioning video creates no duplicate remote audio elements.

The existing settings form is retained: initial setup still precedes the waiting player list; after a hand, next-hand settings appear below the table. Only the host can start or select the next hand's variant as before.

## Reuse before layout changes

The original player block was first extracted into PlayerSeat, CardFan and GameActions without changing the grid's rendered structure. A real six-player media/browser run then passed with the original grid, including permission failures, refresh, bets, Pack, Show and cleanup. The intermediate references remain in `visual-baselines/phase5/extracted-grid/`.

The extracted six-video grid was visually compared with the Phase 4 reference. This was a visual review plus functional checks, not automated pixel comparison; generated room names and synthetic video frames differ naturally.

Only after that checkpoint were the panels compacted and repositioned with TableScene. The original pre-extraction room source is retained in [phase4-room.svelte.txt](phase4-room.svelte.txt), and a frozen SHA-256 manifest in `tests/fixtures/phase4-preservation.json` verifies its provenance and the unchanged existing modules.

## Files and responsibilities

| File | Decision | Responsibility |
|---|---|---|
| Existing room page | Refactor narrowly | Retain room lifecycle, handlers, settings and media ownership; compose the new presentation |
| `src/lib/components/PlayerSeat.svelte` | Extract and extend | Existing panel, identity, balance, connection state, active marker, video/cards and controls |
| `src/lib/components/CardFan.svelte` | Extract and extend | Original private/revealed card logic and renderer; compact fan and card-only Pack mask |
| `src/lib/components/GameActions.svelte` | Extract | Existing controls, labels, legal-action gates and callbacks; no new game rules |
| `src/lib/components/TableScene.svelte` | Add | Minimal CSS grid, seat slots and center snippet |
| `src/lib/seat-layout.ts` | Add | Pure presentation rotation and 2–6-player position mapping |
| Existing PlayingCard, RoomMedia, SeatVideo, socket store and global CSS | Keep unchanged | Same renderer, media lifecycle, identity and visual tokens |
| `server/engine.mjs` | Extend minimally | Add `handBet` initialization, increments, invariants and recipient projection; retain existing betting/settlement math |
| Existing room types | Extend | Add public nullable `handBet` field |
| All other existing server files | Keep unchanged | Same authority, networking, persistence and media admission |

No dependencies, new endpoints, database migration, new design system, repository reorganization or media lifecycle changes were needed. The backend change is limited to the contribution field; the frozen source hash still matches after removing only the newly added lines containing `handBet`.

## Desktop and narrow-screen boundaries

At widths of 1100 CSS pixels and above, named grid slots surround a central oval using the existing theme colors, borders and typography. The compact seats place video and cards side by side. The viewer's controls sit below their own cards/video.

Below that breakpoint, the center appears first, the other seats use a two-column grid, and the viewer's seat follows them at the bottom. Below 640 pixels, seats stack in one column. This is a safe fallback using the same components. It is not the dedicated one-handed mobile experience planned for Phase 6. Short desktop viewports may require vertical scrolling; the implementation does not shrink controls to force everything into a fixed viewport.

Layout verification checks actual bounding rectangles, center/seat separation, unique slots, self alignment and horizontal overflow across desktop and narrow widths. A narrow-screen check caught the existing Turn badge projecting beyond the panel; the extracted badge now stays inside the seat edge.

## Scope limits

The original protocol had no per-player wager field. The new **Hand bet** displays the server's cumulative contribution for this hand, including the boot, Blind/Chaal and any paid Show fee. It is not the most recent individual bet. It remains visible after Pack and settlement and resets at the next deal. New rooms initialize it to zero; persisted older hands with no counter display “—” until the next deal rather than guessing historical contributions. Existing SQLite snapshots preserve the optional field without a schema migration.

The counter never authorizes bets, moves chips or decides winners. Additional invariants require nonnegative integer contributions and, for active hands with known counters, equality with the pot. Tests cover both variants, duplicate requests, restart recovery, Show fees, resets and legacy snapshots. Frozen Classic replay expectations remain unchanged: only this additive field is removed before comparing every prior state/private-view field and ledger movement.

No dealer badge is invented: the current engine has an initiator/host, not a separately modeled rotating dealer.

Media setup and production admission limitations remain as documented in [Phase 4](../phase4/IMPLEMENTATION.md). The perimeter layout does not make the local server production-ready, expose it for remote friends, or change self-hosted token revocation behavior.

## Verification and review

All **85 automated tests** pass, including unchanged Classic golden expectations for all pre-existing fields, exhaustive Classic/Muflis ranking checks, authority/privacy tests, hand-contribution tests, media lifecycle/admission tests, pure seat-order tests for every viewer at counts 2–6, sparse-seat/presence stability and source-preservation checks. Lint and type checking pass with the existing nine lint warnings and three landing-page accessibility warnings; the production build passes.

Browser checks cover two through six independently authenticated players, each viewer's bottom seat, long player names, keyboard betting, server-reported contributions, stable positions after Pack, card-only Pack masking, refresh and geometry at widths 1440, 1280, 1100, 800 and 390. A separate real LiveKit run checks six decoded videos and five unique remote audio elements per browser alongside the same game controls. The original Classic browser flow also passes, including switching to Muflis for the next hand in the same room.

Evidence is saved in [visual-baselines/phase5](../../visual-baselines/phase5/README.md). Prior phase captures remain unchanged. Reproduce with the game server on 8080 and production preview on 5174:

```sh
npm test
npm run lint
npm run check
npm run build
npm run phase5:browser
CAPTURE_DIRECTORY=visual-baselines/phase5/media npm run phase4:browser
```

The media run additionally needs the local development LiveKit server on port 7880. It uses synthetic devices, not the user's hardware. The layout test does not request camera or microphone permission.

Open `http://127.0.0.1:5174/create-room`, join as two players using separate browser profiles, then start a game to see the table. More independently authenticated players fill the remaining positions. Phase 6 extends these same components for phone layouts and reachable controls; see the [mobile implementation report](../phase6/IMPLEMENTATION.md).
