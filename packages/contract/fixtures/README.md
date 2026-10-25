# Shared fixtures (D-19)

One suite of input/expected cases that keeps the TypeScript server and the Rust client core identical. Both implementations run every case in CI; neither may compute an expected value for the other. Decisions behind the conventions: `docs/decisions/0004-time-math.md` (ADR-0004).

## Layout and format

```
fixtures/
  time/          time math (T0.5, R-10..R-18)
    instant.json      parseInstant
    invalid-instant.json parseInstant rejections
    duration.json     durationSeconds
    day-key.json      dayKey
    day-bounds.json   dayBounds
    period.json       period / periodId
    day-rows.json     dayRows
    period-total.json periodTotal
    display.json      formatClock / summaryParts
```

Every file is one JSON object:

```json
{
  "description": "what the function does, in one or two sentences",
  "rules": ["R-11"],
  "cases": [{ "name": "what this case proves", "input": {}, "expected": {} }]
}
```

Case names are unique within a file and say what the case proves; runners use them as test names. Input and expected shapes per file are the Interfaces table in `docs/tasks/T0.5.md`; the zod schemas in `packages/contract/src/fixtures/time.ts` are the executable version.

## Conventions (ADR-0004)

- **Instants** are ISO-8601 UTC strings ending in `Z`. Some inputs carry fractional seconds on purpose.
- **Whole seconds.** Every instant is floored to whole seconds (toward the past, so `1969-12-31T23:59:59.500Z` is `-1`) before any arithmetic. A duration is `floor(end) - floor(start)`, clamped at 0. Expected instants never carry a fraction.
- **Half-open intervals** `[start, end)`. A day `d` in timezone `z` runs from the start of `d` to the start of `d + 1`.
- **Start of day** is the first instant whose local date is `d`: local midnight, or the first instant after a skipped midnight (01:00 in America/Santiago on 2026-09-06). DST days are 23 h or 25 h; nothing assumes 86 400 s.
- **Day keys** `YYYY-MM-DD`, computed in the session's timezone for day rows and in the user's timezone for periods.
- **Day rows.** A session `[startedAt, endedAt)`, or `[startedAt, now)` while running (`endedAt` null), gives one row per local day with more than 0 seconds; rows sum to the session's duration. `now` only bounds a running session; `now` at or before the start gives no rows. `localStart`/`localEnd` are wall-clock `HH:MM:SS`; a row that ends at its day's end shows the day's last second (`23:59:59`, the local time of `end - 1 s`), a row that starts at its day's start shows `00:00:00` (or `01:00:00` on a skipped midnight).
- **Periods.** A week is the 7 days starting on the latest `weekStart` weekday on or before the day; month and year are calendar ones. IDs: day `2026-10-24`, week `W2026-10-19`, month `2026-10`, year `2026`. `weekStart` is ignored for other kinds. A period total sums the row seconds whose day key is one of the period's day keys.
- **Display.** Clock `H:MM:SS`, hours unbounded; summary whole hours and minutes, rounded down; negative input shows as 0.

**Invalid instants are shared** (`invalid-instant.json`, expected `{ "error": "malformed-instant" }`). Instants are the one input both sides parse from text with different libraries, and lenient ISO parsers differ (a leap second `23:59:60Z`, a space for `T`, six-digit years, more than nine fractional digits), so what each side accepts must be pinned in one list. The contract test checks that the contract's `Instant` rejects every case too. Its input is any string, not an `Instant`.

Other invalid input (unknown timezone, malformed day key, non-integer or out-of-range seconds) stays in each implementation's own unit tests. Day keys are one fixed `YYYY-MM-DD` pattern plus a calendar check, timezone names are looked up in the tz database, and seconds arrive as typed numbers, so there is no lenient grammar for the two sides to disagree on; and the errors are each language's own types (a TS error class, a Rust enum), which a shared file would only describe loosely.

## How expected values were made

Expected values are derived by hand, then checked against an independent third implementation: a short Python script on `zoneinfo` with the `tzdata` package (2026e), written from ADR-0004 without reading either implementation. Python is not part of the repo. Never generate expected values from the TypeScript or Rust code under test; a case they disagree on is settled by hand and the third implementation.

Fixtures use DST transitions whose rules have been stable for years (Los Angeles, Auckland, Santiago), because the server reads Node's ICU tz data and the core jiff's bundled one, and their releases can differ (ADR-0004, Consequences).

## Runners

- **Server:** `import { loadTimeFixtures } from '@pulse/contract/fixtures/time'` (resolves to the sources through the `@pulse/source` condition in tests). It validates every file against its schema and returns typed cases keyed by file name.
- **Core:** reads the JSON files from `CARGO_MANIFEST_DIR/../../packages/contract/fixtures/time`.
- **Contract:** `src/fixtures/time.spec.ts` validates the shape of every file and the coverage of the T0.5 zones and DST days.

Every runner reads the whole directory and **fails on a file or case kind it does not handle**: an unknown file, a missing file or an unknown field is an error, never a skipped test. Adding a file means adding its schema in `src/fixtures/time.ts` and a runner in both implementations in the same change.
