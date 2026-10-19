# Dhoni bot presence prototype

Open <http://127.0.0.1:5188/prototypes/bot-presence> with the local Vite server running. This is a single-character review, using the existing Dhoni artwork and the game's existing visual style. The single-character preview is enabled locally and in release builds made with `VITE_BOT_PRESENCE_PREVIEW=true`; otherwise the review routes return 404. On a real table, `?botPresence=dhoni` explicitly opts into the new renderer for Dhoni only. Unflagged tables, other characters, game rules, bot policies and the original mascot fallback keep their existing behavior. No production data migration is required.

## What is working

- Independent painted pupils in clean eye sockets, with the approved **14×16.5px** footprints on the 360px portrait canvas. Travel stays within ±4.5px horizontally and ±2.2px vertically.
- Continuously closing/reopening eyelid apertures over painted closed-lid shading. Blinking preserves the current gaze.
- Separate painted eyebrows, with the attended side reacting more strongly.
- The approved head/hair move over a clean neck overlap, with bounded depth-based perspective turns. Nose, cheeks and ears move at different depths. Eyes lead the head; pupils partly recenter as it catches up.
- Two new painted closed-mouth poses: a restrained smile and a calm, composed expression. They blend over the mouth region only; neutral restores the approved original mouth. Expressions follow the head's attention, rather than arriving with the eyes.
- Very subtle body-only breathing, with a slower exhale and a quiet rest after each cycle. The head and neck do not bob.
- Four quiet idle variations, long still periods, randomized timing and independent cosmetic streams for each instance.
- Public-event reactions that can interrupt each other from the current interpolated pose and settle smoothly to neutral.
- Pause, reduced motion, offscreen suspension, background suspension, original-mascot comparison and six-copy performance review.
- Compact runtime textures; no new animation runtime dependency, inference service or gameplay network requests.

**Play a hand** runs a public-event animation simulation; it does not play against or change the game engine. Manual controls cover every reaction. **Win** and **Lose** show the mouth poses. **Watch a glance** shows eyes before head. **Blink now** and **Slow blink** expose eyelid motion. **Compare flat head** switches from the depth mesh to the previous layered head. **Compare face only** disables head follow and body motion. **Compare still body** freezes only breathing without interrupting attention. **Compare original** restores the existing mascot.

## Approach and architecture

Public table event → strict allow-list adapter → personality configuration/director → cosmetic animation channels → painted facial/body parts.

The implementation composes approved painted facial parts onto a depth-projected head mesh, with SVG clipping/masks as the graphics fallback. Actual irises, brows and eyelids move independently. Only the separated head turns/tilts; only the separated body receives the breathing transform. Mouth changes use two additional painted expressions with feathered pose blending. No whole-portrait movement stands in for facial animation.

The default renderer now uses a custom 2.5D depth mesh, with authored cranium, cheek and nose relief. It supports small perspective turns while preserving the painting at neutral. It adds no Live2D, Spine or Rive runtime and is not a compiled model for those systems. Full side profiles still need new artwork and a full rig; the mouth uses painted pose blends rather than a deformable lip mesh. [DHONI_DEPTH_RIG.md](./DHONI_DEPTH_RIG.md) explains the geometry, rendering, local table flag and verification.

`public-events.ts` receives only public event ID/type/actor and cosmetic attention geometry. It drops cards, hand strength, amounts, policy, private memory, analytics, future actions and arbitrary narration. `PresenceDirector` never imports game state, card evaluation, bot intelligence or the game RNG. Public split-pot results are handled as one result so a winning bot never reacts as a loser.

Each instance gets a cryptographically seeded cosmetic stream. Breathing uses a separate derived stream, so public events cannot reset a breath or change future breath timing. No randomness is generated per frame. The UI contains review controls, not character-specific reaction decisions.

## Public reactions

| Public event      | Visible intention                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Player raises     | Gaze toward that player, delayed small head follow, restrained brow lift and composed lips.   |
| Player calls      | Smaller glance and a very small friendly acknowledgement.                                     |
| Player folds      | Brief attention followed by release back to the table.                                        |
| Bot's turn        | Attention settles toward the table, with calm brow/lip focus.                                 |
| Bot wins          | Small closed-lip smile and gentle lift after the public result.                               |
| Bot loses         | Composed closed lips and quiet acceptance after the public result.                            |
| Idle              | One of four quiet pot/side glances or settling variations, separated by stillness.            |
| Return to neutral | Current gaze, head, brows and mouth ease back; breathing/blinking retain independent rhythms. |

`reactions.ts` supplies Dhoni's reaction choices. A later personality can change targets, attention scale, variations, brow/mouth strength and timing without modifying the director or table UI. Only Dhoni is enabled for this prototype.

## Timing and movement limits

The current profile is `dhoni-calm@8`:

