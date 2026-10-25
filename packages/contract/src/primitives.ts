// Wire primitives shared by every schema (spec 7.1 conventions, section 6, Appendix A limits).
// Rule for the whole package: no defaults and no transforms in body or response schemas, so the
// parsed value equals the sent value and the generated JSON Schema describes both directions.
// Query values are the exception: they arrive as URL text and are parsed into their real type.
import { z } from 'zod';

/** Spec 6: opaque IDs that clients can generate (time-ordered UUID v7 recommended). */
export const Id = z.uuid().describe('UUID; clients generate v7 IDs for what they create.');

/** Spec 7.1: instants are ISO-8601 UTC; the `Z` suffix is required, offsets are rejected. */
export const Instant = z.iso.datetime().describe('ISO-8601 UTC instant ending in Z.');

/** Spec 7.1: days are `YYYY-MM-DD` (a local day in the relevant timezone, R-10). */
export const DayKey = z.iso.date().describe('Local day, YYYY-MM-DD.');

const day = String.raw`\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])`;
const month = String.raw`\d{4}-(0[1-9]|1[0-2])`;
/** R-14: period IDs of the goal periods: day `2026-10-24`, week `W2026-10-19`, month `2026-10`. */
export const PeriodId = z
  .string()
  .regex(new RegExp(`^(${day}|W${day}|${month})$`))
  .describe('R-14 period ID: day 2026-10-24, week W2026-10-19 (its first day), month 2026-10.');

/** Spec 7.1: durations are integer seconds. */
export const Seconds = z.int().min(0).describe('Duration in whole seconds.');

/** R-19: minute precision; Appendix A "Other field limits": 1-44 640 (the longest month). */
export const GoalMinutes = z
  .int()
  .min(1)
  .max(31 * 24 * 60)
  .describe('Goal in whole minutes.');

/** R-35: per-user revision counter. */
export const Revision = z.int().min(0).describe('Per-user revision (R-35).');

/** Spec 7.1: credits are decimals with 2 places, sent as text so no binary float rounds them. */
export const CreditAmount = z
  .string()
  .regex(/^-?(0|[1-9]\d*)\.\d{2}$/)
  .describe('Credits as a decimal string with exactly 2 places, e.g. "-12.50".');

/** CRED-05: a credit rate in credits per hour; never negative (ADR-0003, R-42, R-43). */
export const CreditRate = z
  .string()
  .regex(/^(0|[1-9]\d*)\.\d{2}$/)
  .describe(
    'Credits per hour as a non-negative decimal string with exactly 2 places, e.g. "10.00".',
  );

function isKnownTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** R-12, R-15: an IANA timezone name. The pattern keeps offsets such as `+02:00` out. */
export const TimeZoneName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/)
  .refine(isKnownTimeZone, 'Unknown IANA timezone')
  .describe('IANA timezone name, e.g. Asia/Dhaka.');

/** Appendix A: title <= 200 characters. */
export const SessionTitle = z.string().max(200);
/** Appendix A: summary <= 2000 characters. */
export const SessionSummary = z.string().max(2000);
/** R-29: tag names are trimmed, then 1-40 characters (whitespace collapsing is the server's job). */
export const TagName = z.string().trim().min(1).max(40);

/** Opaque pagination cursor issued by the server. */
export const Cursor = z.string().min(1).max(512).describe('Opaque cursor from a previous page.');

/** A non-negative integer sent as URL text (query strings carry no types). */
export const QueryInteger = z
  .string()
  .regex(/^(0|[1-9]\d{0,14})$/)
  .transform(Number)
  .pipe(z.int().min(0));

/**
 * R-34 / spec 7.1: every command carries its client-generated ID and, when replayed from the
 * outbox, the time it occurred on the device. Spread into each command body.
 */
export const commandFields = {
  commandId: Id.describe('Client-generated idempotency key (R-34).'),
  occurredAt: Instant.optional().describe(
    'When the command was created on the device; sent when replayed from the outbox (R-03).',
  ),
};

/** Spec 7.1: lists use cursor pagination. `nextCursor` is null on the last page. */
export function page<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), nextCursor: Cursor.nullable() });
}
