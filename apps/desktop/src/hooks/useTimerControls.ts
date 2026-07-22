import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatTime } from "@repo/utils";
import { useTimerStore } from "@/store/useTimerStore";
import { useOfflineStore } from "@/store/useOfflineStore";
import { startTimer, pauseTimer } from "@/hooks/useSocketSync";
import { api } from "@/utils/api";
import { queryKeys } from "@repo/queries";

export function useTimerControls() {
  const queryClient = useQueryClient();
  const { isRunning, startedAt, elapsedBeforeCurrentRun, checkDayChange } =
    useTimerStore();
  const { addPendingSession } = useOfflineStore();
  const [localElapsed, setLocalElapsed] = useState(0);
  const [pendingTitle, setPendingTitle] = useState<string | undefined>();

  useEffect(() => {
    checkDayChange();
    const interval = setInterval(checkDayChange, 10000);
    return () => clearInterval(interval);
  }, [checkDayChange]);

  useEffect(() => {
    if (!isRunning) {
      setLocalElapsed(elapsedBeforeCurrentRun);
      return;
    }

    setLocalElapsed(
      elapsedBeforeCurrentRun + (Date.now() - (startedAt || Date.now())),
    );

    const interval = setInterval(() => {
      setLocalElapsed(
        elapsedBeforeCurrentRun + (Date.now() - (startedAt || Date.now())),
      );
    }, 100);

    return () => clearInterval(interval);
  }, [isRunning, startedAt, elapsedBeforeCurrentRun]);

  const handlePlay = (title?: string) => {
    setPendingTitle(title?.trim() || undefined);
    startTimer();
  };

  const handlePause = async (summary?: string) => {
    if (!startedAt) return;
    const startTimeIso = new Date(startedAt).toISOString();
    const endTimeIso = new Date().toISOString();
    const sessionPayload = {
      startTime: startTimeIso,
      endTime: endTimeIso,
      deviceId: "desktop",
      ...(pendingTitle ? { title: pendingTitle } : {}),
      ...(summary?.trim() ? { summary: summary.trim() } : {}),
    };

    pauseTimer(localElapsed);
    setPendingTitle(undefined);

    try {
      await api.post("/sessions", sessionPayload);
      queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
      queryClient.invalidateQueries({ queryKey: queryKeys.weekStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
      queryClient.invalidateQueries({ queryKey: queryKeys.todaySessions });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (err) {
      console.warn("API logging failed. Enqueueing session offline.", err);
      addPendingSession(sessionPayload);
    }
  };

  return {
    isRunning,
    displayTime: formatTime(localElapsed),
    localElapsedMs: localElapsed,
    handlePlay,
    handlePause,
  };
}
