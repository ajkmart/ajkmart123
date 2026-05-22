import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { fetchAdminAbsoluteResponse } from "@/lib/adminFetcher";
import { downloadRemoteCsv, exportToCsv, type CsvRow } from "@/lib/csvExport";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

export interface ExportButtonProps {
  /** Base filename without date suffix or .csv extension */
  filename: string;
  /**
   * Client-side data to export. When provided (and ≤ largeThreshold rows),
   * the export is done client-side without a server round-trip.
   */
  data?: CsvRow[];
  /**
   * Absolute API URL for server-side streaming export.
   * Required when data is undefined or exceeds largeThreshold.
   * The URL should already include any filter query params.
   */
  apiUrl?: string;
  /**
   * Row threshold above which the server-side export is used instead of
   * the client-side one. Default: 500.
   */
  largeThreshold?: number;
  /** When true the button is rendered but non-interactive. */
  disabled?: boolean;
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg" | "icon";
}

/**
 * Reusable CSV export button.
 *
 * Strategy:
 *   - data present & rows ≤ largeThreshold  → client-side exportToCsv()
 *   - data present & rows > largeThreshold  → server-side via apiUrl
 *   - data absent & apiUrl present           → server-side via apiUrl
 */
export function ExportButton({
  filename,
  data,
  apiUrl,
  largeThreshold = 500,
  disabled = false,
  label = "Export CSV",
  className = "",
  size = "sm",
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setLoading(true);
    try {
      const useClientSide = data !== undefined && data.length <= largeThreshold;

      if (useClientSide) {
        exportToCsv(filename, data!);
        toast({
          title: "Downloaded",
          description: `${filename}_${new Date().toISOString().slice(0, 10)}.csv (${data!.length} rows)`,
        });
        return;
      }

      if (!apiUrl) {
        toast({
          title: "Export unavailable",
          description: "No API URL configured for large export.",
          variant: "destructive",
        });
        return;
      }

      await downloadRemoteCsv(
        (url, opts) => fetchAdminAbsoluteResponse(url, opts),
        apiUrl,
        filename
      );
      toast({
        title: "Downloaded",
        description: `${filename}_${new Date().toISOString().slice(0, 10)}.csv`,
      });
    } catch (err: unknown) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size={size}
      onClick={handleExport}
      disabled={disabled || loading}
      className={`gap-2 rounded-xl ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {loading ? "Exporting…" : label}
    </Button>
  );
}
