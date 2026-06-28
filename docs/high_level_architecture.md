For this app, I would keep the architecture very simple. You're building a personal productivity tracker, not Toggl. Optimize for reliability, offline support, and low database usage.

## Tech Stack

### Monorepo

```
apps/
  desktop/      # Electron + React
  mobile/       # React Native (Expo if possible)
  api/          # Node.js + Express/NestJS

packages/
  ui/           # Shared UI components
  types/        # Shared TS types
  utils/        # Shared utilities
  validation/   # Zod schemas
```

Use **Turborepo**.

---

## Backend

- Node.js
- Express (enough for this project)
- MongoDB
- JWT Authentication
- Refresh Token
- WebSocket (optional but recommended)

---

## Database Collections

```
users
-------
_id
email
passwordHash
dailyTargetMinutes
timezone

sessions
---------
_id
userId
startTime
endTime
deviceId
createdAt

dailyStats
----------
userId
date
workedMinutes
goalMinutes
updatedAt
```

Notice something.

I would **not** store timer state in MongoDB.

Instead, store only completed work sessions.

Example

```
9:00 -> 10:20

session
-------
start
end
```

Then

```
2:00 -> 3:45

another session
```

At the end of the day

```
Worked =

80 + 105 = 185 min
```

Very lightweight.

---

## Current Running Timer

Never keep this in MongoDB.

Instead

Desktop

```
React State

or

Zustand
```

Mobile

```
Zustand
```

State

```
isRunning

startedAt

elapsedBeforeCurrentRun
```

---

## Sync Strategy

This is the important part.

Instead of syncing every second...

Don't.

The timer should run locally.

When you press

```
Start
```

store

```
startedAt
```

locally.

The timer UI updates every second using

```
Date.now()
```

No server calls.

When you press

```
Pause
```

calculate

```
duration =
now - startedAt
```

Send one API

```
POST /session
```

That's it.

One API call.

---

## Why?

Instead of

```
86400 updates/day
```

you'll probably have

```
15~30 API calls/day
```

Huge difference.

---

## Offline Support

Very important.

Store pending sessions locally.

Desktop

```
SQLite

or

JSON file
```

Mobile

```
SQLite

or

MMKV
```

If internet returns

```
Sync pending sessions.
```

Very easy.

---

## API

```
POST /login

POST /register

POST /session

GET /today

GET /stats

GET /history

PATCH /daily-target
```

Nothing more.

---

## Daily Statistics

Don't calculate every time.

Whenever a session is inserted

```
30 min
```

Immediately

```
dailyStats.workedMinutes += 30
```

Now

Dashboard

```
GET /today
```

returns

```
workedMinutes

goalMinutes

percentage
```

No aggregation needed.

Mongo stays fast.

---

## Charts

Frontend requests

```
GET /history?days=30
```

Returns

```
[
  {
    date,
    workedMinutes
  }
]
```

Feed directly into

```
Recharts

or

Victory Native
```

---

## Authentication

Simple

```
Email

Password

JWT

Refresh Token
```

Store

Desktop

```
Electron Safe Storage
```

Mobile

```
SecureStore
```

---

## Synchronization

Suppose

Desktop

```
Start timer
```

Phone opens.

Phone receives

```
running session
```

through

```
GET /today
```

or WebSocket.

It can show

```
Working...

Started 15 minutes ago.
```

If you pause on the phone

Desktop instantly stops.

This is where WebSocket helps.

Only one tiny message

```
paused
```

Very cheap.

---

## Timer Logic

Never

```
elapsed++
```

every second.

Instead

```
elapsed =
savedElapsed +
(Date.now() - startedAt)
```

Even if app freezes

Even if laptop sleeps

Even if FPS drops

The timer stays perfectly accurate.

---

## Data Flow

```
Start

↓

Save startedAt locally

↓

UI updates locally

↓

Pause

↓

Calculate duration

↓

POST session

↓

Server saves session

↓

Server updates dailyStats

↓

Notify other devices

↓

Done
```

---

## Suggested Architecture

```
                 MongoDB
                    ▲
                    │
            Node API Server
          (JWT + WebSocket)
             ▲          ▲
             │          │
     Electron App   React Native
             │          │
       Zustand      Zustand
             │          │
      Local Storage  Local Storage
             │          │
      Timer runs locally
```

## A few features I'd add

They're small but make the app much more useful:

- **Today's progress ring** (e.g. 4h 20m / 8h).
- **Current streak** (days hitting your target).
- **Weekly and monthly totals**.
- **Average productive hours** over the last 7 and 30 days.
- **Categories** (Coding, Reading, Exercise, Study, Meetings).
- **Notes** on a session (optional).
- **Auto-pause reminder**: if the desktop has been idle for 10 minutes, ask whether to pause the timer.
- **Home screen widget (Android)** and **system tray widget (Windows)** so you can start/pause without opening the app.
- **Keyboard shortcut** on Windows (e.g. `Ctrl + Shift + Space`) to toggle the timer.

Overall, this architecture is simple, scales well, minimizes database writes, works offline, and keeps both devices synchronized without constantly polling the server. Even if you later decide to support thousands of users, the core design would still hold up well.