- Eye transitions: 400–600ms. Head starts 190–330ms later and eases for 620–900ms.
- Mouth begins 90–180ms after head attention starts, easing for 650–900ms. Hold starts after the slower feature has arrived. Return takes 1–1.55 seconds.
- Blink gaps: 6–10.5 seconds; full cycles: 450–650ms. Double blinks are disabled. The manual normal button uses 550ms; the separate slow review uses 1600ms.
- Idle gaps: 6.5–13.5 seconds after a completed attention cycle.
- Depth yaw is capped at ±8 degrees, pitch at ±4 degrees. The separate neck-pivot tilt remains capped at 2.5 degrees, with source-canvas travel limited to 1.8px horizontally and 1.6px vertically. Whole-portrait travel and nod pulses stay disabled.
- Breath cycles: 5.2–7.8 seconds, with 36% inhale, 52% exhale and 12% rest. Depth varies between 78% and 100% of the configured maximum. The original body scales at most 0.9% vertically and 0.18% horizontally around `(180,248)`. Maximum shoulder rise near y=195 is **0.477 source pixels**.
- Pause/offscreen/reduced motion returns the parts to neutral. Resume starts fresh schedules from rest, without catch-up bursts or stale queued returns.

## Artwork, loading and fallback

The approved center portrait supplies the head, hair, face, jersey and shoulders. Existing generated clean eye sockets, painted pupils, eyebrows, eyelids and headless neck overlap are reused. Two new mouth expression paintings were produced with the built-in image generation tool; only small registered mouth regions are sampled.

- [DHONI_EYES_ART.md](./DHONI_EYES_ART.md): eye/brow sources, prompts and registration.
- [DHONI_BLINK_ART.md](./DHONI_BLINK_ART.md): earlier eyelid paintings and prompts.
- [DHONI_HEAD_ART.md](./DHONI_HEAD_ART.md): neck source, jaw separation and exact prompt.
- [DHONI_MOUTH_ART.md](./DHONI_MOUTH_ART.md): new saved mouth sources, runtime patches and exact final prompt set.

The default renderer now loads ten compact WebP parts from `static/prototypes/dhoni-parts/`: **278,640 bytes total** and **2,337,824 decoded RGBA bytes** before rendering surfaces. The original portrait is cropped losslessly without repainting/resampling. Other paintings are deterministically cropped/resampled with the recorded recipe; the source atlases remain available. Rebuild the compact parts with `node scripts/presence/pack-art.mjs` using local ffmpeg/ffprobe.

The approved portrait remains visible while essential facial/head art loads. Missing neck art preserves the working eye/brow/mouth renderer without head movement. Missing eye art falls back to the previous painted-blink renderer, then the existing `Mascot.svelte` if necessary. Missing mouth art disables only the mouth overlay: the original mouth remains intact and the working eyes, brows, head and body continue. Each instance gets unique SVG mask/clip IDs.

## Verification

The local verification includes:

- Unit/server tests covering all eight events, privacy, interrupted gaze/head/mouth transitions, neutral return, eye closure geometry, calibrated body limits, nonrepeating idles, independent timing and event-independent breathing.
- A configuration substitution test verifies that a later personality can alter behavior without UI/director changes.
- Packed-art checks verify the original center crop, approved pupil sizes and runtime texture budget.
- Browser pixel comparisons verify that head attention moves head/hair while the body is fixed; blinking changes eye pixels only; breathing changes shoulder pixels without moving the head or opening neck gaps; both mouth poses change actual mouth pixels.
- Public hand simulation, interrupted results, restoration of the original mouth, delayed/missing assets, pause, reduced motion, fallback, six unsynchronized copies, unique SVG IDs, background suspension and offscreen unsubscription.
- Desktop and 390px mobile viewport checks, plus 4× CPU throttling. JS callback cost excludes browser paint/GPU work; physical-phone rendering, battery and thermals remain unmeasured.

Final results:

- `npm test`: **561 passed**, including 23 presence tests.
- `npm run test:cloudflare`: **27 passed**, including the real-hand Dhoni renderer test.
- `npm run check`: **0 errors, 0 warnings**.
- `npm run lint`, `npm run build`, scoped formatting and `git diff --check`: passed. Build retains the existing large-chunk warning.
- Browser review passed with no page errors. Head attention changed 9,510 hair pixels and zero shoulder pixels with breathing held off. Blinking changed 1,475 eye pixels and zero pixels outside the eye region.
- Mouth review changed 2,871 smile-region pixels and 2,935 composed-region pixels, with smooth interrupted transitions and restoration of the original mouth.
- Breathing changed 1,764 shoulder-region pixels and zero head/hair pixels, with zero detected neck gaps. Head, neck and whole-portrait transforms stayed neutral.
- In the layered comparison, six independently timed copies under 4× CPU throttling measured **1.1ms JS callback p95**. One copy in a 390px viewport measured **0.5ms**, excluding paint/GPU. Physical-phone performance remains unmeasured.
- Delayed iris loading, missing iris/neck/mouth art, pause/reduced motion, public-event simulation, independent blinks/breaths, background suspension and offscreen unsubscription passed.
- A browser recording shows the integrated depth prototype, including left/right attention, painted win/loss expressions and neutral return.

