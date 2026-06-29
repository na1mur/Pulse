import { Pressable, View } from "react-native";
import { Laptop, Moon, Sun } from "lucide-react-native";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { useThemeColors } from "@/hooks/useThemeColors";
import { ThemedText } from "@/components/ThemeShell";

const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Laptop },
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedScheme } = useTheme();
  const colors = useThemeColors();

  const ActiveIcon =
    options.find((o) => o.value === theme)?.Icon ??
    (resolvedScheme === "dark" ? Moon : Sun);

  return (
    <Pressable
      onPress={() => {
        const idx = options.findIndex((o) => o.value === theme);
        const next = options[(idx + 1) % options.length]!;
        setTheme(next.value);
      }}
      className="h-10 w-10 items-center justify-center rounded-lg"
      style={{ backgroundColor: colors.mutedSurface }}
    >
      <ActiveIcon size={18} color={colors.foreground} />
    </Pressable>
  );
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();

  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map(({ value, label, Icon }) => {
        const selected = theme === value;
        return (
          <Pressable
            key={value}
            onPress={() => setTheme(value)}
            className="flex-row items-center gap-2 px-3 py-2 rounded-lg border"
            style={{
              borderColor: selected ? colors.foreground : colors.border,
              backgroundColor: selected ? colors.mutedSurface : colors.card,
            }}
          >
            <Icon size={16} color={colors.foreground} />
            <ThemedText className="text-sm">{label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
