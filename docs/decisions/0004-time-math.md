# ADR-0004: Time math in two languages

## Status
Proposed (lead, 2026-10-25; written in T0.5, for the owner to accept)

## Date
2026-10-25

## Context
R-10..R-18 define days, periods, day attribution across midnight, period IDs and display; D-19 keeps the TypeScript server and the Rust core identical through one shared fixture suite in `packages/contract/fixtures/`. The spec names `jiff` with an embedded timezone database for the core (section 11) but no library for the server. Contract instants (`Instant`, spec 7.1) are ISO-8601 UTC and may carry fractional seconds, while R-16 asks for integer seconds; nothing yet says how the two meet, where a day starts when local midnight does not exist, or what a history row shows as its end.

## Decision

**Libraries.** The core uses `jiff` with its bundled tzdb on every target (`tzdb-bundle-always`, looked up through the bundled database by name), so Windows and Android give the same answers without the OS database. The server uses the TC39 **Temporal** API through `temporal-polyfill`, pinned; jiff is modelled on Temporal (same `compatible` disambiguation, same start-of-day rule), so both sides share one semantics. When the pinned Node version ships Temporal unflagged, the polyfill import is removed and nothing else changes. Each side has one time-math module (`apps/server/src/domain/time/`, `crates/core/src/domain/time.rs` or folder); nothing else computes day keys or period bounds.

**Whole seconds.** Every instant entering time math is truncated to whole seconds (floor, toward the past). All math runs on integer seconds since the Unix epoch; a duration is `floor(end) - floor(start)`, clamped at 0 (so `.900` to `1.100` is 1 s, not 0). Local midnights fall on whole seconds, so a session's per-day rows always sum to its total.

**Intervals and days.** Intervals are half-open, `[start, end)`. Day `d` in timezone `z` runs from the start of `d` to the start of `d + 1`, where the start of a day is the first instant whose local date is `d` (01:00 on a day whose midnight is skipped, such as America/Santiago's spring change; the transition instant when a gap starts before midnight; a day a zone skips entirely has no length). This is Temporal's `startOfDay`; the core implements it itself because jiff's `start_of_day` resolves gaps with `compatible`. DST days are therefore 23 h or 25 h long; nothing assumes 86 400 s.

**Day rows (R-11).** A session `[startedAt, endedAt or now)` in its own timezone (R-09) becomes one row per local day it covers with more than 0 seconds: day key, start and end instants, seconds, and local display times `HH:MM:SS`. A row that ends at its day's end shows the day's last second, `23:59:59`; a row that starts at its day's start shows `00:00:00` (or the local time of the first instant, on a skipped midnight). A running session is clipped at `now`; `now` before the start gives no rows. `now` never bounds a closed session (a skewed clock does not shorten history). Rows carry no UTC offset, so the two passes of a repeated DST hour show the same local times (accepted for v1; T2.4 may add the offset).

**Periods (R-12..R-14).** A week is the 7 days starting on the latest day on or before `d` whose weekday is the user's week start; month and year are calendar ones. IDs: `2026-10-24`, `W2026-10-19`, `2026-10`, `2026`. A period's total is the sum of the row seconds whose day key belongs to the period, where rows are keyed in each session's timezone and the period's day keys come from the user's timezone setting (R-11, R-12).

**Display (R-18).** Clock `H:MM:SS` with unbounded hours; summary as whole hours and minutes, rounded down; both clamp negatives to 0. Locale-specific wording stays in the UIs.

**Clock.** Time is read only through an injected clock: the core's `ports::Clock` (system adapter plus a settable fake for tests) and a server `Clock` provider used by everything that needs "now", the `Pulse-Server-Time` header included. Domain functions take `now` as an argument.

**Fixtures.** One JSON file per function group in `packages/contract/fixtures/time/`, each `{ description, rules, cases: [{ name, input, expected }] }`, described in `packages/contract/fixtures/README.md`. Expected values are derived by hand and checked with a third implementation (Python `zoneinfo`), never produced by either implementation under test. Both test runners read the whole directory and fail on a file or case kind they do not handle, so a new fixture cannot be skipped silently.

## Alternatives considered
- **Luxon on the server:** mature and Intl-based, but its own API and edge-case rules differ from jiff's, so fixtures would be the only thing holding them together; rejected for Temporal's shared semantics.
- **date-fns-tz or hand-written `Intl.DateTimeFormat` offset lookups:** small, but day starts on skipped midnights and DST arithmetic would be ours to get right; rejected.
- **Millisecond math:** keeps sub-second precision nobody displays and lets per-day rows disagree with the total by a fraction; rejected for R-16.
- **Compiling `pulse-core` as a Node addon** (one implementation): D-19 keeps it as the fallback if the two drift.

## Consequences
- The server's tz data comes from Node's ICU, the core's from jiff's bundled tzdb; their tzdb releases can differ. At T0.5, Node's ICU carried tzdb 2026a, the core's bundled jiff-tzdb 0.1.9 and the Python cross-check 2026e. Fixtures use only zones whose DST rules have been unchanged for years; a future rule change in a zone may briefly disagree between server and client until both update (watch item).
- The bundled tzdb adds to the core's binary size (T0.5: about 0.27 MB, all of time math about 0.46 MB, Windows x64 release; budget in T0.7).
- Later tasks (T2.4 today and history, T4.4 stats, T5.1/T5.2 credits) build on these functions and add their fixtures to the same directory.
