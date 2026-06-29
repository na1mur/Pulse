import { useEffect, useState } from "react";
import type { AppPage } from "@repo/types";
import { useGoalState } from "@repo/queries";
import { AuthPages } from "@/components/AuthPages";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSocketSync } from "@/hooks/useSocketSync";
import { useSyncManager } from "@/hooks/useSyncManager";
import { useUserSettings } from "@/hooks/usePulseQueries";
import { TOKEN_KEYS } from "@/utils/api";
import { createLocalStorageAdapter } from "@repo/api-client";

const storage = createLocalStorageAdapter();

const desktopGoalStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};

function readAccessToken() {
  return localStorage.getItem(TOKEN_KEYS.access);
}

function PulseApp({ onLogout }: { onLogout: () => void }) {
  useSyncManager();
  useSocketSync();

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
    storage.clearTokens();
    onLogout();
  };

  const userEmail =
    settings?.email ??
    localStorage.getItem(TOKEN_KEYS.email) ??
    "user@example.com";

  return (
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
      userEmail={userEmail}
      onLogout={handleLogout}
    />
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(readAccessToken);

  useEffect(() => {
    const syncSession = () => {
      setToken(readAccessToken());
    };
    window.addEventListener("storage", syncSession);
    window.addEventListener("pulse-session-changed", syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("pulse-session-changed", syncSession);
    };
  }, []);

  if (!token) {
    return (
      <AuthPages
        onAuthSuccess={(accessToken) => {
          setToken(accessToken);
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
