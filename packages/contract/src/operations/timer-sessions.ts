// Timer and Sessions groups (spec 7.2; R-01..R-09, TIM-01..TIM-03, LOG-01..LOG-06).
import { z } from 'zod';
import { Category, Session, TimerState } from '../entities.js';
import {
  Cursor,
  DayKey,
  Id,
  Instant,
  Revision,
  SessionSummary,
  SessionTitle,
  commandFields,
  page,
} from '../primitives.js';

/**
 * Spec 8.5: a command naming a tag that was deleted elsewhere is applied with the deletion's
 * replacement (or Untagged) and reported as a warning, not rejected.
 */
export const Warning = z.object({
  code: z.enum(['TAG_REPLACED']),
  message: z.string(),
  tagId: Id,
  replacementTagId: Id.nullable(),
});

/**
 * R-49 needs to know which fields a command changed, so updates are field-level patches, and
 * clearing is explicit (ADR-0003): an absent field is unchanged, `{ value }` sets it and
 * `{ value: null }` clears it. Never optional-and-nullable: Rust could not send the null.
 */
export const TitleUpdate = z.strictObject({ value: SessionTitle.nullable() });
/** `{ value: null }` moves the session to Untagged (R-50: an untagged session counts as Neutral). */
export const TagUpdate = z.strictObject({ value: Id.nullable() });
export const SummaryUpdate = z.strictObject({ value: SessionSummary.nullable() });

/** R-01, R-03: start the timer. `sessionId` is client-generated so offline starts keep their ID. */
export const StartTimerRequest = z.strictObject({
  ...commandFields,
  sessionId: Id,
  /** Absent: no title. */
  title: SessionTitle.optional(),
  /** Absent: Untagged. */
  tagId: Id.optional(),
  /** Offline replay: the press time (R-03, R-06); omitted online, where the server stamps it. */
  startedAt: Instant.optional(),
});

/** R-06: pause ends the running session at the press. */
export const PauseTimerRequest = z.strictObject({
  ...commandFields,
  endedAt: Instant.optional(),
});

/** TIM-02: edit title and tag while running (field patches, see TitleUpdate). */
export const UpdateRunningRequest = z.strictObject({
  ...commandFields,
  title: TitleUpdate.optional(),
  tagId: TagUpdate.optional(),
});

/** Start and update-running result; R-02: a start while running returns the running session. */
export const TimerResult = z.object({
  revision: Revision,
  timer: TimerState,
  warnings: z.array(Warning),
});

/** Pause result: the session it ended, or null when nothing was running (R-02 no-op). */
export const PauseTimerResult = z.object({
  revision: Revision,
  timer: TimerState,
  endedSession: Session.nullable(),
});

/** LOG-06: sessions of a range of local days (inclusive), newest first, history page size 50. */
export const ListSessionsQuery = z.strictObject({
  from: DayKey,
  to: DayKey,
  tagId: Id.optional(),
  category: Category.optional(),
  /** Searches title and summary (Appendix A "Other field limits": <= 200). */
  text: z.string().min(1).max(200).optional(),
  cursor: Cursor.optional(),
});
export const SessionPage = page(Session);
export const SessionParams = z.strictObject({ sessionId: Id });

/** LOG-05: add a past session manually. */
export const CreateSessionRequest = z.strictObject({
  ...commandFields,
  sessionId: Id,
  startedAt: Instant,
  endedAt: Instant,
  /** Absent: no title, Untagged, no summary. */
  title: SessionTitle.optional(),
  tagId: Id.optional(),
  summary: SessionSummary.optional(),
});

/** LOG-03: edit a session (field patches, see TitleUpdate); start and end are never cleared. */
export const UpdateSessionRequest = z.strictObject({
  ...commandFields,
  title: TitleUpdate.optional(),
  tagId: TagUpdate.optional(),
  summary: SummaryUpdate.optional(),
  startedAt: Instant.optional(),
  endedAt: Instant.optional(),
});

export const SessionResult = z.object({
  revision: Revision,
  session: Session,
  warnings: z.array(Warning),
});

/** LOG-04 */
export const DeleteSessionRequest = z.strictObject({ ...commandFields });
export const DeleteSessionResult = z.object({ revision: Revision, sessionId: Id });
