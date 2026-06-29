import { useTimerStore } from "./useTimerStore";
import { useOfflineStore } from "./useOfflineStore";

export async function rehydrateUserPersistedStores(): Promise<void> {
  useTimerStore.setState({
    isRunning: false,
    startedAt: undefined,
    elapsedBeforeCurrentRun: 0,
    lastActiveDate: undefined,
  });
  useOfflineStore.setState({ pendingSessions: [] });

  await useTimerStore.persist.rehydrate();
  await useOfflineStore.persist.rehydrate();
}
