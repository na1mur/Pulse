import { useCallback, useEffect, useRef, useState } from "react";

interface UseAutoSkipCountdownOptions {
  isOpen: boolean;
  seconds?: number;
  onAutoSkip: () => void;
}

export function useAutoSkipCountdown({
  isOpen,
  seconds = 5,
  onAutoSkip,
}: UseAutoSkipCountdownOptions) {
  const [remaining, setRemaining] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);
  const onAutoSkipRef = useRef(onAutoSkip);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  onAutoSkipRef.current = onAutoSkip;

  const clearCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const cancelCountdown = useCallback(() => {
    clearCountdown();
    setCancelled(true);
  }, [clearCountdown]);

  useEffect(() => {
    if (!isOpen) {
      clearCountdown();
      setRemaining(seconds);
      setCancelled(false);
      return;
    }

    setRemaining(seconds);
    setCancelled(false);
    clearCountdown();

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearCountdown();
          onAutoSkipRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearCountdown;
  }, [isOpen, seconds, clearCountdown]);

  const skipLabel = cancelled ? "Skip" : `Skip (${remaining})`;

  return { skipLabel, cancelCountdown, cancelled };
}
