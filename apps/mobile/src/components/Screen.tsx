import {
  View,
  ScrollView,
  type ScrollViewProps,
  type ViewProps,
} from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { cn } from "@/lib/utils";

export function Screen({ children, className, style, ...props }: ViewProps) {
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

export function ScreenScroll({
  children,
  className,
  contentContainerClassName,
  style,
  contentContainerStyle,
  ...props
}: ScrollViewProps & { contentContainerClassName?: string }) {
  const colors = useThemeColors();

  return (
    <ScrollView
      className={cn("flex-1 p-4", className)}
      contentContainerClassName={cn("gap-4 pb-8", contentContainerClassName)}
      style={[{ backgroundColor: colors.background }, style]}
      contentContainerStyle={contentContainerStyle}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
