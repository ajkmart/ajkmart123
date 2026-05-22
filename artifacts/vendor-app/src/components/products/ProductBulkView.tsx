import { type TranslationKey } from "@workspace/i18n";
import React from "react";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, LABEL } from "../../lib/ui";

type BulkRow = {
  name: string;
  price: string;
  description: string;
  image: string;
  category: string;
  unit: string;
  stock: string;
  type: string;
};
type ImportResult = { name: string; status: "pending" | "success" | "error"; message?: string };

export interface ProductBulkViewProps {
  validRows: BulkRow[];
  bulkRows: BulkRow[];
  setBulkRows: React.Dispatch<React.SetStateAction<BulkRow[]>>;
  bulkCat: string;
  setBulkCat: (v: string) => void;
  catList: string[];
  currencySymbol: string;
  parseErrors: string[];
  setParseErrors: (v: string[]) => void;
  duplicateWarning: string[];
  setDuplicateWarning: (v: string[]) => void;
  bulkImportResults: ImportResult[] | null;
  setBulkImportResults: React.Dispatch<React.SetStateAction<ImportResult[] | null>>;
  bulkImporting: boolean;
  bulkImportProgress: { done: number; total: number } | null;
  setBulkImportProgress: React.Dispatch<
    React.SetStateAction<{ done: number; total: number } | null>
  >;
  allDataLoading: boolean;
  runBulkImport: () => void;
  setView: (v: "list" | "bulk") => void;
  pasteText: string;
  setPasteText: (v: string) => void;
  showPaste: boolean;
  setShowPaste: (v: boolean) => void;
  parsePaste: () => void;
  csvInputRef: React.RefObject<HTMLInputElement>;
  downloadSampleCsv: () => void;
  handleCsvImport: (file: File) => void;
  EMPTY_ROW: BulkRow;
  TYPES: string[];
  T: (key: TranslationKey) => string;
  Toast: React.ReactNode;
  PageHeader: React.ComponentType<{ title: string; subtitle?: string; actions?: React.ReactNode }>;
}

