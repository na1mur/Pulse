import type { GoalAchievementEvent } from "@repo/types";

type GoalAchievementListener = (event: GoalAchievementEvent) => void;

const listeners = new Set<GoalAchievementListener>();
const seenKeys = new Set<string>();

function achievementKey(event: GoalAchievementEvent): string {
  return `${event.type}:${event.periodKey}`;
}

export function subscribeGoalAchievements(
  listener: GoalAchievementListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitGoalAchievement(event: GoalAchievementEvent): void {
  const key = achievementKey(event);
  if (seenKeys.has(key)) {
    return;
  }
  seenKeys.add(key);
  for (const listener of listeners) {
    listener(event);
  }
}

export function resetGoalAchievementDedup(): void {
  seenKeys.clear();
}
