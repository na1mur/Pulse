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
  const firedRef = useRef(false);

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
      firedRef.current = false;
      setRemaining(seconds);
      setCancelled(false);
      return;
    }

    firedRef.current = false;
    setRemaining(seconds);
    setCancelled(false);
    clearCountdown();

    let ticksLeft = seconds;
    intervalRef.current = setInterval(() => {
      ticksLeft -= 1;
      setRemaining(ticksLeft);
      if (ticksLeft <= 0) {
        clearCountdown();
        if (!firedRef.current) {
          firedRef.current = true;
          onAutoSkipRef.current();
        }
      }
    }, 1000);

    return clearCountdown;
  }, [isOpen, seconds, clearCountdown]);

  const skipLabel = cancelled ? "Skip" : `Skip (${remaining})`;

  return { skipLabel, cancelCountdown, cancelled };
}
