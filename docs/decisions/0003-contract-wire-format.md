# ADR-0003: Contract toolchain and wire format

## Status
Accepted (owner, 2026-10-25; written in T0.4)

## Date
2026-10-25

## Context
Spec section 7 asks for one contract source that generates server validators, a typed client and mocks, validates realtime messages too, and fixes the conventions: server time on every response, a command ID (and occurred-at on replay) on every write, the new revision on every mutation result and event, one error shape with eight codes, cursor pagination, integer seconds, UTC instants, `YYYY-MM-DD` days and 2-decimal credits (7.1). Section 11 proposes zod emitting OpenAPI and JSON Schema, NestJS validating from it, and Rust types from `typify` / `progenitor`. D-29 limits T0.4 to full shapes for Auth, Timer, Sessions, Tags, Goals, Preferences, Push, Sync, App updates and Health, all section 7.3 events and the section 6 entities; Stats, Credits, Usage, Achievements and Data are named only. `docs/ARCHITECTURE.md` sections 1-3 place the contract in `packages/contract`, generated Rust in `crates/contract-types`, and validation in the server's transport layer.

Constraints found in the generators' sources (2026-10-25):
- progenitor reads **OpenAPI 3.0.x only** (README) and asserts **at most one success type and one error type per operation** (`progenitor-impl/src/method.rs`); header parameters work, cookie parameters do not.
- typify reads JSON Schema through schemars' draft-07 model; `oneOf` becomes a Rust enum (internally tagged when every variant has a one-value tag property), `anyOf` is weak, `additionalProperties: false` becomes `deny_unknown_fields`, `format: uuid / date / date-time` become `Uuid` / chrono types.
- zod 4.6 converts natively (`z.toJSONSchema`) to `openapi-3.0` and `draft-07`, drops refinements, and in input mode closes only `z.strictObject`.
- NestJS 12 accepts a Standard Schema (zod) through `@Body({ schema })`, `@Query({ schema })` and `@Param({ schema })` and ships `StandardSchemaValidationPipe`.

## Decision

**Toolchain.** zod 4 is the only runtime dependency. One **operation catalogue** (`src/catalogue.ts`, tables per group in `src/catalogue/`) lists every spec 7.2 operation: kind `http` (group, method, path, auth, params, query, body, response or 204, extra error codes), `realtime` (the WebSocket channel) or `pending` (name-only, with the task that will shape it). Everything reads the catalogue:
- `pnpm --filter @pulse/contract generate` builds the package and writes `generated/openapi.json` (OpenAPI **3.0.3**), `generated/json-schema/pulse-contract.schema.json` (draft-07, every component under `definitions`) and `generated/examples.json` (a valid example of every operation part, event, realtime message and error code). `generate -- --check` writes nothing and exits 1 on drift; a contract test fails on drift too. Components are the exported schemas, named after their export. The generator removes zod's per-schema `$id`/`$schema` and the long regexes zod puts next to a `format`, so typify picks `Uuid` and chrono types; the TypeScript side still validates with the full zod schema (instants must end in `Z`).
- The **server** binds handlers with `@ContractRoute(name)` (method, path and status from the catalogue) and `@ContractBody/Query/Params(name)` (Nest's `schema` option), validated by one global `ContractValidationPipe` (Nest's built-in pipe validates the same way but cannot say whether a field came from the body, query or path). Handler signatures use `OperationBody<Name>`, `OperationResponse<Name>` and friends, so a contract change breaks the server's type check. One exception filter maps `AppError` and framework errors to the error shape.
- The **TypeScript client** (`@pulse/contract/client`) is derived from the catalogue at the type level, not generated: `createClient({ baseUrl, fetch, accessToken }).call(name, { params, query, body })`, returning errors as values and validating responses. `fetch` is injected; the module uses no global network API. The desktop UI imports types from `@pulse/contract` only.
- The **mock server** (`pnpm --filter @pulse/contract mock [-- --port 4010]`, `node:http` + `ws` as a dev dependency) validates requests with the catalogue, answers each operation's example, and on the WebSocket answers `auth` with `ready` and streams every example event.

