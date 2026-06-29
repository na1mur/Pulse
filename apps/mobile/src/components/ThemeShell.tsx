import { View, type ViewProps } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export function ThemeShell({
  className,
  children,
  ...props
}: ViewProps & { className?: string }) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === "dark";

  return (
    <View
      className={cn(
        "flex-1",
        isDark ? "bg-neutral-950" : "bg-neutral-50",
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}

export function ThemedText({
  className,
  children,
  ...props
}: React.ComponentProps<typeof import("react-native").Text> & {
  className?: string;
}) {
  const { Text } = require("react-native");
  const { resolvedScheme } = useTheme();
  return (
    <Text
      className={cn(
        resolvedScheme === "dark" ? "text-neutral-100" : "text-neutral-900",
        className,
      )}
      {...props}
    >
      {children}
    </Text>
  );
}
