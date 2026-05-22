import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { X } from "lucide-react";
import * as React from "react";

interface AdminFormSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
  width?: string;
}

export function AdminFormSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  width = "sm:max-w-lg",
}: AdminFormSheetProps) {
  const handleClose = () => {
    if (!busy) onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <SheetContent side="right" className={`flex flex-col gap-0 p-0 ${width}`}>
        <SheetHeader className="border-border flex flex-shrink-0 flex-row items-start justify-between gap-3 border-b px-6 py-5">
          <div className="min-w-0 flex-1 space-y-1">
            <SheetTitle className="text-foreground text-base leading-tight font-bold tracking-tight">
              {title}
            </SheetTitle>
            {description && (
              <SheetDescription className="text-muted-foreground text-sm leading-snug">
                {description}
              </SheetDescription>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            aria-label="Close panel"
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:ring-ring flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <SheetFooter className="border-border flex flex-shrink-0 flex-row items-center justify-end gap-2 border-t px-6 py-4 sm:justify-end sm:space-x-0">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default AdminFormSheet;
