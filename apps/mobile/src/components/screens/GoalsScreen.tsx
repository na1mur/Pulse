import { View, Pressable, Text } from "react-native";
import { appStorage } from "@/utils/api";
import { Minus, Plus } from "lucide-react-native";
import { hoursToMinutes, formatMinutes, minutesToHours } from "@repo/utils";
import { GOAL_DEFAULTS } from "@repo/queries";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { useGoalContext } from "@/context/GoalContext";
import {
  useStatsSummary,
  useUpdateDailyTarget,
  useUpdateMonthlyTarget,
  useUpdateWeeklyTarget,
} from "@/hooks/usePulseQueries";
import { useThemeColors } from "@/hooks/useThemeColors";

const PERIOD_GOAL_STEP_HOURS = 10;

function GoalCheckbox({
  checked,
  onPress,
  label,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
}) {
  const colors = useThemeColors();

  return (
    <Pressable className="flex-row items-center gap-3" onPress={onPress}>
      <View
        className="w-5 h-5 rounded border items-center justify-center"
        style={{
          backgroundColor: checked ? colors.primary : "transparent",
          borderColor: checked ? colors.primary : colors.border,
        }}
      >
        {checked && (
          <Text style={{ color: colors.primaryForeground, fontSize: 12 }}>
            ✓
          </Text>
        )}
      </View>
      <ThemedText className="text-lg font-semibold">{label}</ThemedText>
    </Pressable>
  );
}

function PeriodGoalControls({
  hours,
  onMinus,
  onPlus,
  unitLabel,
}: {
  hours: number;
  onMinus: () => void;
  onPlus: () => void;
  unitLabel: string;
}) {
  const colors = useThemeColors();

  return (
    <View className="items-center gap-4">
      <View className="flex-row items-center gap-6">
        <Button size="icon" variant="outline" onPress={onMinus}>
          <Minus size={20} color={colors.foreground} />
        </Button>
        <ThemedText className="text-5xl font-light">{hours}</ThemedText>
        <Button size="icon" variant="outline" onPress={onPlus}>
          <Plus size={20} color={colors.foreground} />
        </Button>
      </View>
      <ThemedText className="text-sm text-neutral-500">{unitLabel}</ThemedText>
    </View>
  );
}

