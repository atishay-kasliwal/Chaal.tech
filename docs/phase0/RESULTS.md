# Phase 0 findings and preservation baseline

Source commit: `3f0cb69a71d922557f9b17a08a78f413b2e90774`. Audit date: 2026-10-13.

## Preservation

The original application is imported into the existing repository root. Every file under `src/` and `static/` remains byte-identical to the pinned source. Svelte, Tailwind, DaisyUI, Cardmeister presentation, cards, player panels, controls, room forms and animations are retained. Git history and existing planning documents remain intact.

The changes outside original application code are ignore rules, a pinned Playwright development dependency/capture command, an audit script, documentation and visual evidence. See [setup](SETUP.md) and [import provenance](import-provenance.json).

## Running system

The local frontend runs at `http://127.0.0.1:5173`. Gameplay still uses the original hosted Render service. This is a working local frontend plus external backend, not a fully self-hostable application.

The original production build passes. Cardmeister registers correctly in Chrome and renders original card faces. The observed body font stack is the existing system stack, beginning `-apple-system, system-ui, Segoe UI, Roboto`; no font was added.

The capture script uses six isolated browser contexts and synthetic player names in its own unique temporary room. It records only counts/flags for private-card evidence, never raw private card values. See [capture report](../../visual-baselines/original/capture-report.json) for the exact successful steps and any automation failures.

## Verified six-player smoke sequence

The final capture ran against a fixed production preview at `http://127.0.0.1:5174` with the original backend URL configured at build time. It completed with no automation errors and saved **20 desktop/mobile screenshots**. See the [visual inventory](../../visual-baselines/original/README.md).

| Behavior | Observed result |
|---|---|
| Create room and join by name | Passed using original UI and six isolated browser contexts |
| Waiting/player list | Captured one through six players |
| Start/deal | Six players, three-card presentation, initial pot 6 and balances 49 from starting 50 |
| Blind/seen | Card backs while blind; See reveals local hand and changes status |
| Blind bet | Pot increased from 6 to 7; turn advanced |
| Pack | Four active-turn Pack actions accepted; confirmation dialogs handled |
| Show | Two active players; gameShow became true; original manual winner panel appeared |
| Settlement | Submitted first eligible player through original selector; hand ended; balances totaled 300 |
| Another hand | Started successfully; mobile game captured |
| Refresh during hand | **Failed:** room loader rejected entry with “Room already has a game in process” |

This smoke test verifies a concrete working path, not all betting bounds, ranking rules, tie policies, side shows, all-in handling or disconnect scenarios. Separate 2–5-player deals, browser transport recovery without refresh, race conditions and server restart were not exhaustively tested.

## Confirmed security blockers

1. **Private cards are delivered before permitted disclosure.** During a started hand, the first test player was still blind while its Socket.IO state included **all three own cards and all fifteen opponent cards**. Rendering the backs does not protect those values. The capture report stores counts, not cards. This confirms the earlier suspected privacy failure for the deployed service.
2. **Unauthenticated room HTTP data exposes remaining deck information.** A request with no session credentials to our test room during a hand returned `cardsRemaining` with **34 remaining card identities**. It did not include `usersList`. An attacker can combine information from multiple surfaces; the endpoint must return a minimal authorized/public room view.
3. **A selected winner is accepted rather than independently adjudicated in the captured path.** The frontend submits `confirmWin`. The captured showdown shows the first player with a 4–5–6 sequence and the other active player with a 6–7–8 sequence. Selecting the first player still awarded that player the pot (final balance 56). The screenshot and settlement report demonstrate an incorrect result under the displayed Classic ranking rules. No authoritative evaluator is included in the source.

These findings concern only our controlled temporary room. No other users' room or information was inspected.

## Upstream quality and integration gaps

- `npm run lint` fails formatting; four original Svelte files have upstream formatting differences. Existing workspace workflow/planning documents also contribute formatting findings. No mass formatting was performed.
- ESLint configuration imports `@eslint/js`, which is not a declared installed dependency in the upstream package. The combined lint command does not reach that stage when Prettier fails.
- A fresh `svelte-check` invocation after the build reports one error: `page.error` may be null in `[roomName]/+error.svelte`, plus three landing-page keyboard accessibility warnings. The earlier isolated audit had failed to resolve `$app/tsconfig`; initialization/build state affects that diagnostic. The current result supersedes that earlier type-check observation for this workspace.
- The existing workflow uses pnpm and `typecheck`/`test` commands that the imported npm project does not provide. CI alignment is still needed.
- Socket room updates can be partial; a capture observer must merge updates as the original frontend does. The HTTP room endpoint returns metadata rather than the socket's player list.
- The backend lowercases submitted player names in observed waiting-list data. Preserve this as characterized behavior unless a later change is explicitly approved.

## Backend source investigation

The main repository contains no gameplay server. The previous historical file inventory and public owner repository listing did not identify one. The public fork `mrdk0697-tech/teen-patti` also contains frontend files, not the game server. Historical configuration references `localhost:8080`; the current development configuration references Render.

A follow-up repository metadata/issue lookup supplied no server-source reference, and the repository still has no detected license. No maintainer was contacted. Runtime access to the service is not access to its source, deployment configuration, shuffle implementation, persistence or authorization code.

Backend recovery and upstream reuse permission remain open dependencies. Deterministic rule/evaluator tests, server restart testing and owned deployment cannot be completed from this frontend alone.

See [Classic characterization](CLASSIC_CHARACTERIZATION.md) for observed rules and explicitly unverified cases.

## Minimal Phase 1 proposal

Preserve all frontend presentation. First obtain the game-service source and reuse correct logic. If unavailable, review an authoritative backend-only implementation behind the existing Socket.IO UI boundary.

Required narrow changes are server public/private serialization, no `cardsRemaining` disclosure, stable session/player identity, authenticated resume, server-side action validation and automatic outcome/settlement. Adapt the existing socket store and state types; retain player markup, PlayingCard, room forms, action labels and styles. Refactor DeclareWinner into a trusted-result display using its existing visual shell.

Do not proceed to variants or LiveKit while private-card delivery is unsafe. The backend/evaluator/restart gaps mean Phase 0 must not be described as a complete engine verification.

## Phase boundary

The original frontend import, local running baseline, six-player smoke characterization and screenshot inventory are delivered. Phase 0 remains incomplete for owned backend setup, exhaustive/deterministic rules verification and restart recovery because backend source is unavailable. Reuse terms also remain unresolved. Phase 1 implementation has not started.
