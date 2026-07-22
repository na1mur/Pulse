import { useEffect, useState } from "react";

interface WidgetState {
  isRunning: boolean;
  displayTime: string;
  runningColor: string;
  pausedColor: string;
}

const defaultState: WidgetState = {
  isRunning: false,
  displayTime: "00:00:00",
  runningColor: "#22c55e",
  pausedColor: "#ef4444",
};

export function TaskbarWidget() {
  const [state, setState] = useState<WidgetState>(defaultState);

  useEffect(() => {
    const api = window.electronWidget;
    if (!api) return;

    const unsubTimer = api.onTimerState((next) => setState(next));
    const unsubPrefs = api.onPrefsUpdated((prefs) =>
      setState((prev) => ({
        ...prev,
        runningColor: prefs.runningColor,
        pausedColor: prefs.pausedColor,
      })),
    );

    return () => {
      unsubTimer();
      unsubPrefs();
    };
  }, []);

  const color = state.isRunning ? state.runningColor : state.pausedColor;

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        window.electronWidget?.showContextMenu();
      }}
      title={state.isRunning ? "Timer running" : "Timer paused"}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(24, 24, 27, 0.85)",
        borderRadius: 4,
        cursor: "default",
      }}
    >
      <span
        style={{
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color,
          letterSpacing: "0.02em",
        }}
      >
        {state.displayTime}
      </span>
    </div>
  );
}