export function GoalsScreen() {
  const {
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
  } = useGoalContext();
  const { data: summary } = useStatsSummary();
  const updateDailyTarget = useUpdateDailyTarget();
  const updateWeeklyTarget = useUpdateWeeklyTarget();
  const updateMonthlyTarget = useUpdateMonthlyTarget();

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
    updateDailyTarget.mutate(enabled ? hoursToMinutes(hours) : 0);
    if (enabled && hours > 0) {
      appStorage.setItem("pulse-last-goal-hours", String(hours));
    }
  };

  const persistWeeklyGoal = (hours: number, enabled: boolean) => {
    updateWeeklyTarget.mutate(enabled ? hoursToMinutes(hours) : 0);
    if (enabled && hours > 0) {
      appStorage.setItem("pulse-last-weekly-goal-hours", String(hours));
    }
  };

  const persistMonthlyGoal = (hours: number, enabled: boolean) => {
    updateMonthlyTarget.mutate(enabled ? hoursToMinutes(hours) : 0);
    if (enabled && hours > 0) {
      appStorage.setItem("pulse-last-monthly-goal-hours", String(hours));
    }
  };

  const toggleDailyGoal = async () => {
    const next = !goalEnabled;
    setGoalEnabled(next);
    if (next) {
      const stored = await appStorage.getItem("pulse-last-goal-hours");
      const hours = stored ? parseInt(stored, 10) : GOAL_DEFAULTS.dailyHours;
      setDailyGoalHours(hours);
      persistDailyGoal(hours, true);
    } else {
      persistDailyGoal(dailyGoalHours, false);
    }
  };

  const toggleWeeklyGoal = async () => {
    const next = !weeklyGoalEnabled;
    setWeeklyGoalEnabled(next);
    if (next) {
      const stored = await appStorage.getItem("pulse-last-weekly-goal-hours");
      const hours = stored ? parseInt(stored, 10) : GOAL_DEFAULTS.weeklyHours;
      setWeeklyGoalHours(hours);
      persistWeeklyGoal(hours, true);
    } else {
      persistWeeklyGoal(weeklyGoalHours, false);
    }
  };

  const toggleMonthlyGoal = async () => {
    const next = !monthlyGoalEnabled;
    setMonthlyGoalEnabled(next);
    if (next) {
      const stored = await appStorage.getItem("pulse-last-monthly-goal-hours");
      const hours = stored ? parseInt(stored, 10) : GOAL_DEFAULTS.monthlyHours;
      setMonthlyGoalHours(hours);
      persistMonthlyGoal(hours, true);
    } else {
      persistMonthlyGoal(monthlyGoalHours, false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Goals" />
      <ScreenScroll>
        <Card className="p-6 gap-6">
          <GoalCheckbox
            checked={goalEnabled}
            onPress={toggleDailyGoal}
            label="Set Daily Goal"
          />

          {goalEnabled ? (
            <PeriodGoalControls
              hours={dailyGoalHours}
              unitLabel="hours per day"
              onMinus={() => {
                const next = Math.max(1, dailyGoalHours - 1);
                setDailyGoalHours(next);
                persistDailyGoal(next, true);
              }}
              onPlus={() => {
                const next = dailyGoalHours + 1;
                setDailyGoalHours(next);
                persistDailyGoal(next, true);
              }}
            />
          ) : (
            <ThemedText className="text-center text-neutral-500 py-4">
              No daily goal set. Enable to start tracking.
            </ThemedText>
          )}
        </Card>

        <View className="gap-4">
          <Card className="p-4 gap-4">
            <GoalCheckbox
              checked={weeklyGoalEnabled}
              onPress={toggleWeeklyGoal}
              label="Weekly Goal"
            />
            {weeklyGoalEnabled ? (
              <>
                <PeriodGoalControls
                  hours={weeklyGoalHours}
                  unitLabel="hours per week"
                  onMinus={() => {
                    const next = Math.max(
                      PERIOD_GOAL_STEP_HOURS,
                      weeklyGoalHours - PERIOD_GOAL_STEP_HOURS,
                    );
                    setWeeklyGoalHours(next);
                    persistWeeklyGoal(next, true);
                  }}
                  onPlus={() => {
                    const next = weeklyGoalHours + PERIOD_GOAL_STEP_HOURS;
                    setWeeklyGoalHours(next);
                    persistWeeklyGoal(next, true);
                  }}
                />
                <Progress value={Math.min(weeklyProgress, 100)} />
                <ThemedText className="text-xs text-neutral-500">
                  {formatMinutes(summary?.weeklyWorkedMinutes ?? 0)} worked ·{" "}
                  {weeklyProgress}%
                </ThemedText>
              </>
            ) : (
              <ThemedText className="text-sm text-neutral-500">
                No weekly goal set. Enable to start tracking.
              </ThemedText>
            )}
          </Card>

          <Card className="p-4 gap-4">
            <GoalCheckbox
              checked={monthlyGoalEnabled}
              onPress={toggleMonthlyGoal}
              label="Monthly Goal"
            />
            {monthlyGoalEnabled ? (
              <>
                <PeriodGoalControls
                  hours={monthlyGoalHours}
                  unitLabel="hours per month"
                  onMinus={() => {
                    const next = Math.max(
                      PERIOD_GOAL_STEP_HOURS,
                      monthlyGoalHours - PERIOD_GOAL_STEP_HOURS,
                    );
                    setMonthlyGoalHours(next);
                    persistMonthlyGoal(next, true);
                  }}
                  onPlus={() => {
                    const next = monthlyGoalHours + PERIOD_GOAL_STEP_HOURS;
                    setMonthlyGoalHours(next);
                    persistMonthlyGoal(next, true);
                  }}
                />
                <Progress value={Math.min(monthlyProgress, 100)} />
                <ThemedText className="text-xs text-neutral-500">
                  {formatMinutes(summary?.monthlyWorkedMinutes ?? 0)} worked ·{" "}
                  {monthlyProgress}%
                </ThemedText>
              </>
            ) : (
              <ThemedText className="text-sm text-neutral-500">
                No monthly goal set. Enable to start tracking.
              </ThemedText>
            )}
          </Card>

          <Card className="p-4 gap-3">
            <ThemedText className="font-semibold">Achievement</ThemedText>
            <ThemedText className="text-2xl font-light">
              {achievement}%
            </ThemedText>
            <Progress value={Math.min(achievement, 100)} />
            <ThemedText className="text-xs text-neutral-500">
              Great progress! Keep it up.
            </ThemedText>
          </Card>
        </View>
      </ScreenScroll>
    </Screen>
  );
}
