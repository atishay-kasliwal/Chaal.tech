# Chaal frontend redesign

The `awwwards` skill from https://github.com/juliobsz/skills was read and applied directly from a temporary clone. `DESIGN.md` records the concepts, selected direction and visual system. The existing SvelteKit/Svelte 5/DaisyUI stack remains in place.

The direction is an after-hours adda: ink purple, butter yellow, red suit accents, locally hosted Bricolage Grotesque, illustrated cards and short, conversational copy. The homepage was rebuilt; navigation, clubhouse, setup, stats, owner tools, availability, dialogs, errors and live-table surfaces share the system. Asset review pages inherit it. Named felt and deck choices remain available.

The functional UI changes are limited to navigation transitions, accessible dialog focus, heading semantics and layout. On phones, table-card games place compact video seats above the board; other table layouts retain their existing positioning. Stats tabs wrap, friend lists wrap, and the lineup catalog uses two columns with its save control nearby. The game engine, bot policies, bot simulations and backend were not edited.

No invented claims, testimonials, metrics or replacement content are needed. The preview fixtures are test data only and are never added to application content.

## Verification

- `npm run check`: zero errors and warnings.
- Production build: passes using `VITE_SERVER_URL=https://chaal-visual-qa.example.com npm run build`.
- Browser QA: `scripts/redesign/qa.mjs` uses a real production preview, 1440px desktop and 390px phone layouts, with a separate reduced-motion check. It supplies member/session/data fixtures entirely inside the browser and blocks server mutations; the automatic presence heartbeat is answered locally.
- Checks include game filters/search, section navigation, mobile menu, dialog entry/focus trapping/Escape, first-target skip link, page JavaScript errors, horizontal overflow and axe WCAG A/AA scans.
- The full final run covers 68 views, with zero page JavaScript errors, horizontal overflow or axe violations. Eight phone table-card scenes are included.
- A separate table pass checks 320px, 390px, 768px and 1440px widths, and directly checks board, hand and control bounds inside the fixed game surface. It exposed narrow-phone issues in three-card hands, Running trays and Auction controls; these were corrected. The final targeted pass verifies 20 views with zero clipped boards/hands/controls, page errors or axe violations.
- Reports and screenshots: `/tmp/chaal-redesign-qa/`. Pass 1 found issues; pass 2 verified the fixes. The final pass covers the last compact-label, loading and lineup refinements.
- First independent visual critique: 6.7/10. Second independent visual critique: 7.44/10. These are subjective reviews, not an Awwwards certification. The second critique preceded the final compact-label and lineup polish. It identified deeper dashboard composition and full interaction/performance auditing as the largest remaining opportunities.

## Known limits

Member screens were checked with local fixtures, not production sign-in or live multiplayer. Browser performance readings are local and unthrottled, with other machine workloads present; they are not production benchmarks. The build still reports an existing large media-related chunk.

The skill's static metadata audit passes the public-page basics and reports an estimated heaviest crawled page of 133 KB. Its remaining failure is the existing authenticated room route: arbitrary single-segment paths render an admission screen with HTTP 200 before membership-aware room validation. A genuinely unmatched multi-segment URL returns the designed 404. Changing room admission/routing is outside this visual change. The private club and setup pages intentionally have `noindex, nofollow` rather than public canonicals. Private-club server HTML contains a loading heading; member content follows authentication.

## Run and review

Use `npm run dev` for normal frontend development with the project's configured backend. Use the existing environment settings for real sign-in and gameplay.

The review build is served at http://127.0.0.1:4400. Its backend URL is deliberately isolated, so public pages can be reviewed there while member screens are represented in the saved QA screenshots. To reproduce verification, build with the QA URL above, run `npm run preview -- --host 127.0.0.1 --port 4400`, and run `node scripts/redesign/qa.mjs`. The browser script requires system Chrome at its configured macOS path.

During the design phase, no deployment, commit, stash, reset, checkout cleanup or cleanup of existing work was performed. The approved release is prepared in an isolated checkout of the latest main, preserving its published bot, analytics and mascot features. Existing uncommitted frontend files were copied to `/tmp/chaal-redesign-backup` before editing. Publish only through the existing deployment workflow after the redesign is approved and normal production environment values are restored for the build.

For another independent review of the published site, run `/jury <url>`.
