# Technology Stack (V1)

Status: **CHOSEN by owner.** Supersedes the Node/Fastify/PostgreSQL/Redis/LiveKit/Socket.IO suggestions in the two specs. Conflicts: this file and DECISIONS.md win.

| Part | Technology |
|---|---|
| Website | React + Vite, TypeScript strict |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers |
| Game rooms | Durable Objects (one per room) |
| Game state and per-room ledger | Durable Object SQLite |
| Global data (allowlist, users, sessions, room index) | D1 |
| Video and audio | Cloudflare Realtime SFU |
| NAT fallback | Cloudflare TURN |
| Teen Patti | Custom TypeScript engine |
| Poker | TypeScript engine (candidate: wrap poker-engine-ts, subject to spike S1) |
| Styling | Tailwind with design tokens |
| Animation | Motion (Framer Motion) |
| Local UI state | Zustand |
| Validation | zod schemas in `packages/protocol` |
| Tests | Vitest (Workers pool for Durable Object tests), fast-check, Playwright |
| Monorepo | pnpm workspaces + Turborepo |

Not used in V1: Postgres, Redis, Socket.IO, Fastify, Node server.

## How the spec concepts map

| Spec concept | In this stack |
|---|---|
| PostgreSQL system of record | Per-room data in Durable Object SQLite; users and allowlist in D1 |
| Row-level locking | A Durable Object runs one room serially; chip moves use a SQLite transaction inside the room object, plus idempotency keys |
| Redis presence | Not needed; the room object holds presence |
| Game gateway (WebSocket) | The room Durable Object itself, using hibernating WebSockets |
| Turn timers | Durable Object alarms |
| Migrations | D1 migrations and Durable Object SQLite migrations, both committed and immutable once applied |
| Per-room accounts | Already per room, so each room's ledger lives in that room's object |
| History across rooms | Room object writes a summary row to D1 when a hand or room completes |
| RNG | Web Crypto (`crypto.getRandomValues`) with unbiased Fisher-Yates; seeded PRNG in tests only |

## Video: Cloudflare Realtime SFU

- It is a raw SFU, not a room product. We build: session and track management through its API, signaling through the room Durable Object, active speaker detection (audio levels), media reconnect handling and the tile UI.
- Keep it behind our own `MediaProvider` interface so game code never calls it directly.
- Free allowance reported as 1,000 GB egress a month, shared with TURN. The pricing pages disagreed on the free-tier wording, so confirm on the dedicated pricing page before relying on it.
- Fallbacks if the spike fails: Daily, or peer-to-peer for laptop-only groups.

## Known risks and the spikes that answer them

| Risk | Spike |
|---|---|
| Free Workers/Durable Object limits (100k requests/day including WebSocket messages, 100k row writes/day; failures until 00:00 UTC) vs a real 8-player session | S6 |
| Ledger conservation and idempotency inside a Durable Object | S6 |
| Raw SFU effort: signaling, active speaker, reconnect, 8 tiles on phones | S4 |
| Durable Object SQLite backup and restore story for production readiness | S6 (verify what point-in-time recovery exists; do not assume) |
| Engines and libraries must run in the Workers runtime (no Node-only APIs) | S6 |
| Lock-in to Cloudflare | Keep engines and protocol in pure packages; storage behind an interface |

## Gates and fallbacks

- S4 (video proof of concept) and S6 (backend validation) must both pass before the complete application begins. Acceptance lists are in PLAN.md.
- If S4 fails: Daily behind `MediaProvider`. Room UI and engines are unchanged.
- If S6 fails: Node.js plus PostgreSQL for the backend, using the same pure engines and protocol packages.
- `MediaProvider` stays in place regardless, so the SFU can be replaced without touching the room UI or game engines.

## Account and domain

- The Cloudflare account that owns the app and its domain is **katishay45@gmail.com**. Domain: **chaal.tech** (bought 2026-10-11; nameservers being moved to Cloudflare).
- Free-tier limits (Workers, Durable Objects, D1, Pages Functions) are per account, not per domain, so one account and one domain is the plan. Do not split the app across accounts to multiply limits.
- Before any deployment (S4, S6 or later), confirm `wrangler whoami` shows this account. The wrangler login found on the build machine on 2026-10-11 was a different account (katishay@gmail.com) and must not be used.
