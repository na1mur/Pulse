import { useEffect, useState } from "react";
import {
  Clock,
  Pause,
  Play,
  Calendar,
  CalendarDays,
  Activity,
  FolderOpen,
  Star,
  Flame,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/app-dialog";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatCardGrid } from "@/components/StatCardGrid";
import { cn } from "@/lib/utils";
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
import type { TagStatsRange, WorkSession } from "@repo/types";
import { Input } from "@/components/ui/input";
import {
  useStatsByTag,
  useStatsSummary,
  useTags,
  useTodaySessions,
  useTodayStats,
  useAutoSkipCountdown,
} from "@/hooks/usePulseQueries";
import { useTimerControls } from "@/hooks/useTimerControls";
import { useTimerStore } from "@/store/useTimerStore";

function ExpandableSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      className="text-sm text-muted-foreground text-left w-full"
    >
      <span className={expanded ? "" : "line-clamp-1"}>{text}</span>
    </button>
  );
}

interface DashboardPageProps {
  goalEnabled: boolean;
  dailyGoalHours: number;
  weeklyGoalEnabled: boolean;
  weeklyGoalHours: number;
  monthlyGoalEnabled: boolean;
  monthlyGoalHours: number;
}

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClass: string;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
}

function PeriodProgressCard({
  label,
  icon: Icon,
  iconClass,
  progress,
  filterLabel,
}: {
  label: string;
  icon: LucideIcon;
  iconClass: string;
  progress: PeriodProgress;
  filterLabel?: string;
}) {
  return (
    <Card className="p-5 flex flex-col gap-3 h-full glow-purple-subtle border-primary/10">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconClass}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        {filterLabel ? (
          <p className="text-xs text-primary mt-0.5">{filterLabel}</p>
        ) : null}
        <div className="flex items-end justify-between gap-2 mt-1">
          <div className="text-2xl font-bold text-foreground">
            {formatMinutes(progress.workedMinutes)}
          </div>
          {progress.percentage != null ? (
            <div className="text-lg font-semibold text-primary tabular-nums">
              {progress.percentage}%
            </div>
          ) : null}
        </div>
        {progress.hasTarget ? (
          <>
            <Progress
              value={progressBarValue(progress.percentage)}
              className="h-1.5 mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {(progress.remainingMinutes ?? 0) === 0
                ? "Goal reached"
                : `${formatMinutes(progress.remainingMinutes ?? 0)} remaining`}
              {` · Goal ${formatMinutes(progress.goalMinutes)}`}
            </p>
          </>
        ) : null}
      </div>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
  subtitle,
  onClick,
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "p-5 flex flex-col gap-3 h-full glow-purple-subtle border-primary/10",
        onClick && "cursor-pointer hover:border-primary/30 transition-colors",
        className,
      )}
      onClick={onClick}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconClass}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="text-2xl font-bold text-foreground mt-1">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {subtitle}
            {onClick && <ArrowRight className="w-3 h-3" />}
          </p>
        )}
      </div>
    </Card>
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

function SessionRow({
  session,
  timezone,
}: {
  session: WorkSession;
  timezone: string;
}) {
  return (
    <div className="p-4 border border-border/60 rounded-lg hover:bg-muted/30 transition-colors">
      {session.title ? (
        <p className="font-semibold text-foreground mb-1">{session.title}</p>
      ) : null}
      {session.tagName ? (
        <p className="text-xs font-medium text-primary mb-1">{session.tagName}</p>
      ) : null}
      <div className="flex items-center gap-3 mb-2">
        <Clock className="w-4 h-4 text-primary" />
        <span className="font-medium text-foreground">
          {formatSessionClock(session.startTime, timezone)} -{" "}
          {formatSessionClock(session.endTime, timezone)}
        </span>
      </div>
      <div className="text-sm text-muted-foreground">
        Duration: {formatDurationSeconds(getSessionDurationSeconds(session))}
      </div>
      {session.summary ? <ExpandableSummary text={session.summary} /> : null}
    </div>
  );
}

