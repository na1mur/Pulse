import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

  const { isRunning, startedAt, elapsedBeforeCurrentRun, resetTimer } =
    useTimerStore();
  const { addPendingSession } = useOfflineStore();
  const { startTimer, pauseTimer, isConnected } = useSocketSync();
  const { pendingCount } = useSyncManager();

  const [localElapsed, setLocalElapsed] = useState(0);

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

  const { data: todayStats } = useQuery({
    queryKey: ["todayStats"],
    queryFn: async () => {
      const response = await api.get("/stats/today");
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

  const [goalHours, setGoalHours] = useState("8");
  const [isEditingGoal, setIsEditingGoal] = useState(false);

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
      setIsEditingGoal(false);
    },
  });

  const handleUpdateGoal = () => {
    const hoursNum = parseFloat(goalHours);
    if (!isNaN(hoursNum) && hoursNum >= 0) {
      updateGoalMutation.mutate(Math.round(hoursNum * 60));
    }
  };

  const handlePlay = () => {
    startTimer();
  };

  const handlePause = async () => {
    if (!startedAt) return;
    const startTimeIso = new Date(startedAt).toISOString();
    const endTimeIso = new Date().toISOString();
    const deviceId = "mobile";

    pauseTimer(localElapsed);

    try {
      await api.post("/sessions", {
        startTime: startTimeIso,
        endTime: endTimeIso,
        deviceId,
      });
      queryClient.invalidateQueries({ queryKey: ["todayStats"] });
      queryClient.invalidateQueries({ queryKey: ["todaySessions"] });
      resetTimer();
    } catch (err) {
      console.warn("API logging failed. Enqueueing session offline.", err);
      addPendingSession({
        startTime: startTimeIso,
        endTime: endTimeIso,
        deviceId,
      });
      resetTimer();
    }
  };

  const handleReset = () => {
    resetTimer();
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem("pulse-access-token");
    await AsyncStorage.removeItem("pulse-refresh-token");
    await AsyncStorage.removeItem("pulse-user-email");
    onLogout();
  };

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pulse</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Real-time sync connection details */}
        <View style={styles.statusRow}>
          {isConnected ? (
            <View style={[styles.badge, styles.badgeSuccess]}>
              <Text style={styles.badgeTextSuccess}>🟢 Synced</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgeWarning]}>
              <Text style={styles.badgeTextWarning}>🟡 Offline Mode</Text>
            </View>
          )}

          {pendingCount > 0 && (
            <View style={[styles.badge, styles.badgeSync]}>
              <Text style={styles.badgeTextSync}>
                📦 {pendingCount} Pending
              </Text>
            </View>
          )}
        </View>

        {/* Timer Box */}
        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>Focus Timer</Text>
          <Text style={styles.timerText}>{formatTime(localElapsed)}</Text>

          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
              <Text style={styles.controlBtnText}>🔄</Text>
            </TouchableOpacity>

            {isRunning ? (
              <TouchableOpacity style={styles.pauseBtn} onPress={handlePause}>
                <Text style={styles.playPauseIcon}>⏸️</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.playBtn} onPress={handlePlay}>
                <Text style={styles.playPauseIcon}>▶️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Progress Box */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Daily Target Progress</Text>
            <Text style={styles.progressPercentage}>{livePercentage}%</Text>
          </View>

          {/* Progress track */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.max(3, livePercentage)}%` },
              ]}
            />
          </View>

          <View style={styles.progressStatsRow}>
            <View>
              <Text style={styles.progressStatsLabel}>Worked Today</Text>
              <Text style={styles.progressStatsValue}>
                {Math.floor(totalWorkedTodayMinutes / 60)}h{" "}
                {Math.round(totalWorkedTodayMinutes % 60)}m
              </Text>
            </View>

            <View style={styles.alignRight}>
              <Text style={styles.progressStatsLabel}>Target Goal</Text>
              <Text style={styles.progressStatsValue}>
                {Math.floor(goalTodayMinutes / 60)}h{" "}
                {Math.round(goalTodayMinutes % 60)}m
              </Text>
            </View>
          </View>
        </View>

        {/* Setting adjust box */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settings</Text>

          {isEditingGoal ? (
            <View style={styles.editingRow}>
              <TextInput
                style={styles.goalInput}
                keyboardType="numeric"
                value={goalHours}
                onChangeText={setGoalHours}
              />
              <Text style={styles.goalInputLabel}>hours</Text>

              <TouchableOpacity
                style={styles.saveGoalBtn}
                onPress={handleUpdateGoal}
                disabled={updateGoalMutation.isPending}
              >
                {updateGoalMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveGoalText}>Save</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelGoalBtn}
                onPress={() => setIsEditingGoal(false)}
              >
                <Text style={styles.cancelGoalText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editingHeaderRow}>
              <Text style={styles.goalLabel}>Goal: {goalHours} hrs/day</Text>
              <TouchableOpacity onPress={() => setIsEditingGoal(true)}>
                <Text style={styles.editGoalText}>Edit Goal</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Today Focus logs */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Focus History (Today)</Text>

          <View style={styles.sessionsContainer}>
            {todaySessions && todaySessions.length > 0 ? (
              todaySessions.map((session: any, idx: number) => {
                const sTime = new Date(session.startTime);
                return (
                  <View key={session._id || idx} style={styles.sessionRow}>
                    <View>
                      <Text style={styles.sessionTime}>
                        {sTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      <Text style={styles.sessionDevice}>
                        Device: {session.deviceId}
                      </Text>
                    </View>
                    <Text style={styles.sessionDuration}>
                      {Math.floor(session.durationMinutes)}m{" "}
                      {Math.round((session.durationMinutes % 1) * 60)}s
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.noSessionsText}>
                No focus sessions logged today yet.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#0f172a",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
  },
  logoutButtonText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "500",
  },
  container: {
    padding: 20,
    gap: 20,
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
  },
  badgeSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  badgeWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  badgeSync: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  badgeTextSuccess: {
    color: "#34d399",
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextWarning: {
    color: "#fbbf24",
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextSync: {
    color: "#60a5fa",
    fontSize: 12,
    fontWeight: "600",
  },
  timerCard: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  timerText: {
    fontSize: 52,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 2,
    marginBottom: 28,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  resetBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnText: {
    fontSize: 20,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#a855f7",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#a855f7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  pauseBtn: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#d97706",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#d97706",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  playPauseIcon: {
    fontSize: 24,
  },
  card: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  progressPercentage: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#a855f7",
  },
  progressTrack: {
    width: "100%",
    height: 10,
    backgroundColor: "#020617",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 16,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#a855f7",
    borderRadius: 99,
  },
  progressStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressStatsLabel: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 4,
  },
  progressStatsValue: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
  },
  alignRight: {
    alignItems: "flex-end",
  },
  editingHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  goalLabel: {
    color: "#94a3b8",
    fontSize: 14,
  },
  editGoalText: {
    color: "#a855f7",
    fontSize: 14,
    fontWeight: "600",
  },
  editingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  goalInput: {
    width: 60,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
  },
  goalInputLabel: {
    color: "#64748b",
    fontSize: 14,
  },
  saveGoalBtn: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#a855f7",
    borderRadius: 8,
  },
  saveGoalText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  cancelGoalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
  },
  cancelGoalText: {
    color: "#94a3b8",
    fontSize: 12,
  },
  sessionsContainer: {
    marginTop: 12,
    gap: 10,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(2, 6, 23, 0.4)",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
  },
  sessionTime: {
    fontSize: 14,
    fontWeight: "500",
    color: "#e2e8f0",
  },
  sessionDevice: {
    fontSize: 11,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  sessionDuration: {
    fontSize: 14,
    fontWeight: "600",
    color: "#a855f7",
  },
  noSessionsText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 12,
  },
});
