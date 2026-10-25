// D-19: the shared time-math fixture suite in packages/contract/fixtures/time/ (format and
// conventions: fixtures/README.md, ADR-0004). One schema per file, and a loader that reads the
// whole directory and fails on a file it has no schema for or one that is missing, so a runner
// built on it cannot skip a fixture silently. Test-only: nothing at runtime imports this module.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Weekday } from '../entities.js';
import { DayKey, Instant, PeriodId, Seconds, TimeZoneName } from '../primitives.js';

/** Absolute path of `packages/contract/fixtures/time/` (from `src/fixtures/` and `dist/fixtures/`). */
export const timeFixturesDirectory = fileURLToPath(
  new URL('../../fixtures/time/', import.meta.url),
);

/** R-13: the period kinds time math knows; goals use the first three (R-19). */
const PeriodKind = z.enum(['day', 'week', 'month', 'year']);
/** R-14 period IDs, years included (`PeriodId` covers only the goal periods). */
const PeriodKey = z.union([PeriodId, z.string().regex(/^\d{4}$/)]);
/** ADR-0004: local wall-clock time of a history row, `HH:MM:SS`. */
const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);

const Session = z.strictObject({
  startedAt: Instant,
  endedAt: Instant.nullable(),
  timeZone: TimeZoneName,
});

/** `{ description, rules, cases: [{ name, input, expected }] }` with unique case names. */
function fixtureFile<Input extends z.ZodType, Expected extends z.ZodType>(
  input: Input,
  expected: Expected,
) {
  return z
    .strictObject({
      description: z.string().min(1),
      rules: z.array(z.string().regex(/^R-\d{2}$/)).min(1),
      cases: z.array(z.strictObject({ name: z.string().min(1), input, expected })).min(1),
    })
    .superRefine((file, context) => {
      const seen = new Set<string>();
      for (const { name } of file.cases) {
        if (seen.has(name)) {
          context.addIssue({ code: 'custom', message: `duplicate case name "${name}"` });
        }
        seen.add(name);
      }
    });
}

/** One schema per fixture file, keyed by file name without `.json` (the Interfaces of T0.5). */
export const timeFixtureSchemas = {
  instant: fixtureFile(
    z.strictObject({ instant: Instant }),
    z.strictObject({ epochSeconds: z.int() }),
  ),
  // Any text, deliberately not `Instant`: each case is a string both parsers must reject.
  'invalid-instant': fixtureFile(
    z.strictObject({ instant: z.string() }),
    z.strictObject({ error: z.literal('malformed-instant') }),
  ),
  duration: fixtureFile(
    z.strictObject({ start: Instant, end: Instant }),
    z.strictObject({ seconds: Seconds }),
  ),
  'day-key': fixtureFile(
    z.strictObject({ instant: Instant, timeZone: TimeZoneName }),
    z.strictObject({ day: DayKey }),
  ),
  'day-bounds': fixtureFile(
    z.strictObject({ day: DayKey, timeZone: TimeZoneName }),
    z.strictObject({ start: Instant, end: Instant, seconds: Seconds }),
  ),
  period: fixtureFile(
    z.strictObject({ kind: PeriodKind, day: DayKey, weekStart: Weekday, timeZone: TimeZoneName }),
    z.strictObject({
      id: PeriodKey,
      firstDay: DayKey,
      lastDay: DayKey,
      start: Instant,
      end: Instant,
      seconds: Seconds,
    }),
  ),
  'day-rows': fixtureFile(
    Session.extend({ now: Instant }),
    z.strictObject({
      rows: z.array(
        z.strictObject({
          day: DayKey,
          start: Instant,
          end: Instant,
          seconds: Seconds,
          localStart: LocalTime,
          localEnd: LocalTime,
        }),
      ),
    }),
  ),
  'period-total': fixtureFile(
    z.strictObject({
      sessions: z.array(Session),
      kind: PeriodKind,
      day: DayKey,
      weekStart: Weekday,
      timeZone: TimeZoneName,
      now: Instant,
    }),
    z.strictObject({ seconds: Seconds }),
  ),
  display: fixtureFile(
    z.strictObject({ seconds: z.int() }),
    z.strictObject({
      clock: z.string().regex(/^\d+:[0-5]\d:[0-5]\d$/),
      summary: z.strictObject({ hours: z.int().min(0), minutes: z.int().min(0).max(59) }),
    }),
  ),
};

export type TimeFixtureFile = keyof typeof timeFixtureSchemas;
export type TimeFixtures = {
  [File in TimeFixtureFile]: z.infer<(typeof timeFixtureSchemas)[File]>;
};
export type TimeFixtureCase<File extends TimeFixtureFile> = TimeFixtures[File]['cases'][number];

export const timeFixtureFiles = Object.keys(timeFixtureSchemas) as TimeFixtureFile[];

function isTimeFixtureFile(name: string): name is TimeFixtureFile {
  return Object.hasOwn(timeFixtureSchemas, name);
}

/**
 * Reads and validates every file in `directory`. Throws on a file without a schema, a missing
 * file or a case that does not match its schema; the message names the file.
 */
export function loadTimeFixtures(directory: string = timeFixturesDirectory): TimeFixtures {
  const present = readdirSync(directory);
  const unknown = present.filter(
    (name) => !name.endsWith('.json') || !isTimeFixtureFile(name.slice(0, -5)),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown time fixture file(s) ${unknown.join(', ')}: add a schema in src/fixtures/time.ts and a runner in both implementations`,
    );
  }
  const missing = timeFixtureFiles.filter((file) => !present.includes(`${file}.json`));
  if (missing.length > 0) {
    throw new Error(
      `Missing time fixture file(s) ${missing.map((file) => `${file}.json`).join(', ')}`,
    );
  }
  return Object.fromEntries(
    timeFixtureFiles.map((file) => [file, parseFile(directory, file)]),
  ) as TimeFixtures;
}

function parseFile(directory: string, file: TimeFixtureFile): unknown {
  const name = `${file}.json`;
  let content: unknown;
  try {
    content = JSON.parse(readFileSync(join(directory, name), 'utf8'));
  } catch (error) {
    throw new Error(`${name} is not readable JSON`, { cause: error });
  }
  const result = timeFixtureSchemas[file].safeParse(content);
  if (!result.success) throw new Error(`${name} is invalid:\n${z.prettifyError(result.error)}`);
  return result.data;
}
