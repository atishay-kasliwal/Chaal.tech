# Cloudflare deployment

The current production shape keeps the existing SvelteKit frontend and Node game server separate:

- Cloudflare Pages serves the web application.
- A Node.js 24+ host runs `server/index.mjs` and persists `GAME_DATABASE` on durable storage.
- `VITE_SERVER_URL` points the frontend to the public game server URL.
- Cloudflare DNS maps `chaal.tech` to the Pages project and can map `api.chaal.tech` to the Node host.

The game server uses Node's HTTP/Socket.IO stack and `node:sqlite`; it is not deployed as a Pages Function or a basic Worker. Media remains optional. Configure LiveKit secrets only on the game server if media is enabled.

## Deploy the Pages project

The `chaal-tech` Pages project was created with Wrangler Direct Upload. Deploy updates from the repository with `npm run deploy:pages -- --project-name=chaal-tech --branch=main`. This uploads the build from the current checkout; it does not automatically deploy GitHub commits.

Before the game server is online, the Pages build can be published without a production `VITE_SERVER_URL`, but room connections will still use the local development default and will not work for visitors. Once the Node game server has a stable public URL, build with `VITE_SERVER_URL` set to that origin and deploy again. For example:

```sh
VITE_SERVER_URL=https://api.chaal.tech npm run deploy:pages -- --project-name=chaal-tech --branch=main
```

If you want Cloudflare to deploy automatically from GitHub, create a separate Git-integrated Pages project for this repository; the existing project is Direct Upload.

The repository also has a `wrangler.toml` and `npm run deploy:pages` for a CLI deployment. Git-connected Pages deployment is preferred so pushes to `main` deploy automatically.

## Configure the game server

Deploy the repository's existing Node service on a Node 24+ host that supports a persistent disk or another durable storage location. Set:

```text
PORT=<provided by the host>
HOST=0.0.0.0
GAME_DATABASE=<path on durable storage>/teen-patti.sqlite
ALLOWED_ORIGINS=https://chaal.tech,https://www.chaal.tech
```

If Pages previews will connect to the server, add their exact origin(s) to `ALLOWED_ORIGINS`. Do not expose the SQLite database directory publicly. Configure LiveKit credentials as backend-only secrets; never use `VITE_` names for secrets.

After the game server has a stable public URL, set `VITE_SERVER_URL` in Pages and redeploy the frontend. Then verify room creation, joining from a second browser, game actions, refresh/reconnection, and optional media before inviting players.

## DNS handoff

The Cloudflare authorization currently connected to Wrangler has Pages write access but only read access to DNS. A Cloudflare account admin can complete the custom-domain activation in the dashboard, or reauthorize Wrangler with DNS edit access for this zone. For the apex `chaal.tech`, Cloudflare must be authoritative for the domain; if the domain's nameservers are elsewhere, change them at the registrar to the Cloudflare nameservers shown for this zone. Add `api.chaal.tech` only after the game-server host provides its DNS target.
