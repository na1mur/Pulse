import "../global.css";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { ApiProvider } from "@repo/queries";
import { useTheme } from "@/hooks/useTheme";
import { ThemeShell } from "@/components/ThemeShell";
import { api } from "@/utils/api";

const queryClient = new QueryClient();

export default function RootLayout() {
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
