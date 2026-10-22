# Permanent character bots · Phase 3

Implemented in the `mascot-rollout` worktree at `/tmp/chaal-mascot-rollout`, based on
the Phase 1 recorder commit `e44edd77` and the completed Phase 2 commit `e4561b4a`. The original
`private-club` working tree is left intact. This document is the consolidated handoff.

## Architecture and audit

The existing pure engine, projection-based `decide`, delayed bot runner, Durable Object
commit/outbox recorder, immutable legacy registry, MongoDB club administration, mascot
manifest, and Svelte table seats are reused. No second game engine or analytics formula was
introduced. Existing member mascots are kept separate from permanent bot identities.

- `server/bots/directory.mjs`: global `bots`, versioned `bot_styles`, owner operations,
  member-safe profiles, club availability and server-side seat resolution.
- `characters.mjs`: the five approved characters and their initial configurations.
- `config.mjs`: the `tp-character@1` contract, allowed ranges, canonical configuration hash,
  and the small immutable runtime snapshot.
- `validation.mjs`: schema, identity, policy/game/hash checks, hidden-card invariance and
  24 complete seeded hands against the normal reference policy. The action counts are
  validation evidence, not a measured strength or predictability rating.
- `identity.mjs`: existing legacy IDs/hashes stay unchanged; `identityForSeat` adds character
  identities without changing what any legacy ID means.

A character has a permanent slug/ID, stable name, approved artwork, description, personality,
status and timestamps. Identity edits are limited to drafts. Disable is reversible; retirement
is explicit and permanent. There is no delete endpoint.

Draft style versions are allocated with an atomic counter, and edits use revision checks.
Validation belongs to the exact configuration hash and is cleared on an edit. Publication
freezes the document and advances the character's current-style pointer monotonically.
Publishing retries can repair a failed pointer write without editing the publication or
rolling back a newer version. Earlier publications remain inspectable.

When seated, the bot receives its current published style snapshot. This stays fixed for that
seat, including across reconnects and later owner publications. Remove and re-add a character
to seat its latest style. The full snapshot is stored only in authoritative room state and
sealed replay inputs. Public seats expose identity/style IDs and artwork, never tendencies.

## Initial characters and actual styles

| Permanent bot ID | Character | Playing style |
| --- | --- | --- |
| `rohit-sharma` | Rohit Sharma | Stays blind longer, raises good hands firmly, takes more stack risk |
| `virat-kohli` | Virat Kohli | Looks early, raises strong hands frequently, reads seen-player pressure |
| `ms-dhoni` | MS Dhoni | Controls raises, protects short stacks, accepts a Show at a lower strength |
| `gg` | GG | Selective calls, cautious in large pots and against seen raises |
| `samay-raina` | Samay Raina | Long blind play, more bluffs and earlier blind Shows |

All start with style `@1`. These are fictional club playing styles inspired by the approved
characters, not factual claims about the people depicted. They are not five difficulty tiers.
Declared difficulty is separate from measured difficulty, which remains unset.

Every exposed tendency is consumed by the policy: blind duration; call, raise and Show
thresholds; bluff rate; strength noise; mistake rate; seen-raise pressure; short-stack caution;
large-pot caution; strong-hand raise probability; blind Show probability; and the Pot Blind
stack guard. There are no ignored memory, tilt or learning knobs.

The policy supports Teen Patti and all currently registered Teen Patti variants. Hold'em,
Blackjack and Rummy are rejected by validation and seating. Game-specific policies for them
are future work rather than cosmetic supported-game flags.

## Member experience

- `/bots`: dark Chaal character lineup, approved artwork, personality/style descriptions,
  declared difficulty, supported game and honest shared-history/first-hand copy.
- `/bots/[botId]`: character profile, create-table action, style version and personal rivalry:
  hands/nights together, attributed net boots, evidence-aware verdict, game breakdown,
  Show contests, recent nights and largest swings. Fair-share output is shown only once the
  canonical evidence gate permits it. Legacy retired profiles remain resolvable.
