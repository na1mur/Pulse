import type { QueryClient } from "@tanstack/react-query";
import type { UserSettings } from "@repo/types";
import { syncGoalSettingsToLocal } from "./goal-local-storage";
import { queryKeys } from "./query-keys";

export type GoalTargetFields = Pick<
  UserSettings,
  "dailyTargetMinutes" | "weeklyTargetMinutes" | "monthlyTargetMinutes"
>;

export function mergeGoalSettingsIntoCache(
  queryClient: QueryClient,
  goals: GoalTargetFields,
  fullSettings?: UserSettings,
) {
  queryClient.setQueryData<UserSettings>(queryKeys.settings, (old) => {
    if (old) {
      return { ...old, ...goals };
    }
    if (fullSettings) {
      return fullSettings;
    }
    return {
      email: "",
      name: "",
      timezone: "UTC",
      ...goals,
    };
  });
}

export function applyRemoteGoalUpdate(
  queryClient: QueryClient,
  goals: GoalTargetFields,
) {
  mergeGoalSettingsIntoCache(queryClient, goals);
  void syncGoalSettingsToLocal(goals);
  void queryClient.refetchQueries({ queryKey: queryKeys.settings });
  queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
  queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
  queryClient.invalidateQueries({ queryKey: queryKeys.weekStats });
  queryClient.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
}
