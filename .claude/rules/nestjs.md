---
paths:
  - "apps/server/**"
---

# NestJS server

Use the `nestjs-best-practices` skill (its **Pulse overrides** win) and `postgresql-table-design` for schema work. Layering: `docs/ARCHITECTURE.md` section 3.

- One module per spec operation group (spec 7.2). Controllers/gateways: transport and validation only. Services: use case and transaction boundary. Repositories: SQL only. `src/domain/`: pure functions, no Nest imports.
- Every write takes the client's command ID and goes through the idempotency store; every change bumps the user's revision and emits the matching event after commit (R-34, R-35).
- Every query is scoped to the authenticated user (owner check); never trust a client-supplied user ID.
- Schema changes only through versioned migrations; invariants (one running session, no overlap) live in the database as constraints, not only in code.
- Realtime: plain WebSocket gateway; validate every incoming message with the contract; never relay client payloads.
- Errors leave the server only in the contract's error shape, with the request ID.
- Integration tests run against a real PostgreSQL; unit tests cover `src/domain/` and services with fakes.
