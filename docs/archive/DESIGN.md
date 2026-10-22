# Chaal: the after-hours card club

## Brief

Redesign every existing page of the SvelteKit card app for friends who gather around a private video table. Preserve authentication, game rules, bot work, live media, analytics and owner controls. Existing uncommitted work is the baseline. No deployment is included.

## Concepts considered

| Territory | Concept and signature                                                                                                       | Emotion / screenshot                                                        | Anchor                                                | Originality / fit / feasibility / portability |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Name      | Chaal means a move: navigation slides into place like a dealt card.                                                         | Quick, confident; a giant wordmark beside a dealt hand.                     | The name and the action taken every turn.             | 4 / 5 / 5 / 2                                 |
| Culture   | The after-hours adda: a digital invitation to the friends' card table, with illustrated card faces and conversational copy. | Familiar, mischievous; butter-yellow invitation and an ink-purple card fan. | Private friends, Indian card games, club invitations. | 5 / 5 / 5 / 1                                 |
| Material  | The deck index: each game, player and record is a card pulled from a shared deck.                                           | Tactile, orderly; an indexed game shelf.                                    | Multiple variants, decks and hand histories.          | 4 / 4 / 5 / 3                                 |

Selected: the after-hours adda, with the dealt-card movement from the name concept.

## Concept card

Idea: The friends' card night starts before anyone sits down.
Metaphor: An invitation, a hand of cards, and a private room after hours.
Signature: Three illustrated aces fan out on hover or keyboard focus, with a tap control on phones.
Emotion: Warm company and a little friendly mischief.
Motion verb: Deal, then settle.
Screenshot: Oversized 'Good cards. Better company.' beside a fanned hand on butter yellow.

## System

Stack: existing SvelteKit, Svelte 5 and DaisyUI; preserve routing and application state.
Palette: night #211c2e; raised surface #2c263b; ink #211c2e on paper; paper #f8f2e5; butter #f2dc91; red #ee715b; muted #beb5c9; line #ffffff24. Mint is reserved for success and existing status signals.
Type: locally hosted Google Bricolage Grotesque, 400–800, for display and wordmark; system sans for body and dense controls. Display tracking -0.055em, line-height .93; body 16px/1.55; UI 12–14px.
Grid: 12 desktop columns, 24–64px gutters, maximum 1320px. Phone layout is composed at 390px. Large display, compact utility, generous section breaks.
Shape: 16px surfaces, 8px inputs, fully rounded primary pills; playing cards keep their physical proportions.
Motion: GSAP lifecycle with one ticker and power3.out; no scroll smoothing on the live application. Card-fan driver is the signature. Quiet at rest deliberately: no ambient animation competes with a game or burns CPU during bot studies. Native scrolling, no loader. Reduced motion keeps all content visible and disables movement.

## Composition

Home: [invitation copy 6 cols | illustrated hand 6 cols] → [four unequal-feeling game tiles in a continuous shelf] → [large statement | three numbered steps] → [ranking index / expandable learning notes] → [giant invitation footer].
Games: [large title | guide note] → [category bar / search] → [game index 4 cols | selected deal and rules 8 cols].
Club: [welcome | online count] → [section tabs] → [friend strip] → [live tables / records / schedule].
Create table: [invitation and club context | working setup card], stacked on phones.
Stats: [big record-book title | filters] → [section rail] → [existing real analytics panels].
Admin: [owner heading] → [section rail] → [working members, settings, scheduling forms].
Availability: [illustrated invitation] → [personal heading] → [date and time selections] → [response].
Live room: [compact room utilities] → [night-purple playing surface and legible cards] → [thumb-reachable action dock]. Maintain seat geometry and game behavior.
Error: [oversized missing card] → [plain explanation and home action].
Design previews: inherit the shared system; retain their asset-testing controls and fixtures.

## Genericness check

Removed green/gold casino defaults, bouncing hero cards, gradient hero, repeated equal feature panels, and serif headings. The actual illustrated decks and Chaal's private-club copy carry identity. No invented membership counts, testimonials, credentials or metrics. No content placeholders are needed.

## Verification

