# Dhoni depth head rig and opt-in table integration

The prototype now uses a custom, bounded **2.5D depth mesh** for small perspective head turns. It reuses the approved front painting and all current eye/brow/lid/mouth parts. There is no new character design, external animation package, model inference, or compiled Cubism/Spine/Rive model.

## Authored geometry

`depth-rig.ts` defines a front-surface relief: cranium/hair, receding ears, cheek volumes, muzzle and a raised nose bridge. A 30×32 grid supplies **1,023 vertices and 1,920 triangles**. The nose, cheeks and ears have different depths, so a turn changes their relative positions. This is not a rigid rectangle rotated around its center.

The source canvas remains 360×360, with a projection center at `(180,140)` and focal distance 650. The approved neutral painting is back-projected through each vertex's depth before rotation:

```text
worldX = (sourceX - 180) × (650 - depth) / 650
worldY = (sourceY - 140) × (650 - depth) / 650
```

The shader rotates this surface in 3D, then projects it back into the canvas. At zero yaw/pitch, registration returns to the original painting. Unit tests check every neutral vertex and verify that the nose's parallax differs from the ear's.

Yaw is limited to **±8 degrees**, pitch to **±4 degrees**. A normal public raise produces about **±6.6 degrees** of yaw. The existing neck-pivot tilt and travel remain restrained. This limited front-surface technique does not expose or invent a full side profile, the back of the head, or unseen anatomy. Those larger views still need the additional art listed in [DHONI_RIG_HANDOFF.md](./DHONI_RIG_HANDOFF.md).

## Independent facial motion

`face-texture.ts` composes the approved portrait and registered eye patches, pupils, eyebrow textures, painted lids and closed-mouth poses into a head texture. It uses the same calibrated eye apertures and pupil footprints as the SVG fallback: **14×16.5px**. Eyelids genuinely close over the pupils; brows and mouth remain independent. The projected mesh carries those features with the turning face.

The shared behavior director still controls the timing. Eyes begin before head yaw, the head follows gradually, and the mouth responds later. New public events interrupt at the current interpolated pose. Nothing reads private cards, hand strength, bot policy, future actions or learned memory.

## Graphics lifetime and performance

`perspective-renderer.ts` draws the head with one WebGL draw call, static geometry buffers and cached texture uploads. Breathing affects the separate body layer and cannot cause a head texture upload. When head pose and facial channels are still, no new head draw/upload is performed. Texture changes resume for actual gaze, blink, brow or mouth changes.

The ten compact source textures still total **278,640 bytes**, with **2,337,824 decoded RGBA bytes** before per-instance surfaces. The depth renderer additionally needs composition canvases, a WebGL texture and color/depth surfaces for each enabled character; source-texture memory is not a complete process-memory estimate. Driver allocations and battery use have not been measured on a physical phone.

Six depth-rendered copies under 4× CPU throttling measured **1.6ms JS callback p95** and **33.4ms browser RAF-gap p95** in this local Chrome run. A 390px viewport with a 150px seat measured **33.4ms RAF-gap p95** and no intervals over 50ms. These are desktop browser/emulation results, not physical-phone FPS or battery measurements.

Missing/unsupported WebGL, a lost graphics context, or a renderer initialization failure falls back to the working SVG face/head renderer. Optional failed mouth art keeps the original mouth without disabling the remaining working channels. Essential facial art failure retains the existing painted-blink/original-mascot fallback chain. GPU buffers, textures and programs are disposed on unmount. The shared clock still suspends hidden/offscreen work and respects reduced motion.

## Local table flag

In development or a release build with `VITE_BOT_PRESENCE_PREVIEW=true`, open an existing room with:

```text
http://127.0.0.1:5188/<room-code>?botPresence=dhoni
```

The room uses its normally configured game backend. The release gate is checked in the table and again in `BotAvatar.svelte`; the query flag can enable the new renderer **only for `bot-ms-dhoni`**. A build without the release flag cannot enable it, and an unflagged room uses the existing mascot. The renderer is dynamically imported only for the enabled seat. Other bots and human mascots keep their existing paths.

`TeenPattiTable.svelte` sends an explicit public subset: feed entries, hand ID, active-player/turn identity and seat/pot geometry. `TpSeat.svelte` forwards that subset; no `RoomData` or `User` object is passed into the animation component. `TablePresenceBridge` primes old feed IDs so mounting does not replay old celebrations. It notices fresh public actions, schedules a cosmetic turn cue after attention, cancels stale cues on results/turn changes and handles split winners as one result. Unknown feed fields, narration and private metadata are discarded.

The enabled portrait is fit to the actual seat width and centered on its painted face/jersey content, so small phone tiles keep the full face. It preserves the existing seat-box dimensions. The feature can be turned off without a deployment by removing the query flag; the release remains opt-in for this one character.

## Review and reproduction

- Motion study: <http://127.0.0.1:5188/prototypes/bot-presence>. Depth turning is enabled by default. **Compare flat head** restores the previous layered renderer for comparison.
- Actual seat component review: <http://127.0.0.1:5188/prototypes/bot-presence/table>. Try 150px and 180px widths, the local feature toggle, and the public-hand sequence.
- `node scripts/presence/depth.mjs`: eyes-before-yaw, left/right turns, neutral return, real blinking, stillness caching and six-mesh performance.
- `node scripts/presence/table.mjs`: actual seat sizing, public feed/turn/result bridge, phone viewport, frame timing and lost-context fallback.
- `tests/cloudflare/presence.test.mjs`: plays a real hand through the local Worker and the actual room UI. It verifies the public result reaches Dhoni's renderer and that the same unflagged room uses the existing mascot.

Saved artifacts include `depth-{neutral,right,left,blink}.png`, `depth-results.json`, `table-{desktop,phone,win,loss}.png`, `table-results.json`, `live-table-{desktop,phone}.png` and `live-table-results.json` in `/private/tmp/chaal-presence-review/`. The integrated browser recording is `dhoni-complete.mp4` in the same directory.
