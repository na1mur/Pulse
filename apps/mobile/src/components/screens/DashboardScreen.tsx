import { useEffect, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  Text,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from "react-native";
import {
  Pause,
  Play,
  Clock,
  Calendar,
  CalendarDays,
  Activity,
  FolderOpen,
  Star,
  Flame,
} from "lucide-react-native";
import type { ComponentType } from "react";
import type { TagStatsRange, WorkSession } from "@repo/types";
import {
  formatDurationSeconds,
  formatMinutes,
  formatSessionClock,
  getDisplayTimezone,
  getPeriodProgress,
  getSessionDurationSeconds,
  progressBarValue,
  type PeriodProgress,
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
  useStatsByTag,
  useStatsSummary,
  useTags,
  useTodaySessions,
  useTodayStats,
  useUserSettings,
  useAutoSkipCountdown,
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
      className="p-3 rounded-lg mb-2 gap-1"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      {session.title ? (
        <ThemedText className="font-semibold">{session.title}</ThemedText>
      ) : null}
      {session.tagName ? (
        <ThemedText className="text-xs font-medium" style={{ color: colors.accentPurple }}>
          {session.tagName}
        </ThemedText>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Clock size={14} color={colors.accentPurple} />
        <ThemedText className="font-medium">
          {formatSessionClock(session.startTime, timezone)} -{" "}
          {formatSessionClock(session.endTime, timezone)}
        </ThemedText>
      </View>
      <ThemedText className="text-sm text-neutral-500">
        Duration: {formatDurationSeconds(getSessionDurationSeconds(session))}
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

function PeriodProgressCard({
  label,
  icon: Icon,
  iconBg,
  iconColor,
  progress,
  filterLabel,
}: {
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  iconBg: string;
  iconColor: string;
  progress: PeriodProgress;
  filterLabel?: string;
}) {
  return (
    <View className="w-full flex-1">
      <Card glowSubtle className="p-4 gap-3 w-full flex-1">
        <View
          className="w-9 h-9 rounded-lg items-center justify-center"
          style={{ backgroundColor: iconBg }}
        >
          <Icon size={16} color={iconColor} />
        </View>
        <View className="flex-1">
          <ThemedText className="text-sm text-neutral-500">{label}</ThemedText>
          {filterLabel ? (
            <ThemedText className="text-xs" style={{ color: iconColor }}>
              {filterLabel}
            </ThemedText>
          ) : null}
          <View className="flex-row items-end justify-between gap-2 mt-1">
            <ThemedText className="text-2xl font-bold">
              {formatMinutes(progress.workedMinutes)}
            </ThemedText>
            {progress.percentage != null ? (
              <ThemedText
                className="text-lg font-semibold"
                style={{ color: iconColor }}
              >
                {progress.percentage}%
              </ThemedText>
            ) : null}
          </View>
          {progress.hasTarget ? (
            <View className="mt-2 gap-2">
              <Progress value={progressBarValue(progress.percentage)} />
              <ThemedText className="text-xs text-neutral-500">
                {(progress.remainingMinutes ?? 0) === 0
                  ? "Goal reached"
                  : `${formatMinutes(progress.remainingMinutes ?? 0)} remaining`}
                {` · Goal ${formatMinutes(progress.goalMinutes)}`}
              </ThemedText>
            </View>
          ) : (
            <View className="min-h-[18px] mt-1" />
          )}
        </View>
      </Card>
    </View>
  );
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
    <Card glowSubtle className="p-4 gap-3 w-full flex-1">
      <View
        className="w-9 h-9 rounded-lg items-center justify-center"
        style={{ backgroundColor: iconBg }}
      >
        <Icon size={16} color={iconColor} />
      </View>
      <View className="flex-1">
        <ThemedText className="text-sm text-neutral-500">{label}</ThemedText>
        <ThemedText className="text-2xl font-bold mt-1">{value}</ThemedText>
        <View className="min-h-[18px] mt-1 justify-center">
          {subtitle ? (
            <ThemedText className="text-xs text-neutral-500">
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Card>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="w-full flex-1">
        {content}
      </Pressable>
    );
  }

  return <View className="w-full flex-1">{content}</View>;
}

function TagBadge({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: selected ? colors.primary : colors.mutedSurface,
        borderWidth: selected ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          lineHeight: 14,
          fontWeight: "500",
          color: selected ? colors.primaryForeground : colors.foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TagChipRow({
  tags,
  selectedId,
  onSelect,
  allLabel,
  onInteract,
}: {
  tags: { id: string; name: string }[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  allLabel: string;
  onInteract?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row flex-wrap gap-1.5">
      <TagBadge
        label={allLabel}
        selected={!selectedId}
        onPress={() => {
          onInteract?.();
          onSelect(undefined);
        }}
        colors={colors}
      />
      {tags.map((tag) => (
        <TagBadge
          key={tag.id}
          label={tag.name}
          selected={selectedId === tag.id}
          onPress={() => {
            onInteract?.();
            onSelect(tag.id);
          }}
          colors={colors}
        />
      ))}
    </View>
  );
}

export function DashboardScreen() {
  const {
    goalEnabled,
    dailyGoalHours,
    weeklyGoalEnabled,
    weeklyGoalHours,
    monthlyGoalEnabled,
    monthlyGoalHours,
  } = useGoalContext();
  const [showSessions, setShowSessions] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | undefined>();
  const [statsTagId, setStatsTagId] = useState<string | undefined>();
  const [breakdownRange, setBreakdownRange] = useState<TagStatsRange>("today");
  const [summaryInput, setSummaryInput] = useState("");
  const { data: todayStats } = useTodayStats(statsTagId);
  const { data: summary } = useStatsSummary(statsTagId);
  const { data: lifetimeSummary } = useStatsSummary();
  const { data: todaySessions = [] } = useTodaySessions();
  const { data: tags = [] } = useTags();
  const { data: tagBreakdown } = useStatsByTag(breakdownRange);
  const { data: settings } = useUserSettings();
  const { isRunning, displayTime, handlePlay, beginPause, completePause } =
    useTimerControls();
  const sessionTitle = useTimerStore((state) => state.sessionTitle);
  const sessionTagId = useTimerStore((state) => state.tagId);
  const activeTagName = tags.find((tag) => tag.id === sessionTagId)?.name;
  const statsFilterLabel = statsTagId
    ? tags.find((tag) => tag.id === statsTagId)?.name
    : undefined;
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const sessionsModalMaxHeight = windowHeight * 0.7;
  const sessionsListMaxHeight = sessionsModalMaxHeight - 140;

  const displayName = settings?.name?.trim() || "there";

  const timezone = getDisplayTimezone();
  const todayProgress = getPeriodProgress(
    todayStats?.workedMinutes ?? 0,
    goalEnabled,
    dailyGoalHours,
  );
  const weekProgress = getPeriodProgress(
    summary?.weeklyWorkedMinutes ?? 0,
    weeklyGoalEnabled,
    weeklyGoalHours,
  );
  const monthProgress = getPeriodProgress(
    summary?.monthlyWorkedMinutes ?? 0,
    monthlyGoalEnabled,
    monthlyGoalHours,
  );
  const bestDayDate = formatBestDayDate(lifetimeSummary?.bestDayDate);

  useEffect(() => {
    if (statsTagId && !tags.some((tag) => tag.id === statsTagId)) {
      setStatsTagId(undefined);
    }
    if (selectedTagId && !tags.some((tag) => tag.id === selectedTagId)) {
      setSelectedTagId(undefined);
    }
  }, [selectedTagId, statsTagId, tags]);

  const resetPlayModal = () => {
    setTitleInput("");
    setShowTitleModal(false);
  };

  const confirmResume = () => {
    handlePlay(titleInput, selectedTagId);
    resetPlayModal();
  };

  const dismissTitleModal = () => {
    handlePlay(undefined, selectedTagId);
    resetPlayModal();
  };

  const openPlayModal = () => {
    setSelectedTagId(useTimerStore.getState().tagId);
    setTitleInput("");
    setShowTitleModal(true);
  };

  const confirmPause = () => {
    void completePause(summaryInput);
    setSummaryInput("");
    setShowSummaryModal(false);
  };

  const dismissSummaryModal = () => {
    void completePause();
    setSummaryInput("");
    setShowSummaryModal(false);
  };

  const openPauseModal = () => {
    beginPause();
    setShowSummaryModal(true);
  };

  const titleSkip = useAutoSkipCountdown({
    isOpen: showTitleModal,
    onAutoSkip: dismissTitleModal,
  });

  const summarySkip = useAutoSkipCountdown({
    isOpen: showSummaryModal,
    onAutoSkip: dismissSummaryModal,
  });

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
            {sessionTitle ? (
              <ThemedText className="text-lg font-semibold text-center px-4">
                {sessionTitle}
              </ThemedText>
            ) : null}
            {activeTagName ? (
              <ThemedText
                className="text-sm font-medium"
                style={{ color: colors.accentPurple }}
              >
                {activeTagName}
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
                isRunning ? openPauseModal : openPlayModal
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

        {tags.length > 0 ? (
          <View className="gap-2">
            <ThemedText className="text-sm text-neutral-500">
              Filter stats
            </ThemedText>
            <TagChipRow
              tags={tags}
              selectedId={statsTagId}
              onSelect={setStatsTagId}
              allLabel="All"
            />
          </View>
        ) : null}

        <StatCardGrid>
          {[
            <PeriodProgressCard
              key="today"
              label="Today"
              icon={Calendar}
              iconBg={colors.accentPurpleBg}
              iconColor={colors.accentPurple}
              progress={todayProgress}
              filterLabel={statsFilterLabel}
            />,
            <PeriodProgressCard
              key="week"
              label="This Week"
              icon={FolderOpen}
              iconBg={colors.accentAmberBg}
              iconColor={colors.accentAmber}
              progress={weekProgress}
              filterLabel={statsFilterLabel}
            />,
            <PeriodProgressCard
              key="month"
              label="This Month"
              icon={CalendarDays}
              iconBg={colors.accentBlueBg}
              iconColor={colors.accentBlue}
              progress={monthProgress}
              filterLabel={statsFilterLabel}
            />,
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
              key="best-day"
              label="Best Day"
              value={formatMinutes(lifetimeSummary?.bestDayMinutes ?? 0)}
              icon={Star}
              iconBg={colors.accentBlueBg}
              iconColor={colors.accentBlue}
              subtitle={bestDayDate ?? undefined}
            />,
            <StatCard
              key="streak"
              label="Current Streak"
              value={`${lifetimeSummary?.currentStreakDays ?? 0} days`}
              icon={Flame}
              iconBg={colors.accentRedBg}
              iconColor={colors.accentRed}
              subtitle={
                (lifetimeSummary?.currentStreakDays ?? 0) > 0
                  ? "Keep it up!"
                  : undefined
              }
            />,
          ]}
        </StatCardGrid>

        <Card glowSubtle className="p-4 gap-3">
          <ThemedText className="font-semibold">Time by tag</ThemedText>
          <View className="flex-row flex-wrap gap-2">
            {(
              [
                ["today", "Today"],
                ["week", "This week"],
                ["month", "This month"],
              ] as const
            ).map(([range, label]) => (
              <Button
                key={range}
                size="sm"
                label={label}
                variant={breakdownRange === range ? "default" : "outline"}
                onPress={() => setBreakdownRange(range)}
              />
            ))}
          </View>
          {tagBreakdown?.tags.length ? (
            <View className="gap-2">
              {tagBreakdown.tags.map((bucket) => (
                <View
                  key={bucket.tagId ?? "untagged"}
                  className="flex-row items-center justify-between"
                >
                  <ThemedText>{bucket.tagName}</ThemedText>
                  <ThemedText className="text-neutral-500">
                    {formatMinutes(bucket.workedMinutes)}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText className="text-sm text-neutral-500">
              No tagged time in this period yet.
            </ThemedText>
          )}
        </Card>
      </ScreenScroll>

      <Modal visible={showSessions} transparent animationType="fade">
        <View
          className="flex-1 justify-center p-4"
          style={{ backgroundColor: colors.overlay }}
        >
          <Card
            className="p-6 gap-4"
            style={{ maxHeight: sessionsModalMaxHeight }}
          >
            <ThemedText className="text-2xl font-bold">
              Sessions Today
            </ThemedText>
            <ThemedText className="text-sm text-neutral-500">
              {todaySessions.length === 0
                ? "No sessions logged today yet."
                : `${todaySessions.length} session${todaySessions.length === 1 ? "" : "s"} logged today`}
            </ThemedText>
            {todaySessions.length > 0 ? (
              <ScrollView
                style={{ maxHeight: Math.max(sessionsListMaxHeight, 160) }}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {todaySessions.map((session) => (
                  <SessionRow
                    key={session.id ?? session._id ?? session.startTime}
                    session={session}
                    timezone={timezone}
                    colors={colors}
                  />
                ))}
              </ScrollView>
            ) : null}
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
          <Card className="p-6 gap-4" style={{ maxHeight: windowHeight * 0.8 }}>
            <ThemedText className="text-xl font-bold">Start session</ThemedText>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View className="gap-4">
                <ThemedText className="text-sm text-neutral-500">
                  Optional title for this session.
                </ThemedText>
                <TextInput
                  value={titleInput}
                  onChangeText={(text) => {
                    setTitleInput(text);
                    titleSkip.cancelCountdown();
                  }}
                  onFocus={titleSkip.cancelCountdown}
                  placeholder="What are you working on?"
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
                <ThemedText className="text-sm text-neutral-500">
                  Select a tag (optional).
                </ThemedText>
                {tags.length > 0 ? (
                  <TagChipRow
                    tags={tags}
                    selectedId={selectedTagId}
                    onSelect={setSelectedTagId}
                    allLabel="None"
                    onInteract={titleSkip.cancelCountdown}
                  />
                ) : (
                  <ThemedText className="text-xs text-neutral-500">
                    No tags yet. Create them in Settings.
                  </ThemedText>
                )}
              </View>
            </ScrollView>
            <View className="flex-row gap-2 justify-end">
              <Button
                label={titleSkip.skipLabel}
                variant="outline"
                onPress={dismissTitleModal}
              />
              <Button
                label="Resume"
                onPress={confirmResume}
              />
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
            <ThemedText className="text-xl font-bold">
              Session Summary
            </ThemedText>
            <ThemedText className="text-sm text-neutral-500">
              Add an optional summary before pausing.
            </ThemedText>
            <TextInput
              value={summaryInput}
              onChangeText={(text) => {
                setSummaryInput(text);
                summarySkip.cancelCountdown();
              }}
              onFocus={summarySkip.cancelCountdown}
              placeholder="What did you accomplish?"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]}
            />
            <View className="flex-row gap-2 justify-end">
              <Button
                label={summarySkip.skipLabel}
                variant="outline"
                onPress={dismissSummaryModal}
              />
              <Button label="Pause" onPress={confirmPause} />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
