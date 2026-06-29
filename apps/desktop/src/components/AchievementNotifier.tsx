import { useCallback, useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import type { GoalAchievementEvent } from "@repo/types";
import {
  getGoalAchievementLabel,
  getGoalAchievementMessage,
} from "@repo/utils";
import { subscribeGoalAchievements } from "@repo/queries";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 6000;

interface ToastItem extends GoalAchievementEvent {
  id: string;
}

function showNativeNotification(title: string, body: string) {
  if (typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

export function AchievementNotifier() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    return subscribeGoalAchievements((event) => {
      const title = getGoalAchievementLabel(event.type);
      const message = getGoalAchievementMessage(
        event.type,
        event.workedMinutes,
      );
      showNativeNotification(title, message);

      const id = `${event.type}-${event.periodKey}-${Date.now()}`;
      setToasts((current) => [...current, { ...event, id }]);

      window.setTimeout(() => {
        dismissToast(id);
      }, AUTO_DISMISS_MS);
    });
  }, [dismissToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg",
            "animate-in slide-in-from-bottom-4 fade-in duration-300",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Trophy className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {getGoalAchievementLabel(toast.type)}
            </p>
            <p className="text-sm text-muted-foreground">
              {getGoalAchievementMessage(toast.type, toast.workedMinutes)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
