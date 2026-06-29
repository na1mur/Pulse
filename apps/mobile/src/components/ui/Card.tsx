import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn(
        "rounded-xl bg-card border border-border overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}
