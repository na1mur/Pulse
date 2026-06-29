import type { GoalAchievementEvent } from "@repo/types";
import { DailyStats } from "../models/DailyStats";
import { getMonthDateKeys, getPastLocalDateKeys } from "./dates";

interface GoalTargets {
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  monthlyTargetMinutes: number;
}

function crossedThreshold(
  before: number,
  after: number,
  target: number,
): boolean {
  return target > 0 && before < target && after >= target;
}

export async function detectGoalAchievements(params: {
  userId: string;
  user: GoalTargets;
  dateKey: string;
  previousDailyWorked: number;
  newDailyWorked: number;
  durationMinutes: number;
}): Promise<GoalAchievementEvent[]> {
  const {
    userId,
    user,
    dateKey,
    previousDailyWorked,
    newDailyWorked,
    durationMinutes,
  } = params;
  const achievements: GoalAchievementEvent[] = [];

  if (
    crossedThreshold(
      previousDailyWorked,
      newDailyWorked,
      user.dailyTargetMinutes,
    )
  ) {
    achievements.push({
      type: "daily",
      workedMinutes: newDailyWorked,
      targetMinutes: user.dailyTargetMinutes,
      periodKey: dateKey,
    });
  }

  if (user.weeklyTargetMinutes > 0) {
    const weekKeys = getPastLocalDateKeys(dateKey, 7);
    const stats = await DailyStats.find({ userId, date: { $in: weekKeys } });
    const weeklyAfter = stats.reduce(
      (sum, stat) => sum + stat.workedMinutes,
      0,
    );
    const weeklyBefore = weeklyAfter - durationMinutes;
    if (crossedThreshold(weeklyBefore, weeklyAfter, user.weeklyTargetMinutes)) {
      achievements.push({
        type: "weekly",
        workedMinutes: weeklyAfter,
        targetMinutes: user.weeklyTargetMinutes,
        periodKey: dateKey,
      });
    }
  }

  if (user.monthlyTargetMinutes > 0) {
    const monthKeys = getMonthDateKeys(dateKey);
    const stats = await DailyStats.find({ userId, date: { $in: monthKeys } });
    const monthlyAfter = stats.reduce(
      (sum, stat) => sum + stat.workedMinutes,
      0,
    );
    const monthlyBefore = monthlyAfter - durationMinutes;
    if (
      crossedThreshold(monthlyBefore, monthlyAfter, user.monthlyTargetMinutes)
    ) {
      const [year, month] = dateKey.split("-");
      achievements.push({
        type: "monthly",
        workedMinutes: monthlyAfter,
        targetMinutes: user.monthlyTargetMinutes,
        periodKey: `${year}-${month}`,
      });
    }
  }

  return achievements;
}
