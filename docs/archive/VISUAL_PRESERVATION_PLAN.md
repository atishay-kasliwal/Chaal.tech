# Original Teen Patti Visual Preservation Plan

Source: `mustafa-kapadia1483/teen-patti`, commit `3f0cb69a71d922557f9b17a08a78f413b2e90774`. Recorded 2026-10-13.

This document records the existing visual system. It does not introduce a replacement design system. The original application must remain recognizable as video, variants and reliability are added. Changes to theme, fonts or card presentation require explicit approval.

Source inspection establishes the values below. Phase 0 subsequently captured 20 real desktop/mobile references, the computed system font stack and six-player gameplay states. See [the original capture inventory](visual-baselines/original/README.md) and [Phase 0 findings](docs/archive/phase0/RESULTS.md). These captures establish appearance and the tested path; they do not verify every rule or production behavior.

## 1. Colors and background

Source: `src/app.css`. Preserve the DaisyUI theme name `teen-patti` and `data-theme="teen-patti"` in `src/app.html`.

| Token | Existing value | Use |
|---|---|---|
| HTML background | `oklch(10% 0.04 145)` | Deep green page background |
| `base-100` | `oklch(12% 0.04 145)` | Dark panels, cards, navigation |
| `base-200` | `oklch(15% 0.05 145)` | Raised/active surfaces |
| `base-300` | `oklch(20% 0.06 145)` | Borders, inputs, back surfaces |
| `base-content` | `oklch(90% 0.02 80)` | Warm off-white text |
| `primary` | `oklch(72% 0.17 80)` | Gold actions and highlights |
| `primary-content` | `oklch(18% 0.05 80)` | Text on gold |
| `secondary` | `oklch(40% 0.08 145)` | Muted forest green |
| `secondary-content` | `oklch(72% 0.17 80)` | Gold text |
| `accent` | `oklch(52% 0.22 25)` | Red emphasis/showdown |
| `accent-content` | `oklch(96% 0.01 0)` | Text on red |
| `neutral` | `oklch(18% 0.04 145)` | Neutral surfaces |
| `neutral-content` | `oklch(80% 0.02 80)` | Neutral text |
| `info` | `oklch(65% 0.15 220)` | See/information |
| `info-content` | `oklch(98% 0 0)` | Text on info |
| `success` | `oklch(65% 0.18 145)` | Positive outcome |
| `success-content` | `oklch(98% 0 0)` | Text on success |
| `warning` | `oklch(72% 0.17 80)` | Waiting/stake emphasis |
| `warning-content` | `oklch(18% 0.05 80)` | Text on warning |
| `error` | `oklch(52% 0.22 25)` | Pack/leave/error |
| `error-content` | `oklch(96% 0.01 0)` | Text on error |

Retain existing opacity treatments, subtle gold borders, deep green surfaces and shadows. New video/status elements use these tokens. No alternate poker palette, bright conferencing chrome or new illustrated table background is proposed.

## 2. Typography

The source defines no custom font import or family override. It uses the existing Tailwind/browser font stack, with `font-mono` for balances and bet values. Record the computed stack and loaded fonts during Phase 0 before claiming exact rendered font equivalence.

Preserve bold names, `text-xl` room headings, `text-lg` player names, compact status text, uppercase/tracked start controls and large landing headings. Retain Lucide icons and the current relative hierarchy. Do not add a new display font or normalize all typography as cleanup.

## 3. Spacing, shape and surfaces

| Existing language | Source examples to retain |
|---|---|
| Page container | `container mx-auto px-2` |
| Player grid | `mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3` |
| Player body | `card-body p-5` |
| Form/lobby body | `p-6` or `p-8`, matching original component |
| Internal grouping | `gap-2`, `gap-4`, `gap-6`, `mt-4`, `my-4` |
| Header | Sticky, `px-4 py-3`, translucent base surface and backdrop blur |
| Selector radius | `--radius-selector: 0.75rem` |
| Field radius | `--radius-field: 0.75rem` |
| Box radius | `--radius-box: 1.25rem` |
| Theme border | `--border: 1px` |
| Panels | DaisyUI `card`, rounded surfaces, `shadow-xl`/`shadow-2xl` |

Use existing component classes first. Phase 5 may adjust outer positioning and scale because perimeter seats occupy different space; preserve interior grouping and document the intentional differences.

## 4. PlayingCard and card fan

Source: `src/lib/components/PlayingCard.svelte` and room-page card loop.

