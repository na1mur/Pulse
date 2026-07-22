// Helper to calculate timer duration
export function calculateDuration(
  startedAt: number,
  elapsedBeforeCurrentRun: number,
): number {
  return elapsedBeforeCurrentRun + (Date.now() - startedAt);
}

// Format milliseconds into HH:MM:SS
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number) => String(num).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatMinutes(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function getSessionDurationSeconds(session: {
  durationSeconds?: number;
  durationMinutes: number;
}): number {
  if (session.durationSeconds != null) {
    return session.durationSeconds;
  }
  return Math.round(session.durationMinutes * 60);
}

export function formatDurationSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatHoursDecimal(hours: number): string {
  return formatMinutes(Math.round(hours * 60));
}

export function formatSessionClock(
  iso: string,
  timeZone: string = "UTC",
): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }
}

export function getLocalDateKeyFromIso(
  iso: string,
  timeZone: string = "UTC",
): string {
  return getLocalDateKey(new Date(iso), timeZone);
}

function getLocalDateKey(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value ?? "1970";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${year}-${month}-${day}`;
  } catch {
    return date.toISOString().split("T")[0] ?? "";
  }
}

export function formatRelativeDate(
  dateKey: string,
  timeZone: string = "UTC",
): string {
  const todayKey = getLocalDateKey(new Date(), timeZone);
  if (dateKey === todayKey) {
    return "Today";
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getLocalDateKey(yesterday, timeZone);
  if (dateKey === yesterdayKey) {
    return "Yesterday";
  }

  try {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year!, month! - 1, day);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return dateKey;
  }
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function getGoalAchievementLabel(type: GoalAchievementType): string {
  switch (type) {
    case "daily":
      return "Daily goal reached!";
    case "weekly":
      return "Weekly goal reached!";
    case "monthly":
      return "Monthly goal reached!";
  }
}

export function getGoalAchievementMessage(
  type: GoalAchievementType,
  workedMinutes: number,
): string {
  const worked = formatMinutes(workedMinutes);
  switch (type) {
    case "daily":
      return `You've logged ${worked} today. Great work!`;
    case "weekly":
      return `You've logged ${worked} this week. Keep it up!`;
    case "monthly":
      return `You've logged ${worked} this month. Amazing progress!`;
  }
}

import type { GoalAchievementType } from "@repo/types";
