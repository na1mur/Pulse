import { useState } from "react";
import { Clock, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  formatMinutes,
  formatSessionClock,
  minutesToHours,
} from "@repo/utils";
import {
  useStatsSummary,
  useTodaySessions,
  useTodayStats,
  useUserSettings,
} from "@/hooks/usePulseQueries";
import { useTimerControls } from "@/hooks/useTimerControls";

interface DashboardPageProps {
  goalEnabled: boolean;
  dailyGoalHours: number;
}

export function DashboardPage({
  goalEnabled,
  dailyGoalHours,
}: DashboardPageProps) {
  const [showSessions, setShowSessions] = useState(false);
  const { data: todayStats } = useTodayStats();
  const { data: summary } = useStatsSummary();
  const { data: todaySessions = [] } = useTodaySessions();
  const { data: settings } = useUserSettings();
  const { isRunning, displayTime, handlePlay, handlePause } = useTimerControls();

  const timezone = settings?.timezone ?? "UTC";
  const workedMinutes = todayStats?.workedMinutes ?? 0;
  const workedHours = minutesToHours(workedMinutes);
  const progressPercentage =
    goalEnabled && dailyGoalHours > 0
      ? Math.round((workedHours / dailyGoalHours) * 100)
      : (todayStats?.percentage ?? 0);
  const remainingHours = Math.max(0, dailyGoalHours - workedHours);

  return (
    <div className="space-y-6">
      <Card className="p-8 md:p-12 space-y-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Current Session</p>
          <div className="text-6xl md:text-7xl font-light text-primary font-mono">
            {displayTime}
          </div>
          {isRunning && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
              <span className="text-sm text-foreground">Currently Working</span>
            </div>
          )}
        </div>

        <div className="flex justify-center pt-4">
          {isRunning ? (
            <Button size="lg" className="gap-2" onClick={handlePause}>
              <Pause className="w-4 h-4" />
              Pause
            </Button>
          ) : (
            <Button size="lg" className="gap-2" onClick={handlePlay}>
              <Play className="w-4 h-4" />
              Play
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">Worked Today</p>
          <div className="text-3xl font-semibold text-foreground">
            {formatMinutes(workedMinutes)}
          </div>
          {goalEnabled && (
            <p className="text-xs text-muted-foreground">
              Goal: {dailyGoalHours}h
            </p>
          )}
        </Card>

        {goalEnabled && (
          <Card className="p-6 space-y-3">
            <p className="text-sm text-muted-foreground">Progress</p>
            <div className="space-y-2">
              <div className="text-3xl font-semibold text-primary">
                {progressPercentage}%
              </div>
              <Progress
                value={Math.min(progressPercentage, 100)}
                className="h-2"
              />
            </div>
          </Card>
        )}

        {goalEnabled && (
          <Card className="p-6 space-y-3">
            <p className="text-sm text-muted-foreground">Remaining</p>
            <div className="text-3xl font-semibold text-foreground">
              {formatMinutes(Math.round(remainingHours * 60))}
            </div>
          </Card>
        )}

        <Card
          className="p-6 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setShowSessions(true)}
        >
          <p className="text-sm text-muted-foreground">Sessions Today</p>
          <div className="text-3xl font-semibold text-foreground">
            {todaySessions.length}
          </div>
          <p className="text-xs text-muted-foreground">Click to view all</p>
        </Card>

        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">This Week</p>
          <div className="text-3xl font-semibold text-foreground">
            {formatMinutes(summary?.weeklyWorkedMinutes ?? 0)}
          </div>
        </Card>

        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">Best Day</p>
          <div className="text-3xl font-semibold text-foreground">
            {formatMinutes(summary?.bestDayMinutes ?? 0)}
          </div>
        </Card>

        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">Current Streak</p>
          <div className="text-3xl font-semibold text-foreground">
            {summary?.currentStreakDays ?? 0} days
          </div>
        </Card>
      </div>

      {showSessions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl space-y-6 p-6 md:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-foreground">
                Sessions Today
              </h2>
              <Button
                variant="ghost"
                onClick={() => setShowSessions(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </Button>
            </div>

            <div className="space-y-3">
              {todaySessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No sessions logged today yet.
                </p>
              ) : (
                todaySessions.map((session) => (
                  <div
                    key={session.id ?? session._id ?? session.startTime}
                    className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {formatSessionClock(session.startTime, timezone)} -{" "}
                        {formatSessionClock(session.endTime, timezone)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Duration: {formatMinutes(session.durationMinutes)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowSessions(false)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
