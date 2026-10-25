// R-10, R-11: local days and the per-day rows of a session (ADR-0004 intervals, days, day rows).
import { Temporal } from 'temporal-polyfill';
import { assertSeconds, instantAt } from './instant.js';
import { TimeMathError } from './time-math-error.js';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The span of a session as time math sees it: whole epoch seconds, `endedAt` null while running,
 * and the timezone it was recorded in (R-09). Not the contract's `Session` entity.
 */
export interface SessionSpan {
  startedAt: number;
  endedAt: number | null;
  timeZone: string;
}

/** R-11: the part of a session on one local day, `[start, end)`, with wall-clock display times. */
export interface DayRow {
  day: string;
  start: number;
  end: number;
  seconds: number;
  localStart: string;
  localEnd: string;
}

export interface Bounds {
  start: number;
  end: number;
}

/** A `YYYY-MM-DD` day key as a calendar date. */
export function parseDay(day: string): Temporal.PlainDate {
  if (!DAY_KEY.test(day)) throw new TimeMathError('malformed-day', day);
  try {
    return Temporal.PlainDate.from(day);
  } catch (error) {
    throw new TimeMathError('malformed-day', day, { cause: error });
  }
}

/**
 * Throws unless `timeZone` is a known IANA name, as the contract's TimeZoneName. Temporal also
 * takes offsets such as "+02:00" as zones; Pulse stores IANA names only (R-09).
 */
function assertTimeZone(timeZone: string): void {
  if (!/^[A-Za-z]/.test(timeZone)) throw new TimeMathError('unknown-time-zone', timeZone);
  try {
    new Temporal.ZonedDateTime(0n, timeZone);
  } catch (error) {
    throw new TimeMathError('unknown-time-zone', timeZone, { cause: error });
  }
}

/** The instant `seconds` in `timeZone`. */
function zonedAt(seconds: number, timeZone: string): Temporal.ZonedDateTime {
  const instant = instantAt(seconds);
  assertTimeZone(timeZone);
  return instant.toZonedDateTimeISO(timeZone);
}

/**
 * The first instant whose local date is `date`: midnight, or the first instant after a skipped
 * midnight (Temporal's start of day). Whole seconds, because UTC offsets are.
 */
function startOfDay(date: Temporal.PlainDate, timeZone: string): number {
  return date.toZonedDateTime(timeZone).epochMilliseconds / 1000;
}

/** `[start of firstDay, start of the day after lastDay)` in `timeZone`. */
export function daysBounds(
  firstDay: Temporal.PlainDate,
  lastDay: Temporal.PlainDate,
  timeZone: string,
): Bounds {
  assertTimeZone(timeZone);
  return {
    start: startOfDay(firstDay, timeZone),
    end: startOfDay(lastDay.add({ days: 1 }), timeZone),
  };
}

/** R-10: the local date of an instant in a timezone. */
export function dayKey(instant: number, timeZone: string): string {
  return zonedAt(instant, timeZone).toPlainDate().toString();
}

/** R-10: `[start, end)` of a local day; 23 h or 25 h long on DST days. */
export function dayBounds(day: string, timeZone: string): Bounds {
  const date = parseDay(day);
  return daysBounds(date, date, timeZone);
}

function wallClock(time: Temporal.ZonedDateTime): string {
  return time.toPlainTime().toString({ smallestUnit: 'second' });
}

/**
 * R-11: one row per local day (in the session's own timezone) with more than 0 seconds. A
 * running session ends at `now`; `now` never bounds a closed one. A row ending at its day's end
 * shows the day's last second (23:59:59).
 */
export function dayRows(session: SessionSpan, now: number): DayRow[] {
  const { startedAt, endedAt, timeZone } = session;
  assertSeconds(now);
  const end = endedAt ?? now;
  assertSeconds(end);
  let cursor = zonedAt(startedAt, timeZone);
  let rowStart = startedAt;
  const rows: DayRow[] = [];
  while (rowStart < end) {
    const date = cursor.toPlainDate();
    const dayEnd = startOfDay(date.add({ days: 1 }), timeZone);
    const rowEnd = Math.min(end, dayEnd);
    rows.push({
      day: date.toString(),
      start: rowStart,
      end: rowEnd,
      seconds: rowEnd - rowStart,
      localStart: wallClock(cursor),
      localEnd: wallClock(zonedAt(rowEnd === dayEnd ? rowEnd - 1 : rowEnd, timeZone)),
    });
    rowStart = rowEnd;
    cursor = zonedAt(rowEnd, timeZone);
  }
  return rows;
}
