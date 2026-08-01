# Pulse API

Node.js backend for Pulse — authentication, work sessions, statistics, settings, and real-time sync via Socket.IO.

## Prerequisites

- Node.js 18+
- pnpm 10
- MongoDB 6+

## Setup

```sh
# From the monorepo root
pnpm install
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/pulse
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-in-production
NODE_ENV=development
```

## Development

```sh
pnpm --filter api dev
```

The server starts on `http://localhost:3001`. Health check: `GET /health`.

## Production build

```sh
pnpm --filter api build
pnpm --filter api start
```

## API endpoints

### Authentication

| Method | Path             | Description          |
| ------ | ---------------- | -------------------- |
| POST   | `/auth/register` | Create account       |
| POST   | `/auth/login`    | Log in               |
| POST   | `/auth/refresh`  | Refresh access token |
| POST   | `/auth/logout`   | Revoke refresh token |

### Sessions

| Method | Path              | Description                     |
| ------ | ----------------- | ------------------------------- |
| POST   | `/sessions`       | Create a completed work session |
| GET    | `/sessions`       | List sessions (with date range) |
| GET    | `/sessions/today` | Today's sessions                |

### Statistics

| Method | Path             | Description                              |
| ------ | ---------------- | ---------------------------------------- |
| GET    | `/stats/today`   | Today's worked minutes and goal progress |
| GET    | `/stats/week`    | Last 7 days                              |
| GET    | `/stats/month`   | Last 30 days                             |
| GET    | `/stats/history` | Historical data for charts               |
| GET    | `/stats/summary` | Aggregated summary (streaks, averages)   |

### Settings

| Method | Path                       | Description                            |
| ------ | -------------------------- | -------------------------------------- |
| GET    | `/settings`                | Current user profile and goal settings |
| PATCH  | `/settings/daily-target`   | Update daily goal                      |
| PATCH  | `/settings/weekly-target`  | Update weekly goal                     |
| PATCH  | `/settings/monthly-target` | Update monthly goal                    |
| PATCH  | `/settings/timezone`       | Update timezone                        |

### Users

| Method | Path                     | Description                 |
| ------ | ------------------------ | --------------------------- |
| GET    | `/users/me/active-timer` | Active timer state for sync |

### Health

| Method | Path      | Description         |
| ------ | --------- | ------------------- |
| GET    | `/health` | Server health check |

## WebSocket events

Socket.IO broadcasts small sync events between devices:

- `session_started` — Timer started on another device
- `session_paused` — Timer paused on another device
- `goal_updated` — Goal settings changed
- `goal_achieved` — Daily/weekly/monthly goal reached

## Database

Collections: `users`, `worksessions`, `dailystats`, `refreshtokens`.

Drop all data (development only):

```sh
pnpm --filter api db:drop
```

## Docker

See the root [Self-hosting guide](../../docs/SELF_HOSTING.md) for Docker Compose setup.

## Security

- JWT access + refresh tokens
- bcrypt password hashing
- Helmet security headers
- Rate limiting (general + stricter on auth routes)
- Trust proxy enabled for reverse-proxy deployments
