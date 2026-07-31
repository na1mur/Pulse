import "react-native-reanimated";
import "react-native-gesture-handler";
import "../global.css";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { isAxiosError } from "axios";
import { ApiProvider } from "@repo/queries";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { ThemeShell } from "@/components/ThemeShell";
import { api } from "@/utils/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (isAxiosError(error) && error.response?.status === 401) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

function RootLayoutInner() {
  const { resolvedScheme } = useTheme();

  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <ThemeShell>
          <StatusBar style={resolvedScheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeShell>
      </QueryClientProvider>
    </ApiProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
