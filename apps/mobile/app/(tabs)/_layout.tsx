import { Platform, View } from "react-native";
import { Tabs } from "expo-router";
import {
  LayoutDashboard,
  History,
  BarChart3,
  Target,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSocketSync } from "@/hooks/useSocketSync";
import { useSyncManager } from "@/hooks/useSyncManager";
import { useTimezoneSync } from "@/hooks/useTimezoneSync";
import { useTimerForegroundService } from "@/hooks/useTimerForegroundService";
import { useThemeColors } from "@/hooks/useThemeColors";
import { GoalProvider } from "@/context/GoalContext";
import { AuthGate } from "@/components/AuthGate";
import { AchievementNotifier } from "@/components/AchievementNotifier";

function SyncBootstrap() {
  useSyncManager();
  useSocketSync();
  useTimezoneSync();
  useTimerForegroundService();
  return null;
}

export default function TabsLayout() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const tabBarContentHeight = Platform.select({
    ios: 49,
    android: 56,
    web: 60,
    default: 56,
  })!;
  const tabBarPaddingBottom = insets.bottom;

  return (
    <AuthGate>
      <GoalProvider>
        <View className="flex-1">
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
                paddingBottom: tabBarPaddingBottom,
                height: tabBarContentHeight + tabBarPaddingBottom,
              },
              tabBarLabelStyle: Platform.select({
                web: { lineHeight: 14, marginBottom: 2 },
                default: undefined,
              }),
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
          <AchievementNotifier />
        </View>
      </GoalProvider>
    </AuthGate>
  );
}