function TagBadge({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors",
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
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
  return (
    <div className="flex flex-wrap gap-1.5">
      <TagBadge
        label={allLabel}
        selected={!selectedId}
        onClick={() => {
          onInteract?.();
          onSelect(undefined);
        }}
      />
      {tags.map((tag) => (
        <TagBadge
          key={tag.id}
          label={tag.name}
          selected={selectedId === tag.id}
          onClick={() => {
            onInteract?.();
            onSelect(tag.id);
          }}
        />
      ))}
    </div>
  );
}

export function DashboardPage({
  goalEnabled,
  dailyGoalHours,
  weeklyGoalEnabled,
  weeklyGoalHours,
  monthlyGoalEnabled,
  monthlyGoalHours,
}: DashboardPageProps) {
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
  const { isRunning, displayTime, handlePlay, beginPause, completePause } =
    useTimerControls();
  const sessionTitle = useTimerStore((state) => state.sessionTitle);
  const sessionTagId = useTimerStore((state) => state.tagId);
  const activeTagName = tags.find((tag) => tag.id === sessionTagId)?.name;
  const statsFilterLabel = statsTagId
    ? tags.find((tag) => tag.id === statsTagId)?.name
    : undefined;

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

  return (
    <div className="space-y-6 w-full">
      <Card className="relative overflow-hidden p-8 md:p-12 glow-purple border-primary/20">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] rounded-full border border-primary/10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[280px] rounded-full border border-primary/5" />
        </div>

        <div className="relative text-center space-y-4">
          {sessionTitle ? (
            <p className="text-lg font-semibold text-foreground px-4">
              {sessionTitle}
            </p>
          ) : null}
          {activeTagName ? (
            <p className="text-sm font-medium text-primary">{activeTagName}</p>
          ) : null}

          <div
            className="text-6xl md:text-7xl font-black text-foreground tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {displayTime}
          </div>

          {isRunning && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              <span className="text-sm text-muted-foreground">
                Currently Working
              </span>
            </div>
          )}
        </div>

        <div className="relative flex justify-center pt-6">
          {isRunning ? (
            <Button
              size="lg"
              className="gap-2 min-w-[140px]"
              onClick={openPauseModal}
            >
              <Pause className="w-4 h-4" />
              Pause
            </Button>
          ) : (
            <Button
              size="lg"
              className="gap-2 min-w-[140px]"
              onClick={openPlayModal}
            >
              <Play className="w-4 h-4" />
              Play
            </Button>
          )}
        </div>
      </Card>

      {tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Filter stats</p>
          <TagChipRow
            tags={tags}
            selectedId={statsTagId}
            onSelect={setStatsTagId}
            allLabel="All"
          />
        </div>
      ) : null}

      <StatCardGrid>
        {[
          <PeriodProgressCard
            key="today"
            label="Today"
            icon={Calendar}
            iconClass="stat-icon-purple"
            progress={todayProgress}
            filterLabel={statsFilterLabel}
          />,
          <PeriodProgressCard
            key="week"
            label="This Week"
            icon={FolderOpen}
            iconClass="stat-icon-amber"
            progress={weekProgress}
            filterLabel={statsFilterLabel}
          />,
          <PeriodProgressCard
            key="month"
            label="This Month"
            icon={CalendarDays}
            iconClass="stat-icon-blue"
            progress={monthProgress}
            filterLabel={statsFilterLabel}
          />,
          <StatCard
            key="sessions"
            label="Sessions Today"
            value={String(todaySessions.length)}
            icon={Activity}
            iconClass="stat-icon-green"
            subtitle="Click to view all"
            onClick={() => setShowSessions(true)}
          />,
          <StatCard
            key="best-day"
            label="Best Day"
            value={formatMinutes(lifetimeSummary?.bestDayMinutes ?? 0)}
            icon={Star}
            iconClass="stat-icon-blue"
            subtitle={bestDayDate ?? undefined}
          />,
          <StatCard
            key="streak"
            label="Current Streak"
            value={`${lifetimeSummary?.currentStreakDays ?? 0} days`}
            icon={Flame}
            iconClass="stat-icon-red"
            subtitle={
              (lifetimeSummary?.currentStreakDays ?? 0) > 0 ? "Keep it up!" : undefined
            }
          />,
        ]}
      </StatCardGrid>

      <Card className="p-5 glow-purple-subtle border-primary/10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="font-semibold text-foreground">Time by tag</p>
          <div className="flex gap-2">
            {(
              [
                ["today", "Today"],
                ["week", "This week"],
                ["month", "This month"],
              ] as const
            ).map(([range, label]) => (
              <Button
                key={range}
                type="button"
                size="sm"
                variant={breakdownRange === range ? "default" : "outline"}
                onClick={() => setBreakdownRange(range)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        {tagBreakdown?.tags.length ? (
          <div className="space-y-2">
            {tagBreakdown.tags.map((bucket) => (
              <div
                key={bucket.tagId ?? "untagged"}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-foreground">{bucket.tagName}</span>
                <span className="font-medium tabular-nums text-muted-foreground">
                  {formatMinutes(bucket.workedMinutes)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No tagged time in this period yet.
          </p>
        )}
      </Card>

      <AppDialog
        open={showSessions}
        onClose={() => setShowSessions(false)}
        title="Sessions Today"
        footer={
          <Button variant="outline" onClick={() => setShowSessions(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          {todaySessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sessions logged today yet.
            </p>
          ) : (
            todaySessions.map((session) => (
              <SessionRow
                key={session.id ?? session._id ?? session.startTime}
                session={session}
                timezone={timezone}
              />
            ))
          )}
        </div>
      </AppDialog>

      <AppDialog
        open={showTitleModal}
        onClose={dismissTitleModal}
        title="Start session"
        maxWidthClassName="max-w-md"
        scrollable
        footer={
          <>
            <Button variant="outline" onClick={dismissTitleModal}>
              {titleSkip.skipLabel}
            </Button>
            <Button onClick={confirmResume}>Resume</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Optional title for this session.
            </p>
            <Input
              value={titleInput}
              onChange={(e) => {
                setTitleInput(e.target.value);
                titleSkip.cancelCountdown();
              }}
              onFocus={titleSkip.cancelCountdown}
              placeholder="What are you working on?"
            />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Select a tag (optional).
            </p>
            {tags.length > 0 ? (
              <TagChipRow
                tags={tags}
                selectedId={selectedTagId}
                onSelect={setSelectedTagId}
                allLabel="None"
                onInteract={titleSkip.cancelCountdown}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No tags yet. Create them in Settings.
              </p>
            )}
          </div>
        </div>
      </AppDialog>

      <AppDialog
        open={showSummaryModal}
        onClose={dismissSummaryModal}
        title="Session Summary"
        maxWidthClassName="max-w-md"
        scrollable={false}
        footer={
          <>
            <Button variant="outline" onClick={dismissSummaryModal}>
              {summarySkip.skipLabel}
            </Button>
            <Button onClick={confirmPause}>Pause</Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          Add an optional summary before pausing.
        </p>
        <textarea
          value={summaryInput}
          onChange={(e) => {
            setSummaryInput(e.target.value);
            summarySkip.cancelCountdown();
          }}
          onFocus={summarySkip.cancelCountdown}
          placeholder="What did you accomplish?"
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </AppDialog>
    </div>
  );
}
