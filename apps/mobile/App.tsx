import React, { useState, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Login } from "./src/components/Login";
import { Dashboard } from "./src/components/Dashboard";
import { useSocketSync } from "./src/hooks/useSocketSync";
import { useSyncManager } from "./src/hooks/useSyncManager";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PulseApp({ onLogout }: { onLogout: () => void }) {
  // Mount background sync and real-time socket listeners
  useSyncManager();
  useSocketSync();

  return <Dashboard onLogout={onLogout} />;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkToken = async () => {
      try {
        const storedToken = await AsyncStorage.getItem("pulse-access-token");
        setToken(storedToken);
      } catch (err) {
        console.error("Error reading token:", err);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.container}>
        {!token ? (
          <Login onSuccess={(accessToken) => setToken(accessToken)} />
        ) : (
          <PulseApp onLogout={() => setToken(null)} />
        )}
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
});
