import { useEffect } from "react";
import { useTimerControls } from "@/hooks/useTimerControls";
import { useTimerStore } from "@/store/useTimerStore";
import { useTodaySessions, useTodayStats } from "@/hooks/usePulseQueries";

export function useElectronBridge(
  goalEnabled: boolean,
  dailyGoalHours: number,
) {
  const { isRunning, displayTime } = useTimerControls();
  const sessionTitle = useTimerStore((s) => s.sessionTitle);
  const { data: todayStats } = useTodayStats();
  const { data: todaySessions = [] } = useTodaySessions();

  useEffect(() => {
    if (!window.electron) return;

    window.electron.sendTimerState({
      isRunning,
      displayTime,
      sessionTitle,
    });
  }, [isRunning, displayTime, sessionTitle]);

  useEffect(() => {
    if (!window.electron) return;

    const workedMinutes = todayStats?.workedMinutes ?? 0;
    const workedHours = workedMinutes / 60;
    const progressPercent =
      goalEnabled && dailyGoalHours > 0
        ? Math.round((workedHours / dailyGoalHours) * 100)
        : (todayStats?.percentage ?? null);

    window.electron.sendTodayReport({
      workedMinutes,
      sessionCount: todaySessions.length,
      progressPercent,
      goalEnabled,
    });
  }, [todayStats, todaySessions.length, goalEnabled, dailyGoalHours]);
}
