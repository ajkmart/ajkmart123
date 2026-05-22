import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";

/**
 * SubmitButton — canonical submit-with-spinner button used by every admin
 * form. Encapsulates the spinner placement, disabled-while-submitting
 * behaviour, and accessible labels so individual forms don't reinvent the
 * pattern.
 *
 * Pass `isSubmitting` (or `loading`) and the button auto-disables and
 * shows a `Loader2` to the left of the label. Falls back to the regular
 * `<Button>` styling so it composes with all existing variants.
 */
export interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isSubmitting?: boolean;
  loading?: boolean;
  loadingText?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export const SubmitButton = forwardRef<HTMLButtonElement, SubmitButtonProps>(function SubmitButton(
  {
    isSubmitting,
    loading,
    loadingText,
    disabled,
    children,
    className,
    variant,
    size,
    type = "submit",
    ...rest
  },
  ref
) {
  const busy = !!(isSubmitting || loading);
  return (
    <Button
      ref={ref}
      type={type}
      variant={variant}
      size={size}
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      className={cn(busy && "cursor-progress", className)}
      {...rest}
    >
      {busy && (
        <Loader2
          className="mr-2 h-4 w-4 animate-spin"
          aria-hidden="true"
          data-testid="submit-button-spinner"
        />
      )}
      {busy && loadingText ? loadingText : children}
    </Button>
  );
});