- Preserve the rank/suit/faceDown/class API and normalization behavior.
- Preserve Cardmeister faces. Red suits: `#e60000`; black suits: `#1a1a1a`.
- Face surfaces: red-suit `#fffdfd`, otherwise `#fcfcfc`.
- Court colors: `#d4af37,#bd1e1e,#2a4b7c,#1a1a1a,#1a1a1a,4`.
- Face border: `#d1d5db`, 1.5 width, `0.5rem` radius.
- Default dimensions: `h-36 w-24`, with existing class overrides retained.
- Preserve custom green/gold face-down backs, inset diamond pattern and center star.
- Preserve the existing `h-36` fan region, `-space-x-12` overlap, card z-order and hover/focus `-translate-y-4` lift.
- Localizing/pinning the Cardmeister executable asset must preserve its output; it is a delivery/security change, not a new card design.

Capture all 52 faces and card backs using the existing test-cards route. Check optional fan extraction against the original before changing card counts or responsive sizing. Do not delete the test route as architectural cleanup.

## 5. Buttons, forms and game controls

Preserve existing DaisyUI `btn`, `input`, `join`, `fieldset`, `range` and `select` presentation. Extend current forms with similarly styled fields rather than introduce a separate form library.

| Control | Existing treatment |
|---|---|
| See / Seen | Small outline information button; Eye/EyeOff icon |
| Pack | Small error outline; Hand icon; confirmation interaction |
| Blind / Chal | Small primary button joined to narrow centered monospaced numeric input |
| Show | Accent small full-width button; Gavel icon |
| Start | Primary full-width, bold uppercase/tracked; Play icon |
| Leave | Error outline small; LogOut icon |
| Join | Existing input/button join group and existing labels |
| Create | Existing primary CTA, connection-disabled/loading state |

Server legality replaces UI-only enforcement while the visible actions remain recognizable. Retain familiar validation/error feedback. The winner selector must become authoritative result display; preserve its trophy/panel/accent styling while documenting the interaction change.

## 6. Player presentation and media addition

The original player is already a styled game panel. Preserve:

- `indicator` and gold Turn badge.
- Active `bg-base-200`, primary border/ring, ring offset and transition.
- Inactive `bg-base-100` and `border-base-300`.
- Name/title, outlined You badge and monospaced balance chip.
- Separator borders around card/control areas.
- Card fan and local action grouping.
- Rotated Packed stamp and subdued game content.
- Blind/seen labels and accent Showdown badge.

PlayerSeat is an extraction of that markup, not a fresh widget. Phase 4 adds optional video and microphone state within it. No-media mode remains visually coherent without empty conference rectangles. In Phase 5, preserve the panel language while placing seats around central game content. Keep packed friends able to talk; constrain the packed overlay to game content if necessary.

## 7. Animation and responsive behavior

- Preserve route fly-in: y=20, opacity=0, duration=400ms, delay=400ms; fade-out=400ms.
- Preserve keyed pot/max-stake fly transitions: incoming y=-15 and outgoing y=15, 300ms.
- Preserve player-panel transitions and card hover/focus lift.
- Preserve landing card/fan effects, floating suits, bounce/pulse language and mechanic cycle where accessible.
- Retain existing loading ring/spinner feedback.
- Preserve original responsive baseline: one player column, two at `md`, three at `lg`; stacked header becomes row at `md`; form/container width constraints remain.

Phase 4 retains that grid. Phase 5 deliberately changes seat placement; Phase 6 improves mobile composition using the same theme/cards/buttons. Reduced-motion and keyboard fixes may alter animation/accessibility behavior where necessary; record those changes rather than silently restyling.

## 8. Visual regression inventory and acceptance

Phase 0 references must cover Home; Create; Join/name entry; connecting/error; waiting/UsersTable; settings; 2–6-player games; local/opponent cards; blind/seen; normal/active/packed/disconnected seats; bet input; Pack confirmation; Show; and winner/result.

For each reference record commit, route, viewport, browser, deterministic fixture or real-server setup, state, animation frame and asset/font loading status. Capture desktop and mobile. Use interaction recordings for transitions and control feel; screenshots cannot verify timing or networking.

If the backend is absent, label mock state captures as frontend fixtures and keep real-game behavior unverified. Do not substitute screenshots of a newly invented engine for evidence of original rules.

Before accepting extraction, compare the extracted grid to the original. Later layout/media changes require explicit expected diffs while typography, token values, card faces/backs, button variants and spacing language remain protected. Mask live video and clock text for stable visual comparisons; separately test that video attaches to the right seat.

Keep the original baseline alongside approved incremental references. No blanket snapshot regeneration. No new design system without explicit approval.
