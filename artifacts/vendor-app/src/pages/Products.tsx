import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { PageHeader } from "../components/PageHeader";
import { ProductBulkView } from "../components/products/ProductBulkView";
import { ProductFormView } from "../components/products/ProductFormView";
import { StockHistoryPanel } from "../components/products/StockHistoryPanel";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import { SafeImage } from "../components/ui/SafeImage";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { api, apiFetch } from "../lib/api";
import { CARD, errMsg, fc } from "../lib/ui";
import { useCurrency, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { useAuth } from "../lib/vendor-auth";
import { useProductForm } from "./useProductForm";

// ── Constants ──
const EMPTY_ROW = {
  name: "",
  price: "",
  description: "",
  image: "",
  category: "",
  unit: "",
  stock: "",
  type: "mart",
};
const CATS_FALLBACK = [
  "food",
  "grocery",
  "bakery",
  "pharmacy",
  "electronics",
  "clothing",
  "mart",
  "general",
];
const TYPES = ["mart", "food", "pharmacy", "parcel"];

export default function Products() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const {
    isOnline,
    pendingProductCount,
    productQueueErrors,
    enqueueProductAction,
    retryProductQueueItem,
    dismissProductQueueError,
  } = useOfflineQueue();
  const { config } = usePlatformConfig();
  const { symbol: currencySymbol } = useCurrency();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const maxItems = config.vendor?.maxItems ?? 100;
  const lowStockThreshold = config.vendor?.lowStockThreshold ?? 10;

  // ── Per-product low-stock thresholds (localStorage fallback; server value takes precedence) ──
  const [productThresholds, setProductThresholds] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem("vendor_product_thresholds");
      return stored ? JSON.parse(stored) : {};
    } catch (err) {
      console.warn("[artifacts/vendor-app/src/pages/Products.tsx]", err);
      return {};
    } // eslint-disable-line no-console
  });

  const saveThreshold = (productId: string, value: number | null) => {
    setProductThresholds((prev) => {
      const next = { ...prev };
      if (value == null) {
        delete next[productId];
      } else {
        next[productId] = value;
      }
      try {
        localStorage.setItem("vendor_product_thresholds", JSON.stringify(next));
      } catch (err) {
        console.warn("[artifacts/vendor-app/src/pages/Products.tsx]", err);
      } // eslint-disable-line no-console
      return next;
    });
  };

  // ── All-products query (needed by mutations to enforce the item limit) ──
  const {
    data: allData,
    isLoading: allDataLoading,
    isSuccess: allDataSuccess,
  } = useQuery({
    queryKey: ["vendor-products-all"],
    queryFn: () => api.getProducts(),
  });
  const totalProductCount =
    allDataSuccess && Array.isArray(allData?.products) ? allData.products.length : null;

  // ── Form state, mutations, open/close — managed by hook ──
  const {
    toast,
    showToast,
    showAdd,
    setShowAdd,
    editProd,
    form,
    formErrors,
    videoUploading,
    editThreshold,
    setEditThreshold,
    f,
    validateForm,
    maxVideoMb,
    maxVideoDurationSec,
    allowedVideoFormats,
    handleVideoUpload,
    hideMut,
    createMut,
    updateMut,
    deleteMut,
    toggleMut,
    openEdit,
    closeForm,
  } = useProductForm({
    qc,
    isOnline,
    maxItems,
    totalProductCount,
    productThresholds,
    saveThreshold,
    config,
    enqueueProductAction,
  });

  // ── Real-time stock sync via Socket.IO ──
  const socketRef = useRef<Socket | null>(null);
  const [lastStockSync, setLastStockSync] = useState<Date | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const token = api.getToken();
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      query: { rooms: `vendor:${user.id}` },
      auth: { token },
      extraHeaders: { Authorization: `Bearer ${token}` },
      transports: ["polling", "websocket"],
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      /* Re-join the vendor room explicitly on every connect (including reconnects).
         The room is also joined at handshake time via query.rooms, but emitting
         join again on reconnect is harmless and ensures the room is held. */
      socket.emit("join", `vendor:${user.id}`);
      /* Always invalidate on connect — including the first connect — to flush
         any stock updates that were broadcast during the socket setup window
         (between component mount and the socket completing its handshake). */
      void qc.invalidateQueries({ queryKey: ["vendor-products"] });
      void qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
    });
    socket.on(
      "product:stock_updated",
      (payload: {
        productId: string;
        vendorId: string;
        stock: number | null;
        inStock: boolean;
      }) => {
        /* Check if the product is present in the unfiltered cache before patching.
           If it's not there (e.g. initial load not yet complete, or race on first connect),
           fall back to a full invalidation so the UI self-heals immediately. */
        const allCached = qc.getQueryData<{ products: any[] }>(["vendor-products-all"]);
        const inCache = allCached?.products?.some((p: any) => p.id === payload.productId) ?? false;

        if (inCache) {
          const patchProducts = (old: { products: any[] } | undefined) => {
            if (!old?.products) return old;
            const updated = old.products.map((p) =>
              p.id === payload.productId
                ? { ...p, stock: payload.stock, inStock: payload.inStock }
                : p
            );
            return { ...old, products: updated };
          };
          /* Patch the filtered list (current view) and the unfiltered "all" list */
          qc.setQueriesData<{ products: any[] }>({ queryKey: ["vendor-products"] }, patchProducts);
          qc.setQueriesData<{ products: any[] }>(
            { queryKey: ["vendor-products-all"] },
            patchProducts
          );
        } else {
          /* Product not in cache (e.g. arrived before initial fetch completed) — re-fetch */
          void qc.invalidateQueries({ queryKey: ["vendor-products"] });
          void qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
        }
        setLastStockSync(new Date());
      }
    );
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, qc]);

  // ── View + filter state ──
  const [view, setView] = useState<"list" | "bulk">("list");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  // ── Product queries ──
  const { data: catsData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch("/categories"),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const catList: string[] = useMemo(() => {
    const raw = catsData;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((c: any) => (typeof c === "string" ? c : (c.slug ?? c.name ?? String(c))));
    }
    if (raw && Array.isArray(raw.categories) && raw.categories.length > 0) {
      return raw.categories.map((c: any) =>
        typeof c === "string" ? c : (c.slug ?? c.name ?? String(c))
      );
    }
    return CATS_FALLBACK;
  }, [catsData]);

  const {
    data,
    isLoading,
    isError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ["vendor-products", search, filterCat],
    queryFn: () =>
      api.getProducts(search || undefined, filterCat !== "all" ? filterCat : undefined),
    refetchInterval: 60000,
  });
  const products: any[] = useMemo(
    () => (Array.isArray(data?.products) ? data.products : []),
    [data?.products]
  );

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.category && s.add(p.category));
    return ["all", ...Array.from(s)];
  }, [products]);

  const lowStock = products.filter((p) => {
    if (p.stock == null || p.stock === undefined || p.stock < 0) return false;
    const thresh = p.lowStockThreshold ?? productThresholds[p.id] ?? lowStockThreshold;
    return p.stock <= thresh;
  });

  // ── Bulk add state ──
  const [bulkRows, setBulkRows] = useState([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [bulkCat, setBulkCat] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [stockHistoryOpen, setStockHistoryOpen] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string[]>([]);
  const csvListInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Bulk edit mode ──
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditSelected, setBulkEditSelected] = useState<Set<string>>(new Set());
  const [bulkEditPrice, setBulkEditPrice] = useState("");
  const [bulkEditStock, setBulkEditStock] = useState("");
  const [bulkEditError, setBulkEditError] = useState("");

  /* Exit bulk edit mode when switching to add/bulk views */
  useEffect(() => {
    if (showAdd || view === "bulk") {
      setBulkEditMode(false);
      setBulkEditSelected(new Set());
    }
  }, [showAdd, view]);

  const toggleBulkSelect = (id: string) => {
    setBulkEditSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkEditMut = useMutation({
    mutationFn: () => {
      const ids = Array.from(bulkEditSelected);
      if (ids.length === 0) throw new Error("No products selected");
      const patch: { price?: number; stock?: number | null } = {};
      if (bulkEditPrice) {
        if (Number(bulkEditPrice) <= 0) throw new Error("Price must be greater than 0");
        patch.price = Number(bulkEditPrice);
      }
      if (bulkEditStock !== "") {
        if (Number(bulkEditStock) < 0) throw new Error("Stock cannot be negative");
        patch.stock = Number(bulkEditStock);
      }
      if (!patch.price && patch.stock === undefined)
        throw new Error("Enter a price or stock value to update");
      return api.bulkEditProducts(ids.map((id) => ({ id, ...patch })));
    },
    onSuccess: (res: any) => {
      void qc.invalidateQueries({ queryKey: ["vendor-products"] });
      setBulkEditMode(false);
      setBulkEditSelected(new Set());
      setBulkEditPrice("");
      setBulkEditStock("");
      setBulkEditError("");
      showToast(`✅ Updated ${res.updated} product${res.updated !== 1 ? "s" : ""}!`);
    },
    onError: (e: Error) => setBulkEditError(errMsg(e)),
  });

  // ── CSV helpers ──
  const downloadSampleCsv = () => {
    const headers = ["name", "price", "stock", "category", "description", "unit", "type", "image"];
    const rows = [
      [
        "Chicken Biryani",
        "350",
        "50",
        "food",
        "Delicious rice dish with chicken",
        "pcs",
        "food",
        "",
      ],
      [
        "Vegetable Pulao",
        "280",
        "30",
        "food",
        "Fresh vegetables with aromatic rice",
        "pcs",
        "food",
        "",
      ],
      ["Mango Juice 1L", "120", "100", "grocery", "Fresh mango juice 1 litre", "ltr", "mart", ""],
    ];
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ajkmart_products_sample.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── CSV file import (worker:true, 500-row limit, header validation) ── */
  const handleCsvImport = (file: File, switchToBulk = false) => {
    /* Preflight: read first line to validate headers before spawning the worker */
    const reader = new FileReader();
    reader.onload = (e) => {
      const firstLine = ((e.target?.result as string) || "").split(/\r?\n/)[0] || "";
      const headers = firstLine.split(",").map((h) => h.replace(/^"|"$/g, "").toLowerCase().trim());
      if (!headers.includes("name") || !headers.includes("price")) {
        showToast("❌ CSV must have 'name' and 'price' column headers");
        return;
      }
      /* Full parse via worker; step-based early abort at 500 data rows */
      let rowCount = 0;
      const rowErrors: string[] = [];
      const parsed: typeof bulkRows = [];
      Papa.parse<Record<string, string>>(file, {
        worker: true,
        header: true,
        skipEmptyLines: true,
        step: (result: Papa.ParseStepResult<Record<string, string>>, parser: Papa.Parser) => {
          rowCount++;
          if (rowCount > 500) {
            parser.abort();
            return;
          }
          const row = result.data;
          const name = (row["name"] || row["Name"] || "").trim();
          const price = (row["price"] || row["Price"] || "").trim();
          const stockRaw = (row["stock"] || row["Stock"] || "").trim();
          if (!name) {
            rowErrors.push(`Row ${rowCount}: name is empty — skipped`);
            return;
          }
          if (!price || isNaN(Number(price)) || Number(price) <= 0) {
            rowErrors.push(`Row ${rowCount}: price "${price}" must be a positive number — skipped`);
            return;
          }
          if (stockRaw && !isNaN(Number(stockRaw)) && Number(stockRaw) < 0) {
            rowErrors.push(`Row ${rowCount}: stock cannot be negative ("${stockRaw}") — skipped`);
            return;
          }
          parsed.push({
            name,
            price,
            description: (row["description"] || row["Description"] || "").trim(),
            image: (row["image"] || row["image_url"] || row["Image"] || "").trim(),
            category: (row["category"] || row["Category"] || bulkCat || "").trim(),
            unit: (row["unit"] || row["Unit"] || "").trim(),
            stock: stockRaw,
            type: (row["type"] || row["Type"] || "mart").trim() || "mart",
          });
        },
        complete: (results: Papa.ParseResult<Record<string, string>>) => {
          if (results.meta.aborted) {
            showToast("❌ CSV has more than 500 rows — split into files of ≤500 rows.");
            return;
          }
          setParseErrors(rowErrors);
          if (parsed.length === 0) {
            showToast("❌ No valid rows found — check that 'name' and 'price' columns have values");
            return;
          }
          /* Idempotency: check for name collisions against existing products */
          const existingNames = new Set(products.map((p: any) => p.name.toLowerCase().trim()));
          const dupes = parsed
            .map((r) => r.name)
            .filter((n) => existingNames.has(n.toLowerCase().trim()));
          if (dupes.length > 0) setDuplicateWarning(dupes);
          else setDuplicateWarning([]);
          setBulkRows((r) => {
            const empty = r.filter((x) => !x.name.trim() && !x.price.trim());
            return [...(empty.length === r.length ? [] : r), ...parsed];
          });
          if (switchToBulk) setView("bulk");
          showToast(
            `✅ Imported ${parsed.length} rows${rowErrors.length ? ` (${rowErrors.length} skipped)` : ""}`
          );
        },
        error: (err: Error) => {
          showToast("❌ Failed to parse CSV: " + err.message);
        },
      });
    };
    /* Read only the first line for the preflight check */
    reader.readAsText(file.slice(0, 2048), "utf-8");
  };

  const parsePaste = () => {
    const isTabSeparated = pasteText.includes("\t") && !pasteText.startsWith('"');
    const delimiter = isTabSeparated ? "\t" : ",";
    const result = Papa.parse<string[]>(pasteText.trim(), {
      delimiter,
      skipEmptyLines: true,
      quoteChar: '"',
    });
    const rowErrors: string[] = [];
    const parsed: typeof bulkRows = [];
    result.data.forEach((parts, idx) => {
      if (result.errors.some((e) => e.row === idx)) {
        rowErrors.push(
          `Row ${idx + 1}: parse error — ${result.errors.find((e) => e.row === idx)?.message}`
        );
        return;
      }
      const name = (parts[0] || "").trim();
      const price = (parts[1] || "").trim();
      if (!name) {
        rowErrors.push(`Row ${idx + 1}: name is empty — skipped`);
        return;
      }
      if (!price || Number.isNaN(Number(price))) {
        rowErrors.push(`Row ${idx + 1}: invalid price "${price}" — skipped`);
        return;
      }
      parsed.push({
        name,
        price,
        description: (parts[2] || "").trim(),
        image: (parts[3] || "").trim(),
        category: (parts[4] || bulkCat || "").trim(),
        unit: (parts[5] || "").trim(),
        stock: (parts[6] || "").trim(),
        type: (parts[7] || "mart").trim() || "mart",
      });
    });
    setParseErrors(rowErrors);
    if (parsed.length > 0) {
      setBulkRows((r) => [...r, ...parsed]);
      setShowPaste(false);
      setPasteText("");
      showToast(
        `✅ Parsed ${parsed.length} rows${rowErrors.length ? ` (${rowErrors.length} skipped)` : ""}`
      );
    } else {
      showToast("❌ No valid rows found — check format");
    }
  };

  // ── Bulk import progress ──
  const [bulkImportResults, setBulkImportResults] = useState<Array<{
    name: string;
    status: "pending" | "success" | "error";
    message?: string;
  }> | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportProgress, setBulkImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const runBulkImport = useCallback(async () => {
    const valid = bulkRows.filter(
      (r) => r.name.trim() && r.price && !Number.isNaN(Number(r.price)) && Number(r.price) > 0
    );
    if (totalProductCount == null) {
      showToast("Cannot verify product count — please wait and try again.");
      return;
    }
    if (totalProductCount + valid.length > maxItems) {
      showToast(
        `Product limit reached. You can add at most ${maxItems - totalProductCount} more product(s).`
      );
      return;
    }
    if (valid.length === 0) return;
    const initial: Array<{
      name: string;
      status: "pending" | "success" | "error";
      message?: string;
    }> = valid.map((r) => ({ name: r.name.trim(), status: "pending" }));
    setBulkImportResults(initial);
    setBulkImporting(true);
    setBulkImportProgress({ done: 0, total: valid.length });
    let successCount = 0;
    let doneCount = 0;
    const results = [...initial];

    /* Send in batches of 50 to match server limit */
    const BATCH = 50;
    for (let batchStart = 0; batchStart < valid.length; batchStart += BATCH) {
      const batch = valid.slice(batchStart, batchStart + BATCH);
      for (let j = 0; j < batch.length; j++) {
        const i = batchStart + j;
        const r = batch[j]!;
        try {
          await api.createProduct({
            name: r.name.trim(),
            price: Number(r.price),
            description: r.description.trim() || null,
            image: r.image.trim() || null,
            category: r.category.trim() || bulkCat || "general",
            unit: r.unit.trim() || null,
            stock: r.stock ? Number(r.stock) : null,
            type: r.type || "mart",
          });
          results[i] = { ...results[i]!, status: "success" };
          successCount++;
        } catch (e) {
          results[i] = {
            ...results[i]!,
            status: "error",
            message: e instanceof Error ? e.message : "Failed",
          };
        }
        doneCount++;
        setBulkImportProgress({ done: doneCount, total: valid.length });
        setBulkImportResults([...results]);
      }
    }
    setBulkImporting(false);
    void qc.invalidateQueries({ queryKey: ["vendor-products"] });
    void qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
    showToast(`✅ ${successCount} of ${valid.length} products added!`);
  }, [bulkRows, totalProductCount, maxItems, bulkCat, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const _bulkMut = useMutation({
    mutationFn: () => {
      const valid = bulkRows.filter(
        (r) => r.name.trim() && r.price && !Number.isNaN(Number(r.price))
      );
      if (totalProductCount == null)
        throw new Error("Cannot verify product count — please wait and try again.");
      if (totalProductCount + valid.length > maxItems) {
        throw new Error(
          `Product limit reached. You can add at most ${maxItems - totalProductCount} more product(s).`
        );
      }
      return api.bulkAddProducts(
        valid.map((r) => ({
          name: r.name.trim(),
          price: Number(r.price),
          description: r.description.trim() || null,
          image: r.image.trim() || null,
          category: r.category.trim() || bulkCat || "general",
          unit: r.unit.trim() || null,
          stock: r.stock ? Number(r.stock) : null,
          type: r.type || "mart",
        }))
      );
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["vendor-products"] });
      void qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
      setView("list");
      setBulkRows([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
      setBulkCat("");
      showToast(`✅ ${res.inserted} products added!`);
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["vendor-products"] });
  }, [qc]);

  // ── Toast overlay ──
  const Toast = toast ? (
    <div
      className="toast-in fixed top-0 right-0 left-0 z-50 flex justify-center"
      style={{
        paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)",
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-2xl">
        {toast}
      </div>
    </div>
  ) : null;

  // ── Add / Edit form early return ──
  if (showAdd)
    return (
      <ProductFormView
        editProd={editProd as Record<string, unknown> | null}
        form={form}
        f={f}
        formErrors={formErrors}
        validateForm={validateForm}
        catList={catList}
        config={config}
        videoUploading={videoUploading}
        handleVideoUpload={handleVideoUpload}
        allowedVideoFormats={allowedVideoFormats}
        maxVideoMb={maxVideoMb}
        maxVideoDurationSec={maxVideoDurationSec}
        editThreshold={editThreshold}
        setEditThreshold={setEditThreshold}
        lowStockThreshold={lowStockThreshold}
        createMut={createMut}
        updateMut={updateMut}
        closeForm={closeForm}
        Toast={Toast}
        T={T}
        PageHeader={PageHeader}
        TYPES={TYPES}
      />
    );

  // ── Bulk add early return ──
  const validRows = bulkRows.filter((r) => r.name.trim() && r.price);

  if (view === "bulk")
    return (
      <ProductBulkView
        validRows={validRows}
        bulkRows={bulkRows}
        setBulkRows={setBulkRows}
        bulkCat={bulkCat}
        setBulkCat={setBulkCat}
        catList={catList}
        currencySymbol={currencySymbol}
        parseErrors={parseErrors}
        setParseErrors={setParseErrors}
        duplicateWarning={duplicateWarning}
        setDuplicateWarning={setDuplicateWarning}
        bulkImportResults={bulkImportResults}
        setBulkImportResults={setBulkImportResults}
        bulkImporting={bulkImporting}
        bulkImportProgress={bulkImportProgress}
        setBulkImportProgress={setBulkImportProgress}
        allDataLoading={allDataLoading}
        runBulkImport={runBulkImport}
        setView={setView}
        pasteText={pasteText}
        setPasteText={setPasteText}
        showPaste={showPaste}
        setShowPaste={setShowPaste}
        parsePaste={parsePaste}
        csvInputRef={csvInputRef as React.RefObject<HTMLInputElement>}
        downloadSampleCsv={downloadSampleCsv}
        handleCsvImport={handleCsvImport}
        EMPTY_ROW={EMPTY_ROW}
        TYPES={TYPES}
        T={T}
        Toast={Toast}
        PageHeader={PageHeader}
      />
    );

  // ── Product List ──
  return (
    <PullToRefresh
      onRefresh={handlePullRefresh}
      className="min-h-screen bg-[#0A0F1A] md:bg-transparent"
    >
      <PageHeader
        title={T("products")}
        subtitle={
          totalProductCount != null
            ? `${totalProductCount}/${maxItems} items used`
            : `—/${maxItems} items`
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBulkEditMode((m) => {
                    const next = !m;
                    if (!next) {
                      setBulkEditSelected(new Set());
                      setBulkEditError("");
                    }
                    return next;
                  });
                }}
                className={`android-press h-9 min-h-0 rounded-xl px-3.5 text-xs font-bold ${bulkEditMode ? "bg-blue-600 text-white" : "bg-white/20 text-white md:bg-gray-100 md:text-gray-700"}`}
              >
                {bulkEditMode ? "✕ Cancel" : "✏️ Bulk Edit"}
              </button>
              <label
                className={`android-press flex h-9 min-h-0 cursor-pointer items-center justify-center rounded-xl px-3.5 text-xs font-bold ${allDataLoading || totalProductCount == null || totalProductCount >= maxItems ? "pointer-events-none cursor-not-allowed bg-gray-300 text-gray-500" : "bg-white/20 text-white md:bg-green-50 md:text-green-700"}`}
              >
                📥 Import CSV
                <input
                  ref={csvListInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={
                    allDataLoading || totalProductCount == null || totalProductCount >= maxItems
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBulkRows([{ ...EMPTY_ROW }]);
                      handleCsvImport(file, true);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => setView("bulk")}
                disabled={
                  allDataLoading || totalProductCount == null || totalProductCount >= maxItems
                }
                className={`android-press h-9 min-h-0 rounded-xl px-3.5 text-xs font-bold ${allDataLoading || totalProductCount == null || totalProductCount >= maxItems ? "cursor-not-allowed bg-gray-300 text-gray-500" : "bg-white/20 text-white md:bg-gray-100 md:text-gray-700"}`}
              >
                Bulk Add
              </button>
              <button
                onClick={() => setShowAdd(true)}
                disabled={
                  allDataLoading || totalProductCount == null || totalProductCount >= maxItems
                }
                className={`android-press h-9 min-h-0 rounded-xl px-3.5 text-sm font-bold ${allDataLoading || totalProductCount == null || totalProductCount >= maxItems ? "cursor-not-allowed bg-gray-300 text-gray-500" : "bg-white text-blue-500 md:bg-blue-600 md:text-white"}`}
              >
                + Add
              </button>
            </div>
          </div>
        }
        mobileContent={
          <input
            type="search"
            placeholder="🔍  Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-2xl bg-white/20 px-4 text-base text-white placeholder-orange-200 transition-all focus:bg-white focus:text-gray-800 focus:placeholder-gray-400 focus:outline-none"
          />
        }
      />

      {/* Desktop search */}
      <div className="hidden px-0 py-3 md:block">
        <input
          type="search"
          placeholder="🔍 Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Live sync indicator */}
      {lastStockSync && (
        <div className="hidden items-center gap-1.5 px-0 pb-1 text-[11px] font-medium text-green-600 md:flex">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
          Last synced: {lastStockSync.toLocaleTimeString()}
        </div>
      )}

      {/* Category chips */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white md:static md:mt-2 md:border-0 md:bg-transparent">
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 md:px-0">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={`android-press h-8 min-h-0 flex-shrink-0 rounded-full px-3.5 text-xs font-bold whitespace-nowrap capitalize transition-all ${filterCat === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-blue-50"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 md:px-0 md:py-4">
        {/* Offline pending queue banner */}
        {pendingProductCount > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex-shrink-0 text-xl">⏳</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-800">
                  {pendingProductCount} product change{pendingProductCount > 1 ? "s" : ""} pending
                  sync
                </p>
                <p className="mt-0.5 text-xs text-amber-600">
                  Will sync automatically when you reconnect
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Queue error banners */}
        {productQueueErrors.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50">
            <div className="flex items-center gap-3 border-b border-red-100 px-4 py-3">
              <span className="flex-shrink-0 text-xl">❌</span>
              <p className="text-sm font-bold text-red-800">
                {productQueueErrors.length} product change{productQueueErrors.length > 1 ? "s" : ""}{" "}
                failed to sync
              </p>
            </div>
            <div className="divide-y divide-red-100">
              {productQueueErrors.map((err) => (
                <div key={err.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-red-700 capitalize">
                      {err.action} {err.productId ? `(#${err.productId.slice(-6)})` : ""}
                    </p>
                    <p className="mt-0.5 text-xs break-words text-red-500">{err.message}</p>
                  </div>
                  <div className="mt-0.5 flex flex-shrink-0 gap-2">
                    <button
                      onClick={() => retryProductQueueItem(err.id)}
                      className="h-7 rounded-lg bg-red-600 px-2.5 text-xs font-bold text-white transition-all hover:bg-red-700 active:scale-95"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => dismissProductQueueError(err.id)}
                      className="h-7 rounded-lg border border-red-200 bg-white px-2.5 text-xs font-bold text-red-600 transition-all hover:bg-red-50 active:scale-95"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-700">
                {lowStock.length} product{lowStock.length > 1 ? "s" : ""} low on stock
              </p>
              <p className="mt-0.5 text-xs text-red-500">Edit products to update stock levels</p>
            </div>
          </div>
        )}

        {/* Product list / loading / error / empty states */}
        {isLoading ? (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={T("somethingWentWrong")}
            subtitle={T("checkInternet")}
            onRetry={() => refetchProducts()}
            retryLabel={T("retry")}
          />
        ) : products.length === 0 ? (
          <div className={`${CARD} px-4 py-16 text-center`}>
            <p className="mb-4 text-5xl">{search || filterCat !== "all" ? "🔍" : "🍽️"}</p>
            {search ? (
              <>
                <p className="text-base font-bold text-gray-700">
                  No products found for "{search}"
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Try a different search term or clear the filter
                </p>
                <button
                  onClick={() => setSearch("")}
                  className="android-press mt-4 h-10 rounded-xl bg-gray-100 px-6 text-sm font-bold text-gray-600"
                >
                  Clear Search
                </button>
              </>
            ) : filterCat !== "all" ? (
              <>
                <p className="text-base font-bold text-gray-700">No products in "{filterCat}"</p>
                <p className="mt-1 text-sm text-gray-400">
                  Try a different category or add products to this one
                </p>
                <button
                  onClick={() => setFilterCat("all")}
                  className="android-press mt-4 h-10 rounded-xl bg-gray-100 px-6 text-sm font-bold text-gray-600"
                >
                  Show All
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-gray-700">No products yet</p>
                <p className="mt-1 text-sm text-gray-400">Add your first product to get started</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="android-press mt-5 h-12 rounded-2xl bg-blue-600 px-8 font-bold text-white"
                >
                  + Add First Product
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
            {products.map((p) => {
              const pThresh = p.lowStockThreshold ?? productThresholds[p.id] ?? lowStockThreshold;
              const isLowStock = p.stock != null && p.stock >= 0 && p.stock <= pThresh;
              const isSelected = bulkEditSelected.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`${CARD}${!p.inStock ? "opacity-60" : ""}${p.isHidden ? "border-2 border-dashed border-gray-300" : ""}${isSelected ? "ring-2 ring-orange-400" : ""}`}
                >
                  {bulkEditMode && (
                    <div className="flex items-center gap-2 px-4 pt-3 pb-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleBulkSelect(p.id)}
                        className="h-4 w-4 cursor-pointer rounded accent-orange-500"
                      />
                      <span className="text-xs font-medium text-gray-500">
                        {isSelected ? "Selected" : "Select for bulk edit"}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-3 p-4">
                    {p.image ? (
                      <SafeImage
                        src={p.image}
                        alt={p.name}
                        className="h-16 w-16 flex-shrink-0 rounded-xl bg-gray-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl">
                        🍽️
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm leading-snug font-bold text-gray-800">{p.name}</p>
                            {p.isHidden && (
                              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                                Hidden
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {p.category && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 capitalize">
                                {p.category}
                              </span>
                            )}
                            {p.unit && <span className="text-[10px] text-gray-400">/{p.unit}</span>}
                            {p.stock != null && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isLowStock ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}
                              >
                                {isLowStock ? `⚠️ ${p.stock} left` : `${p.stock} in stock`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-base font-extrabold text-blue-600">
                            {fc(p.price, currencySymbol)}
                          </p>
                          {p.originalPrice && p.originalPrice > p.price && (
                            <p className="text-[10px] text-gray-400 line-through">
                              {fc(p.originalPrice, currencySymbol)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => toggleMut.mutate({ id: p.id, inStock: !p.inStock })}
                          className={`android-press h-8 min-h-0 rounded-xl px-3 text-xs font-bold ${p.inStock ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          {p.inStock ? "✓ In Stock" : "✗ Out"}
                        </button>
                        <button
                          onClick={() => hideMut.mutate({ id: p.id, isHidden: !p.isHidden })}
                          disabled={hideMut.isPending}
                          className={`android-press h-8 min-h-0 rounded-xl px-3 text-xs font-bold ${p.isHidden ? "bg-gray-100 text-gray-500" : "bg-indigo-50 text-indigo-600"}`}
                        >
                          {p.isHidden ? "👁️ Show" : "🙈 Hide"}
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="android-press h-8 min-h-0 rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-600"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`))
                              return;
                            deleteMut.mutate(p.id);
                          }}
                          className="android-press h-8 min-h-0 rounded-xl bg-red-50 px-3 text-xs font-bold text-red-600"
                        >
                          🗑️
                        </button>
                        {p.stock != null && (
                          <button
                            onClick={() =>
                              setStockHistoryOpen(stockHistoryOpen === p.id ? null : p.id)
                            }
                            className="android-press h-8 min-h-0 rounded-xl bg-purple-50 px-3 text-xs font-bold text-purple-600"
                          >
                            {stockHistoryOpen === p.id ? "▲ History" : "📊 History"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* ── Stock History Collapsible Panel ── */}
                  {stockHistoryOpen === p.id && <StockHistoryPanel productId={p.id} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bulk Edit Floating Action Bar ── */}
      {bulkEditMode && (
        <div className="pointer-events-none fixed right-0 bottom-0 left-0 z-40">
          <div className="pointer-events-auto mx-auto max-w-2xl px-4 pb-4">
            <div className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-sm font-bold text-orange-700">
                  ✏️ Bulk Edit Mode — {bulkEditSelected.size} product
                  {bulkEditSelected.size !== 1 ? "s" : ""} selected
                </p>
                <button
                  onClick={() => {
                    const all = new Set(products.map((p: any) => p.id));
                    setBulkEditSelected((prev) => (prev.size === all.size ? new Set() : all));
                  }}
                  className="text-xs font-bold text-blue-500 underline"
                >
                  {bulkEditSelected.size === products.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="space-y-3 px-4 py-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                      New Price ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={bulkEditPrice}
                      onChange={(e) => {
                        setBulkEditPrice(e.target.value);
                        setBulkEditError("");
                      }}
                      placeholder="Leave blank to keep"
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                      New Stock (qty)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={bulkEditStock}
                      onChange={(e) => {
                        setBulkEditStock(e.target.value);
                        setBulkEditError("");
                      }}
                      placeholder="Leave blank to keep"
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                {bulkEditError && (
                  <p className="text-xs font-semibold text-red-500">⚠️ {bulkEditError}</p>
                )}
                <button
                  onClick={() => bulkEditMut.mutate()}
                  disabled={bulkEditMut.isPending || bulkEditSelected.size === 0}
                  className="android-press h-11 w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-50"
                >
                  {bulkEditMut.isPending
                    ? "Updating..."
                    : `Apply to ${bulkEditSelected.size} Product${bulkEditSelected.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {Toast}
    </PullToRefresh>
  );
}