export function ProductBulkView({
  validRows,
  bulkRows,
  setBulkRows,
  bulkCat,
  setBulkCat,
  catList,
  currencySymbol,
  parseErrors,
  setParseErrors,
  duplicateWarning,
  setDuplicateWarning,
  bulkImportResults,
  setBulkImportResults,
  bulkImporting,
  bulkImportProgress,
  setBulkImportProgress,
  allDataLoading,
  runBulkImport,
  setView,
  pasteText,
  setPasteText,
  showPaste,
  setShowPaste,
  parsePaste,
  csvInputRef,
  downloadSampleCsv,
  handleCsvImport,
  EMPTY_ROW,
  TYPES,
  T,
  Toast,
  PageHeader,
}: ProductBulkViewProps) {
  const B_INPUT =
    "w-full h-9 px-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-xs";

  return (
    <div className="bg-gray-50 md:bg-transparent">
      <PageHeader
        title={T("bulkAdd")}
        subtitle={`${validRows.length} ${T("readyToAdd")}`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={downloadSampleCsv}
              className="android-press h-10 min-h-0 rounded-xl bg-white/20 px-3 text-xs font-bold text-white md:bg-blue-50 md:text-blue-600"
            >
              ⬇ Sample CSV
            </button>
            <button
              onClick={() => setView("list")}
              className="android-press h-10 min-h-0 rounded-xl bg-white/20 px-4 text-sm font-bold text-white md:bg-gray-100 md:text-gray-700"
            >
              ← Back
            </button>
          </div>
        }
      />
      <div className="space-y-4 px-4 py-4 md:px-0 md:py-4">
        <div className={`${CARD} p-4`}>
          <div className="space-y-3 md:grid md:grid-cols-3 md:gap-4 md:space-y-0">
            <div>
              <label className={LABEL}>Default Category (for all rows)</label>
              <select
                value={bulkCat}
                onChange={(e) => setBulkCat(e.target.value)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-400 focus:outline-none"
              >
                <option value="">— applies per row if set —</option>
                {catList.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={() => setBulkRows((r) => [...r, { ...EMPTY_ROW }])}
                className="android-press h-10 flex-1 rounded-xl border-2 border-dashed border-blue-300 text-sm font-bold text-blue-500"
              >
                + Add Row
              </button>
              <button
                onClick={() =>
                  setBulkRows((r) => [
                    ...r,
                    { ...EMPTY_ROW },
                    { ...EMPTY_ROW },
                    { ...EMPTY_ROW },
                    { ...EMPTY_ROW },
                    { ...EMPTY_ROW },
                  ])
                }
                className="android-press h-10 flex-1 rounded-xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-500"
              >
                +5 Rows
              </button>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={() => setShowPaste(!showPaste)}
                className="android-press h-10 flex-1 rounded-xl bg-blue-50 text-sm font-bold text-blue-600"
              >
                📋 Paste Data
              </button>
              <label className="android-press flex h-10 flex-1 cursor-pointer items-center justify-center rounded-xl bg-green-50 text-sm font-bold text-green-700">
                📂 Import CSV
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvImport(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => setBulkRows([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }])}
                className="android-press h-10 rounded-xl bg-red-50 px-3 text-sm font-bold text-red-500"
              >
                Clear
              </button>
            </div>
          </div>
          {showPaste && (
            <div className="mt-4 space-y-3 rounded-2xl bg-blue-50 p-4">
              <div>
                <p className="mb-1 text-sm font-bold text-blue-800">📋 Paste from Spreadsheet</p>
                <p className="mb-2 text-xs text-blue-600">
                  Format:{" "}
                  <span className="rounded bg-white px-1 font-mono">
                    Name | Price | Description | Image URL | Category | Unit | Stock
                  </span>{" "}
                  (tab or comma separated)
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder={
                    "Chicken Biryani\t350\tDelicious rice dish\t\tfood\tpcs\t50\nVegetable Pulao\t280\t\t\tfood"
                  }
                  className="w-full resize-none rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-mono text-xs focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPaste(false)}
                  className="android-press h-9 min-h-0 flex-1 rounded-xl border border-blue-200 text-sm font-bold text-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={parsePaste}
                  disabled={!pasteText.trim()}
                  className="android-press h-9 min-h-0 flex-1 rounded-xl bg-blue-500 text-sm font-bold text-white"
                >
                  Parse & Import
                </button>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-3">
            <span className="flex-shrink-0 text-base">ℹ️</span>
            <p className="text-xs text-blue-700">
              <span className="font-bold">CSV limit: 500 rows per file.</span> Uploads are
              automatically sent to the server in batches — no manual splitting needed. Sample CSV
              columns:{" "}
              <span className="rounded bg-white px-1 font-mono">
                name, price, stock, category, description, unit, type, image
              </span>
              .
            </p>
          </div>
          {duplicateWarning.length > 0 && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-bold text-amber-800">
                  ⚠️ {duplicateWarning.length} product name
                  {duplicateWarning.length !== 1 ? "s" : ""} already exist in your catalogue
                </p>
                <button
                  onClick={() => setDuplicateWarning([])}
                  className="text-xs font-medium text-amber-500 hover:underline"
                >
                  Dismiss
                </button>
              </div>
              <ul className="mb-2 max-h-24 space-y-0.5 overflow-y-auto">
                {duplicateWarning.map((n, i) => (
                  <li key={i} className="font-mono text-xs text-amber-700">
                    • {n}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-600">
                Importing will create additional listings with these names.
              </p>
            </div>
          )}
          {parseErrors.length > 0 && (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-bold text-red-700">
                  ⚠️ {parseErrors.length} row{parseErrors.length !== 1 ? "s" : ""} skipped — fix and
                  re-upload to include them
                </p>
                <button
                  onClick={() => setParseErrors([])}
                  className="text-xs text-red-400 hover:underline"
                >
                  Dismiss
                </button>
              </div>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                {parseErrors.map((e, i) => (
                  <li key={i} className="font-mono text-xs text-red-600">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={`${CARD} hidden md:block`}>
          <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-medium text-gray-400">
            <span>↔</span>
            <span>Scroll horizontally if columns are too narrow</span>
          </div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: "900px" }}>
              <div
                className="grid gap-1 border-b border-gray-100 bg-gray-50 px-3 py-2.5"
                style={{
                  gridTemplateColumns:
                    "minmax(140px,2fr) minmax(80px,1fr) minmax(140px,2fr) minmax(120px,1.5fr) minmax(90px,1fr) minmax(60px,0.7fr) minmax(60px,0.7fr) minmax(60px,0.7fr) 32px",
                }}
              >
                {[
                  "Name *",
                  "Price *",
                  "Short Description",
                  "Image URL",
                  "Category",
                  "Unit",
                  "Stock",
                  "Type",
                  "",
                ].map((h, i) => (
                  <p
                    key={i}
                    className="text-[9px] font-extrabold tracking-widest text-gray-400 uppercase"
                  >
                    {h}
                  </p>
                ))}
              </div>
              {bulkRows.map((row, i) => (
                <div
                  key={i}
                  className={`grid gap-1 border-b border-gray-50 px-2 py-1.5 last:border-0 ${!!(bulkRows[i]?.name && !bulkRows[i]?.price) ? "bg-red-50/30" : ""}`}
                  style={{
                    gridTemplateColumns:
                      "minmax(140px,2fr) minmax(80px,1fr) minmax(140px,2fr) minmax(120px,1.5fr) minmax(90px,1fr) minmax(60px,0.7fr) minmax(60px,0.7fr) minmax(60px,0.7fr) 32px",
                  }}
                >
                  <input
                    className={`${B_INPUT} ${!row.name && row.price ? "border-red-300 bg-red-50" : ""}`}
                    value={row.name}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))
                      )
                    }
                    placeholder="Product name *"
                  />
                  <input
                    className={`${B_INPUT} ${row.name && !row.price ? "border-red-300 bg-red-50" : ""}`}
                    type="number"
                    inputMode="numeric"
                    value={row.price}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, price: e.target.value } : x))
                      )
                    }
                    placeholder={`${currencySymbol} *`}
                  />
                  <input
                    className={B_INPUT}
                    value={row.description}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, description: e.target.value } : x))
                      )
                    }
                    placeholder="Short description"
                  />
                  <input
                    className={B_INPUT}
                    type="url"
                    value={row.image}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, image: e.target.value } : x))
                      )
                    }
                    placeholder="https://img.url"
                  />
                  <select
                    className={`${B_INPUT} appearance-none`}
                    value={row.category}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, category: e.target.value } : x))
                      )
                    }
                  >
                    <option value="">{bulkCat || "category"}</option>
                    {catList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    className={B_INPUT}
                    value={row.unit}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x))
                      )
                    }
                    placeholder="kg/pcs"
                  />
                  <input
                    className={B_INPUT}
                    type="number"
                    inputMode="numeric"
                    value={row.stock}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x))
                      )
                    }
                    placeholder="qty"
                  />
                  <select
                    className={`${B_INPUT} appearance-none`}
                    value={row.type || "mart"}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, type: e.target.value } : x))
                      )
                    }
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setBulkRows((r) => r.filter((_, j) => j !== i))}
                    className="flex h-9 min-h-0 w-8 items-center justify-center text-base font-bold text-red-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {bulkRows.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  No rows yet — add rows or paste data above
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          {bulkRows.map((row, i) => (
            <div
              key={i}
              className={`${CARD} space-y-2.5 border-2 p-4 ${row.name && row.price ? "border-blue-100" : "border-gray-100"}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-extrabold tracking-wider text-gray-400 uppercase">
                  Row {i + 1} {row.name && row.price ? "✓" : ""}
                </p>
                <button
                  onClick={() => setBulkRows((r) => r.filter((_, j) => j !== i))}
                  className="h-7 min-h-0 w-7 rounded-lg bg-red-50 text-sm font-bold text-red-500"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <p className="mb-1 text-[10px] font-bold text-gray-400">NAME *</p>
                  <input
                    className={`${B_INPUT} h-10`}
                    value={row.name}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))
                      )
                    }
                    placeholder="Product name"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold text-gray-400">
                    PRICE ({currencySymbol}) *
                  </p>
                  <input
                    className={`${B_INPUT} h-10`}
                    type="number"
                    inputMode="numeric"
                    value={row.price}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, price: e.target.value } : x))
                      )
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold text-gray-400">CATEGORY</p>
                  <select
                    className={`${B_INPUT} h-10 appearance-none`}
                    value={row.category}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, category: e.target.value } : x))
                      )
                    }
                  >
                    <option value="">{bulkCat || "select"}</option>
                    {catList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <p className="mb-1 text-[10px] font-bold text-gray-400">SHORT DESCRIPTION</p>
                  <input
                    className={`${B_INPUT} h-10`}
                    value={row.description}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, description: e.target.value } : x))
                      )
                    }
                    placeholder="Brief product description"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold text-gray-400">UNIT</p>
                  <input
                    className={`${B_INPUT} h-10`}
                    value={row.unit}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x))
                      )
                    }
                    placeholder="kg/pcs/ltr"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold text-gray-400">STOCK</p>
                  <input
                    className={`${B_INPUT} h-10`}
                    type="number"
                    inputMode="numeric"
                    value={row.stock}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x))
                      )
                    }
                    placeholder="qty"
                  />
                </div>
                <div className="col-span-2">
                  <p className="mb-1 text-[10px] font-bold text-gray-400">TYPE</p>
                  <select
                    className={`${B_INPUT} h-10 appearance-none`}
                    value={row.type || "mart"}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, type: e.target.value } : x))
                      )
                    }
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <p className="mb-1 text-[10px] font-bold text-gray-400">IMAGE URL</p>
                  <input
                    className={`${B_INPUT} h-10`}
                    type="url"
                    value={row.image}
                    onChange={(e) =>
                      setBulkRows((r) =>
                        r.map((x, j) => (j === i ? { ...x, image: e.target.value } : x))
                      )
                    }
                    placeholder="https://"
                  />
                </div>
              </div>
            </div>
          ))}
          {bulkRows.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              No rows yet — tap + Add Row or import CSV
            </div>
          )}
        </div>

        {bulkImportResults ? (
          <div className={`${CARD} space-y-3 p-4`}>
            <p className="text-sm font-extrabold text-gray-800">Import Progress</p>
            {bulkImportProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {bulkImporting ? "Importing..." : "Complete"}
                  </p>
                  <p className="text-sm font-extrabold text-blue-600 tabular-nums">
                    {bulkImportProgress.done} / {bulkImportProgress.total}
                  </p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${(bulkImportProgress.done / bulkImportProgress.total) * 100}%`,
                    }}
                  />
                </div>
                {!bulkImporting &&
                  (() => {
                    const added = bulkImportResults.filter((r) => r.status === "success").length;
                    const failed = bulkImportResults.filter((r) => r.status === "error").length;
                    return (
                      <div className="mt-2 flex gap-3">
                        <span className="text-xs font-bold text-green-600">✅ {added} added</span>
                        {failed > 0 && (
                          <span className="text-xs font-bold text-red-500">❌ {failed} failed</span>
                        )}
                      </div>
                    );
                  })()}
              </div>
            )}
            <p className="mb-1 text-xs font-bold tracking-wider text-gray-500 uppercase">
              Row details
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {bulkImportResults.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${r.status === "success" ? "bg-green-50" : r.status === "error" ? "bg-red-50" : "bg-gray-50"}`}
                >
                  <span className="flex-shrink-0 text-base">
                    {r.status === "success" ? (
                      "✅"
                    ) : r.status === "error" ? (
                      "❌"
                    ) : (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                    )}
                  </span>
                  <span className="flex-1 truncate font-medium text-gray-800">{r.name}</span>
                  {r.status === "error" && r.message && (
                    <span className="max-w-[140px] truncate text-xs text-red-500" title={r.message}>
                      {r.message}
                    </span>
                  )}
                  {r.status === "success" && (
                    <span className="text-xs font-bold text-green-600">Added</span>
                  )}
                  {r.status === "pending" && (
                    <span className="text-xs text-gray-400">Waiting…</span>
                  )}
                </div>
              ))}
            </div>
            {!bulkImporting && (
              <button
                onClick={() => {
                  setBulkImportResults(null);
                  setBulkImportProgress(null);
                  setView("list");
                  setBulkRows([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
                  setBulkCat("");
                }}
                className={`mt-3 ${BTN_PRIMARY}`}
              >
                ✓ Done — View Products
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => setView("list")} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button
              onClick={runBulkImport}
              disabled={bulkImporting || validRows.length === 0 || allDataLoading}
              className={BTN_PRIMARY}
            >
              {allDataLoading
                ? "Checking limit..."
                : bulkImporting
                  ? "Adding..."
                  : `➕ Add ${validRows.length} Products`}
            </button>
          </div>
        )}
      </div>
      {Toast}
    </div>
  );
}
