# Chaal.tech

## Owned local Classic service

The original Svelte/DaisyUI interface now connects to an authoritative local game service. Use Node 24+ and `npm ci --ignore-scripts`, then run `npm run server` and `npm run dev` in separate terminals. Open the URL shown by Vite. The default backend is `http://127.0.0.1:8080`; see `.env.example` for configuration.

Run `npm run lint`, `npm run check`, `npm test` and `npm run build` for verification. `npm run phase1:browser` captures the stable preview at port 5174 while the backend is running.

Read [Phase 7 variant rules and verification](docs/phase7/IMPLEMENTATION.md), [Phase 6 mobile layout and verification](docs/phase6/IMPLEMENTATION.md), [Phase 5 table layout](docs/phase5/IMPLEMENTATION.md), [Phase 4 camera/audio setup](docs/phase4/IMPLEMENTATION.md), [Muflis rules](docs/phase3/IMPLEMENTATION.md), [Classic setup and rules](docs/phase1/IMPLEMENTATION.md), and the [original audit findings](docs/phase0/RESULTS.md). Classic remains the default. The room supports Classic, Muflis, AK47, Joker, Lowest Joker, 999, 2 Card and 4 Card, each with its own server rules module. Choose a variant in room creation or select the next hand's variant as host in Game Settings. The original theme, card renderer and game controls remain at the center of the evolved player layout.

Optional camera/audio uses LiveKit. Start a local `livekit-server --dev --bind 127.0.0.1` and configure the backend-only settings documented in `.env.example`. Join a game, click **Join camera/audio**, then enable camera/microphone separately. The game works without media. Phase 5 now evolves the original panels into a table with the viewer at bottom center and up to five friends around them. See the [Phase 5 implementation and screenshots](docs/phase5/IMPLEMENTATION.md). `npm run phase5:browser` verifies layouts for two through six players. `CAPTURE_DIRECTORY=visual-baselines/phase5/media npm run phase4:browser` verifies six synthetic camera/microphone users against the local development server. This remains a local single-server foundation; production media admission and deployment are future work. Dedicated mobile controls remain Phase 6.

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
