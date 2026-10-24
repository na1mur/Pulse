# Pulse - Complete Product & Technical Specification (for a ground-up rebuild)

> Generated 2026-10-24 from the repository at commit `92a9660` (branch `main`).
> Purpose: capture everything the current app does, how it does it, and where it is weak, so Pulse can be rebuilt from scratch on a new stack with better UX, error handling and performance, without reading the old code.
> Method: three parallel code-reading passes (backend, shared packages + docs, desktop client). Nothing was executed except two small repros in the backend pass; "probably" statements are unverified.

## How to use this document

| Part | Source | Read it for |
|---|---|---|
| **Part A. Executive summary** | this section | What Pulse is, the decisions a rewrite must make, the top defects |
| **Part B. Backend** | `apps/api` | Data model, REST + Socket.IO contracts, auth, business rules (day boundaries, goals, streaks, tags), backend defects |
| **Part C. Shared layer** | `packages/*`, root, `docs/` | Types/schemas, the timer-sync algorithm, client data layer, tooling, shared defects |
| **Part D. Desktop client (reference UI)** | `apps/desktop` | Every screen, exact copy, timer UX, stores, design tokens, UX defects, UI redesign proposals |

Scope note: `apps/mobile` (Expo / React Native, v0.0.5) was deliberately **not** analysed. It has the same features as desktop and reuses the same shared packages, so Part D stands in for both clients. Mobile-only concerns (Android foreground service for the running timer, battery-optimization prompts, EAS builds) are therefore **not documented** here; if the rebuild includes mobile, those need a separate look.

Each part has its own numbering and its own "Problems" and "Rewrite recommendations" sections. Line cites (`file:line`) refer to the old code at the commit above.

---

# Part A. Executive summary

## A.1 What Pulse is

A personal **daily work-time accumulator** with a single play/pause timer, synced live across the user's devices.

- The big clock shows *total worked time today*, not a per-session stopwatch.
- Every play -> pause pair becomes a **session** (start, end, optional title, optional tag, optional summary).
- Users set daily / weekly / monthly goals, see stats and charts, filter by user-defined **tags**, and get goal-reached toasts/notifications.
- Accounts are email + password with access/refresh tokens. Self-hosting via Docker is supported.
- Clients: Windows Electron app and Android Expo app (identical features). Backend: Node/Express 4 + MongoDB (Mongoose) + Socket.IO. Monorepo: pnpm + Turborepo, TypeScript throughout.

## A.2 Current architecture in one picture

```
 Desktop (Electron/React)      Mobile (Expo/RN)            <- identical features
        \                         /
   @repo/queries  @repo/utils  @repo/api-client  @repo/types   (shared TS; Zod schemas used only by API)
        \                         /
   HTTP (REST, Bearer JWT 15m + refresh)   +   Socket.IO (timer_* relay events)
                       |
              Express + Socket.IO (single process, in-memory limiter/adapter)
                       |
                    MongoDB  (User[with embedded activeTimer], WorkSession, DailyStats, Tag, RefreshToken)
```

Key design choice that drives most bugs: **the timer runs on the client** (`{isRunning, startedAt, elapsedBeforeCurrentRun}`), the **client creates sessions** by POSTing on pause, and the server merely stores/relays an opaque "active timer" snapshot. Reconciliation across devices compares device-local clock stamps with server stamps.

## A.3 Feature inventory (rebuild checklist)

- Auth: register, login, refresh, logout (no password reset / change, no email verification, no account deletion).
- Timer: play (with a Resume / Skip / 5-second auto-skip modal for title+tag), pause (summary dialog, session saved when it closes), live cross-device sync, midnight rollover splitting, offline queue.
- Sessions: history list with pagination and ranges (today/week/month/year), title, summary, tag. **No edit or delete.**
- Goals: daily/weekly/monthly targets in minutes (0 = disabled), progress bars, achievement events (toast + native notification), streak.
- Stats: today, 7-day (calendar week), 30-day (rolling), weekly rollups, by-tag breakdown, summary (total, average, best day, streak, goal-achievement %), all optionally tag-filtered.
- Tags: create (idempotent, case-insensitive unique per user), rename, delete (sessions become untagged), picker on resume, tag management in settings.
- Settings: targets, timezone, theme (light/dark/system), desktop-only: launch at login and close-to-tray.
- Desktop shell: tray, single window, auto-start, no mini-window.

## A.4 Decisions the rewrite must make up front (do not let these be accidental again)

1. **Who owns the timer?** Recommended (all three passes agree): server-authoritative, versioned timer commands (`start/pause/resume/stop` with a client-generated UUID and the server's clock), session created by the server on stop, offline commands in an outbox with idempotency keys.
2. **One timezone policy.** Today the device timezone decides client-side day boundaries while the user-settings timezone decides server stats. Pick one (user-setting, stored per day-record) and implement it in exactly one place.
3. **Time semantics:** are sessions split at midnight (currently the *client* splits; the server attributes a whole session to its start day)? Define it once, server-side.
4. **Definitions of week/month/streak.** Today "week" is calendar Mon-Sun on some endpoints and rolling 7 days on others; "month" is rolling 30 days; the streak resets to 0 until you work *today*. Decide and document.
5. **Data store:** relational with transactions (Postgres/SQLite) is recommended over Mongo; the data is small and relational, and DailyStats is derivable.
6. **Session mutability:** add edit/delete/manual-entry (the old app has none), which forces the stats model to be derived or recomputed.
7. **Platform:** Tauri 2 (or native) instead of Electron; single shared client core instead of duplicated desktop/mobile stores and hooks.

## A.5 Top defects of the current app (ranked, details in Parts B-D)

**Security / crash (backend)**
- Any authenticated user can crash the whole API process by emitting `timer_status_response` with no payload (`apps/api/src/socket.ts:96-100`).
- That same relay lets a user push timer state into **another user's** room (`socket.ts:98`).
- `POST /auth/logout` accepts a Mongo operator (`{"$ne":null}`) as the refresh token and can delete someone else's token (`routes/auth.ts:212`).
- Refresh tokens stored in plaintext; CORS `*`; in-memory rate limiter; weak default secrets accepted; account enumeration on register.
- A local `apps/api/.env` exists containing live-looking Atlas credentials (untracked; not copied into this document). **Rotate those credentials** if they were ever shared or pasted anywhere.

**Data loss / correctness (clients + sync)**
- Session lost if the app quits while the pause summary dialog is open, or while running then relaunched offline.
- Offline Play then Pause drops the Play socket event; a 400 from the offline queue silently discards the session.
- Restarting the app force-pauses a running timer without saving a session.
- Opening the app offline after the 15-minute access token expires shows the login screen.
- Summary-dialog delay inflates the saved session's end time.
- `POST /sessions` has no idempotency key and is not transactional; retries duplicate sessions and double-count the day.
- Timer start/pause writes run unordered; a stale write can win.
- A timezone change leaves old daily stats keyed to the old zone.
- Day rollover only runs while the Dashboard is mounted.

**Likely deployment break**
- The production Docker image probably cannot start: compiled CommonJS requires `@repo/validation`, which exports raw `.ts` (unverified, Docker not run).

**Engineering hygiene**
- No tests in the backend, none in the clients (only 7 timer-sync unit tests in `packages/utils`), no CI, stale README, `packages/ui` is dead scaffolding, desktop and mobile duplicate the timer store and sync hooks almost verbatim, Zod schemas are not shared with clients.

**UX (desktop)**
- No router (navigation is one `useState`); theme flash on load; 10 Hz clock re-render; default Electron menu and DevTools ship in production; accessibility gaps; confusing play flow (modal before the clock starts).

## A.6 Suggested rebuild order

1. Write down decisions A.4 and the domain model (sessions, tags, goals, days, timer commands).
2. Backend: schema + auth + command-based timer + derived stats + realtime, with tests for the day/timezone/goal math first (Part B section 6 and Part C section 4 are the spec).
3. Shared core: one platform-agnostic client core (state machine, outbox, sync) used by every client.
4. Desktop/mobile UI against the redesigned IA in Part D section 8.
5. CI, release automation, self-hosting image tested end to end.

---


# Part B. Backend

# Pulse Backend (`apps/api`) - Complete Behavioral Specification

Scope: `apps/api/**`, root `Dockerfile`, `docker-compose*.yml`, `.env.docker.example`, `docs/SELF_HOSTING.md`, `docs/RELEASE.md`, `apps/api/README.md`, `apps/api/.env.example`. Shared packages (`@repo/validation`, `@repo/types`) were read only where needed to define request/response shapes; they are reproduced here so this document is self-sufficient.

Paths are relative to `D:\Personal\Hobby Projects\Pulse` and cited as `file:line`.

The backend is small (about 1,900 lines of TS, 0 tests). It is a single Express 4 process with MongoDB (Mongoose) and a Socket.IO server on the same HTTP server. All authority about "what is the user's day" lives here (timezone-aware day keys), while all timer arithmetic lives in the clients; the server only stores and relays an opaque "active timer" snapshot.

---

## 1. Stack and runtime

### 1.1 Technology and versions

| Concern | Choice | Version (package.json / installed) |
|---|---|---|
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess`, target ES2022 | TS 5.9.2 |
| Module output | `tsc` -> `dist/` (CommonJS in practice: compiled output uses `require`) | `module: NodeNext` from `packages/typescript-config/base.json` |
| HTTP | Express | `^4.21.2` (installed 4.22.2); note `@types/express ^5.0.0` is mismatched with Express 4 |
| Realtime | socket.io (server) | `^4.8.3` |
| DB | MongoDB via Mongoose | mongoose `^9.7.3`; README says MongoDB 6+; compose uses `mongo:7` |
| Auth | jsonwebtoken `^9.0.3` (HS256 default), bcrypt `^6.0.0` (native) | |
| Validation | zod `^3.24.1` (installed 3.25.76), schemas in `@repo/validation` | |
| Security middleware | helmet `^8.2.0`, cors `^2.8.6`, express-rate-limit `^8.5.2` (in-memory store) | |
| Config | dotenv `^17.4.2` + zod env schema | |
| Dev runner | `tsx watch src/index.ts` | tsx `^4.22.4` |
| Lint | eslint 9 via `@repo/eslint-config/base` (`--max-warnings 0`) | |
| Tests | NONE (no test script in api; turbo `test` task exists but nothing implements it for api) | |
| Monorepo | pnpm 10.0.0 workspaces + turbo 2.x | `.npmrc` has `frozen-lockfile=false` |
| Node | root `engines >=18`; Docker uses `node:20-alpine`; dev machine Node 24 | |

npm scripts (`apps/api/package.json`): `dev` (tsx watch), `build` (`tsc`), `start` (`node dist/index.js`), `lint`, `check-types`, `db:drop` (`tsx scripts/drop-database.ts`, drops the entire DB named by `MONGODB_URI`, no confirmation prompt; `scripts/drop-database.ts:4-12`).

### 1.2 Environment variables (`src/config.ts`)

Parsed once at import with zod; on failure it prints `Invalid environment variables` and `process.exit(1)` (`config.ts:27-32`). `dotenv.config()` loads `.env` from the process CWD (`config.ts:5`).

| Var | Required | Default | Validation | Used for |
|---|---|---|---|---|
| `PORT` | no | `3001` | `z.coerce.number()` | listen port |
| `MONGODB_URI` | yes | none | non-empty, must start with `mongodb://` or `mongodb+srv://` | Mongo connection |
| `JWT_SECRET` | yes | none | string min 8 chars | HS256 access-token signing key |
| `JWT_REFRESH_SECRET` | yes | none | string min 8 chars | HS256 refresh-token signing key |
| `NODE_ENV` | no | `development` | enum development/production/test | parsed but never read anywhere in code (only Docker sets it) |

`.env.example`: `PORT=3001`, `MONGODB_URI=mongodb://localhost:27017/pulse`, `JWT_SECRET=supersecretjwtkeychangeinproduction`, `JWT_REFRESH_SECRET=supersecretjwtrefreshkeychangeinproduction`, `NODE_ENV=development`. The placeholder secrets pass validation (>= 8 chars), so a deployment that forgets to change them boots fine.

Hard-coded (not configurable) values: access token TTL 15 min, refresh TTL 7 days (`utils/auth.ts:6-7`, and again as a literal 7-day ms expression in `routes/auth.ts:56,112,170`), bcrypt cost 10 (`utils/auth.ts:10`), rate limits (500 and 100 per 15 min), page size default 20 / max 100 (`routes/session.ts:18-19`), `trust proxy = 1`, CORS `*`.

Docker-compose-only vars (root `.env`, from `.env.docker.example`): `API_PORT` (host port mapping, default 3001), `JWT_SECRET`, `JWT_REFRESH_SECRET`, optional `MONGODB_URI` (default `mongodb://mongo:27017/pulse` in the bundled compose; required in api-only compose).

### 1.3 Boot sequence (`src/index.ts`)

1. Import `config` (env validated, may exit).
2. Create Express app; `app.set("trust proxy", 1)`; `helmet()` defaults; `cors()` (allow all origins, no credentials); `express.json()` (100kb default limit); `generalLimiter` on everything.
3. Routes: `GET /health` (before auth), then `/auth` (extra `authLimiter`), `/sessions`, `/stats`, `/tags`, `/settings`, `/users`.
4. `createServer(app)`; `initSocket(server)` attaches Socket.IO to the same server.
5. `startServer()`: `connectDatabase()` (mongoose connect; on failure logs and `process.exit(1)`; registers connected/error/disconnected log listeners) then `server.listen(port)`. A rejection of `startServer` is only logged (`index.ts:75-77`), not fatal.
6. No graceful shutdown, no signal handlers, no `unhandledRejection` handler, no global Express error handler, no 404 handler.

Mongoose is used with default `autoIndex` (indexes are built on startup by the app itself; no migrations exist). There is no seed data and no migration system; schema changes are implicit.

### 1.4 Deployment / Docker

`Dockerfile` (multi-stage, `node:20-alpine`, pnpm 10.0.0 via corepack):
- Builder: copies only package.json files, `pnpm install --frozen-lockfile --filter api...`, then copies `apps/api` and `packages`, runs `pnpm --filter api build` (tsc).
- Runner: `NODE_ENV=production`, re-installs prod deps (`--prod --filter api...`), copies `apps/api/dist` and `/app/packages` from builder, `WORKDIR /app/apps/api`, `EXPOSE 3001`, `CMD ["node","dist/index.js"]`. Runs as root; no `HEALTHCHECK`; no `USER`.
- IMPORTANT LIKELY-BROKEN: `@repo/validation` and `@repo/types` have `"exports": {".": "./src/index.ts"}` (raw TypeScript, no build step), while the API compiles to CommonJS `require("@repo/validation")` (verified in `dist/routes/auth.js:4`). Running `node dist/index.js` on Node 20 would hit `ERR_UNKNOWN_FILE_EXTENSION` for `.ts`. It only works under `tsx` (dev) or a Node version with type-stripping that also allows it outside `node_modules` (22.18+/24). Not verified by running Docker; confirm before relying on the image. The existing `apps/api/dist` in the working tree is also stale (it has no Tag model/route/tags utils).

`docker-compose.yml`: services `mongo` (image `mongo:7`, volume `pulse-mongo-data:/data/db`, healthcheck `mongosh ping`, no auth enabled, not published to host) and `api` (build `.`, restart `unless-stopped`, port `${API_PORT:-3001}:3001`, env PORT/MONGODB_URI/JWT_SECRET/JWT_REFRESH_SECRET/NODE_ENV=production, `depends_on mongo: service_healthy`). `docker-compose.api-only.yml`: only `api`, `MONGODB_URI` must be supplied (external Atlas/self-hosted). Unset `JWT_*` in compose resolve to empty strings and the zod check kills the process at boot (fail-fast).

`docs/SELF_HOSTING.md` (summary of operational guidance): options A1 (compose with bundled Mongo), A2 (compose api-only with external URI), B (manual Node + PM2 + nginx reverse proxy with WebSocket upgrade headers). Clients are pointed at the server by `VITE_API_URL` (desktop) or `EXPO_PUBLIC_API_URL` (mobile, baked at build time). Backups: `mongodump`. Security notes: change secrets, HTTPS, keep Mongo private. Caddy example `reverse_proxy localhost:3001`. Node 18+/Mongo 6+ claimed. `docs/RELEASE.md` is purely a client release checklist (bump version in root, `apps/api`, desktop, mobile, `packages/*`; build Windows installer and Android APK; tag `vX.Y.Z`; upload to GitHub Releases) with no backend-specific steps. Current version everywhere: 0.0.5.

`apps/api/README.md` is stale: it lists socket events `session_started`/`session_paused` (the code emits `timer_started`/`timer_paused`/`timer_reset`/`session_created`), omits `/tags`, `/stats/weeks`, `/stats/by-tag`, and lists collections without `tags`.

Local working-tree note: `apps/api/.env` (git-ignored, never committed per `git log --all`) contains live-looking MongoDB Atlas credentials. Treat as secrets to rotate if the directory is shared. Credentials are intentionally not reproduced here.

---

## 2. Data model (MongoDB / Mongoose, 5 collections)

All use Mongoose `timestamps: true` unless noted (adds `createdAt`, `updatedAt`), default `_id: ObjectId`, `__v` version key. Mongoose pluralizes names: `users`, `worksessions`, `dailystats`, `refreshtokens`, `tags`.

### 2.1 `User` (`models/User.ts`)

| Field | Type | Required | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `email` | String | yes | - | unique index, `lowercase`, `trim` | login identity |
| `name` | String | yes | `""` | trim | display name; registration requires 1-100 chars |
| `passwordHash` | String | yes | - | | bcrypt hash |
| `dailyTargetMinutes` | Number | yes | 480 | no min/max in schema | 8 h |
| `weeklyTargetMinutes` | Number | yes | 2400 | | 40 h |
| `monthlyTargetMinutes` | Number | yes | 9600 | | 160 h |
| `timezone` | String | yes | `"UTC"` | IANA name (validated by `Intl` at register/update) | defines the user's "day" for all stats |
| `activeTimer` | embedded `ActiveTimer` (no `_id`) | - | `{isRunning:false, elapsedBeforeCurrentRun:0, updatedAt:now}` | | server-persisted live timer snapshot |
| `createdAt`/`updatedAt` | Date | auto | | | |

Embedded `ActiveTimer`:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `isRunning` | Boolean (required) | false | timer currently running |
| `startedAt` | Number | - | epoch ms (client clock) when the current run started; only meaningful if running |
| `elapsedBeforeCurrentRun` | Number (required) | 0 | milliseconds already accumulated (client semantics: today's total worked ms before the current run segment) |
| `sessionTitle` | String | - | title of the work in progress |
| `tagId` | String (NOT ObjectId) | - | id of an owned Tag, stored as string |
| `updatedAt` | Date | `Date.now` | server time of the last write (used as the sync version stamp) |
| `updatedByDeviceId` | String | - | client-supplied device label (`"desktop"`, mobile label) |

No index besides `_id` and unique `email`. The whole subdocument is replaced on every timer write (no partial `$set`).

### 2.2 `WorkSession` (`models/WorkSession.ts`) - one completed play-to-pause run

| Field | Type | Required | Default | Constraints |
|---|---|---|---|---|
| `userId` | ObjectId ref User | yes | | |
| `deviceId` | String | yes | | trim, free text |
| `startTime` | Date | yes | | |
| `endTime` | Date | no | | always set by the create route |
| `durationMinutes` | Number | yes | 0 | float rounded to 2 decimals |
| `durationSeconds` | Number | yes | 0 | integer |
| `title` | String | no | | trim, max 200 |
| `summary` | String | no | | trim, max 2000 |
| `tagId` | ObjectId ref Tag | no | | unset when no tag / tag deleted |
| `createdAt`/`updatedAt` | Date | auto | | |

Indexes: `{userId:1, startTime:-1}`, `{userId:1, tagId:1, startTime:-1}`. Sessions are immutable after creation: there is no update or delete endpoint anywhere.

### 2.3 `DailyStats` (`models/DailyStats.ts`) - denormalized per-day rollup

| Field | Type | Required | Default |
|---|---|---|---|
| `userId` | ObjectId ref User | yes | |
| `date` | String `YYYY-MM-DD` (user-local day key) | yes | trim |
| `workedMinutes` | Number | yes | 0 |
| `goalMinutes` | Number | yes | 480 |
| `createdAt`/`updatedAt` | Date | auto | |

Unique index `{userId:1, date:1}`. A row is created lazily on the first session of a user-local day (upsert). `workedMinutes` is only ever incremented (`$inc`) and never recomputed from sessions. `goalMinutes` is a snapshot of the user's daily target at the moment the row was first created (see 6.4 for how it changes).

### 2.4 `RefreshToken` (`models/RefreshToken.ts`)

| Field | Type | Notes |
|---|---|---|
| `token` | String, required, unique | the full refresh JWT string stored in plaintext |
| `userId` | ObjectId ref User, required | not indexed |
| `expiresAt` | Date, required | TTL index `{expiresAt:1}` with `expireAfterSeconds: 0` auto-deletes expired rows |
| timestamps | | |

### 2.5 `Tag` (`models/Tag.ts`)

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId ref User, required | tags are per-user |
| `name` | String, required, trim, max 50 | display name preserving the user's casing |
| `nameKey` | String, required, trim, lowercase, max 50 | case-insensitive uniqueness key (`name.trim().toLowerCase()`) |
| timestamps | | |

Indexes: unique `{userId:1, nameKey:1}`; `{userId:1, createdAt:1}` (unused by any query; the list query sorts by `nameKey`).

Relations (all app-enforced, no FK): WorkSession.userId/tagId, DailyStats.userId, RefreshToken.userId, Tag.userId, User.activeTimer.tagId (string). Tag deletion manually unsets references (see 4.5). There is no cascade on user deletion because users cannot be deleted.

---

## 3. Authentication and security model

### 3.1 Credentials and tokens

| Item | Detail |
|---|---|
| Password hashing | bcrypt, cost 10 (`utils/auth.ts:9-12`); compare via `bcrypt.compare` |
| Password policy | register: string, min 6 chars (no max, no complexity). Login: min 1. bcrypt silently truncates at 72 bytes |
| Access token | JWT HS256, secret `JWT_SECRET`, payload `{userId}` only, `expiresIn: "15m"`; no `iss`/`aud`/`jti`/`sub`; verification does not pin `algorithms` (`utils/auth.ts:21-35`) |
| Refresh token | JWT HS256, secret `JWT_REFRESH_SECRET`, payload `{userId, jti: randomUUID()}`, `expiresIn: "7d"`; stored verbatim in `refreshtokens` with `expiresAt = now + 7d` |
| Transport | `Authorization: Bearer <accessToken>` for REST; Socket.IO `handshake.auth.token` (or Authorization header, second space-separated part) |
| Storage on clients | localStorage (desktop) / AsyncStorage (mobile), keys like `pulse-refresh-token` (client concern) |

### 3.2 Flows

Register (`POST /auth/register`, `routes/auth.ts:15-81`): validate body with `RegisterSchema`; validate timezone with `Intl.DateTimeFormat(undefined,{timeZone})` (else 400 `Invalid timezone`); `User.findOne({email})` and 400 `Email is already registered` if present; bcrypt hash; create user (defaults for targets); issue access + refresh; persist refresh; respond 201 with tokens and a user object. Unique-index violation from a concurrent duplicate falls to the catch-all and returns 500 (not 400).

Login (`POST /auth/login`, `:83-137`): validate; find by email; 401 `Invalid email or password` on unknown user or bad password (same message; no bcrypt performed for unknown user so there is a timing side channel); issue and persist a new refresh token (multiple concurrent refresh tokens per user are allowed; one per device/login); 200 with tokens and user object.

Refresh (`POST /auth/refresh`, `:139-201`): body `{refreshToken}` (400 if missing); `jwt.verify` against refresh secret (401 `Invalid or expired refresh token`); lookup the exact string in DB (401 if absent = logged out/rotated); delete that row; sign new access token; sign new refresh token and insert it (retry once on duplicate-key code 11000); respond `{accessToken, refreshToken}`. This is rotate-on-use. It does not verify that the user still exists, and does not detect reuse of an already-rotated token (no token-family tracking; a replayed old token just gets 401).

Logout (`POST /auth/logout`, `:203-219`): body `{refreshToken}` (400 if missing); `RefreshToken.deleteOne({token})`; 200 `{message:"Logged out successfully"}`. Unauthenticated and does not verify the token; always 200 even if nothing deleted. Access tokens remain valid until they expire (15 min); open sockets stay connected.

Response `user` object for register/login: `{id, email, name, dailyTargetMinutes, weeklyTargetMinutes, monthlyTargetMinutes, timezone}`.

### 3.3 Middleware

`requireAuth` (`middleware/auth.ts`): requires `Authorization: Bearer <token>`; verifies with `JWT_SECRET`; sets `req.userId` (typed via `types/express.d.ts`); 401 `{error:"Access token required"}` or `{error:"Invalid or expired access token"}`. It never hits the DB, so tokens of users that no longer exist are accepted (individual handlers then return 404 `User not found`). It is applied per-route (not router-wide); `/health` and `/auth/*` are public.

### 3.4 Socket authentication (`socket.ts:26-43`)

`io.use` middleware: token from `socket.handshake.auth.token` or `Authorization` header; `verifyAccessToken`; on success `socket.userId = payload.userId`; on failure `next(new Error("Authentication token required" | "Invalid or expired token"))`. Authentication happens only at connect. Connected sockets are never re-validated when the access token expires or after logout. Clients reconnect with a refreshed token on `connect_error`.

### 3.5 Security gaps (see section 8 for citations)

Unauthenticated NoSQL-operator injection on logout; cross-user injection through `timer_status_response` relay; unvalidated socket payloads (one malformed event can crash the process); wide-open CORS; no account-level revocation or logout-all; plaintext refresh tokens in DB; no email verification, password reset, password change, or account deletion; account enumeration via register; in-memory rate limiter; secrets with weak defaults accepted.

---

## 4. REST API (complete)

Conventions
- JSON only. No URL prefix/versioning (`/auth/...`, `/sessions/...`).
- Dates on the wire: ISO-8601 UTC strings (`...Z`). Day keys: `YYYY-MM-DD` in the user's timezone. Durations: minutes (floats) unless a field says ms.
- Error bodies are `{ "error": <string> }` except Zod validation failures, which are `{ "error": <ZodFormattedError> }` (nested object like `{"_errors":[],"email":{"_errors":["Invalid email address"]}}`). Generic server failure: 500 `{"error":"Internal server error"}`. Unknown route or malformed JSON: Express default HTML error page (no JSON handler).
- "Auth" = `requireAuth` Bearer access token. Most authenticated handlers first `User.findById(req.userId)` and return 404 `{"error":"User not found"}` if absent.
- Global limiters: 500 req / 15 min / IP over everything (including `/health`); plus 100 req / 15 min / IP on `/auth/*` (counts against both limiters). Over-limit: 429 with `{"error":"Too many requests, please try again later."}` or `{"error":"Too many authentication attempts. Please try again after 15 minutes."}`; standard `RateLimit-*` headers, no legacy headers.

Shared zod schemas (`packages/validation/src/index.ts`):

| Schema | Definition |
|---|---|
| RegisterSchema | `email: string().email()`, `password: string().min(6)`, `name: string().trim().min(1).max(100)`, `timezone: string().min(1)` |
| LoginSchema | `email: string().email()`, `password: string().min(1)` |
| ObjectIdSchema | `string().regex(/^[a-fA-F0-9]{24}$/)` |
| TagNameSchema | `string().trim().min(1).max(50)` |
| CreateTagSchema / UpdateTagSchema | `{ name: TagNameSchema }` |
| SessionSchema | `startTime: string().datetime()`, `endTime?: string().datetime()`, `deviceId: string().min(1)`, `title?: string().trim().max(200)`, `summary?: string().trim().max(2000)`, `tagId?: ObjectIdSchema` (zod 3 `datetime()` accepts only the `Z` UTC form, no offsets) |
| DailyTargetSchema / WeeklyTargetSchema / MonthlyTargetSchema | `{ <x>TargetMinutes: number().nonnegative() }` (no max, fractions allowed) |
| TimezoneSchema | `{ timezone: string().min(1) }` |
| SessionRangeSchema | enum `today|week|month|year` |
| StatsByTagRangeSchema | enum `today|week|month` |

### 4.1 Health

`GET /health` (public) -> 200 `{"status":"OK","timestamp":<ISO>}`. No DB check; always OK if the process is up.

### 4.2 Auth (`/auth`, extra rate limiter; see 3.2)

| Endpoint | Request body | Success | Errors |
|---|---|---|---|
| `POST /auth/register` | `{email, password, name, timezone}` | 201 `{accessToken, refreshToken, user:{id,email,name,dailyTargetMinutes,weeklyTargetMinutes,monthlyTargetMinutes,timezone}}` | 400 zod; 400 `Invalid timezone`; 400 `Email is already registered`; 500 |
| `POST /auth/login` | `{email, password}` | 200 same shape as register | 400 zod; 401 `Invalid email or password`; 500 |
| `POST /auth/refresh` | `{refreshToken}` | 200 `{accessToken, refreshToken}` (old refresh token deleted) | 400 `Refresh token is required`; 401 `Invalid or expired refresh token`; 500 |
| `POST /auth/logout` | `{refreshToken}` | 200 `{message:"Logged out successfully"}` | 400 `Refresh token is required`; 500 |

New user defaults: daily 480, weekly 2400, monthly 9600 minutes, timezone as supplied by the client, activeTimer idle.

### 4.3 Sessions (`/sessions`, all auth)

**`POST /sessions`** - record a completed work run. Called by clients on pause (plus midnight-rollover splits and the offline-queue replay). Body per SessionSchema.

Algorithm (`routes/session.ts:30-124`):
1. Validate. `startTime = new Date(startTime)`; `endTime = endTime ? new Date(endTime) : now`.
2. `durationSeconds = max(0, round((end - start)/1000))`; `durationMinutes = round(durationSeconds/60 * 100)/100` (2 decimals). End before start silently becomes 0. No upper bound; future times accepted.
3. If `tagId` supplied: must be an ObjectId-shaped id owned by the user; else 400 `{"error":"Tag not found"}`.
4. Insert `WorkSession` (`title`/`summary` only if non-empty after trim; `tagId` only if owned).
5. Load user (404 if missing, AFTER the session was already saved).
6. `dateKey = localDate(startTime, user.timezone)`. The whole session is attributed to the day it STARTED in; the server never splits sessions at midnight.
7. `previousDailyWorked = DailyStats[userId,dateKey].workedMinutes ?? 0` (separate read).
8. Upsert DailyStats: `$inc workedMinutes += durationMinutes`, `$setOnInsert goalMinutes = user.dailyTargetMinutes`.
9. `achievements = detectGoalAchievements(...)` (see 6.5).
10. Serialize the session with `tagName`; emit socket `session_created` (payload = serialized session) to ALL of the user's sockets (including the creating device), then one `goal_achieved` per achievement.
11. Respond 201 with the serialized session.

Serialized session (`withTagNames`, `utils/tags.ts:65-113`): `{...session.toObject(), id, userId(string), startTime(ISO), endTime(ISO or ""), createdAt(ISO), updatedAt(ISO), tagId(string|undefined), tagName(string|undefined)}`. Because it spreads `toObject()`, the payload also leaks `_id` and `__v`. Typical response:

```json
{"_id":"..","id":"..","userId":"..","deviceId":"desktop","startTime":"2026-05-01T08:00:00.000Z","endTime":"2026-05-01T09:15:30.000Z","durationMinutes":75.5,"durationSeconds":4530,"title":"Spec","summary":"..","tagId":"..","tagName":"Work","createdAt":"..","updatedAt":"..","__v":0}
```

No idempotency key: replaying the same POST creates a duplicate session and double-counts the day.

**`GET /sessions`** - paginated history. Query: `page` (default 1, min 1), `limit` (default 20, clamp 1..100; invalid -> default), and ONE of:
- `from` and `to` (both required together; ISO strings; filter `startTime >= from AND <= to`; not validated; garbage dates cause a CastError -> 500; if only one is provided it is ignored), or
- `range` in `today|week|month|year` (else 400 `Invalid range parameter`): `today` = local-day bounds; `week` = last 7 local days (today and 6 before); `month` = last 30 local days; `year` = last 365 local days; start = 00:00 local of the first day, end = end of today local.
- neither: all history.

Sorted `startTime` desc, skip/limit. Response: `{sessions:[serialized...], total, page, limit, hasMore: skip+sessions.length < total}`.

**`GET /sessions/today`** - all of today's (user-timezone) sessions, newest first, as a bare array of serialized sessions (not paginated, not wrapped).

### 4.4 Stats (`/stats`, all auth)

All "today" notions use the user's stored timezone. Tag filter: optional `?tagId=<24-hex>` on `today`, `week`, `month`, `summary`: invalid format -> 400 `{"error":"Invalid tagId"}`; unknown/not-owned tag -> 404 `{"error":"Tag not found"}` (`utils/tags.ts:44-63`).

| Endpoint | Response | Rules |
|---|---|---|
| `GET /stats/today` | `{workedMinutes, goalMinutes, percentage, date}` | `workedMinutes` = today's DailyStats row (0 if none) or, with tag filter, the sum of that tag's sessions started today. `goalMinutes` = row's snapshot if the row exists else current `user.dailyTargetMinutes`. `percentage = goal>0 ? round(worked/goal*100) : 0` (can exceed 100). `date` = today key. |
| `GET /stats/week` | array of 7 `{date, day, workedMinutes, goalMinutes}` | CALENDAR week Monday..Sunday containing today (future days included with 0). `day` = en-US short weekday ("Mon"). Goal per day = row snapshot or current target. Tag filter swaps worked values only. |
| `GET /stats/month` | array of 30 `{date, day, workedMinutes, goalMinutes}` | ROLLING last 30 local days ending today, oldest first. Same per-day rules. |
| `GET /stats/history` | array of raw DailyStats docs (`_id,userId,date,workedMinutes,goalMinutes,createdAt,updatedAt,__v`) sorted by date asc | ALL rows, unbounded, no pagination, no tag filter, no user lookup. |
| `GET /stats/summary` | `{totalWorkedMinutes, weeklyWorkedMinutes, monthlyWorkedMinutes, weeklyTargetMinutes, monthlyTargetMinutes, weeklyPercentage, monthlyPercentage, averageDailyMinutes, bestDayMinutes, bestDayDate, currentStreakDays, goalAchievementPercent}` | See 6.6. |
| `GET /stats/weeks?count=N` | array of `{week:"Week k", hours (1 decimal), workedMinutes}` | `count = min(parseInt(count) or 4, 12)` (negative values are not clamped). Uses the last `count*7` local days (rolling), chunked oldest to newest; the oldest chunk is labelled `Week <count>` down to `Week 1` for the newest; then the array is reversed, so the response is newest-first (element 0 = `Week 1` = the most recent 7 days). Untagged only, no tag filter. |
| `GET /stats/by-tag?range=today/week/month` | `{range, tags:[{tagId or null, tagName, workedMinutes}]}` sorted by minutes desc | `range` default `today`, invalid -> 400 `Invalid range parameter`. `week` = calendar Mon..Sun; `month` = rolling 30 days. Untagged (or dangling-tag) sessions are summed into one bucket `{tagId:null, tagName:"Untagged"}`, emitted only if > 0. No tagId filter. |

### 4.5 Tags (`/tags`, all auth)

| Endpoint | Behavior |
|---|---|
| `GET /tags` | 200 array of `{id,name,createdAt,updatedAt}` sorted by `nameKey` asc (case-insensitive alphabetical). |
| `POST /tags` `{name}` | Idempotent create. If a tag with the same `nameKey` (trimmed lowercase) exists for the user -> 200 with the existing tag (not an error; original casing kept). Else 201 with the new tag. A duplicate-key race falls back to re-reading and returns 200. No per-user tag cap. |
| `PATCH /tags/:id` `{name}` | 400 `Invalid tag id` (not 24-hex), zod 400, 404 `Tag not found` (also when owned by someone else), 409 `A tag with that name already exists` (a different tag with same `nameKey`; changing only the case of your own tag is allowed). Updates `name` + `nameKey`, 200 with the tag. |
| `DELETE /tags/:id` | 400/404 as above. Steps: `WorkSession.updateMany({userId,tagId}, $unset tagId)` (history becomes Untagged); if the user's `activeTimer.tagId` equals this tag, `$unset activeTimer.tagId`; delete tag; 204 no body. Not transactional; no socket broadcast, so other devices keep a stale tag id until they refetch. |

### 4.6 Settings (`/settings`, all auth)

Response of all five endpoints: `{email, name, timezone, dailyTargetMinutes, weeklyTargetMinutes, monthlyTargetMinutes}` (targets default to 0 if undefined).

| Endpoint | Body | Side effects |
|---|---|---|
| `GET /settings` | | none |
| `PATCH /settings/daily-target` | `{dailyTargetMinutes >= 0}` | updates user; also overwrites `goalMinutes` of TODAY's existing DailyStats row (no upsert; past days keep their snapshot); broadcasts `goal_updated` |
| `PATCH /settings/weekly-target` | `{weeklyTargetMinutes >= 0}` | updates user; broadcasts `goal_updated` |
| `PATCH /settings/monthly-target` | `{monthlyTargetMinutes >= 0}` | updates user; broadcasts `goal_updated` |
| `PATCH /settings/timezone` | `{timezone}` | validated by `Intl.DateTimeFormat`; 400 `Invalid timezone`; updates user only. No re-keying of existing DailyStats, no broadcast |

A target of 0 means "goal disabled": percentages become 0 and achievement events never fire (`crossedThreshold` requires target > 0). There are NO endpoints to update `name`, email, or password, nor to edit/delete sessions, delete the account, or export data.

### 4.7 Users

`GET /users/me/active-timer` (auth) -> 200 `ActiveTimerState` `{isRunning, startedAt?(ms), elapsedBeforeCurrentRun(ms), sessionTitle?, tagId?, updatedAt?(ISO), updatedByDeviceId?}` (undefined keys omitted by JSON); 404 `User not found`. This is the HTTP reconciliation endpoint clients call on socket connect and app foreground.

---

## 5. Realtime / WebSocket (Socket.IO 4.8, `src/socket.ts`, `src/services/activeTimer.ts`)

### 5.1 Server setup

- Attached to the same HTTP server and port as REST; default path `/socket.io`; default transports (polling then websocket upgrade); `cors: {origin:"*", methods:["GET","POST"]}`; default ping settings (25s interval, 20s timeout); default in-memory adapter (single node only); no connection-state recovery; no namespace other than `/`.
- Auth: see 3.4. On connect the socket joins room `user_<userId>` (`socket.ts:52-53`) and the server logs `Socket connected: <id> (User: <userId>)`.
- `broadcastToUser(userId, event, data)` (`socket.ts:110-119`) is the helper REST routes use: `io.to("user_<id>").emit(event, data)` (includes every socket of the user, no exclusions). It silently no-ops before `initSocket`.
- There are no acknowledgements, no payload validation, no per-socket rate limit, and no server-side check that the client's claimed `deviceId` is genuine.

### 5.2 Events

Client to server (all take an optional/untyped object, never validated):

| Event | Payload | Server behavior |
|---|---|---|
| `timer_start` | `{startedAt: epoch ms, elapsedBeforeCurrentRun: ms, sessionTitle?, tagId?, deviceId?}` | 1) immediately `socket.to(room).emit("timer_started", {...data, updatedAt: <ISO now>})` (everyone in the room EXCEPT the sender); 2) fire-and-forget `persistTimerStart` (errors only logged) |
| `timer_pause` | `{elapsedBeforeCurrentRun: ms, sessionTitle?, tagId?, deviceId?}` | same pattern -> `timer_paused` `{...data, updatedAt}`; then `persistTimerPause` |
| `timer_reset` | `{deviceId?}` (payload optional) | emits `timer_reset` (no payload) to others; then `persistTimerReset(userId, deviceId)` |
| `timer_status_request` | none | async: loads the user's persisted timer from Mongo and replies ONLY to the requester with `timer_status_response`. If the user doesn't exist it replies nothing. The server does NOT forward the request to other devices |
| `timer_status_response` | `{requesterId, ...state}` | relay: `io.to(data.requesterId).emit("timer_status_response", data)` if `requesterId` is truthy. Intended as a peer-to-peer answer to a status request; see 8 for the flaw |

