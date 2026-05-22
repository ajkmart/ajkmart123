export type CsvRow = Record<string, string | number | boolean | null | undefined>;

/**
 * Client-side CSV export utility.
 * Handles proper escaping (commas, newlines, quotes, CSV-injection prefixes).
 */
export function exportToCsv(filename: string, rows: CsvRow[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? "";
          let str = String(val);
          // Guard against CSV injection (=, +, -, @, tab, CR prefix attacks)
          if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
          // Wrap in quotes if the value contains a comma, newline or quote
          if (str.includes(",") || str.includes("\n") || str.includes('"')) {
            str = `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download a server-streamed CSV by fetching with authentication headers.
 * Use this for large datasets that must be generated server-side.
 *
 * @param fetchFn  Authenticated fetch function (e.g. fetchAdminAbsoluteResponse)
 * @param url      Full API URL (including query params)
 * @param fallbackFilename  Used if the server doesn't send Content-Disposition
 */
export async function downloadRemoteCsv(
  fetchFn: (url: string, opts?: RequestInit) => Promise<Response>,
  url: string,
  fallbackFilename: string
): Promise<void> {
  const res = await fetchFn(url, { method: "GET" });
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(msg || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  const cd = res.headers.get("content-disposition") ?? "";
  const match = cd.match(/filename="?([^";\n]+)"?/);
  a.download = match?.[1] ?? `${fallbackFilename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
