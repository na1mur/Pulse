import { useState, type ReactNode } from "react";
import { View, Modal, Pressable, Text, ScrollView, TextInput } from "react-native";
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
import type { WorkSession } from "@repo/types";
import {
  formatDurationSeconds,
  formatMinutes,
  formatSessionClock,
  getSessionDurationSeconds,
  minutesToHours,
} from "@repo/utils";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { StatCardGrid } from "@/components/StatCardGrid";
import { useGoalContext } from "@/context/GoalContext";
import {
  useStatsSummary,
  useTodaySessions,
  useTodayStats,
  useUserSettings,
} from "@/hooks/usePulseQueries";
import { useTimerControls } from "@/hooks/useTimerControls";
import { useTimerStore } from "@/store/useTimerStore";
import { useThemeColors } from "@/hooks/useThemeColors";

function ExpandableSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable onPress={() => setExpanded((prev) => !prev)}>
      <ThemedText
        numberOfLines={expanded ? undefined : 1}
        className="text-sm text-neutral-500"
      >
        {text}
      </ThemedText>
    </Pressable>
  );
}

function SessionRow({
  session,
  timezone,
  colors,
}: {
  session: WorkSession;
  timezone: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      className="p-3 rounded-xl mb-2 gap-1"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      {session.title ? (
        <ThemedText className="font-semibold">{session.title}</ThemedText>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Clock size={14} color={colors.accentPurple} />
        <ThemedText className="font-medium">
          {formatSessionClock(session.startTime, timezone)} -{" "}
          {formatSessionClock(session.endTime, timezone)}
        </ThemedText>
      </View>
      <ThemedText className="text-sm text-neutral-500">
        Duration:{" "}
        {formatDurationSeconds(getSessionDurationSeconds(session))}
      </ThemedText>
      {session.summary ? <ExpandableSummary text={session.summary} /> : null}
    </View>
  );
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
  subtitle?: string;
  onPress?: () => void;
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  subtitle,
  onPress,
}: StatCardProps) {
  const content = (
    <Card glowSubtle className="p-4 gap-3 flex-1">
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
    </Card>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="flex-1">
        {content}
      </Pressable>
    );
  }

  return content;
}

