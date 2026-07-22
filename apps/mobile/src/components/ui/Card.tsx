import { View, type ViewProps } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { cn } from "@/lib/utils";

export function Card({
  className,
  style,
  glow,
  glowSubtle,
  ...props
}: ViewProps & { className?: string; glow?: boolean; glowSubtle?: boolean }) {
  const colors = useThemeColors();

  let shadowStyle = {};
  if (glow) {
    shadowStyle = {
      shadowColor: colors.accentPurple,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
      elevation: 8,
    };
  } else if (glowSubtle) {
    shadowStyle = {
      shadowColor: colors.accentPurple,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    };
  }

  return (
    <View
      className={cn("rounded-2xl overflow-hidden", className)}
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: glow
            ? colors.accentPurple + "33"
            : glowSubtle
              ? colors.accentPurple + "1a"
              : colors.border,
          ...shadowStyle,
        },
        style,
      ]}
      {...props}
    />
  );
}
