// R-18: clocks show H:MM:SS with unbounded hours; summaries round down to the whole minute so a
// goal is never shown as reached early. Elapsed time is never shown negative.
import { assertSeconds } from './instant.js';

function shownSeconds(seconds: number): number {
  assertSeconds(seconds);
  return Math.max(0, seconds);
}

const twoDigits = (value: number): string => String(value).padStart(2, '0');

export function formatClock(seconds: number): string {
  const shown = shownSeconds(seconds);
  const hours = Math.floor(shown / 3600);
  return `${hours}:${twoDigits(Math.floor(shown / 60) % 60)}:${twoDigits(shown % 60)}`;
}

export function summaryParts(seconds: number): { hours: number; minutes: number } {
  const shown = shownSeconds(seconds);
  return { hours: Math.floor(shown / 3600), minutes: Math.floor(shown / 60) % 60 };
}