- `/create-room?bot=rohit-sharma`: starts with that opponent selected. The Chaal start action
  uses named character choices, with multiple opponents selectable. Existing numeric practice
  links still work by selecting available characters; they do not rewrite legacy records.
- At the table: artwork-first picker, occupied-character buttons disabled, server-side host,
  capacity, between-hand, game and duplicate checks. Different permanent characters can share
  approved artwork; duplicate prevention is by permanent identity, not image.
- Bot seats use the animated existing mascot component as their primary portrait, with a
  small Bot badge and stable name. Human corner mascots remain unchanged. The owner size
  control scales both; open tables refresh settings while visible without a deployment.
- On phones, Start the night and Add company live in the action dock; the full picker opens in the company panel rather than under the waiting controls.
  Horizontal picker scrolling does not widen the page.

Navigation exposes Bots to members and the existing Admin screen links to character management.

## Owner experience and club availability

`/admin/bots` lets an owner:

1. Create a draft identity or edit one before activation; choose from the supported artwork.
2. Create a style draft, edit structured JSON, save it, run validation and inspect the report.
3. Publish an immutable version; inspect lineage, parent and changed tendencies.
4. Enable/disable globally or explicitly retire a character.
5. Choose which active global characters this club enables, including an empty selection.

The structured editor supports manual or `ai-assisted` draft provenance. An eventual assistant
can propose the same JSON and enter the same validation pipeline. No model/API key or live LLM
is required. Arbitrary photo uploads are not added: this phase uses the repository's existing
approved asset system.

Club availability is `club_settings.botIds`, separate from global identity. Missing means the
five defaults; `[]` means none. Disabling availability prevents new seats and keeps existing
seats/history intact. Stale clients are checked again by the server.

## Analytics, history and privacy

Bot profiles consume the existing Phase 2 canonical `playerRecords` loader and
`compute/rivals.mjs`. No boots, nights, fair-share or rivalry calculations exist in the bot UI.
The completed Phase 2 commit is merged into this worktree. Its canonical computations,
Stats routes and owner analytics are preserved, rather than maintained as a separate bot copy.

Only the viewer's public records from hands they were dealt into contribute. The request
uses the signed-in member from the fresh server-side guest-list check. Profiles return a
purpose-built projection, never database documents, internal tendencies, private cards,
unpublished drafts or sealed traces. The history window is the latest 5,000 recorded hands
and the detail page says so. Chip flows in multiway pots use the canonical proportional
attribution rule, with no stronger claim of exact head-to-head money.

Every recorded character seat carries permanent `botId`, `styleId`, `styleVersion`,
`configHash` and policy. The recorder verifies character decisions from the frozen sealed
snapshot and recorded RNG seed/draw count. Public `night_events` retain only the five identity
fields for bot additions; the authoritative style snapshot is explicitly removed from those
payloads. A storage-level regression test checks that no tendency reaches a night event. Live decisions still receive only their own
projection. Existing observer restrictions and empty memory references stay in place.
There is no new memory reader, player model, database access inside a decision or Phase 4 work.

`legacy-easy`, `legacy-normal`, `legacy-hard`, their `@1` styles, hashes and policy semantics
are preserved. Seeding retires them from new selection and never relabels old hands. The
29 original replay fixtures remain unchanged. The append-only corpus now adds 130 character
hands: every initial style across all 26 Teen Patti variants, with a verified character
decision in each. Running `analytics:corpus` again adds zero hands. A temporary change to
character-v1 blind behavior was deliberately tested and rejected by the frozen corpus, then
restored. New policy code must use a new version while retaining replay of the old version.

Both member and owner HTTP endpoints require valid club credentials and fresh active
membership; mutation endpoints additionally require the owner role. Table commands retain
the existing game-token/host permissions. Owner member lists containing emails no longer
overwrite the public client roster cache.

## Migration and release

No deployment or production migration was run. Release remains blocked in the order specified
by the owner:

1. Fix the Atlas allow-list.
2. Run `analytics:migrate`.
3. Complete the Phase 1 production validation night.
4. Run `bots:migrate`.
5. Deploy the Worker and website together.

