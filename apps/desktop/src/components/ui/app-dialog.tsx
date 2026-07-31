import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
  scrollable?: boolean;
}

export function AppDialog({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidthClassName = "max-w-2xl",
  scrollable = true,
}: AppDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <Card
        className={cn(
          "flex w-full max-h-[min(85vh,720px)] flex-col gap-0 overflow-hidden border-border/60 p-0",
          maxWidthClassName,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-6 py-4">
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close dialog"
          >
            ✕
          </Button>
        </div>

        <div
          className={cn(
            "px-6 py-4",
            scrollable && "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 justify-end gap-3 border-t border-border/60 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
