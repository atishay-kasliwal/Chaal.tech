# Cloudflare deployment

The production shape keeps the existing SvelteKit frontend and Node game server separate:

- Cloudflare Pages serves the web application.
- Render runs the Node.js 24+ game server from [`Dockerfile`](../Dockerfile) and [`render.yaml`](../render.yaml), with SQLite on an attached persistent disk.
- `VITE_SERVER_URL` points the frontend to the public game server URL.
- Cloudflare DNS maps `chaal.tech` to the Pages project and can map `api.chaal.tech` to the Node host.

The game server uses Node's HTTP/Socket.IO stack and `node:sqlite`; it is not deployed as a Pages Function or a basic Worker. Media remains optional. Configure LiveKit secrets only on the game server if media is enabled.

Run exactly one game-server process with this SQLite database. Do not enable horizontal autoscaling or multiple workers: presence and Socket.IO room broadcasts are process-local. Scale-out requires shared presence/broadcast infrastructure and a database designed for concurrent room ownership.

## Deploy the Pages project

The `chaal-tech` Pages project was created with Wrangler Direct Upload. Deploy updates from the repository with `npm run deploy:pages -- --project-name=chaal-tech --branch=main`. This uploads the build from the current checkout; it does not automatically deploy GitHub commits.

Production builds require `VITE_SERVER_URL` to point to the public HTTPS origin of the game server. The build rejects a missing value, localhost, and non-HTTPS endpoints so visitors cannot receive a bundle that tries to connect to their own computer. For example:

```sh
VITE_SERVER_URL=https://api.chaal.tech npm run deploy:pages -- --project-name=chaal-tech --branch=main
```

If you want Cloudflare to deploy automatically from GitHub, create a separate Git-integrated Pages project for this repository; the existing project is Direct Upload.

The repository also has a `wrangler.toml` and `npm run deploy:pages` for a CLI deployment. Git-connected Pages deployment is preferred so pushes to `main` deploy automatically.

## Deploy the game server

Create a Render Blueprint from this repository and review the service before applying it: [open the Chaal.tech Blueprint in Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fatishay-kasliwal%2Fteenpatti). The Blueprint creates one paid web-service instance and a 1 GB persistent disk. Persistent disks are required because the game server stores room state in SQLite; Render documents that the default filesystem is ephemeral and that persistent disks are available on paid services ([Render persistent-disk docs](https://render.com/docs/disks)). The service health check uses `/ready`.

The Blueprint configures:

```text
HOST=0.0.0.0
GAME_DATABASE=/var/data/chaal.sqlite
ALLOWED_ORIGINS=https://chaal-tech.pages.dev,https://chaal.tech,https://www.chaal.tech
HOST_GRACE_MS=30000
```

After Render creates the service, use its `onrender.com` hostname for the Cloudflare DNS record `api.chaal.tech` and for the frontend's `VITE_SERVER_URL`. Keep the SQLite directory private. Configure LiveKit credentials in Render as backend-only secrets; never use `VITE_` names for secrets. LiveKit Cloud URLs automatically enable revocation of cached participant tokens on leave or takeover; set `LIVEKIT_REVOKE_TOKENS=true` for another provider that supports the same API. Self-hosted LiveKit does not provide this revocation guarantee, though issued tokens expire after 60 seconds.

The current Pages project uses Direct Upload, so the frontend is deployed from this checkout after the backend hostname is known:

```sh
VITE_SERVER_URL=https://api.chaal.tech npm run deploy:pages -- --project-name=chaal-tech --branch=main
```

Then connect `chaal.tech` and `www.chaal.tech` to the Pages project in Cloudflare, create `api.chaal.tech` as a proxied CNAME to the Render hostname, and confirm DNS is active. Verify room creation, joining from a second browser, game actions, refresh/reconnection, and optional media before inviting players.

The game server runs a daily retention sweep by default (`RETENTION_SWEEP_MS=86400000`). Rooms with fewer than three historical joiners expire after 30 inactive days; rooms with three or more expire after 365 inactive days. Connected rooms and unfinished hands are protected. Idempotency receipts expire after 30 days, ledger entries after 365 days, and old player identities are removed only when no retained room references them. On the first startup after the schema migration, existing rooms, sessions, and receipts receive fresh timestamps so the upgrade itself does not trigger cleanup.

## DNS handoff

The Cloudflare authorization currently connected to Wrangler has Pages write access but only read access to DNS. A Cloudflare account admin can complete the custom-domain activation in the dashboard, or reauthorize Wrangler with DNS edit access for this zone. For the apex `chaal.tech`, Cloudflare must be authoritative for the domain; if the domain's nameservers are elsewhere, change them at the registrar to the Cloudflare nameservers shown for this zone. Add `api.chaal.tech` only after the game-server host provides its DNS target.
