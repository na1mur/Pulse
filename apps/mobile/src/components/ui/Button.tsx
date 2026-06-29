import { Pressable, Text, type PressableProps } from "react-native";
import { type VariantProps } from "class-variance-authority";
import { useThemeColors } from "@/hooks/useThemeColors";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  children?: React.ReactNode;
  className?: string;
  textClassName?: string;
}

const sizeStyles: Record<
  ButtonSize,
  { height: number; paddingHorizontal: number }
> = {
  default: { height: 40, paddingHorizontal: 16 },
  sm: { height: 32, paddingHorizontal: 12 },
  lg: { height: 48, paddingHorizontal: 24 },
  icon: { height: 40, paddingHorizontal: 0 },
};

export function Button({
  variant = "default",
  size = "default",
  label,
  children,
  className,
  textClassName,
  style,
  ...props
}: ButtonProps) {
  const colors = useThemeColors();
  const dimensions = sizeStyles[size];

  let backgroundColor = colors.primary;
  let textColor = colors.primaryForeground;
  let borderColor = "transparent";
  let borderWidth = 0;

  if (variant === "outline") {
    backgroundColor = colors.background;
    textColor = colors.foreground;
    borderColor = colors.border;
    borderWidth = 1;
  } else if (variant === "ghost") {
    backgroundColor = "transparent";
    textColor = colors.foreground;
  } else if (variant === "destructive") {
    backgroundColor = `${colors.destructive}1a`;
    textColor = colors.destructive;
  }

  return (
    <Pressable
      className={cn(
        "flex-row items-center justify-center rounded-lg",
        size === "icon" && "w-10",
        className,
      )}
      style={[
        {
          height: dimensions.height,
          paddingHorizontal: size === "icon" ? 0 : dimensions.paddingHorizontal,
          backgroundColor,
          borderColor,
          borderWidth,
        },
        style,
      ]}
      {...props}
    >
      {children ??
        (label ? (
          <Text
            className={cn("text-sm font-medium", textClassName)}
            style={{ color: textColor }}
          >
            {label}
          </Text>
        ) : null)}
    </Pressable>
  );
}