Server to client:

| Event | Sent by | Payload | Recipients |
|---|---|---|---|
| `timer_started` | timer_start handler | the raw client payload plus `updatedAt` (ISO server time at receipt) | other sockets of the same user |
| `timer_paused` | timer_pause handler | raw client payload plus `updatedAt` | other sockets |
| `timer_reset` | timer_reset handler | none | other sockets |
| `timer_status_response` | status-request handler (or relay) | `{requesterId: <socket.id>, isRunning, startedAt, elapsedBeforeCurrentRun, sessionTitle, tagId, updatedAt}` (DB values; `updatedAt` = ISO of DB `activeTimer.updatedAt`) | the requester only |
| `session_created` | `POST /sessions` | serialized WorkSession | ALL sockets of the user (including origin) |
| `goal_achieved` | `POST /sessions` | `{type:"daily"|"weekly"|"monthly", workedMinutes, targetMinutes, periodKey}` | ALL sockets; one event per achieved goal; fire-and-forget, never stored |
| `goal_updated` | any `PATCH /settings/*-target` | `{dailyTargetMinutes, weeklyTargetMinutes, monthlyTargetMinutes}` | ALL sockets |

Client-side listeners that are dead with this server: `timer_status_request` (the desktop answers it with `timer_status_response`, but the server never emits `timer_status_request` to peers). Events the clients use for refresh: `session_created` and `timer_paused` invalidate cached stats queries.

Not broadcast (clients learn only when they refetch): tag create/rename/delete, timezone change, session creation by REST vs sockets other than `session_created`.

### 5.3 Cross-device timer sync design

Persisted source of truth: `User.activeTimer` (one per user, a single document field, whole-object replacement). The server never computes elapsed time; it stores what the last writer says and stamps it with a server `updatedAt`. Clients render `elapsed = elapsedBeforeCurrentRun + (running ? now - startedAt : 0)` from their own clock (so clock skew between devices shows up directly; the server never corrects it).

Write paths (`services/activeTimer.ts`):

```
persistTimerStart(userId, d):
  tagId = resolveOwnedTagId(userId, d.tagId)          // DB lookup; undefined if not owned/invalid
  User.findByIdAndUpdate(userId, {activeTimer: {
      isRunning: true, startedAt: d.startedAt, elapsedBeforeCurrentRun: d.elapsedBeforeCurrentRun,
      sessionTitle: d.sessionTitle, tagId, updatedAt: new Date(), updatedByDeviceId: d.deviceId}})

persistTimerPause(userId, d):
  existing = User.findById(userId).select("activeTimer")        // read
  tagId = d.tagId !== undefined ? resolveOwnedTagId(...) : existing.activeTimer.tagId
  User.findByIdAndUpdate(userId, {activeTimer: {                 // then write (non-atomic)
      isRunning: false, elapsedBeforeCurrentRun: d.elapsedBeforeCurrentRun,       // startedAt dropped
      sessionTitle: d.sessionTitle ?? existing.sessionTitle, tagId,
      updatedAt: new Date(), updatedByDeviceId: d.deviceId}})

persistTimerReset(userId, deviceId):
  User.findByIdAndUpdate(userId, {activeTimer: {isRunning:false, elapsedBeforeCurrentRun:0,
      sessionTitle: undefined, tagId: undefined, updatedAt: new Date(), updatedByDeviceId: deviceId}})
```

Note: pause keeps the old title/tag when the payload omits them, but reset and start replace the whole object (start with no title clears the title).

Read paths: `GET /users/me/active-timer` and socket `timer_status_request` both call `getActiveTimerForUser` -> `serializeActiveTimer` (maps `startedAt ?? undefined`, `tagId || undefined`, `updatedAt` to ISO).

### 5.4 "Broadcast before DB write" (commit b2f2dc4) and pause/resume handling

Previously the server awaited the DB write before relaying; cross-device UI lagged by DB latency (especially with Atlas). Now the handler emits to peers synchronously on receipt and persists afterwards in the background (`void persistX(...).catch(log)`). Consequences to preserve or deliberately fix in a rewrite:

1. Peers see `timer_started`/`timer_paused` with `updatedAt` = server receipt time, while the DB row gets a slightly later `updatedAt` (assigned inside `persist*` after async lookups). The same logical event therefore has two different timestamps depending on path (socket vs HTTP/status response).
2. If persistence fails (validation, Mongo down) peers have already been told; the DB keeps the old state and the next reconcile may flip peers back. The origin device receives no error/ack.
3. The broadcast echoes the unvalidated client payload, including a `tagId` that persistence may reject (non-owned), so live state and persisted state can differ in `tagId`.
4. Clients treat live socket events as authoritative regardless of timestamps ("live always wins", commit 7017b03) and use `updatedAt` only to ignore older HTTP/status snapshots (`reconcile`), because device clocks and the DB clock differ by seconds. Peer-origin status responses without `updatedAt` are ignored if the client already has a remote stamp.
5. Pause resume sequence used by clients: Play -> `timer_start` (new `startedAt`, `elapsedBeforeCurrentRun` = running total so far today); Pause -> `timer_pause` (`elapsedBeforeCurrentRun` = total elapsed at pause, `startedAt` cleared), then the client separately calls `POST /sessions` with `startTime = startedAt` of the finished run, so a pause produces TWO independent writes (timer snapshot via socket, session via REST) with no transaction or link between them.
6. Midnight: clients roll over at their local midnight (checked every 10 s): they save the pre-midnight part as a session and restart the timer; the server is unaware and attributes each posted session by `startTime`.

### 5.5 Race conditions inherent in the design

- Unordered persists: `timer_start` then `timer_pause` in quick succession spawn two un-serialized async chains (`resolveOwnedTagId` + update vs find + `resolveOwnedTagId` + update). Whichever finishes last wins; with the pause chain doing an extra read, a late start-write can overwrite a pause, leaving the DB showing `isRunning:true` with a stale `startedAt`. `updatedAt` is assigned at write time so the stale write gets the newest stamp.
- Pause read-modify-write is not atomic (`findById` then `findByIdAndUpdate`), so a concurrent start can be clobbered by a pause based on an old `existing`.
- Two devices pressing play at once: last write wins; both clients show running locally until they receive the other's `timer_started`; no conflict detection or "already running elsewhere" check.
- `session_created` and the timer pause are separate; a device that goes offline after pausing queues the session locally and replays it later, which can be a long time after the timer snapshot changed.
- Multi-process/multi-node: rooms live in process memory; with >1 API instance, devices on different instances never receive each other's events (the DB snapshot still syncs on reconnect/foreground).

---

## 6. Business logic in detail

### 6.1 Timer and session lifecycle (as the system actually behaves)

1. The "timer" is a per-user singleton (`User.activeTimer`) mirrored on every device. Its numbers are in milliseconds and use CLIENT clocks (`startedAt` = client `Date.now()`).
2. `elapsedBeforeCurrentRun` is the day's accumulated work in ms at the moment the current run began (clients seed it from `/stats/today` `workedMinutes`, e.g. `seedTodayElapsedFromStats`). So the displayed timer is "today's total", not "this session's length".
3. Play: client sets local state then emits `timer_start`. Pause: client computes the day total, emits `timer_pause`, shows a title/summary dialog (auto-skip countdown), then posts a session `{startTime: startedAt-of-the-run, endTime: now-at-dialog-completion, deviceId, title?, summary?, tagId?}`. Because `endTime` is taken when the dialog completes, time spent in the dialog is included in the saved session (client behavior worth knowing).
4. A WorkSession is therefore one play->pause run (a day can have many). Sessions are append-only; the server cannot edit or delete them. The only mutation of existing sessions is tag deletion (unsetting `tagId`).
5. Reset: `timer_reset` zeroes the snapshot (clears title/tag) and does NOT create a session or touch DailyStats.
6. Offline: clients queue failed `POST /sessions` locally and replay oldest-first every 30 s / on `online`; the queue drops entries that get HTTP 400 and retries on network/5xx. The server provides no deduplication (see 8).
7. A session's duration is derived from the client-supplied `startTime`/`endTime` (or `now` if `endTime` is omitted), not from the server's view of the timer.

### 6.2 Work-day boundaries and timezones

The user's `timezone` (IANA, default "UTC", set from the device at registration and updated via `PATCH /settings/timezone`) is the sole definition of a day. Helpers in `utils/dates.ts`:

```
getLocalDateString(date, tz):
  Intl.DateTimeFormat("en-US", {timeZone: tz||"UTC", year:"numeric", month:"2-digit", day:"2-digit"})
  -> "YYYY-MM-DD" from formatToParts; on any error fall back to date.toISOString().slice(0,10) (UTC)

getLocalDayRange(dateKey, tz) -> {start, end}:
  start = findZonedTime(y, m, d, 00:00:00, tz)
  end   = findZonedTime(next calendar day 00:00:00, tz) - 1 ms          // inclusive end
  findZonedTime: guess = Date.UTC(y,m-1,d,h,mi,s); up to 5 iterations: format guess in tz, compute
                 (formatted-as-UTC - target) and subtract that diff from guess; stop when diff == 0
                 (treats hour "24" as 0). Fallback on error: UTC midnight..23:59:59.999Z

getPastLocalDateKeys(dateKey, count): `count` consecutive day keys ending at dateKey, ascending
                 (pure UTC calendar arithmetic on the key, tz-free)
getCurrentWeekDateKeys(todayKey): Monday..Sunday (Monday-first; week start is hard-coded, not a setting)
getMonthDateKeys(todayKey): every day key of todayKey's calendar month (28-31 keys, includes future days)
getWeekdayLabel(dateKey): en-US short weekday of that date (computed at 12:00Z to dodge edge shifts)
```

Rules:
- A session belongs to the local day of its `startTime` only. A session crossing local midnight is NOT split server-side; the client splits at rollover.
- "today", all ranges, streaks, trends, achievements use `getLocalDateString(new Date(), user.timezone)` at request time.
- Day-bound queries compare `WorkSession.startTime` against `[start, end]` instants.
- Changing timezone does not migrate `DailyStats.date` keys: old rows keep the old zone's keys, while tag-filtered stats (computed from sessions) use the new zone, so the two can disagree for historical days until the data ages out.

### 6.3 Daily stats aggregation

`DailyStats` is an incrementally maintained cache: one row per (user, local date), created on first session of that day. On each `POST /sessions`: `workedMinutes += durationMinutes` (float, two-decimal inputs, may accumulate float error), `goalMinutes` set only on insert (`$setOnInsert`) to the user's current daily target. The row is never recomputed from sessions and there is no reconciliation job; since sessions can't be edited/deleted the cache can only diverge via races or double-posts. Reads for week/month/history use the rows directly (no rows -> 0 worked, current daily target as goal). Untagged queries never touch `WorkSession`; tag-filtered queries always scan `WorkSession`.

### 6.4 Goals

- Three independent targets on the user: daily (default 480 min), weekly (2400), monthly (9600), all in minutes, `>= 0`; 0 disables that goal.
- Daily goal history: each DailyStats row snapshots the target when first created that day. Changing the daily target mid-day rewrites only TODAY's existing row; earlier days keep their goals. If today has no row yet, the new target is used when the row is created (and `/stats/today` falls back to the current user target meanwhile). Days without any row (no work) are reported using the CURRENT daily target in week/month series.
- Weekly and monthly targets are single values applied to whatever window the computation uses (no history).

### 6.5 Achievements (`utils/goals.ts`, triggered only inside `POST /sessions`)

```
crossed(before, after, target) = target > 0 && before < target && after >= target

daily:   before = DailyStats(dateKey).workedMinutes read BEFORE the $inc; after = value returned by the upsert
         if crossed(before, after, user.dailyTargetMinutes)       // current target, not the row snapshot
           -> {type:"daily", workedMinutes: after, targetMinutes: dailyTarget, periodKey: dateKey}
weekly:  window = the 7 local day keys ending at the SESSION's dateKey (rolling 7 days, not calendar week)
         after = sum(DailyStats.workedMinutes over window) (re-read after the increment)
         before = after - durationMinutes
         -> {type:"weekly", ..., periodKey: dateKey}                // periodKey is the session's day, not a week id
monthly: window = all day keys of the CALENDAR month of dateKey
         after = sum(DailyStats over month); before = after - durationMinutes
         -> {type:"monthly", ..., periodKey: "YYYY-MM"}
```

Events are returned in order daily, weekly, monthly, broadcast as `goal_achieved` to all of the user's devices, and not persisted (no achievement history; a device that is offline never sees them). Backdated sessions can fire achievements for past periods. A target raised after being met can trigger the same type again when the new, higher target is crossed.

### 6.6 Summary stats (`GET /stats/summary`) algorithm

```
todayKey = local today
weekKeys  = last 7 local days ending today (rolling)     // NOT the Mon-Sun week used by /stats/week
monthKeys = every day of the current calendar month        // includes future days (zeros)
allStats  = ALL DailyStats rows of the user                // unbounded read
tagged    = tagId ? Map(dateKey -> minutes) built from ALL sessions of that tag (all-time scan) : null
workedOn(key) = tagged ? tagged[key] ?? 0 : allStats[key].workedMinutes ?? 0

totalWorkedMinutes   = tagged ? sum(tagged.values) : sum(allStats.workedMinutes)
weeklyWorkedMinutes  = sum(workedOn(k) for k in weekKeys)
monthlyWorkedMinutes = sum(workedOn(k) for k in monthKeys)
weeklyTargetMinutes / monthlyTargetMinutes = user values (0 if missing)
weeklyPercentage  = target>0 ? round(weekly/target*100) : 0   (monthly same)
daysWithData         = days (all-time) with minutes > 0
averageDailyMinutes  = daysWithData>0 ? round(total / daysWithData) : 0
bestDay              = day with strictly greatest minutes (first encountered wins ties; iteration order of DB find is unspecified);
                       bestDayMinutes=0 and bestDayDate=null when no data
currentStreakDays    = iterate local days from TODAY backwards up to 365 days: count consecutive days with workedOn>0;
                       stop at the first day with 0
goalAchievementPercent = over days of the current calendar month that have work (>0):
                       met = count(days where goal>0 && workedOn(day) >= goal), goal = row snapshot ?? current daily target
                       = round(met / daysWithMonthData * 1000) / 10   (one decimal; 0 if no days)
```

Streak subtlety (bug or intent): the loop breaks on the first zero day even if that day is TODAY (`stats.ts:247-258`, both `else` branches break). So the streak is 0 until the user logs time today, and yesterday's streak "disappears" every morning. The tag filter also compares the tag's minutes against the full daily goal.

### 6.7 Tags and tag-filtered stats