The depth rig additionally passed eyes-before-yaw, opposite-direction interruption, neutral registration, distinct nose/ear parallax, stillness caching and context-loss fallback checks. Six depth-rendered copies measured 1.6ms JS callback p95 and 33.4ms RAF-gap p95 under 4× CPU throttling. These are desktop-browser results. See the depth-rig report for the actual seat and real Worker hand checks.

## Changed implementation files

- `types.ts`, `personality.ts`, `reactions.ts`, `director.ts`: reusable cosmetic contract, Dhoni settings, public-event decisions and continuous interruptible channels.
- `eye-rig.ts`, `FacialEyes.svelte`: painted eye/brow layers and compact textures.
- `head-rig.ts`, `HeadCharacter.svelte`: separated head/body, neck overlap, gaze compensation and body-only breathing.
- `body-rig.ts`: calibrated breathing pivot and bounds.
- `mouth-rig.ts`, `Mouth.svelte`: registered closed-mouth poses and isolated fallback.
- `PresenceCharacter.svelte`: shared-clock integration, accessibility and fallback chain.
- `depth-rig.ts`, `face-texture.ts`, `perspective-renderer.ts`, `PerspectiveHead.svelte`: bounded depth mesh, painted facial composition, GPU caching and fallback.
- `table-bridge.ts`, `TableBotPresence.svelte`: public-only live input, history priming, turn scheduling and stale-cue cancellation.
- `src/lib/teen-patti/{TeenPattiTable,TpSeat,BotAvatar}.svelte`: release gate, explicit public props and responsive portrait fitting.
- `src/routes/prototypes/bot-presence/table/`: actual seat-component review.
- `tests/cloudflare/presence.test.mjs`: real local Worker hand and unflagged fallback.
- `src/routes/prototypes/bot-presence/+page.svelte`: review controls, public hand simulation and accurate capability labels.
- `scripts/presence/{pack-art,assets,mouth,breathing,depth,table,browser}.mjs`: reproducible packing, rendered verification, failure cases and recording.
- `tests/server/bot-presence.test.mjs`: behavior, privacy, geometry and texture checks.
- `static/prototypes/dhoni-mouth/` and `static/prototypes/dhoni-parts/`: source mouth paintings and compact runtime assets.

Unqualified component/module paths above are under `src/lib/mascots/presence/`.

## Remaining authoring and review limits

Before converting other characters, review Dhoni's expression strength and timing on a physical phone and at actual seat size. Keep the one-character boundary until that review.

Full side-profile head turns beyond the current restrained depth mesh still require an authored model and additional clean, registered artwork: angled head/jaw/ear views, hair front/back with hidden overlap, neck beneath the jaw, per-view eye whites/pupils/lids/brows and mouth/cheek shapes. The current front-face plate cannot expose unseen side geometry. A deformable facial model also needs a clean lower face under the mouth, separated lip/corner shapes and calibrated face/neck meshes. These are not silently approximated by rotating the flat portrait.

[DHONI_RIG_HANDOFF.md](./DHONI_RIG_HANDOFF.md) lists every required layer, what is already available, what is missing, exact registration and the animation contract for that authoring pass.

The prototype is available as an opt-in review. The production release build enables `VITE_BOT_PRESENCE_PREVIEW=true`. Open `/prototypes/bot-presence` or `/prototypes/bot-presence/table`, or append `?botPresence=dhoni` to a room URL. Removing the query flag restores the original mascot without a deployment. Builds without the release flag disable both review routes and live-table opt-in. Other bots have not been converted. Physical-phone battery/thermal testing still requires a device.

## Reproduce review

```sh
node scripts/presence/pack-art.mjs
node scripts/presence/depth.mjs http://127.0.0.1:5188
node scripts/presence/table.mjs http://127.0.0.1:5188
node scripts/presence/browser.mjs http://127.0.0.1:5188
PRESENCE_RECORD=1 node scripts/presence/browser.mjs http://127.0.0.1:5188
```

Artifacts are written to the OS temporary `chaal-presence-review` directory and selected results are copied to `/private/tmp/chaal-presence-review/`: `dhoni-complete.mp4`, `face-smile.png`, `face-composed.png`, `mouth-{neutral,smile,composed}.png`, `breath-{rest,inhale}.png`, `desktop.png`, `mobile.png`, and `results.json`.