Baseline and new changes are reviewed separately using /tmp/chaal-redesign-backup. Run Svelte checks, production build and two browser QA passes with desktop, phone and reduced-motion views. Authenticated views use browser-only local fixtures when needed; no production accounts or writes.

## Card refinement

Follow-up: unify the landing page, game library and clubhouse around the existing Diwali Taash illustrations. Game library panels now distinguish category, position in the collection, game title and meaningful hand information; the decorative oversized card count is removed. Landing tiles show real sample hands. The hero uses an illustrated Ace/King/Queen fan, responsive to narrow viewports. Card edges have a restrained stock/shadow treatment. The clubhouse practice area is lavender with dark answer surfaces and larger hands; table and leaderboard panels have distinct accent rails. Live-table card geometry, rules, chosen backs and readable classic faces are preserved. At 320px, marketing tiles and practice choices stack so the cards stay large.

QA: all 29 game examples are checked at 320px, 390px and 1440px for loaded images and containment within their panel, plus landing/clubhouse contrast and practice-answer states. Evidence is in `/tmp/chaal-redesign-qa/cards/`. The original frontend and bot work remain intact.

## Release integration

The approved design is applied as a three-way patch to current main in an isolated release checkout. Keep the published bot picker, bot navigation, intelligence tools, richer stats sections and mascot/presence features. Do not merge the old private-club branch or its uncommitted simulation work. Production builds use the existing Cloudflare game origin and Google OAuth client from CI.

## Shuffle motion refinement

Scope: landing hero only, isolated on frontend/hero-shuffle. Keep existing typography, colors, card art and composition.
Concepts: riffle and fan (fit 5, originality 4, feasibility 5, portability 2); orbiting cards (3/3/5/4); Blender film (4/4/3/3). Choose riffle and fan because the actual deck becomes the interaction.
Signature: gather, split into alternating packets, interleave, square, fan. Tap or keyboard activation replays; one entrance, no endless loop. GSAP timeline in Svelte lifecycle, paused outside viewport; reduced motion shows the complete static fan. Existing SVG faces stay sharp and do not require a downloaded video or WebGL runtime. Blender is installed but deferred until actual bending/physical simulation is needed.

Shuffle verification: Svelte check passed with zero errors/warnings; production build passed using the existing public game endpoint. Two browser passes covered 1440px desktop, 390px phone, reduced motion and replay. All thirteen card images loaded, no page errors, no document overflow. Separate screenshot critic rated desktop composition 8/10 and phone 7/10 before stamp spacing correction; timing is not scored from stills. The existing phone heading wrap is outside this motion change. Final polish increases hint contrast and moves the phone stamp above the fan. Local preview: port 4400. No deployment or merge performed.

Reference-driven flourish: replace the quick two-packet shuffle with an approximately 13-second sequence: ribbon/spring, airborne three-packet cut, reverse-side thumb fan, final hero fan. Add deliberate holds and use the actual Diwali Taash back artwork. Preserve navigation clearance and reduced-motion fallback. No hands or photo textures are added.

Spacing refinement: enlarge desktop cards from 17vh/208px cap to 22vh/264px cap, tighten hero padding and heading margins, and bring the ellipse/stamp closer with a 6.4-card art width. Phone cards grow from 21vw to 25vw; smaller headline restores the intended two-line lockup. Keep intrinsic hero height so short screens can scroll without crushing the artwork.

Horizontal composition: desktop resting fan now offsets cards outward from the middle by 10% of card width per index. This adds 1.2 card widths to the overall span while preserving symmetry and vertical scale. Apply the same pose to initial state, reduced motion and the final animation frame. Phone span remains unchanged to preserve edge clearance.

Add one face-down deck-back card before the two, recenter all poses using the hand's actual midpoint, and increase timeline playback rate to 1.05 for a 5% faster flourish.

Full-deck flourish: all 52 unique suited faces plus two matching joker assets participate in ribbon, cut and thumb-fan poses. Normalize positions and total stagger duration for 54 cards, keeping the approved pacing. The decorative face-down card stays hidden during shuffling. Extra deck faces disappear while squared; final hero retains its compact selection with a red joker immediately after the Ace. Reduced motion displays only that final hand.


Release scope: landing shuffle and spacing only; bot and table experiments discarded. Existing bot portraits, media seats and live-table layout remain unchanged.
