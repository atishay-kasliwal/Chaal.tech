# Phase 9: Reliability and operations

Phase 9 is in progress. This increment adds operational signals and orderly shutdown behavior to the existing single-process service. It does not claim production deployment or multi-instance support.

## Changes

- `GET /health` is a liveness probe. It confirms the HTTP process can answer without reading or exposing game state.
- `GET /ready` runs SQLite `PRAGMA quick_check(1)`. It returns `200 {"ok":true}` only when the database check passes and otherwise returns a generic `503 {"ok":false}` response. Database error details are not sent to the caller.
- `close()` is repeatable, stops the turn-recovery timer, closes Socket.IO connections, waits for pending LiveKit participant cleanup, checkpoints the SQLite WAL when possible, and closes the database.
- The existing test suite continues to exercise six Socket.IO clients, per-player hidden-card views, repeated and concurrent commands, host/player departure, media failures, timeout settlement, and restart recovery for all eight variants. New coverage separates liveness from database readiness and calls close twice.

## Run checks

```sh
npm run lint
npm run check
npm test
npm run build
```

For local service checks, `curl http://127.0.0.1:8080/health` tests liveness and `curl http://127.0.0.1:8080/ready` tests database readiness. Both responses are intentionally small and contain no room or player data.

## Operational limits still open

- The game service owns rooms in one Node process. Running multiple replicas against the same SQLite database is unsupported; concurrent deployment requires explicit room ownership or a shared transactional database design.
- Production still needs a durable mounted database volume, an encrypted and tested backup/restore procedure, TLS, configured origin allowlists, secrets management and a rollback plan.
- The repository has deterministic local six-player tests and prior six-browser localhost checks, but not WAN soak testing, real-device network degradation, SFU restart testing, production latency targets or deployment rollback evidence.
- `PRAGMA quick_check(1)` is a readiness signal, not a full integrity audit or backup guarantee. Run deeper integrity checks and restore drills on a scheduled operational path.

Those activities depend on choosing and accessing the production host and storage. They should be completed before calling the platform production-ready.
