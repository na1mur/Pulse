export interface User {
  id: string;
  email: string;
  name: string;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  monthlyTargetMinutes: number;
  timezone: string;
}

export interface UserSettings {
  email: string;
  name: string;
  timezone: string;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  monthlyTargetMinutes: number;
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
  id?: string;
  _id?: string;
  userId: string;
  deviceId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  durationSeconds: number;
  title?: string;
  summary?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PaginatedSessionsResponse {
  sessions: WorkSession[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
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
  weeklyTargetMinutes: number;
  monthlyTargetMinutes: number;
  weeklyPercentage: number;
  monthlyPercentage: number;
  averageDailyMinutes: number;
  bestDayMinutes: number;
  bestDayDate: string | null;
  currentStreakDays: number;
  goalAchievementPercent: number;
}

export interface TimerState {
  isRunning: boolean;
  startedAt?: number; // timestamp
  elapsedBeforeCurrentRun: number; // today's total worked ms before the active segment
  lastActiveDate?: string; // local date string to detect day changes
  sessionTitle?: string;
}

/** Server-persisted timer state for cross-device reconciliation. */
export interface ActiveTimerState {
  isRunning: boolean;
  startedAt?: number;
  elapsedBeforeCurrentRun: number;
  sessionTitle?: string;
  updatedAt?: string;
  updatedByDeviceId?: string;
}

export type SessionRange = "today" | "week" | "month" | "year";

export type AppPage =
  "dashboard" | "history" | "statistics" | "goals" | "settings";

export type GoalAchievementType = "daily" | "weekly" | "monthly";

export interface GoalAchievementEvent {
  type: GoalAchievementType;
  workedMinutes: number;
  targetMinutes: number;
  periodKey: string;
}
