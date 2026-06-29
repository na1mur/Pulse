import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserSettings } from "@repo/types";
import { useApi } from "./api-context";
import { settingsQueryOptions } from "./settings-query";

export const GOAL_DEFAULTS = {
  dailyHours: 8,
  weeklyHours: 40,
  monthlyHours: 160,
} as const;

export interface GoalStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
}

function syncFromSettings(
  settings: UserSettings,
  storage: GoalStorage,
  setters: {
    setGoalEnabled: (v: boolean) => void;
    setDailyGoalHours: (v: number) => void;
    setWeeklyGoalEnabled: (v: boolean) => void;
    setWeeklyGoalHours: (v: number) => void;
    setMonthlyGoalEnabled: (v: boolean) => void;
    setMonthlyGoalHours: (v: number) => void;
  },
) {
  const dailyHours = Math.round(settings.dailyTargetMinutes / 60);
  setters.setGoalEnabled(settings.dailyTargetMinutes > 0);
  if (settings.dailyTargetMinutes > 0) {
    const hours = dailyHours || GOAL_DEFAULTS.dailyHours;
    setters.setDailyGoalHours(hours);
    void Promise.resolve(
      storage.setItem("pulse-last-goal-hours", String(hours)),
    );
  }

  const weeklyHours = Math.round(settings.weeklyTargetMinutes / 60);
  setters.setWeeklyGoalEnabled(settings.weeklyTargetMinutes > 0);
  if (settings.weeklyTargetMinutes > 0) {
    const hours = weeklyHours || GOAL_DEFAULTS.weeklyHours;
    setters.setWeeklyGoalHours(hours);
    void Promise.resolve(
      storage.setItem("pulse-last-weekly-goal-hours", String(hours)),
    );
  }

  const monthlyHours = Math.round(settings.monthlyTargetMinutes / 60);
  setters.setMonthlyGoalEnabled(settings.monthlyTargetMinutes > 0);
  if (settings.monthlyTargetMinutes > 0) {
    const hours = monthlyHours || GOAL_DEFAULTS.monthlyHours;
    setters.setMonthlyGoalHours(hours);
    void Promise.resolve(
      storage.setItem("pulse-last-monthly-goal-hours", String(hours)),
    );
  }
}

export function useGoalState(storage: GoalStorage) {
  const api = useApi();
  const { data: settings } = useQuery<UserSettings>(settingsQueryOptions(api));
  const [goalEnabled, setGoalEnabled] = useState(false);
  const [dailyGoalHours, setDailyGoalHours] = useState<number>(
    GOAL_DEFAULTS.dailyHours,
  );
  const [weeklyGoalEnabled, setWeeklyGoalEnabled] = useState(false);
  const [weeklyGoalHours, setWeeklyGoalHours] = useState<number>(
    GOAL_DEFAULTS.weeklyHours,
  );
  const [monthlyGoalEnabled, setMonthlyGoalEnabled] = useState(false);
  const [monthlyGoalHours, setMonthlyGoalHours] = useState<number>(
    GOAL_DEFAULTS.monthlyHours,
  );

  useEffect(() => {
    if (settings) {
      syncFromSettings(settings, storage, {
        setGoalEnabled,
        setDailyGoalHours,
        setWeeklyGoalEnabled,
        setWeeklyGoalHours,
        setMonthlyGoalEnabled,
        setMonthlyGoalHours,
      });
    }
  }, [settings, storage]);

  return {
    goalEnabled,
    setGoalEnabled,
    dailyGoalHours,
    setDailyGoalHours,
    weeklyGoalEnabled,
    setWeeklyGoalEnabled,
    weeklyGoalHours,
    setWeeklyGoalHours,
    monthlyGoalEnabled,
    setMonthlyGoalEnabled,
    monthlyGoalHours,
    setMonthlyGoalHours,
  };
}
