import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppPage } from "@repo/types";
import { AuthPages } from "@/components/AuthPages";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSocketSync } from "@/hooks/useSocketSync";
import { useSyncManager } from "@/hooks/useSyncManager";
import { useUserSettings } from "@/hooks/usePulseQueries";
import { TOKEN_KEYS } from "@/utils/api";
import { createLocalStorageAdapter } from "@repo/api-client";

const queryClient = new QueryClient();
const storage = createLocalStorageAdapter();

function PulseApp({ onLogout }: { onLogout: () => void }) {
  useSyncManager();
  useSocketSync();

  const [currentPage, setCurrentPage] = useState<AppPage>("dashboard");
  const [goalEnabled, setGoalEnabled] = useState(false);
  const [dailyGoalHours, setDailyGoalHours] = useState(8);
  const { data: settings } = useUserSettings();

  useEffect(() => {
    if (settings) {
      const hours = Math.round(settings.dailyTargetMinutes / 60);
      setGoalEnabled(settings.dailyTargetMinutes > 0);
      if (settings.dailyTargetMinutes > 0) {
        setDailyGoalHours(hours || 8);
        localStorage.setItem("pulse-last-goal-hours", String(hours || 8));
      }
    }
  }, [settings]);

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
      userEmail={userEmail}
      onLogout={handleLogout}
    />
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(TOKEN_KEYS.access),
  );

  if (!token) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthPages onAuthSuccess={(accessToken) => setToken(accessToken)} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PulseApp onLogout={() => setToken(null)} />
    </QueryClientProvider>
  );
}
