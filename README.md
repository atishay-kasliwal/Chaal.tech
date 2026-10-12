# TeenPatti V1

A real-money-free Teen Patti game built with Cloudflare Workers, Durable Objects, D1, LiveKit, and React.

## Project Structure

This is a pnpm monorepo with the following packages:

- `@teenpatti/protocol` - Zod schemas for validation of events, actions, and state.
- `@teenpatti/design-tokens` - Design tokens (colors, spacing, radius) for Tailwind CSS.
- `@teenpatti/frontend` - React + Vite frontend with Tailwind CSS.
- `@teenpatti/backend` - Cloudflare Worker with Durable Objects for game rooms and signaling.
- (Additional packages to be added: shared UI components, game engines, etc.)

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start development:
   ```bash
   pnpm dev   # starts all packages in parallel (backend worker, frontend vite)
   ```

3. Build for production:
   ```bash
   pnpm build
   ```

4. Run tests:
   ```bash
   pnpm test
   ```

5. Type checking:
   ```bash
   pnpm typecheck
   ```

6. Linting:
   ```bash
   pnpm lint
   ```

## Packages

### Protocol
Contains zod schemas for validating game events, actions, and state. Used by both backend and frontend.

### Design Tokens
Exports a token object with colors, spacing, and radius values used to configure Tailwind CSS in the frontend.

### Frontend
React + Vite application. Consumes `@teenpatti/protocol` and `@teenpatti/design-tokens`.

### Backend
Cloudflare Worker with Durable Objects. Implements game rooms, WebSocket signaling, SQLite ledger, and LiveKit token generation (to be implemented).

## Development Guidelines

- Follow the execution order in `PLAN.md` and the decisions in `DECISIONS.md`.
- Use the `AGENTS.md` for agent-specific rules.
- Keep packages loosely coupled and depend only on shared protocol and design tokens.
- Write tests before implementation (TDD).
- Ensure all code passes type checking, linting, and tests before committing.

## Next Steps

1. Complete the spike validations (S4 LiveKit, S6 Cloudflare backend).
2. Implement the backend Durable Object with full game logic.
3. Implement the frontend UI integrating with the backend via WebSocket.
4. Add authentication, allowlist, and room management.
5. Integrate LiveKit for video/audio.
6. Implement game engines (Teen Patti, Texas Hold'em).
7. Add social features (banker, lending, gifting).
8. Polish and harden for release.

---
*This README is a living document and will be updated as the project evolves.*