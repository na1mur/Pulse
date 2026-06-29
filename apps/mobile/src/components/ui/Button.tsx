import { Pressable, Text, type PressableProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "flex-row items-center justify-center rounded-lg",
  {
    variants: {
      variant: {
        default: "bg-primary",
        outline: "border border-border bg-background",
        ghost: "bg-transparent",
        destructive: "bg-destructive/10",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonTextVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface ButtonProps extends PressableProps, VariantProps<typeof buttonVariants> {
  label?: string;
  children?: React.ReactNode;
  className?: string;
  textClassName?: string;
}

export function Button({
  variant,
  size,
  label,
  children,
  className,
  textClassName,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children ??
        (label ? (
          <Text className={cn(buttonTextVariants({ variant }), textClassName)}>
            {label}
          </Text>
        ) : null)}
    </Pressable>
  );
}
