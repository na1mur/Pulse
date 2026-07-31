import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  DailyStatsPoint,
  PaginatedSessionsResponse,
  SessionRange,
  StatsSummary,
  TodayStats,
  UserSettings,
  WeeklyStatsPoint,
  WorkSession,
} from "@repo/types";
import { useApi } from "./api-context";
import { queryKeys } from "./query-keys";
import { mergeGoalSettingsIntoCache } from "./goal-sync";
import { syncGoalSettingsToLocal } from "./goal-local-storage";
import { settingsQueryOptions } from "./settings-query";

export { queryKeys, pulseQueryKeys } from "./query-keys";
export { ApiProvider, useApi } from "./api-context";
export {
  applyRemoteGoalUpdate,
  mergeGoalSettingsIntoCache,
  type GoalTargetFields,
} from "./goal-sync";
export {
  useGoalState,
  GOAL_DEFAULTS,
  readStoredGoalHours,
  type GoalStorage,
} from "./useGoalState";
export {
  registerGoalStorage,
  syncGoalSettingsToLocal,
} from "./goal-local-storage";
export { bootstrapUserSession, deactivateUserSession } from "./user-session";
export {
  activeTimerToTimerState,
  fetchActiveTimer,
  reconcileActiveTimer,
} from "./active-timer";
export { useAutoSkipCountdown } from "./use-auto-skip-countdown";
export {
  subscribeGoalAchievements,
  emitGoalAchievement,
  resetGoalAchievementDedup,
} from "./goal-achievements";

export function useTodayStats() {
  const api = useApi();
  return useQuery<TodayStats>({
    queryKey: queryKeys.todayStats,
    queryFn: async () => (await api.get("/stats/today")).data,
  });
}

export function useStatsSummary() {
  const api = useApi();
  return useQuery<StatsSummary>({
    queryKey: queryKeys.statsSummary,
    queryFn: async () => (await api.get("/stats/summary")).data,
  });
}

export function useWeekStats() {
  const api = useApi();
  return useQuery<DailyStatsPoint[]>({
    queryKey: queryKeys.weekStats,
    queryFn: async () => (await api.get("/stats/week")).data,
  });
}

export function useWeeklyTrend() {
  const api = useApi();
  return useQuery<WeeklyStatsPoint[]>({
    queryKey: queryKeys.weeklyTrend,
    queryFn: async () => (await api.get("/stats/weeks?count=4")).data,
  });
}

export function useTodaySessions() {
  const api = useApi();
  return useQuery<WorkSession[]>({
    queryKey: queryKeys.todaySessions,
    queryFn: async () => (await api.get("/sessions/today")).data,
  });
}

function normalizeSessionsPage(
  data: PaginatedSessionsResponse | WorkSession[],
  page: number,
  limit: number,
): PaginatedSessionsResponse {
  if (Array.isArray(data)) {
    return {
      sessions: data,
      total: data.length,
      page: 1,
      limit,
      hasMore: false,
    };
  }

  return {
    sessions: data.sessions ?? [],
    total: data.total ?? data.sessions?.length ?? 0,
    page: data.page ?? page,
    limit: data.limit ?? limit,
    hasMore: data.hasMore ?? false,
  };
}

export function flattenSessionPages(
  pages: PaginatedSessionsResponse[] | undefined,
): WorkSession[] {
  if (!pages?.length) {
    return [];
  }

  return pages.flatMap((page) => {
    if (Array.isArray(page)) {
      return page;
    }
    return page.sessions ?? [];
  });
}

export function useSessions(range: SessionRange, limit = 20) {
  const api = useApi();
  return useInfiniteQuery<PaginatedSessionsResponse>({
    queryKey: queryKeys.sessions(range),
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1;
      const response = await api.get("/sessions", {
        params: { range, page, limit },
      });
      return normalizeSessionsPage(response.data, page, limit);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
}

export function useUserSettings() {
  const api = useApi();
  return useQuery<UserSettings>(settingsQueryOptions(api));
}

export function useUpdateDailyTarget() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dailyTargetMinutes: number) =>
      (await api.patch("/settings/daily-target", { dailyTargetMinutes }))
        .data as UserSettings,
    onSuccess: (data) => {
      mergeGoalSettingsIntoCache(queryClient, data, data);
      void syncGoalSettingsToLocal(data);
      queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
      queryClient.invalidateQueries({ queryKey: queryKeys.weekStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
    },
  });
}

export function useUpdateWeeklyTarget() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (weeklyTargetMinutes: number) =>
      (await api.patch("/settings/weekly-target", { weeklyTargetMinutes }))
        .data as UserSettings,
    onSuccess: (data) => {
      mergeGoalSettingsIntoCache(queryClient, data, data);
      void syncGoalSettingsToLocal(data);
      queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
    },
  });
}

export function useUpdateMonthlyTarget() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (monthlyTargetMinutes: number) =>
      (await api.patch("/settings/monthly-target", { monthlyTargetMinutes }))
        .data as UserSettings,
    onSuccess: (data) => {
      mergeGoalSettingsIntoCache(queryClient, data, data);
      void syncGoalSettingsToLocal(data);
      queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
    },
  });
}

export function useUpdateTimezone() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (timezone: string) =>
      (await api.patch("/settings/timezone", { timezone })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.todaySessions });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
      queryClient.invalidateQueries({ queryKey: queryKeys.weekStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
    },
  });
}
