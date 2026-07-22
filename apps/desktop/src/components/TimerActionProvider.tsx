import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTimerControls } from "@/hooks/useTimerControls";

interface TimerActionContextValue {
  requestPlay: (withTitle?: boolean) => void;
  requestPause: (withSummary?: boolean) => void;
  togglePlayPause: () => void;
}

const TimerActionContext = createContext<TimerActionContextValue | null>(null);

export function useTimerActions() {
  const ctx = useContext(TimerActionContext);
  if (!ctx) {
    throw new Error("useTimerActions must be used within TimerActionProvider");
  }
  return ctx;
}

interface TimerActionProviderProps {
  children: ReactNode;
  onShowTodayReport?: () => void;
}

export function TimerActionProvider({
  children,
  onShowTodayReport,
}: TimerActionProviderProps) {
  const { isRunning, handlePlay, handlePause } = useTimerControls();
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [summaryInput, setSummaryInput] = useState("");

  const requestPlay = useCallback(
    (withTitle = false) => {
      if (withTitle) {
        setShowTitleModal(true);
        return;
      }
      handlePlay();
    },
    [handlePlay],
  );

  const requestPause = useCallback(
    (withSummary = false) => {
      if (withSummary) {
        setShowSummaryModal(true);
        return;
      }
      void handlePause();
    },
    [handlePause],
  );

  const togglePlayPause = useCallback(() => {
    if (isRunning) {
      void handlePause();
    } else {
      handlePlay();
    }
  }, [isRunning, handlePlay, handlePause]);

  useEffect(() => {
    if (!window.electron) return;

    const unsubs = [
      window.electron.onTrayToggle(togglePlayPause),
      window.electron.onTrayPlayWithTitle(() => {
        setShowTitleModal(true);
      }),
      window.electron.onTrayPauseWithSummary(() => {
        setShowSummaryModal(true);
      }),
      window.electron.onTrayShowTodayReport(() => {
        onShowTodayReport?.();
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [togglePlayPause, onShowTodayReport]);

  const confirmResume = () => {
    handlePlay(titleInput);
    setTitleInput("");
    setShowTitleModal(false);
  };

  const dismissTitleModal = () => {
    handlePlay();
    setTitleInput("");
    setShowTitleModal(false);
  };

  const confirmPause = () => {
    void handlePause(summaryInput);
    setSummaryInput("");
    setShowSummaryModal(false);
  };

  const dismissSummaryModal = () => {
    void handlePause();
    setSummaryInput("");
    setShowSummaryModal(false);
  };

  return (
    <TimerActionContext.Provider
      value={{ requestPlay, requestPause, togglePlayPause }}
    >
      {children}

      {showTitleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md space-y-4 p-6 border-border/60">
            <h2 className="text-xl font-bold text-foreground">Session Title</h2>
            <p className="text-sm text-muted-foreground">
              Add an optional title for this session.
            </p>
            <Input
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="What are you working on?"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={dismissTitleModal}>
                Skip
              </Button>
              <Button onClick={confirmResume}>Resume</Button>
            </div>
          </Card>
        </div>
      )}

      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md space-y-4 p-6 border-border/60">
            <h2 className="text-xl font-bold text-foreground">
              Session Summary
            </h2>
            <p className="text-sm text-muted-foreground">
              Add an optional summary before pausing.
            </p>
            <textarea
              value={summaryInput}
              onChange={(e) => setSummaryInput(e.target.value)}
              placeholder="What did you accomplish?"
              rows={4}
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={dismissSummaryModal}>
                Skip
              </Button>
              <Button onClick={confirmPause}>Pause</Button>
            </div>
          </Card>
        </div>
      )}
    </TimerActionContext.Provider>
  );
}
