// Sync, App updates and Health groups (spec 7.2, section 8.4, OPS-01).
import { z } from 'zod';
import { Goals, Platform, Preferences, Tag, TimerState } from '../entities.js';
import { DataEvent } from '../events.js';
import { Cursor, QueryInteger, Revision } from '../primitives.js';

/**
 * SYNC-07: the state a client caches, at one revision. Today's totals and the balance join it
 * when their Stats and Credits shapes exist (D-29: T2.4 and T5.1 define them).
 */
export const SyncSnapshot = z.object({
  revision: Revision,
  timer: TimerState,
  preferences: Preferences,
  tags: z.array(Tag),
  goals: Goals,
});

/** R-35: changes after `since`, oldest first; follow `cursor` until `nextCursor` is null. */
export const SyncChangesQuery = z.strictObject({
  since: QueryInteger,
  cursor: Cursor.optional(),
});
export const SyncChangesPage = z.object({
  items: z.array(DataEvent),
  nextCursor: Cursor.nullable(),
  /** The user's current revision when the page was read. */
  revision: Revision,
});

export const LatestReleaseQuery = z.strictObject({ platform: Platform });

/** OPS-01: API and database status. A database outage answers 503 UNAVAILABLE instead. */
export const HealthReport = z.object({
  status: z.literal('ok'),
  database: z.literal('up'),
});
/** Liveness: the process answers; no dependency is checked. */
export const LivenessReport = z.object({ status: z.literal('ok') });
