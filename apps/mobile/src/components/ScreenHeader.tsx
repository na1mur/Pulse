import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemedText } from "@/components/ThemeShell";
import { useThemeColors } from "@/hooks/useThemeColors";

export function ScreenHeader({ title }: { title: string }) {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <View
      className="h-16 px-4 flex-row items-center justify-between"
      style={{
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <ThemedText className="text-xl font-semibold">{title}</ThemedText>
      <View className="flex-row items-center gap-1">
        <ThemeToggle />
        <Pressable
          onPress={() => router.push("/settings")}
          className="h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: colors.mutedSurface }}
        >
          <Settings size={18} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}
