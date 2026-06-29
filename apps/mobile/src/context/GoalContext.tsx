import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  registerGoalStorage,
  useGoalState,
  type GoalStorage,
} from "@repo/queries";
import { userScopedAppStorage } from "@/utils/api";

type GoalContextValue = ReturnType<typeof useGoalState>;

const GoalContext = createContext<GoalContextValue | null>(null);

const mobileGoalStorage: GoalStorage = {
  getItem: (key) => userScopedAppStorage.getItem(key),
  setItem: (key, value) => userScopedAppStorage.setItem(key, value),
  removeItem: (key) => userScopedAppStorage.removeItem(key),
};

export function GoalProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    registerGoalStorage(mobileGoalStorage);
    return () => registerGoalStorage(null);
  }, []);

  const goalState = useGoalState(mobileGoalStorage);

  return (
    <GoalContext.Provider value={goalState}>{children}</GoalContext.Provider>
  );
}

export function useGoalContext() {
  const ctx = useContext(GoalContext);
  if (!ctx) throw new Error("useGoalContext requires GoalProvider");
  return ctx;
}
