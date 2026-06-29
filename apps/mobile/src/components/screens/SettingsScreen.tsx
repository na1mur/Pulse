import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LogOut } from "lucide-react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ThemeSelector } from "@/components/ThemeToggle";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useUserSettings, useUpdateTimezone } from "@/hooks/usePulseQueries";
import { createAsyncStorageAdapter } from "@repo/api-client";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (EST)" },
  { value: "America/Chicago", label: "Central (CST)" },
  { value: "America/Denver", label: "Mountain (MST)" },
  { value: "America/Los_Angeles", label: "Pacific (PST)" },
  { value: "UTC", label: "UTC" },
];

const storage = createAsyncStorageAdapter(AsyncStorage);

export function SettingsScreen() {
  const router = useRouter();
  const { data: settings } = useUserSettings();
  const updateTimezone = useUpdateTimezone();

  const handleLogout = async () => {
    await storage.clearTokens();
    router.replace("/(auth)/login");
  };

  return (
    <View className="flex-1">
      <ScreenHeader title="Settings" />
      <ScrollView className="flex-1 p-4" contentContainerClassName="gap-4 pb-8">
        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">General</ThemedText>
          <ThemedText className="text-sm text-neutral-500">Timezone</ThemedText>
          <View className="gap-2">
            {TIMEZONES.map((tz) => (
              <Pressable
                key={tz.value}
                onPress={() => updateTimezone.mutate(tz.value)}
                className={`p-3 rounded-lg border ${
                  settings?.timezone === tz.value
                    ? "border-neutral-900 bg-neutral-100"
                    : "border-neutral-200"
                }`}
              >
                <ThemedText>{tz.label}</ThemedText>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Appearance</ThemedText>
          <ThemeSelector />
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Account</ThemedText>
          <View className="p-3 rounded-lg bg-neutral-100">
            <ThemedText>{settings?.email ?? "—"}</ThemedText>
          </View>
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">About</ThemedText>
          <ThemedText className="text-sm text-neutral-500">Version 1.0.0</ThemedText>
        </Card>

        <Card className="p-4 gap-3 border-red-200">
          <ThemedText className="text-lg font-semibold text-red-600">
            Danger Zone
          </ThemedText>
          <Button variant="destructive" onPress={handleLogout}>
            <LogOut size={16} color="#dc2626" />
            <ThemedText className="text-red-600 ml-2">Logout</ThemedText>
          </Button>
        </Card>
      </ScrollView>
    </View>
  );
}
