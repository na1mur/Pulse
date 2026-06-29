import type { QueryClient } from "@tanstack/react-query";
import {
  activateUserSession,
  migrateLegacyGoalStorage,
  type KeyValueStorage,
} from "@repo/api-client";

export interface BootstrapUserSessionOptions {
  userId: string;
  queryClient: QueryClient;
  rehydrateStores: () => Promise<void>;
  goalStorageBackend?: KeyValueStorage;
}

export async function bootstrapUserSession({
  userId,
  queryClient,
  rehydrateStores,
  goalStorageBackend,
}: BootstrapUserSessionOptions): Promise<void> {
  activateUserSession(userId);

  if (goalStorageBackend) {
    await migrateLegacyGoalStorage(goalStorageBackend, userId);
  }

  await rehydrateStores();
  queryClient.clear();
}

export function deactivateUserSession(queryClient: QueryClient): void {
  activateUserSession(null);
  queryClient.clear();
}
