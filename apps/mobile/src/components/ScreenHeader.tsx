import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemedText } from "@/components/ThemeShell";
import { useTheme } from "@/hooks/useTheme";

export function ScreenHeader({ title }: { title: string }) {
  const router = useRouter();
  const { resolvedScheme } = useTheme();

  return (
    <View className="h-16 px-4 flex-row items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
      <ThemedText className="text-xl font-semibold">{title}</ThemedText>
      <View className="flex-row items-center gap-2">
        <ThemeToggle />
        <Pressable
          onPress={() => router.push("/settings")}
          className="h-10 w-10 items-center justify-center rounded-lg"
        >
          <Settings
            size={18}
            color={resolvedScheme === "dark" ? "#f5f5f5" : "#262626"}
          />
        </Pressable>
      </View>
    </View>
  );
}
