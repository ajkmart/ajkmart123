import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AdminFetchError, fetchAdmin } from "@/lib/adminFetcher";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface SensitiveActionDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  /** Machine-readable action name sent to the audit log (e.g. "delete_user"). */
  actionType?: string;
  /** Primary entity ID the action targets, included in the audit log. */
  targetId?: string | number;
}

/**
 * SensitiveActionDialog — modal that requires the admin to re-enter their
 * current password before a destructive or high-privilege action proceeds.
 *
 * Flow:
 *  1. Admin sees the action title + description
 *  2. Admin types their current password
 *  3. On submit, POSTs to `/api/admin/auth/verify-password`
 *  4. On 200, calls `onConfirm()` and closes
 *  5. On error, shows an inline message and lets the admin retry
 *
 * Usage:
 *   <SensitiveActionDialog
 *     open={open}
 *     title="Delete User"
 *     description="This action cannot be undone."
 *     confirmLabel="Confirm & Delete"
 *     onConfirm={handleDelete}
 *     onClose={() => setOpen(false)}
 *   />
 */
export function SensitiveActionDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
  actionType,
  targetId,
}: SensitiveActionDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setVerifying(false);
      // Focus the password field after the dialog animates in
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError("Please enter your current password.");
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      await fetchAdmin("/auth/verify-password", {
        method: "POST",
        body: JSON.stringify({
          password,
          ...(actionType ? { actionType } : {}),
          ...(targetId !== undefined ? { targetId: String(targetId) } : {}),
        }),
      });
      // Verification succeeded — proceed with the original action
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      const status = err instanceof AdminFetchError ? err.status : undefined;
      const message = err instanceof Error ? err.message : undefined;
      const msg =
        status === 401 || status === 403
          ? "Incorrect password. Please try again."
          : (message ?? "Verification failed. Please try again.");
      setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !verifying) onClose();
      }}
    >
      <DialogContent className="w-[95vw] max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </span>
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {description && (
            <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
              Enter your password to confirm
            </label>
            <Input
              ref={inputRef}
              type="password"
              placeholder="Current password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !verifying) void handleSubmit();
              }}
              className="h-10 rounded-lg"
              disabled={verifying}
              autoComplete="current-password"
            />
            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={verifying}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={verifying || !password.trim()}
          >
            {verifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Verifying…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
