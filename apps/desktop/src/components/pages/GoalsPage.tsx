import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { hoursToMinutes, formatMinutes, minutesToHours } from "@repo/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  useStatsSummary,
  useUpdateDailyTarget,
  useUpdateMonthlyTarget,
  useUpdateWeeklyTarget,
  useUserSettings,
} from "@/hooks/usePulseQueries";

const WEEKLY_GOAL_DEFAULT_HOURS = 40;
const MONTHLY_GOAL_DEFAULT_HOURS = 160;
const PERIOD_GOAL_STEP_HOURS = 10;

interface GoalsPageProps {
  goalEnabled: boolean;
  onGoalEnabledChange: (enabled: boolean) => void;
  dailyGoalHours: number;
  onDailyGoalHoursChange: (hours: number) => void;
}

export function GoalsPage({
  goalEnabled,
  onGoalEnabledChange,
  dailyGoalHours,
  onDailyGoalHoursChange,
}: GoalsPageProps) {
  const { data: summary } = useStatsSummary();
  const { data: settings } = useUserSettings();
  const updateDailyTarget = useUpdateDailyTarget();
  const updateWeeklyTarget = useUpdateWeeklyTarget();
  const updateMonthlyTarget = useUpdateMonthlyTarget();

  const [weeklyGoalEnabled, setWeeklyGoalEnabled] = useState(false);
  const [monthlyGoalEnabled, setMonthlyGoalEnabled] = useState(false);
  const [weeklyGoalHours, setWeeklyGoalHours] = useState(
    WEEKLY_GOAL_DEFAULT_HOURS,
  );
  const [monthlyGoalHours, setMonthlyGoalHours] = useState(
    MONTHLY_GOAL_DEFAULT_HOURS,
  );

  useEffect(() => {
    if (settings) {
      const weeklyHours = Math.round(settings.weeklyTargetMinutes / 60);
      const monthlyHours = Math.round(settings.monthlyTargetMinutes / 60);
      setWeeklyGoalEnabled(settings.weeklyTargetMinutes > 0);
      setMonthlyGoalEnabled(settings.monthlyTargetMinutes > 0);
      if (settings.weeklyTargetMinutes > 0) {
        setWeeklyGoalHours(weeklyHours || WEEKLY_GOAL_DEFAULT_HOURS);
        localStorage.setItem(
          "pulse-last-weekly-goal-hours",
          String(weeklyHours || WEEKLY_GOAL_DEFAULT_HOURS),
        );
      }
      if (settings.monthlyTargetMinutes > 0) {
        setMonthlyGoalHours(monthlyHours || MONTHLY_GOAL_DEFAULT_HOURS);
        localStorage.setItem(
          "pulse-last-monthly-goal-hours",
          String(monthlyHours || MONTHLY_GOAL_DEFAULT_HOURS),
        );
      }
    }
  }, [settings]);

  const weeklyWorked = minutesToHours(summary?.weeklyWorkedMinutes ?? 0);
  const monthlyWorked = minutesToHours(summary?.monthlyWorkedMinutes ?? 0);
  const weeklyProgress =
    weeklyGoalEnabled && weeklyGoalHours > 0
      ? Math.round((weeklyWorked / weeklyGoalHours) * 100)
      : 0;
  const monthlyProgress =
    monthlyGoalEnabled && monthlyGoalHours > 0
      ? Math.round((monthlyWorked / monthlyGoalHours) * 100)
      : 0;
  const achievement = summary?.goalAchievementPercent ?? 0;

  const persistDailyGoal = (hours: number, enabled: boolean) => {
    const minutes = enabled ? hoursToMinutes(hours) : 0;
    updateDailyTarget.mutate(minutes);
    if (enabled && hours > 0) {
      localStorage.setItem("pulse-last-goal-hours", String(hours));
    }
  };

  const persistWeeklyGoal = (hours: number, enabled: boolean) => {
    const minutes = enabled ? hoursToMinutes(hours) : 0;
    updateWeeklyTarget.mutate(minutes);
    if (enabled && hours > 0) {
      localStorage.setItem("pulse-last-weekly-goal-hours", String(hours));
    }
  };

  const persistMonthlyGoal = (hours: number, enabled: boolean) => {
    const minutes = enabled ? hoursToMinutes(hours) : 0;
    updateMonthlyTarget.mutate(minutes);
    if (enabled && hours > 0) {
      localStorage.setItem("pulse-last-monthly-goal-hours", String(hours));
    }
  };

  const handleToggleDailyGoal = (checked: boolean) => {
    onGoalEnabledChange(checked);
    if (checked) {
      const restored = parseInt(
        localStorage.getItem("pulse-last-goal-hours") ?? "8",
        10,
      );
      onDailyGoalHoursChange(restored);
      persistDailyGoal(restored, true);
    } else {
      persistDailyGoal(dailyGoalHours, false);
    }
  };

  const handleToggleWeeklyGoal = (checked: boolean) => {
    setWeeklyGoalEnabled(checked);
    if (checked) {
      const restored = parseInt(
        localStorage.getItem("pulse-last-weekly-goal-hours") ??
          String(WEEKLY_GOAL_DEFAULT_HOURS),
        10,
      );
      setWeeklyGoalHours(restored);
      persistWeeklyGoal(restored, true);
    } else {
      persistWeeklyGoal(weeklyGoalHours, false);
    }
  };

  const handleToggleMonthlyGoal = (checked: boolean) => {
    setMonthlyGoalEnabled(checked);
    if (checked) {
      const restored = parseInt(
        localStorage.getItem("pulse-last-monthly-goal-hours") ??
          String(MONTHLY_GOAL_DEFAULT_HOURS),
        10,
      );
      setMonthlyGoalHours(restored);
      persistMonthlyGoal(restored, true);
    } else {
      persistMonthlyGoal(monthlyGoalHours, false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Checkbox
            id="goal-enabled"
            checked={goalEnabled}
            onCheckedChange={(checked) =>
              handleToggleDailyGoal(checked === true)
            }
            className="w-5 h-5"
          />
          <label
            htmlFor="goal-enabled"
            className="text-lg font-semibold text-foreground cursor-pointer"
          >
            Set Daily Goal
          </label>
        </div>

        {goalEnabled ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-6 pt-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const next = Math.max(1, dailyGoalHours - 1);
                  onDailyGoalHoursChange(next);
                  persistDailyGoal(next, true);
                }}
                className="h-12 w-12"
              >
                <Minus className="w-5 h-5" />
              </Button>
              <div className="text-6xl font-light text-primary">
                {dailyGoalHours}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const next = dailyGoalHours + 1;
                  onDailyGoalHoursChange(next);
                  persistDailyGoal(next, true);
                }}
                className="h-12 w-12"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              hours per day
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-8">
            No daily goal set. Enable to start tracking.
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="weekly-goal-enabled"
              checked={weeklyGoalEnabled}
              onCheckedChange={(checked) =>
                handleToggleWeeklyGoal(checked === true)
              }
              className="w-5 h-5"
            />
            <label
              htmlFor="weekly-goal-enabled"
              className="font-semibold text-foreground cursor-pointer"
            >
              Weekly Goal
            </label>
          </div>

          {weeklyGoalEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const next = Math.max(
                      PERIOD_GOAL_STEP_HOURS,
                      weeklyGoalHours - PERIOD_GOAL_STEP_HOURS,
                    );
                    setWeeklyGoalHours(next);
                    persistWeeklyGoal(next, true);
                  }}
                  className="h-10 w-10"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-3xl font-light text-primary">
                  {weeklyGoalHours}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const next = weeklyGoalHours + PERIOD_GOAL_STEP_HOURS;
                    setWeeklyGoalHours(next);
                    persistWeeklyGoal(next, true);
                  }}
                  className="h-10 w-10"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-center text-xs text-muted-foreground">
                hours per week
              </div>
              <Progress value={Math.min(weeklyProgress, 100)} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {formatMinutes(summary?.weeklyWorkedMinutes ?? 0)} worked
                </span>
                <span>{weeklyProgress}%</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4">
              No weekly goal set. Enable to start tracking.
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="monthly-goal-enabled"
              checked={monthlyGoalEnabled}
              onCheckedChange={(checked) =>
                handleToggleMonthlyGoal(checked === true)
              }
              className="w-5 h-5"
            />
            <label
              htmlFor="monthly-goal-enabled"
              className="font-semibold text-foreground cursor-pointer"
            >
              Monthly Goal
            </label>
          </div>

          {monthlyGoalEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const next = Math.max(
                      PERIOD_GOAL_STEP_HOURS,
                      monthlyGoalHours - PERIOD_GOAL_STEP_HOURS,
                    );
                    setMonthlyGoalHours(next);
                    persistMonthlyGoal(next, true);
                  }}
                  className="h-10 w-10"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-3xl font-light text-primary">
                  {monthlyGoalHours}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const next = monthlyGoalHours + PERIOD_GOAL_STEP_HOURS;
                    setMonthlyGoalHours(next);
                    persistMonthlyGoal(next, true);
                  }}
                  className="h-10 w-10"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-center text-xs text-muted-foreground">
                hours per month
              </div>
              <Progress
                value={Math.min(monthlyProgress, 100)}
                className="h-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {formatMinutes(summary?.monthlyWorkedMinutes ?? 0)} worked
                </span>
                <span>{monthlyProgress}%</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4">
              No monthly goal set. Enable to start tracking.
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Achievement</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-light text-primary">
                {achievement}%
              </span>
              <span className="text-xs text-muted-foreground">on track</span>
            </div>
            <Progress value={Math.min(achievement, 100)} className="h-2" />
            <div className="text-xs text-muted-foreground">
              Great progress! Keep it up.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