**Routes and versioning.** Everything is under `/v1` except `/health` and `/health/live`. Reads are `GET`; every write is `POST` to a resource or a resource action (`/v1/sessions`, `/v1/sessions/{sessionId}/update`, `/v1/sessions/{sessionId}/delete`), so command bodies never ride on `DELETE`, whose body OpenAPI 3.0 tells consumers to ignore. Each operation has exactly one success status: 200 with a body, or 204 without. Errors use the statuses VALIDATION 400, UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, RATE_LIMITED 429, INTERNAL 500, UNAVAILABLE 503, always with the `ErrorBody` schema (one error type per operation, as progenitor needs); health reports a database outage as 503 UNAVAILABLE.

**Where things travel.**
- Server time: response header `Pulse-Server-Time` (ISO-8601 UTC with milliseconds, taken when the request arrives) on every HTTP response, errors and 404s included; field `serverTime` on every server realtime message.
- Request ID: header `Pulse-Request-Id` on every response and `requestId` in every error body.
- Command ID and occurred-at: body fields `commandId` and optional `occurredAt` on every command, so a stored outbox command is self-contained. Credential operations of the Auth group carry none (D-30); `auth.completeFirstSignIn` does.
- Revision: `revision` in every command result body and every event.
- Access token: `Authorization: Bearer` on HTTP; the first realtime message (`auth`) on the WebSocket, sent again when credentials rotate.

**Shapes.** Requests are closed (`z.strictObject`, `additionalProperties: false`, spec 9.1); responses, entities and events are open, so a server that adds a field does not break older apps. No defaults or transforms in body or response schemas (a test compares input and output schemas); only query values are parsed from URL text (`since=19` is an integer).

**Updates are field patches; clearing is explicit (2026-10-25, lead decision with the Rust contract-types work).** R-49 resolves concurrent edits per field by corrected occurred-at, so an update command must say which fields it changes; a full-state edit would overwrite another device's newer field. A request field is therefore never both optional and nullable (a contract test enforces this): typify turns such a field into an `Option<T>` that is skipped when `None`, so the Rust core could never send the null, and null-versus-absent would carry meaning nobody can see in the schema. Updatable fields that can be cleared use a per-field wrapper: `timer.updateRunning` and `sessions.update` take `title?: TitleUpdate`, `tagId?: TagUpdate`, `summary?: SummaryUpdate` (sessions only), each `{ value: T | null }` with `value` required. Absent means unchanged, `{ "value": "…" }` sets, `{ "value": null }` clears; clearing the tag means Untagged (R-50). Rust gets `Option<TitleUpdate>` whose inner `Option<String>` is always serialised, so a clear arrives as `null`. Start and update times are never cleared and stay plain optional fields. Create and start take plain optional fields (`title?`, `tagId?`, `summary?`): absent means none, null is rejected; there is no tri-state where nothing exists yet.
- Rejected: a `clear: ("title" | "tagId" | "summary")[]` list next to the values. It splits one field over two places and needs a "not both set and cleared" check that JSON Schema cannot express for typify.
- Generator detail: zod wraps an optional reference in a one-element `allOf`; the generator unwraps it to a plain `$ref` (the same schema, nothing for typify to merge). Credits are decimal strings with exactly 2 places (`"-3.25"`), never JSON numbers. Client-creatable objects carry their client-generated ID in the create command (`sessionId`, `tagId`). Lists of unbounded size (sessions, change feed) are cursor pages `{ items, nextCursor }` at the server's page size (Appendix A: 50); bounded per-user collections (tags, devices, goal history) come whole.

**Realtime and the change feed.** Path `/v1/sync/stream`. Client messages: `auth { accessToken }` and `ping` only, never state. Server messages, discriminated by `type`: `ready { revision }`, `event { event }`, `pong`, `error { error }` (sent before the server closes the channel). Events are discriminated by `name` and carry `revision` and `data`. The change feed (`GET /v1/sync/changes?since=`) returns the same data events, so clients apply live and fetched changes with one code path; `credentials.revoked` is live-only.

**Name-only operations (D-29).** They exist in the catalogue as `pending` entries with `definedBy` (T2.4, T4.4, T4.5, T4.6, T5.1, T6.1, T1.7, T7.10, TIM-05, TIM-06). They have no path, are absent from OpenAPI `paths`, and are listed under the root extension `x-pulse-pending-operations`; the realtime channel is described under `x-pulse-realtime`. The server has no route for them (NOT_FOUND).

