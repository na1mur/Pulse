import { createContext, useContext, type ReactNode } from "react";
import { useGoalState, type GoalStorage } from "@repo/queries";
import { appStorage } from "@/utils/api";

type GoalContextValue = ReturnType<typeof useGoalState>;

const GoalContext = createContext<GoalContextValue | null>(null);

const mobileGoalStorage: GoalStorage = {
  getItem: (key) => appStorage.getItem(key),
  setItem: (key, value) => appStorage.setItem(key, value),
};

export function GoalProvider({ children }: { children: ReactNode }) {
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
