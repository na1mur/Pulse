import { useEffect, useState } from "react";
import type { AppPage } from "@repo/types";
import {
  bootstrapUserSession,
  deactivateUserSession,
  registerGoalStorage,
  resetGoalAchievementDedup,
  useGoalState,
} from "@repo/queries";
import { getUserIdFromAccessToken } from "@repo/api-client";
import { AchievementNotifier } from "@/components/AchievementNotifier";
import { AuthPages } from "@/components/AuthPages";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSocketSync } from "@/hooks/useSocketSync";
import { useSyncManager } from "@/hooks/useSyncManager";
import { useTimezoneSync } from "@/hooks/useTimezoneSync";
import { useUserSettings } from "@/hooks/usePulseQueries";
import { rehydrateUserPersistedStores } from "@/store/rehydrateUserStores";
import { queryClient } from "@/main";
import {
  hasValidSession,
  rawStorage,
  startSessionTokenRefresh,
  stopSessionTokenRefresh,
  storage,
  TOKEN_KEYS,
  userScopedAppStorage,
} from "@/utils/api";

const desktopGoalStorage = {
  getItem: (key: string) => userScopedAppStorage.getItem(key),
  setItem: (key: string, value: string) =>
    userScopedAppStorage.setItem(key, value),
  removeItem: (key: string) => userScopedAppStorage.removeItem(key),
};

function readAccessToken() {
  return localStorage.getItem(TOKEN_KEYS.access);
}

function PulseApp({ onLogout }: { onLogout: () => void }) {
  useSyncManager();
  useSocketSync();
  useTimezoneSync();

  useEffect(() => {
    registerGoalStorage(desktopGoalStorage);
    return () => registerGoalStorage(null);
  }, []);

  const [currentPage, setCurrentPage] = useState<AppPage>("dashboard");
  const {
    goalEnabled,
    setGoalEnabled,
    dailyGoalHours,
    setDailyGoalHours,
    weeklyGoalEnabled,
    setWeeklyGoalEnabled,
    weeklyGoalHours,
    setWeeklyGoalHours,
    monthlyGoalEnabled,
    setMonthlyGoalEnabled,
    monthlyGoalHours,
    setMonthlyGoalHours,
  } = useGoalState(desktopGoalStorage);
  const { data: settings } = useUserSettings();

  const handleLogout = () => {
    stopSessionTokenRefresh();
    deactivateUserSession(queryClient);
    storage.clearTokens();
    resetGoalAchievementDedup();
    onLogout();
  };

  const userEmail =
    settings?.email ??
    localStorage.getItem(TOKEN_KEYS.email) ??
    "user@example.com";
  const userName = settings?.name ?? "";

  return (
    <>
      <AppLayout
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        goalEnabled={goalEnabled}
        onGoalEnabledChange={setGoalEnabled}
        dailyGoalHours={dailyGoalHours}
        onDailyGoalHoursChange={setDailyGoalHours}
        weeklyGoalEnabled={weeklyGoalEnabled}
        onWeeklyGoalEnabledChange={setWeeklyGoalEnabled}
        weeklyGoalHours={weeklyGoalHours}
        onWeeklyGoalHoursChange={setWeeklyGoalHours}
        monthlyGoalEnabled={monthlyGoalEnabled}
        onMonthlyGoalEnabledChange={setMonthlyGoalEnabled}
        monthlyGoalHours={monthlyGoalHours}
        onMonthlyGoalHoursChange={setMonthlyGoalHours}
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />
      <AchievementNotifier />
    </>
  );
}

async function restoreUserSession(accessToken: string | null): Promise<void> {
  if (!accessToken) return;

  const userId = getUserIdFromAccessToken(accessToken);
  if (!userId) return;

  await bootstrapUserSession({
    userId,
    queryClient,
    rehydrateStores: rehydrateUserPersistedStores,
    goalStorageBackend: rawStorage,
  });
}

export default function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function initSession() {
      const valid = await hasValidSession();
      if (!active) return;

      const accessToken = valid ? readAccessToken() : null;
      if (accessToken) {
        await restoreUserSession(accessToken);
      }

      setToken(accessToken);
      setSessionReady(true);
      if (valid) {
        startSessionTokenRefresh();
      }
    }

    void initSession();

    const syncSession = () => {
      setToken(readAccessToken());
    };
    window.addEventListener("storage", syncSession);
    window.addEventListener("pulse-session-changed", syncSession);

    return () => {
      active = false;
      stopSessionTokenRefresh();
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("pulse-session-changed", syncSession);
    };
  }, []);

  if (!sessionReady) {
    return null;
  }

  if (!token) {
    return (
      <AuthPages
        onAuthSuccess={async (accessToken, userId) => {
          await bootstrapUserSession({
            userId,
            queryClient,
            rehydrateStores: rehydrateUserPersistedStores,
            goalStorageBackend: rawStorage,
          });
          setToken(accessToken);
          startSessionTokenRefresh();
          window.dispatchEvent(new Event("pulse-session-changed"));
        }}
      />
    );
  }

  return (
    <PulseApp
      onLogout={() => {
        setToken(null);
        window.dispatchEvent(new Event("pulse-session-changed"));
      }}
    />
  );
}
