import { View, Pressable, Text } from "react-native";
import { appStorage } from "@/utils/api";
import { Minus, Plus } from "lucide-react-native";
import { hoursToMinutes, formatMinutes, minutesToHours } from "@repo/utils";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { useGoalContext } from "@/context/GoalContext";
import { useStatsSummary, useUpdateDailyTarget } from "@/hooks/usePulseQueries";
import { useThemeColors } from "@/hooks/useThemeColors";

export function GoalsScreen() {
  const { goalEnabled, setGoalEnabled, dailyGoalHours, setDailyGoalHours } =
    useGoalContext();
  const { data: summary } = useStatsSummary();
  const updateTarget = useUpdateDailyTarget();
  const colors = useThemeColors();

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
    updateTarget.mutate(enabled ? hoursToMinutes(hours) : 0);
    if (enabled && hours > 0) {
      appStorage.setItem("pulse-last-goal-hours", String(hours));
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Goals" />
      <ScreenScroll>
        <Card className="p-6 gap-6">
          <Pressable
            className="flex-row items-center gap-3"
            onPress={async () => {
              const next = !goalEnabled;
              setGoalEnabled(next);
              if (next) {
                const stored = await appStorage.getItem(
                  "pulse-last-goal-hours",
                );
                const hours = stored ? parseInt(stored, 10) : 8;
                setDailyGoalHours(hours);
                persistGoal(hours, true);
              } else {
                persistGoal(dailyGoalHours, false);
              }
            }}
          >
            <View
              className="w-5 h-5 rounded border items-center justify-center"
              style={{
                backgroundColor: goalEnabled ? colors.primary : "transparent",
                borderColor: goalEnabled ? colors.primary : colors.border,
              }}
            >
              {goalEnabled && (
                <Text style={{ color: colors.primaryForeground, fontSize: 12 }}>
                  ✓
                </Text>
              )}
            </View>
            <ThemedText className="text-lg font-semibold">
              Set Daily Goal
            </ThemedText>
          </Pressable>

          {goalEnabled ? (
            <View className="items-center gap-4">
              <View className="flex-row items-center gap-6">
                <Button
                  size="icon"
                  variant="outline"
                  onPress={() => {
                    const next = Math.max(1, dailyGoalHours - 1);
                    setDailyGoalHours(next);
                    persistGoal(next, true);
                  }}
                >
                  <Minus size={20} color={colors.foreground} />
                </Button>
                <ThemedText className="text-6xl font-light">
                  {dailyGoalHours}
                </ThemedText>
                <Button
                  size="icon"
                  variant="outline"
                  onPress={() => {
                    const next = dailyGoalHours + 1;
                    setDailyGoalHours(next);
                    persistGoal(next, true);
                  }}
                >
                  <Plus size={20} color={colors.foreground} />
                </Button>
              </View>
              <ThemedText className="text-sm text-neutral-500">
                hours per day
              </ThemedText>
            </View>
          ) : (
            <ThemedText className="text-center text-neutral-500 py-4">
              No daily goal set. Enable to start tracking.
            </ThemedText>
          )}
        </Card>

        <View className="gap-4">
          {[
            {
              title: "Weekly Goal",
              target: weeklyTargetHours,
              worked: summary?.weeklyWorkedMinutes ?? 0,
              progress: weeklyProgress,
            },
            {
              title: "Monthly Goal",
              target: monthlyTargetHours,
              worked: summary?.monthlyWorkedMinutes ?? 0,
              progress: monthlyProgress,
            },
            {
              title: "Achievement",
              target: null,
              worked: null,
              progress: achievement,
              isAchievement: true,
            },
          ].map((item) => (
            <Card key={item.title} className="p-4 gap-3">
              <ThemedText className="font-semibold">{item.title}</ThemedText>
              {item.target !== null && (
                <ThemedText className="text-2xl font-light">
                  {item.target} hours
                </ThemedText>
              )}
              {item.isAchievement && (
                <ThemedText className="text-2xl font-light">
                  {achievement}%
                </ThemedText>
              )}
              <Progress value={Math.min(item.progress, 100)} />
              {item.worked !== null && (
                <ThemedText className="text-xs text-neutral-500">
                  {formatMinutes(item.worked)} worked · {item.progress}%
                </ThemedText>
              )}
            </Card>
          ))}
        </View>
      </ScreenScroll>
    </Screen>
  );
}
