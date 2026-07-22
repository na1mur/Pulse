export function getLocalDateString(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value || "1970";
    const month = parts.find((p) => p.type === "month")?.value || "01";
    const day = parts.find((p) => p.type === "day")?.value || "01";
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date for timezone:", timeZone, error);
    return date.toISOString().split("T")[0] || "";
  }
}

function findZonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  let guess = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 5; i++) {
    const parts = formatter.formatToParts(new Date(guess));
    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
    const fy = get("year");
    const fm = get("month");
    const fd = get("day");
    const fh = get("hour");
    const fmin = get("minute");
    const fs = get("second");
    const target = Date.UTC(year, month - 1, day, hour, minute, second);
    const actual = Date.UTC(fy, fm - 1, fd, fh === 24 ? 0 : fh, fmin, fs);
    const diff = actual - target;
    if (diff === 0) break;
    guess -= diff;
  }

  return new Date(guess);
}

export function getPastLocalDateKeys(dateKey: string, count: number): string[] {
  const dateKeys: string[] = [];
  try {
    const date = new Date(`${dateKey}T00:00:00Z`);
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(date.getTime());
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().split("T")[0];
      if (iso) dateKeys.push(iso);
    }
  } catch (err) {
    console.error("Error generating local date keys:", err);
  }
  return dateKeys;
}

export function getLocalDayRange(
  dateKey: string,
  timeZone: string,
): { start: Date; end: Date } {
  try {
    const [yearStr, monthStr, dayStr] = dateKey.split("-");
    const year = parseInt(yearStr!, 10);
    const month = parseInt(monthStr!, 10);
    const day = parseInt(dayStr!, 10);
    const tz = timeZone || "UTC";

    const start = findZonedTime(year, month, day, 0, 0, 0, tz);
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const end = new Date(
      findZonedTime(
        nextDay.getUTCFullYear(),
        nextDay.getUTCMonth() + 1,
        nextDay.getUTCDate(),
        0,
        0,
        0,
        tz,
      ).getTime() - 1,
    );
    return { start, end };
  } catch (error) {
    console.error("Error calculating day range:", dateKey, timeZone, error);
    const start = new Date(`${dateKey}T00:00:00.000Z`);
    const end = new Date(`${dateKey}T23:59:59.999Z`);
    return { start, end };
  }
}

export function getWeekdayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

export function getCurrentWeekDateKeys(todayKey: string): string[] {
  const today = new Date(`${todayKey}T12:00:00Z`);
  const dayOfWeek = today.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today.getTime());
  monday.setUTCDate(today.getUTCDate() + mondayOffset);

  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime());
    d.setUTCDate(monday.getUTCDate() + i);
    const iso = d.toISOString().split("T")[0];
    if (iso) keys.push(iso);
  }
  return keys;
}

export function getMonthDateKeys(todayKey: string): string[] {
  const [yearStr, monthStr] = todayKey.split("-");
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const daysInMonth = new Date(year, month, 0).getDate();
  const keys: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    keys.push(
      `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`,
    );
  }
  return keys;
}
