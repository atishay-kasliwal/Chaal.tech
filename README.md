# Chaal.tech

What's left and the ideas list: [docs/ROADMAP.md](docs/ROADMAP.md). Older docs are in [docs/archive/](docs/archive/).

## Cloudflare development

Chaal.tech keeps the existing SvelteKit, Svelte, Tailwind, and DaisyUI application on Cloudflare Pages. The authoritative game service runs on a Cloudflare Worker with one SQLite-backed Durable Object per room. The frontend game UI and game rules remain in this repository; the production boundary uses native WebSockets and stores confidential room state durably in Cloudflare.

Use Node 24+ and `npm ci --ignore-scripts`. Run `npm run dev:backend` and `npm run dev` in separate terminals, then open the Vite URL. The backend defaults to `http://127.0.0.1:8787`; provide a local `SESSION_SECRET` in `.dev.vars` or `.env`. See [Cloudflare deployment and local test instructions](docs/archive/cloudflare-deployment.md).

Run `npm run lint`, `npm run check`, `npm test`, `npm run test:cloudflare`, and `npm run build` for verification. `npm run phase1:browser` captures the local reference screen; use the Worker at port 8787 while running browser checks.

Classic remains the default. The room supports Classic, Muflis, AK47, Joker, Lowest Joker, 999, 2 Card, and 4 Card, each with its own server rules module. Poker, Blackjack, and Rummy use the shared room transport with their own game engines. The original theme, card renderer, and game controls remain at the center of the evolved player layout.

Optional camera and audio use LiveKit. Configure the three backend-only LiveKit secrets documented in [Cloudflare deployment](docs/archive/cloudflare-deployment.md). The game remains playable when media is disabled or unavailable.

## Development history

The upstream introduction and original getting-started notes follow.

![image](https://github.com/user-attachments/assets/6df9a58d-9e1f-49a8-81f4-32a6f00a654f)
![image](https://github.com/user-attachments/assets/dee8d58b-13a4-487c-9267-78855e589459)

## Introduction

Play a quick game of teen patti with your friends on the go without the need for signing up / logging in. Create a room share the link & start playing.

Created using [`create-svelte`](https://github.com/sveltejs/kit/tree/master/packages/create-svelte).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npm create svelte@latest

# create a new project in my-app
npm create svelte@latest my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.
