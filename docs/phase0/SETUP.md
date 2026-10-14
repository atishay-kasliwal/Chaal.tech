> Historical Phase 0 baseline. The current application now uses the owned Phase 1 backend; use [Phase 1 setup](../phase1/IMPLEMENTATION.md) for current commands. Re-run original captures only against a separate checkout of the pinned original frontend.

# Phase 0: original application setup

The original Teen Patti frontend is imported from `mustafa-kapadia1483/teen-patti` at commit `3f0cb69a71d922557f9b17a08a78f413b2e90774`. The existing repository history and planning documents are retained. No frontend source or static asset was changed for Phase 0.

## Run the original UI

```sh
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173/.

The baseline was run with Node `v26.10.0`, npm `11.19.1`, and the checked-in npm lockfile. These are observed audit versions, not a newly selected production runtime.

The unchanged development configuration connects to the original external backend at `https://teen-patti.onrender.com`. This is not a fully local stack. Its availability, data retention and restart policy are outside this repository's control. Use temporary audit names/rooms rather than personal data. No backend credentials are needed by the original frontend.

For a production build, the original application expects `VITE_SERVER_URL` to identify the backend. Vite includes this public URL at build time. Never place API secrets in Vite public environment variables.

```sh
VITE_SERVER_URL=https://teen-patti.onrender.com npm run build
```

The original Netlify adapter is retained. Generated `.svelte-kit/`, `.netlify/` and dependency directories are ignored. No deployment is performed by Phase 0.

## Capture the baseline

Use a fixed production preview for captures so Vite cannot reload player sessions when audit files change:

```sh
VITE_SERVER_URL=https://teen-patti.onrender.com npm run build
npm run preview -- --host 127.0.0.1 --port 5174
```

The capture script uses the real original UI and a temporary isolated room on the hosted backend. It is an integration characterization, not a mock and not an engine implementation.

```sh
PHASE0_URL=http://127.0.0.1:5174 npm run phase0:capture
```

Playwright is pinned as a development dependency. By default the script uses installed Google Chrome on macOS. Override its executable if necessary:

```sh
PHASE0_CHROME=/absolute/path/to/chrome PHASE0_URL=http://127.0.0.1:5174 npm run phase0:capture
```

The script opens six isolated browser sessions, captures original screens, performs a small number of gameplay actions in its own test room, and closes all contexts. It does not join anyone else's room. It never records raw private card values or session identifiers in its JSON report. The public temporary room code and non-personal test names are recorded for provenance. Screenshots can show the synthetic players' test cards when the original UI reveals them.

Results are in `visual-baselines/original/`; `capture-report.json` is the authoritative inventory for a run. Read `errors` before treating the captures as a complete successful sequence. Screenshot files not listed in that report may be artifacts of an earlier failed capture and are not approved references.

Screenshots record browser behavior at desktop 1440×1000 and mobile 390×844, not real-phone media support. A full mobile validation is later scope. Dynamic room names, cards, toasts and animation frames mean these first evidence captures are not yet deterministic pixel-diff tests. Preserve them as original references; build controlled visual comparison fixtures separately without claiming mock rules are original-server behavior.

## Baseline checks

```sh
npm run build
npm run lint
./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json
node --check scripts/phase0/capture.mjs
node scripts/phase0/verify-import.mjs
```

The production build passes in the audit environment. Original formatting/accessibility/type-check findings are documented in `RESULTS.md`. They are intentionally not fixed by restyling source during capture.

The pre-existing `.github/workflows/ci.yml` still uses pnpm and script names absent from upstream. It was retained during import rather than silently replaced. Aligning that workflow and repairing quality tooling is a small follow-up task; a passing local build does not establish CI passes.

## What was imported and changed

- All upstream tracked frontend/config/static files were imported into the current root, without copying the upstream `.git` directory.
- Existing history, Git remote, workflow and planning documents were preserved.
- `.gitignore` merges the original project's build/dependency exclusions with current rules.
- `package.json` and lockfile add only a pinned Playwright development dependency and the capture command.
- `.env.example` documents the public original backend URL; no secret is included.
- `scripts/phase0/` and `docs/phase0/` contain audit tooling and evidence.
- `docs/phase0/import-provenance.json` records upstream hashes. All `src/` and `static/` files should match upstream byte for byte.

The missing backend remains a separate investigation. No replacement server, variant engine, LiveKit integration, or component redesign has been implemented.