**Shapes decided with the owner (2026-10-25).** T0.4 raised eight questions the spec did not answer; the owner accepted every recommendation. Five are recorded in the spec: command IDs on credential operations (D-30), re-authentication and the unverified sign-in answer (D-31), preference values (D-32), and the field limits (Appendix A, "Other field limits"). The other three are wire details recorded here, decided (owner, 2026-10-25):
- **`credits.changed`** carries `{ credits: { balance, rates } }`, the "balance snapshot (balance, rates)" of spec 7.2. Rates are non-negative credits per hour (schema `CreditRate`, which rejects a minus sign); the field (`earn`, `gaming`, `social`, `otherLeisure`) says whether they are earned or spent (R-42, R-43). T5.1, which shapes the Credits operations, may add an as-of instant if the live balance (R-45) needs one.
- **Google sign-in** takes either an `idToken` (Android Credential Manager) or an `authorizationCode` with its PKCE `codeVerifier` and loopback `redirectUri` (Windows; the server exchanges the code, since it holds `GOOGLE_CLIENT_SECRET`). Re-authentication (D-31: email change, account deletion) takes the same `GoogleCredential` schema as sign-in, `{ method: "google", credential }`, so a Windows account can re-authenticate too; T1.6's OAuth ADR narrows sign-in and re-authentication together, by changing that one schema.
- **The latest release** (App updates) is `{ platform, version, downloadUrl (HTTPS), sha256, signature }`: the checksum always, the signature (Tauri's updater on Windows) or null where the platform verifies otherwise (Android checks the APK signing key).

**Package resolution.** `@pulse/contract` exports `types` and the custom condition `@pulse/source` pointing at `src/*.ts`, and `default` pointing at `dist/*.js`. Type checks and Vitest (with `ssr.resolve.conditions` including `@pulse/source`) use the sources, so `check.mjs` can test before it builds; the running server uses `dist`, built by `pnpm -r build` (or `pnpm --filter @pulse/contract build` before `pnpm --filter @pulse/server dev`).

## Alternatives considered

### An OpenAPI library for zod (`zod-openapi`, `@asteasolutions/zod-to-openapi`)
- Pros: route registration helpers, OpenAPI 3.1 output.
- Cons: a second dependency over zod's native converter; the catalogue already holds methods, paths and parts, and the document builder is about 150 lines.
- Rejected: the native converter emits OpenAPI 3.0 schemas directly.

### OpenAPI 3.1
- Pros: aligned with JSON Schema 2020-12; zod's default target.
- Cons: progenitor reads 3.0.x only.
- Rejected; revisit if progenitor gains 3.1.

### REST verbs (`PATCH`, `DELETE`) with the command ID in an `Idempotency-Key` header
- Pros: conventional HTTP semantics; the IETF idempotency-key draft.
- Cons: `DELETE` bodies are ignored by OpenAPI 3.0 tooling; splitting a command between headers and body makes stored outbox commands less self-contained; per-item IDs in batches (usage increments) need body fields anyway.
- Rejected: one rule (`commandId` in the body, writes are `POST`) covers every command.

### Server time and revision in a response envelope (`{ serverTime, data }`)
- Pros: visible in every generated type.
- Cons: the spec fixes the error shape; 404s from unknown routes and body-parser errors would need their own envelope; every client type gains a wrapper.
- Rejected: a header reaches every response; revision stays in the bodies where the spec requires it.

### A generated TypeScript client (`openapi-typescript` + `openapi-fetch`)
- Pros: the same path as any OpenAPI consumer.
- Cons: two more dependencies and a generated file that can drift; the catalogue already has the zod types.
- Rejected: the type-level client cannot drift.

### Credits as JSON numbers
- Pros: no parsing.
- Cons: binary floats cannot hold every 2-decimal value; D-19 needs identical math in TypeScript and Rust.
- Rejected.

## Consequences
- One source: a schema change regenerates OpenAPI, JSON Schema and examples, and breaks the server's and the examples' type checks until they follow.
- The Rust contract types (`crates/contract-types`) consume only `generated/openapi.json` (progenitor) or the JSON Schema bundle (typify) plus `generated/examples.json` for conformance; their names are stable.
- Older apps keep working when responses gain fields; requests with unknown fields are rejected, so clients must not send fields the server does not know yet.
- Writes are all `POST`, which HTTP caches and proxies treat as non-idempotent; idempotency comes from `commandId` (R-34), not from the method.
- Watch: progenitor's handling of `nullable` + `allOf` and of `oneOf` unions with a one-value `enum` tag (OpenAPI 3.0 has no `const`); if it fails, change the generator, never the generated files.