export function DashboardScreen() {
  const { goalEnabled, dailyGoalHours } = useGoalContext();
  const [showSessions, setShowSessions] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [summaryInput, setSummaryInput] = useState("");
  const { data: todayStats } = useTodayStats();
  const { data: summary } = useStatsSummary();
  const { data: todaySessions = [] } = useTodaySessions();
  const { data: settings } = useUserSettings();
  const { isRunning, displayTime, handlePlay, handlePause } =
    useTimerControls();
  const sessionTitle = useTimerStore((state) => state.sessionTitle);
  const colors = useThemeColors();

  const displayName = settings?.name?.trim() || "there";

  const timezone = settings?.timezone ?? "UTC";
  const workedMinutes = todayStats?.workedMinutes ?? 0;
  const workedHours = minutesToHours(workedMinutes);
  const progressPercentage =
    goalEnabled && dailyGoalHours > 0
      ? Math.round((workedHours / dailyGoalHours) * 100)
      : (todayStats?.percentage ?? 0);
  const remainingHours = Math.max(0, dailyGoalHours - workedHours);
  const bestDayDate = formatBestDayDate(summary?.bestDayDate);

  const confirmResume = () => {
    handlePlay(titleInput);
    setTitleInput("");
    setShowTitleModal(false);
  };

  const dismissTitleModal = () => {
    handlePlay();
    setTitleInput("");
    setShowTitleModal(false);
  };

  const confirmPause = () => {
    void handlePause(summaryInput);
    setSummaryInput("");
    setShowSummaryModal(false);
  };

  const dismissSummaryModal = () => {
    void handlePause();
    setSummaryInput("");
    setShowSummaryModal(false);
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.input,
  };

  return (
    <Screen>
      <ScreenHeader
        title={`Welcome back, ${displayName} 👋`}
        subtitle="Stay focused and keep building."
      />
      <ScreenScroll>
        <Card glow className="p-8 gap-6">
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

            {sessionTitle ? (
              <ThemedText className="text-lg font-semibold text-center px-4">
                {sessionTitle}
              </ThemedText>
            ) : null}

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
              onPress={
                isRunning ? () => setShowSummaryModal(true) : () => setShowTitleModal(true)
              }
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

        <StatCardGrid>
          {[
            <StatCard
              key="worked"
              label="Worked Today"
              value={formatMinutes(workedMinutes)}
              icon={Calendar}
              iconBg={colors.accentPurpleBg}
              iconColor={colors.accentPurple}
              subtitle={goalEnabled ? `Goal: ${dailyGoalHours}h` : undefined}
            />,

            goalEnabled ? (
              <Card key="progress" glowSubtle className="p-4 gap-3 flex-1">
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
              </Card>
            ) : null,

            goalEnabled ? (
              <StatCard
                key="remaining"
                label="Remaining"
                value={formatMinutes(Math.round(remainingHours * 60))}
                icon={Clock}
                iconBg={colors.accentAmberBg}
                iconColor={colors.accentAmber}
              />
            ) : null,

            <StatCard
              key="sessions"
              label="Sessions Today"
              value={String(todaySessions.length)}
              icon={Activity}
              iconBg={colors.accentGreenBg}
              iconColor={colors.accentGreen}
              subtitle="Click to view all"
              onPress={() => setShowSessions(true)}
            />,

            <StatCard
              key="week"
              label="This Week"
              value={formatMinutes(summary?.weeklyWorkedMinutes ?? 0)}
              icon={FolderOpen}
              iconBg={colors.accentAmberBg}
              iconColor={colors.accentAmber}
            />,

            <StatCard
              key="best-day"
              label="Best Day"
              value={formatMinutes(summary?.bestDayMinutes ?? 0)}
              icon={Star}
              iconBg={colors.accentBlueBg}
              iconColor={colors.accentBlue}
              subtitle={bestDayDate ?? undefined}
            />,

            <StatCard
              key="streak"
              label="Current Streak"
              value={`${summary?.currentStreakDays ?? 0} days`}
              icon={Flame}
              iconBg={colors.accentRedBg}
              iconColor={colors.accentRed}
              subtitle={
                (summary?.currentStreakDays ?? 0) > 0
                  ? "Keep it up!"
                  : undefined
              }
            />,
          ].filter(Boolean)}
        </StatCardGrid>
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
                  <SessionRow
                    key={session.id ?? session._id ?? session.startTime}
                    session={session}
                    timezone={timezone}
                    colors={colors}
                  />
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

      <Modal visible={showTitleModal} transparent animationType="fade">
        <View
          className="flex-1 justify-center p-4"
          style={{ backgroundColor: colors.overlay }}
        >
          <Card className="p-6 gap-4">
            <ThemedText className="text-xl font-bold">Session Title</ThemedText>
            <ThemedText className="text-sm text-neutral-500">
              Add an optional title for this session.
            </ThemedText>
            <TextInput
              value={titleInput}
              onChangeText={setTitleInput}
              placeholder="What are you working on?"
              placeholderTextColor={colors.muted}
              style={inputStyle}
            />
            <View className="flex-row gap-2 justify-end">
              <Button label="Skip" variant="outline" onPress={dismissTitleModal} />
              <Button label="Resume" onPress={confirmResume} />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal visible={showSummaryModal} transparent animationType="fade">
        <View
          className="flex-1 justify-center p-4"
          style={{ backgroundColor: colors.overlay }}
        >
          <Card className="p-6 gap-4">
            <ThemedText className="text-xl font-bold">Session Summary</ThemedText>
            <ThemedText className="text-sm text-neutral-500">
              Add an optional summary before pausing.
            </ThemedText>
            <TextInput
              value={summaryInput}
              onChangeText={setSummaryInput}
              placeholder="What did you accomplish?"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]}
            />
            <View className="flex-row gap-2 justify-end">
              <Button label="Skip" variant="outline" onPress={dismissSummaryModal} />
              <Button label="Pause" onPress={confirmPause} />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
