// D-19: the server half of the shared time-math fixture suite (packages/contract/fixtures/time/).
// loadTimeFixtures fails on a file it has no schema for, and `runners` must name every file the
// contract knows, so a new fixture file breaks this test (and the type check) instead of being
// skipped.
import {
  loadTimeFixtures,
  timeFixtureFiles,
  type TimeFixtureCase,
  type TimeFixtureFile,
} from '@pulse/contract/fixtures/time';
import { describe, expect, it } from 'vitest';
import {
  dayBounds,
  dayKey,
  dayRows,
  durationSeconds,
  formatClock,
  formatInstant,
  parseInstant,
  period,
  periodId,
  periodTotal,
  summaryParts,
  TimeMathError,
  type SessionSpan,
} from './index.js';

type Runner<File extends TimeFixtureFile> = (
  input: TimeFixtureCase<File>['input'],
) => TimeFixtureCase<File>['expected'];

function session(input: {
  startedAt: string;
  endedAt: string | null;
  timeZone: string;
}): SessionSpan {
  return {
    startedAt: parseInstant(input.startedAt),
    endedAt: input.endedAt === null ? null : parseInstant(input.endedAt),
    timeZone: input.timeZone,
  };
}

/** The parse must fail with malformed-instant; acceptance or any other error fails the case. */
function rejection(instant: string): { error: 'malformed-instant' } {
  try {
    parseInstant(instant);
  } catch (error) {
    if (error instanceof TimeMathError && error.code === 'malformed-instant') {
      return { error: error.code };
    }
    throw error;
  }
  throw new Error(`parseInstant accepted ${JSON.stringify(instant)}`);
}

const runners: { [File in TimeFixtureFile]: Runner<File> } = {
  instant: ({ instant }) => ({ epochSeconds: parseInstant(instant) }),
  'invalid-instant': ({ instant }) => rejection(instant),
  duration: ({ start, end }) => ({
    seconds: durationSeconds(parseInstant(start), parseInstant(end)),
  }),
  'day-key': ({ instant, timeZone }) => ({ day: dayKey(parseInstant(instant), timeZone) }),
  'day-bounds': ({ day, timeZone }) => {
    const { start, end } = dayBounds(day, timeZone);
    return {
      start: formatInstant(start),
      end: formatInstant(end),
      seconds: durationSeconds(start, end),
    };
  },
  period: ({ kind, day, weekStart, timeZone }) => {
    const { id, firstDay, lastDay, start, end } = period(kind, day, weekStart, timeZone);
    // The standalone ID (no timezone) must agree with the period's.
    expect(periodId(kind, day, weekStart)).toBe(id);
    return {
      id,
      firstDay,
      lastDay,
      start: formatInstant(start),
      end: formatInstant(end),
      seconds: durationSeconds(start, end),
    };
  },
  'day-rows': (input) => ({
    rows: dayRows(session(input), parseInstant(input.now)).map((row) => ({
      ...row,
      start: formatInstant(row.start),
      end: formatInstant(row.end),
    })),
  }),
  'period-total': ({ sessions, kind, day, weekStart, timeZone, now }) => ({
    seconds: periodTotal(sessions.map(session), kind, day, weekStart, timeZone, parseInstant(now)),
  }),
  display: ({ seconds }) => ({ clock: formatClock(seconds), summary: summaryParts(seconds) }),
};

const fixtures = loadTimeFixtures();

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the parameter ties runners[file] to fixtures[file] (a union-typed key cannot)
function runFile<File extends TimeFixtureFile>(file: File): void {
  const run: Runner<File> = runners[file];
  const cases: TimeFixtureCase<File>[] = fixtures[file].cases;
  describe(`${file}.json`, () => {
    it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
      expect(run(c.input)).toEqual(c.expected);
    });
  });
}

describe('time fixtures (D-19, R-10..R-18)', () => {
  it('has a runner for every fixture file and nothing else', () => {
    expect(Object.keys(runners).sort()).toEqual([...timeFixtureFiles].sort());
  });

  for (const file of timeFixtureFiles) runFile(file);
});
