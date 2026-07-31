import { parsePersistedJsonState, PERSIST_STORE_KEYS } from "@repo/api-client";
import { getLocalDayString } from "@repo/utils";
import { scopedPersistStorage } from "./scopedStorage";
import { useTimerStore } from "./useTimerStore";
import { useOfflineStore } from "./useOfflineStore";

const DEFAULT_TIMER_STATE = {
  isRunning: false,
  startedAt: undefined as number | undefined,
  elapsedBeforeCurrentRun: 0,
  lastActiveDate: undefined as string | undefined,
};

const DEFAULT_OFFLINE_STATE = {
  pendingSessions: [] as Array<{
    localId: string;
    startTime: string;
    endTime: string;
    deviceId: string;
  }>,
};

export async function rehydrateUserPersistedStores(): Promise<void> {
  const [timerRaw, offlineRaw] = await Promise.all([
    scopedPersistStorage.getItem(PERSIST_STORE_KEYS.timer),
    scopedPersistStorage.getItem(PERSIST_STORE_KEYS.offline),
  ]);

  const timerState = parsePersistedJsonState(timerRaw, DEFAULT_TIMER_STATE);
  const offlineState = parsePersistedJsonState(
    offlineRaw,
    DEFAULT_OFFLINE_STATE,
  );

  if (timerState.isRunning && timerState.startedAt) {
    const today = getLocalDayString();
    if (!timerState.lastActiveDate || timerState.lastActiveDate === today) {
      const sessionElapsed = Date.now() - timerState.startedAt;
      timerState.elapsedBeforeCurrentRun =
        (timerState.elapsedBeforeCurrentRun ?? 0) + sessionElapsed;
      timerState.isRunning = false;
      timerState.startedAt = undefined;
    }
  }

  useTimerStore.setState(timerState);
  useOfflineStore.setState(offlineState);
}
