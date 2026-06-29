import { View, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemeSelector } from "@/components/ThemeToggle";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useUserSettings, useUpdateTimezone } from "@/hooks/usePulseQueries";
import { useThemeColors } from "@/hooks/useThemeColors";
import { tokenStorage } from "@/utils/api";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (EST)" },
  { value: "America/Chicago", label: "Central (CST)" },
  { value: "America/Denver", label: "Mountain (MST)" },
  { value: "America/Los_Angeles", label: "Pacific (PST)" },
  { value: "UTC", label: "UTC" },
];

export function SettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { data: settings } = useUserSettings();
  const updateTimezone = useUpdateTimezone();

  const handleLogout = async () => {
    await tokenStorage.clearTokens();
    router.replace("/(auth)/login");
  };

  return (
    <Screen>
      <ScreenHeader title="Settings" showBack hideSettings />
      <ScreenScroll>
        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">General</ThemedText>
          <ThemedText className="text-sm text-neutral-500">Timezone</ThemedText>
          <View className="gap-2">
            {TIMEZONES.map((tz) => {
              const selected = settings?.timezone === tz.value;
              return (
                <Pressable
                  key={tz.value}
                  onPress={() => updateTimezone.mutate(tz.value)}
                  className="p-3 rounded-lg border"
                  style={{
                    borderColor: selected ? colors.foreground : colors.border,
                    backgroundColor: selected
                      ? colors.mutedSurface
                      : colors.card,
                  }}
                >
                  <ThemedText>{tz.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Appearance</ThemedText>
          <ThemeSelector />
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Account</ThemedText>
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