- Tags are per-user labels, case-insensitively unique, max 50 chars, attached optionally to a running timer (`activeTimer.tagId`) and to each session (`WorkSession.tagId`). No colors, ordering, archive, or hierarchy.
- Tag filtering is implemented outside DailyStats: for `today/week/month/summary` the server loads sessions of that tag in the date window (all-time for summary), recomputes each session's local day key with `getLocalDateString`, and sums `durationMinutes` into a `Map<dateKey, minutes>` pre-seeded with zeros for requested days. Only worked minutes change; goals stay the daily/weekly/monthly user goals.
- `by-tag` breakdown: fetch all sessions in the window (bounds from first/last key), keep those whose local day key is in the window, group by tagId; look up tag names in one query; unknown/untagged -> "Untagged" bucket; sort descending.
- Deleting a tag moves its history to Untagged (sessions' `tagId` unset) and clears the active timer's tag if equal. Renaming a tag changes names retroactively (sessions store only the id; `tagName` is joined at read time).

### 6.8 Settings behavior

Profile (`email`, `name`, `timezone`) and goals are returned by `GET /settings`. Only the three targets and the timezone are mutable through the API. Goal changes are pushed to all devices via `goal_updated`; timezone is not pushed. Clients cache goals locally (client concern).

---

## 7. Error handling, validation, logging, rate limiting, CORS (as implemented)

| Area | Current behavior |
|---|---|
| Handler pattern | Every route is an `async RequestHandler` wrapped in its own `try/catch` that logs `console.error("<X> error:", error)` and replies 500 `{error:"Internal server error"}`. No shared async wrapper, no central error middleware, no error classes. |
| Validation | zod schemas from `@repo/validation` for bodies (`safeParse`, 400 with the zod `.format()` tree). Query params are hand-parsed ad hoc (`parseInt`, enum parse for `range`, ObjectId regex for `tagId`). `from/to`, `count`, `page`, `limit` are loosely handled (see 8). Socket payloads are not validated at all. |
| Error shapes | Three coexisting shapes: `{error: string}`, `{error: ZodFormattedObject}`, and framework HTML for malformed JSON/404. Status codes: 400 validation/duplicate email; 401 auth; 404 missing user/tag; 409 tag rename conflict; 429 rate limit; 500 everything else (including unique-index races). 204 for tag delete. |
| Logging | Raw `console.log/warn/error` only: socket connect/disconnect lines (with user ids), Mongo connection events, handler errors. No request logging, request ids, levels, or structure; no PII scrubbing; no metrics/tracing. |
| Rate limiting | `express-rate-limit` in-memory (per process, per IP): 500/15min global, 100/15min on `/auth`. Because `trust proxy` is fixed at 1 and the key is the client IP from `X-Forwarded-For`, a directly exposed server is spoofable and a multi-hop proxy chain would rate-limit the proxy IP for everyone. Socket.IO traffic is not covered by Express middleware. No per-account lockout/throttling for login attempts. |
| CORS | `cors()` with defaults: `Access-Control-Allow-Origin: *`, all simple methods, no credentials. Socket.IO also `origin:"*"`. (Auth is bearer token in header so wildcard CORS is not a cookie-CSRF issue, but it removes any origin allow-listing.) |
| Security headers | `helmet()` defaults (CSP, HSTS, noSniff, etc.). Meaningless for a JSON API except HSTS/noSniff. |
| Body limits | `express.json()` default 100 KB; Socket.IO default `maxHttpBufferSize` 1 MB. |
| Health | `/health` is liveness only. Compose has no API healthcheck. |
| Shutdown | None: no SIGTERM handling, no `server.close`, no `mongoose.disconnect`. Mongo disconnects are only logged; mongoose auto-reconnects. |
| Timeouts | None configured (no server/request timeouts, no Mongo `serverSelectionTimeoutMS` tuning; defaults apply). |
| Config | Fail-fast on invalid env. `NODE_ENV` unused in app logic. |
| Tests / CI | No tests, no CI config in scope; only `eslint` and `tsc --noEmit`. (Only a client-side `timer-sync.test.ts` exists in `packages/utils`.) |

---

## 8. Problems and tech debt (with citations)

Severity: [S] security, [B] bug/correctness, [R] race, [P] performance/scalability, [D] design debt, [O] ops.

### Security

1. [S] Process crash by any authenticated user: `socket.on("timer_status_response", (data) => { if (data.requesterId) ...})` dereferences `data` without a guard (`socket.ts:96-100`). Emitting the event with no payload throws an uncaught exception inside Socket.IO's dispatch and brings the whole API process down (verified with a local repro: `uncaughtException: Cannot read properties of undefined (reading 'requesterId')`). Likewise `timer_status_request` is an async handler with no try/catch (`socket.ts:81-94`); a DB error is an unhandled rejection that kills Node >= 15. With no process supervisor handling or `unhandledRejection` hook this is a one-message DoS.
2. [S] Cross-user injection via relay: `io.to(data.requesterId).emit("timer_status_response", data)` (`socket.ts:98`) accepts any string as a Socket.IO target. Socket.IO targets are room names, and every user's room is `user_<24-hex-id>`, so an authenticated attacker who learns a victim's ObjectId can push an arbitrary timer state (running/stopped, elapsed, title, tag) into all of the victim's devices. The same relay lets any socket address any other socket id.
3. [S] Unauthenticated NoSQL operator injection in logout: `RefreshToken.deleteOne({ token: refreshToken })` (`routes/auth.ts:212`) takes `refreshToken` straight from the JSON body with no type check. Sending `{"refreshToken":{"$ne":null}}` casts to `{token:{$ne:null}}` (verified with Mongoose's query caster), deleting an arbitrary user's refresh token per call (forced logouts / session-wipe DoS). `refresh` is safe only because `jwt.verify` rejects non-strings first (`routes/auth.ts:150`). Fix by requiring `typeof === "string"` via zod and verifying the JWT.
4. [S] Refresh tokens stored in plaintext (`models/RefreshToken.ts:13-17`, saved at `routes/auth.ts:57-62`); a DB leak yields usable long-lived credentials (still need the refresh secret only if forged, but stored ones are directly replayable). Store a SHA-256 hash.
5. [S] No refresh-token reuse detection or families (`routes/auth.ts:157-191`): a stolen-then-rotated token simply fails with no revocation of the descendant chain; no `userId` index and no "logout all devices"; no cap on tokens per user (every login adds one).
6. [S] Access tokens cannot be revoked and sockets are never re-authenticated (`socket.ts:26-43`); a logged-out/deleted user can keep a live socket indefinitely. `requireAuth` never checks the user exists (`middleware/auth.ts:22-23`).
7. [S] Account enumeration: register returns `Email is already registered` (`routes/auth.ts:34-37`); login does no bcrypt for unknown emails (timing oracle, `:94-98`). The 6-char minimum password and no max length (bcrypt truncates at 72 bytes) are weak. No email verification, password reset/change, or account deletion exist.
8. [S] Weak/default secrets accepted: only `length >= 8` (`config.ts:16-21`), and the shipped `.env.example` values are valid; HS256 verify does not pin `algorithms` (`utils/auth.ts:33-39`); tokens carry no `iss/aud`; the same shape is used for both secrets (a refresh token is not rejected as an access token only because secrets differ).
9. [S] CORS `*` for REST and sockets (`index.ts:27`, `socket.ts:20`); `trust proxy` hard-coded to 1 (`index.ts:21`), so rate-limit keys are spoofable when not behind exactly one proxy.
10. [S] Unvalidated socket payloads are echoed to peers (`socket.ts:58-72`: `{...data, updatedAt}`): an authenticated user can only reach their own room, but malformed shapes (strings for numbers, huge titles up to 1 MB) propagate to all their devices and to the DB (`sessionTitle` has no length limit unlike session titles).
11. [O/S] Local `apps/api/.env` holds live-looking Atlas credentials in the working tree (git-ignored; never committed). Rotate if the folder was ever shared.

### Correctness bugs

12. [B] Streak is 0 until you work today: both `else` branches break (`routes/stats.ts:249-258`), so yesterday's streak vanishes each morning (the `key !== todayKey` branch is dead logic that presumably meant "skip an empty today").
13. [B] Inconsistent period definitions for the same words: `GET /stats/week` = calendar Mon-Sun (`dateKeysForStatsRange`, `getCurrentWeekDateKeys`); `/stats/summary` weekly, weekly achievements, `GET /sessions?range=week` = rolling last 7 days; `/stats/month` and `range=month` = rolling 30 days, but `summary` monthly and monthly achievements = calendar month. A user can see different "weekly" totals on different screens.
14. [B] `/stats/weeks` ordering/labels: oldest chunk is labelled `Week <count>` and the list is reversed to newest-first (`routes/stats.ts:310-324`); the UI must know to reverse again. Negative `count` is not clamped (`:300`).
15. [B] Sessions spanning local midnight (or any session posted with the wrong timezone) are attributed wholly to the start day (`routes/session.ts:83`); only the client's rollover splitting prevents skew.
16. [B] Timezone change leaves `DailyStats` keyed by the old zone while tag-filtered stats recompute with the new zone (`utils/sessionStats.ts:52-56` vs stored rows) -> untagged and tagged totals disagree for historical days; no data migration (`routes/settings.ts:163-196`).
17. [B] `from/to` are unvalidated (`routes/session.ts:154-161`): invalid dates -> Mongoose CastError -> 500; providing only one is silently ignored.
18. [B] Create-session accepts end before start (clamped to 0 silently), future times, and unbounded durations (`routes/session.ts:46-51`); no max length sanity (a bad client clock inflates DailyStats permanently since stats cannot be repaired).
19. [B] Register race: two concurrent registers can both pass `findOne` and the second hits the unique index (E11000) -> 500 instead of 400 (`routes/auth.ts:33-49`).
20. [B] Daily-achievement threshold uses the current user target while `DailyStats.goalMinutes` is a snapshot (`utils/goals.ts:37-43` vs `models/DailyStats.ts`/`session.ts:92`), so "goal met" in `/stats/summary` (snapshot) and the live achievement (current) can differ after a target change.
21. [B] Weekly/monthly achievement `periodKey` for weekly is the session's day, not a week identifier (`utils/goals.ts:61-66`), so de-duplication on clients by `periodKey` is unreliable. Backdated sessions can trigger achievements for old periods.
22. [B] Stats endpoints return unrounded floating-point minutes (e.g. 12.349999999) because `$inc` of 2-decimal floats accumulates error (`session.ts:51,91`).
23. [B] Tag name match is `toLowerCase()` only (`routes/tags.ts:15-17`): no Unicode normalization, so visually identical names can coexist.
24. [B] Response leakage/inconsistency: `_id`/`__v` leaked in session payloads (`utils/tags.ts:83`), `/stats/history` returns raw Mongoose docs (`routes/stats.ts:166-167`), `endTime` is `""` when absent, `POST /tags` returns 200 vs 201 depending on existence.
25. [B] Dead client contract: `timer_status_request` is never relayed to peers by the server (`socket.ts:81-94`), yet clients implement a peer response path.

### Race conditions / consistency

26. [R] Out-of-order timer persistence: `timer_start`/`timer_pause` run independent un-awaited async chains (`socket.ts:58-72`, `services/activeTimer.ts:50-100`); `updatedAt` is stamped at write time, so a stale write can win and carry the newest timestamp. Pause is a non-atomic read-then-write (`activeTimer.ts:77-85`).
27. [R] Broadcast-before-persist can announce state the DB then rejects (non-owned `tagId`) or fails to store; no ack/retry/error channel (`socket.ts:58-79`).
28. [R] `POST /sessions` is a multi-step non-transactional write: session insert (`session.ts:75`) -> user load (can 404 after the insert, `:78-81`) -> DailyStats read (`:85`) -> upsert (`:88`) -> achievements (`:97`). A crash between steps leaves a session not reflected in DailyStats; the client then retries and duplicates the session. `previousDailyWorked` is read separately from the upsert, so concurrent sessions can double-fire or skip a daily achievement.
29. [R] Refresh rotation `findOne -> deleteOne -> insert` is non-atomic (`routes/auth.ts:157-179`): two concurrent refreshes with the same token both succeed and mint two valid chains.
30. [R] Tag delete is three separate writes (`routes/tags.ts:128-136`); a failure after the first leaves a partially cleaned state; no broadcast so peers keep a deleted tag selected and may then fail `POST /sessions` with 400 `Tag not found`, dropping those sessions from the client's offline queue (the client discards 400s, i.e. data loss).
31. [R] No idempotency for `POST /sessions`: client retries after a lost response (network error is treated as failure, the session is queued and replayed) produce duplicates and inflate stats permanently.

### Performance / scalability

32. [P] Every authenticated request does `User.findById` just to get the timezone (`routes/stats.ts` x7, `session.ts`, `settings.ts`); embed the timezone in the token/cache it.
33. [P] Unbounded reads: `/stats/history` returns every DailyStats row (`stats.ts:166`); `/stats/summary` loads all rows (`:190`) and, with a tag, ALL sessions of that tag (`utils/sessionStats.ts:36-44` with no `dateKeys`), materializing Mongoose documents; `getLocalDateString` constructs a new `Intl.DateTimeFormat` per call (`utils/dates.ts:3`), which is slow when invoked per session in loops (`sessionStats.ts:52,80`).
34. [P] Tag filtering and by-tag breakdown do JS-side grouping of full session sets instead of aggregation pipelines; DailyStats has no per-tag dimension, forcing session scans.
35. [P] Skip/limit pagination on history (`session.ts:180`) is O(skip); `countDocuments` on every page.
36. [P] Socket.IO in-memory adapter and in-memory rate limiter prevent horizontal scaling; a second API instance breaks cross-device sync and splits rate limits.
37. [P] `RefreshToken` has no `userId` index (needed for logout-all); `Tag {userId,createdAt}` index is unused; `User` lookups by `email` rely on the unique index only (fine).

### Design debt

38. [D] No tests of any kind for the backend (time-zone helpers, achievements, streaks, token rotation, socket sync are all untested).
39. [D] Schema/DTO duplication and drift: `WorkSession` DTO type lies (`id?`/`_id?`), README stale (events, endpoints, collections), `@types/express@5` vs Express 4, `README` says Node 18+ while Mongoose 9/Docker use Node 20+.
40. [D] Docker image likely cannot run: compiled CommonJS requires `@repo/validation`, which exports raw `.ts` (`packages/validation/package.json:5`); works under `tsx`, not under plain `node` 20 (`Dockerfile:46`). Also the runner image runs as root and has no healthcheck; `.npmrc frozen-lockfile=false` contradicts the strict Docker install.
41. [D] 7-day refresh expiry duplicated in three places (`routes/auth.ts:56,112,170`) and separately in `utils/auth.ts:7`; handler boilerplate duplicated everywhere; `tagId` stored as a string in `activeTimer` but ObjectId elsewhere.
42. [D] No audit trail or recompute path: DailyStats cannot be rebuilt; sessions cannot be edited/deleted (a mistaken 10-hour session is permanent); no user-profile editing; no data export/deletion (GDPR-style needs).
43. [D] Client-authoritative timer values: `startedAt`/elapsed come from client clocks and are unvalidated (negative/NaN/future), cross-device skew is uncorrected, and "elapsed = today's total" mixes the live timer with the stats cache (clients re-seed from `/stats/today`).
44. [D] Logging is `console.*` only with user ids; no correlation ids.

---

## 9. Rewrite recommendations (backend-specific, opinionated)

### 9.1 Must-preserve behavior (parity checklist)

- Auth: email+password, short-lived access token (15 min) + rotating refresh token (7 days), multi-device logins.
- Per-user timezone as the only definition of "day"; day keys `YYYY-MM-DD`; Monday-first weeks.
- Sessions = completed runs `{startTime,endTime,deviceId,title?,summary?,tagId?}`, minutes stored with 2 decimals plus integer seconds; attributed to the start day.
- Per-day rollup with a goal snapshot; daily/weekly/monthly goals with 0 = disabled; crossing detection pushing `goal_achieved` live.
- Summary stats: totals, rolling-7 and calendar-month totals and percentages, average over active days, best day, streak, goal-achievement percent; weekly trend; week/month series; by-tag breakdown; every one optionally tag-filtered.
- Tags: per-user, case-insensitive unique, idempotent create, rename 409 on conflict, delete detaches from history and the active timer.
- Realtime: per-user room, peer fan-out of `timer_started/paused/reset` with server `updatedAt`, `timer_status_request/response` from persisted state, `session_created`, `goal_updated`, `goal_achieved`; plus `GET /users/me/active-timer`.
- Client-facing contracts that existing clients depend on: ids are 24-hex strings validated by `ObjectIdSchema` (change the schema together with the backend if switching to UUID/ULID), error bodies as `{error: string}`, `percentage` rounding, array/field names above, the `/stats/weeks` newest-first quirk (or fix it in both ends).

### 9.2 Architecture choices

1. Pick a real relational store (PostgreSQL) unless there is a strong reason for Mongo. The data is relational (users, tags, sessions, daily rollups, tokens), needs transactions (session + rollup), unique constraints, range scans, and group-by aggregations. SQLite (Litestream/LiteFS) is also a legitimate choice for the self-hosting story: one file, no extra container, trivial backup.
2. Do not store a cache you cannot rebuild. Either derive daily/period stats with SQL aggregation over `sessions` (indexed on `(user_id, started_at)` and `(user_id, tag_id, started_at)`; this is comfortably fast for this scale and makes tag filtering trivial) or keep a rollup table updated in the same transaction as the session insert plus a rebuild command. Add per-day-per-tag rollup if aggregation ever becomes slow.
3. Store UTC instants and compute local days in SQL/app with a tested timezone library (Temporal/`date-fns-tz`/`luxon`/Postgres `AT TIME ZONE`). Denormalize `local_date` and the zone-at-write on each session so a timezone change does not rewrite history. Decide and document midnight-crossing semantics (split server-side into per-day segments, recommended, instead of relying on clients).
4. Make the server authoritative for the timer: store `{state, started_at_server, accumulated_ms, version}`; timer commands are `start/pause/reset` with a client-generated command id; compute elapsed from server time; apply commands through a per-user serialized path (row lock or optimistic `version` CAS) and broadcast the resulting state with a monotonically increasing `version`. Clients accept only higher versions. This removes the broadcast-before-persist inconsistency (you can still broadcast optimistically AFTER the in-memory transition and before the slow write if you keep ordering per user, e.g. a per-user async queue or actor).
5. Make "pause" a single transactional command that also creates the session (server knows `started_at` and end time) with the title/summary supplied in the same call or a follow-up PATCH, rather than two independent client writes. Keep a client-supplied idempotency key on `POST /sessions` regardless (offline replay).
6. Add the missing primitives: edit/delete session (with rollup adjust), update profile name, change password, delete account, export data, logout-all, tag color/order if desired, an explicit `GET /me`.
7. Realtime: keep WebSockets but use an adapter-agnostic design (Redis pub/sub or Postgres LISTEN/NOTIFY) if you will run more than one instance; for a self-hosted single instance in-memory is fine, document it. SSE would be simpler for server-to-client plus plain POST for commands, and works better through proxies.
8. Auth hardening: argon2id (or bcrypt cost >= 12), hashed refresh tokens (store SHA-256) with a `family_id`, reuse detection that revokes the family, `userId` index, per-device session list, access-token `sub/iss/aud/jti`, algorithm pinned, secrets validated for entropy and not equal to documented placeholders, optional email verification/reset. Re-authenticate or periodically re-verify long-lived sockets (kick on logout).
9. Validation everywhere, including socket events: validate every incoming socket payload with the same schemas as HTTP (type, ranges, max string lengths), never echo raw client payloads, and wrap handlers so a bad message cannot crash the process.
10. One error model: RFC 7807-style or at least `{error:{code,message,details?}}` for every route including 404/validation/rate-limit; central error middleware; typed domain errors; request ids in logs and responses.
11. Observability and ops: structured logs (pino), `/healthz` and `/readyz` (DB ping), graceful shutdown, request timeouts, metrics, Docker `HEALTHCHECK`, non-root user, pinned base image digest, config via a typed schema with `NODE_ENV`-dependent strictness, explicit CORS allow-list (configurable via env), configurable `TRUST_PROXY`, Redis/db-backed or reverse-proxy rate limiting, login throttling per account + IP.
12. Build and packaging: ship shared schemas as a real built package (or generate from an OpenAPI/JSON Schema contract) so the compiled server runs on plain Node; generate typed clients from OpenAPI; fix the Docker image; add CI running typecheck, lint, tests, and a container smoke test.
13. Tests to write first (they encode the behavior in sections 6 and 5): timezone/day-range helpers across DST and the date line; session attribution; achievement crossing (including concurrent sessions); streak rules (decide whether an empty today keeps yesterday's streak, recommended yes); tag filtering parity with untagged totals; refresh rotation/reuse; socket ordering (start then pause arriving back to back); idempotent session replay; timezone change behavior.

### 9.3 Product-level decisions to make explicitly during the rewrite

- One definition for week and month everywhere (suggested: calendar week Mon..Sun and calendar month for totals, goals, achievements, trends; keep a "last N days" option separate).
- Streak semantics (today empty keeps streak alive until the day ends).
- Whether sessions can be edited/deleted and how goals snapshots work (keep the daily goal snapshot per day, or store a goal history table with effective dates; apply to weekly/monthly too).
- Whether sessions crossing midnight are split server-side.
- Whether to keep "elapsed before current run = today's total" in the timer model (recommended: the timer tracks only the current session; "today's total" is `rollup + running segment`).
- Achievement persistence (store achieved periods so devices that were offline can show them, and to prevent duplicates; use proper period ids: `YYYY-Www`, `YYYY-MM`).
- Multi-tenant or single-tenant self-hosting: if self-hosting is the primary story, consider SQLite + single binary/container and an optional registration lock (`ALLOW_REGISTRATION=false`).

### 9.4 Quick reference: complete route list

```
GET    /health
POST   /auth/register | /auth/login | /auth/refresh | /auth/logout
POST   /sessions                 GET /sessions?page&limit&(range|from&to)     GET /sessions/today
GET    /stats/today?tagId        GET /stats/week?tagId     GET /stats/month?tagId
GET    /stats/history            GET /stats/summary?tagId  GET /stats/weeks?count
GET    /stats/by-tag?range
GET    /tags                     POST /tags                PATCH /tags/:id     DELETE /tags/:id
GET    /settings                 PATCH /settings/daily-target | weekly-target | monthly-target | timezone
GET    /users/me/active-timer
Socket.IO events: timer_start, timer_pause, timer_reset, timer_status_request, timer_status_response (client->server);
                  timer_started, timer_paused, timer_reset, timer_status_response, session_created, goal_achieved, goal_updated (server->client)
```

### 9.5 Source file map (for reference)

```
apps/api/src/index.ts              bootstrap, middleware, route mounting
apps/api/src/config.ts             env schema
apps/api/src/db.ts                 mongoose connect
apps/api/src/socket.ts             Socket.IO server, rooms, timer events, broadcastToUser
apps/api/src/services/activeTimer.ts   persisted timer read/write
apps/api/src/middleware/auth.ts    requireAuth
apps/api/src/models/{User,WorkSession,DailyStats,RefreshToken,Tag}.ts
apps/api/src/routes/{auth,session,stats,tags,settings,users}.ts
apps/api/src/utils/{auth,dates,goals,sessionStats,tags}.ts
apps/api/scripts/drop-database.ts  dev-only DB wipe
```


---

# Part C. Shared layer

# Pulse - Shared / Top-level Layer (packages/**, root files, docs/*.md)

Scope: `packages/*`, root config, `docs/*.md`, `scripts/`, `.cursor/rules`. `apps/api` and `apps/desktop` were only peeked at to understand how the shared code is used. `apps/mobile` exists (Expo/React Native, `0.0.5`) and has the same features as desktop; it reuses the same shared packages (`@repo/api-client`, `@repo/queries`, `@repo/types`, `@repo/utils`) and was otherwise not analysed.

All line references are to the repo at commit `92a9660` (main, clean tree, 2026-08-24 latest commit; 107 commits, first 2026-06-28).

---

## 0. One-paragraph summary

Pulse is a single-user-at-a-time personal "one play/pause timer" productivity tracker (Windows Electron + Android Expo clients, Node/Express/MongoDB/Socket.IO backend). The timer runs **locally** as `{isRunning, startedAt, elapsedBeforeCurrentRun}`; only completed work sessions (`startTime`, `endTime`, optional title/summary/tag) are POSTed to the server on pause; Socket.IO relays tiny `timer_*` events between the user's devices; the server also persists the "active timer" on the `User` document so a device can reconcile on connect/foreground. Shared packages hold: TS types, Zod schemas (only the API actually uses them), pure timer/day/format utils, an Axios client with refresh-token logic and user-scoped storage helpers, and TanStack Query hooks + a few non-React state helpers. The hardest, most bug-prone logic is cross-device timer reconciliation in `packages/utils/src/timer-sync.ts` and `packages/queries/src/active-timer.ts`, which mixes device-local clock stamps with server stamps and uses `Date.toDateString()` in the *device* timezone for day boundaries while the server computes stats in the *user-settings* timezone.

---

## 1. Product vision and intent (README, docs/plan.md, docs/high_level_architecture.md)

### 1.1 README (what is advertised)
Tagline: "A cross-platform productivity timer for **Windows** and **Android**. Track focused work time with a single play/pause control, daily/weekly/monthly goals, statistics, and seamless sync across your devices - even when you're offline."

Advertised features (README lines 9-17):
- One-tap timer: start/pause with one control; runs locally for accuracy.
- Offline-first: sessions saved on-device, synced when back online.
- Cross-device sync: real-time via WebSocket when switching desktop <-> phone.
- Goals: daily, weekly, monthly targets with progress tracking.
- Statistics: charts for last 7 days, 30 days, 12 months; streaks and averages.
- Session titles: label what you are working on.
- Dark mode: system-aware theming on both platforms.
- Desktop extras: system tray, launch at login, minimize to tray on close.
- Self-hostable: run your own backend.
README does NOT mention tags (added in last 3 commits), session summaries, goal-achievement notifications, auto-skip countdown, Android foreground service, timezone setting, or per-user local storage scoping; all of these are implemented.

Distribution: GitHub Releases (Windows NSIS installer `Pulse Setup <version>.exe`, Android `app-release.apk`). Official builds point to hosted API `https://pulse-be.duckdns.org` (eas.json). MIT license, (c) 2026 Mohammad Naimur Rahman. Repo `github.com/mohammad-naimur-rahman/Pulse`.

README tech-stack table: Turborepo+pnpm; Backend Node/Express/MongoDB/Socket.IO/JWT; Desktop Electron/React/Vite/Zustand/TanStack Query/Tailwind/shadcn; Mobile RN/Expo/NativeWind/Zustand/TanStack Query; Shared TS/Zod/Axios. README says Node 18+, pnpm 10, MongoDB 6+.

README repository-structure lists `packages/{api-client,queries,types,utils,validation}` but NOT `packages/ui`, `eslint-config`, `typescript-config`.

### 1.2 docs/plan.md (the original 14-phase plan, written before implementation)
Goal: "extremely simple": one timer, one Play/Pause toggle, track productive time, sync between devices, daily/weekly/monthly statistics. Priorities: Accuracy, Offline-first, Low database usage, Fast synchronization, Simple architecture, Clean UI.

Planned stack: Turborepo; Desktop Electron+React+Vite+TS+Zustand+React Query+Tailwind+shadcn; Mobile RN+Expo+Zustand+React Query+NativeWind; Backend Node+Express+TS+MongoDB+Mongoose+JWT+Refresh token+Socket.IO; Shared Zod, Axios, ESLint, Prettier. Planned `packages/ui,types,validation,utils`.

Phases:
1. Setup (Express+TS+ESLint+Prettier+env+Mongo; Electron app; Expo app; shared packages).
2. Auth: `POST /auth/register|login|refresh|logout`, JWT access + refresh, bcrypt.
3. DB design: `User{id,email,passwordHash,dailyTargetMinutes,timezone,createdAt,updatedAt}`, `WorkSession{id,userId,deviceId,startTime,endTime,durationMinutes,createdAt,updatedAt}`, `DailyStats{userId,date,workedMinutes,goalMinutes,updatedAt}` as a *cached summary* updated on every session create (do not aggregate every time).
4. Timer engine: runs locally, never synced per second, store `isRunning, startedAt, elapsedBeforeCurrentRun`; `elapsed = elapsedBeforeCurrentRun + (Date.now() - startedAt)`; never increment by 1s (survives freeze/sleep/lock/low FPS).
5. Offline: persist timer locally (SQLite or electron-store on desktop; MMKV or SQLite on mobile); pending sessions stay local until internet returns.
6. Session sync: Play = store `startedAt` locally, no API call. Pause = compute duration/start/end then ONE `POST /sessions`.
7. Device sync: Socket.IO events `session_started`, `session_paused`, `goal_updated`; only small events.
8. Endpoints: auth (4), `POST /sessions`, `GET /sessions`, `GET /sessions/today`, `GET /stats/today|week|month|history`, `PATCH /settings/daily-target`.
9. UI: Login (email, password, login, register); Home (big timer `04:25:18`, play/pause, today's progress "4h 25m / Goal: 8h / 55%"); Statistics (7d / 30d / 12 months charts; total hours, average hours, best day, current streak); Settings (daily goal presets 6/8/10 h, timezone, logout).
10. Charts: backend returns `[{date, workedMinutes}]`, frontend only renders (no heavy calc).
11. Error handling: offline mode, expired token, duplicate sync, invalid session, invalid login.
12. Security: JWT, refresh tokens, bcrypt, HTTPS, Helmet, CORS, rate limiting.
13. Testing: backend unit+API; frontend timer accuracy, offline sync, auth, socket sync.
14. Deployment: Docker, PM2, Nginx, MongoDB Atlas, electron-builder, Expo EAS.

Future features list: Categories (Coding, Reading, Exercise, Study), session notes, weekly goals, monthly goals, productivity heatmap, home-screen widget, desktop tray, keyboard shortcut, idle detection, calendar integration, CSV export, dark mode, multiple themes, achievement badges.

"Important engineering rules" (verbatim intent):
1. Timer always runs locally. 2. Never update the server every second. 3. DB stores completed sessions only. 4. Daily stats cached in DailyStats. 5. Every feature must work offline. 6. Socket.IO only for sync events. 7. Shared business logic in `packages`. 8. All API contracts use Zod validation. 9. React Query for all server state. 10. Zustand only for local UI and timer state. 11. Backend stateless except JWT refresh handling. 12. Simplicity over premature optimization.

### 1.3 docs/high_level_architecture.md (design rationale, conversational tone)
- "Personal productivity tracker, not Toggl. Optimize for reliability, offline support, low DB usage."
- Collections: `users`, `sessions` (`start`,`end`,`deviceId`,`createdAt`), `dailyStats` (running total incremented on insert: `dailyStats.workedMinutes += 30`; `GET /today` returns `workedMinutes, goalMinutes, percentage` with no aggregation).
- **"Never keep the running timer in MongoDB"** - store only completed sessions; running state lives in Zustand/React state on each device.
- Sync: Start stores `startedAt` locally; UI ticks via `Date.now()`; Pause sends one `POST /session`. Expected ~15-30 API calls/day instead of 86,400.
- Offline: pending sessions in SQLite/JSON file (desktop), SQLite/MMKV (mobile); sync when internet returns.
- Auth: email+password+JWT+refresh; store tokens in **Electron Safe Storage (desktop)** / **SecureStore (mobile)**.
- Cross-device: other device learns about running session via `GET /today` or WebSocket ("Working... Started 15 minutes ago"); pause on phone must instantly stop desktop via one tiny `paused` message.
- Charts: `GET /history?days=30` -> `[{date, workedMinutes}]` -> Recharts / Victory Native.
- Suggested extras: today's progress ring, current streak (days hitting target), weekly+monthly totals, average over 7 and 30 days, categories, notes, **auto-pause when idle 10 min**, Android widget + Windows tray widget, global shortcut `Ctrl+Shift+Space`.

### 1.4 Planned vs implemented (important for the rewrite)
| Planned | Implemented? | Notes |
|---|---|---|
| Timer state never in MongoDB | **Reversed.** | The server persists `User.activeTimer` (`isRunning, startedAt, elapsedBeforeCurrentRun, sessionTitle, tagId, updatedAt, updatedByDeviceId`) via socket handlers and exposes `GET /users/me/active-timer`. This was added (commit 702484b "server-authoritative active timer state") because pure peer-to-peer events lost state when a device was offline/closed. This is the single biggest architecture drift and the source of the clock-stamp reconciliation complexity. |
| Play does no API call | Partly | Play emits Socket.IO `timer_start` (server persists + broadcasts); no REST call. |
| Pause = one POST /sessions | Yes | Plus a `timer_pause` socket event carrying `elapsedBeforeCurrentRun`. A title dialog (start) and summary dialog (pause) with 5 s auto-skip countdown exist. |
| Socket events `session_started/paused`, `goal_updated` | Renamed/extended | Actual events: `timer_start/timer_started`, `timer_pause/timer_paused`, `timer_reset`, `timer_status_request/response`, `goal_updated`, `goal_achieved`, `session_created`. |
| DailyStats cached summary | Yes | `DailyStats` model kept (API scope); stats routes still partly aggregate sessions for tags. |
| Tokens in Electron safeStorage / SecureStore | **No** | Desktop uses `localStorage` (`createLocalStorageAdapter`), mobile uses AsyncStorage adapter (`createAsyncStorageAdapter`). Not encrypted. |
| SQLite/MMKV/electron-store persistence | **No** | Zustand `persist` -> `localStorage` (desktop) / AsyncStorage (mobile), via user-scoped wrapper. |
| `packages/ui` shared components | **Dead scaffold** | Still contains create-turbo template `Button`, `Card`, `Code`; not imported by any app. Desktop uses shadcn/ui locally, mobile uses NativeWind. |
| Zod validation for all API contracts | API only | `@repo/validation` is imported by `apps/api` routes only; clients do not validate with it. Responses are untyped/unvalidated casts. |
| Tests (timer accuracy, offline sync, auth, socket) | Almost none | Only `packages/utils/src/timer-sync.test.ts` (7 tests). |
| PM2/Nginx/Atlas deployment | Docs only | SELF_HOSTING.md documents Docker, PM2, nginx, Caddy; the author's real deployment is `pulse-be.duckdns.org`. |
| Idle detection, heatmap, CSV export, calendar, widgets (home screen), badges, shortcuts | Not implemented | Tray + launch-at-login + Android foreground service were added instead. Weekly/monthly goals, categories (as **tags**), session notes (as **summary**), dark mode: implemented. |
| `GET /stats/history`, `/stats/month` | Exist | Plus `/stats/summary`, `/stats/weeks`, `/stats/by-tag`. |
| Statistics 12-month chart | Advertised in README | Types only have `SessionRange = "today"|"week"|"month"|"year"` for session listing; no monthly-series type exists in `@repo/types` (chart data types are `DailyStatsPoint`, `WeeklyStatsPoint`). Verify in the stats API/pages. |

---

## 2. Monorepo structure, tooling, build/release pipeline

### 2.1 Layout
```
Pulse/                      (root package "Pulse" v0.0.5, private)
  apps/
    api/        Express + Mongoose + Socket.IO       (pkg "api")
    desktop/    Electron + React + Vite + Zustand    (pkg "desktop")
    mobile/     Expo RN + NativeWind + Zustand       (pkg "mobile")   [ignored in this doc]
  packages/
    types/             @repo/types            raw TS interfaces only (no runtime code)
    validation/        @repo/validation       Zod schemas (consumed only by apps/api)
    utils/             @repo/utils            pure fns + vitest test  (dep: @repo/types)
    api-client/        @repo/api-client       axios client, tokens, user-scoped storage (dep: axios)
    queries/           @repo/queries          TanStack Query hooks + timer/goal helpers
                                              (deps: api-client, types, utils, axios; peers: react ^19, @tanstack/react-query ^5.101.2)
    ui/                @repo/ui               create-turbo leftover (Button/Card/Code) - UNUSED
    eslint-config/     @repo/eslint-config    base.js / next.js / react-internal.js (flat config)
    typescript-config/ @repo/typescript-config base.json / nextjs.json / react-library.json
  docs/  plan.md, high_level_architecture.md, RELEASE.md, SELF_HOSTING.md
  scripts/generate-brand-assets.mjs
  patches/@react-native__gradle-plugin@0.85.3.patch
  .cursor/rules/auto-commit.mdc
  Dockerfile, docker-compose.yml, docker-compose.api-only.yml, .dockerignore
  app.json (root!), eas.json (root!), eas-build-pre-install.sh, .easignore
  turbo.json, pnpm-workspace.yaml, .npmrc, .prettierrc, LICENSE
```
Dependency direction: `types` <- `utils` <- `queries`; `api-client` <- `queries`; `validation` standalone; apps depend on the rest. Every internal package uses `"exports": { ".": "./src/index.ts" }` (TypeScript source, **no build step**; `ui` uses `"./*": "./src/*.tsx"`). Consumers (Vite, Metro, tsx) must transpile workspace TS. All internal package versions are in lockstep `0.0.5` (manually bumped, see RELEASE.md).

Note a hidden cycle-ish coupling: `@repo/utils/src/index.ts:196` has `import type { GoalAchievementType } from "@repo/types"` at the BOTTOM of the file (after use). Works only because it is type-only; style smell.

### 2.2 Root tooling (package.json, turbo.json, pnpm-workspace.yaml)
- `packageManager: pnpm@10.0.0`; `engines.node >=18` (Dockerfile uses `node:20-alpine`; README says Node 18+).
- pnpm workspaces: `apps/*`, `packages/*`.
- Root scripts: `build`, `dev`, `lint`, `check-types`, `test` (all `turbo run`), `format` (`prettier --write "**/*.{ts,tsx,md}"`), `generate:brand` (node script), `desktop:build:win` (`pnpm --filter desktop dist:win`), `mobile:build:android` (`assemble:release`), `mobile:install:android`, `mobile:log:android`.
  - NOTE: docs/RELEASE.md and docs/SELF_HOSTING.md say `pnpm desktop:dist:win`, but the root script is named `desktop:build:win` (README uses the correct name). Doc bug.
- Root devDependencies: `turbo ^2.10.0`, `typescript 5.9.2` (exact), `prettier ^3.7.4`, `sharp ^0.34.3`, `png-to-ico ^2.1.8`.
- `pnpm.overrides`: `react` and `react-dom` pinned to `19.2.3` (RN 0.85.3 needs a matching renderer; desktop declares `^19.2.7` which the override forces down to 19.2.3). `patchedDependencies`: `@react-native/gradle-plugin@0.85.3` patched (bumps `org.gradle.toolchains.foojay-resolver-convention` 0.5.0 -> 1.0.0 in `settings.gradle.kts`).
- `.npmrc`: `frozen-lockfile=false` (lockfile can drift silently; Dockerfile still passes `--frozen-lockfile`).
- `.prettierrc`: double quotes, trailing commas `all`, printWidth 80, tabWidth 2, semi. Not enforced (some files exceed 80 cols, e.g. `timer-sync.test.ts:3,6`).
- turbo.json: `ui: "tui"`; `globalEnv: PORT, MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV`; tasks: `build` (dependsOn `^build`, inputs default + `.env*`, outputs `.next/**` only = template leftover; api `dist/`, desktop `dist/`+`dist-electron/` are not declared outputs so turbo cannot restore them from cache), `lint` (dependsOn `^lint`), `check-types` (dependsOn `^check-types`), `test` (inputs default), `dev` (cache false, persistent). `VITE_API_URL` / `EXPO_PUBLIC_API_URL` are not declared env vars.
- Only these packages define scripts: `utils` (`test: vitest run`, `check-types: tsc --noEmit`), `ui` (`lint`, `check-types`), `api` (`dev/build/start/lint/check-types/db:drop`), `desktop`, `mobile`. `types`, `validation`, `api-client`, `queries` define **no** `check-types`/`lint`/`test` scripts, so `turbo run check-types|lint` silently skips them (they are only type-checked transitively via the apps). CONTRIBUTING.md tells contributors to run `pnpm lint` and `pnpm check-types`; desktop/mobile lint with `oxlint`, api/ui with `eslint --max-warnings 0`.

### 2.3 TypeScript config (packages/typescript-config)
`base.json`: `declaration`, `declarationMap`, `esModuleInterop`, `incremental:false`, `isolatedModules`, `lib: [es2022, DOM, DOM.Iterable]`, `module` + `moduleResolution: NodeNext`, `moduleDetection: force`, `noUncheckedIndexedAccess`, `resolveJsonModule`, `skipLibCheck`, `strict`, `target ES2022`. `nextjs.json` (unused leftover), `react-library.json` (`jsx: react-jsx`). Each shared package's tsconfig extends base with `outDir ./dist`, `include ["src"]`; `utils` excludes `src/**/*.test.ts` (so the test file is never type-checked); `queries` adds `jsx: react-jsx`. Apps: desktop/mobile use TypeScript `~6.0.x` while root/shared/api pin `5.9.2` (two TS majors in one repo).

### 2.4 ESLint config (packages/eslint-config) - all create-turbo leftover
- `base.js`: `@eslint/js` recommended + `eslint-config-prettier` + `typescript-eslint` recommended + `eslint-plugin-turbo` (`turbo/no-undeclared-env-vars: warn`) + `eslint-plugin-only-warn` (turns every error into a warning) + ignore `dist/**`.
- `next.js` (Next.js rules, unused - there is no Next app), `react-internal.js` (React + react-hooks; used only by `packages/ui`).
- Its README is titled "`@turbo/eslint-config`" (template text).
- Effect: `only-warn` + `--max-warnings 0` means lint fails on any issue, but only `api` and `ui` use it.

### 2.5 Versions of key dependencies (ranges as declared in package.json)
| Area | Dependency | Version |
|---|---|---|
| Runtime | Node | >=18 (Docker 20-alpine) |
| PM | pnpm | 10.0.0 |
| Build | turbo | ^2.10.0 |
| Lang | TypeScript | 5.9.2 (root/packages/api), ~6.0.2 (desktop), ~6.0.3 (mobile) |
| Shared | zod | ^3.24.1 (v3, not v4) |
| Shared | axios | ^1.18.1 |
| Shared | @tanstack/react-query | ^5.101.2 |
| Shared | vitest | ^3.2.7 (utils only) |
| React | react / react-dom | 19.2.3 forced by override |
| API | express ^4.21.2, mongoose ^9.7.3, socket.io ^4.8.3, jsonwebtoken ^9.0.3, bcrypt ^6.0.0, helmet ^8.2.0, express-rate-limit ^8.5.2, cors ^2.8.6, dotenv ^17.4.2, tsx ^4.22.4 | |
| Desktop | electron ^42.5.0, electron-builder ^26.15.3, vite ^8.1.0, @vitejs/plugin-react ^6.0.2, tailwindcss ^4.3.1, zustand ^5.0.14, socket.io-client ^4.8.3, recharts ^3.9.0, radix-ui ^1.6.0, @base-ui/react ^1.5.0, shadcn ^4.12.0, lucide-react ^1.21.0, oxlint ^1.69.0 | |
| Mobile | expo ~56.0.18, react-native 0.85.3, expo-router ^56.2.17, nativewind ^4.2.6, zustand ^5.0.14, async-storage ^2.1.2, socket.io-client ^4.8.1 | |
| Lint | eslint ^9.39.1, typescript-eslint ^8.50.0, eslint-plugin-react ^7.37.5, react-hooks ^5.2.0 | |
| Auth lifetimes (apps/api/src/utils/auth.ts:6-7) | access JWT 15 min (`{userId}`), refresh JWT 7 days (`{userId, jti}`), bcrypt 10 rounds | |

### 2.6 Build / release pipeline
There is **no CI** (no `.github/`); CONTRIBUTING says "Make sure CI checks pass (if configured)". Releases are fully manual (docs/RELEASE.md):
1. Bump the version by hand in: root `package.json`, `apps/api`, `apps/desktop`, `apps/mobile/package.json` + `apps/mobile/app.json`, every `packages/*/package.json`, plus hard-coded "About" strings in the desktop and mobile Settings screens.
2. Windows installer: `pnpm desktop:build:win` -> `apps/desktop/scripts/dist-win.mjs` (defaults `VITE_API_URL` to `https://pulse-be.duckdns.org`; `taskkill /F /IM Pulse.exe` first; builds into `release/.staging`, then moves `.exe/.blockmap/.yml` into `release/`) producing `apps/desktop/release/Pulse Setup <version>.exe` (electron-builder, appId `com.pulse.timetracker`, productName `Pulse`, NSIS target, icon `build/icons/icon.ico`).
3. Android: `pnpm mobile:build:android` -> `apps/mobile/scripts/assemble-release.mjs` (local Gradle release assemble) -> `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. Cloud alternative: EAS (`eas.json`): profiles `development` (dev client, internal), `preview` (internal, `buildType: apk`, `EXPO_PUBLIC_API_URL=https://pulse-be.duckdns.org`), `production` (autoIncrement, same env URL), `appVersionSource: remote`, `cli.version >= 21.0.2`. Root `app.json` contains only `expo.extra.eas.projectId = da3dbdb9-3d32-436f-b3d8-ba51d56e4762` and `android.package = com.naimur_rahman.pulse`; the real Expo config is `apps/mobile/app.json`, and root `eas.json` is a duplicate of `apps/mobile/eas.json` (root copies look like accidents of running `eas init` at the root). `.easignore` excludes `apps/api`, `apps/desktop`, `docs`, `.git`, `.cursor`, `node_modules`. `eas-build-pre-install.sh` runs `pnpm install --no-frozen-lockfile` so the lockfile matches the EAS server's pnpm version (lockfile-drift hack).
4. `git tag vX.Y.Z && git push origin vX.Y.Z`, draft a GitHub release, attach `.exe` and `.apk`, paste the release-notes template (downloads table + self-hosting link). No auto-update mechanism exists (no electron-updater, no store release); users reinstall manually.
5. Brand assets: `pnpm generate:brand` runs `scripts/generate-brand-assets.mjs` (sharp + png-to-ico) from `logo/logo_without_text.png` and `logo/logo_with_text.png` -> desktop `public/branding/logo-{mark,wordmark}.png`, `build/icons/{icon.png 512, favicon.png 32, icon.ico (16,32,48,64,128,256)}`, `public/favicon.png`; mobile `assets/{icon.png 1024, favicon.png 48, splash-icon.png (wordmark, 400 fit-inside), android-icon-foreground.png (15% padding), android-icon-background.png (solid #7C3AED), android-icon-monochrome.png (grayscale+negate+threshold 128)}`, `assets/branding/logo-{mark,wordmark}.png`. **The `logo/` source directory is not in the repo**, so the script fails on a fresh clone. Brand colour: purple `#7C3AED`.

### 2.7 Docker / self-hosting (Dockerfile, compose, docs/SELF_HOSTING.md)
- Dockerfile: 2-stage `node:20-alpine`; corepack pnpm 10.0.0; copies only the `package.json` of api/types/validation/typescript-config/eslint-config, `pnpm install --frozen-lockfile --filter api...`, copies sources, `pnpm --filter api build` (tsc); runner: `NODE_ENV=production`, `pnpm install --prod --filter api...`, copies `apps/api/dist` and the whole `packages/` dir, `WORKDIR /app/apps/api`, `EXPOSE 3001`, `CMD node dist/index.js`.
  - **Likely production-runtime bug (unverified, I did not run it):** `apps/api/dist/*.js` is CommonJS (e.g. `dist/routes/session.js:4` has `require("@repo/validation")`) but `@repo/validation` / `@repo/types` `exports` point to TypeScript source (`./src/index.ts`, ESM `import { z } from "zod"`, no `"type":"module"`). Node 20 cannot execute `.ts`, so `node dist/index.js` should throw at load unless something else compiles the workspace packages. The author's real deployment may differ (e.g. tsx / PM2 on a VPS). Verify before relying on the Docker path; a rewrite should publish compiled packages or bundle the API (tsup/esbuild).
- `docker-compose.yml`: `mongo:7` (volume `pulse-mongo-data`, mongosh ping healthcheck, not published to host) + `api` (build `.`, port `${API_PORT:-3001}:3001`, env `PORT=3001`, `MONGODB_URI` default `mongodb://mongo:27017/pulse`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, depends_on mongo healthy). `docker-compose.api-only.yml`: api only with external `MONGODB_URI`.
- SELF_HOSTING.md references `.env.docker.example` and `apps/api/.env.example` (the first is whitelisted in `.dockerignore`, but is not listed among tracked root files - verify it exists). Env reference: `PORT` (3001), `MONGODB_URI` (required, must start with `mongodb://` or `mongodb+srv://`), `JWT_SECRET`, `JWT_REFRESH_SECRET` (min 8 chars each - weak minimum), `NODE_ENV` (`development|production|test`). Client env: `VITE_API_URL` (desktop), `EXPO_PUBLIC_API_URL` (mobile; baked in at build time). Health endpoint `GET /health` -> `{"status":"OK","timestamp":"..."}`. CORS allows all origins (HTTP and Socket.IO); Helmet + rate limiting present; `trust proxy` set (commit 9f97481). WebSocket requires `Upgrade`/`Connection` headers forwarded by the proxy. Backup via `mongodump`. Self-hosting = rebuilding the clients with your URL (there is no runtime "server URL" setting in the apps).
- Doc claims "API includes rate limiting and Helmet" - confirmed in `apps/api/src/index.ts` (helmet, cors, generalLimiter, authLimiter on `/auth`).

### 2.8 .cursor/rules/auto-commit.mdc (AI-agent workflow, `alwaysApply: true`)
Instructs the agent to auto-commit after completed units of work (feature, fix, refactor, infra, design), not mid-task; skip if incomplete/secrets/plan-only; message style: imperative, one sentence, leading verb `fix|add|enhance|refactor|update`; never skip hooks, never force-push main, never amend unless own+unpushed+asked, never push unless asked, no empty commits; commit via HEREDOC; run `git status/diff/log -5` first. This explains the commit-history style (many "Enhance ..." messages; one commit message, c9c4e46, is a pasted voice-dictation prompt).

---

## 3. Shared types, DTOs and validation schemas

### 3.1 `@repo/types` (packages/types/src/index.ts) - TypeScript interfaces only, no runtime

| Type | Fields (all required unless `?`) | Used for / notes |
|---|---|---|
| `User` | `id: string`, `email`, `name`, `dailyTargetMinutes: number`, `weeklyTargetMinutes`, `monthlyTargetMinutes`, `timezone: string` | Auth responses (register/login). |
| `UserSettings` | `email`, `name`, `timezone`, `dailyTargetMinutes`, `weeklyTargetMinutes`, `monthlyTargetMinutes` | `GET /settings` and the three `PATCH /settings/*-target` responses. Near-duplicate of `User` minus `id` (types:1-18). |
| `Session` | `id`, `userId`, `startTime: Date`, `endTime?: Date`, `deviceId`, `createdAt: Date` | Legacy server-side shape; **unused by clients** (clients use `WorkSession`). `Date` objects do not survive JSON. |
| `Tag` | `id`, `name`, `createdAt: string`, `updatedAt: string` | A reusable session label. |
| `TagStatsRange` | `"today" \| "week" \| "month"` | `/stats/by-tag?range=`. |
| `TagStatsBucket` | `tagId: string \| null`, `tagName: string`, `workedMinutes: number` | `tagId null` + name `"Untagged"` = sessions with no/deleted tag (server adds this bucket). |
| `TagStatsBreakdown` | `range: TagStatsRange`, `tags: TagStatsBucket[]` | `/stats/by-tag`. Sorted desc by minutes (server). |
| `WorkSession` | `id?`, `_id?` (both optional; server may send either), `userId`, `deviceId`, `startTime: string` (ISO), `endTime: string` (ISO), `durationMinutes: number`, `durationSeconds: number`, `title?`, `summary?`, `tagId?`, `tagName?`, `createdAt: string`, `updatedAt?: string` | A completed session as returned by `/sessions`. `durationSeconds` was added later than `durationMinutes`, hence `getSessionDurationSeconds()` fallback (`Math.round(durationMinutes*60)`). |
| `PaginatedSessionsResponse` | `sessions: WorkSession[]`, `total`, `page`, `limit`, `hasMore: boolean` | `GET /sessions?range&page&limit` (page is 1-based). |
| `DailyStats` | `userId`, `date: "YYYY-MM-DD"`, `workedMinutes`, `goalMinutes`, `updatedAt: Date` | Server cache doc shape (`Date` again). |
| `TodayStats` | `workedMinutes`, `goalMinutes`, `percentage`, `date` | `GET /stats/today[?tagId]`. |
| `DailyStatsPoint` | `date`, `workedMinutes`, `goalMinutes`, `day?` (weekday label) | `GET /stats/week` (7 points, Mon..Sun). |
| `WeeklyStatsPoint` | `week: string`, `hours: number`, `workedMinutes: number` | `GET /stats/weeks?count=4`. |
| `StatsSummary` | `totalWorkedMinutes`, `weeklyWorkedMinutes`, `monthlyWorkedMinutes`, `weeklyTargetMinutes`, `monthlyTargetMinutes`, `weeklyPercentage`, `monthlyPercentage`, `averageDailyMinutes`, `bestDayMinutes`, `bestDayDate: string \| null`, `currentStreakDays`, `goalAchievementPercent` | `GET /stats/summary[?tagId]`. `goalAchievementPercent` = share of days with data this month meeting the daily goal, 1 decimal (per apps/api/stats.ts:268). |
| `TimerState` | `isRunning: boolean`, `startedAt?: number` (epoch ms), `elapsedBeforeCurrentRun: number` (ms; "today's total worked ms before the active segment"), `lastActiveDate?: string` (`Date.toDateString()` e.g. `"Fri Oct 24 2026"`), `sessionTitle?`, `tagId?` | The local timer model (persisted in Zustand + user-scoped storage). |
| `ActiveTimerState` | `isRunning`, `startedAt?: number`, `elapsedBeforeCurrentRun: number`, `sessionTitle?`, `tagId?`, `updatedAt?: string` (ISO, server time of last write), `updatedByDeviceId?` | Server-persisted timer (`User.activeTimer`) returned by `GET /users/me/active-timer` and socket `timer_status_response`. |
| `SessionRange` | `"today" \| "week" \| "month" \| "year"` | `GET /sessions?range=`. |
| `AppPage` | `"dashboard" \| "history" \| "statistics" \| "goals" \| "settings"` | UI navigation (the five app screens) - a UI concern living in the shared types package. |
| `GoalAchievementType` | `"daily" \| "weekly" \| "monthly"` | |
| `GoalAchievementEvent` | `type`, `workedMinutes`, `targetMinutes`, `periodKey: string` | Payload of socket `goal_achieved`. `periodKey` = `YYYY-MM-DD` for daily AND weekly (server sets `dateKey` for both), `YYYY-MM` for monthly (apps/api/src/utils/goals.ts:48,65,86). |

Units/conventions to preserve in a rewrite: all durations on the wire are **minutes** (stats) or **ms** (timer); timer timestamps are **epoch ms numbers** while session timestamps are **ISO strings** and server stamps are ISO strings; targets are stored in **minutes** with `0` = disabled; UI shows hours.

### 3.2 `@repo/validation` (packages/validation/src/index.ts) - Zod v3 schemas (used only by apps/api)

| Schema | Definition / constraints | Error messages |
|---|---|---|
| `RegisterSchema` | `email: string.email()`, `password: string.min(6)`, `name: string.trim().min(1).max(100)`, `timezone: string.min(1)` | "Invalid email address", "Password must be at least 6 characters", "Name is required", "Timezone is required" |
| `LoginSchema` | `email: string.email()`, `password: string.min(1)` | "Invalid email address", "Password is required" |
| `ObjectIdSchema` | `string.regex(/^[a-fA-F0-9]{24}$/)` (MongoDB ObjectId leaks into the shared contract) | "Invalid id" |
| `TagNameSchema` | `string.trim().min(1).max(50)` | "Tag name is required", "Tag name must be 50 characters or fewer" |
| `CreateTagSchema` / `UpdateTagSchema` | `{ name: TagNameSchema }` | |
| `SessionSchema` | `startTime: string.datetime()` (ISO-8601 with Z; no offsets by default), `endTime?: string.datetime()`, `deviceId: string.min(1)` ("Device ID is required"), `title?: string.trim().max(200)`, `summary?: string.trim().max(2000)`, `tagId?: ObjectIdSchema` | |
| `DailyTargetSchema` | `{ dailyTargetMinutes: number.nonnegative() }` | "Target must be 0 or greater" |
| `WeeklyTargetSchema` | `{ weeklyTargetMinutes: number.nonnegative() }` | same |
| `MonthlyTargetSchema` | `{ monthlyTargetMinutes: number.nonnegative() }` | same |
| `TimezoneSchema` | `{ timezone: string.min(1) }` | "Timezone is required" |
| `SessionRangeSchema` | `enum["today","week","month","year"]` | |
| `StatsByTagRangeSchema` | `enum["today","week","month"]` | |

Gaps (all intentional-or-oversight; a rewrite should decide explicitly): no schema for pagination query (`page`, `limit`), `tagId` stats filter, socket payloads (`timer_start`, `timer_pause`, `timer_reset`, status events - these are trusted raw), refresh/logout bodies, `name`/`email` update; targets have no integer or max bound (a `1e12` minute target is valid; `NaN`/`Infinity` rejected by zod number); `timezone` is not validated as an IANA zone (an invalid string falls back to UTC with `console.error` in the API `dates.ts`); `endTime` optional in `SessionSchema` but `WorkSession` always has `endTime`; no check `endTime > startTime`, no max duration, no future-time check, no client-supplied idempotency key (so "duplicate sync" from plan.md Phase 11 is NOT guarded at schema level).

### 3.3 REST contract as consumed by the shared client layer (from `@repo/queries`, `@repo/api-client`)
| Method + path | Params / body | Response type | Hook / caller |
|---|---|---|---|
| `POST /auth/refresh` | body `{refreshToken}` | `{accessToken, refreshToken}` (refresh token **rotates**) | `refreshTokens` (bare axios, no interceptors) |
| `GET /users/me/active-timer` | - | `ActiveTimerState` | `fetchActiveTimer` |
| `GET /stats/today` | `?tagId` | `TodayStats` | `useTodayStats(tagId?)` |
| `GET /stats/summary` | `?tagId` | `StatsSummary` | `useStatsSummary(tagId?)` |
| `GET /stats/week` | - | `DailyStatsPoint[]` | `useWeekStats` |
| `GET /stats/weeks?count=4` | (querystring hand-built into the URL) | `WeeklyStatsPoint[]` | `useWeeklyTrend` |
| `GET /stats/by-tag` | `?range` | `TagStatsBreakdown` | `useStatsByTag(range)` |
| `GET /sessions/today` | - | `WorkSession[]` | `useTodaySessions` |
| `GET /sessions` | `?range&page&limit(=20 default)` | `PaginatedSessionsResponse` (client tolerates a bare array too) | `useSessions(range, limit)` infinite query |
| `POST /sessions` | `{startTime,endTime,deviceId,title?,summary?,tagId?}` | created session | apps (not in shared hooks) |
| `GET /tags`, `POST /tags {name}`, `PATCH /tags/:id {name}`, `DELETE /tags/:id` | | `Tag[]`/`Tag`/- | `useTags/useCreateTag/useUpdateTag/useDeleteTag` |
| `GET /settings` | - | `UserSettings` | `useUserSettings`, `useGoalState` |
| `PATCH /settings/daily-target {dailyTargetMinutes}` / `weekly-target` / `monthly-target` | | `UserSettings` | `useUpdate{Daily,Weekly,Monthly}Target` |
| `PATCH /settings/timezone {timezone}` | | (unused body) | `useUpdateTimezone` |
| `/auth/register`, `/auth/login`, `/auth/logout` | per schemas | tokens + `User` | apps |

Socket.IO events (client-visible contract; auth via `socket.handshake.auth.token` = access JWT; server puts socket in room `user_<userId>`):
| Direction | Event | Payload |
|---|---|---|
| client -> server | `timer_start` | `{startedAt, elapsedBeforeCurrentRun, sessionTitle?, tagId?, deviceId}` |
| client -> server | `timer_pause` | `{elapsedBeforeCurrentRun, sessionTitle?, tagId?, deviceId}` (elapsed here is the **full-day** display ms at pause time) |
| client -> server | `timer_reset` | `{deviceId}` |
| client -> server | `timer_status_request` | - (server answers from DB) |
| client -> server | `timer_status_response` | `{requesterId, isRunning, startedAt, elapsedBeforeCurrentRun, sessionTitle, tagId}` peer reply, relayed to `requesterId` (note: the client's `timer_status_request` listener exists for peer-answering but the server handles the request itself and never forwards it, so the peer path is effectively dead) |
| server -> other devices (`socket.to(room)`, sender excluded) | `timer_started` / `timer_paused` | the sent payload + `updatedAt` (server ISO) |
| server -> other devices | `timer_reset` | none |
| server -> requester | `timer_status_response` | `{requesterId, isRunning, startedAt, elapsedBeforeCurrentRun, sessionTitle, tagId, updatedAt}` |
| server -> whole room (incl. sender) | `session_created` (session), `goal_achieved` (`GoalAchievementEvent`), `goal_updated` (3 target fields) | |

---

## 4. Timer model and sync algorithm (packages/utils: timer-day.ts, timer-sync.ts, period-progress.ts; packages/queries: timer-sync.ts, active-timer.ts)

### 4.1 Core model
```
TimerState {
  isRunning: bool
  startedAt?: epoch-ms          // device clock when the current segment began (only meaningful while running)
  elapsedBeforeCurrentRun: ms   // worked ms TODAY accumulated before the current segment
  lastActiveDate?: string       // Date.toDateString() in DEVICE tz, e.g. "Sat Oct 24 2026"; day this state belongs to
  sessionTitle?, tagId?
}
+ (store only, in-memory, NOT persisted): remoteUpdatedAt?: epoch-ms  // ordering stamp of last authoritative update
```
The timer is a **per-day** stopwatch, not a per-session one: `elapsedBeforeCurrentRun` is the day's total, so "paused" shows today's total and "play" continues from it. A *session* (the thing stored in the DB) is one `startedAt -> pause` segment, written once at pause (title/tag captured at start, summary entered at pause).

```
displayMs(state, now):              // getTodayTimerDisplayMs
  today = now.toDateString()                       // device-local calendar day
  if state.lastActiveDate and state.lastActiveDate != today:      // state belongs to an older day
      if state.isRunning and state.startedAt:
          todayStart = local midnight of today
          return state.startedAt < todayStart ? now - todayStart : now - state.startedAt
      return 0                                      // paused yesterday -> new day starts at 0
  if state.isRunning and state.startedAt:
      return state.elapsedBeforeCurrentRun + (now - state.startedAt)
  return state.elapsedBeforeCurrentRun
```
Properties: monotonic from wall clock (survives sleep/freeze); no clamping (a `startedAt` in the future from a skewed other device yields a negative segment); when `lastActiveDate` is undefined the day check is skipped (treated as today). UI re-renders every **100 ms** (desktop `useTimerControls` interval) and shows `formatTime(ms)` = `HH:MM:SS` (hours unbounded, floor).

Day helpers: `getLocalDayString(d=now) = d.toDateString()`; `getStartOfLocalDayMs(d)` = `setHours(0,0,0,0)`; `getEndOfLocalDayMs(d)` = `setHours(23,59,59,999)`. All use the **device's** timezone (JS `Date` local time), NOT `user.timezone` from settings. (Server stats use `user.timezone`; `useTimezoneSync` in the apps pushes the device timezone to `PATCH /settings/timezone` - the two are only equal if that sync has run. See section 8.)

### 4.2 Local state machine (desktop `useTimerStore` / `useTimerControls` / `useSocketSync`; mobile identical)
```
IDLE/PAUSED(elapsed=E, day=D)  --startTimer(title?, tag?)-->  RUNNING
RUNNING(startedAt=S, elapsed=E)  --pauseTimer-->  PAUSED(elapsed = E + (now - S))
any  --resetTimer-->  PAUSED(elapsed=0, title/tag cleared)
```
Actions (store, `useTimerStore.ts`):
- `startTimer(title?, tagId?)`: no-op if already running. `isNewDay = lastActiveDate && lastActiveDate != today`. Sets `isRunning=true, startedAt=now, sessionTitle = title.trim() || previous title || undefined, tagId = tagId || undefined` (tag is **replaced, not retained**, unlike title), `elapsedBeforeCurrentRun = isNewDay ? 0 : previous`, `lastActiveDate=today`, `remoteUpdatedAt=now`. Then the socket layer emits `timer_start{startedAt, elapsedBeforeCurrentRun, sessionTitle, tagId, deviceId}`. No REST call at start.
- `pauseTimer()`: no-op unless running with startedAt. `elapsed += now - startedAt`, clear `startedAt`, `lastActiveDate=today`, `remoteUpdatedAt=now`. The socket layer emits `timer_pause{elapsedBeforeCurrentRun: displayMsComputedBeforePausing, ...}`.
- Pause UX (desktop `useTimerControls`): `beginPause()` snapshots `{startTimeIso: new Date(startedAt), title, tagId}`, pauses locally and emits; a **summary dialog** (auto-skips after 5 s via `useAutoSkipCountdown`) then calls `completePause(summary)` which `POST /sessions {startTime: snapshot, endTime: new Date() AT DIALOG CLOSE TIME, deviceId: "desktop", title?, tagId?, summary?}`. Start also shows a **title dialog** with a 5 s auto-skip. Device ids are hard-coded `"desktop"` / (mobile) `"mobile"`; two desktops are indistinguishable.
- On POST failure (any error): session goes into the persisted offline queue (`useOfflineStore.pendingSessions`, each with a `localId`), retried every 30 s / on `online` event by `useSyncManager`: oldest first; network error or HTTP >=500 -> stop and retry later; HTTP 400 -> drop the session permanently; other 4xx -> keep (retries forever); success -> remove. No idempotency key; no max retry; a response lost after server success creates a duplicate on retry. `navigator.onLine` is used as a gate (unreliable in Electron/RN).
- App restart (`rehydrateUserPersistedStores`): if persisted `isRunning && startedAt` and (`lastActiveDate` missing or == today): **force-pause locally**, adding `now - startedAt` to `elapsedBeforeCurrentRun` and writing **no session**. (If `lastActiveDate` is an older day the timer is left running so the day-rollover logic below can close the old day.) After the socket connects, the server snapshot is reconciled over this local state (see 4.5), which normally flips it back to running with the server's numbers; offline restarts therefore lose the session record for the closed-app interval.
- `resetTimer()` sets everything to zero (elapsed 0, title/tag cleared, stamp=now); server persists the reset via `timer_reset`. Note the next `GET /stats/today` will re-seed `elapsedBeforeCurrentRun` from stored sessions (see `seedTodayElapsedFromStats`), so "reset" only clears the live/unsaved part.
- Day-change loop: `runDayChange()` runs on mount and every **10 s**; guarded by a ref against re-entrancy. If `lastActiveDate` is missing it is set to today; if it differs from today `rolloverTimerForNewDay` is awaited, the store is replaced with the result, and if the result is running a fresh `timer_start` is emitted so peers/server move to the new day.

### 4.3 `rolloverTimerForNewDay(state, saveSession, deviceId)` (packages/queries/src/timer-sync.ts:51-98)
```
today = toDateString(now)
prev = state.lastActiveDate
if prev is undefined or prev == today: return {...state, lastActiveDate: today}
prevDay = new Date(prev)               // parses the toDateString text -> local midnight of that day
if state.isRunning and state.startedAt:
    prevEnd = endOfLocalDay(prevDay)   // 23:59:59.999 of previous active day
    if state.startedAt < prevEnd:
        await saveSession({startTime: ISO(startedAt), endTime: ISO(prevEnd), deviceId, title?, tagId?})   // closes yesterday's slice
    return {isRunning: true, startedAt: startOfLocalDay(now), elapsedBeforeCurrentRun: 0,
            lastActiveDate: today, sessionTitle: carriedTitle, tagId: carriedTagId}   // continue running from today 00:00
else:
    return {isRunning: false, startedAt: undefined, elapsedBeforeCurrentRun: 0,
            lastActiveDate: today, sessionTitle: carriedTitle, tagId: carriedTagId}
```
Semantics/edge cases: a running timer crossing midnight yields a session ending 23:59:59.999 (note: the saved `endTime` is 1 ms short of midnight) and continues from 00:00:00.000 today; **only one previous day is closed even if the app was off for several days** (days between are dropped, `startedAt` resets to today 00:00 which also fabricates "running since midnight" time if the machine was off); title and tag carry over to the new day; `saveSession` here is the app's `saveSession` (POST, or enqueue offline on failure - so it never throws). Rollover on two devices at once will each post the same pre-midnight slice (duplicate session) unless the API dedupes - not guarded in shared code. The server buckets a session by the user-timezone date of its `startTime`, which is why the client must split at midnight.

### 4.4 `seedTodayElapsedFromStats(state, workedMinutes)` (queries/timer-sync.ts:22-49)
Called by `useTimerControls` whenever `useTodayStats()` data changes. Purpose: raise the local baseline when the server already knows more worked time today (sessions made on another device, or the app was reinstalled/cleared, or the offline-restart pause lost data).
```
if state.lastActiveDate and != today: return null
serverMs = workedMinutes * 60_000
if serverMs <= displayMs(state): return null          // never lowers
if not running: return {elapsedBeforeCurrentRun: serverMs, lastActiveDate: today}
segment = now - startedAt
newBase = max(0, serverMs - segment)
if newBase <= state.elapsedBeforeCurrentRun: return null
return {elapsedBeforeCurrentRun: newBase, lastActiveDate: today}
```
Consequences: server minutes include `endTime` = dialog-close time (see 4.2), so after each pause the server total can slightly exceed the local timer and this function silently "catches up" the visible timer to the server; the server value may be rounded to whole minutes (up to +30 s jump). Not tag-aware (always the unfiltered `useTodayStats()`).

### 4.5 `applyIncomingTimerState(state, incoming, remoteUpdatedAt?, source)` (packages/utils/src/timer-sync.ts:13-96) - remote -> local merge
`source`: `"live"` = a socket `timer_started/timer_paused` push from another device; `"reconcile"` = HTTP `GET /users/me/active-timer` or socket `timer_status_response` snapshot. `remoteUpdatedAt` = server `updatedAt` parsed to epoch ms (server clock). Store keeps `state.remoteUpdatedAt` (device clock for local actions, server clock for remote ones - mixed!).
```
today = toDateString(now)
nextStamp = remoteUpdatedAt ?? now
# 1. staleness guard (RECONCILE ONLY)
if source != live and remoteUpdatedAt != null and state.remoteUpdatedAt != null and remoteUpdatedAt < state.remoteUpdatedAt:
    return state                                    # unchanged, stamp NOT updated
# 2. live push always wins, no stamp compare, whole-state overwrite
if source == live:
    return {isRunning: incoming.isRunning,
            startedAt: incoming.isRunning ? incoming.startedAt : undefined,
            elapsedBeforeCurrentRun: incoming.elapsedBeforeCurrentRun,
            sessionTitle: incoming.sessionTitle, tagId: incoming.tagId,      # overwritten even if undefined
            lastActiveDate: today, remoteUpdatedAt: nextStamp}
# 3. reconcile
incomingDay = incoming.lastActiveDate
              ?? (remoteUpdatedAt ? toDateString(remoteUpdatedAt) : today)     # note: truthy test, 0 -> today
if incoming.isRunning != state.isRunning:                  # play/pause difference: always adopt play/pause
    return {isRunning: incoming.isRunning,
            startedAt: incoming.isRunning ? incoming.startedAt : undefined,
            elapsedBeforeCurrentRun:
                (incomingDay == today or incoming.isRunning) ? incoming.elapsedBeforeCurrentRun
                : (state.lastActiveDate == today ? state.elapsedBeforeCurrentRun : incoming.elapsedBeforeCurrentRun),
            sessionTitle: incoming.sessionTitle ?? state.sessionTitle,
            tagId: incoming.tagId ?? state.tagId,            # an incoming "no tag" can never clear a local tag here
            lastActiveDate: today, remoteUpdatedAt: nextStamp}
if state.lastActiveDate == today and incomingDay != today:   # same run-state, stale-day snapshot
    return {...state, remoteUpdatedAt: nextStamp}            # keep local elapsed; only bump stamp
if incomingDay == today:                                     # same run-state, same day -> adopt remote values
    return {isRunning: incoming.isRunning, startedAt: incoming.isRunning ? incoming.startedAt : undefined,
            elapsedBeforeCurrentRun: incoming.elapsedBeforeCurrentRun,
            sessionTitle: incoming.sessionTitle, tagId: incoming.tagId,
            lastActiveDate: today, remoteUpdatedAt: nextStamp}
return {isRunning: incoming.isRunning, startedAt: incoming.isRunning ? incoming.startedAt : undefined,   # both stale-day
        elapsedBeforeCurrentRun: state.elapsedBeforeCurrentRun,
        sessionTitle: incoming.sessionTitle ?? state.sessionTitle, tagId: incoming.tagId ?? state.tagId,
        lastActiveDate: state.lastActiveDate ?? incomingDay, remoteUpdatedAt: nextStamp}
```
Design intent (from comments and commits 7017b03, b2f2dc4): a live play/pause from another device must never be rejected just because the *client* wall clock is ahead of the *server* (Atlas/server time is "often a few seconds behind"), so live events skip the timestamp comparison entirely; reconcile snapshots still protect today's accumulated elapsed from a stale previous-day total but never drop a newer play/pause.

Known gaps in this function:
- A reconcile snapshot that flips `isRunning` to true with `incomingDay != today` (timer running since yesterday) sets `lastActiveDate: today` and `elapsedBeforeCurrentRun = incoming.elapsed`, discarding today's local elapsed; `displayMs` then uses `elapsed + (now - startedAt)` with `startedAt` possibly yesterday, **counting yesterday's time as today** and defeating the midnight clamp (the clamp only applies if `lastActiveDate != today`).
- `live` payloads carry the sender's `elapsedBeforeCurrentRun` but the sender's `startedAt` is the **sender's device clock**; receiving device computes `now_local - startedAt_sender`, so clock skew between devices directly shifts the displayed time (no server time offset is used anywhere).
- No sequence numbers: out-of-order live events (socket reconnect, polling fallback) can regress state; reconcile uses time stamps from two different clocks.

### 4.6 `reconcileActiveTimer(api, applyRemote, getLocalState?)` (queries/active-timer.ts:33-93)
Fetches `GET /users/me/active-timer`, converts via `activeTimerToTimerState` (`lastActiveDate = toDateString(updatedAt)` i.e. the day of the **last server write**, in device tz; missing `updatedAt` -> day unknown), `serverMs = Date.parse(updatedAt)` (invalid/missing -> `Date.now()`!).
```
remote = toTimerState(fetch)         ; serverMs = parse(updatedAt) or now
if getLocalState:
    local = getLocalState()
    if remote.isRunning and not local.isRunning and local.remoteUpdatedAt != null and serverMs < local.remoteUpdatedAt:
        return                           # local pause is newer than the server's "running" snapshot -> keep paused
    if not remote.isRunning and not local.isRunning:                # both paused: merge elapsed by max, never lose today's total
        localDay = local.lastActiveDate ?? today ; remoteDay = remote.lastActiveDate ?? today
        elapsed = (localDay==today and remoteDay!=today) ? local.elapsed
                : (localDay==today and remoteDay==today) ? max(local.elapsed, remote.elapsed)
                : (localDay!=today and remoteDay==today) ? remote.elapsed
                : 0
        lastActive = (localDay==today or remoteDay==today) ? today : localDay
        applyRemote({...remote, elapsedBeforeCurrentRun: elapsed, lastActiveDate: lastActive}, serverMs); return
applyRemote(remote, serverMs)            # -> store.applyRemoteTimerState(..., source="reconcile") -> applyIncomingTimerState
catch: console.warn only (offline-safe, silent)
```
Triggers (desktop `useSocketSync.ts`): socket `connect` (also refetches `settings`, then emits `timer_status_request`), `document.visibilitychange -> visible` (mobile equivalent on app foreground), and `timer_status_response` (server reply with DB state, `source="reconcile"`; peer echoes without `updatedAt` are ignored if local already has a stamp). `connect_error` triggers `refreshTokens` and a reconnect with the new token.

### 4.7 `mergeTimerStates(local, remote)` (utils/timer-sync.ts:98-161) - **dead code**
Older day-aware merge (`remote running wins; remote paused beats local running; both paused -> max elapsed; both stale day -> zeroed`). It is exported from `@repo/utils` and re-exported from `@repo/queries`, called only from the store action `syncTimerState`, which no component calls (desktop and mobile). Superseded by `applyIncomingTimerState`; delete in a rewrite, but note its "both stale -> reset to 0" and "max(local, remote) when both paused and both today" rules, which `reconcileActiveTimer` re-implements inline (duplication).

### 4.8 End-to-end sync sequences (as built)
1. Desktop start: store update -> `timer_start` emitted. Server (apps/api/socket.ts:58-64): `socket.to(room).emit("timer_started", {...data, updatedAt: nowISO})` FIRST, then asynchronously `persistTimerStart` on `User.activeTimer` (commit b2f2dc4: broadcast before DB write to remove latency). Phone receives `timer_started` -> `applyIncomingTimerState(..., "live")`, shows running with the desktop's `startedAt`.
2. Phone pause: local pause -> `timer_pause{elapsed = displayMs(before pause)}`; server broadcasts `timer_paused` (+ persists); desktop applies live -> paused with that elapsed; stats queries invalidated. Phone then POSTs the session; server writes session + DailyStats and broadcasts `session_created` (and maybe `goal_achieved`), which invalidates stat queries on all devices.
3. Phone opened later / reconnect: `reconcileActiveTimer` -> server `activeTimer` snapshot -> rules above.
4. Emission while disconnected: `emitTimerEvent` connects and registers `once("connect")` to emit - so the event is sent once at reconnect (events are not queued if the connect never happens; no replay); only the *latest* local state is later reconciled via the server snapshot, and the local stamp rule protects a local newer pause.

### 4.9 Test coverage (packages/utils/src/timer-sync.test.ts, vitest `^3.2.7`, run by `pnpm test` -> `turbo run test`; only `@repo/utils` has a `test` script)
7 tests, all on `applyIncomingTimerState` using the real wall clock (`today = getLocalDayString()`, `yesterday = now - 24h`):
1. live pause onto running timer -> `isRunning=false`, `startedAt` undefined, elapsed = incoming 20_000.
2. live start onto paused -> running with `startedAt=9_000`.
3. live start accepted even if local stamp (`Date.now()`) is newer than incoming stamp (`now-3s`) ("client clock ahead of server").
4. live pause under the same clock-skew condition.
5. reconcile yesterday's paused snapshot (3_600_000) onto today's paused 12_000 -> elapsed stays 12_000.
6. reconcile with `isRunning` differing across days (incoming running from yesterday) -> play/pause still applied (`isRunning=true, startedAt=9_000`) - the test does not assert the (wrong) elapsed result.
7. reconcile with older stamp (500 < 1_000) -> state unchanged, `remoteUpdatedAt` still 1_000.
NOT covered: `mergeTimerStates`, `getTodayTimerDisplayMs`, `rolloverTimerForNewDay`, `seedTodayElapsedFromStats`, `reconcileActiveTimer`, `period-progress`, every formatter, token refresh, user-scoped storage, goal sync, Zod schemas, and any DST/timezone/midnight case. `yesterday = now - 24h` can equal "today" on a 25-hour DST day (flaky twice a year); tests are excluded from `tsc` (utils tsconfig) so type errors in the test go unnoticed.

---

## 4b. Other pure utilities (packages/utils/src/index.ts, period-progress.ts)

| Function | Exact behaviour |
|---|---|
| `formatTime(ms)` | `floor(ms/1000)` -> `HH:MM:SS` zero-padded; hours not capped; negative input yields nonsense (`-1` -> "-1:-1:-1"-like). |
| `formatMinutes(m)` | `r = round(m)`; `0h` omitted when hours==0 (`"45m"`), minutes omitted when 0 (`"2h"`), else `"2h 5m"`; `0 -> "0m"`. |
| `formatDurationSeconds(s)` | `s = max(0, round(s))`; `"1h 2m 3s"`, `"2m 3s"` (when <1h), `"3s"` (when <1m). |
| `formatHoursDecimal(h)` | `formatMinutes(round(h*60))`. |
| `minutesToHours(m)` | `round(m/60*100)/100` (2 dp). `hoursToMinutes(h)` = `round(h*60)`. |
| `getSessionDurationSeconds(s)` | `s.durationSeconds ?? round(s.durationMinutes*60)`. |
| `getDeviceTimezone()` / `getDisplayTimezone()` | `Intl.DateTimeFormat().resolvedOptions().timeZone`, fallback `"UTC"` (also on empty/throw). `getDisplayTimezone` is an alias. |
| `formatSessionClock(iso, tz="UTC")` | `Intl` en-US `h:mm:ss AM/PM` in given tz; on error falls back to `toLocaleTimeString("en-US", ...)` in local tz. Default `"UTC"` if caller forgets tz. |
| `getLocalDateKeyFromIso(iso, tz="UTC")` / internal `getLocalDateKey(date, tz)` | `YYYY-MM-DD` via `Intl.formatToParts` (en-US month/day/year parts), fallbacks `1970`/`01`/`01`; on exception `toISOString().split("T")[0]`. Duplicates `apps/api/src/utils/dates.ts:getLocalDateString`. |
| `formatRelativeDate(dateKey, tz="UTC")` | `"Today"` if key == today-in-tz; `"Yesterday"` if == (now - 1 *local* day) formatted in tz (mixed local/tz arithmetic; wrong near DST/tz offsets); else `"Mon D"` e.g. `"Oct 24"` (en-US short month + numeric day, no year). |
| `getGoalAchievementLabel(type)` | `"Daily goal reached!"`, `"Weekly goal reached!"`, `"Monthly goal reached!"`. |
| `getGoalAchievementMessage(type, workedMinutes)` | `"You've logged {formatMinutes} today. Great work!"` / `"... this week. Keep it up!"` / `"... this month. Amazing progress!"`. |
| `getPeriodProgress(workedMinutes, hasTarget, goalHours)` | `goalMinutes = max(0, round(goalHours*60))`; `enabled = hasTarget && goalMinutes>0`; returns `{workedMinutes, hasTarget: enabled, percentage: enabled ? round(worked/goalMinutes*100) : null, remainingMinutes: enabled ? max(0, goalMinutes - worked) : null, goalMinutes}`. Percentage is **not capped** (can exceed 100). Note it takes goal in **hours** (input from UI state) not minutes. |
| `progressBarValue(pct)` | `null -> 0`, else `min(pct, 100)` (no lower clamp). |

`useAutoSkipCountdown({isOpen, seconds=5, onAutoSkip})` (queries): when `isOpen` flips true, reset `remaining=seconds`, `cancelled=false`, start a 1 s interval counting down; at 0 fire `onAutoSkip` exactly once (ref guard) and clear; returns `{skipLabel: cancelled ? "Skip" : "Skip (N)", cancelCountdown (call on any user interaction, e.g. typing), cancelled}`. The callback is kept in a ref so identity changes do not restart the timer. Used for the session title dialog (at start) and the summary dialog (at pause): if the user does nothing the dialog dismisses itself after 5 s and the action proceeds with no title/summary. `setRemaining` is called synchronously in the effect body (render-loop lint warning risk), and ticks are counted, not time-based, so a throttled background tab/phone can delay the auto-skip.

---

## 5. packages/queries - the client-side data layer

`@repo/queries` (React 19 + `@tanstack/react-query` v5 peer deps; axios instance injected, never imported as a singleton). Everything is re-exported from `src/index.ts`. The app owns the `QueryClient` (desktop `main.tsx:9`: `refetchOnWindowFocus:false, retry:1`; no `staleTime`/`gcTime` override, so every query is stale immediately; **no query-cache persistence, no `onlineManager` customisation, no `refetchInterval`**).

### 5.1 Plumbing
- `ApiProvider({api, children})` / `useApi()` (api-context.tsx): React context holding the Axios instance; `useApi()` throws `"useApi must be used within ApiProvider"` outside the provider. Every hook calls it.
- `queryKeys` (query-keys.ts) - hierarchical keys relied on for **prefix invalidation**:

| Key | Value | Notes |
|---|---|---|
| `todayStats` | `["todayStats"]` | with tag filter: `["todayStats", tagId]` (prefix-matches the unfiltered key's invalidation) |
| `statsSummary` | `["statsSummary"]` | + `tagId` variant |
| `weekStats` | `["weekStats"]` | |
| `weeklyTrend` | `["weeklyTrend"]` | fixed `count=4` |
| `todaySessions` | `["todaySessions"]` | |
| `sessions(range)` | `["sessions", range]` | infinite query; invalidated everywhere by the literal `["sessions"]` |
| `settings` | `["settings"]` | |
| `tags` | `["tags"]` | |
| `statsByTag` | `["statsByTag"]`; `statsByTagRange(range)` = `["statsByTag", range]` | |
`pulseQueryKeys` = array of the 8 root keys (todayStats, statsSummary, weekStats, weeklyTrend, todaySessions, settings, tags, statsByTag) - exported but not used by the shared code (intended for bulk invalidation/clear).

### 5.2 Read hooks (all plain `useQuery`, no select/placeholder/keepPrevious, errors surface as AxiosError)
`useTodayStats(tagId?)`, `useStatsSummary(tagId?)`, `useTags()`, `useStatsByTag(range)`, `useWeekStats()`, `useWeeklyTrend()` (`/stats/weeks?count=4`), `useTodaySessions()`, `useUserSettings()`, and `useSessions(range, limit=20)` = `useInfiniteQuery` with `initialPageParam: 1`, `getNextPageParam: last => last.hasMore ? last.page+1 : undefined`, response passed through `normalizeSessionsPage` (accepts a bare array -> `{sessions, total: len, page:1, limit, hasMore:false}`; fills missing `total/page/limit/hasMore`). `flattenSessionPages(pages)` flattens (tolerates array pages). The normalisation exists because the endpoint changed from array to paginated (backwards compat that a rewrite can drop).

### 5.3 Mutations (no optimistic updates anywhere; all require connectivity, no offline queue for these)
| Hook | Request | onSuccess |
|---|---|---|
| `useCreateTag` | `POST /tags {name}` | append to `["tags"]` cache if absent (dedupe by id), sort by `name.localeCompare` |
| `useUpdateTag` | `PATCH /tags/:id {name}` | replace in cache + re-sort; invalidate `todaySessions`, `["sessions"]`, `statsByTag`, `todayStats`, `statsSummary` |
| `useDeleteTag` | `DELETE /tags/:id` | remove from cache; same invalidations |
| `useUpdateDailyTarget` | `PATCH /settings/daily-target {dailyTargetMinutes}` | `mergeGoalSettingsIntoCache(qc, data, data)`; `syncGoalSettingsToLocal(data)`; invalidate `todayStats, statsSummary, weekStats, weeklyTrend, statsByTag` |
| `useUpdateWeeklyTarget` / `useUpdateMonthlyTarget` | `PATCH /settings/weekly-target` / `monthly-target` | same cache merge + local sync; invalidate only `statsSummary, statsByTag` |
| `useUpdateTimezone` | `PATCH /settings/timezone {timezone}` | invalidate `settings, todayStats, todaySessions, ["sessions"], statsSummary, weekStats, weeklyTrend, statsByTag` |
Tag-name uniqueness/case-folding is enforced server-side (Tag model has unique `{userId, nameKey}`), the client just surfaces the error. Note `useUpdateWeekly/MonthlyTarget` do not invalidate `todayStats` - fine, but they also do not touch `weeklyTrend`.

### 5.4 Settings query and goal state
- `settingsQueryOptions(api)`: key `["settings"]`, `GET /settings`, `staleTime: 0`, `refetchOnMount: "always"`. Re-fetched on every mount and on socket `connect` and token refresh (so goals are always eventually consistent with the server).
- `mergeGoalSettingsIntoCache(qc, goals, fullSettings?)`: `setQueryData(["settings"], old => old ? {...old, ...goals} : fullSettings ?? {email:"", name:"", timezone:"UTC", ...goals})` - the fabricated placeholder (empty email/name, timezone `"UTC"`) can transiently be read by `useTimezoneSync`.
- `applyRemoteGoalUpdate(qc, goals)` (socket `goal_updated` handler): merge into cache; `syncGoalSettingsToLocal(goals)`; `refetchQueries(settings)` (authoritative re-read); invalidate `todayStats, statsSummary, weekStats, weeklyTrend, statsByTag`.
- `GOAL_DEFAULTS = {dailyHours: 8, weeklyHours: 40, monthlyHours: 160}`.
- `useGoalState(storage)`: subscribes to the settings query and mirrors it into six `useState` values: `goalEnabled/dailyGoalHours`, `weeklyGoalEnabled/weeklyGoalHours`, `monthlyGoalEnabled/monthlyGoalHours`, plus setters (UI edits these locally before saving).
```
on settings change:
  daily = round(settings.dailyTargetMinutes / 60)
  goalEnabled = settings.dailyTargetMinutes > 0
  if dailyTargetMinutes > 0: dailyGoalHours = daily || 8          # minutes <30 round to 0 -> falls back to 8h (lossy)
  (same for weekly -> default 40, monthly -> default 160)
  persist hours to local KV (syncGoalSettingsToLocal)
```
  Goal enabling model: **a target of 0 minutes = goal disabled**. The goal editor is in hours (integers) while the server stores minutes, so sub-hour precision is lost in the UI and on write-back.
- `readStoredGoalHours(storage, key, fallback)`: reads a stored string, `parseInt`, falls back on NaN/empty. Used by Goals screens to restore the last non-zero goal when the user re-enables a disabled goal (so toggling a goal off does not lose its hours).
- `registerGoalStorage(storage|null)` / `syncGoalSettingsToLocal(settings, storage?)`: module-level singleton storage registered by the app (`GoalContext`/`App.tsx`) so mutation hooks (which have no storage parameter) can persist the hours; no-op when none registered. `persistGoalSettingsToLocal` (api-client) only writes a key when its target > 0, as `String(round(min/60) || 8|40|160)`.
- `GoalStorage` is declared in `goal-local-storage.ts` as an empty-extension interface of `KeyValueStorage` and re-exported twice (index.ts:38 and useGoalState.ts:15).

### 5.5 Goal achievements (goal-achievements.ts) - non-React event bus
Module-level singletons: `listeners: Set<fn>`, `seenKeys: Set<string>`. `emitGoalAchievement(event)` dedupes by `"${type}:${periodKey}"` (first emission only), then synchronously calls all listeners; `subscribeGoalAchievements(fn)` returns unsubscribe; `resetGoalAchievementDedup()` clears `seenKeys` (called on logout). Server decides when a goal is crossed (apps/api/utils/goals.ts `crossedThreshold(before, after, target)` on session creation) and pushes socket `goal_achieved`; the apps' `AchievementNotifier` subscribes and shows a toast/sound using `getGoalAchievementLabel/Message`. Dedupe is in-memory only: an app restart or a second device with the same event shows the notice again; daily and weekly events share `periodKey = YYYY-MM-DD` of the triggering session, so the weekly toast key changes every day (a weekly goal can be "reached" more than once if more sessions are added after crossing - server only fires when crossing the threshold, so normally once).

### 5.6 Timer helpers (see section 4): `rolloverTimerForNewDay`, `seedTodayElapsedFromStats`, `reconcileActiveTimer`, `fetchActiveTimer`, `activeTimerToTimerState`; types `SaveTimerSessionFn`, `TimerSessionPayload {startTime, endTime, deviceId, title?, summary?, tagId?}`; and re-export of `mergeTimerStates` from utils.

### 5.7 `useAutoSkipCountdown` - see 4b.

### 5.8 `user-session.ts` - switching accounts safely
```
bootstrapUserSession({userId, queryClient, rehydrateStores, goalStorageBackend?}):
    activateUserSession(userId)                       # sets module-global activeUserId in api-client
    if goalStorageBackend: await migrateLegacyGoalStorage(backend, userId)   # copy un-scoped goal keys into scope if scoped missing
    await rehydrateStores()                           # app callback: read scoped timer + offline stores, setState on zustand
    queryClient.clear()                               # drop all cached server data from a previous user
deactivateUserSession(queryClient): activateUserSession(null); queryClient.clear()
```
Called on app start (valid token, `getUserIdFromAccessToken`), after login/register, and on logout. Note: `deactivateUserSession` does not reset the Zustand timer/offline stores; with `activeUserId = null` the scoped storage silently drops writes and returns null reads.

---

## 6. packages/api-client - HTTP client, tokens, user-scoped storage

### 6.1 `createApiClient({baseURL, storage, onSessionExpired?, onTokenRefreshed?}) -> AxiosInstance`
- `axios.create({baseURL})` - **no timeout, no default headers, no retry**.
- Request interceptor: `token = await storage.getAccessToken()`; if present sets `Authorization: Bearer <token>`.
- Response interceptor: on error with `status === 401` and `error.config` present, `!config._retry`, and `!config.url.includes("/auth/refresh")`: set `_retry=true`, `accessToken = await refreshTokens(baseURL, storage, {onTokenRefreshed, onSessionExpired})`; if a token is returned re-issue `api(originalRequest)` with the new header; otherwise reject the original error. All other errors pass through untouched (AxiosError; callers inspect `error.response?.status`; there is no error normalisation, no typed error body, no 429/5xx handling).
- `TokenStorage` interface: `getAccessToken/getRefreshToken` (`string|null` or Promise), `setTokens(access, refresh)`, `clearTokens()`; sync-or-async to let `localStorage` and `AsyncStorage` share code (a local `resolve()` helper is duplicated 3 times across files).
- Adapters: `TOKEN_KEYS = {access: "pulse-access-token", refresh: "pulse-refresh-token", email: "pulse-user-email"}`. `createLocalStorageAdapter()` (desktop; plain `localStorage`) and `createAsyncStorageAdapter(asyncStorage)` (mobile AsyncStorage-like). `clearTokens` also removes the `email` key (the email key is written by app login code, never by this package). **Tokens are stored in plain, unscoped keys** (one logged-in account per device by design).

### 6.2 Refresh flow (tokens.ts)
```
decodeJwtPayload(token): base64url -> base64 + padding -> atob -> JSON.parse ; null on any failure or no atob   # no signature check
getAccessTokenExpiryMs(token) = payload.exp*1000 or null
isAccessTokenExpired(token, buffer=60_000) = !exp ? true : now >= exp - buffer         # unparseable/exp-less tokens count as expired

refreshTokens(baseURL, storage, opts?): Promise<string|null>
    if inflight[storage] exists: return it                          # WeakMap<TokenStorage, Promise> single-flight
    inflight = (async ->
        rt = storage.getRefreshToken(); if !rt return null
        resp = bare axios.post(`${baseURL}/auth/refresh`, {refreshToken: rt})     # no interceptors => no loop
        storage.setTokens(resp.accessToken, resp.refreshToken)         # server ROTATES the refresh token
        opts.onTokenRefreshed?()
        return accessToken
      catch e:
        if e.response?.status in {400, 401}: storage.clearTokens(); opts.onSessionExpired?()
        return null                                                   # network/5xx/429: keep tokens, report failure only as null
      finally: inflight.delete(storage))

ensureValidAccessToken(baseURL, storage, opts?): boolean
    if no refresh token: return false
    if access token present and not expired(60 s buffer): return true
    return (await refreshTokens(...)) !== null        # <-- offline + expired access token => false (see problems)

startTokenRefreshScheduler(baseURL, storage, opts?): stopFn
    stop previous; scheduleNext():
        exp = expiry(access); if none return
        delay = max(exp - 120_000 - now, 0)
        setTimeout(delay): clear handle; need refresh token; if current token not expired within 120 s lead -> scheduleNext(); else refreshed = refreshTokens(); if refreshed: scheduleNext()   # on failure the scheduler stops for good
stopTokenRefreshScheduler(storage): clearTimeout
```
Constants: `DEFAULT_REFRESH_BUFFER_MS = 60_000`, `PROACTIVE_REFRESH_LEAD_MS = 120_000` (with 15-minute access tokens the proactive refresh fires at ~13 min). Callbacks used by apps: `onTokenRefreshed` -> refetch settings + reconnect socket with the new token + broadcast `pulse-session-changed`; `onSessionExpired` -> stop scheduler, `activateUserSession(null)`, notify (UI returns to login).

### 6.3 User-scoped local storage (user-storage.ts)
- Module-global `activeUserId` (`activateUserSession(id|null)`, `getActiveUserId()`); `getUserIdFromAccessToken(token)` decodes the JWT `userId` claim.
- `scopeStorageKey(userId, key) = "pulse:" + userId + ":" + key`.
- `createUserScopedStorage(backend, getUserId = getActiveUserId)`: async `getItem/setItem/removeItem` that prefix keys; with **no active user: reads return null, writes/removes are silently dropped**.
- `createUserScopedPersistStorage(base, getUserId)`: same wrapper shaped for Zustand `persist` (`createJSONStorage`). **Legacy fallback**: on a scoped miss it reads the *unscoped* `name`; if found it copies the value into the scoped key and returns it (never deletes the legacy key).
- `PERSIST_STORE_KEYS = {timer: "pulse-timer-storage", offline: "pulse-offline-storage"}`; `GOAL_STORAGE_KEYS = {daily: "pulse-last-goal-hours", weekly: "pulse-last-weekly-goal-hours", monthly: "pulse-last-monthly-goal-hours"}`.
- `parsePersistedJsonState(raw, fallback)`: parse Zustand persist envelope `{state:{...}, version}` and shallow-merge `state` over `fallback`; malformed -> fallback.
- `migrateLegacyGoalStorage(backend, userId)`: for the 3 goal keys, copy legacy -> scoped if scoped is empty.
- `persistGoalSettingsToLocal(storage, settings)` as in 5.4.

---

## 7. Cross-cutting concerns

### 7.1 Offline-first strategy (as actually built)
| Capability | Offline behaviour |
|---|---|
| Start/pause/tick the timer | Fully local (Date.now arithmetic); persisted in Zustand `persist` (user-scoped localStorage/AsyncStorage). Works with no network once the app is open. |
| Completed session upload | `POST /sessions` attempt; on any failure the payload is pushed to the persisted `pendingSessions` queue (each with `localId`), flushed every 30 s, on `online`, and on mount; ordering oldest-first; 400 drops, >=500/network halts the queue, other 4xx stay forever; no idempotency key; no dedupe; no backoff; no cap/size warning. |
| Cross-device sync | Requires socket; events are not queued or replayed; reconcile on reconnect/foreground via REST + `timer_status_request`. |
| Stats, history, settings, tags, goals | Online only; no persisted query cache, so a cold offline start shows empty/error states. Goal hour values survive in local KV only to restore the toggle default. |
| Settings/tag/goal edits | Mutations only, no queueing; fail when offline. |
| **Cold start offline** | `hasValidSession()` -> `ensureValidAccessToken` returns **false** if the 15-min access token expired and the refresh request fails with a network error (no `response`), so `App.tsx` shows the **login screen** offline, i.e. the timer is unusable until connectivity returns, despite "offline-first" marketing (tokens are not cleared; a restart online recovers). |
| Local totals vs server | The local timer is the "truth" for the live display; `seedTodayElapsedFromStats` only ever raises it to the server total. |

### 7.2 Sync conflict handling (summary of rules)
1. Live socket events from other devices overwrite local play/pause + elapsed + title/tag unconditionally (last event received wins; no vector/sequence numbers).
2. Reconcile snapshots use `remoteUpdatedAt < local.remoteUpdatedAt` to ignore stale server state, comparing a **server** ISO stamp with a **device** `Date.now()` stamp from local actions (or an earlier server stamp from the last remote apply) - skew between the two clocks can drop a legitimately newer remote action or accept an older one.
3. Same-day, both paused: take `max(elapsed)`; never decrease today's total.
4. Different-day snapshots never overwrite today's elapsed unless run-state differs.
5. Server is a relay + last-writer-wins store for the timer (`User.activeTimer`); for sessions it is append-only (every pause creates a new immutable-ish document; there is no edit/merge concept in shared code).
6. Title wins from incoming where defined; tag is not clearable via reconcile (`incoming.tagId ?? state.tagId`), but is overwritten by live/same-day adoption.
7. Duplicate-work risks: midnight rollover on multiple devices, retry after lost response, rehydrate-pause without a session (data loss), dialog-delayed `endTime`.

### 7.3 Per-user local storage scoping
Goal: two accounts on one device must not see each other's timer/queue (commit fd4cda8). Key space: unscoped (device-level): `pulse-access-token`, `pulse-refresh-token`, `pulse-user-email`; scoped by `pulse:<userId>:`: `pulse-timer-storage`, `pulse-offline-storage`, `pulse-last-goal-hours`, `pulse-last-weekly-goal-hours`, `pulse-last-monthly-goal-hours`. Lifecycle: `activateUserSession(userId)` before any scoped read -> `rehydrateStores()` explicit hydrate from scoped keys (Zustand's own auto-hydrate at store creation runs with no active user and gets null) -> `queryClient.clear()`. Logout: `activateUserSession(null)` + `queryClient.clear()`.
Known leak/consistency issues: the legacy-key fallback copies old unscoped data into whichever user logs in first; the desktop `DEFAULT_TIMER_STATE` used on rehydrate omits `sessionTitle`/`tagId` (and `remoteUpdatedAt` is not persisted/reset), so after a logout->login as another user the in-memory title/tag of the previous user survive `setState` (desktop `store/rehydrateUserStores.ts:7-12`); the offline queue is per user (good) but `pendingSessions` retains a stale `tagId` if the tag is later deleted.

### 7.4 Auth & session lifecycle (client side)
Start: `hasValidSession()` -> if valid, decode `userId` from access token, `bootstrapUserSession`, start refresh scheduler; login/register: store tokens, `bootstrapUserSession(userId)`, `startSessionTokenRefresh()`. Any 401 -> single refresh then retry. `storage` event + custom `pulse-session-changed` event keep UI token state in sync across tabs/refresh. Socket connection uses the access token in `auth.token`, reconnects after each refresh, and on `connect_error` tries a refresh then reconnects.

### 7.5 Timezone
Device tz used by the client for day boundaries and display; user setting `timezone` (IANA string) used by server for stats/day bucketing; `useTimezoneSync` (apps) PATCHes `/settings/timezone` with the device tz whenever `settings.timezone != deviceTz` (once per mount per tz). Two devices in different zones will keep overwriting each other and the user's "day" shifts for server stats.

---

## 8. Problems, tech debt and missing tests in the shared/top-level layers

Severity: H = can lose/corrupt user data or break a core flow, M = wrong in edge cases / maintainability trap, L = hygiene. Paths relative to repo root. "Unverified" = inferred from reading, not executed.

### 8.1 Timer / sync correctness
| # | Sev | Location | Problem |
|---|---|---|---|
| T1 | H | `packages/utils/src/timer-day.ts:2-4`, `:6-16` | Day boundary = `Date.toDateString()` / `setHours` in the **device** timezone, but server stats bucket by `user.timezone` (apps/api `utils/dates.ts`, `sessionStats.ts:53` uses `session.startTime` in user tz). Devices in different zones, travel, or a stale `settings.timezone` desynchronise "today" between local timer, `seedTodayElapsedFromStats` and the server's `todayStats`. `toDateString()` output is also a locale-ish human string (English, engine dependent) persisted as the state's day key and re-parsed. |
| T2 | H | `packages/utils/src/timer-sync.ts:54-69` | In reconcile, when `isRunning` differs and incoming is running, `elapsedBeforeCurrentRun = incoming.elapsed` and `lastActiveDate = today` even if the snapshot is from yesterday (`incomingDay != today`): today's local elapsed is discarded and, because `lastActiveDate` is forced to today, `getTodayTimerDisplayMs` no longer clamps to midnight, so a timer running since yesterday displays yesterday's time as today's. Test #6 (`timer-sync.test.ts:116-131`) only asserts `isRunning/startedAt`, hiding it. |
| T3 | H | `packages/utils/src/timer-sync.ts:24-30,36-46` + `packages/queries/src/active-timer.ts:43-53` | Ordering mixes clocks: local actions stamp `remoteUpdatedAt = Date.now()` (device clock, `useTimerStore.ts:52,66,78`), remote actions stamp the server's `updatedAt`. Comparison `remote < local` is valid only if the clocks agree; the code papers over this by exempting `live` events from comparison altogether (no sequence numbers) so out-of-order live events or a slow reconnect can regress state, while reconcile can still wrongly drop a newer remote action when the device clock runs ahead. |
| T4 | H | Device-clock `startedAt` shared across devices (`useSocketSync.ts` `timer_start` payload; `timer-day.ts:37`) | Elapsed on device B = `elapsedBefore + (B.now - A.startedAt)`; any clock skew between A and B shifts the display and the saved session boundaries. No server-time offset is used. |
| T5 | H | `apps/desktop/src/hooks/useTimerControls.ts:164-171` (`completePause`) | `endTime = new Date()` at **summary-dialog close** time, not the pause instant, so the stored session is longer than the timer by the dialog dwell time (and `durationSeconds` follows). `seedTodayElapsedFromStats` (`packages/queries/src/timer-sync.ts:34-40`) then inflates the visible timer to match, masking the discrepancy. Mobile has the same flow. |
| T6 | H | `apps/desktop/src/store/rehydrateUserStores.ts:35-45` | App start force-pauses a running timer and adds the interval to local elapsed **without creating a session**; offline restarts lose that time on the server permanently and the local total stays higher than the server's forever (seed never lowers). |
| T7 | M | `packages/queries/src/timer-sync.ts:51-98` | Rollover posts `[startedAt, 23:59:59.999]` from every device that notices the day change (including devices merely mirroring a running timer) -> duplicate sessions unless server dedupes (not guarded here); only one previous day is handled, multi-day gaps vanish and `startedAt` is rewritten to today 00:00 (fabricated time); `new Date(previousDate)` parses the `toDateString()` text (non-ISO format; engine-defined, e.g. risky on Hermes); the 1 ms gap before midnight is lost. |
| T8 | M | `packages/utils/src/timer-sync.ts:50` | `remoteUpdatedAt ? ... : today` truthiness test (0 or undefined treated alike); `incoming.lastActiveDate` can be undefined while `remoteUpdatedAt` is set, deriving the day from the server update time rather than the work day. |
| T9 | M | `packages/queries/src/active-timer.ts:20-24` | Missing/invalid server `updatedAt` becomes `Date.now()`, making an unknown-age snapshot look newest; `activeTimerToTimerState` derives `lastActiveDate` from `updatedAt` (last write), not from the work day. |
| T10 | M | `packages/queries/src/active-timer.ts:43-87` | Calls `getLocalState()` twice (possible inconsistent reads); duplicates the "both paused -> max elapsed" rule of `mergeTimerStates` instead of sharing it; the first guard only covers `remote running & local paused`. |
| T11 | M | `packages/utils/src/timer-sync.ts:98-161` (+ `queries/index.ts:57`, store `syncTimerState`) | `mergeTimerStates` is dead code in both apps. |
| T12 | M | `packages/utils/src/timer-day.ts:37-39` | No clamp for negative segments (future `startedAt` from a skewed peer) -> negative display / `formatTime` garbage. |
| T13 | M | `useTimerStore.ts:48-52` | `startTimer` overwrites `tagId` with `tagId || undefined` but keeps previous title; a tag removed on another device is never reflected locally (`incoming.tagId ?? state.tagId` in reconcile at `timer-sync.ts:64,92`). `resetTimer` clearing + `seed` re-seeding makes "reset" ambiguous (see 4.2). |
| T14 | M | `apps/desktop/src/hooks/useSocketSync.ts:141-155` vs `apps/api/src/socket.ts:81-100` | Client has a `timer_status_request` responder (peer-to-peer design) but the server never forwards requests to peers, so it is dead; the dual path (`reconcileActiveTimer` + `timer_status_request`) fetches the same DB snapshot twice on every connect/foreground. |
| T15 | M | `apps/desktop/src/hooks/useSocketSync.ts:223-232` | `emitTimerEvent` when disconnected registers a one-shot `connect` listener per call: rapid start/pause while offline queue multiple closures that fire in call order at connect, replaying stale intermediate states (unverified ordering effects). |

### 8.2 Auth, storage, offline
| # | Sev | Location | Problem |
|---|---|---|---|
| A1 | H | `packages/api-client/src/tokens.ts:104-119`; `apps/desktop/src/App.tsx:130-141` | `ensureValidAccessToken` returns false when the access token (15 min TTL) is expired and the refresh request fails with a network error, so a cold start offline renders the **login screen**; stores are not rehydrated. Contradicts the offline-first goal. |
| A2 | M | `tokens.ts:159-162` | Proactive refresh scheduler stops permanently after one failed refresh (e.g. offline); relies on the 401 interceptor afterwards; no `online`/foreground re-arm (and `setTimeout` is suspended on mobile background/OS sleep). |
| A3 | M | `packages/api-client/src/index.ts:56` | `axios.create({baseURL})` has no `timeout`; offline/hung connections can block requests (and `refreshTokens` post `tokens.ts:80`) indefinitely; there is no retry/backoff, 429 handling or error normalisation. |
| A4 | M | `tokens.ts:88-93` | Any 400 or 401 from `/auth/refresh` wipes tokens and logs out (400 on malformed body counts); non-HTTP failures keep tokens (good). A request that gets 401 after a refresh already completed triggers a second refresh (rotation churn). |
| A5 | M | `packages/api-client/src/index.ts:107-140` | Tokens are stored in plain `localStorage` / AsyncStorage although the architecture doc specified Electron safeStorage / SecureStore; refresh token is long-lived (7 d) and readable by any renderer XSS. |
| A6 | M | `tokens.ts:11-30` | `decodeJwtPayload` returns type `{userId?, exp?}` but casts the parsed JSON to `{exp?}`; `atob` absence returns null -> `isAccessTokenExpired` true -> permanent refresh loop attempts; no UTF-8 handling (fine for ASCII ids). |
| A7 | M | `packages/api-client/src/user-storage.ts:60-75,83-112` | With no active user, writes are silently dropped (state lost, no error); legacy-key fallback copies unscoped data into the first user who loads it and never removes the legacy key (cross-account data bleed on shared devices); desktop `DEFAULT_TIMER_STATE` (`rehydrateUserStores.ts:7-12`) omits `sessionTitle`/`tagId`, leaking previous user's in-memory values on account switch; `deactivateUserSession` (`user-session.ts:31-34`) does not reset Zustand stores or disconnect the socket. |
| A8 | M | `apps/desktop/src/hooks/useSyncManager.ts` (also mobile) | Offline queue: no idempotency key (duplicates after lost responses), unauthorized (401) or other 4xx sessions stay in the queue forever, unbounded growth, `navigator.onLine` as gate, overlapping runs prevented only by a ref; queue entries keep `tagId`s that may be deleted later. |
| A9 | L | `api-client/src/index.ts:46-48`, `tokens.ts:7-9`, `user-storage.ts:51-53` | `resolve()` helper copy-pasted 3x; `TOKEN_KEYS.email` is cleared by the adapters but never set in this package. |
| A10 | M | `packages/queries/src/goal-sync.ts:23-28` | Placeholder `UserSettings` with `timezone: "UTC"` and empty `email/name` injected into the cache when settings are not loaded yet. |

### 8.3 Data/goals/stats semantics
| # | Sev | Location | Problem |
|---|---|---|---|
| G1 | M | `packages/api-client/src/user-storage.ts:118-138`, `packages/queries/src/useGoalState.ts:29-48` | Goals are minutes server-side but hours (rounded integers) in client state/storage; targets under 30 min round to 0 and silently become 8/40/160 h defaults; fractional-hour targets are re-saved rounded if the UI writes back. |
| G2 | M | `apps/api/src/utils/goals.ts:53` vs `apps/api/src/routes/stats.ts` week keys | "Weekly" achievement sums the **trailing 7 days** (`getPastLocalDateKeys(dateKey, 7)`) while weekly stats use the **calendar week Mon-Sun** (`getCurrentWeekDateKeys`); `periodKey` for weekly is the day, not the week (`goals.ts:65` (and `:48`)), so the shared dedupe key `weekly:<date>` is not a per-week key. Monthly "past 30 days" in `dateKeysForStatsRange` vs calendar month in goals. |
| G3 | L | `packages/utils/src/period-progress.ts:20` | Percentage uncapped and unrounded-input assumptions; `progressBarValue` clamps only the top. |
| G4 | L | `packages/queries/src/goal-achievements.ts:5-6` | Module-global listener set and unbounded `seenKeys`; not persisted (re-notifies after restart); not safe for SSR/tests without reset. |
| G5 | M | `packages/types/src/index.ts:20-27,74-80` | `Session` and `DailyStats` use `Date` (server shapes) and are unused/inaccurate on the wire; `WorkSession` has both `id?` and `_id?` (`:50-51`) so every consumer must handle either; `User` vs `UserSettings` near-duplicates; UI-only `AppPage` in a data package; timer types hold a locale string `lastActiveDate`; `remoteUpdatedAt` is bolted on via ad-hoc intersections in three places (`utils/timer-sync.ts:6`, store, `active-timer.ts:36`). |
| G6 | M | `packages/validation/src/index.ts` | `ObjectIdSchema` ties the shared contract to MongoDB; no integer/max on targets, no IANA check on timezone, no schemas for pagination/socket payloads/refresh body; `endTime` optional but required downstream; no `end > start`/max-duration checks; password min 6 only; `@repo/validation` unused by clients (no response validation). |

### 8.4 Query layer
| # | Sev | Location | Problem |
|---|---|---|---|
| Q1 | M | `packages/queries/src/index.ts` (325 lines) | God-module: hooks for stats, sessions, tags, settings plus re-exports; the same 5-8 `invalidateQueries` lines are copy-pasted in 8+ places (`index.ts:104-110,264-272,283-288,299-304,314-322`, desktop `useTimerControls.ts:41-49`, `useSocketSync.ts:128-133,184-189`; the `timer_paused` and `session_created` socket handlers omit `["sessions"]`, so the History list is not refreshed by remote sessions). Mutations invalidate inconsistent sets (weekly/monthly target hooks skip `todayStats`/`weekStats`). |
| Q2 | M | `queries/src/index.ts:184` | Query string hand-concatenated into the URL (`/stats/weeks?count=4`); `useTodayStats` etc. share ad-hoc key suffixing (`[...key, tagId]`) that only works by prefix-invalidation convention. |
| Q3 | M | whole package | No optimistic updates, no persisted cache, no offline mutation queue besides sessions; first paint offline is empty. |
| Q4 | L | `queries/src/use-auto-skip-countdown.ts:20,36-46` | Assigns ref during render (`onAutoSkipRef.current = onAutoSkip`), synchronous `setState` inside effect (React-Compiler/lint violations), tick-count rather than deadline-based (drifts when throttled). |
| Q5 | L | `queries/src/index.ts:196-233` | Backwards-compat normalisation of array vs paginated responses (`normalizeSessionsPage`, `flattenSessionPages`) for an API that no longer returns arrays. |
| Q6 | L | `queries/src/useGoalState.ts` + `goal-local-storage.ts` | Two parallel mechanisms (React state + module singleton storage + react-query cache) for the same three numbers; `GoalStorage` type exported twice. |

### 8.5 Tooling, structure, docs
| # | Sev | Location | Problem |
|---|---|---|---|
| R1 | M | `Dockerfile:43-47`, all `packages/*/package.json` `exports` | Workspace packages export raw `.ts`; the API compiles to CJS and requires them at runtime -> production image very likely cannot start on Node 20 (unverified). |
| R2 | M | repo root | No CI, no automated tests for anything but 7 util tests, no release automation, no auto-update, manual 12+ place version bump, `.npmrc frozen-lockfile=false` + `eas-build-pre-install.sh` regenerate the lockfile (non-reproducible builds). |
| R3 | L | `packages/ui`, `packages/eslint-config/{next.js,README.md}`, `packages/typescript-config/nextjs.json`, `turbo.json:9` (`.next/**` outputs) | create-turbo template residue; `packages/ui/src/card.tsx` even has a stray `"` in a URL (`utm_campaign=create-turbo"`), `button.tsx` is `alert()` demo. |
| R4 | L | `turbo.json` | `build` outputs do not include `dist/**` / `dist-electron/**`; no env declarations for `VITE_API_URL`/`EXPO_PUBLIC_API_URL`; `check-types`/`lint` skipped for four shared packages with no scripts. |
| R5 | L | `package.json`, apps | Mixed linters (eslint+only-warn vs oxlint) and mixed TS majors (5.9.2 vs ~6.0). |
| R6 | L | docs | `RELEASE.md`/`SELF_HOSTING.md` call `pnpm desktop:dist:win` (script is `desktop:build:win`); README omits `ui/eslint-config/typescript-config`, tags, summaries, timezone, goal notifications; architecture doc contradicts implementation (timer in Mongo); `scripts/generate-brand-assets.mjs` needs an untracked `logo/` folder; root `app.json`/`eas.json` duplicate mobile config; `.vscode/settings.json` is an unrelated Postman setting. |
| R7 | M | apps | `useTimerStore.ts`, `useOfflineStore.ts`, `rehydrateUserStores.ts` are byte-identical in desktop and mobile; `useTimerControls.ts` (6 diff lines), `useSocketSync.ts` (116 diff lines), `useSyncManager.ts` (31 diff lines) are near-identical copies -> every sync fix (see git log: many timer-sync fix commits: c041bd6, 8821019 on 08-01, b74004e, 7017b03, b2f2dc4 on 08-23) must be applied twice. The shared packages hold only the pure helpers. |
| R8 | L | `packages/utils/src/index.ts:196` | `import type` at end of file; date-key helper duplicated with API `dates.ts`; formatting + business rules in one index. |

### 8.6 Missing tests (priority order)
1. Property/table tests for all of `timer-sync.ts` (`mergeTimerStates`, remaining `applyIncomingTimerState` branches: reconcile same-day adopt, stale-day keep, both-stale, title/tag fallback).
2. `getTodayTimerDisplayMs` across midnight (running since yesterday, paused yesterday, undefined `lastActiveDate`, future `startedAt`).
3. `rolloverTimerForNewDay` and `seedTodayElapsedFromStats` (with fake timers and TZ matrix, DST days incl. 23/25-hour days; multi-day gap).
4. `reconcileActiveTimer` (stamps skew, both-paused merging, fetch failure).
5. Token refresh: single-flight, 400/401/5xx/network behaviour, scheduler re-arm, `ensureValidAccessToken` offline.
6. User-scoped storage: scoping, legacy migration, no-active-user behaviour, account switch.
7. Goal rounding and `getPeriodProgress` edge cases; formatters (`formatRelativeDate` across tz).
8. Zod schemas (boundary values) and contract tests API <-> client types.
9. Offline queue: duplicate prevention, 4xx handling, ordering.
10. End-to-end two-client sync simulation (virtual clocks).

---

## 9. Rewrite recommendations for the shared layer (opinionated)

### 9.1 Make time correct by construction (replaces ~70% of the sync code)
1. **Do not model a per-day stopwatch.** Drop `elapsedBeforeCurrentRun` + `lastActiveDate`. Server state per user is just: `activeSegment: {id (client UUID), startedAt (server-assigned UTC), title?, tagId?} | null`. "Today total" = `sum(closed sessions clipped to the user's local day) + (now_server_adjusted - activeSegment.startedAt, clipped to today)`. Seeding, rehydrate-pause, rollover merging, `mergeTimerStates`, `seedTodayElapsedFromStats` disappear.
2. **Server is the clock.** At connect, measure `offset = serverNow - (clientNow + rtt/2)`; elapsed uses `Date.now() + offset` (still fully local per-second ticking, still no per-second network traffic). `startedAt` is assigned by the server when it receives the `start` command (or client time corrected by offset). Eliminates T3/T4 clock-mixing.
3. **Commands with versions and idempotency.** `start`, `pause(summary?)`, `discard` are commands carrying `clientEventId` (UUID) and `baseVersion`; the server keeps a per-user monotonically increasing `timerVersion`, applies commands with compare-and-swap, replies with the new full state, and broadcasts `{state, version}` to the other devices. Clients accept only `version > localVersion`. Conflict policy: two starts -> second is a no-op returning the existing segment; pause while already paused -> no-op. This replaces `live` vs `reconcile`, stamps, and the day-aware merges.
4. **Close the session on the server at pause.** `pause` creates the session atomically with `endTime = server pause time` (fixes T5), splits at user-local midnight server-side (fixes T7 duplicates; one place, one timezone library), and returns updated daily/week/month totals in the response (no extra stats round trips; no ambiguity about rounding). Session `id` = the client-generated UUID so retries are idempotent (fixes A8 duplicates).
5. **Offline outbox.** Persist commands (not sessions) in an ordered outbox with UUIDs and replay on reconnect; while offline the client applies commands optimistically to a local projection. On reconnect: replay -> server returns authoritative state/version -> adopt. Cap/inspect failed items (4xx -> surface to user, never silent drop).
6. **One timezone policy.** Store `timezone` (IANA) per user and, additionally, `tz` + `localDate` on each session at write time so history does not move when the user travels. All day keys are ISO `YYYY-MM-DD` computed by one library (Temporal/luxon/date-fns-tz) in shared code - never `toDateString()`. Devices use the *user setting* timezone for "today", not the device zone; offer an explicit "use device timezone" toggle instead of silent auto-PATCH (avoids multi-device ping-pong).
7. Crash/restart handling: because the open segment lives on the server (and optionally in the local outbox), an app restart simply re-reads the segment; no force-pause, no lost time.

### 9.2 Shared package architecture
- Create one platform-agnostic `core` package (no React): timer projection, outbox, reconcile rules, day math, goal math, formatters, with **injected adapters** `Clock`, `KeyValueStore`, `Transport` (HTTP/WS), `Connectivity`. Move the duplicated desktop/mobile stores/hooks (`useTimerStore`, `useOfflineStore`, `useTimerControls`, `useSocketSync`, `useSyncManager`, `rehydrateUserStores` - R7) into it; the apps keep only UI and adapter wiring. Every sync bug fix then lands once.
- Contract-first API: one schema source (zod/valibot -> OpenAPI, or tRPC/ts-rest) that generates the typed client and server validators; validate **responses** and **socket payloads** too. Separate `Dto` (wire: ISO strings, `id`) from DB documents; one `id` field (no `_id`); never leak ObjectId regexes into the contract; no `Date` in DTOs. Delete `Session`, `DailyStats`(server), `AppPage`, `mergeTimerStates`.
- Compile packages (tsup/tsc project references, or ship a single-build workspace) so the server never requires TS at runtime (R1); keep `exports` pointing to `dist`.
- Query layer: split by domain (`stats`, `sessions`, `tags`, `settings`, `timer`); one **query-key factory** with parameter objects; one `invalidateAfterSessionChange(qc)` / `invalidateAfterGoalChange(qc)` helper and a single `socketEvent -> invalidate` map (Q1/Q2); persist the query cache (TanStack `persistQueryClient` or SQLite) with a per-user key and `gcTime` large enough for offline cold start; add optimistic updates for tag/goal edits with rollback or a settings outbox.
- Auth client: treat "signed in" as "has refresh token" and never block the UI on access-token validity (A1); apply a request `timeout` (10-15 s), distinguish network errors from 401, exponential backoff with jitter, re-arm refresh on `online`/foreground/visibility (A2/A3); single-flight refresh with the rotated token (and server-side reuse detection); store tokens in OS secure storage (Electron `safeStorage`/Windows DPAPI, Android Keystore/EncryptedSharedPreferences/SecureStore) (A5).
- Local storage: one `UserScopedStore` abstraction keyed `userId:` and created *after* auth resolves (no module-global `activeUserId`, no silent drops); delete legacy-migration code (or run it once and delete legacy keys); reset in-memory stores on logout; on account switch also disconnect/reconnect the socket.
- Goals: store minutes only; UI accepts hours/minutes decimals; "disabled" as explicit `null`, not `0`; remember last non-zero value in the server settings (or local KV) rather than hours rounded in three places. Make weekly = ISO week (Mon-Sun), monthly = calendar month everywhere (stats, achievements, UI) and use `periodKey = 2026-W43 / 2026-10 / 2026-10-24`; persist "already notified" per period server-side (`goalAchievements` array or flag on `DailyStats`) instead of in-memory dedupe (G2/G4).
- Types: single `TimerState` = `{status: "idle"|"running", segment?: {id, startedAtServer, title?, tagId?}, version}`; no ad-hoc intersections for stamps.

### 9.3 Tooling and delivery
- One linter/formatter (Biome, or oxlint + Prettier) and one TypeScript version; delete `eslint-config`, `ui`, `typescript-config/nextjs.json`, template residue.
- CI (GitHub Actions): install with `--frozen-lockfile`, lint, typecheck all packages (add the missing scripts), unit tests, build desktop + android, run an API contract test against an ephemeral DB; release workflow on `vX.Y.Z` tag that builds artifacts, drafts the GitHub release and publishes `electron-builder` update metadata (use `electron-updater`) and an EAS build; single-source versioning (changesets or `pnpm -r version`) replacing the manual 12-place bump.
- Remove root `app.json`/`eas.json` duplicates; commit `logo/` (or generate brand assets from SVG in the repo); fix docs script names; keep `.env.example` for every app and document `VITE_API_URL` baking vs. a runtime-configurable server URL (self-hosters should be able to type their server URL in the app instead of rebuilding).
- Testing strategy: inject `Clock`, run table-driven tests with fake timers and a TZ matrix (UTC, `America/Los_Angeles`, `Asia/Dhaka`, `Pacific/Auckland`, DST transition days), property tests for the command/reconcile reducer (convergence regardless of event order), a two-client simulator with skewed clocks, offline-outbox replay tests, auth refresh tests (mock transport), storage-scoping tests, and E2E happy path (start -> pause -> history -> goal toast) per platform.

### 9.4 Behaviours worth preserving exactly (product-level acceptance list)
1. One play/pause control; large `HH:MM:SS` timer showing **today's total** (not per session); updates smoothly (<=100 ms), accurate across sleep/lock.
2. Optional **session title** prompt at start and optional **summary** prompt at pause, each auto-dismissing after a 5 s countdown unless the user interacts (button label `Skip (5)` -> `Skip` once cancelled).
3. Tags: reusable per-user names (1-50 chars, trimmed, unique per user case-insensitively), picker when starting/resuming, rename/delete in settings, filterable day/week/month stats and an "Untagged" bucket.
4. Pause saves exactly one session; failure queues it offline and retries automatically; nothing the user did while offline is lost.
5. Cross-device: starting/pausing on one device updates the others within ~1 s; opening an app later shows the true running state; resets propagate.
6. Day rollover at local midnight splits a running session into two sessions and keeps the timer running with title/tag carried over.
7. Goals: daily/weekly/monthly targets (0/off allowed), progress bars capped at 100% but percentage text may exceed 100; remaining time; "Daily/Weekly/Monthly goal reached!" notification with the messages in 4b once per period; goal changes on one device propagate live.
8. Stats: today, 7-day (Mon-Sun) bars with goal, last 4 weeks, summary (total, weekly/monthly worked, % of targets, average per day with data, best day, current streak, goal-achievement %), by-tag breakdown for today/week/month, paginated session history by range (today/week/month/year) at 20/page.
9. Timezone-aware days based on the user's timezone setting; auto-update to the device timezone on launch (keep, but make it explicit/consistent).
10. Per-user isolation of local data on shared devices; token refresh ~2 minutes before expiry; session expiry returns to login; self-hostable backend with a health endpoint, Docker compose (bundled or external Mongo), rate limiting, Helmet, CORS.
11. Desktop extras: tray, close-to-tray, launch-at-login; Android: foreground service while the timer runs, battery-optimisation setting; system-aware dark mode on both.
12. Auth: email+password (password >= 6 chars - raise this), name (1-100), timezone captured at registration; JWT access 15 min / refresh 7 days rotating.

### 9.5 Data/constant cheat-sheet
| Constant | Value | Where |
|---|---|---|
| Access/refresh TTL | 15 min / 7 d | apps/api utils/auth.ts |
| Proactive refresh lead / expiry buffer | 120 s / 60 s | api-client tokens.ts |
| Timer UI tick | 100 ms | desktop useTimerControls |
| Day-change check | every 10 s | useTimerControls |
| Offline queue flush | every 30 s + `online` + mount | useSyncManager |
| Auto-skip countdown | 5 s | useAutoSkipCountdown |
| Title / summary / tag name max | 200 / 2000 / 50 chars | validation |
| Name max / password min | 100 / 6 | validation |
| Default goals (UI fallback) | 8 h / 40 h / 160 h | useGoalState |
| Sessions page size | 20 (query param `limit`) | queries useSessions |
| Weekly trend | 4 weeks (`count=4`) | queries useWeeklyTrend |
| Brand colour | #7C3AED | scripts/generate-brand-assets.mjs |
| API default port | 3001 | env/docker |
| Hosted API | https://pulse-be.duckdns.org | eas.json, dist-win.mjs |
| localStorage keys | see 7.3 | api-client |
| Socket room | `user_<userId>` | api socket.ts |

---


---

# Part D. Desktop client (reference UI)

# Pulse Desktop (apps/desktop) - Reference Documentation

Scope: Electron + React + Vite desktop client, version 0.0.5. This is the reference client; the mobile app has identical features. Paths are relative to `apps/desktop` unless prefixed with `packages/`. Line cites are `file:line`. Much of the timer/sync/goal logic lives in shared packages (`packages/queries`, `packages/utils`, `packages/api-client`, `packages/types`); where desktop behaviour depends on them it is documented here because a rewrite must reproduce it.

---

## 0. Product in one paragraph

Pulse is a **daily work-time accumulator** with a play/pause timer. The big clock is NOT a per-session stopwatch: it shows *total worked time today* (`elapsedBeforeCurrentRun` + live segment). Each play->pause pair becomes a **session** (start, end, optional title, optional tag, optional summary) POSTed to the API by the client (the server does not create sessions on timer events). Users can set daily/weekly/monthly hour goals, see stats and charts, filter by user-defined tags, and timer state is synchronized live across the user's devices (desktop + mobile) via Socket.IO plus an HTTP reconcile endpoint. Goal-reached events pop a toast + native notification.

---

## 1. Stack, dependencies, build, env

### 1.1 Runtime/dev stack

| Layer | Choice | Version (package.json) |
|---|---|---|
| Shell | Electron | ^42.5.0 (dev dep) |
| Packager | electron-builder (NSIS, Windows only) | ^26.15.3 |
| UI | React + React DOM | ^19.2.7 (root pnpm override pins 19.2.3) |
| Bundler | Vite + @vitejs/plugin-react | ^8.1.0 / ^6.0.2 |
| Styling | Tailwind CSS v4 via @tailwindcss/vite | ^4.3.1 |
| Component kit | shadcn ("radix-nova" style, base colour "mauve", components.json) but generated primitives import **@base-ui/react** (^1.5.0), not Radix | |
| Variants/utils | class-variance-authority ^0.7.1, clsx ^2.1.1, tailwind-merge ^3.3.1, tw-animate-css ^1.4.0 | |
| Icons | lucide-react ^1.21.0 | |
| Font | @fontsource-variable/inter ^5.2.8 ("Inter Variable") | |
| Charts | recharts ^3.9.0 | |
| Server state | @tanstack/react-query ^5.101.2 | |
| Client state | zustand ^5.0.14 (+ persist middleware) | |
| HTTP | axios ^1.18.1 | |
| Realtime | socket.io-client ^4.8.3 | |
| Language | TypeScript ~6.0.2. App tsconfig: ES2023, bundler resolution, `erasableSyntaxOnly`, `verbatimModuleSyntax`, alias `@/*` -> `src/*`. Electron main compiled separately (CommonJS, ES2022, strict) | |
| Lint | oxlint ^1.69.0 (plugins react/typescript/oxc; only `rules-of-hooks`=error and `only-export-components`=warn) | |
| Dev orchestration | concurrently ^10, wait-on ^9 | |
| Workspace deps | `@repo/api-client`, `@repo/queries`, `@repo/types`, `@repo/utils` (workspace:*) | |
| Unused/odd deps | `radix-ui` ^1.6.0 (never imported), `shadcn` ^4.12.0 (CLI listed as runtime dep), `tsx` ^4.22 (never used) | |

Monorepo: pnpm 10.0.0 + turbo. Root `engines.node >=18` (README says Node 18+, but Vite 8 / Electron 42 realistically need a newer Node). No tests in the desktop app. No `check-types` script (type checking only happens inside `tsc -b` in `build`). Lint log: 0 errors, 1 warning (button.tsx exports `buttonVariants`).

### 1.2 Scripts (package.json:7-15)

| Script | What it does |
|---|---|
| `predev` | Creates `dist-electron/` and writes `dist-electron/package.json` = `{"type":"commonjs"}` (app package is `"type":"module"` but main is compiled to CJS) |
| `dev` | `concurrently` runs `vite` (port 5173), `tsc -p tsconfig.electron.json --watch`, and `wait-on http://localhost:5173 && electron .` |
| `build:electron` | `tsc -p tsconfig.electron.json`, rewrite `dist-electron/package.json`, copy `build/icons` -> `dist-electron/icons` |
| `build` | `tsc -b && vite build && pnpm build:electron` |
| `dist:win` | `node scripts/dist-win.mjs` |
| `lint` | `oxlint` |
| `preview` | `vite preview` |

Root script: `pnpm desktop:build:win` -> `pnpm --filter desktop dist:win`. The desktop README says `pnpm desktop:dist:win`, which does not exist (README.md:55).

### 1.3 Vite config (vite.config.ts)
- `base: "./"` (relative asset URLs, needed for `file://` loading).
- Plugins: react(), tailwindcss(), inline plugin `electron-html` stripping `crossorigin` attributes from built `index.html` (comment: crossorigin breaks module/CSS loading over `file://`).
- `build.modulePreload: false`.
- `resolve.dedupe` react, react-dom, @tanstack/react-query; alias `@` -> `src`, plus hard alias react/react-dom to `apps/desktop/node_modules` (monorepo duplicate-React workaround).
- Dev server is default 5173, hard-coded in `electron/main.ts:119` and the `dev` script.

### 1.4 Packaging (package.json:54-69, scripts/dist-win.mjs)
- electron-builder config exists **twice** (package.json `build` and inline in `dist-win.mjs:78-91`), identical: appId `com.pulse.timetracker`, productName `Pulse`, files `dist/**`, `dist-electron/**`, `build/icons/**`, target `nsis`, icon `build/icons/icon.ico`. Default NSIS options. No code signing, no auto-update (no `electron-updater`, no publish config), no mac/linux targets.
- `dist-win.mjs` flow: `process.env.VITE_API_URL ??= "https://pulse-be.duckdns.org"`; run `pnpm build`; on win32 `taskkill /F /IM Pulse.exe` then wait 1 s; clean `release/.staging`; run electron-builder into staging; move only `*.exe|*.blockmap|*.yml` into `release/` (overwriting); delete staging. Output `release/Pulse Setup <version>.exe`.
- Working dir contains (git-ignored) `dist/`, `dist-electron/`, `release/` (includes `Pulse Setup 0.0.0.exe` and `0.0.5.exe`). `dist-electron/` still holds **stale compiled files from the removed taskbar widget** (`desktop-prefs.js`, `ipc-channels.js`, `preload-widget.js`, `taskbar-position.js`, `timer-format.js`, `widget-layout.js`) because the build never cleans the folder; they ship in the installer (`dist-electron/**`).

### 1.5 Environment variables
| Var | Where read | Default |
|---|---|---|
| `VITE_API_URL` | `src/utils/api.ts:16`, `src/hooks/useSocketSync.ts:23`, `src/components/AuthPages.tsx:10` (three separate copies of the fallback) | `http://localhost:3001` in code; `https://pulse-be.duckdns.org` injected by `dist-win.mjs` when unset |

Env file precedence (`.env.example`): `.env.development.local` > `.env.development` > `.env.local` > `.env`; production builds use `.env.production`. It is a **build-time** constant baked into the bundle (no runtime server picker, no self-host setting UI). In DEV the API URL is logged to the console. This is the only env var.

### 1.6 Static assets
`public/favicon.png|svg`, `public/branding/logo-wordmark.png` (auth screen, `h-24`), `public/branding/logo-mark.png` (sidebar, 24px inside a 40px primary tile), `build/icons/icon.ico|icon.png|favicon.png` (app/tray icon). `src/assets/{hero.png,react.svg,vite.svg}` and `src/App.css` (one comment line) are unused Vite template leftovers.

### 1.7 index.html
Title "Pulse", `lang="en"`, viewport meta, favicon `/favicon.png`; pre-React splash `Loading Pulse...` inline-styled on `#0b0b0b` / `#fafafa` (always dark, regardless of theme; visible until JS boots).

---

## 2. Electron specifics

Files: `electron/main.ts` (190 lines), `electron/preload.ts` (14), `electron/desktop-settings.ts` (50), `src/electron.d.ts` (19), `src/hooks/useDesktopSettings.ts` (44).

### 2.1 Process/security model
- `contextIsolation: true`, `nodeIntegration: false`, preload `dist-electron/preload.js`. Renderer has no Node access. `sandbox` is not set explicitly. No CSP (neither meta tag nor header). No `setWindowOpenHandler`/`will-navigate` guard.
- Production: `app.disableHardwareAcceleration()` (main.ts:14-16) - GPU compositing off in packaged builds (likely a workaround for blank/transparent windows; see `paintWhenInitiallyHidden: true` and two `webContents.invalidate()` calls at main.ts:126-134 forcing repaints).
- The packaged renderer loads from `file://` (`pathToFileURL(dist/index.html)`, main.ts:122-123), so API/socket requests carry `Origin: null`; the API relies on `cors()` and socket `origin: "*"` (apps/api/src/index.ts:27, socket.ts:19-20).

### 2.2 Single instance
`app.requestSingleInstanceLock()`; a second launch quits itself; the first receives `second-instance` -> `showMainWindow()` (restore if minimised, show if hidden, focus).

### 2.3 Main window (main.ts:98-146)
| Property | Value |
|---|---|
| Size | 1000 x 750, **no min/max size**, bounds and maximised state **not persisted** |
| Frame | Standard OS frame. **Default Electron application menu is not removed** (no `Menu.setApplicationMenu(null)` / `autoHideMenuBar`), so packaged Windows builds show File/Edit/View/Window/Help including Reload (Ctrl+R) and Toggle DevTools (Ctrl+Shift+I) |
| Icon | `icon.png` via 4 candidate paths (`resolveIconPath`, main.ts:28-43) |
| show | `show:false`, shown on `ready-to-show` + `focus()` |
| backgroundColor | `#0B0B0B` always (black flash in light theme) |
| Dev | loads `http://localhost:5173`, **always opens DevTools** |
| Close | if `!isQuitting && minimizeToTray` -> `preventDefault()` + `hide()` (process, timer, socket keep running). Otherwise the window closes and `window-all-closed` quits (non-darwin, only when `minimizeToTray` is false) |
| `closed` | `mainWindow = null` |

No custom title bar, no frameless/mini/always-on-top/compact mode, no multi-window. A **taskbar widget** (separate small window with timer, own preload, IPC channels, taskbar-position/layout code) existed and was **removed** in commit `2afad16` - the only precedent for a mini mode. Currently there is no way to see/control the timer without opening the main window.

### 2.4 Tray (main.ts:45-96)
- Created once after the window. Icon `icon.ico` resized to 16x16 (console warning if not found). Tooltip is the fixed string `Pulse` (never shows timer state).
- Context menu: `Show Pulse` -> `showMainWindow`; separator; `Quit` -> `isQuitting=true; app.quit()`.
- `double-click` on tray -> `showMainWindow`. macOS `activate` -> `showMainWindow`.
- No play/pause item, no elapsed time, no badge/overlay, no dynamic icon.

### 2.5 Auto-start
`app.setLoginItemSettings({ openAtLogin, openAsHidden: openAtLogin })` applied at startup (`applyLoginItemSettings`, main.ts:171) and whenever a settings update includes a boolean `openAtLogin` (desktop-settings.ts:35-40). `openAsHidden` is macOS-only/deprecated: on Windows the app **opens its window at login** (no `--hidden` arg handling; `ready-to-show` always shows). Default `openAtLogin=false`.

### 2.6 Desktop settings and persistence
`desktop-settings.json` in `app.getPath("userData")`, pretty-printed JSON, read synchronously on every load (merged over defaults; silently defaults on any error), written synchronously.
```ts
interface DesktopSettings { minimizeToTray: boolean /*default true*/; openAtLogin: boolean /*default false*/ }
```
Per-machine, not per-user, not synced to the account. Only these two settings exist.

### 2.7 IPC / preload API
`contextBridge.exposeInMainWorld("electron", {...})`:
| Renderer call | IPC channel (`ipcMain.handle`) | Behaviour |
|---|---|---|
| `electron.platform` | - | `process.platform` (unused by UI) |
| `electron.isDesktop` | - | `true`; UI uses it to show the "Desktop" settings card |
| `getDesktopSettings()` | `desktop:get-settings` | returns in-memory settings |
| `updateDesktopSettings(partial)` | `desktop:update-settings` | merge, persist, apply login item, return; **no payload validation** |
| `quitApp()` | `app:quit` | `isQuitting=true; app.quit()` - exposed but **never called by the UI** |

No main->renderer events (no tray commands, no timer state in main, no global shortcuts, no power/idle events).

### 2.8 Notifications
Not implemented in Electron main. The renderer uses the web `Notification` API (`src/components/AchievementNotifier.tsx:17-24`): permission requested on mount if `default` (:30-36; no UI to re-request or disable); a notification is fired only when permission is `granted` and a goal-achieved event arrives. No click handler, icon, sound; no `app.setAppUserModelId` (Windows toast attribution relies on the NSIS shortcut AUMID in packaged builds). No notifications for: timer started/stopped on another device, long-running timer, breaks, idle, offline sync failure.

### 2.9 Shortcuts
None. No `globalShortcut`, no in-app hotkeys (no Space to play/pause). Only default Electron menu accelerators exist. Enter/Escape work only in the tag manager inputs.

### 2.10 Platform specifics
Windows only in practice: NSIS target, `taskkill /IM Pulse.exe`, `.ico` tray icon, "Windows" copy in Settings (SettingsPage.tsx:270). darwin branches exist (`activate`, `window-all-closed`) but no mac target/icon/menu/tray template image.

---

## 3. Navigation and screens

### 3.1 App shell and routing (src/App.tsx, layout/AppLayout.tsx)
- **No router.** `currentPage: AppPage` is `useState("dashboard")` in `PulseApp` (App.tsx:51); `AppPage = "dashboard" | "history" | "statistics" | "goals" | "settings"` (packages/types/src/index.ts:139). Not persisted, no deep links, no back/forward; resets to Dashboard every launch. Pages unmount on switch, so page-local state (History range, stats tag filter, breakdown range, scroll) is lost on navigation.
- Boot (App.tsx:122-195): render centered `Loading Pulse...` (`text-sm text-muted-foreground`) until `initSession()` finishes. `initSession`: `hasValidSession()` (requires a refresh token; refreshes the access token if expired or within 60 s of expiry; a refresh failure for network reasons returns false and keeps tokens) -> if valid, read access token, decode `userId` from the JWT, `bootstrapUserSession` (activate user scope, migrate legacy goal keys, rehydrate timer+offline stores, **clear React Query cache**) -> `setToken`, `setSessionReady`, start proactive token-refresh scheduler. Listens to `storage` and custom `pulse-session-changed` window events to re-read the token.
- No token -> `<AuthPages>`. Token -> `<PulseApp>` = `<AppLayout>` + `<AchievementNotifier>`; hooks mounted there: `useSyncManager`, `useSocketSync`, `useTimezoneSync`, `registerGoalStorage`.
- Session expiry (`onSessionExpired`, api.ts:48-52): clears tokens (inside refresh), `activateUserSession(null)`, dispatches `pulse-session-changed` -> auth screen with **no explanation message**. Because a network failure on boot is treated as "no valid session", a user who starts the app offline with an expired access token is shown the login screen even though refresh token is still stored.

### 3.2 Layout (AppLayout.tsx)
Two-pane full-viewport (`h-screen`).

**Sidebar `<aside>`** (:118-195): width `72px` collapsed / `256px` (`w-64`), `transition-all duration-300`; `bg-sidebar` (translucent) + `glass` (backdrop-blur 16px) + right border.
- Brand block: 40x40 `rounded-md` tile `bg-primary` + `glow-purple-sm` containing logo-mark 24px; when expanded, `Pulse` (font-semibold) + `Time Tracker` (xs muted).
- Nav (5 buttons, `title` tooltip = label): Dashboard (LayoutDashboard), History (History), Statistics (BarChart3), Goals (Target), Settings (Settings). Active: `bg-sidebar-accent`, accent text, `glow-purple-sm`, icon `text-primary`. Inactive: `text-sidebar-foreground`, hover `bg-sidebar-accent/50`. Buttons `py-2.5 rounded-xl`, icon 20px; collapsed = icon only, centred. No `aria-current`.
- Footer toggle: `ChevronsRight` (collapsed) / `ChevronsLeft` + `Collapse` (expanded); tooltips `Expand sidebar` / `Collapse sidebar`.
- **Default collapsed** (`useState(true)`, :96); overwritten in an effect from `localStorage["pulse-sidebar-collapsed"]` (:101-106), so users who expanded it see a collapsed->expanded flash on every launch. Stored globally, not per user.

**Header** (:198-232): `min-h-16`, bottom border, `bg-background/80` + glass, `px-6 py-4`.
- Left: Dashboard -> `Welcome back, {name or "there"} 👋` (`text-xl font-bold`) + `Stay focused and keep building.`; other pages -> page title (`Dashboard|History|Statistics|Goals|Settings`).
- Right: `ThemeToggle` (icon-only dropdown) + **avatar button** (36px circle, `bg-primary`, 2 initials, decorative always-green status dot). Avatar menu: `Account` (Settings icon; navigates to Settings) and `Logout` (destructive, LogOut icon). Initials: first letters of first two name words, else first 2 chars of name, else first 2 chars of email local-part, else `U`.
- `userEmail` falls back: `settings.email` -> `localStorage["pulse-user-email"]` -> literal `"user@example.com"` (App.tsx:76-79).

**Main** (`flex-1 overflow-auto bg-background p-6`). Content is full-width (no max width) except Settings (`max-w-2xl`).

### 3.3 Auth screen (components/AuthPages.tsx)
One component, two modes toggled by a link. No forgot-password, email verification, "remember me", show-password toggle, or SSO.
- Layout: full-screen `bg-background`, centred column `max-w-md`, `p-4`; ThemeToggle fixed top-right (`top-4 right-4`).
- Header: wordmark logo `h-24` centred; muted tagline. Login: `Welcome back. Let's track your productivity.` Register: `Create an account to start tracking your time.`
- Error line (`text-sm text-destructive text-center`) above the form.
- Fields (shadcn Label + Input; all `required` with native browser validation):
  - Register only: `Name` (placeholder `Your name`).
  - `Email` (type email, placeholder `you@example.com`).
  - `Password` (type password, placeholder `••••••••`); **no client min length/strength rule**.
  - Register only: `Confirm Password`.
- Submit: full-width `lg` button `Sign In` / `Create Account`; while loading it is disabled but **the label does not change** (no spinner). No autofocus; no autocomplete attributes.
- Toggle: `Don't have an account? Sign up` / `Already have an account? Sign in` (primary underline-on-hover link). Toggling clears the error but keeps typed values.
- Client validation order: `Passwords do not match.` then `Name is required.` (whitespace-only name).
- API (raw axios, not the interceptor client): `POST {baseURL}/auth/login {email,password}` or `/auth/register {email,password,name,timezone: Intl resolved TZ}` -> `{accessToken, refreshToken, user}`. Tokens go to localStorage (`pulse-access-token`, `pulse-refresh-token`), email to `pulse-user-email`. `onAuthSuccess` (App.tsx:172-182): `bootstrapUserSession(user.id)`, set token, start refresh scheduler, dispatch `pulse-session-changed`.
- Errors: shows `response.data.error` if it is a string, else `An unexpected error occurred. Please check your connection.` (offline, 5xx, rate limit all look identical).
- Auth is online-only; tokens are stored in plain localStorage (no OS keychain / safeStorage).

### 3.4 Dashboard (components/pages/DashboardPage.tsx) - home and timer screen
Vertical stack (`space-y-6`, full width):

1. **Timer hero card** (:382-436): `Card` `p-8 md:p-12`, `glow-purple`, `border-primary/20`, two decorative concentric ellipses (300x200 and 400x280 px, 1px primary borders at 10%/5%).
   - Optional `sessionTitle` (`text-lg font-semibold`) and active tag name (`text-sm font-medium text-primary`) above the clock (from the timer store).
   - **Clock** `HH:MM:SS` (`text-6xl md:text-7xl font-black tracking-tight`, Inter; not tabular-nums so digits jitter in width), shows *today's total*, refreshed every 100 ms while running.
   - When running: green pulsing dot (`bg-accent-green animate-pulse`) + `Currently Working`.
   - Single centred button (lg, `min-w-[140px]`): `Play` (Play icon) when stopped, `Pause` (Pause icon) when running. **No Stop/Reset/Discard control** exists; the reset code path (`resetTimerSync`, socket `timer_reset`) is not wired to any UI.
2. **Stats filter row** (:438-448): shown only if >=1 tag exists. Label `Filter stats` + chip row (`All` + one chip per tag). Chip = pill `rounded-full px-2 py-0.5 text-[11px]`; selected `bg-primary text-primary-foreground`, else `bg-muted/70 text-muted-foreground hover:bg-muted`. Single select; auto-resets if the tag is deleted. Applies to Today/Week/Month cards only.
3. **Stat card grid** (`StatCardGrid`, :450-504). Custom "balanced rows" layout: ResizeObserver measures width; min card width 200px, gap 16px; cardsPerRow = floor((w+16)/216); the 6 cards are split into evenly balanced rows (e.g. 3+3, 2+2+2, 1 per row) rather than CSS grid. Cards:
   - **Today** (Calendar icon, purple tint): worked time (`formatMinutes`: `45m`, `1h`, `1h 5m`); if daily goal on: `{pct}%` at right, progress bar (h-1.5, clamped 100), text `{remaining} remaining · Goal {goal}` or `Goal reached · Goal {goal}`. Tag filter label under the title when filtered. **Value is the server's `/stats/today`, not the live clock** - it does not tick while running and only refreshes on invalidate (pause, socket events).
   - **This Week** (FolderOpen, amber): `summary.weeklyWorkedMinutes` + weekly goal progress.
   - **This Month** (CalendarDays, blue): `summary.monthlyWorkedMinutes` + monthly goal progress.
   - **Sessions Today** (Activity, green): count; subtitle `Click to view all` + arrow; the whole `Card` is clickable (a `div` with `onClick`: not keyboard accessible) -> Sessions dialog.
   - **Best Day** (Star, blue): lifetime best day formatted; subtitle date `D Month YYYY` (en-GB, e.g. `5 March 2026`).
   - **Current Streak** (Flame, red): `{n} days` (always plural: `1 days`); subtitle `Keep it up!` when n>0.
   - Card style: `p-5`, `glow-purple-subtle`, `border-primary/10`; 36px rounded icon tile with 15% tint (`stat-icon-*`); label sm muted; value `text-2xl font-bold`. Best Day and Streak always use the *unfiltered* summary query.
   - Goal progress logic (`getPeriodProgress`): enabled iff toggle on and goal>0; pct = round(worked/goal*100) (may exceed 100; bar clamps); remaining = max(0, goal-worked).
4. **Time by tag card** (:506-548): title `Time by tag`; range buttons `Today` / `This week` / `This month` (selected = default variant, others outline; local state, default Today). Body: rows `tagName ... duration` (the API includes an untagged bucket) or `No tagged time in this period yet.` No chart, no percentages, no bars; independent of the stats filter; no loading/error state.
5. **Dialogs** (via `AppDialog`, section 3.9):
   - `Sessions Today` (max-w-2xl, scrollable, footer `Close`): list of rows or `No sessions logged today yet.`. Row: bordered box; optional bold title; optional tag name (xs, primary); clock icon + `h:mm:ss AM - h:mm:ss PM` (device timezone); `Duration: 1h 2m 3s`; optional one-line summary (click toggles expand).
   - `Start session` and `Session Summary`: see section 4.

Dashboard data: `/stats/today(?tagId)`, `/stats/summary(?tagId)` and unfiltered `/stats/summary`, `/sessions/today`, `/tags`, `/stats/by-tag?range=`. **None of these have loading or error UI** (zeros/empty shown while loading; failures silent).

### 3.5 History (components/pages/HistoryPage.tsx)
- Range buttons (sm): `Today` (default), `Week`, `Month`, `Year`; selected = default variant, others outline. Far right: disabled `Pick Date` (Calendar icon) - **non-functional placeholder** (HistoryPage.tsx:62 when counting from the file start).
- Table in a Card with horizontal scroll; header `bg-muted/50`; 7 columns: `Date` (`Today` / `Yesterday` / `Mon D`), `Title` (`—` if none), `Tag` (`—`), `Start Time`, `End Time` (`h:mm:ss AM`, device timezone), `Duration` (`1h 2m 3s` / `4m 5s` / `6s`, medium weight), `Summary` (`max-w-xs`, one-line clamp, click to expand; `—` if none). Row hover `bg-muted/30`. No sorting, search, per-row actions (**no edit/delete/add manual session**), no day grouping, no totals row.
- States: `Loading sessions...`; `Failed to load sessions. Please try again.` (destructive, no retry); `No sessions found for this period.`
- Pagination: `useInfiniteQuery` `GET /sessions?range&page&limit=20`; centred outline `Load More` button (`Loading...` while fetching) when `hasNextPage`. Response normaliser accepts either a bare array or `{sessions,total,page,limit,hasMore}`.
- Range is local state (resets when leaving the page).

### 3.6 Statistics (components/pages/StatisticsPage.tsx)
- 6 stat tiles, grid 1/2/3 cols (base/md/lg), card `p-6`, label sm muted, value `text-3xl font-semibold`: `Total Hours`, `Weekly Hours`, `Monthly Hours`, `Average/Day`, `Best Day` (duration only, no date), `Goal Achievement` (`{n}%`). Durations formatted `Xh Ym`.
- `Daily Work Hours`: Recharts BarChart, `ResponsiveContainer` height 300; data `GET /stats/week` mapped to `{day (day label or date), hours = minutes/60 rounded 2dp}`; X category axis, Y numeric axis (no unit, no tick formatter), dashed grid at 35% opacity, bars `var(--primary)` with 8px top radius, hover opacity .85, tooltip card-styled `{n.toFixed(1)} hrs` (series name "Hours"), no cursor highlight, no goal reference line.
- `Weekly Trend`: same chart, data `GET /stats/weeks?count=4` (hard-coded last 4 weeks) -> `{week, hours}`.
- No loading/empty/error states (empty arrays render an empty plot), no range selector, no tag filter, no legend, no calendar/heatmap, no per-tag chart.

### 3.7 Goals (components/pages/GoalsPage.tsx)
- **Daily card** (`p-8`): Base UI Checkbox + label `Set Daily Goal` (`text-lg font-semibold`, label clickable). Enabled: huge number (`text-6xl font-light text-primary`) between round outline `-`/`+` icon buttons (48px); caption `hours per day`. Step 1 h, min 1, no max, **no typed input**. Disabled: centred `No daily goal set. Enable to start tracking.`
- Three cards (`md:grid-cols-3`):
  - **Weekly Goal**: checkbox `Weekly Goal`; enabled: `-`/`+` (40px) around number (`text-3xl`), step **10 h**, min 10; caption `hours per week`; progress bar (h-2, clamp 100) with `{worked} worked` left and `{pct}%` right (pct computed client-side from hours). Disabled: `No weekly goal set. Enable to start tracking.`
  - **Monthly Goal**: same, step 10, `hours per month`.
  - **Achievement**: `{goalAchievementPercent}%` (text-2xl light primary) + static `on track`, progress bar, static copy `Great progress! Keep it up.` regardless of value.
- Persistence: every click immediately `PATCH /settings/{daily|weekly|monthly}-target {xTargetMinutes}` (hours*60; disabling sends **0**, which is how "off" is represented server-side). **No debounce** (a request per click). Re-enabling restores the last hours from per-user local storage (`pulse-last-goal-hours`, `pulse-last-weekly-goal-hours`, `pulse-last-monthly-goal-hours`; defaults 8/40/160) because the server only stores 0 while off. On success the server response is merged into the settings cache and mirrored to local storage; stats queries invalidated.
- Goal UI state lives in `PulseApp` (App.tsx:52-65, `useGoalState` = 6 `useState`s) hydrated from `GET /settings` (`target>0` -> enabled; hours = `Math.round(minutes/60)` so a 90-minute target is shown as 2 h). Until settings load all goals appear disabled.
- Socket `goal_updated` merges targets into the settings cache and invalidates stats.
- No per-weekday goals, no goal history, no "rest day" concept.

### 3.8 Settings (components/pages/SettingsPage.tsx)
Single column `max-w-2xl`, stacked cards (`p-6`):
1. **Desktop** (only when `window.electron.isDesktop` and settings loaded): two toggles built as plain native `<input type="checkbox" class="accent-primary">` (inconsistent with the Base UI checkbox on Goals):
   - `Minimize to system tray on close` - `Keep Pulse running in the background when you close the window so timer sync stays active.`
   - `Launch at login` - `Start Pulse automatically when you sign in to Windows.`
2. **Appearance**: label `Theme`, the icon-only ThemeToggle dropdown (Light/Dark/System; trigger shows only the current mode icon), help `Choose how Pulse looks on your device`.
3. **Tags**: title `Tags`, help `Add, rename, or delete tags used when starting a session. Deleting a tag untags past sessions that used it.` Manager:
   - Add row: Input placeholder `New tag name` (maxLength 50, Enter submits) + outline `Add` (disabled when empty/pending).
   - Error line (destructive): API `error` string or `Could not save that tag. Try a different name.`
   - Empty: `No tags yet.`. List (`divide-y`, bordered, rounded): row = name + ghost `Rename` + ghost destructive `Delete`. Rename mode: inline Input (Enter save, Esc cancel, maxLength 50) + `Save` / `Cancel`.
   - Delete confirm dialog `Delete tag` (max-w-md): `"{name}" will be removed. Sessions using this tag will become untagged.` + `Cancel` / `Delete`(destructive).
   - Tags sorted alphabetically client-side (`localeCompare`); duplicate rules enforced server-side. No colour, ordering, archive, or usage counts. Empty-name add/save is silently ignored.
4. **Account**: read-only grey boxes for name (if present) and email (`—` while loading). No editing of name/email/password, no delete account, no timezone display.
5. **About**: `Version 0.0.5` (**hard-coded**, SettingsPage.tsx:322).
6. **Danger Zone** (`border-destructive/30`, heading in destructive colour): `Logout` destructive button with icon (logout is not dangerous; no real destructive operations exist).

Logout flow (`handleLogout`, App.tsx:68-74): stop token refresh scheduler, `deactivateUserSession` (user scope = null, query cache cleared), clear tokens+email, reset goal achievement dedupe, switch to auth screen. **No server logout/revoke call**; socket torn down by effect cleanup; per-user persisted timer/offline stores stay in localStorage under `pulse:{userId}:*` (unsent pending sessions remain until that user signs in again).

### 3.9 Shared dialog (components/ui/app-dialog.tsx)
Custom modal (not Base UI Dialog): `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4`; centred `Card` `w-full max-h-[min(85vh,720px)]`; header with `text-2xl font-bold` title and ghost `✕` (literal character, `aria-label="Close dialog"`); body `px-6 py-4` (`overflow-y-auto` when `scrollable`); footer right-aligned with top border. **No** Escape key, overlay-click close, focus trap, focus restore, initial focus, `role="dialog"`/`aria-modal`/`aria-labelledby`, body scroll lock, portal, or enter/exit animation. Closing via `✕` calls `onClose`, which for Start/Summary dialogs means "skip" (see section 4).

### 3.10 Toasts (AchievementNotifier.tsx)
Fixed bottom-right (`bottom-4 right-4 z-50`, `max-w-sm`), stacked, `aria-live="polite"`. Each toast: card with a 36px primary circular Trophy icon, bold label, muted message, X dismiss (`aria-label="Dismiss notification"`); animation `animate-in slide-in-from-bottom-4 fade-in duration-300`; auto-dismiss 6000 ms (`window.setTimeout`, never cleared). Copy (packages/utils/src/index.ts:170-194):
| Type | Title | Message |
|---|---|---|
| daily | `Daily goal reached!` | `You've logged {formatMinutes} today. Great work!` |
| weekly | `Weekly goal reached!` | `You've logged {..} this week. Keep it up!` |
| monthly | `Monthly goal reached!` | `You've logged {..} this month. Amazing progress!` |

This is the **only** toast mechanism: mutation errors, offline notices, save confirmations, sync status have no feedback surface.

---

## 4. Timer UX in detail

### 4.1 Mental model and data
```ts
TimerState {                       // packages/types/src/index.ts:117
  isRunning: boolean;
  startedAt?: number;              // epoch ms of the CURRENT running segment (client clock)
  elapsedBeforeCurrentRun: number; // ms worked TODAY before the current segment
  lastActiveDate?: string;         // Date.toDateString() of device-local day, used for rollover
  sessionTitle?: string;           // title for the session being recorded
  tagId?: string;
}
// + in-memory only: remoteUpdatedAt (ms of the last authoritative remote stamp)
```
- Displayed clock = `getTodayTimerDisplayMs(state)` (packages/utils/src/timer-day.ts:244-265): if `lastActiveDate` is a past day -> 0 (or time since midnight if still running); else `elapsedBeforeCurrentRun + (now - startedAt)` when running. Formatted `HH:MM:SS` with 2-digit zero padding (hours can exceed 24 only in theory).
- There is exactly **one timer per user** (shared across devices). No multiple/parallel timers, no countdown/Pomodoro mode, no breaks, no stopwatch-per-task mode, no manual time entry. "Modes" = Stopped (paused) and Running only.
- `deviceId` sent with sessions/events is the **constant string `"desktop"`** (useTimerControls.ts:23, useSocketSync.ts:17) - all desktop installs of a user are indistinguishable (mobile uses its own).

### 4.2 Controls and flows

**Play** (DashboardPage.tsx:347-351, 337-345):
1. Click `Play` -> opens the `Start session` dialog (the timer is **not started yet**). The pre-selected tag is the timer store's current `tagId` (the tag of the previous session), the title input is empty.
2. Dialog content (max-w-md): hint `Optional title for this session.` + Input placeholder `What are you working on?` (no autofocus); hint `Select a tag (optional).` + chip row (`None` + tags) or, if the user has no tags, `No tags yet. Create them in Settings.`
3. Footer buttons: `Skip (5)` (outline; counts 5,4,3,2,1 then fires) and primary `Resume`.
   - `Resume` -> `handlePlay(title, selectedTagId)`.
   - `Skip` / `✕` / countdown reaching 0 -> `handlePlay(undefined, selectedTagId)` (start with no title, with the highlighted tag).
   - Focusing the Input, typing, or clicking any tag chip **cancels the countdown** (label becomes `Skip`, no more auto start). The dialog then stays open until the user clicks.
4. `handlePlay` -> if a title was typed, writes it to the store; calls `startTimer(title, tagId)`: updates the store (`startedAt = Date.now()`, sets `lastActiveDate`, resets `elapsedBeforeCurrentRun` to 0 if the last active date is not today, **keeps the previous title if none typed** (useTimerStore.ts:46), sets `tagId` to the chosen one or clears it (:47)) and emits socket `timer_start {startedAt, elapsedBeforeCurrentRun, sessionTitle, tagId, deviceId}`.
5. `startTimer` is a no-op if already running.
Note the label `Resume` is shown even for the very first play of a day; the user's only way to start without delay is click `Resume` or `Skip`.

**Pause** (:365-368, 353-363):
1. Click `Pause` -> `beginPause()` runs **immediately**: stashes `{startTimeIso: startedAt, title, tagId}` in a ref, stores elapsed, stops the clock and emits `timer_pause {elapsedBeforeCurrentRun: displayedTotalMs, sessionTitle, tagId, deviceId}`; then opens `Session Summary`.
2. Dialog (max-w-md, not scrollable): `Add an optional summary before pausing.` + 4-row textarea (placeholder `What did you accomplish?`, native styled textarea, not the Input component). Footer: `Skip (5)` and primary `Pause`.
3. `Pause` -> `completePause(summary)`; `Skip`/`✕`/countdown 0 -> `completePause()` without summary. Typing/focusing the textarea cancels the countdown. Both paths **save the session** - there is no way to cancel/undo the pause or discard the segment; the primary button is labelled `Pause` although the timer has already paused.
4. `completePause` builds the payload `{startTime: segment start ISO, endTime: new Date().toISOString() (**time the dialog was dismissed, not the time of pausing**), deviceId:"desktop", title?, tagId?, summary?(trimmed)}` and `POST /sessions`. Success -> invalidate stats; failure (any error) -> `useOfflineStore.addPendingSession(payload)` (retry later, see 4.6). Result: saved session duration can be longer than the time deducted on the clock by however long the summary dialog was open.
5. After pause the store retains `sessionTitle`/`tagId`, so the title and tag keep showing above the stopped clock and will be reused (title) on the next play if the user skips the dialog.

**Reset/stop**: not exposed. The store has `resetTimer` and socket event `timer_reset` is handled when received (zeros the timer, clears title/tag) but nothing in desktop UI emits it (`resetTimerSync` is dead code). No way to correct a mistaken session.

**Auto-skip countdown** (`useAutoSkipCountdown`, packages/queries/src/use-auto-skip-countdown.ts): `seconds=5` default; starts the instant `isOpen` becomes true; 1 Hz interval; label `Skip ({n})` until cancelled, then `Skip`; fires `onAutoSkip` exactly once (ref guard); resets when closed. One instance per dialog. The dialog gives no other visual countdown (no progress ring), and the countdown is silent to screen readers.

### 4.3 Tag picker
Reusable `TagChipRow` + `TagBadge` (DashboardPage.tsx:211-272): flat wrapped list of pill chips, first chip `All` (stats filter) or `None` (start dialog). Used in two places: stats filter on Dashboard (state `statsTagId`) and tag select in the Start dialog (`selectedTagId`). Both auto-clear when the tag disappears (:323-330). No search, no multi-select, no create-from-picker (user must go to Settings > Tags), no recent/favourites, no colours. Tag can only be chosen at start (cannot change it while running or after the fact).

### 4.4 Goal progress and achievement notifier
- Dashboard cards compute progress client-side from server minutes + local goal hours (section 3.4/3.7). Goal values come from `settings.*TargetMinutes`.
- **Achievement events are server-emitted** over socket `goal_achieved {type, workedMinutes, targetMinutes, periodKey}` when `POST /sessions` crosses a goal (apps/api/src/routes/session.ts:113-116, broadcast to all of the user's devices). Therefore a toast only appears **after a pause + summary dialog**, not live at the moment the target is crossed while the clock is running.
- Client `emitGoalAchievement` de-duplicates per `type:periodKey` in an in-memory Set (cleared on logout); an app restart clears the Set. `AchievementNotifier` subscribes, fires a native `Notification(title, {body})` if permission granted, and shows a 6 s toast (3.10). Multiple devices each show their own toast + OS notification.

### 4.5 Cross-device sync behaviour (what the user experiences)
- Play/pause on one device updates the clock on the others within a socket round trip (events `timer_started`/`timer_paused` are "live" and always win over local `isRunning`).
- The pausing device alone records the session; others just invalidate their stats queries (`timer_paused`, `session_created`).
- On every (re)connect and whenever the window becomes visible, the app reconciles with `GET /users/me/active-timer` and then broadcasts `timer_status_request`; peers answer with `timer_status_response`, which is ignored if it lacks a server `updatedAt` while a local authoritative stamp exists (useSocketSync.ts:153-171).
- Details in section 5.5.

### 4.6 Offline behaviour
| Situation | Behaviour |
|---|---|
| App launched offline with valid (unexpired) access token | App opens, timer works from persisted local state; API calls fail silently; sockets keep retrying |
| Launched offline with expired access token | Boot refresh fails (network) -> treated as no session -> **login screen** (tokens retained; cannot use the app until online) |
| Play/pause offline | Local store updates immediately and persists; socket events are emitted when the socket (re)connects (see weakness W-SOCK-1: earlier queued events can be lost) |
| Pause offline | `POST /sessions` fails -> session appended to the persisted offline queue (`pulse-offline-storage`) with a local id |
| Back online | `useSyncManager` flushes the queue on mount, on window `online`, and every 30 s: sequential `POST /sessions` oldest first. Network error/5xx -> stop and retry later; **400 -> session silently discarded**; other 4xx (401/403/404/409/422) -> left in the queue and retried forever (loop continues to next item) |
| UI feedback | None. No offline banner, no pending-count badge (the hook returns `pendingCount` but nothing renders it), no "sync failed" message, stats are simply stale |
| Idempotency | None. `localId` is not sent, so a request that succeeded server-side but timed out can be duplicated on retry |

### 4.7 App close, quit, crash, day change
- **Close window (X)** with `minimizeToTray` (default): window hides, process/timer/socket continue; tray `Show Pulse`/double-click restores. The renderer is merely hidden, so the 100 ms interval keeps running (Chromium throttles hidden timers but the clock is computed from `Date.now()`, so display is always correct).
- **Quit from tray / close with minimizeToTray off**: renderer destroyed; zustand persist has already written the running state (`isRunning:true, startedAt`) to localStorage on every change. **No session is saved and no `timer_pause` is emitted on quit** - the server's active-timer stays "running".
- **Relaunch** (`rehydrateUserPersistedStores`, store/rehydrateUserStores.ts:23-48): if persisted `isRunning && startedAt` and `lastActiveDate` is today (or unset), the local state is converted to **paused**, adding `now - startedAt` to `elapsedBeforeCurrentRun` (i.e., time while the app was closed counts as worked). Then, when the socket connects, `reconcileActiveTimer` fetches the server's active timer; because `remoteUpdatedAt` is not persisted, the protection check is skipped and a still-"running" server state **flips the local timer back to running** with the server's `startedAt`. Net effect when online: crash/quit is transparent and the timer keeps running as if nothing happened (a brief paused flash with inflated elapsed is possible). When offline at relaunch, the converted paused state stands and **that segment never becomes a session** (clock shows the time, History/stats never will).
- If persisted `lastActiveDate` is a previous day and the timer was running, rehydrate leaves it running and `runDayChange` handles it (below), so a timer left running overnight/across a closed app is credited as a continuous session until the user pauses.
- **Crash/close during the Session Summary dialog**: the pending-pause payload lives only in a ref (useTimerControls.ts:38,155), so the session is **lost** (timer already paused; no server-side session creation).
- **Day change** (`runDayChange`, useTimerControls.ts:71-101; `rolloverTimerForNewDay`, packages/queries/src/timer-sync.ts:411-458): polled every 10 s **only while the Dashboard page is mounted**. If `lastActiveDate` != today: if running, saves a session from `startedAt` to 23:59:59.999 of the previous day (title/tag carried, no summary; goes to offline queue on failure), then continues running with `startedAt` = start of today, `elapsed=0`, same title/tag, and re-emits `timer_start`; if stopped, resets elapsed to 0 keeping title/tag. A timer running for >1 midnight crossing only credits the last previous day (intermediate days lost).
- **Server seed** (`seedTodayElapsedFromStats`, :103-112 via packages/queries/src/timer-sync.ts:382-409): whenever `/stats/today` changes, if the server's worked minutes (x60000 ms) exceed the local displayed total, `elapsedBeforeCurrentRun` is raised to match (so a fresh install/other device's sessions show on the clock). Only runs while Dashboard is mounted; minute granularity can make the clock jump forward up to ~59 s after saving.
- **Timezone**: `useTimezoneSync` (hooks/useTimezoneSync.ts) - when `settings.timezone` differs from the device IANA zone it `PATCH /settings/timezone` once per app run (invalidates all stats/session queries). Session clocks and "Today/Yesterday" in the UI are formatted in the **device** timezone; "today" boundaries for the timer use device-local midnight via `toDateString()`, while server stats use the stored timezone setting.

---

## 5. State management

### 5.1 Inventory

| State | Where | Persisted? | Scope |
|---|---|---|---|
| Auth tokens | localStorage `pulse-access-token`, `pulse-refresh-token`, `pulse-user-email` (`TOKEN_KEYS`; `createLocalStorageAdapter`) | yes, plaintext | global (one account at a time) |
| Timer | zustand `useTimerStore` | yes, `pulse:{userId}:pulse-timer-storage` | per user |
| Offline session queue | zustand `useOfflineStore` | yes, `pulse:{userId}:pulse-offline-storage` | per user |
| Goal "last hours" cache | localStorage via `userScopedAppStorage` keys `pulse:{userId}:pulse-last-goal-hours` / `-weekly-` / `-monthly-` | yes | per user |
| Goal enabled/hours (UI) | 6 `useState` in `PulseApp` via `useGoalState` | no (derived from `/settings`) | session |
| Server data | TanStack Query cache | no (in-memory; **cleared** on user bootstrap and logout) | session |
| Theme | localStorage `theme` = `light|dark|system` | yes | global |
| Sidebar collapsed | localStorage `pulse-sidebar-collapsed` = `"true"/"false"` | yes | global |
| Desktop settings | `userData/desktop-settings.json` (main process) | yes | per machine |
| Current page | `useState` in `PulseApp` | no | session |
| Socket + singletons | module variables in `useSocketSync.ts` (`socket`, `queryClientRef`, `tokenRefreshHandler`); `activeUserId` (api-client); achievement `listeners`/`seenKeys` (queries); `registeredGoalStorage` | no | process |
| Local UI state | dashboard: `showSessions`, `showTitleModal`, `showSummaryModal`, `titleInput`, `selectedTagId`, `statsTagId`, `breakdownRange`, `summaryInput`; history `range`, expanded rows; tag manager `newName`, `editingId`, `editingName`, `pendingDelete`, `error`; auth form fields | no | component |

### 5.2 Timer store (store/useTimerStore.ts)
- Actions: `startTimer(title?, tagId?)`, `pauseTimer()`, `resetTimer()`, `syncTimerState(state)` (merge via `mergeTimerStates`; unused by UI), `applyRemoteTimerState(state, remoteUpdatedAt?, source="reconcile"|"live")` (via `applyIncomingTimerState`).
- `partialize` persists only the 6 TimerState fields (not `remoteUpdatedAt`). Custom `merge` shallow-overlays persisted over current.
- Local actions stamp `remoteUpdatedAt = Date.now()` (client clock) so later reconcile snapshots with an older server stamp are ignored.
- `applyIncomingTimerState` rules (packages/utils/src/timer-sync.ts:13-96):
  - **live** (socket `timer_started/paused`): always applied; running -> take remote `startedAt` and elapsed; `lastActiveDate=today`; no clock comparison (comment: server time often differs from device time).
  - **reconcile**: dropped if remote stamp < local stamp; if `isRunning` differs -> take remote running flag (elapsed from remote, or keep local when remote is a stale other-day snapshot); same-day -> take remote; local today vs remote other day -> keep local; else adopt remote flags but keep local elapsed.
- `reconcileActiveTimer` (packages/queries/src/active-timer.ts:301-361) adds: ignore a remote *running* state that is older than a local *stopped* state; when both stopped, elapsed = `max(local, remote)` for the same day, local if remote is another day, remote if local is another day, else 0.
- Rehydrate converts running -> paused if same day (4.7).

### 5.3 Offline store (store/useOfflineStore.ts)
`pendingSessions: {localId, startTime, endTime, deviceId, title?, summary?, tagId?}[]`; actions `addPendingSession` (returns `localId` = `Date.now()+random base36`), `removePendingSession`, `clearPendingSessions` (unused). Persisted whole.

### 5.4 Scoped storage and rehydration
- `activateUserSession(userId)` sets a module-level `activeUserId` in `@repo/api-client`. `createUserScopedPersistStorage` namespaces keys `pulse:{userId}:{name}`; when no user is active `getItem` returns null and `setItem` is a no-op (so persisted writes while logged out go nowhere).
- **Legacy fallback**: on a scoped miss it reads the **unscoped** legacy key and copies it into the scoped one (user-storage.ts:272-276). The legacy key is never deleted, so *any* user who logs in on the machine without scoped data inherits the legacy timer/queue.
- `migrateLegacyGoalStorage(backend, userId)` does the same for the 3 goal keys at bootstrap.
- Zustand `persist` hydrates asynchronously at module load (no user yet -> empty), so the app **manually rehydrates** (`rehydrateUserPersistedStores`) after `activateUserSession`: reads both keys, merges onto defaults (`parsePersistedJsonState` swallows malformed JSON), applies the running->paused conversion, `setState`s. Order in `bootstrapUserSession`: activate user -> migrate goal keys -> rehydrate stores -> **clear query cache**.
- On logout the in-memory timer/offline stores are not reset (only `activeUserId` is nulled); a following login overwrites them from storage, but non-default leftovers like `sessionTitle`/`tagId` (not part of `DEFAULT_TIMER_STATE`) survive in memory across users.

### 5.5 Socket sync (hooks/useSocketSync.ts)
Connection: `io(baseURL, {auth:{token}, autoConnect:true, reconnection:true, transports:["websocket","polling"]})`; created on mount of `PulseApp` and recreated on every access-token refresh (`onTokenRefreshed -> reconnectTimerSocket`); torn down on unmount.

| Direction | Event | Payload | Client behaviour |
|---|---|---|---|
| out | `timer_start` | `{startedAt, elapsedBeforeCurrentRun, sessionTitle, tagId, deviceId}` | on Play, and after day rollover if running |
| out | `timer_pause` | `{elapsedBeforeCurrentRun, sessionTitle, tagId, deviceId}` | on Pause (elapsed = displayed total ms) |
| out | `timer_reset` | `{deviceId}` | never triggered by UI |
| out | `timer_status_request` | - | after connect+reconcile and on window visible |
| out | `timer_status_response` | `{requesterId, isRunning, startedAt, elapsedBeforeCurrentRun, sessionTitle, tagId}` | reply to a peer's request with local state |
| in | `timer_started` / `timer_paused` | state + `updatedAt` | `applyRemoteTimerState(..., "live")`; pause also invalidates stats queries |
| in | `timer_reset` | - | `resetTimer()` |
| in | `timer_status_request` | `{requesterId}` | answer with own state |
| in | `timer_status_response` | state (+ `updatedAt` if from server) | applied as "reconcile" unless it has no `updatedAt` while local has a stamp |
| in | `goal_updated` | 3 target minutes | merge into settings cache, mirror to local storage, refetch settings, invalidate stats |
| in | `goal_achieved` | `GoalAchievementEvent` | `emitGoalAchievement` -> toast/notification |
| in | `session_created` | session | invalidate todayStats, statsSummary, weekStats, weeklyTrend, todaySessions, statsByTag (but **not** the `["sessions"]` history list) |
| lifecycle | `connect` | | refetch settings, `reconcileActiveTimer` over HTTP, then `timer_status_request` |
| lifecycle | `connect_error` | | `refreshTokens()`; on success set `auth.token` and `connect()` again (no backoff/limit) |
| lifecycle | `disconnect` | | log only |

`emitTimerEvent`: if connected, emit; else **recreate the socket** (`connectSocket()` tears the old one down incl. its listeners) and `once("connect")` emit - see weakness W-SOCK-1. `document.visibilitychange -> visible` triggers HTTP reconcile + status request. HTTP `GET /users/me/active-timer` is the durable source of truth; there is no polling.

### 5.6 Auth/token handling
- `createApiClient`: axios instance with request interceptor adding `Authorization: Bearer`; response interceptor on 401 (once per request, not for `/auth/refresh`) calls `refreshTokens` (shared in-flight promise via WeakMap) and replays; on 400/401 refresh failure clears tokens and calls `onSessionExpired`.
- Proactive scheduler (`startTokenRefreshScheduler`): timer at `expiry - 2 min`; `ensureValidAccessToken` considers a token expired 60 s before `exp`. JWT is decoded client-side (`userId`, `exp`).
- `onTokenRefreshed` -> refetch settings + reconnect socket + dispatch `pulse-session-changed`.

### 5.7 Sync manager (hooks/useSyncManager.ts)
Described in 4.6. Implementation notes: subscribes to the whole offline store (`useOfflineStore()` without selector), callback depends on `pendingSessions`, so the 30 s interval and `online` listener are torn down/recreated on each queue change; `isSyncing` ref prevents overlap; logs to console (`console.log`) per session.

### 5.8 Timezone sync
See 4.7. Runs from `PulseApp` via `useTimezoneSync`; uses a ref so it patches at most once per distinct device timezone per run; `useUpdateTimezone` invalidates settings + 7 stats/session keys.

### 5.9 Theme (hooks/useTheme.ts)
`Theme = "light"|"dark"|"system"`; stored under localStorage `theme` (absent = system). `applyTheme` toggles classes `dark`/`light` on `<html>`; `system` follows `prefers-color-scheme` and listens for changes. Each `useTheme()` call keeps its own `useState` (header, Settings, auth screen each hold separate copies) and reads storage in an effect; `ThemeToggle` renders `null` until mounted. CSS variables are defined for `:root` (light), `.dark`, and a `@media (prefers-color-scheme: dark) { :root:not(.light) }` fallback.

### 5.10 React Query setup
`QueryClient` defaults: `refetchOnWindowFocus:false`, `retry:1`; default `staleTime 0`. `ApiProvider` supplies the axios client. Query keys (packages/queries/src/query-keys.ts): `todayStats`, `statsSummary`, `weekStats`, `weeklyTrend`, `todaySessions`, `["sessions", range]`, `settings`, `tags`, `statsByTag(+range)`; tag-filtered variants append `tagId`. Settings query: `staleTime 0`, `refetchOnMount:"always"`. Mutations manually patch caches (`setQueryData` for tags/goals) and invalidate related keys.

### 5.11 HTTP endpoints used by the desktop client
`POST /auth/login|register|refresh`; `GET /settings`; `PATCH /settings/daily-target|weekly-target|monthly-target|timezone`; `GET /stats/today[?tagId]`, `/stats/summary[?tagId]`, `/stats/week`, `/stats/weeks?count=4`, `/stats/by-tag?range=today|week|month`; `GET /sessions/today`, `GET /sessions?range=today|week|month|year&page&limit=20`, `POST /sessions`; `GET|POST /tags`, `PATCH|DELETE /tags/:id`; `GET /users/me/active-timer`. (Shapes: packages/types/src/index.ts - `WorkSession`, `TodayStats`, `StatsSummary{totalWorkedMinutes, weeklyWorkedMinutes, monthlyWorkedMinutes, weeklyTargetMinutes, monthlyTargetMinutes, weeklyPercentage, monthlyPercentage, averageDailyMinutes, bestDayMinutes, bestDayDate, currentStreakDays, goalAchievementPercent}`, `TagStatsBreakdown`, etc.)

### 5.12 Magic constants a rewrite must carry over
Auto-skip 5 s; toast 6 s; timer tick 100 ms; day-change poll 10 s; offline sync poll 30 s; token expiry buffer 60 s, proactive refresh 2 min before expiry; history page size 20; tag name max 50; goal steps 1 h daily / 10 h weekly & monthly, min 1 / 10 / 10; goal defaults 8 / 40 / 160 h; weekly trend count 4; sidebar 72/256 px; window 1000x750; `deviceId = "desktop"`.

---

## 6. Design system as it exists

### 6.1 Foundations
- Theme tokens are CSS variables in `src/index.css` mapped into Tailwind v4 via `@theme inline`. Light = `:root`, dark = `.dark` (also duplicated in a `prefers-color-scheme` media block, so the dark palette is written **three times**; one source of drift).
- Aesthetic: deep charcoal / violet accent, "glass" translucent sidebar & header (backdrop blur 16 px), soft purple glows (box-shadow) on cards and active nav, rounded cards (radius ~8 px), generous padding.

### 6.2 Colour tokens (OKLCH)
| Token | Light | Dark |
|---|---|---|
| background | `0.985 0.002 285` | `0.12 0.005 285` |
| foreground | `0.141 0.005 285` | `0.985 0 0` |
| card / popover | `1 0 0` | `0.21 0.006 285` |
| primary (violet) / ring / chart-1 / accent-purple | `0.541 0.281 293` | same |
| primary-foreground | `1 0 0` | `1 0 0` |
| secondary / muted | `0.96 0.01 285` | `0.25 0.008 285` |
| muted-foreground | `0.52 0.02 261` | `0.707 0.022 261` |
| accent | `0.96 0.02 293` | `0.25 0.02 293` |
| accent-foreground | `0.541 0.281 293` | `0.985 0 0` |
| destructive | `0.577 0.245 27.325` | `0.637 0.237 25` |
| border | `0.91 0.01 285` | `1 0 0 / 8%` |
| input | `0.91 0.01 285` | `1 0 0 / 12%` |
| sidebar | `0.98 0.005 285 / 85%` | `0.15 0.006 285 / 75%` |
| sidebar-foreground | `0.45 0.02 285` | `0.707 0.022 261` |
| sidebar-accent | `0.96 0.02 293` | `0.541 0.281 293 / 15%` |
| sidebar-accent-foreground | `0.541 0.281 293` | `0.985 0 0` |
| sidebar-border | `0.91 0.01 285` | `1 0 0 / 6%` |
| accent-green | `0.696 0.17 162` (both) | |
| accent-blue | `0.623 0.214 259` | |
| accent-amber | `0.769 0.188 70` | |
| accent-red | `0.637 0.237 25` | |
| chart-1..5 | purple, green, amber, blue, red (same as accents) | |
Stat icon tiles (`.stat-icon-*`): 15% alpha tint of the accent with the accent as icon colour (purple/green/blue/amber/red) - hard-coded oklch values duplicated from tokens. Charts use only `--primary`, `--border`, `--muted-foreground`, `--card`, `--foreground`.
Pre-JS splash and Electron `backgroundColor` use `#0B0B0B` / `#0b0b0b`.

### 6.3 Typography
Single family **Inter Variable** (`--font-sans`, `--font-heading`, `--font-display` all identical); mono stack defined but unused. Scale in use: clock `text-6xl/7xl font-black tracking-tight`; goal number `text-6xl font-light`; stat values `text-3xl font-semibold` / `text-2xl font-bold`; page title `text-xl font-bold`; dialog title `text-2xl font-bold`; card titles `text-lg font-semibold` / `font-semibold`; body `text-sm`; captions `text-xs`; chips `text-[11px]`; buttons `text-sm font-medium` (sm: `0.8rem`). No tabular-nums on the clock (only on goal percent and tag durations).

### 6.4 Spacing, radius, elevation
Page padding `p-6`; vertical rhythm `space-y-6`; card internal padding by class (`p-5` stat, `p-6` standard, `p-8` timer/daily goal, `md:p-12` hero) over a Card default `--card-spacing: 1rem`; grid gaps 16/24 px. Radius base `--radius: 0.5rem` with derived sm/md/lg/xl (x0.6/0.8/1/1.4); cards `rounded-lg`, nav `rounded-xl`, buttons `rounded-md`, chips `rounded-full`. Elevation: 1 px hairline borders (`border-border/60`), glows `.glow-purple` (80px/40px 12%/8% violet), `.glow-purple-sm` (24px 20%), `.glow-purple-subtle` (32px/16px 7%/5%), `shadow-lg` on toasts, `shadow-md` + ring on menus; `.glass` = blur(16px).

### 6.5 Component library (src/components/ui + feature components)
| Component | Source | Notes |
|---|---|---|
| Button | Base UI Button + cva | variants `default, outline, secondary, ghost, destructive (10% tinted, not solid), link`; sizes `default h-8, xs h-6, sm h-7, lg h-11, icon size-8, icon-xs, icon-sm, icon-lg`; focus ring `ring-3 ring-ring/50`; press `translate-y-px`; disabled opacity .5 |
| Card (+Header/Title/Description/Action/Content/Footer) | custom div | only `Card` is used |
| Input | Base UI Input | h-8, `bg-transparent dark:bg-input/30`, text-base -> md:text-sm |
| Label | native label | flex, text-sm medium |
| Checkbox | Base UI Checkbox | 16 px (overridden to 20 px on Goals) |
| Progress | Base UI Progress | track `h-1` default (overridden to `h-1.5`/`h-2`), indicator `bg-primary transition-all` |
| DropdownMenu (+Item with `destructive` variant, Sub, Checkbox/Radio items, Shortcut, Separator, Label) | Base UI Menu | used in ThemeToggle and avatar menu; open/close via `animate-in/out`, `zoom-in-95` |
| Select | Base UI Select | **unused** |
| AppDialog | custom | see 3.9 (no a11y semantics) |
| ThemeToggle | custom | ghost icon button inside DropdownMenuTrigger |
| StatCard / PeriodProgressCard / SessionRow / TagBadge / TagChipRow / ExpandableSummary | local to DashboardPage (ExpandableSummary duplicated in HistoryPage) | not shared |
| StatCardGrid | custom | JS-balanced rows |
| AchievementNotifier | custom toast | only toast |
There is no Tooltip, Tabs, Toggle/Switch, Textarea, Badge, Skeleton, Toast/Sonner, Dialog primitive, Table component (raw `<table>`), or Empty-state component.

### 6.6 Icons
lucide-react (stroke icons, 16-20 px): LayoutDashboard, History, BarChart3, Target, Settings, LogOut, ChevronsLeft/Right, Moon, Sun, Laptop, Trophy, X, Clock, Play, Pause, Calendar, CalendarDays, Activity, FolderOpen (used for "This Week"), Star, Flame, ArrowRight, Minus, Plus, Check (checkbox), Chevron* (menu/select). Dialog close is the text glyph `✕`; header greeting uses the emoji 👋.

### 6.7 Motion
tw-animate-css utilities (`animate-in`, `fade-in`, `slide-in-from-bottom-4`, `zoom-in-95`, `slide-in-from-top-2`) for toasts and menus; `animate-pulse` on the running dot; `transition-all duration-300` on sidebar width; `transition-colors` on hovers; progress `transition-all`; button press nudge. Dialogs and page changes have no transition. No `prefers-reduced-motion` handling.

### 6.8 Charts
Recharts BarChart only: primary-violet bars with 8 px top radius, dashed 35% grid, 12 px muted ticks, card-coloured tooltip with 8 px radius, 300 px height.

### 6.9 Layout/responsiveness
Desktop-first. Breakpoints used: `md` (Goals 3-col, timer padding, stats grid 2-col), `lg` (stats 3-col). Sidebar collapses only manually (not responsive to width). Window has no minimum size so layouts can break below ~600 px. Dashboard cards use the JS `StatCardGrid`; Statistics/Goals use CSS grid.

---

## 7. UX/UI weaknesses, bugs and tech debt

Severity: **H** = data loss / wrong data / broken core flow, **M** = noticeable UX or reliability problem, **L** = polish/debt.

### 7.1 Timer and data integrity
| ID | Sev | Issue | Where |
|---|---|---|---|
| W-TIM-1 | H | Pausing is a **two-phase, in-memory operation**: the clock stops and `timer_pause` is broadcast immediately, but the session is only POSTed after the summary dialog closes, and the payload sits in a `useRef`. Quitting/crashing/reloading (Ctrl+R is available from the default menu) with the dialog open **loses the session**. | useTimerControls.ts:38, 151-177; DashboardPage.tsx:365-368 |
| W-TIM-2 | H | Sessions are created by the **client** with `endTime = now at dialog dismissal`, so session duration != clock deduction (extra seconds/minutes while the dialog is open); stats (server, sums sessions) and the clock diverge, and `seedTodayElapsedFromStats` later pulls the clock up to the server number (visible jump). | useTimerControls.ts:164-177 |
| W-TIM-3 | H | Quit/crash while running does not save or pause anything. Offline relaunch converts the running segment into elapsed time with **no session record**; the clock then permanently exceeds History/stats. | store/rehydrateUserStores.ts:35-44 |
| W-TIM-4 | M | Time while the app was closed or the machine slept/hibernated is credited as work (no idle/sleep/lock detection, no "were you away?" prompt, no max-duration guard). A timer left running over multiple midnights only credits the final previous day. | rehydrateUserStores.ts; packages/queries/src/timer-sync.ts:411-458 |
| W-TIM-5 | M | Day rollover, server-seeding and the 10 s day-change poll live in `useTimerControls`, which is **mounted only on the Dashboard**. On other pages (or hidden window) midnight is not processed until the user returns to the Dashboard. | useTimerControls.ts:95-112, DashboardPage.tsx:296 |
| W-TIM-6 | M | Play requires a modal and starts only on `Resume`/`Skip`/5 s expiry; the start time is therefore delayed up to 5 s after the click and an inattentive user starts a timer with a stale title. "Resume" is the wrong verb for a first start. | DashboardPage.tsx:347-351, 370-373, 588 |
| W-TIM-7 | M | Title is carried over from the previous session when none is typed, tag is not (unless pre-selected) - inconsistent; title stays displayed above a stopped clock; no way to edit title/tag while running or after saving. | useTimerStore.ts:46-47; DashboardPage.tsx:337-351 |
| W-TIM-8 | M | The pause dialog's `✕`, `Skip`, and timeout all save; the primary `Pause` is mislabelled (timer already paused); there is **no Cancel/Undo/Discard**. No Reset/Stop button exists although store and socket support it (`resetTimerSync` dead code). A mistaken Play/Pause cannot be fixed (no edit/delete session in History either). | DashboardPage.tsx:359-363, 628-657; useSocketSync.ts:275 |
| W-TIM-9 | M | Clock is derived from each client's `Date.now()` and a client-written `startedAt`; device clock skew shows different elapsed on different devices; server `updatedAt` is used only for ordering. | useSocketSync.ts:240-250; packages/utils/src/timer-day.ts |
| W-TIM-10 | M | Goal/achievement toasts fire only after pause+summary because the server emits on `POST /sessions`; the "Today" card does not tick live (server value) while the big clock does, so the two numbers disagree while running. | DashboardPage.tsx:290, 306; apps/api/src/routes/session.ts:113-116 |
| W-TIM-11 | L | `seedTodayElapsedFromStats` uses minute-granularity server totals, so the clock can jump forward up to ~59 s. Local `toDateString()` day keys vs server user-timezone day keys can disagree after travel/DST. | packages/queries/src/timer-sync.ts:382-409 |
| W-TIM-12 | L | Clock is re-rendered at 10 Hz via `setState` inside the Dashboard-level hook, re-rendering all cards/lists ~10x/s (display only needs 1 Hz aligned to second boundaries). | useTimerControls.ts:127-139 |
| W-TIM-13 | L | All desktop installs share `deviceId="desktop"`. | useTimerControls.ts:23 |

### 7.2 Sync, offline, auth
| ID | Sev | Issue | Where |
|---|---|---|---|
| W-SOCK-1 | H | `emitTimerEvent` while disconnected calls `connectSocket()`, which tears down the previous socket (and its `once("connect")` emitters) and builds a new one for each event, so e.g. an offline Play followed by Pause loses the Play emit; only the latest event reaches the server. | useSocketSync.ts:30-36, 206-234 |
| W-SOCK-2 | M | `connect_error` -> refresh tokens -> reconnect with no backoff or retry cap; a non-auth connect error with a working refresh token loops and rotates refresh tokens. The socket is also rebuilt after every token refresh (disconnect/reconnect/resync churn). | useSocketSync.ts:196-203; utils/api.ts:42-47 |
| W-SYNC-1 | H | Offline queue: HTTP 400 responses are **silently deleted**; other 4xx are retried forever; there is no idempotency key (duplicates on lost responses); no UI shows pending items or failures; error typed `any`. | useSyncManager.ts:29-55 |
| W-SYNC-2 | M | Queue subscription depends on the whole array, re-creating the 30 s interval and `online` listener on each change; `console.log` noise. `session_created` does not invalidate the History list (`["sessions"]`), so History can be stale until revisit/refetch. | useSyncManager.ts:61-75; useSocketSync.ts:183-190 |
| W-AUTH-1 | M | Network failure on boot is treated as "no session": offline users with an expired access token are dropped to the login screen (tokens kept, but unusable). Session expiry shows no message. | App.tsx:129-143; packages/api-client/src/tokens.ts:104-119 |
| W-AUTH-2 | M | Tokens stored in plaintext localStorage (no `safeStorage`/keychain); logout does not revoke the refresh token server-side; unscoped legacy storage fallback copies the old timer/queue into **any** newly logged-in user and is never deleted. | api-client/src/index.ts:465-479; user-storage.ts:272-276 |
| W-AUTH-3 | L | No password rules, no forgot/reset password, no email verification flow, no account/password change or account deletion in UI. Submit button does not show loading text. | AuthPages.tsx:25-73, 153-160; SettingsPage.tsx:304-318 |
| W-CFG-1 | L | API base URL fallback duplicated in 3 files; baked at build time (cannot point a shipped build at a self-hosted server without rebuilding). | utils/api.ts:16; useSocketSync.ts:22-24; AuthPages.tsx:10 |

### 7.3 Information architecture and flows
- **No global timer presence**: the timer exists only on the Dashboard. Navigating to History/Stats/Goals/Settings hides the clock, there is no mini bar, no tray text, no window-title time, no taskbar overlay (the removed widget was the only mitigation).
- Primary action hidden behind a modal; summary prompt blocks the flow right when the user wants to stop working.
- Tag management is detached from use (Settings only, no create-in-picker); tags cannot be changed after a session starts.
- Goals page and Dashboard goal cards are separate mental models; goals are whole-hour-only; hours changed one click at a time (weekly/monthly step 10 h, no typing) with a server write per click; goal "on/off" is encoded as target=0 and "last hours" lives only in local storage (cross-device re-enable may use a different default).
- Statistics has no tag filter, no range switcher, no goal line, no comparison; History has a disabled `Pick Date` placeholder, no edit/delete, no grouping; the Dashboard duplicates part of Statistics (Best Day on both) and has its own tag breakdown that cannot be reached elsewhere.
- Settings mixes preferences, destructive "Danger Zone" (only Logout), version, and account in one scroll; the avatar menu `Account` item just opens Settings; Logout exists in two places (avatar menu and Settings Danger Zone).
- Greeting `Welcome back, there 👋` when name missing (AppLayout.tsx:97, 203); fake email `user@example.com` fallback (App.tsx:79).
- Misleading/static copy: Achievement card always says `on track` and `Great progress! Keep it up.` (GoalsPage.tsx:335-340); `1 days` (DashboardPage.tsx:496); `This Week` uses a folder icon (:456); Statistics `Best Day` shows no date while Dashboard does.
- Mixed locales/formats hard-coded: dates `en-GB` long form on Dashboard (:171), `en-US` 12-hour with seconds elsewhere (packages/utils: `formatSessionClock`), history `Mon D`; no 24-hour or week-start preference; all strings inline English (no i18n).

### 7.4 Missing states and feedback
- Loading/error/empty states missing on: all Dashboard queries, Statistics (blank charts), Goals, Time-by-tag, Settings tags list (no loading). Only History has loading/error/empty rows (no retry).
- No global error boundary (a render exception white-screens the app); no network/offline/sync indicator; mutations (goals, tags except tag errors, timezone) fail silently; no success confirmation; the only toast type is goal achievement.
- No skeletons/spinners; Goals toggles show off state until settings arrive (wrong content flash); the auth submit shows no progress.

### 7.5 Accessibility
- `AppDialog`: no `role="dialog"`/`aria-modal`/labelled title, no focus trap or initial focus, no Esc, no overlay click, no focus return, no scroll lock (AppDialog.tsx:27-63). The auto-skip countdown can silently start/stop the timer while focus is outside the dialog, with no live-region announcement.
- Clickable `Card` for "Sessions Today" is a `div` with `onClick` (not focusable, no role) (DashboardPage.tsx:140-147).
- `ThemeToggle` nests a `<Button>` inside `DropdownMenuTrigger` (a button) => invalid nested interactive elements and a trigger without accessible name (icon only, no `aria-label`) (ThemeToggle.tsx:18-24); avatar button has no `aria-label`; sidebar nav lacks `aria-current`, collapsed state relies on `title`.
- Tag chips convey selected state only by colour (no `aria-pressed`/radio semantics) and are 11 px text (DashboardPage.tsx:221-232). Progress bars have no accessible labels beyond Base UI defaults. Form errors are not `role="alert"`/linked via `aria-describedby`; `Label` for `Theme` has no control.
- Contrast: primary violet (L 0.54) used as text on dark cards for small `text-xs/11px` copy (filter label, tag names, goal %) is likely below WCAG AA 4.5:1; muted-foreground on tinted `muted` backgrounds is borderline.
- No keyboard shortcuts at all; focus ring is subtle (`ring-3 ring-ring/50`); no `prefers-reduced-motion`; clock updates are not exposed to AT (reasonable) but there is no running/stopped status text for AT other than `Currently Working`.
- Tooltips only via native `title`.

### 7.6 Visual/design consistency
- Two checkbox styles (Base UI vs native `accent-primary` in `SettingToggle`, SettingsPage.tsx:51-57); textarea hand-styled instead of a component; raw `<table>`; duplicated `ExpandableSummary` (Dashboard + History); stat tiles on Statistics vs Dashboard use different card paddings and no shared StatCard.
- Default control height 32 px (`h-8`) is small for the main app actions; the `lg` primary button is the only 44 px control. Destructive button variant is a 10% tint, so `Delete`/`Logout` look like secondary buttons.
- Glow shadows everywhere (every card has a purple glow) dilute hierarchy; glassmorphism blur on a large header + sidebar is expensive with hardware acceleration disabled (see 7.7).
- Clock lacks `tabular-nums` so digits shift width; hero decorative ellipses are non-functional ornaments.
- Goal number steppers (daily 48 px vs weekly 40 px) feel inconsistent; weekly/monthly `-` clamps silently at 10.
- Dark palette defined three times (`.dark`, media block, utilities `.stat-icon-*` re-hardcode oklch).
- Theme flash: theme applied in a React effect after first paint; `ThemeToggle` returns `null` until mounted; Electron window `backgroundColor #0B0B0B` and splash are always dark (light users get a black flash); sidebar state also applies after mount (collapsed->expanded flash) (useTheme.ts:27-32; AppLayout.tsx:96-106).
- Three independent `useTheme()` instances (header, Settings Appearance, auth) are not synchronised; on Settings both toggles are visible and the second one's icon goes stale after changing the first.

### 7.7 Performance
- 10 Hz state updates re-render the entire Dashboard (W-TIM-12).
- Hardware acceleration disabled in production (main.ts:14-16) means backdrop-filter blur, large box-shadow glows and the pulse animation are CPU-painted - likely source of jank; `invalidate()` hacks in main.ts:126-134 hint at paint issues.
- Each stats-affecting event invalidates 6-8 query families; filtered stats multiply cached keys; Dashboard issues 6 separate requests on mount (no aggregated "dashboard" endpoint).
- `settings` query `staleTime 0` + `refetchOnMount: "always"` + refetch on every socket connect/token refresh; `useStatsSummary()` called twice on Dashboard (filtered + lifetime).
- Production bundle is shipped in full inside an ~100+ MB Chromium installer; no code splitting (Recharts is bundled into the first load although Statistics is rarely opened) - only `modulePreload` is disabled.

### 7.8 Electron / packaging
- Default application menu with Reload and DevTools in production; DevTools auto-open in dev.
- No window min size, no bounds persistence, no frameless/mini mode, no tray timer/controls, no global shortcut, no idle detection, no auto-update, no code signing (SmartScreen warnings), no mac/linux builds.
- "Launch at login" opens the full window on Windows (`openAsHidden` is macOS-only).
- Notifications via web `Notification` from the renderer: no click-to-focus, permission requested silently on mount, no AUMID set explicitly.
- `quitApp` IPC and `platform` exposed but unused; `desktop:update-settings` accepts any payload shape (no validation) and writes sync to disk.
- Stale widget artefacts (`dist-electron/*widget*`, `desktop-prefs.js`, `ipc-channels.js`, `timer-format.js`, `taskbar-position.js`) packaged into the installer; builder config duplicated in package.json and `dist-win.mjs`; `taskkill /F /IM Pulse.exe` in the build script kills user's running app (acceptable for dev, risky otherwise).
- No CSP, no `will-navigate`/`setWindowOpenHandler` guards, `file://` origin forces permissive CORS on the API (socket origin `*`).

### 7.9 Code structure / tech debt
- Circular imports: `App.tsx` and others import `queryClient` from `main.tsx` which imports `App` (App.tsx:19, main.tsx:6-9); `utils/api.ts` imports from `hooks/useSocketSync.ts` which imports `api` from `utils/api.ts`.
- Module-level singletons (socket, achievement listeners, active user id, registered goal storage) make testing/hot reload fragile; `registerGoalStorage` is mutated from a `useEffect`.
- Prop-drilling of 12 goal props App -> AppLayout -> pages (AppLayout.tsx:26-44; App.tsx:84-102) while the same data is a React Query result; goal state is duplicated into `useState` (6 setters) and re-synced from the query in an effect.
- Business logic scattered across three layers: desktop hooks, `@repo/queries`, `@repo/utils`; the same invalidation list is copy-pasted three times (useTimerControls.ts:41-49; useSocketSync.ts:128-133, 184-189); `usePulseQueries.ts` is a one-line re-export shim.
- 660-line `DashboardPage` mixes 4 dialogs, 6 sub-components and timer orchestration; no unit tests for the desktop app (only `packages/utils/src/timer-sync.test.ts` exists).
- Dead/unused: `components/ui/select.tsx`, most `Card*` parts, `src/assets/*`, `App.css`, `clearPendingSessions`, `syncTimerState`, `resetTimerSync`, `UseSocketSyncReturn`, `pendingCount`, `quitApp`, `electron.platform`, deps `radix-ui`, `shadcn`, `tsx`; redundant condition `item.id === "settings" && currentPage === "settings"` (AppLayout.tsx:148-150).
- README inaccuracies: wrong script name (`desktop:dist:win`), lists "Statistics with charts" etc. but not tags/sync; Node 18 claim; hard-coded version string in Settings drifts from `package.json`.
- Quality gates: lint rules limited to 2; no `check-types`/test scripts in the desktop app; `any` in sync manager.

---

## 8. Rewrite recommendations

### 8.1 Product behaviours worth keeping (the spec)
1. One shared timer per user, play/pause, with live cross-device sync and a durable server snapshot for reconcile.
2. Sessions = start/end + optional title, tag, summary. Daily totals, week/month rollups, streaks, best day, average per day.
3. Daily/weekly/monthly hour goals with progress, remaining, "goal reached" celebration (toast + OS notification + all devices).
4. User-defined tags (max 50 chars, unique), with stats per tag (today/week/month) and a filter on the summary cards.
5. Dark/light/system themes, minimize-to-tray, launch-at-login, offline tolerance with queued sessions.

### 8.2 Re-architecture of the timer (biggest win)
- **Server-authoritative timer + command model.** The server owns `{status, startedAt (server time), accumulatedMs, title, tagId, version}`. Clients send **commands** (`start`, `pause`, `stop`, `edit`) with an idempotency key and a `clientTime`; server replies with the full snapshot + `serverTime` so clients correct for clock skew and render `now - startedAt` locally. Drop `elapsedBeforeCurrentRun`/`lastActiveDate`/client rollover logic: **Today = sum(sessions in user's timezone) + live segment**, computed server-side (and mirrored client-side for display).
- **The server creates the session when the timer stops**, so a crash, quit, or offline pause cannot lose data; the "summary/notes" become a *post-hoc edit* of the just-created session. This removes the two-phase pause, `pendingPauseRef`, client POST, `endTime` drift, and the duplicate offline-queue/idempotency problem. For offline: queue *commands* (with timestamps) in durable storage (SQLite/IndexedDB), replay in order, show pending count, resolve conflicts by server version.
- Idle/sleep/lock handling: Electron `powerMonitor` (or Tauri equivalent) to prompt "You were away for 23 min - keep, discard, or split?". Max-duration guard (e.g. auto-pause after 12 h with confirmation).
- Add `Stop & discard`, `Edit running title/tag`, manual session add, edit/delete session, split/merge. Keep a visible "undo" for 10 s after stopping.
- Optional modes users will expect: Pomodoro/break reminders and a goal-based "focus session". Keep disabled by default.
- Put the timer state machine (and its property tests) in a pure shared package consumed by desktop and mobile, with a deterministic fake clock.

### 8.3 Platform: Electron vs alternatives
- **Recommended: Tauri 2** for a rewrite where the UI is rebuilt anyway. Rationale: installer ~5-15 MB vs ~100+ MB; lower idle RAM (the app idles in the tray all day); first-class plugins for tray with dynamic title/menu, global shortcuts, autostart (with `--hidden` arg), notifications with click handlers, deep links, single instance, updater with signature verification, OS keychain (`keyring`/stronghold) for tokens, SQLite for the offline queue. A Rust core can own the timer clock, idle detection and tray text, so the timer keeps accurate state even if the webview is suspended. Tauri 2 also targets iOS/Android, allowing a single UI codebase for mobile+desktop if the team wants to retire the separate mobile app.
  - Caveats: WebView2/WKWebView/WebKitGTK differences (test blur/backdrop-filter, fonts), smaller ecosystem, Rust learning curve for native bits.
- **Stay on Electron** only if the team wants zero native-language work: then fix the basics (remove default menu, show GPU acceleration back on and fix the blank-window cause instead of disabling it, `safeStorage` for tokens, `electron-updater`, code signing, tray timer text, global shortcuts, `powerMonitor`, hidden-start argument, window bounds persistence, CSP and navigation guards).
- **Flutter/React Native desktop or a PWA** are weaker fits: tray/background/auto-start/notification needs are exactly what Electron/Tauri solve; a PWA cannot run reliably in the background or tray.
- Keep the web stack choice open: React + TanStack Query is fine; consider TanStack Router (typed, hash history in file:// contexts) for deep links; keep Tailwind v4 but build a real token layer (see 8.5).

### 8.4 Information architecture and screen design
Replace five equally weighted sidebar pages with a timer-first shell:
1. **Persistent timer bar** (in the app chrome, visible on every page): task input + tag chip + play/pause + elapsed + today total/goal ring. Also mirrored in the tray tooltip/menu and an optional **always-on-top mini window** (revives the removed taskbar widget) with Space/hotkey to toggle.
2. **Today (home)**: a single column with (a) timer hero with *inline* title + tag entry (start on click; no modal, no countdown), (b) goal ring(s) with remaining time and projected finish, (c) today's **timeline** of sessions (editable inline, add note, change tag, delete, "add missed time"), (d) compact stat chips (week, month, streak, best day).
3. **Log** (replace History): sessions **grouped by day with day totals**, range + date picker (working `Pick Date`), tag/text filters, inline edit/delete, bulk select, CSV export, infinite scroll with virtualisation.
4. **Insights** (merge Statistics + tag breakdown + goals progress): one range selector (week/month/year/custom) + global tag filter; daily bars with goal line, calendar heatmap, weekly trend (variable count), tag donut/bars with percentages, comparison vs previous period, streak history. Loading skeletons and empty states with CTAs.
5. **Goals** become a popover/drawer launched from the goal ring and from Insights, with typed numeric input + presets, per-weekday targets and rest days; keep a `Settings > Goals` entry. Show hours *and* minutes precision.
6. **Settings**: General (theme, 12/24 h, week start, language, timezone shown and changeable), Desktop (tray, launch at login + start minimised, global shortcut, idle behaviour, notifications), Tags (inline create from the picker + management with colours, merge, archive, usage counts), Account (name/email/password, devices/sessions list with sign out all, delete account, data export), About (version from build info, update status, logs).
7. Command palette (Ctrl/Cmd+K) and keyboard shortcuts (Space = play/pause when focus is not in an input; N = new entry; T = tag; G then D/L/I navigation).
8. Auth: add forgot/reset password, password rules + show/hide, inline field errors, loading state, "session expired - please sign in again" banner, optional offline-start with cached token.

### 8.5 Design system
- Define **semantic tokens** once (light/dark generated from a single source): surface 0-3, border, text primary/secondary/disabled, accent, success/warn/danger, focus ring; remove triplicated dark definitions; ship an inline `<script>` in `index.html` (and Electron `backgroundColor` per theme) to set the theme before first paint to avoid flash.
- Type scale with tabular numerals for all time displays (a mono/tabular clock); two weights; consistent line heights. Spacing on a 4 px grid with documented density (comfortable/compact).
- Component set to own explicitly: Button (solid destructive variant), IconButton, Input/Textarea/NumberStepper, Select/Combobox (tag picker with search + create), Switch, Checkbox, Tabs/SegmentedControl (range filters), Dialog/Drawer/Popover with real a11y (focus trap, Esc, labelled), Toast with actions (Undo, Add note), Tooltip, Badge/TagChip (with colour), ProgressRing/Bar, Table/List with virtualisation, EmptyState, Skeleton, Banner (offline/sync/error).
- Reduce chrome: drop per-card purple glows and heavy blur (or keep a single focal glow on the active timer); keep hierarchy through size/weight/space. Honour `prefers-reduced-motion`; add a real app logo mark and icon system consistent in weight; replace emoji/`✕` glyphs with icons.
- Accessibility baseline: WCAG 2.2 AA contrast (darken/lighten the violet for text use), visible focus, semantic landmarks, `aria-live` for timer state changes and sync status, keyboard operable everything (stat cards, chips, menus), screen-reader friendly dialog flows.
- Responsive: define min window size (~480x640), collapsible sidebar by width, compact mode for the mini window.

### 8.6 Engineering practices for the rebuild
- Strict module boundaries: `core` (timer state machine, date/time helpers, formatting; pure, tested), `data` (API client, socket adapter, offline command queue), `ui` (design system), `features/*` (timer, log, insights, goals, tags, settings). No module-level singletons; inject clock, storage, socket.
- One typed API contract (OpenAPI/zod shared with the server); a single `invalidate` map keyed by event type; consider one `GET /dashboard` aggregate and a `GET /insights?range&tagId` to cut request fan-out; push-based invalidation over the socket for all devices including History.
- Unified error model + global error boundary + toast/banner channel; telemetry for sync failures; structured logs file accessible from About.
- Persistence: OS keychain for tokens; SQLite/IndexedDB for offline commands and cached data; versioned migrations for local storage (no legacy fallbacks that leak across users); per-user scoping by directory not key prefixes.
- Release: CI build per platform, code signing + auto-update channel, env/config selectable at runtime (server URL in Settings > Advanced for self-hosting) instead of build-time only.
- Tests: unit tests for the timer machine (midnight, DST, offline replay, out-of-order events), contract tests for the API, Playwright e2e against the real shell for play/pause/tray/offline flows, visual regression for light/dark.

### 8.7 Suggested rewrite priorities
1. Server-authoritative timer + server-created sessions + command queue (fixes W-TIM-1/2/3/4, W-SOCK-1, W-SYNC-1).
2. Always-visible timer (app bar + tray text + optional mini window) and non-blocking start/stop UX with post-hoc notes/undo.
3. Design-system rebuild with accessible primitives and theme-before-paint.
4. Log editing (edit/delete/add) and a merged Insights page with tag filter and goal lines.
5. Desktop shell hardening: Tauri 2 (or hardened Electron), keychain, updater, signing, global shortcut, idle detection, hidden launch.
