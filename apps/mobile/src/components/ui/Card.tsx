import { View, type ViewProps } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { cn } from "@/lib/utils";

export function Card({
  className,
  style,
  ...props
}: ViewProps & { className?: string }) {
  const colors = useThemeColors();

  return (
    <View
      className={cn("rounded-xl overflow-hidden", className)}
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
      {...props}
    />
  );
}
