import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import BackgroundService from "react-native-background-actions";
import { useTimerStore } from "@/store/useTimerStore";

const sleep = (time: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, time));

async function keepAliveTask() {
  while (BackgroundService.isRunning()) {
    await sleep(15000);
  }
}

const backgroundOptions = {
  taskName: "PulseTimerSync",
  taskTitle: "Pulse timer running",
  taskDesc: "Keeping your session synced across devices",
  taskIcon: {
    name: "ic_launcher",
    type: "mipmap",
  },
  color: "#7C3AED",
  linkingURI: "pulse://",
};

export function useTimerForegroundService() {
  const isRunning = useTimerStore((state) => state.isRunning);
  const startingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const syncService = async () => {
      if (isRunning) {
        if (BackgroundService.isRunning() || startingRef.current) return;
        startingRef.current = true;
        try {
          await BackgroundService.start(keepAliveTask, backgroundOptions);
        } catch (error) {
          console.warn("[Pulse] Failed to start foreground service:", error);
        } finally {
          startingRef.current = false;
        }
        return;
      }

      if (BackgroundService.isRunning()) {
        try {
          await BackgroundService.stop();
        } catch (error) {
          console.warn("[Pulse] Failed to stop foreground service:", error);
        }
      }
    };

    void syncService();
  }, [isRunning]);
}
