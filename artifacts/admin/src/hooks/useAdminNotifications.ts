import { useToast } from "@/hooks/use-toast";

/**
 * Pre-configured toast variants for admin notifications.
 * Wraps the existing `use-toast` system with consistent titles and variants.
 *
 * Usage:
 *   const { success, error, warning, info } = useAdminNotifications();
 *   success("Category saved successfully.");
 *   error("Failed to delete product.");
 */
export function useAdminNotifications() {
  const { toast } = useToast();

  function success(msg: string, title = "Success") {
    toast({ title, description: msg });
  }

  function error(msg: string, title = "Error") {
    toast({ title, description: msg, variant: "destructive" });
  }

  function warning(msg: string, title = "Warning") {
    toast({ title, description: msg, variant: "destructive" });
  }

  function info(msg: string, title = "Info") {
    toast({ title, description: msg });
  }

  return { success, error, warning, info };
}
