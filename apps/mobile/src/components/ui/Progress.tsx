import { View } from "react-native";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  return (
    <View className={cn("h-2 w-full rounded-full bg-muted overflow-hidden", className)}>
      <View
        className="h-full bg-primary rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </View>
  );
}
