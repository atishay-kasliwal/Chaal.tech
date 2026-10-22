# Phase 3: Classic and Muflis on the preserved UI

Separate six-browser runs verify each starting variant and switch to the other variant for the next hand in the same room. The reused browser script retains its historical `phase1-` generated room-name prefix. Reports identify the actual starting rules version.

- [Classic browser report](classic/browser-report.json)
- [Muflis browser report](muflis/browser-report.json)
- [Implementation, exact house rules and test results](../../docs/archive/phase3/IMPLEMENTATION.md)

| State | Classic starting room | Muflis starting room |
|---|---|---|
| Home | [Image](classic/01-home.png) | [Image](muflis/01-home.png) |
| Card renderer | [Image](classic/02-card-deck.png) | [Image](muflis/02-card-deck.png) |
| Existing create/join form with variant selector | [Image](classic/03-create-join.png) | [Image](muflis/03-create-join.png) |
| Mobile create/join form | [Image](classic/03-mobile-create.png) | [Image](muflis/03-mobile-create.png) |
| Six-player waiting/settings | [Image](classic/04-six-player-waiting.png) | [Image](muflis/04-six-player-waiting.png) |
| Six-player blind | [Image](classic/05-six-player-blind.png) | [Image](muflis/05-six-player-blind.png) |
| Seen | [Image](classic/06-seen.png) | [Image](muflis/06-seen.png) |
| Refresh recovery | [Image](classic/07-refresh-resumed.png) | [Image](muflis/07-refresh-resumed.png) |
| Bet | [Image](classic/08-bet.png) | [Image](muflis/08-bet.png) |
| Packed | [Image](classic/09-packed.png) | [Image](muflis/09-packed.png) |
| Server-calculated winner | [Image](classic/10-server-winner.png) | [Image](muflis/10-server-winner.png) |
| Next hand after variant switch | [Muflis next hand](classic/13-variant-switched.png) | [Classic next hand](muflis/13-variant-switched.png) |
| Mobile table after switch | [Image](classic/11-mobile.png) | [Image](muflis/11-mobile.png) |
| Host transfer after switch | [Image](classic/12-host-transfer.png) | [Image](muflis/12-host-transfer.png) |

These are functional and visual review references, not automated pixel-difference tests. The mobile create form and Muflis six-player blind view were visually inspected. Source-hash tests prove all frontend/static files remain unchanged except the documented selector/label additions and their wiring in the two existing pages. Phase 0–2 capture directories remain unchanged.
