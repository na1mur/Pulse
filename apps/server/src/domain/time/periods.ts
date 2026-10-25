// R-12..R-14: periods of local days in the user's timezone, their IDs and their totals.
import type { Weekday } from '@pulse/contract';
import type { Temporal } from 'temporal-polyfill';
import { dayRows, daysBounds, parseDay, type SessionSpan } from './days.js';

export type PeriodKind = 'day' | 'week' | 'month' | 'year';
export type WeekStart = (typeof Weekday.options)[number];

export interface Period {
  id: string;
  firstDay: string;
  lastDay: string;
  start: number;
  end: number;
}

const ISO_WEEKDAY: Record<WeekStart, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

interface PeriodDays {
  id: string;
  firstDay: Temporal.PlainDate;
  lastDay: Temporal.PlainDate;
}

/** R-13, R-14: which days a period holds and its ID; no timezone needed. */
function periodDays(kind: PeriodKind, date: Temporal.PlainDate, weekStart: WeekStart): PeriodDays {
  switch (kind) {
    case 'day':
      return { id: date.toString(), firstDay: date, lastDay: date };
    case 'week': {
      // The latest week-start weekday on or before the day.
      const firstDay = date.subtract({ days: (date.dayOfWeek - ISO_WEEKDAY[weekStart] + 7) % 7 });
      return { id: `W${firstDay.toString()}`, firstDay, lastDay: firstDay.add({ days: 6 }) };
    }
    case 'month':
      return {
        id: date.toPlainYearMonth().toString(),
        firstDay: date.with({ day: 1 }),
        lastDay: date.with({ day: date.daysInMonth }),
      };
    case 'year':
      return {
        id: String(date.year).padStart(4, '0'),
        firstDay: date.with({ month: 1, day: 1 }),
        lastDay: date.with({ month: 12, day: 31 }),
      };
  }
}

/** R-14: `2026-10-24`, `W2026-10-19`, `2026-10`, `2026`. `weekStart` matters for weeks only. */
export function periodId(kind: PeriodKind, day: string, weekStart: WeekStart): string {
  return periodDays(kind, parseDay(day), weekStart).id;
}

/** R-12, R-13: the period holding `day`, bounded by local midnights in `timeZone`. */
export function period(
  kind: PeriodKind,
  day: string,
  weekStart: WeekStart,
  timeZone: string,
): Period {
  const { id, firstDay, lastDay } = periodDays(kind, parseDay(day), weekStart);
  return {
    id,
    firstDay: firstDay.toString(),
    lastDay: lastDay.toString(),
    ...daysBounds(firstDay, lastDay, timeZone),
  };
}

/**
 * R-11, R-12, R-17: worked seconds in the period holding `day`. Rows are keyed in each session's
 * own timezone; the period's days come from the user's `timeZone`. Running sessions count to `now`.
 */
export function periodTotal(
  sessions: readonly SessionSpan[],
  kind: PeriodKind,
  day: string,
  weekStart: WeekStart,
  timeZone: string,
  now: number,
): number {
  const { firstDay, lastDay } = period(kind, day, weekStart, timeZone);
  let total = 0;
  for (const session of sessions) {
    for (const row of dayRows(session, now)) {
      // Day keys with four-digit years sort as text.
      if (row.day >= firstDay && row.day <= lastDay) total += row.seconds;
    }
  }
  return total;
}
