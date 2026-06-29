import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  DailyStatsPoint,
  SessionRange,
  StatsSummary,
  TodayStats,
  UserSettings,
  WeeklyStatsPoint,
  WorkSession,
} from "@repo/types";
import { api } from "@/utils/api";

export const queryKeys = {
  todayStats: ["todayStats"] as const,
  statsSummary: ["statsSummary"] as const,
  weekStats: ["weekStats"] as const,
  weeklyTrend: ["weeklyTrend"] as const,
  todaySessions: ["todaySessions"] as const,
  sessions: (range: SessionRange) => ["sessions", range] as const,
  settings: ["settings"] as const,
};

export function useTodayStats() {
  return useQuery<TodayStats>({
    queryKey: queryKeys.todayStats,
    queryFn: async () => (await api.get("/stats/today")).data,
  });
}

export function useStatsSummary() {
  return useQuery<StatsSummary>({
    queryKey: queryKeys.statsSummary,
    queryFn: async () => (await api.get("/stats/summary")).data,
  });
}

export function useWeekStats() {
  return useQuery<DailyStatsPoint[]>({
    queryKey: queryKeys.weekStats,
    queryFn: async () => (await api.get("/stats/week")).data,
  });
}

export function useWeeklyTrend() {
  return useQuery<WeeklyStatsPoint[]>({
    queryKey: queryKeys.weeklyTrend,
    queryFn: async () => (await api.get("/stats/weeks?count=4")).data,
  });
}

export function useTodaySessions() {
  return useQuery<WorkSession[]>({
    queryKey: queryKeys.todaySessions,
    queryFn: async () => (await api.get("/sessions/today")).data,
  });
}

export function useSessions(range: SessionRange) {
  return useQuery<WorkSession[]>({
    queryKey: queryKeys.sessions(range),
    queryFn: async () =>
      (await api.get("/sessions", { params: { range } })).data,
  });
}

export function useUserSettings() {
  return useQuery<UserSettings>({
    queryKey: queryKeys.settings,
    queryFn: async () => (await api.get("/settings")).data,
  });
}

export function useUpdateDailyTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dailyTargetMinutes: number) =>
      (await api.patch("/settings/daily-target", { dailyTargetMinutes })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
      queryClient.invalidateQueries({ queryKey: queryKeys.weekStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export function useUpdateTimezone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (timezone: string) =>
      (await api.patch("/settings/timezone", { timezone })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions("week") });
    },
  });
}

export function invalidateAllPulseQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries();
}
