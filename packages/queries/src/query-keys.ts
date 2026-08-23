import type { SessionRange, TagStatsRange } from "@repo/types";

export const queryKeys = {
  todayStats: ["todayStats"] as const,
  statsSummary: ["statsSummary"] as const,
  weekStats: ["weekStats"] as const,
  weeklyTrend: ["weeklyTrend"] as const,
  todaySessions: ["todaySessions"] as const,
  sessions: (range: SessionRange) => ["sessions", range] as const,
  settings: ["settings"] as const,
  tags: ["tags"] as const,
  statsByTag: ["statsByTag"] as const,
  statsByTagRange: (range: TagStatsRange) => ["statsByTag", range] as const,
};

export const pulseQueryKeys = [
  queryKeys.todayStats,
  queryKeys.statsSummary,
  queryKeys.weekStats,
  queryKeys.weeklyTrend,
  queryKeys.todaySessions,
  queryKeys.settings,
  queryKeys.tags,
  queryKeys.statsByTag,
] as const;
