import { Minus, Plus } from "lucide-react";
import { hoursToMinutes, formatMinutes, minutesToHours } from "@repo/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  useStatsSummary,
  useUpdateDailyTarget,
} from "@/hooks/usePulseQueries";

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
  const updateTarget = useUpdateDailyTarget();

  const weeklyTargetHours = dailyGoalHours * 5;
  const monthlyTargetHours = dailyGoalHours * 20;
  const weeklyWorked = minutesToHours(summary?.weeklyWorkedMinutes ?? 0);
  const monthlyWorked = minutesToHours(summary?.monthlyWorkedMinutes ?? 0);
  const weeklyProgress =
    weeklyTargetHours > 0
      ? Math.round((weeklyWorked / weeklyTargetHours) * 100)
      : 0;
  const monthlyProgress =
    monthlyTargetHours > 0
      ? Math.round((monthlyWorked / monthlyTargetHours) * 100)
      : 0;
  const achievement = summary?.goalAchievementPercent ?? 0;

  const persistGoal = (hours: number, enabled: boolean) => {
    const minutes = enabled ? hoursToMinutes(hours) : 0;
    updateTarget.mutate(minutes);
    if (enabled && hours > 0) {
      localStorage.setItem("pulse-last-goal-hours", String(hours));
    }
  };

  const handleToggleGoal = (checked: boolean) => {
    onGoalEnabledChange(checked);
    if (checked) {
      const restored = parseInt(
        localStorage.getItem("pulse-last-goal-hours") ?? "8",
        10,
      );
      onDailyGoalHoursChange(restored);
      persistGoal(restored, true);
    } else {
      persistGoal(dailyGoalHours, false);
    }
  };

  const handleMinus = () => {
    const next = Math.max(1, dailyGoalHours - 1);
    onDailyGoalHoursChange(next);
    persistGoal(next, goalEnabled);
  };

  const handlePlus = () => {
    const next = dailyGoalHours + 1;
    onDailyGoalHoursChange(next);
    persistGoal(next, goalEnabled);
  };

  return (
    <div className="space-y-6">
      <Card className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Checkbox
            id="goal-enabled"
            checked={goalEnabled}
            onCheckedChange={(checked) =>
              handleToggleGoal(checked === true)
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
                onClick={handleMinus}
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
                onClick={handlePlus}
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
          <h3 className="font-semibold text-foreground">Weekly Goal</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-light text-primary">
                {weeklyTargetHours}
              </span>
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
            <Progress value={Math.min(weeklyProgress, 100)} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatMinutes(summary?.weeklyWorkedMinutes ?? 0)} worked</span>
              <span>{weeklyProgress}%</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Monthly Goal</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-light text-primary">
                {monthlyTargetHours}
              </span>
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
            <Progress value={Math.min(monthlyProgress, 100)} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatMinutes(summary?.monthlyWorkedMinutes ?? 0)} worked</span>
              <span>{monthlyProgress}%</span>
            </div>
          </div>
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
