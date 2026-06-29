import type { SessionRange } from "@repo/types";

export const queryKeys = {
  todayStats: ["todayStats"] as const,
  statsSummary: ["statsSummary"] as const,
  weekStats: ["weekStats"] as const,
  weeklyTrend: ["weeklyTrend"] as const,
  todaySessions: ["todaySessions"] as const,
  sessions: (range: SessionRange) => ["sessions", range] as const,
  settings: ["settings"] as const,
};

export const pulseQueryKeys = [
  queryKeys.todayStats,
  queryKeys.statsSummary,
  queryKeys.weekStats,
  queryKeys.weeklyTrend,
  queryKeys.todaySessions,
  queryKeys.settings,
] as const;
