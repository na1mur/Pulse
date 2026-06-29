import { persistGoalSettingsToLocal, type KeyValueStorage } from "@repo/api-client";
import type { UserSettings } from "@repo/types";

export interface GoalStorage extends KeyValueStorage {}

let registeredGoalStorage: GoalStorage | null = null;

export function registerGoalStorage(storage: GoalStorage | null): void {
  registeredGoalStorage = storage;
}

export function getRegisteredGoalStorage(): GoalStorage | null {
  return registeredGoalStorage;
}

export async function syncGoalSettingsToLocal(
  settings: Pick<
    UserSettings,
    "dailyTargetMinutes" | "weeklyTargetMinutes" | "monthlyTargetMinutes"
  >,
  storage?: GoalStorage,
): Promise<void> {
  const target = storage ?? registeredGoalStorage;
  if (!target) return;
  await persistGoalSettingsToLocal(target, settings);
}
