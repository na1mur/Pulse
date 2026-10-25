// The server's one time-math module (ADR-0004, R-10..R-18): nothing else computes day keys or
// period bounds. Pure functions on whole epoch seconds and YYYY-MM-DD day keys; "now" is always
// an argument (read it from the injected Clock). Kept identical to pulse-core by the shared
// fixtures in packages/contract/fixtures/time (D-19).
export { durationSeconds, formatInstant, formatInstantMillis, parseInstant } from './instant.js';
export { dayBounds, dayKey, dayRows, type Bounds, type DayRow, type SessionSpan } from './days.js';
export {
  period,
  periodId,
  periodTotal,
  type Period,
  type PeriodKind,
  type WeekStart,
} from './periods.js';
export { formatClock, summaryParts } from './display.js';
export { TimeMathError, type TimeMathErrorCode } from './time-math-error.js';
