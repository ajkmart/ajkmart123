import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { ChangeEvent, DragEvent, useRef, useState } from "react";

export interface BulkUploadProps {
  onUpload: (rows: Record<string, string>[]) => Promise<void>;
  columns: string[];
  sampleCsvUrl?: string;
  className?: string;
}

interface RowError {
  row: number;
  message: string;
}

const MAX_PREVIEW_ROWS = 5;

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

/**
 * CSV drag-and-drop bulk upload component.
 * Parses the file client-side, validates expected headers, shows a scrollable
 * row preview, uploads via `onUpload`, and displays per-row errors returned.
 *
 * Usage:
 *   <BulkUpload
 *     columns={["name", "price", "category"]}
 *     onUpload={async (rows) => { await adminPost("/products/bulk", { rows }); }}
 *     sampleCsvUrl="/sample-products.csv"
 *   />
 */
export function BulkUpload({ onUpload, columns, sampleCsvUrl, className }: BulkUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]);
    setHeaders([]);
    setFileName("");
    setHeaderErrors([]);
    setRowErrors([]);
    setIsSuccess(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function processFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setHeaderErrors(["Only CSV files are supported."]);
      return;
    }
    setFileName(file.name);
    setHeaderErrors([]);
    setRowErrors([]);
    setIsSuccess(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);

      if (parsed.length === 0) {
        setHeaderErrors(["The CSV file is empty or has no data rows."]);
        return;
      }

      const parsedHeaders = Object.keys(parsed[0]!);
      setHeaders(parsedHeaders);
      setRows(parsed);

      const missing = columns.filter((c) => !parsedHeaders.includes(c));
      if (missing.length > 0) {
        setHeaderErrors([`Missing required columns: ${missing.join(", ")}`]);
      }
    };
    reader.readAsText(file);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function handleUpload() {
    if (rows.length === 0 || headerErrors.length > 0) return;
    setIsPending(true);
    setRowErrors([]);
    try {
      await onUpload(rows);
      setIsSuccess(true);
    } catch (err: unknown) {
      const errors: RowError[] = [];
      if (err && typeof err === "object" && "details" in err) {
        const details = (err as { details?: unknown }).details;
        if (Array.isArray(details)) {
          details.forEach((d: unknown, i: number) => {
            if (d && typeof d === "object" && "message" in d) {
              errors.push({ row: i + 2, message: String((d as { message: unknown }).message) });
            }
          });
        }
      }
      if (errors.length === 0) {
        errors.push({ row: 0, message: err instanceof Error ? err.message : "Upload failed." });
      }
      setRowErrors(errors);
    } finally {
      setIsPending(false);
    }
  }

  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS);
  const hasErrors = headerErrors.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          rows.length > 0 ? "py-4" : "py-10"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={onFileChange}
        />
        {rows.length > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <FileText className="text-primary h-5 w-5 shrink-0" />
            <span className="max-w-xs truncate font-medium">{fileName}</span>
            <span className="text-muted-foreground">({rows.length} rows)</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive ml-2 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="text-muted-foreground h-8 w-8" />
            <div>
              <p className="text-sm font-medium">Drag & drop a CSV file here</p>
              <p className="text-muted-foreground mt-1 text-xs">or click to browse</p>
            </div>
            <p className="text-muted-foreground text-xs">Required columns: {columns.join(", ")}</p>
            {sampleCsvUrl && (
              <a
                href={sampleCsvUrl}
                download
                className="text-primary text-xs underline underline-offset-4 hover:no-underline"
                onClick={(e) => e.stopPropagation()}
              >
                Download sample CSV
              </a>
            )}
          </>
        )}
      </div>

      {hasErrors && (
        <div className="bg-destructive/10 border-destructive/20 space-y-1 rounded-lg border p-3">
          {headerErrors.map((e, i) => (
            <p key={i} className="text-destructive flex items-start gap-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {e}
            </p>
          ))}
        </div>
      )}

      {rowErrors.length > 0 && (
        <div className="bg-destructive/10 border-destructive/20 space-y-1 rounded-lg border p-3">
          <p className="text-destructive text-sm font-medium">Upload errors:</p>
          {rowErrors.map((e, i) => (
            <p key={i} className="text-destructive text-xs">
              {e.row > 0 ? `Row ${e.row}: ` : ""}
              {e.message}
            </p>
          ))}
        </div>
      )}

      {isSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          <p className="text-sm text-green-700">Upload completed successfully.</p>
        </div>
      )}

      {previewRows.length > 0 && !hasErrors && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Preview ({Math.min(rows.length, MAX_PREVIEW_ROWS)} of {rows.length} rows)
          </p>
          <ScrollArea className="border-border bg-muted/20 h-40 rounded-lg border">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="text-muted-foreground px-3 py-2 text-left font-semibold whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {headers.map((h) => (
                        <td
                          key={h}
                          className="max-w-[160px] truncate px-3 py-1.5 whitespace-nowrap"
                        >
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </div>
      )}

      {rows.length > 0 && !hasErrors && !isSuccess && (
        <Button onClick={handleUpload} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading {rows.length} rows…
            </span>
          ) : (
            `Upload ${rows.length} rows`
          )}
        </Button>
      )}
    </div>
  );
}
