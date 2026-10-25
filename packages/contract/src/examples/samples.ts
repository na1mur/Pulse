// Sample entities the operation, event and message examples are built from. Typed with the
// contract's inferred types, so a schema change that breaks a sample fails the type check.
import type { z } from 'zod';
import type {
  AppRelease,
  CreditBalanceSnapshot,
  Device,
  Goals,
  Preferences,
  Session,
  Tag,
  User,
} from '../entities.js';

export const ids = {
  user: '0192f1a6-0000-7000-8000-000000000001',
  device: '0192f1a6-0000-7000-8000-000000000002',
  otherDevice: '0192f1a6-0000-7000-8000-000000000003',
  tag: '0192f1a6-0000-7000-8000-000000000010',
  otherTag: '0192f1a6-0000-7000-8000-000000000011',
  session: '0192f1a6-0000-7000-8000-000000000020',
  runningSession: '0192f1a6-0000-7000-8000-000000000021',
  command: '0192f1a6-0000-7000-8000-000000000030',
} as const;

export const user: z.infer<typeof User> = {
  id: ids.user,
  email: 'ada@example.com',
  emailVerifiedAt: '2026-10-20T09:00:00Z',
  hasPassword: true,
  googleLinked: false,
  createdAt: '2026-10-20T08:55:00Z',
  updatedAt: '2026-10-20T09:00:00Z',
};

export const device: z.infer<typeof Device> = {
  id: ids.device,
  name: 'Ada desktop',
  platform: 'windows',
  appVersion: '1.0.0',
  createdAt: '2026-10-20T09:01:00Z',
  lastSeenAt: '2026-10-25T08:00:00Z',
};

export const tag: z.infer<typeof Tag> = {
  id: ids.tag,
  name: 'Deep Work',
  category: 'productive',
  distractionClass: null,
  archived: false,
  createdAt: '2026-10-20T09:02:00Z',
  updatedAt: '2026-10-20T09:02:00Z',
};

export const gamingTag: z.infer<typeof Tag> = {
  id: ids.otherTag,
  name: 'Gaming',
  category: 'leisure',
  distractionClass: 'gaming',
  archived: false,
  createdAt: '2026-10-20T09:02:00Z',
  updatedAt: '2026-10-20T09:02:00Z',
};

/** A finished session crossing local midnight in Asia/Dhaka (one record, R-11). */
export const session: z.infer<typeof Session> = {
  id: ids.session,
  startedAt: '2026-10-24T17:30:00Z',
  endedAt: '2026-10-24T18:45:00Z',
  timezone: 'Asia/Dhaka',
  title: 'Contract package',
  summary: 'Schemas and generators.',
  tagId: ids.tag,
  source: 'timer',
  deviceId: ids.device,
  createdAt: '2026-10-24T17:30:00Z',
  updatedAt: '2026-10-24T18:46:00Z',
};

export const runningSession: z.infer<typeof Session> = {
  ...session,
  id: ids.runningSession,
  startedAt: '2026-10-25T08:00:00Z',
  endedAt: null,
  summary: null,
  createdAt: '2026-10-25T08:00:00Z',
  updatedAt: '2026-10-25T08:00:00Z',
};

export const preferences: z.infer<typeof Preferences> = {
  timezone: 'Asia/Dhaka',
  weekStart: 'monday',
  countWeekends: true,
  timeFormat: 'system',
  theme: 'system',
  notifications: {
    creditLow: true,
    creditZero: true,
    creditBelowZero: true,
    dailyGoal: true,
    weeklyMonthlyGoal: true,
    gameSuggestion: true,
  },
  onboardingCompletedAt: '2026-10-20T09:02:00Z',
};

export const goals: z.infer<typeof Goals> = {
  current: {
    daily: { minutes: 240, rememberedMinutes: 240 },
    weekly: { minutes: null, rememberedMinutes: 1200 },
    monthly: { minutes: null, rememberedMinutes: null },
  },
  history: [
    { kind: 'weekly', minutes: 1200, rememberedMinutes: 1200, effectiveFrom: '2026-10-13' },
    { kind: 'daily', minutes: 240, rememberedMinutes: 240, effectiveFrom: '2026-10-20' },
    { kind: 'weekly', minutes: null, rememberedMinutes: 1200, effectiveFrom: '2026-10-20' },
  ],
};

export const credits: z.infer<typeof CreditBalanceSnapshot> = {
  balance: '-3.25',
  rates: {
    earn: '5.00',
    gaming: '10.00',
    social: '20.00',
    otherLeisure: '10.00',
    effectiveFrom: '2026-10-20T09:00:00Z',
  },
};

export const release: z.infer<typeof AppRelease> = {
  platform: 'android',
  version: '1.0.0',
  downloadUrl: 'https://pulse.example.com/downloads/pulse-1.0.0.apk',
  sha256: 'a'.repeat(64),
  signature: null,
};