Only after the first three steps, run from the release checkout with the migration account:

```sh
MONGODB_ADMIN_URI=... MONGODB_DB=chaal npm run bots:migrate
```

This runs the existing analytics schema migration, validates/publishes the five initial
styles using insert-only writes, creates missing identities and retires legacy selection.
It never deletes records or overwrites later styles, disabled characters, owner edits or
club availability. Running it twice is covered by tests. A conflicting existing seed hash
stops the migration rather than silently changing behavior.

The Worker runtime role now needs `find`, `insert`, `update` on `bots` and `bot_styles` for
owner tools. It still needs no schema-administration or deletion rights. See
`ANALYTICS_OPERATIONS.md`. Seed before exposing the new picker, then deploy the Worker and
frontend through the repository's normal release process. A bot-disabled rollback can set
club availability to `[]`; keep all published styles and records.

This handoff does not claim a production migration/deployment or production member-to-mascot
assignments. Production MongoDB access was previously timing out. All identity, member-link,
admin, gameplay and browser verification here uses an isolated local Worker and throwaway
MongoDB, with real HTTP/WebSocket flows.

## Validation and review artifacts

Both commits were checked independently with the full server suite, Cloudflare integration
suite, Svelte check, ESLint and production build:

| Change | Server tests | Cloudflare tests | Check / lint / build |
| --- | ---: | ---: | --- |
| Mascot rollout (`9959e0dc`) | 434 passed | 21 passed | Passed |
| Phase 3 character bots | 447 passed | 24 passed | Passed |

The canonical Phase 2 computation/data/test files exactly match `e4561b4a`. The engine reads
`shared/bot-characters.mjs`, with no frontend catalogue dependency. CI explicitly installs
Chromium for the browser tests; local checks can use an existing Chrome installation. Additional character tests cover seeding twice, status/availability,
identity stability, immutable publication and retries, hash/invalid-policy rejection,
authorization, multi-bot seating/duplicates/game restrictions, privacy, old-style replay
after publication, canonical personal history, distinct action fingerprints and all
registered Teen Patti variants with hidden-card invariance. Browser checks use real local
Worker APIs, not mocked bot data, on desktop and 390px mobile layouts.

The browser suite also checks all five member mascot links through owner admin, member
profiles and roster, live resize propagation, and that a seated bot keeps `@1` after `@2`
is published. Screenshots are generated in `/tmp/chaal-phase3-browser/`:

- `bots-desktop.png`, `bots-mobile.png`
- `bot-profile.png`
- `bot-seats-desktop.png`, `bot-seats-mobile.png`, `bot-picker-mobile.png`
- `bots-admin-mobile.png`

Commands: `npm test`, `npm run test:cloudflare`, `npm run check`, `npm run lint`, `npm run build`.

## Deferred work, limitations and Phase 4

- Extra bot reaction sheets: the five approved directional atlases ship; six additional
  categories per bot remain pending because image generation returned its usage-limit error.
  Missing expressions fall back to directions. All member reaction art is complete.
- Measured difficulty, predictability curves, style-version performance charts and a bot-wide
  club record screen await reliable canonical analytics and sufficient data. The UI does not
  fabricate metrics or claims that a bot remembers someone.
- Validation uses a small deterministic classic-game simulation; all-variant coverage is in
  automated tests. This is a legality/privacy smoke test, not an exploitability benchmark.
- The admin editor is structured JSON with schema/range feedback. A more visual tendency
  editor can be added without changing the publication API.
- The standalone Node development server can use the compiled initial character styles;
  persistent owner management and club authentication use the existing Cloudflare backend.
- The existing large client-chunk build warning remains. No new bundling workaround is needed
  for this feature.
- The `phase3-rollout-foundation` stash is redundant after these two implementation commits.
  It is retained for safety; `design/` stays untracked and has not been staged.
- For Phase 4, implement the observer-filtered MemoryProvider against canonical completed
  hand history, pin its as-of version at deal time, and test absent-observer/future-information
  boundaries before adding any adaptation. Keep learning separate from immutable style
  publication. None of that work is started here.
