import { Tabs } from "expo-router";
import {
  LayoutDashboard,
  History,
  BarChart3,
  Target,
} from "lucide-react-native";
import { useSocketSync } from "@/hooks/useSocketSync";
import { useSyncManager } from "@/hooks/useSyncManager";
import { useThemeColors } from "@/hooks/useThemeColors";
import { GoalProvider } from "@/context/GoalContext";
import { AuthGate } from "@/components/AuthGate";

function SyncBootstrap() {
  useSyncManager();
  useSocketSync();
  return null;
}

export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <AuthGate>
      <GoalProvider>
        <SyncBootstrap />
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.background },
            tabBarActiveTintColor: colors.tabActive,
            tabBarInactiveTintColor: colors.tabInactive,
            tabBarStyle: {
              backgroundColor: colors.tabBar,
              borderTopColor: colors.tabBarBorder,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Dashboard",
              tabBarIcon: ({ color: c }) => (
                <LayoutDashboard size={20} color={c} />
              ),
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
    </AuthGate>
  );
}
