import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { appStorage } from "@/utils/api";
import { useUserSettings } from "@/hooks/usePulseQueries";

interface GoalContextValue {
  goalEnabled: boolean;
  setGoalEnabled: (v: boolean) => void;
  dailyGoalHours: number;
  setDailyGoalHours: (v: number) => void;
}

const GoalContext = createContext<GoalContextValue | null>(null);

export function GoalProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useUserSettings();
  const [goalEnabled, setGoalEnabled] = useState(false);
  const [dailyGoalHours, setDailyGoalHours] = useState(8);

  useEffect(() => {
    if (settings) {
      const hours = Math.round(settings.dailyTargetMinutes / 60);
      setGoalEnabled(settings.dailyTargetMinutes > 0);
      if (settings.dailyTargetMinutes > 0) {
        setDailyGoalHours(hours || 8);
        appStorage.setItem("pulse-last-goal-hours", String(hours || 8));
      }
    }
  }, [settings]);

  return (
    <GoalContext.Provider
      value={{
        goalEnabled,
        setGoalEnabled,
        dailyGoalHours,
        setDailyGoalHours,
      }}
    >
      {children}
    </GoalContext.Provider>
  );
}

export function useGoalContext() {
  const ctx = useContext(GoalContext);
  if (!ctx) throw new Error("useGoalContext requires GoalProvider");
  return ctx;
}
