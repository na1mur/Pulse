import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatTime,
  getLocalDayString,
  getTodayTimerDisplayMs,
} from "@repo/utils";
import {
  queryKeys,
  rolloverTimerForNewDay,
  seedTodayElapsedFromStats,
  useTodayStats,
} from "@repo/queries";
import { useTimerStore } from "@/store/useTimerStore";
import { useOfflineStore } from "@/store/useOfflineStore";
import {
  startTimer,
  pauseTimer,
  syncTimerStartFromState,
} from "@/hooks/useSocketSync";
import { api } from "@/utils/api";

const DEVICE_ID = "desktop";

interface PendingPauseSession {
  startTimeIso: string;
  title?: string;
}

export function useTimerControls() {
  const queryClient = useQueryClient();
  const { data: todayStats } = useTodayStats();
  const { isRunning, startedAt, elapsedBeforeCurrentRun } = useTimerStore();
  const { addPendingSession } = useOfflineStore();
  const [localElapsed, setLocalElapsed] = useState(0);
  const pendingPauseRef = useRef<PendingPauseSession | null>(null);
  const dayChangeRunningRef = useRef(false);

  const invalidateStats = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
    queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
    queryClient.invalidateQueries({ queryKey: queryKeys.weekStats });
    queryClient.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
    queryClient.invalidateQueries({ queryKey: queryKeys.todaySessions });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  }, [queryClient]);

  const saveSession = useCallback(
    async (payload: {
      startTime: string;
      endTime: string;
      deviceId: string;
      title?: string;
      summary?: string;
    }) => {
      try {
        await api.post("/sessions", payload);
        invalidateStats();
      } catch (err) {
        console.warn("API logging failed. Enqueueing session offline.", err);
        addPendingSession(payload);
      }
    },
    [addPendingSession, invalidateStats],
  );

  const runDayChange = useCallback(async () => {
    if (dayChangeRunningRef.current) return;
    const state = useTimerStore.getState();
    const today = getLocalDayString();
    if (!state.lastActiveDate || state.lastActiveDate === today) {
      if (state.lastActiveDate !== today) {
        useTimerStore.setState({ lastActiveDate: today });
      }
      return;
    }

    dayChangeRunningRef.current = true;
    try {
      const next = await rolloverTimerForNewDay(state, saveSession, DEVICE_ID);
      useTimerStore.setState(next);
      if (next.isRunning) {
        syncTimerStartFromState();
      }
    } finally {
      dayChangeRunningRef.current = false;
    }
  }, [saveSession]);

  useEffect(() => {
    void runDayChange();
    const interval = setInterval(() => {
      void runDayChange();
    }, 10000);
    return () => clearInterval(interval);
  }, [runDayChange]);

  useEffect(() => {
    if (!todayStats) return;
    const patch = seedTodayElapsedFromStats(
      useTimerStore.getState(),
      todayStats.workedMinutes,
    );
    if (patch) {
      useTimerStore.setState(patch);
    }
  }, [todayStats]);

  useEffect(() => {
    if (!isRunning) {
      setLocalElapsed(elapsedBeforeCurrentRun);
      return;
    }

    const update = () => {
      setLocalElapsed(
        getTodayTimerDisplayMs({
          isRunning,
          startedAt,
          elapsedBeforeCurrentRun,
        }),
      );
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [isRunning, startedAt, elapsedBeforeCurrentRun]);

  const handlePlay = (title?: string) => {
    const trimmed = title?.trim() || undefined;
    if (trimmed) {
      useTimerStore.setState({ sessionTitle: trimmed });
    }
    startTimer(trimmed);
  };

  const beginPause = () => {
    const timerState = useTimerStore.getState();
    if (!timerState.isRunning || !timerState.startedAt) return;

    const elapsed = getTodayTimerDisplayMs(timerState);
    pendingPauseRef.current = {
      startTimeIso: new Date(timerState.startedAt).toISOString(),
      title: timerState.sessionTitle,
    };
    pauseTimer(elapsed);
  };

  const completePause = async (summary?: string) => {
    const pending = pendingPauseRef.current;
    if (!pending) return;

    await saveSession({
      startTime: pending.startTimeIso,
      endTime: new Date().toISOString(),
      deviceId: DEVICE_ID,
      ...(pending.title ? { title: pending.title } : {}),
      ...(summary?.trim() ? { summary: summary.trim() } : {}),
    });
    pendingPauseRef.current = null;
  };

  return {
    isRunning,
    displayTime: formatTime(localElapsed),
    localElapsedMs: localElapsed,
    handlePlay,
    beginPause,
    completePause,
  };
}
