import { View, Text, type ViewProps, type TextProps } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { cn } from "@/lib/utils";

export function ThemeShell({
  className,
  style,
  children,
  ...props
}: ViewProps & { className?: string }) {
  const colors = useThemeColors();

  return (
    <View
      className={cn("flex-1", className)}
      style={[{ backgroundColor: colors.background }, style]}
      {...props}
    >
      {children}
    </View>
  );
}

export function ThemedText({
  className,
  style,
  children,
  muted,
  destructive,
  ...props
}: TextProps & {
  className?: string;
  muted?: boolean;
  destructive?: boolean;
}) {
  const colors = useThemeColors();
  const isMuted = muted ?? Boolean(className?.includes("text-neutral-500"));
  const isDestructive =
    destructive ?? Boolean(className?.includes("text-red-"));

  let color = colors.foreground;
  if (isMuted) color = colors.muted;
  if (isDestructive) color = colors.destructive;

  return (
    <Text className={className} style={[{ color }, style]} {...props}>
      {children}
    </Text>
  );
}
