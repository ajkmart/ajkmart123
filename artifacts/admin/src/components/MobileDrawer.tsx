import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import React from "react";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  dialogClassName?: string;
}

export function MobileDrawer({
  open,
  onClose,
  title,
  children,
  dialogClassName,
}: MobileDrawerProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        shouldScaleBackground={false}
      >
        <DrawerContent className="pb-safe max-h-[90dvh] overflow-y-auto">
          {title && (
            <DrawerHeader className="px-4 pt-2 pb-0">
              <DrawerTitle asChild>
                <div className="text-foreground flex items-center gap-2 text-base font-bold">
                  {title}
                </div>
              </DrawerTitle>
            </DrawerHeader>
          )}
          <div className="overflow-y-auto px-4 pb-6">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className={dialogClassName ?? "max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto rounded-3xl"}
      >
        {title && (
          <DialogHeader>
            <DialogTitle asChild>
              <div className="text-foreground flex items-center gap-2">{title}</div>
            </DialogTitle>
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
