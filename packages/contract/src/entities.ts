// Spec section 6 entities as they cross the wire. Server-only fields (hashes, name keys, push
// tokens, Google subjects, notified devices) never appear here. Response objects use z.object, so
// the generated JSON Schema allows fields added later (older clients keep working); request
// objects use z.strictObject and reject unknown fields (spec 9.1).
import { z } from 'zod';
import {
  CreditAmount,
  CreditRate,
  DayKey,
  GoalMinutes,
  Id,
  Instant,
  PeriodId,
  SessionSummary,
  SessionTitle,
  TagName,
  TimeZoneName,
} from './primitives.js';

/** R-50: three fixed categories. */
export const Category = z.enum(['productive', 'leisure', 'neutral']);
/** TAG-08, R-43: the distraction class a Leisure tag can be linked to. */
export const DistractionClass = z.enum(['gaming', 'social']);
export const SessionSource = z.enum(['timer', 'manual', 'import']);
export const Platform = z.enum(['windows', 'android']);
/** R-19 */
export const GoalKind = z.enum(['daily', 'weekly', 'monthly']);
/** D-32: any of the seven days can start the week (default Monday, R-13). */
export const Weekday = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
/** D-32, SET-03: `system` follows the device locale. */
export const TimeFormat = z.enum(['system', '12h', '24h']);
/** SET-01 */
export const Theme = z.enum(['system', 'light', 'dark']);

/** The signed-in account (get me). */
export const User = z.object({
  id: Id,
  email: z.email(),
  emailVerifiedAt: Instant.nullable(),
  hasPassword: z.boolean(),
  googleLinked: z.boolean(),
  createdAt: Instant,
  updatedAt: Instant,
});

/** AUTH-05: a signed-in device. */
export const Device = z.object({
  id: Id,
  name: z.string(),
  platform: Platform,
  appVersion: z.string(),
  createdAt: Instant,
  lastSeenAt: Instant,
});

export const Tag = z.object({
  id: Id,
  name: TagName,
  category: Category,
  distractionClass: DistractionClass.nullable(),
  archived: z.boolean(),
  createdAt: Instant,
  updatedAt: Instant,
});

/** A session; `endedAt` null means running (R-01). One record even across midnight (R-11). */
export const Session = z.object({
  id: Id,
  startedAt: Instant,
  endedAt: Instant.nullable(),
  timezone: TimeZoneName,
  title: SessionTitle.nullable(),
  summary: SessionSummary.nullable(),
  tagId: Id.nullable(),
  source: SessionSource,
  deviceId: Id.nullable(),
  createdAt: Instant,
  updatedAt: Instant,
});

/** The server-owned timer: the running session, if any (no paused state, R-01). */
export const TimerState = z.object({ running: Session.nullable() });

/** R-19, R-20: one effective-dated goal value. `minutes` null = unset. */
export const GoalSetting = z.object({
  kind: GoalKind,
  minutes: GoalMinutes.nullable(),
  rememberedMinutes: GoalMinutes.nullable(),
  effectiveFrom: DayKey,
});

/** R-19: the value in effect today; unsetting keeps `rememberedMinutes` so setting restores it. */
export const CurrentGoal = z.object({
  minutes: GoalMinutes.nullable(),
  rememberedMinutes: GoalMinutes.nullable(),
});

export const Goals = z.object({
  current: z.object({ daily: CurrentGoal, weekly: CurrentGoal, monthly: CurrentGoal }),
  history: z.array(GoalSetting),
});

/** NOTIF-03 / US-10.3: one toggle per notification type. */
export const NotificationToggles = z.object({
  creditLow: z.boolean(),
  creditZero: z.boolean(),
  creditBelowZero: z.boolean(),
  dailyGoal: z.boolean(),
  weeklyMonthlyGoal: z.boolean(),
  gameSuggestion: z.boolean(),
});

export const Preferences = z.object({
  /** R-15: null until the user confirms it at first sign-in (AUTH-12). */
  timezone: TimeZoneName.nullable(),
  weekStart: Weekday,
  countWeekends: z.boolean(),
  timeFormat: TimeFormat,
  theme: Theme,
  notifications: NotificationToggles,
  onboardingCompletedAt: Instant.nullable(),
});

/** R-27: a goal reached, once per (kind, period ID). */
export const Achievement = z.object({
  kind: GoalKind,
  periodId: PeriodId,
  achievedAt: Instant,
  productiveMinutes: z.int().min(0),
  targetMinutes: GoalMinutes,
});

/**
 * CRED-05, R-44: credit rates, effective from the instant they were saved. Non-negative credits
 * per hour; the field says whether they are earned or spent (R-42, R-43; ADR-0003).
 */
export const CreditRates = z.object({
  earn: CreditRate,
  gaming: CreditRate,
  social: CreditRate,
  otherLeisure: CreditRate,
  effectiveFrom: Instant,
});

/** Spec 7.2 "balance snapshot (balance, rates)", carried by `credits.changed` (spec 7.3). */
export const CreditBalanceSnapshot = z.object({ balance: CreditAmount, rates: CreditRates });

/** App updates (spec 7.2): the latest release for one platform; shape per ADR-0003. */
export const AppRelease = z.object({
  platform: Platform,
  version: z.string(),
  downloadUrl: z.url({ protocol: /^https$/ }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Updater signature (Tauri on Windows); null where the platform verifies differently. */
  signature: z.string().nullable(),
});
