import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react-native";
import { deactivateUserSession } from "@repo/queries";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemeSelector } from "@/components/ThemeToggle";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useUserSettings } from "@/hooks/usePulseQueries";
import { useThemeColors } from "@/hooks/useThemeColors";
import { stopSessionTokenRefresh, tokenStorage } from "@/utils/api";

export function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const { data: settings } = useUserSettings();

  const handleLogout = async () => {
    stopSessionTokenRefresh();
    deactivateUserSession(queryClient);
    await tokenStorage.clearTokens();
    router.replace("/(auth)/login");
  };

  return (
    <Screen>
      <ScreenHeader title="Settings" showBack hideSettings />
      <ScreenScroll>
        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Appearance</ThemedText>
          <ThemeSelector />
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Account</ThemedText>
          {settings?.name ? (
            <View
              className="p-3 rounded-lg"
              style={{ backgroundColor: colors.mutedSurface }}
            >
              <ThemedText className="font-medium">{settings.name}</ThemedText>
            </View>
          ) : null}
          <View
            className="p-3 rounded-lg"
            style={{ backgroundColor: colors.mutedSurface }}
          >
            <ThemedText>{settings?.email ?? "—"}</ThemedText>
          </View>
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">About</ThemedText>
          <ThemedText className="text-sm text-neutral-500">
            Version 1.0.0
          </ThemedText>
        </Card>

        <Card
          className="p-4 gap-3"
          style={{ borderColor: `${colors.destructive}66` }}
        >
          <ThemedText className="text-lg font-semibold" destructive>
            Danger Zone
          </ThemedText>
          <Button variant="destructive" onPress={handleLogout}>
            <LogOut size={16} color={colors.destructive} />
            <Text
              style={{
                color: colors.destructive,
                marginLeft: 8,
                fontSize: 14,
                fontWeight: "500",
              }}
            >
              Logout
            </Text>
          </Button>
        </Card>
      </ScreenScroll>
    </Screen>
  );
}
