import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, View, Platform } from "react-native";
import { Trophy, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GoalAchievementEvent } from "@repo/types";
import {
  getGoalAchievementLabel,
  getGoalAchievementMessage,
} from "@repo/utils";
import { subscribeGoalAchievements } from "@repo/queries";
import { ThemedText } from "@/components/ThemeShell";
import { useThemeColors } from "@/hooks/useThemeColors";

const AUTO_DISMISS_MS = 6000;

interface ToastItem extends GoalAchievementEvent {
  id: string;
}

function showNativeNotification(title: string, body: string) {
  if (Platform.OS !== "web" || typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function AchievementToast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const colors = useThemeColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }],
      }}
    >
      <View
        className="flex-row items-start gap-3 rounded-xl border p-4 shadow-lg"
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...Platform.select({
            web: { boxShadow: "0 10px 25px rgba(0,0,0,0.12)" },
            default: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
              elevation: 6,
            },
          }),
        }}
      >
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primary }}
        >
          <Trophy size={16} color={colors.primaryForeground} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <ThemedText className="text-sm font-semibold">
            {getGoalAchievementLabel(toast.type)}
          </ThemedText>
          <ThemedText muted className="text-sm">
            {getGoalAchievementMessage(toast.type, toast.workedMinutes)}
          </ThemedText>
        </View>
        <Pressable
          onPress={() => onDismiss(toast.id)}
          className="rounded-md p-1"
          accessibilityLabel="Dismiss notification"
        >
          <X size={16} color={colors.muted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function AchievementNotifier() {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (
      Platform.OS === "web" &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
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
      setTimeout(() => {
        dismissToast(id);
      }, AUTO_DISMISS_MS);
    });
  }, [dismissToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-4 right-4 z-50 gap-2"
      style={{ top: insets.top + 8 }}
    >
      {toasts.map((toast) => (
        <AchievementToast
          key={toast.id}
          toast={toast}
          onDismiss={dismissToast}
        />
      ))}
    </View>
  );
}
