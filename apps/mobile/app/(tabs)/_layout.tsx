import { Tabs } from "expo-router";
import {
  LayoutDashboard,
  History,
  BarChart3,
  Target,
} from "lucide-react-native";
import { useSocketSync } from "@/hooks/useSocketSync";
import { useSyncManager } from "@/hooks/useSyncManager";
import { useTheme } from "@/hooks/useTheme";
import { GoalProvider } from "@/context/GoalContext";

function SyncBootstrap() {
  useSyncManager();
  useSocketSync();
  return null;
}

export default function TabsLayout() {
  const { resolvedScheme } = useTheme();
  const color = resolvedScheme === "dark" ? "#f5f5f5" : "#262626";
  const inactive = resolvedScheme === "dark" ? "#737373" : "#a3a3a3";

  return (
    <GoalProvider>
      <SyncBootstrap />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color,
          tabBarInactiveTintColor: inactive,
          tabBarStyle: {
            backgroundColor: resolvedScheme === "dark" ? "#171717" : "#ffffff",
            borderTopColor: resolvedScheme === "dark" ? "#262626" : "#f0f0f0",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color: c }) => <LayoutDashboard size={20} color={c} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color: c }) => <History size={20} color={c} />,
          }}
        />
        <Tabs.Screen
          name="statistics"
          options={{
            title: "Statistics",
            tabBarIcon: ({ color: c }) => <BarChart3 size={20} color={c} />,
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: "Goals",
            tabBarIcon: ({ color: c }) => <Target size={20} color={c} />,
          }}
        />
      </Tabs>
    </GoalProvider>
  );
}
