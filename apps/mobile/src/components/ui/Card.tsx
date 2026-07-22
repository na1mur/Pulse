import { View, type ViewProps } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { cn } from "@/lib/utils";

export function Card({
  className,
  style,
  glow,
  ...props
}: ViewProps & { className?: string; glow?: boolean }) {
  const colors = useThemeColors();

  return (
    <View
      className={cn("rounded-2xl overflow-hidden", className)}
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          ...(glow
            ? {
                shadowColor: colors.accentPurple,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.25,
                shadowRadius: 24,
                elevation: 8,
              }
            : {}),
        },
        style,
      ]}
      {...props}
    />
  );
}
