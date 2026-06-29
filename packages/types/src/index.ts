export interface User {
  id: string;
  email: string;
  dailyTargetMinutes: number;
  timezone: string;
}

export interface UserSettings {
  email: string;
  timezone: string;
  dailyTargetMinutes: number;
}

export interface Session {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  deviceId: string;
  createdAt: Date;
}

export interface WorkSession {
  id: string;
  userId: string;
  deviceId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  createdAt: string;
  updatedAt?: string;
}

export interface DailyStats {
  userId: string;
  date: string; // YYYY-MM-DD
  workedMinutes: number;
  goalMinutes: number;
  updatedAt: Date;
}

export interface TodayStats {
  workedMinutes: number;
  goalMinutes: number;
  percentage: number;
  date: string;
}

export interface DailyStatsPoint {
  date: string;
  workedMinutes: number;
  goalMinutes: number;
  day?: string;
}

export interface WeeklyStatsPoint {
  week: string;
  hours: number;
  workedMinutes: number;
}

export interface StatsSummary {
  totalWorkedMinutes: number;
  weeklyWorkedMinutes: number;
  monthlyWorkedMinutes: number;
  averageDailyMinutes: number;
  bestDayMinutes: number;
  bestDayDate: string | null;
  currentStreakDays: number;
  goalAchievementPercent: number;
}

export interface TimerState {
  isRunning: boolean;
  startedAt?: number; // timestamp
  elapsedBeforeCurrentRun: number; // in milliseconds
  lastActiveDate?: string; // local date string to detect day changes
}

export type SessionRange = "today" | "week" | "month" | "year";

export type AppPage =
  | "dashboard"
  | "history"
  | "statistics"
  | "goals"
  | "settings";
