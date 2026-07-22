import { useState, useEffect } from "react";
import { View, Modal, Pressable, Text, ScrollView } from "react-native";
import {
  Pause,
  Play,
  Clock,
  Calendar,
  Activity,
  FolderOpen,
  Star,
  Flame,
  Target,
} from "lucide-react-native";
import type { ComponentType } from "react";
import { formatMinutes, formatSessionClock, minutesToHours } from "@repo/utils";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Sparkline } from "@/components/Sparkline";
import { useGoalContext } from "@/context/GoalContext";
import {
  useStatsSummary,
  useTodaySessions,
  useTodayStats,
  useUserSettings,
} from "@/hooks/usePulseQueries";
import { useTimerControls } from "@/hooks/useTimerControls";
import { useThemeColors } from "@/hooks/useThemeColors";
import { appStorage, TOKEN_KEYS } from "@/utils/api";

function getDisplayName(email: string) {
  const part = email.split("@")[0] ?? "there";
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function formatBestDayDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

interface StatCardProps {
  label: string;
  value: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  iconBg: string;
  iconColor: string;
  sparkColor: string;
  subtitle?: string;
  onPress?: () => void;
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  sparkColor,
  subtitle,
  onPress,
}: StatCardProps) {
  const content = (
    <Card className="p-4 gap-3 flex-1 min-w-[46%]">
      <View
        className="w-9 h-9 rounded-lg items-center justify-center"
        style={{ backgroundColor: iconBg }}
      >
        <Icon size={16} color={iconColor} />
      </View>
      <View>
        <ThemedText className="text-sm text-neutral-500">{label}</ThemedText>
        <ThemedText className="text-2xl font-bold mt-1">{value}</ThemedText>
        {subtitle && (
          <ThemedText className="text-xs text-neutral-500 mt-1">
            {subtitle}
          </ThemedText>
        )}
      </View>
      <Sparkline color={sparkColor} />
    </Card>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="min-w-[46%] flex-1">
        {content}
      </Pressable>
    );
  }

  return content;
}

