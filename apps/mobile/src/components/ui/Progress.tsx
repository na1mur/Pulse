import { View } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  const colors = useThemeColors();

  return (
    <View
      className={cn("h-2 w-full rounded-full overflow-hidden", className)}
      style={{ backgroundColor: colors.mutedSurface }}
    >
      <View
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}
