# Productivity Timer App - Development Plan

## Overview

Build a cross-platform productivity timer application for **Windows** and **Android**.

The purpose of the application is extremely simple:

- One timer
- One Play/Pause toggle
- Track productive work time
- Sync seamlessly between devices
- Display daily/weekly/monthly statistics

The application should prioritize:

- Accuracy
- Offline-first behavior
- Low database usage
- Fast synchronization
- Simple architecture
- Clean UI

---

# Tech Stack

## Monorepo

Use **Turborepo**.

```
apps/
    api/
    desktop/
    mobile/

packages/
    ui/
    types/
    validation/
    utils/
```

---

## Desktop

- Electron
- React
- Vite
- TypeScript
- Zustand
- React Query
- TailwindCSS
- shadcn/ui

---

## Mobile

- React Native
- Expo
- Zustand
- React Query
- NativeWind

---

## Backend

- Node.js
- Express
- TypeScript
- MongoDB
- Mongoose
- JWT Authentication
- Refresh Token
- Socket.IO

---

## Shared

- Zod
- Axios
- ESLint
- Prettier

---

# Phase 1 - Project Setup

## Backend

- Initialize Express project
- Configure TypeScript
- Configure ESLint
- Configure Prettier
- Configure environment variables
- Configure MongoDB connection

---

## Desktop

Create Electron application.

Requirements:

- React
- Vite
- Tailwind
- Zustand
- React Query

---

## Mobile

Create Expo application.

Requirements:

- NativeWind
- Zustand
- React Query

---

## Shared Packages

Create

```
packages/types

packages/utils

packages/validation

packages/ui
```

---

# Phase 2 - Authentication

Implement

## Register

```
POST /auth/register
```

---

## Login

```
POST /auth/login
```

---

## Refresh Token

```
POST /auth/refresh
```

---

## Logout

```
POST /auth/logout
```

---

JWT authentication.

Access token

Refresh token

Secure password hashing using bcrypt.

---

# Phase 3 - Database Design

## User

```
id
email
passwordHash
dailyTargetMinutes
timezone
createdAt
updatedAt
```

---

## Work Session

```
id
userId
deviceId

startTime
endTime

durationMinutes

createdAt
updatedAt
```

---

## Daily Stats

```
userId

date

workedMinutes

goalMinutes

updatedAt
```

DailyStats is a cached summary.

Do not aggregate all sessions every time.

Whenever a new session is created, immediately update DailyStats.

---

# Phase 4 - Timer Engine

The timer **must run locally**.

Never synchronize every second.

Store locally:

```
isRunning

startedAt

elapsedBeforeCurrentRun
```

Current elapsed time should always be calculated as

```
elapsedBeforeCurrentRun +
(Date.now() - startedAt)
```

Never increment elapsed by one second.

This keeps the timer accurate even if:

- App freezes
- Computer sleeps
- Phone locks
- Low FPS

---

# Phase 5 - Offline Support

Desktop

Persist timer state locally.

Suggested:

```
SQLite
```

or

```
electron-store
```

Mobile

Persist timer state locally.

Suggested:

```
MMKV
```

or

```
SQLite
```

Pending sessions should remain locally until internet returns.

---

# Phase 6 - Session Synchronization

When user presses

```
Play
```

Store locally

```
startedAt
```

No API request required.

---

When user presses

```
Pause
```

Calculate

```
duration

startTime

endTime
```

Then

```
POST /sessions
```

Only one request.

---

Never send timer updates every second.

---

# Phase 7 - Device Synchronization

Integrate Socket.IO.

Whenever a session starts

Broadcast

```
session_started
```

Whenever paused

Broadcast

```
session_paused
```

Whenever target changes

Broadcast

```
goal_updated
```

Only small events.

No continuous streaming.

---

# Phase 8 - API Endpoints

Authentication

```
POST /auth/register

POST /auth/login

POST /auth/logout

POST /auth/refresh
```

---

Sessions

```
POST /sessions

GET /sessions

GET /sessions/today
```

---

Statistics

```
GET /stats/today

GET /stats/week

GET /stats/month

GET /stats/history
```

---

Settings

```
PATCH /settings/daily-target
```

---

# Phase 9 - UI

## Login Screen

- Email
- Password
- Login
- Register

---

## Home Screen

Large timer.

Example

```
04:25:18
```

Buttons

```
Play

Pause
```

Display

Today's progress

```
4h 25m

Goal: 8h

55%
```

---

## Statistics

Charts

- Last 7 days
- Last 30 days
- Last 12 months

Display

- Total hours
- Average hours
- Best day
- Current streak

---

## Settings

Daily goal

Example

```
6 hours

8 hours

10 hours
```

Timezone

Logout

---

# Phase 10 - Charts

Backend returns

```
[
  {
    date,
    workedMinutes
  }
]
```

Frontend renders

- Daily bars
- Weekly bars
- Monthly bars

No heavy calculations on frontend.

---

# Phase 11 - Error Handling

Handle

- Offline mode
- Expired token
- Duplicate sync
- Invalid session
- Invalid login

---

# Phase 12 - Security

- JWT
- Refresh Tokens
- bcrypt
- HTTPS
- Helmet
- CORS
- Rate limiting

---

# Phase 13 - Testing

Backend

- Unit tests
- API tests

Frontend

- Timer accuracy
- Offline sync
- Authentication
- Socket synchronization

---

# Phase 14 - Deployment

Backend

- Docker
- PM2
- Nginx

Database

- MongoDB Atlas

Desktop

- Electron Builder

Android

- Expo EAS Build

---

# Future Features

- Categories (Coding, Reading, Exercise, Study)
- Session notes
- Weekly goals
- Monthly goals
- Productivity heatmap
- Home screen widget
- Desktop tray application
- Keyboard shortcut
- Idle detection
- Calendar integration
- CSV export
- Dark mode
- Multiple themes
- Achievement badges

---

# Important Engineering Rules

1. Timer always runs locally.

2. Never update the server every second.

3. Database stores completed sessions only.

4. Daily statistics are cached in DailyStats.

5. Every feature must work offline.

6. Socket.IO is only for synchronization events.

7. Shared business logic should live inside the `packages` directory.

8. All API contracts must use Zod validation.

9. Use React Query for all server state.

10. Use Zustand only for local UI and timer state.

11. Keep the backend stateless except for JWT refresh token handling.

12. Prioritize simplicity over premature optimization.