export function DashboardScreen() {
  const { goalEnabled, dailyGoalHours } = useGoalContext();
  const [showSessions, setShowSessions] = useState(false);
  const [displayName, setDisplayName] = useState("there");
  const { data: todayStats } = useTodayStats();
  const { data: summary } = useStatsSummary();
  const { data: todaySessions = [] } = useTodaySessions();
  const { data: settings } = useUserSettings();
  const { isRunning, displayTime, handlePlay, handlePause } =
    useTimerControls();
  const colors = useThemeColors();

  useEffect(() => {
    appStorage.getItem(TOKEN_KEYS.email).then((email) => {
      if (email) setDisplayName(getDisplayName(email));
    });
  }, []);

  const timezone = settings?.timezone ?? "UTC";
  const workedMinutes = todayStats?.workedMinutes ?? 0;
  const workedHours = minutesToHours(workedMinutes);
  const progressPercentage =
    goalEnabled && dailyGoalHours > 0
      ? Math.round((workedHours / dailyGoalHours) * 100)
      : (todayStats?.percentage ?? 0);
  const remainingHours = Math.max(0, dailyGoalHours - workedHours);
  const bestDayDate = formatBestDayDate(summary?.bestDayDate);

  return (
    <Screen>
      <ScreenHeader
        title={`Welcome back, ${displayName} 👋`}
        subtitle="Stay focused and keep building."
      />
      <ScreenScroll>
        <Card
          glow
          className="p-8 gap-6"
          style={{ borderColor: colors.accentPurple + "33" }}
        >
          <View className="items-center gap-3">
            <View
              className="flex-row items-center gap-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: colors.accentPurpleBg }}
            >
              <View
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: colors.accentPurple }}
              />
              <Text
                style={{
                  color: colors.accentPurple,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                Current Session
              </Text>
            </View>

            <ThemedText
              className="text-5xl font-black tracking-tight"
              style={{ fontWeight: "900" }}
            >
              {displayTime}
            </ThemedText>

            {isRunning && (
              <View className="flex-row items-center gap-2">
                <View
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: colors.accentGreen }}
                />
                <ThemedText className="text-sm text-neutral-500">
                  Currently Working
                </ThemedText>
              </View>
            )}
          </View>

          <View className="items-center pt-2">
            <Button
              size="lg"
              onPress={isRunning ? handlePause : handlePlay}
              className="min-w-[140px]"
            >
              {isRunning ? (
                <>
                  <Pause size={16} color={colors.primaryForeground} />
                  <Text
                    style={{
                      color: colors.primaryForeground,
                      marginLeft: 8,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    Pause
                  </Text>
                </>
              ) : (
                <>
                  <Play size={16} color={colors.primaryForeground} />
                  <Text
                    style={{
                      color: colors.primaryForeground,
                      marginLeft: 8,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    Play
                  </Text>
                </>
              )}
            </Button>
          </View>
        </Card>

        <View className="flex-row flex-wrap gap-3">
          <StatCard
            label="Worked Today"
            value={formatMinutes(workedMinutes)}
            icon={Calendar}
            iconBg={colors.accentPurpleBg}
            iconColor={colors.accentPurple}
            sparkColor={colors.accentPurple}
            subtitle={goalEnabled ? `Goal: ${dailyGoalHours}h` : undefined}
          />

          {goalEnabled && (
            <Card className="p-4 gap-3 min-w-[46%] flex-1">
              <View
                className="w-9 h-9 rounded-lg items-center justify-center"
                style={{ backgroundColor: colors.accentPurpleBg }}
              >
                <Target size={16} color={colors.accentPurple} />
              </View>
              <View>
                <ThemedText className="text-sm text-neutral-500">
                  Progress
                </ThemedText>
                <ThemedText
                  className="text-2xl font-bold mt-1"
                  style={{ color: colors.accentPurple }}
                >
                  {progressPercentage}%
                </ThemedText>
                <Progress
                  value={Math.min(progressPercentage, 100)}
                  className="mt-2"
                />
              </View>
              <Sparkline color={colors.accentPurple} />
            </Card>
          )}

          {goalEnabled && (
            <StatCard
              label="Remaining"
              value={formatMinutes(Math.round(remainingHours * 60))}
              icon={Clock}
              iconBg={colors.accentAmberBg}
              iconColor={colors.accentAmber}
              sparkColor={colors.accentAmber}
            />
          )}

          <StatCard
            label="Sessions Today"
            value={String(todaySessions.length)}
            icon={Activity}
            iconBg={colors.accentGreenBg}
            iconColor={colors.accentGreen}
            sparkColor={colors.accentGreen}
            subtitle="Click to view all"
            onPress={() => setShowSessions(true)}
          />

          <StatCard
            label="This Week"
            value={formatMinutes(summary?.weeklyWorkedMinutes ?? 0)}
            icon={FolderOpen}
            iconBg={colors.accentAmberBg}
            iconColor={colors.accentAmber}
            sparkColor={colors.accentAmber}
          />

          <StatCard
            label="Best Day"
            value={formatMinutes(summary?.bestDayMinutes ?? 0)}
            icon={Star}
            iconBg={colors.accentBlueBg}
            iconColor={colors.accentBlue}
            sparkColor={colors.accentBlue}
            subtitle={bestDayDate ?? undefined}
          />

          <StatCard
            label="Current Streak"
            value={`${summary?.currentStreakDays ?? 0} days`}
            icon={Flame}
            iconBg={colors.accentRedBg}
            iconColor={colors.accentRed}
            sparkColor={colors.accentRed}
            subtitle={
              (summary?.currentStreakDays ?? 0) > 0 ? "Keep it up!" : undefined
            }
          />
        </View>
      </ScreenScroll>

      <Modal visible={showSessions} transparent animationType="fade">
        <View
          className="flex-1 justify-center p-4"
          style={{ backgroundColor: colors.overlay }}
        >
          <Card className="p-6 gap-4 max-h-[80%]">
            <ThemedText className="text-2xl font-bold">
              Sessions Today
            </ThemedText>
            <ScrollView className="max-h-64">
              {todaySessions.length === 0 ? (
                <ThemedText className="text-sm text-neutral-500 text-center py-4">
                  No sessions logged today yet.
                </ThemedText>
              ) : (
                todaySessions.map((session) => (
                  <View
                    key={session.id ?? session._id ?? session.startTime}
                    className="p-3 rounded-xl mb-2 gap-1"
                    style={{ borderWidth: 1, borderColor: colors.border }}
                  >
                    <View className="flex-row items-center gap-2">
                      <Clock size={14} color={colors.accentPurple} />
                      <ThemedText className="font-medium">
                        {formatSessionClock(session.startTime, timezone)} -{" "}
                        {formatSessionClock(session.endTime, timezone)}
                      </ThemedText>
                    </View>
                    <ThemedText className="text-sm text-neutral-500">
                      Duration: {formatMinutes(session.durationMinutes)}
                    </ThemedText>
                  </View>
                ))
              )}
            </ScrollView>
            <Button
              label="Close"
              variant="outline"
              onPress={() => setShowSessions(false)}
            />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
