import { useState } from "react";
import {
  Clock,
  Pause,
  Play,
  Calendar,
  Activity,
  FolderOpen,
  Star,
  Flame,
  Target,
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
  getSessionDurationSeconds,
  minutesToHours,
} from "@repo/utils";
import type { WorkSession } from "@repo/types";
import { Input } from "@/components/ui/input";
import {
  useStatsSummary,
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
    <div className="p-4 border border-border/60 rounded-xl hover:bg-muted/30 transition-colors">
      {session.title ? (
        <p className="font-semibold text-foreground mb-1">{session.title}</p>
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

export function DashboardPage({
  goalEnabled,
  dailyGoalHours,
}: DashboardPageProps) {
  const [showSessions, setShowSessions] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [summaryInput, setSummaryInput] = useState("");
  const { data: todayStats } = useTodayStats();
  const { data: summary } = useStatsSummary();
  const { data: todaySessions = [] } = useTodaySessions();
  const { isRunning, displayTime, handlePlay, beginPause, completePause } =
    useTimerControls();
  const sessionTitle = useTimerStore((state) => state.sessionTitle);

  const timezone = getDisplayTimezone();
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
              onClick={() => setShowTitleModal(true)}
            >
              <Play className="w-4 h-4" />
              Play
            </Button>
          )}
        </div>
      </Card>

      <StatCardGrid>
        {[
          <StatCard
            key="worked"
            label="Worked Today"
            value={formatMinutes(workedMinutes)}
            icon={Calendar}
            iconClass="stat-icon-purple"
            subtitle={goalEnabled ? `Goal: ${dailyGoalHours}h` : undefined}
          />,

          goalEnabled ? (
            <Card
              key="progress"
              className="p-5 flex flex-col gap-3 h-full glow-purple-subtle border-primary/10"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center stat-icon-purple">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Progress</p>
                <div className="text-2xl font-bold text-primary mt-1">
                  {progressPercentage}%
                </div>
                <Progress
                  value={Math.min(progressPercentage, 100)}
                  className="h-1.5 mt-2"
                />
              </div>
            </Card>
          ) : null,

          goalEnabled ? (
            <StatCard
              key="remaining"
              label="Remaining"
              value={formatMinutes(Math.round(remainingHours * 60))}
              icon={Clock}
              iconClass="stat-icon-amber"
            />
          ) : null,

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
            key="week"
            label="This Week"
            value={formatMinutes(summary?.weeklyWorkedMinutes ?? 0)}
            icon={FolderOpen}
            iconClass="stat-icon-amber"
          />,

          <StatCard
            key="best-day"
            label="Best Day"
            value={formatMinutes(summary?.bestDayMinutes ?? 0)}
            icon={Star}
            iconClass="stat-icon-blue"
            subtitle={bestDayDate ?? undefined}
          />,

          <StatCard
            key="streak"
            label="Current Streak"
            value={`${summary?.currentStreakDays ?? 0} days`}
            icon={Flame}
            iconClass="stat-icon-red"
            subtitle={
              (summary?.currentStreakDays ?? 0) > 0 ? "Keep it up!" : undefined
            }
          />,
        ].filter(Boolean)}
      </StatCardGrid>

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
        title="Session Title"
        maxWidthClassName="max-w-md"
        scrollable={false}
        footer={
          <>
            <Button variant="outline" onClick={dismissTitleModal}>
              {titleSkip.skipLabel}
            </Button>
            <Button onClick={confirmResume}>Resume</Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          Add an optional title for this session.
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
