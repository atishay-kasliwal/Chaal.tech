# Cloudflare deployment

Chaal.tech uses Cloudflare for both the existing SvelteKit frontend and the authoritative game service. The frontend remains on the current Pages project. The game service is a Cloudflare Worker whose Durable Object namespace assigns one SQLite-backed object to each room.

```text
Browser
  ├─ HTTPS pages → Cloudflare Pages → existing SvelteKit/Svelte UI
  └─ HTTPS + WebSocket → Cloudflare Worker → room Durable Object
                                             ├─ durable SQLite room snapshot
                                             ├─ command receipts and chip ledger
                                             ├─ authoritative game transitions
                                             └─ per-room connected players
```

The game rules, variant modules, game components, room layout, and visual styling are reused. The transport boundary in the existing socket store now uses WebSocket messages with acknowledged commands. Room snapshots, command receipts, and the chip ledger are committed atomically in the room's Durable Object storage. The Node/Socket.IO server and file-backed `Store` remain available for the existing regression suite; production traffic goes to the Cloudflare Worker.

Each room is independently addressed from its invite code. A room object owns its private cards and deck; HTTP room previews return only public room metadata. Durable Object alarms handle expired turns, host recovery, and inactive-room retention. WebSockets use the hibernation API, so presence is restored from each live connection attachment and game state is loaded from durable storage after a restart.

## Local development and tests

Run the game Worker and SvelteKit dev server in separate terminals:

```sh
npm run dev:backend
npm run dev
```

The frontend defaults to `http://127.0.0.1:8787` for its game endpoint in development. Wrangler loads local values from `.dev.vars` and `.env`; provide a development-only `SESSION_SECRET` with at least 32 bytes. Do not reuse the production value locally.

The Cloudflare integration suite starts an isolated Wrangler runtime and exercises the session endpoint, room creation and idempotency, origin checks, two-player WebSocket synchronization, ready/start flow, and private-card projections:

```sh
npm run test:cloudflare
```

The existing `npm test` suite continues to test the shared game engines through the Node test server. Run `npm run lint`, `npm run check`, `npm test`, `npm run test:cloudflare`, and `npm run build` before deployment.

## Production deployment

Wrangler must be authenticated to the Cloudflare account. The `SESSION_SECRET` is a production-only signing key for club sign-ins, five-minute game credentials and unguessable, retry-safe room codes. Sign-in and membership setup (Google client ID, `MONGODB_URI`) is in [PRIVATE_CLUB.md](PRIVATE_CLUB.md). Generate and upload it without putting its value in shell history:

```sh
openssl rand -hex 48 | node_modules/.bin/wrangler secret put SESSION_SECRET --config wrangler.game.toml
```

Deploy the backend and its SQLite Durable Object migration:

```sh
npm run deploy:backend
```

Wrangler prints the Worker URL, normally `https://chaal-game.<account-subdomain>.workers.dev`. Set that exact origin as `VITE_SERVER_URL` when building and deploying the existing Pages project:

```sh
VITE_SERVER_URL=https://chaal-game.<account-subdomain>.workers.dev npm run deploy:pages -- --project-name=chaal-tech --branch=main
```

The Worker allowlist currently permits `chaal.tech`, `www.chaal.tech`, the existing `chaal-tech.pages.dev` site, and localhost development origins. If the Pages project URL changes, update `ALLOWED_ORIGINS` in `wrangler.game.toml` and redeploy the Worker.

The first production deployment is live at `https://chaal-tech.pages.dev`; the game Worker is `https://chaal-game.s6-backend-spike.workers.dev`. The Pages project has `chaal.tech` and `www.chaal.tech` attached, but both remain pending until DNS points at Pages. Add these records in the `chaal.tech` Cloudflare DNS zone:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `@` | `chaal-tech.pages.dev` | Proxied |
| CNAME | `www` | `chaal-tech.pages.dev` | Proxied |

Use Auto TTL. The current Cloudflare login can manage Workers and Pages but has Zone read access only, so it cannot create those DNS records through the API. The game API can stay on its `workers.dev` hostname; a custom `api.chaal.tech` hostname is optional.

After each deploy, verify `/health` and `/ready`, create a room from the deployed site, join from a second browser, start a hand, refresh and reconnect, and confirm that opponent cards remain masked before reveal. The automated Cloudflare suite covers the same protocol locally.

## Optional LiveKit media

Camera and microphone remain independent of game state. The Worker issues LiveKit credentials only for an authenticated player with an active seat. Missing LiveKit credentials do not stop room creation or gameplay; the frontend reports media as unavailable and keeps the card game usable.

Configure the following Worker secrets only after the LiveKit project is ready:

```sh
node_modules/.bin/wrangler secret put LIVEKIT_URL --config wrangler.game.toml
node_modules/.bin/wrangler secret put LIVEKIT_API_KEY --config wrangler.game.toml
node_modules/.bin/wrangler secret put LIVEKIT_API_SECRET --config wrangler.game.toml
```

The Worker issues short-lived room/identity-scoped tokens using the game engine's `playerId`, `roomId`, and server-owned seat. It calls LiveKit's participant removal endpoint on an explicit game-room leave. No LiveKit state is stored in the room snapshot or used to authorize a card action.

## Data and rollout notes

Room state is private to its room Durable Object. A room's current snapshot, idempotency receipts, and chip movements share a transactional SQLite database. Membership lives in MongoDB (see [PRIVATE_CLUB.md](PRIVATE_CLUB.md)); game credentials are short-lived signed tokens bound to a member's stable player ID. Rotating `SESSION_SECRET` signs every member out and changes deterministic room-code derivation for future creates, so keep it stable and backed up in Cloudflare's secret store.

This rollout starts with an empty Cloudflare Durable Object namespace. The prior SQLite file was a local/test deployment artifact and is not imported. The Node SQLite store and Docker/Render deployment are no longer part of the production path.

## Continuous deployment

`.github/workflows/ci.yml` tests every push and pull request. A push or merged pull request to `main` that passes lint, type-check, both test suites and the build is deployed automatically: the game Worker first, then the Pages site, followed by a production health check. Run the workflow manually from the Actions tab to redeploy.

The deploy job needs two repository secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account that owns `chaal-game` and `chaal-tech`.
- `CLOUDFLARE_API_TOKEN` — an API token with **Account › Workers Scripts › Edit** and **Account › Cloudflare Pages › Edit** for that account.

Without them the deploy job is skipped with a warning and tests still run. Worker secrets (`SESSION_SECRET`, `RESEND_API_KEY`, LiveKit) live in Cloudflare and are not touched by deploys.
