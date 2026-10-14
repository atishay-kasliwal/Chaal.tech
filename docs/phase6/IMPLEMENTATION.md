# Phase 6: responsive mobile play

Phase 6 adapts the Phase 5 table for phones while keeping its Svelte components, DaisyUI controls, colors and card rendering. The game engine, room protocol, player identities and LiveKit lifecycle are unchanged.

## Mobile layout

On portrait phones, the Teen Patti center appears first. Your seat follows directly below it, with the other seats arranged in two columns. With two players, the opponent uses the full row. Compact opponent seats keep their video, balance, hand contribution, card state and connection information visible.

Your existing `GameActions` component is reused in a fixed bottom bar on phone screens. The copy inside your seat is hidden at the same breakpoint, so each action appears once. The bar uses the same See, Pack, Blind/Chaal and Show controls, stake input and legality state as desktop. It remains in the viewport while the player scrolls through the remaining seats. Bottom safe-area padding supports phones with home indicators.

Short landscape screens use the same action bar and compact seat order. The app viewport now includes `viewport-fit=cover` so the safe-area inset can be applied. Desktop and wide-tablet layouts preserve their Phase 5 positioning.

## Files changed

| File | Change |
|---|---|
| `src/lib/components/TableScene.svelte` | Phone portrait and short-landscape seat order and spacing |
| `src/lib/components/MobileActionBar.svelte` | New responsive wrapper reusing the existing game action component |
| `src/routes/[roomName]/+page.svelte` | Renders one mobile action bar for the local player and shares the existing callbacks/state |
| `src/app.html` | Enables phone safe-area layout |
| `scripts/phase6/browser.mjs` | Real multiplayer viewport, reachability and action checks |
| `package.json` | Adds `npm run phase6:browser` |

No new runtime dependencies were added. No game, variant, networking or media modules changed.

## Verification

The browser run creates actual rooms with two through six independently authenticated players. At 390px portrait, every viewer has the table first, their own seat directly after it, a visible in-viewport action bar, no horizontal overflow, and a successful mobile bet. Six-player checks also cover 320, 360 and 430px portrait widths and 844×390 landscape. The bar is the only visible copy of the local action controls on mobile. This verifies browser viewport behavior; physical iOS/Android rendering and media permission flows remain to be checked on devices.

`npm test` passes all 85 tests. `npm run check` reports zero errors and the three existing landing-page accessibility warnings. `npm run lint` reports the existing nine warnings. `npm run build` succeeds with the existing large-chunk advisory.

See [phone screenshots and browser report](../../visual-baselines/phase6/README.md). Reproduce with the preview on port 5174 and backend on port 8080:

```sh
npm run phase6:browser
```

LiveKit is not required for the layout run; camera-off seats use the same video placeholder as before. Real device camera permission and audio quality still require hands-on phone testing.
