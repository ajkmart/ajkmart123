import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/errorParser";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

export interface ExportDataProps {
  onExport: () => Promise<Blob | void>;
  filename?: string;
  label?: string;
  className?: string;
}

/**
 * Reusable export button.
 * Calls `onExport`, receives a Blob, and triggers a browser download.
 * Shows loading state during the export and an error toast on failure.
 *
 * Usage:
 *   <ExportData
 *     onExport={() => fetchAdminAbsoluteResponse("/api/admin/orders/export").then(r => r.blob())}
 *     filename="orders-export.csv"
 *     label="Export CSV"
 *   />
 */
export function ExportData({
  onExport,
  filename = "export.csv",
  label = "Export CSV",
  className,
}: ExportDataProps) {
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setIsPending(true);
    try {
      const result = await onExport();
      if (result instanceof Blob) {
        const url = URL.createObjectURL(result);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      toast({
        title: "Export failed",
        description: parseApiError(err),
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isPending}
      className={className}
    >
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
