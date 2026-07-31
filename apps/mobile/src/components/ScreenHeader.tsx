import { View, Pressable, Platform, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Settings } from "lucide-react-native";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemedText } from "@/components/ThemeShell";
import { useThemeColors } from "@/hooks/useThemeColors";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  hideSettings?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  hideSettings = false,
}: ScreenHeaderProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const topPadding =
    insets.top > 0
      ? insets.top + 12
      : Platform.OS === "android"
        ? (StatusBar.currentHeight ?? 0) + 12
        : 12;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <View
      className="px-4 pb-3 flex-row items-center justify-between"
      style={{
        paddingTop: topPadding,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View className="flex-row items-center gap-2 flex-1">
        {showBack && (
          <Pressable
            onPress={handleBack}
            className="h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: colors.mutedSurface }}
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={20} color={colors.foreground} />
          </Pressable>
        )}
        <View className="flex-1">
          <ThemedText className="text-lg font-bold">{title}</ThemedText>
          {subtitle && (
            <ThemedText className="text-sm text-neutral-500 mt-0.5">
              {subtitle}
            </ThemedText>
          )}
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        <ThemeToggle />
        {!hideSettings && (
          <Pressable
            onPress={() => router.push("/settings")}
            className="h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: colors.mutedSurface }}
            accessibilityLabel="Open settings"
          >
            <Settings size={18} color={colors.foreground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
