import { Temporal } from 'temporal-polyfill';

/**
 * The IANA spelling of a timezone name (`asia/dhaka` -> `Asia/Dhaka`), or undefined when it is not
 * a named zone. Intl and Temporal accept any letter case, but the other implementations of the
 * time math (the Rust core) may not, so the stored setting is always the canonical spelling.
 * Offsets such as `+02:00` are refused: Pulse stores IANA names only (R-09).
 */
export function canonicalTimeZone(name: string): string | undefined {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(name)) return undefined;
  try {
    return new Temporal.ZonedDateTime(0n, name).timeZoneId;
  } catch {
    return undefined;
  }
}
