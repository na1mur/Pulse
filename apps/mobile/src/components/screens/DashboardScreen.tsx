import { useState } from "react";
import { View, ScrollView, Modal, Pressable } from "react-native";
import { Pause, Play, Clock } from "lucide-react-native";
import {
  formatMinutes,
  formatSessionClock,
  minutesToHours,
} from "@repo/utils";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { useGoalContext } from "@/context/GoalContext";
import {
  useStatsSummary,
  useTodaySessions,
  useTodayStats,
  useUserSettings,
} from "@/hooks/usePulseQueries";
import { useTimerControls } from "@/hooks/useTimerControls";
import { useTheme } from "@/hooks/useTheme";

export function DashboardScreen() {
  const { goalEnabled, dailyGoalHours } = useGoalContext();
  const [showSessions, setShowSessions] = useState(false);
  const { data: todayStats } = useTodayStats();
  const { data: summary } = useStatsSummary();
  const { data: todaySessions = [] } = useTodaySessions();
  const { data: settings } = useUserSettings();
  const { isRunning, displayTime, handlePlay, handlePause } = useTimerControls();
  const { resolvedScheme } = useTheme();
  const iconColor = resolvedScheme === "dark" ? "#a3a3a3" : "#737373";

  const timezone = settings?.timezone ?? "UTC";
  const workedMinutes = todayStats?.workedMinutes ?? 0;
  const workedHours = minutesToHours(workedMinutes);
  const progressPercentage =
    goalEnabled && dailyGoalHours > 0
      ? Math.round((workedHours / dailyGoalHours) * 100)
      : (todayStats?.percentage ?? 0);
  const remainingHours = Math.max(0, dailyGoalHours - workedHours);

  return (
    <View className="flex-1">
      <ScreenHeader title="Dashboard" />
      <ScrollView className="flex-1 p-4" contentContainerClassName="gap-4 pb-8">
        <Card className="p-8 gap-6">
          <View className="items-center gap-2">
            <ThemedText className="text-sm text-neutral-500">
              Current Session
            </ThemedText>
            <ThemedText className="text-5xl font-light">{displayTime}</ThemedText>
            {isRunning && (
              <View className="flex-row items-center gap-2 pt-2">
                <View className="w-3 h-3 rounded-full bg-neutral-900" />
                <ThemedText className="text-sm">Currently Working</ThemedText>
              </View>
            )}
          </View>
          <View className="items-center pt-2">
            <Button
              size="lg"
              onPress={isRunning ? handlePause : handlePlay}
              className="px-8"
            >
              {isRunning ? (
                <>
                  <Pause size={16} color="#fafafa" />
                  <ThemedText className="text-primary-foreground ml-2">
                    Pause
                  </ThemedText>
                </>
              ) : (
                <>
                  <Play size={16} color="#fafafa" />
                  <ThemedText className="text-primary-foreground ml-2">
                    Play
                  </ThemedText>
                </>
              )}
            </Button>
          </View>
        </Card>

        <View className="flex-row flex-wrap gap-3">
          <Card className="p-4 gap-2 min-w-[46%] flex-1">
            <ThemedText className="text-sm text-neutral-500">Worked Today</ThemedText>
            <ThemedText className="text-2xl font-semibold">
              {formatMinutes(workedMinutes)}
            </ThemedText>
          </Card>

          {goalEnabled && (
            <Card className="p-4 gap-2 min-w-[46%] flex-1">
              <ThemedText className="text-sm text-neutral-500">Progress</ThemedText>
              <ThemedText className="text-2xl font-semibold">
                {progressPercentage}%
              </ThemedText>
              <Progress value={Math.min(progressPercentage, 100)} />
            </Card>
          )}

          {goalEnabled && (
            <Card className="p-4 gap-2 min-w-[46%] flex-1">
              <ThemedText className="text-sm text-neutral-500">Remaining</ThemedText>
              <ThemedText className="text-2xl font-semibold">
                {formatMinutes(Math.round(remainingHours * 60))}
              </ThemedText>
            </Card>
          )}

          <Pressable onPress={() => setShowSessions(true)} className="min-w-[46%] flex-1">
            <Card className="p-4 gap-2">
              <ThemedText className="text-sm text-neutral-500">Sessions Today</ThemedText>
              <ThemedText className="text-2xl font-semibold">
                {todaySessions.length}
              </ThemedText>
            </Card>
          </Pressable>

          <Card className="p-4 gap-2 min-w-[46%] flex-1">
            <ThemedText className="text-sm text-neutral-500">This Week</ThemedText>
            <ThemedText className="text-2xl font-semibold">
              {formatMinutes(summary?.weeklyWorkedMinutes ?? 0)}
            </ThemedText>
          </Card>

          <Card className="p-4 gap-2 min-w-[46%] flex-1">
            <ThemedText className="text-sm text-neutral-500">Best Day</ThemedText>
            <ThemedText className="text-2xl font-semibold">
              {formatMinutes(summary?.bestDayMinutes ?? 0)}
            </ThemedText>
          </Card>

          <Card className="p-4 gap-2 min-w-[46%] flex-1">
            <ThemedText className="text-sm text-neutral-500">Current Streak</ThemedText>
            <ThemedText className="text-2xl font-semibold">
              {summary?.currentStreakDays ?? 0} days
            </ThemedText>
          </Card>
        </View>
      </ScrollView>

      <Modal visible={showSessions} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center p-4">
          <Card className="p-6 gap-4 max-h-[80%]">
            <ThemedText className="text-2xl font-semibold">Sessions Today</ThemedText>
            <ScrollView className="max-h-64">
              {todaySessions.map((session) => (
                <View
                  key={session.id ?? session._id ?? session.startTime}
                  className="p-3 border border-neutral-200 rounded-lg mb-2 gap-1"
                >
                  <View className="flex-row items-center gap-2">
                    <Clock size={14} color={iconColor} />
                    <ThemedText className="font-medium">
                      {formatSessionClock(session.startTime, timezone)} -{" "}
                      {formatSessionClock(session.endTime, timezone)}
                    </ThemedText>
                  </View>
                  <ThemedText className="text-sm text-neutral-500">
                    Duration: {formatMinutes(session.durationMinutes)}
                  </ThemedText>
                </View>
              ))}
            </ScrollView>
            <Button label="Close" variant="outline" onPress={() => setShowSessions(false)} />
          </Card>
        </View>
      </Modal>
    </View>
  );
}
