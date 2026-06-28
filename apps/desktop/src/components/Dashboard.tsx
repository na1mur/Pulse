import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Pause,
  RotateCcw,
  LogOut,
  Target,
  Wifi,
  WifiOff,
  Database,
  Clock,
  Calendar,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useTimerStore } from "../store/useTimerStore";
import { useOfflineStore } from "../store/useOfflineStore";
import { useSocketSync } from "../hooks/useSocketSync";
import { useSyncManager } from "../hooks/useSyncManager";
import { api } from "../utils/api";
import { formatTime } from "@repo/utils";

interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const queryClient = useQueryClient();

  // Connect stores and hooks
  const { isRunning, startedAt, elapsedBeforeCurrentRun, resetTimer, checkDayChange } =
    useTimerStore();
  const { addPendingSession } = useOfflineStore();
  const { startTimer, pauseTimer, isConnected } = useSocketSync();
  const { pendingCount } = useSyncManager();

  // Local elapsed time in component state to update visual clock smoothly
  const [localElapsed, setLocalElapsed] = useState(0);

  // Check for day change / midnight reset periodically
  useEffect(() => {
    checkDayChange();
    const interval = setInterval(() => {
      checkDayChange();
    }, 10000);
    return () => clearInterval(interval);
  }, [checkDayChange]);

  useEffect(() => {
    if (!isRunning) {
      setLocalElapsed(elapsedBeforeCurrentRun);
      return;
    }

    setLocalElapsed(
      elapsedBeforeCurrentRun + (Date.now() - (startedAt || Date.now())),
    );

    const interval = setInterval(() => {
      setLocalElapsed(
        elapsedBeforeCurrentRun + (Date.now() - (startedAt || Date.now())),
      );
    }, 100);

    return () => clearInterval(interval);
  }, [isRunning, startedAt, elapsedBeforeCurrentRun]);

  // Load stats and list queries
  const { data: todayStats } = useQuery({
    queryKey: ["todayStats"],
    queryFn: async () => {
      const response = await api.get("/stats/today");
      return response.data;
    },
  });

  const { data: weeklyStats } = useQuery({
    queryKey: ["weeklyStats"],
    queryFn: async () => {
      const response = await api.get("/stats/week");
      return response.data;
    },
  });

  const { data: todaySessions } = useQuery({
    queryKey: ["todaySessions"],
    queryFn: async () => {
      const response = await api.get("/sessions/today");
      return response.data;
    },
  });

  // Settings: Daily goal target
  const [goalHours, setGoalHours] = useState("8");
  const [isUpdatingGoal, setIsUpdatingGoal] = useState(false);

  useEffect(() => {
    if (todayStats) {
      setGoalHours((todayStats.goalMinutes / 60).toString());
    }
  }, [todayStats]);

  const updateGoalMutation = useMutation({
    mutationFn: async (minutes: number) => {
      await api.patch("/settings/daily-target", {
        dailyTargetMinutes: minutes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todayStats"] });
      queryClient.invalidateQueries({ queryKey: ["weeklyStats"] });
      setIsUpdatingGoal(false);
    },
  });

  const handleUpdateGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hoursNum = parseFloat(goalHours);
    if (!isNaN(hoursNum) && hoursNum >= 0) {
      updateGoalMutation.mutate(Math.round(hoursNum * 60));
    }
  };

  // Timer Control Handlers
  const handlePlay = () => {
    startTimer();
  };

  const handlePause = async () => {
    if (!startedAt) return;
    const startTimeIso = new Date(startedAt).toISOString();
    const endTimeIso = new Date().toISOString();
    const deviceId = "desktop";

    // Pause timer and sync via socket
    pauseTimer(localElapsed);

    // Save Completed Focus Session
    try {
      await api.post("/sessions", {
        startTime: startTimeIso,
        endTime: endTimeIso,
        deviceId,
      });
      queryClient.invalidateQueries({ queryKey: ["todayStats"] });
      queryClient.invalidateQueries({ queryKey: ["weeklyStats"] });
      queryClient.invalidateQueries({ queryKey: ["todaySessions"] });
    } catch (err) {
      console.warn("API logging failed. Enqueueing session offline.", err);
      addPendingSession({
        startTime: startTimeIso,
        endTime: endTimeIso,
        deviceId,
      });
    }
  };

  const handleReset = () => {
    resetTimer();
  };

  const handleLogoutClick = () => {
    localStorage.removeItem("pulse-access-token");
    localStorage.removeItem("pulse-refresh-token");
    localStorage.removeItem("pulse-user-email");
    onLogout();
  };

  // Live progress updates (add active running timer to today's stats)
  const currentRunningMinutes = isRunning ? localElapsed / 60000 : 0;
  const totalWorkedTodayMinutes =
    (todayStats?.workedMinutes || 0) + currentRunningMinutes;
  const goalTodayMinutes = todayStats?.goalMinutes || 480;
  const livePercentage =
    goalTodayMinutes > 0
      ? Math.min(
          100,
          Math.round((totalWorkedTodayMinutes / goalTodayMinutes) * 100),
        )
      : 0;

  const userEmail = localStorage.getItem("pulse-user-email") || "User";

  // Recharts custom formatter for statistics
  const formatChartXAxis = (tickItem: string) => {
    try {
      const date = new Date(tickItem + "T00:00:00");
      return date.toLocaleDateString("en-US", { weekday: "short" });
    } catch {
      return tickItem;
    }
  };

  const chartData =
    weeklyStats?.map((item: any) => ({
      ...item,
      workedHours: Math.round((item.workedMinutes / 60) * 10) / 10,
    })) || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background glowing blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />

      {/* Top Navbar */}
      <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md px-8 py-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center font-bold text-white shadow-md">
            P
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            Pulse
          </span>
        </div>

        <div className="flex items-center gap-6">
          {/* Real-time Status Badge */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                <Wifi className="w-3.5 h-3.5" />
                Synced
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-950/40 border border-amber-500/20 px-2.5 py-1 rounded-full">
                <WifiOff className="w-3.5 h-3.5" />
                Offline Mode
              </span>
            )}

            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 bg-blue-950/40 border border-blue-500/20 px-2.5 py-1 rounded-full">
                <Database className="w-3.5 h-3.5" />
                {pendingCount} Pending Sync
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 font-medium hidden sm:inline">
              {userEmail}
            </span>
            <button
              onClick={handleLogoutClick}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition duration-200"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        {/* Left Column: Timer & Controls */}
        <section className="lg:col-span-1 space-y-8 flex flex-col justify-start">
          {/* Clock Widget */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
              Focus Timer
            </span>

            <div className="text-6xl font-mono tracking-wider font-bold text-white mb-8 select-none select-all select-none">
              {formatTime(localElapsed)}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleReset}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/60 hover:bg-slate-900 active:scale-95 text-slate-400 hover:text-white transition duration-200"
                title="Reset Focus Block"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              {isRunning ? (
                <button
                  onClick={handlePause}
                  className="p-5 rounded-2xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white transition duration-200 shadow-lg shadow-amber-600/20"
                  title="Pause and Save Session"
                >
                  <Pause className="w-7 h-7 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handlePlay}
                  className="p-5 rounded-2xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white transition duration-200 shadow-lg shadow-purple-600/20"
                  title="Start Focus Block"
                >
                  <Play className="w-7 h-7 fill-current" />
                </button>
              )}
            </div>
          </div>

          {/* Goal Progress Ring Widget */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-xl shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h2 className="font-semibold text-white">Daily Focus Target</h2>
              </div>
              <span className="text-2xl font-bold text-purple-400">
                {livePercentage}%
              </span>
            </div>

            {/* Simulated Progress Ring */}
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800/60 mb-4">
              <div
                className="bg-gradient-to-r from-purple-600 to-blue-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${livePercentage}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-sm text-slate-400">
              <div>
                <span>Worked Today: </span>
                <span className="text-white font-medium">
                  {Math.floor(totalWorkedTodayMinutes / 60)}h{" "}
                  {Math.round(totalWorkedTodayMinutes % 60)}m
                </span>
              </div>
              <div>
                <span>Target: </span>
                <span className="text-slate-200 font-semibold">
                  {Math.floor(goalTodayMinutes / 60)}h{" "}
                  {Math.round(goalTodayMinutes % 60)}m
                </span>
              </div>
            </div>
          </div>

          {/* Daily Goal Target Adjustments */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-blue-400" />
              <h2 className="font-semibold text-white">Target Settings</h2>
            </div>

            {isUpdatingGoal ? (
              <form
                onSubmit={handleUpdateGoalSubmit}
                className="flex items-center gap-2"
              >
                <input
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={goalHours}
                  onChange={(e) => setGoalHours(e.target.value)}
                  className="w-20 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-center focus:outline-none"
                />
                <span className="text-slate-400 text-sm">hours</span>
                <button
                  type="submit"
                  disabled={updateGoalMutation.isPending}
                  className="ml-auto px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-xl transition duration-200"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsUpdatingGoal(false)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white text-sm rounded-xl transition duration-200"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-sm">Goal: </span>
                  <span className="text-white font-medium">
                    {goalHours} hours per day
                  </span>
                </div>
                <button
                  onClick={() => setIsUpdatingGoal(true)}
                  className="text-xs font-semibold text-purple-400 hover:text-purple-300 transition duration-200 uppercase tracking-wider"
                >
                  Edit Goal
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Center / Right Column: Charts and Focus History */}
        <section className="lg:col-span-2 space-y-8">
          {/* Charts Card */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-400" />
                <h2 className="font-semibold text-white">
                  Focus History (Last 7 Days)
                </h2>
              </div>
            </div>

            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ bottom: 5 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartXAxis}
                      stroke="#475569"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#475569"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      unit="h"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "12px",
                      }}
                      labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                      itemStyle={{ color: "#a855f7" }}
                    />
                    <Bar
                      dataKey="workedHours"
                      fill="#a855f7"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Loading statistics...
                </div>
              )}
            </div>
          </div>

          {/* Today's Focus Log Sessions */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-blue-400" />
              <h2 className="font-semibold text-white">Completed Today</h2>
            </div>

            <div className="space-y-3 max-h-56 overflow-y-auto pr-2">
              {todaySessions && todaySessions.length > 0 ? (
                todaySessions.map((session: any) => {
                  const sTime = new Date(session.startTime);
                  const eTime = session.endTime
                    ? new Date(session.endTime)
                    : null;
                  return (
                    <div
                      key={
                        session._id ||
                        session.localId ||
                        Math.random().toString()
                      }
                      className="flex justify-between items-center bg-slate-950/40 border border-slate-850 p-3 rounded-xl hover:border-slate-850 hover:bg-slate-950/60 transition duration-200"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-slate-200">
                          {sTime.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {eTime &&
                            ` - ${eTime.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`}
                        </span>
                        <span className="text-xs text-slate-500 uppercase tracking-widest font-mono">
                          Device: {session.deviceId}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-purple-400">
                        {Math.floor(session.durationMinutes)}m{" "}
                        {Math.round((session.durationMinutes % 1) * 60)}s
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-slate-500 text-sm">
                  No sessions logged today yet. Click Play to start focus work!
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
