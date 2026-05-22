import { AdminFormSheet } from "@/components/AdminFormSheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { Input } from "@/components/ui/input";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { SafeImage } from "@/components/ui/SafeImage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UploadProgress } from "@/components/ui/UploadProgress";
import {
  useApproveProduct,
  useCategories,
  useCreateProduct,
  useDeleteProduct,
  usePendingProducts,
  useProducts,
  useProductStockHistory,
  useRejectProduct,
  useUpdateProduct,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { useHasPermission } from "@/hooks/usePermissions";
import type { ProductRow } from "@/lib/adminApiTypes";
import { adminFetch, uploadAdminImageWithProgress } from "@/lib/adminFetcher";
import { parseApiError } from "@/lib/errorParser";
import { formatCurrency } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { productSchema, type ProductFormErrors } from "@/lib/validation";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  Clock,
  Download,
  Edit,
  Filter,
  History,
  ImageIcon,
  PackageSearch,
  Percent,
  Plus,
  Search,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const errMsg = (e: unknown): string =>
  e instanceof Error
    ? e instanceof Error
      ? e.message
      : String(e)
    : typeof e === "string"
      ? e
      : "Unknown error";
const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  originalPrice: "",
  category: "",
  type: "mart",
  unit: "",
  vendorName: "",
  inStock: true,
  deliveryTime: "30-45 min",
  image: "",
};

function StockHistoryDialog({
  product,
  vendors,
  onClose,
}: {
  product: ProductRow;
  vendors: string[];
  onClose: () => void;
}) {
  const [vendorFilter, setVendorFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [applied, setApplied] = useState<{ vendorId?: string; from?: string; to?: string }>({});

  const { data, isLoading, isError } = useProductStockHistory(product.id, applied);
  const rows: Array<{
    id: string;
    delta: number;
    previousStock: number | null;
    newStock: number | null;
    reason: string;
    source: string;
    orderId: string | null;
    vendorId: string;
    changedAt: string;
  }> = Array.isArray(data?.history) ? data.history : [];

  const applyFilters = () => {
    setApplied({
      vendorId: vendorFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    });
  };

  const clearFilters = () => {
    setVendorFilter("");
    setFromDate("");
    setToDate("");
    setApplied({});
  };

  const hasFilters = !!(vendorFilter || fromDate || toDate);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-purple-600 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
                <History className="h-5 w-5" /> Stock History
              </h2>
              <p className="mt-0.5 max-w-xs truncate text-sm text-purple-200">{product.name}</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex-shrink-0 space-y-2 border-b border-gray-100 bg-gray-50/60 px-5 py-3">
          <div className="flex flex-wrap items-end gap-2">
            {vendors.length > 0 && (
              <div className="flex min-w-[160px] flex-col gap-1">
                <label className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                  Vendor
                </label>
                <select
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-violet-400 focus:outline-none"
                >
                  <option value="">All vendors</option>
                  {vendors.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                From
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-violet-400 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                To
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-violet-400 focus:outline-none"
              />
            </div>
            <button
              onClick={applyFilters}
              className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white transition-colors hover:bg-violet-700"
            >
              Apply
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="h-9 rounded-lg bg-gray-100 px-3 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && (
            <div className="text-muted-foreground py-12 text-center text-sm">Loading history…</div>
          )}
          {isError && (
            <div className="py-12 text-center text-sm text-red-500">
              Failed to load stock history.
            </div>
          )}
          {!isLoading && !isError && rows.length === 0 && (
            <div className="py-12 text-center">
              <p className="mb-2 text-2xl">📦</p>
              <p className="text-muted-foreground text-sm">No stock movements recorded yet.</p>
              {Object.keys(applied).length > 0 && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Try clearing the filters to see all history.
                </p>
              )}
            </div>
          )}
          {rows.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 pr-3 text-left text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                    Date
                  </th>
                  <th className="py-2 pr-3 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                    Change
                  </th>
                  <th className="py-2 pr-3 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                    Before
                  </th>
                  <th className="py-2 pr-3 text-center text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                    After
                  </th>
                  <th className="py-2 pr-3 text-left text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                    Source
                  </th>
                  <th className="py-2 text-left text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                    Order
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/60"
                  >
                    <td className="text-muted-foreground py-2 pr-3 text-xs whitespace-nowrap">
                      {new Date(r.changedAt).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      <span className="block text-[10px]">
                        {new Date(r.changedAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <span
                        className={`inline-block rounded-lg px-2 py-0.5 text-sm font-extrabold tabular-nums ${r.delta < 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}
                      >
                        {r.delta > 0 ? `+${r.delta}` : r.delta}
                      </span>
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 text-center text-xs tabular-nums">
                      {r.previousStock ?? "—"}
                    </td>
                    <td className="text-foreground py-2 pr-3 text-center text-xs font-semibold tabular-nums">
                      {r.newStock ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-foreground text-xs capitalize">
                        {r.source || r.reason || "—"}
                      </span>
                    </td>
                    <td className="text-muted-foreground py-2 font-mono text-xs">
                      {r.orderId ? r.orderId.slice(-8) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-100 px-5 py-3">
          <p className="text-muted-foreground text-xs">
            {rows.length > 0 ? `${rows.length} record${rows.length !== 1 ? "s" : ""}` : ""}
          </p>
          <button
            onClick={onClose}
            className="h-9 rounded-xl bg-gray-100 px-5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ product, onClose }: { product: ProductRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const reject = useRejectProduct();
  const { onError: onRejectError } = useErrorHandler({ title: "Error" });
  const handleReject = () => {
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    reject.mutate(
      { id: product.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast({ title: "Product rejected" });
          onClose();
        },
        onError: (e: unknown) => {
          onRejectError(e);
          toast({ title: "Error", description: errMsg(e), variant: "destructive" });
        },
      }
    );
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-5">
          <h2 className="text-lg font-extrabold text-white">Reject Product</h2>
          <p className="mt-0.5 text-sm text-red-200">
            Product will be rejected and the vendor notified
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1 rounded-xl bg-red-50 p-4">
            <p className="text-sm font-bold text-gray-800">{product.name}</p>
            <p className="text-xs text-gray-500">
              By: {product.vendorName || "Unknown Vendor"} · {formatCurrency(product.price)}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-500 uppercase">
              Rejection Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Poor image quality · Price too high · Duplicate product"
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-red-400 focus:outline-none"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-600 font-bold text-white hover:bg-red-700"
              onClick={handleReject}
              disabled={reject.isPending}
            >
              {reject.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading, dataUpdatedAt } = useProducts();
  const { data: pendingData, isLoading: pendingLoading } = usePendingProducts();
  const { data: categoriesData } = useCategories();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();
  const approveMutation = useApproveProduct();
  const { toast } = useToast();
  const { onError: onProductError } = useErrorHandler();
  const canWrite = useHasPermission("content.products.edit");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"all" | "pending" | "pricing">("all");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkStock, setBulkStock] = useState<"" | "in" | "out">("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [refillSending, setRefillSending] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkApproveConfirm, setBulkApproveConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  const [pricingRules, setPricingRules] = useState<
    Array<{
      id: string;
      name: string;
      type: string;
      value: string;
      category: string;
      active: boolean;
    }>
  >([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);

  // Load pricing rules from platform settings on mount / tab switch to "pricing"
  useEffect(() => {
    if (tab !== "pricing") return;
    setPricingLoading(true);
    adminFetch("/platform-settings")
      .then((data: any) => {
        const all: Array<{ key: string; value: string }> = data?.settings ?? [];
        const raw = all.find((s) => s.key === "global_pricing_rules")?.value;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              setPricingRules(parsed);
              return;
            }
            // eslint-disable-next-line ajk-local/no-silent-catch -- malformed pricing rules JSON ignored; default rules are used
          } catch {
            /* ignore parse errors */
          }
        }
        // Default seed rules when no saved value
        setPricingRules([
          {
            id: "1",
            name: "Weekend Sale",
            type: "discount_pct",
            value: "10",
            category: "all",
            active: true,
          },
          {
            id: "2",
            name: "Bulk Discount (5+ items)",
            type: "discount_flat",
            value: "50",
            category: "mart",
            active: false,
          },
        ]);
      })
      .catch(() => setPricingRules([]))
      .finally(() => setPricingLoading(false));
  }, [tab]);

  const savePricingRules = async () => {
    setPricingSaving(true);
    try {
      await adminFetch("/platform-settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: [{ key: "global_pricing_rules", value: JSON.stringify(pricingRules) }],
        }),
      });
      toast({ title: "Pricing rules saved", description: "Rules will apply at checkout." });
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setPricingSaving(false);
  };

  const toggleProductSelect = useCallback((id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleBulkEdit = useCallback(async () => {
    if (!bulkPrice && !bulkCategory && !bulkStock) {
      toast({ title: "Select at least one field to change", variant: "destructive" });
      return;
    }
    setBulkApplying(true);
    const ids = Array.from(selectedProductIds);
    const update: Record<string, unknown> = {};
    if (bulkPrice) update.price = parseFloat(bulkPrice);
    if (bulkCategory) update.category = bulkCategory;
    if (bulkStock === "in") update.inStock = true;
    if (bulkStock === "out") update.inStock = false;
    try {
      const result = (await adminFetch("/products/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids, update }),
      })) as { updated: number };
      toast({
        title: "Bulk edit applied",
        description: `${result.updated} of ${ids.length} products updated in one operation.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Bulk update failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSelectedProductIds(new Set());
    setShowBulkEdit(false);
    setBulkPrice("");
    setBulkCategory("");
    setBulkStock("");
    setBulkApplying(false);
  }, [selectedProductIds, bulkPrice, bulkCategory, bulkStock, toast]);
  const handleBulkDelete = useCallback(async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedProductIds);
    try {
      const result = (await adminFetch("/products/bulk", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      })) as { deleted: number };
      toast({
        title: "Products deleted",
        description: `${result.deleted} product${result.deleted !== 1 ? "s" : ""} removed.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSelectedProductIds(new Set());
    setBulkDeleteConfirm(false);
    setBulkDeleting(false);
  }, [selectedProductIds, toast]);

  const handleBulkApproveSelected = useCallback(async () => {
    setBulkApproving(true);
    const ids = Array.from(selectedProductIds);
    try {
      const result = (await adminFetch("/products/bulk-approve", {
        method: "POST",
        body: JSON.stringify({ ids }),
      })) as { approved: number };
      toast({
        title: "Products approved",
        description: `${result.approved} product${result.approved !== 1 ? "s" : ""} approved.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Approve failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSelectedProductIds(new Set());
    setBulkApproveConfirm(false);
    setBulkApproving(false);
  }, [selectedProductIds, toast]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ProductRow | null>(null);
  const [stockHistoryProduct, setStockHistoryProduct] = useState<ProductRow | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<ProductFormErrors>({});
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const imageBlobRef = useRef<string | null>(null);

  const fullImgUrl = (path?: string | null): string | null => {
    if (!path) return null;
    if (path.startsWith("http") || path.startsWith("blob:")) return path;
    return `${window.location.origin}${path}`;
  };

  useEffect(() => {
    return () => {
      if (imageBlobRef.current) URL.revokeObjectURL(imageBlobRef.current);
    };
  }, []);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryDropOpen, setCategoryDropOpen] = useState(false);

  const categories = categoriesData || [];
  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
      c.id.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only JPEG, PNG, and WebP images are allowed",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image must be under 10MB",
        variant: "destructive",
      });
      return;
    }
    if (imageBlobRef.current) URL.revokeObjectURL(imageBlobRef.current);
    const previewUrl = URL.createObjectURL(file);
    imageBlobRef.current = previewUrl;
    setImagePreview(previewUrl);
    setImageUploading(true);
    setUploadPercent(0);
    try {
      const url = await uploadAdminImageWithProgress(file, (pct) => setUploadPercent(pct));
      setFormData((prev) => ({ ...prev, image: url }));
      toast({ title: "Image uploaded" });
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: parseApiError(err) || errMsg(err),
        variant: "destructive",
      });
      setImagePreview(formData.image || "");
    } finally {
      setImageUploading(false);
      setUploadPercent(null);
    }
  };

  const openAdd = useCallback(() => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM });
    setImagePreview("");
    setCategorySearch("");
    setFormErrors({});
    setIsFormOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener("admin:new-item", openAdd);
    return () => window.removeEventListener("admin:new-item", openAdd);
  }, [openAdd]);

  const openEdit = (prod: ProductRow) => {
    setEditingId(prod.id);
    setFormData({
      name: prod.name || "",
      description: prod.description || "",
      price: String(prod.price || ""),
      originalPrice: prod.originalPrice ? String(prod.originalPrice) : "",
      category: prod.category || "",
      type: prod.type || "mart",
      unit: prod.unit || "",
      vendorName: prod.vendorName || "",
      inStock: prod.inStock ?? false,
      deliveryTime: prod.deliveryTime || "30-45 min",
      image: prod.image || "",
    });
    setImagePreview(prod.image || "");
    setCategorySearch(prod.category || "");
    setFormErrors({});
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = productSchema.safeParse(formData);
    if (!parsed.success) {
      const errs: ProductFormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ProductFormErrors;
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    const payload = {
      ...formData,
      price: Number(formData.price),
      originalPrice: formData.originalPrice ? Number(formData.originalPrice) : null,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, ...payload },
        {
          onSuccess: () => {
            toast({ title: "Product updated" });
            setIsFormOpen(false);
          },
          onError: (err: any) => {
            onProductError(err);
            toast({ title: "Update failed", description: err.message, variant: "destructive" });
          },
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Product created" });
          setIsFormOpen(false);
        },
        onError: (err: unknown) =>
          toast({ title: "Create failed", description: errMsg(err), variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast({ title: "Product deleted" });
        setDeleteTarget(null);
      },
      onError: (err: unknown) =>
        toast({ title: "Delete failed", description: errMsg(err), variant: "destructive" }),
    });
  };

  const handleApprove = (prod: ProductRow) => {
    approveMutation.mutate(
      { id: prod.id },
      {
        onSuccess: () =>
          toast({
            title: "Product approved",
            description: `${prod.name} is now live in the store`,
          }),
        onError: (err: unknown) =>
          toast({ title: "Error", description: errMsg(err), variant: "destructive" }),
      }
    );
  };

  const toggleStock = (prod: ProductRow) => {
    updateMutation.mutate(
      { id: prod.id, inStock: !prod.inStock },
      {
        onSuccess: () => toast({ title: prod.inStock ? "Marked out of stock" : "Marked in stock" }),
        onError: (err: unknown) =>
          toast({ title: "Failed", description: errMsg(err), variant: "destructive" }),
      }
    );
  };

  const exportCSV = () => {
    const header = "ID,Name,Category,Type,Price,Vendor,InStock";
    const rows = filtered.map((p: ProductRow) =>
      [
        p.id,
        p.name,
        p.category,
        p.type,
        p.price,
        p.vendorName || "",
        p.inStock ? "yes" : "no",
      ].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    const csvUrl = URL.createObjectURL(blob);
    a.href = csvUrl;
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(csvUrl), 0);
  };

  const products = useMemo(() => data?.products || [], [data?.products]);
  const pendingProducts = pendingData?.products || [];
  const vendors = [
    ...new Set(
      products
        .filter((p: ProductRow) => p.vendorName)
        .map((p: ProductRow) => p.vendorName as string)
    ),
  ] as string[];
  const q = search.toLowerCase();
  const [sortKey, setSortKey] = useState<"name" | "category" | "price" | "vendor" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = useCallback((key: "name" | "category" | "price" | "vendor") => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const LOW_STOCK_THRESHOLD = 5;

  const filtered = useMemo(() => {
    const base = products.filter(
      (p: ProductRow) =>
        (typeFilter === "all" || p.type === typeFilter) &&
        (stockFilter === "all" ||
          (stockFilter === "in"
            ? p.inStock
            : stockFilter === "out"
              ? !p.inStock
              : stockFilter === "low"
                ? p.stock !== undefined && p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD && p.inStock
                : !p.inStock)) &&
        (!vendorFilter ||
          (p.vendorName || "").toLowerCase().includes(vendorFilter.toLowerCase())) &&
        (p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q))
    );
    if (!sortKey) return base;
    return [...base].sort((a: ProductRow, b: ProductRow) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "name") {
        av = (a.name || "").toLowerCase();
        bv = (b.name || "").toLowerCase();
      }
      if (sortKey === "category") {
        av = (a.category || "").toLowerCase();
        bv = (b.category || "").toLowerCase();
      }
      if (sortKey === "price") {
        av = a.price ?? 0;
        bv = b.price ?? 0;
      }
      if (sortKey === "vendor") {
        av = (a.vendorName || "").toLowerCase();
        bv = (b.vendorName || "").toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [products, typeFilter, stockFilter, vendorFilter, q, sortKey, sortDir]);

  const martCount = products.filter((p: ProductRow) => p.type === "mart").length;
  const foodCount = products.filter((p: ProductRow) => p.type === "food").length;
  const pendingCount = pendingProducts.length;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Products page crashed. Please reload.
        </div>
      }
    >
      <>
        <div className="space-y-6">
          <PageHeader
            icon={PackageSearch}
            title={T("products")}
            subtitle={`${martCount} mart · ${foodCount} food · ${products.length} ${T("total")}${pendingCount > 0 ? ` · ${pendingCount} pending approval` : ""}`}
            iconBgClass="bg-purple-100"
            iconColorClass="text-purple-600"
            actions={
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exportCSV} className="h-11 gap-2 rounded-xl">
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                  <Button onClick={openAdd} className="h-11 gap-2 rounded-xl shadow-md">
                    <Plus className="h-5 w-5" /> Add Product
                  </Button>
                </div>
                <LastUpdated dataUpdatedAt={dataUpdatedAt ?? 0} />
              </div>
            }
          />

          {/* Tab switcher */}
          <div className="border-border/40 flex gap-2 border-b pb-0">
            <button
              onClick={() => setTab("all")}
              className={`rounded-t-xl border-b-2 px-5 py-2.5 text-sm font-bold transition-colors ${
                tab === "all"
                  ? "border-primary text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              All Products ({products.length})
            </button>
            <button
              onClick={() => setTab("pending")}
              className={`flex items-center gap-2 rounded-t-xl border-b-2 px-5 py-2.5 text-sm font-bold transition-colors ${
                tab === "pending"
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              <Clock className="h-4 w-4" />
              Pending Approval
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("pricing")}
              className={`flex items-center gap-2 rounded-t-xl border-b-2 px-5 py-2.5 text-sm font-bold transition-colors ${
                tab === "pricing"
                  ? "border-purple-500 bg-purple-50 text-purple-700"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              <Tag className="h-4 w-4" />
              Pricing Rules
            </button>
          </div>

          {/* Pricing Rules Tab */}
          {tab === "pricing" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Define global pricing rules that apply across products. Rules are applied at
                  checkout.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-2 rounded-xl"
                    onClick={() => {
                      const newRule = {
                        id: String(Date.now()),
                        name: "New Rule",
                        type: "discount_pct",
                        value: "5",
                        category: "all",
                        active: false,
                      };
                      setPricingRules((prev) => [...prev, newRule]);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add Rule
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 gap-2 rounded-xl"
                    onClick={() => void savePricingRules()}
                    disabled={pricingSaving || pricingLoading}
                  >
                    {pricingSaving ? "Saving…" : "Save Rules"}
                  </Button>
                </div>
              </div>
              {pricingLoading && <div className="bg-muted h-24 animate-pulse rounded-xl" />}
              <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-bold">Rule Name</TableHead>
                      <TableHead className="font-bold">Type</TableHead>
                      <TableHead className="font-bold">Value</TableHead>
                      <TableHead className="font-bold">Category</TableHead>
                      <TableHead className="text-center font-bold">Active</TableHead>
                      <TableHead className="text-right font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricingRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <input
                            value={rule.name}
                            onChange={(e) =>
                              setPricingRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id ? { ...r, name: e.target.value } : r
                                )
                              )
                            }
                            className="hover:border-border focus:border-primary w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm focus:outline-none"
                          />
                        </TableCell>
                        <TableCell>
                          <select
                            value={rule.type}
                            onChange={(e) =>
                              setPricingRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id ? { ...r, type: e.target.value } : r
                                )
                              )
                            }
                            className="border-border bg-background focus:ring-ring rounded-lg border px-2 py-1.5 text-xs focus:ring-1 focus:outline-none"
                          >
                            <option value="discount_pct">% Discount</option>
                            <option value="discount_flat">Flat Discount (PKR)</option>
                            <option value="markup_pct">% Markup</option>
                            <option value="markup_flat">Flat Markup (PKR)</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <input
                            type="number"
                            value={rule.value}
                            onChange={(e) =>
                              setPricingRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id ? { ...r, value: e.target.value } : r
                                )
                              )
                            }
                            className="border-border focus:ring-ring w-20 rounded-lg border bg-transparent px-2 py-1 text-sm focus:ring-1 focus:outline-none"
                          />
                        </TableCell>
                        <TableCell>
                          <select
                            value={rule.category}
                            onChange={(e) =>
                              setPricingRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id ? { ...r, category: e.target.value } : r
                                )
                              )
                            }
                            className="border-border bg-background focus:ring-ring rounded-lg border px-2 py-1.5 text-xs focus:ring-1 focus:outline-none"
                          >
                            <option value="all">All Categories</option>
                            <option value="mart">Mart</option>
                            <option value="food">Food</option>
                            <option value="pharmacy">Pharmacy</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={() =>
                              setPricingRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id ? { ...r, active: !r.active } : r
                                )
                              )
                            }
                            className={`relative h-5 w-10 rounded-full transition-colors ${rule.active ? "bg-green-500" : "bg-slate-200"}`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${rule.active ? "translate-x-5" : "translate-x-0.5"}`}
                            />
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-red-600 hover:bg-red-50"
                            onClick={() =>
                              setPricingRules((prev) => prev.filter((r) => r.id !== rule.id))
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pricingRules.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-muted-foreground py-8 text-center text-sm"
                        >
                          No pricing rules. Click "Add Rule" to create one.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
              {pricingRules.some((r) => r.active) && (
                <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-700">
                  <Percent className="h-4 w-4 shrink-0" />
                  <span>
                    {pricingRules.filter((r) => r.active).length} active rule
                    {pricingRules.filter((r) => r.active).length !== 1 ? "s" : ""} will apply at
                    checkout. Rules are applied in order from top to bottom.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Add/Edit Sheet */}
          <AdminFormSheet
            open={isFormOpen}
            onClose={() => setIsFormOpen(false)}
            title={editingId ? T("editProduct") : T("addNewProduct")}
            description={
              editingId
                ? "Update product details and save."
                : "Fill in the details to add a new product."
            }
            busy={createMutation.isPending || updateMutation.isPending || imageUploading}
            width="sm:max-w-2xl"
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl px-5"
                  onClick={() => setIsFormOpen(false)}
                  disabled={createMutation.isPending || updateMutation.isPending || imageUploading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="product-form"
                  disabled={createMutation.isPending || updateMutation.isPending || imageUploading}
                  className="h-10 rounded-xl px-6"
                >
                  {imageUploading
                    ? "Uploading image..."
                    : createMutation.isPending || updateMutation.isPending
                      ? "Saving..."
                      : editingId
                        ? "Save Changes"
                        : "Create Product"}
                </Button>
              </>
            }
          >
            <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Image Uploader */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">Product Image</label>
                <div
                  className="border-border hover:border-primary/60 relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-colors"
                  style={{ height: imagePreview ? 160 : 100 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imagePreview ? (
                    <>
                      <SafeImage
                        src={imagePreview}
                        alt="preview"
                        className="h-full w-full object-cover"
                      />
                      {imageUploading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <span className="text-xs font-semibold text-white">Uploading...</span>
                        </div>
                      )}
                      {!imageUploading && (
                        <button
                          type="button"
                          className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImagePreview("");
                            setFormData((prev) => ({ ...prev, image: "" }));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
                      <ImageIcon className="h-7 w-7" />
                      <span className="text-xs font-medium">
                        Click to upload image (JPEG/PNG/WebP, max 10MB)
                      </span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageSelect}
                />
                {imageUploading && (
                  <div className="mt-2">
                    <UploadProgress
                      status="uploading"
                      progress={uploadPercent ?? 0}
                      fileName="Uploading image"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFormData({ ...formData, name: e.target.value });
                      setFormErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    className={`h-11 rounded-xl ${formErrors.name ? "border-red-400" : ""}`}
                    placeholder="e.g. Fresh Milk"
                  />
                  {formErrors.name && <p className="text-xs text-red-600">{formErrors.name}</p>}
                </div>
                <div className="relative space-y-2">
                  <label className="text-sm font-semibold">Category *</label>
                  <div className="relative">
                    <Input
                      value={categorySearch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setCategorySearch(e.target.value);
                        setCategoryDropOpen(true);
                        if (!e.target.value.trim()) {
                          setFormData((prev) => ({ ...prev, category: "" }));
                        }
                        setFormErrors((prev) => ({ ...prev, category: undefined }));
                      }}
                      onFocus={() => setCategoryDropOpen(true)}
                      onBlur={() =>
                        setTimeout(() => {
                          setCategoryDropOpen(false);
                          if (!formData.category) setCategorySearch("");
                        }, 150)
                      }
                      className={`h-11 rounded-xl pr-8 ${formErrors.category ? "border-red-400" : ""}`}
                      placeholder="Search and select a category..."
                    />
                    {formData.category && (
                      <div className="text-muted-foreground mt-1 px-1 text-xs">
                        Selected:{" "}
                        <span className="text-primary font-semibold">{formData.category}</span>
                      </div>
                    )}
                    {categoryDropOpen && filteredCategories.length > 0 && (
                      <div className="border-border absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border bg-white shadow-lg">
                        {filteredCategories.slice(0, 8).map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            className="hover:bg-muted/60 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                            onMouseDown={() => {
                              setCategorySearch(cat.name);
                              setFormData((prev) => ({ ...prev, category: cat.id }));
                              setFormErrors((prev) => ({ ...prev, category: undefined }));
                              setCategoryDropOpen(false);
                            }}
                          >
                            {cat.icon && <span>{cat.icon}</span>}
                            <span className="font-medium">{cat.name}</span>
                            <span className="text-muted-foreground ml-auto text-xs">{cat.id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {formErrors.category && (
                    <p className="text-xs text-red-600">{formErrors.category}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Type *</label>
                  <select
                    className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                    value={formData.type}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setFormData({ ...formData, type: e.target.value })
                    }
                  >
                    <option value="mart">Mart</option>
                    <option value="food">Food</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Unit</label>
                  <Input
                    value={formData.unit}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFormData({ ...formData, unit: e.target.value });
                      setFormErrors((prev) => ({ ...prev, unit: undefined }));
                    }}
                    className={`h-11 rounded-xl ${formErrors.unit ? "border-red-400" : ""}`}
                    placeholder="e.g. 1 kg, 500ml"
                  />
                  {formErrors.unit && <p className="text-xs text-red-600">{formErrors.unit}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Price (Rs.) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFormData({ ...formData, price: e.target.value });
                      setFormErrors((prev) => ({ ...prev, price: undefined }));
                    }}
                    className={`h-11 rounded-xl ${formErrors.price ? "border-red-400" : ""}`}
                    placeholder="e.g. 250"
                  />
                  {formErrors.price && <p className="text-xs text-red-600">{formErrors.price}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Original Price (Rs.)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.originalPrice}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFormData({ ...formData, originalPrice: e.target.value });
                      setFormErrors((prev) => ({ ...prev, originalPrice: undefined }));
                    }}
                    className={`h-11 rounded-xl ${formErrors.originalPrice ? "border-red-400" : ""}`}
                    placeholder="optional (for sale)"
                  />
                  {formErrors.originalPrice && (
                    <p className="text-xs text-red-600">{formErrors.originalPrice}</p>
                  )}
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-semibold">Description</label>
                  <Input
                    value={formData.description}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFormData({ ...formData, description: e.target.value });
                      setFormErrors((prev) => ({ ...prev, description: undefined }));
                    }}
                    className={`h-11 rounded-xl ${formErrors.description ? "border-red-400" : ""}`}
                    placeholder="Short description..."
                  />
                  {formErrors.description && (
                    <p className="text-xs text-red-600">{formErrors.description}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Vendor / Restaurant</label>
                  <Input
                    value={formData.vendorName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFormData({ ...formData, vendorName: e.target.value });
                      setFormErrors((prev) => ({ ...prev, vendorName: undefined }));
                    }}
                    className={`h-11 rounded-xl ${formErrors.vendorName ? "border-red-400" : ""}`}
                    placeholder="e.g. AJK Fresh Foods"
                  />
                  {formErrors.vendorName && (
                    <p className="text-xs text-red-600">{formErrors.vendorName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Delivery Time</label>
                  <Input
                    value={formData.deliveryTime}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFormData({ ...formData, deliveryTime: e.target.value });
                      setFormErrors((prev) => ({ ...prev, deliveryTime: undefined }));
                    }}
                    className={`h-11 rounded-xl ${formErrors.deliveryTime ? "border-red-400" : ""}`}
                    placeholder="e.g. 30-45 min"
                  />
                  {formErrors.deliveryTime && (
                    <p className="text-xs text-red-600">{formErrors.deliveryTime}</p>
                  )}
                </div>
              </div>
              <div className="bg-muted/50 border-border/50 flex items-center gap-3 rounded-xl border p-4">
                <input
                  type="checkbox"
                  id="instock"
                  checked={formData.inStock}
                  onChange={(e) => setFormData({ ...formData, inStock: e.target.checked })}
                  className="accent-primary h-5 w-5 rounded"
                />
                <label htmlFor="instock" className="cursor-pointer text-sm font-semibold">
                  Product is currently in stock
                </label>
              </div>
            </form>
          </AdminFormSheet>

          {/* Delete Confirmation Dialog */}
          <Dialog
            open={!!deleteTarget}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
          >
            <DialogContent className="w-[95vw] max-w-sm rounded-3xl p-6">
              <DialogHeader>
                <DialogTitle className="text-red-600">Delete Product?</DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground mt-2 text-sm">
                Are you sure you want to delete <strong>"{deleteTarget?.name}"</strong>? This cannot
                be undone.
              </p>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 rounded-xl"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Reject Modal */}
          {rejectTarget && (
            <RejectModal product={rejectTarget} onClose={() => setRejectTarget(null)} />
          )}

          {/* PENDING APPROVAL TAB */}
          {tab === "pending" && (
            <div className="space-y-4">
              {pendingCount > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3">
                  <span className="text-2xl">⏳</span>
                  <div>
                    <p className="text-sm font-bold text-amber-800">
                      {pendingCount} product{pendingCount > 1 ? "s" : ""} waiting for your review
                    </p>
                    <p className="text-xs text-amber-600">
                      Vendor-submitted products that need approval before going live
                    </p>
                  </div>
                </div>
              )}
              {/* Mobile cards — visible below md */}
              <div className="space-y-3 md:hidden">
                {pendingLoading ? (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="bg-muted h-28 animate-pulse rounded-2xl" />
                  ))
                ) : pendingProducts.length === 0 ? (
                  <Card className="border-border/50 rounded-2xl">
                    <CardContent className="text-muted-foreground flex flex-col items-center gap-2 p-12">
                      <CheckCircle className="h-10 w-10 text-green-400" />
                      <p className="font-semibold">All caught up!</p>
                      <p className="text-sm">No products waiting for approval.</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingProducts.map((p: ProductRow) => (
                    <Card key={p.id} className="border-border/50 rounded-2xl shadow-sm">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate font-semibold">{p.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge
                                variant={p.type === "food" ? "default" : "secondary"}
                                className="text-[10px] uppercase"
                              >
                                {p.type}
                              </Badge>
                              <span className="text-muted-foreground text-xs capitalize">
                                {p.category}
                              </span>
                              {p.unit && (
                                <span className="text-muted-foreground text-xs">{p.unit}</span>
                              )}
                            </div>
                            {p.description && (
                              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                                {p.description}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-foreground font-bold">{formatCurrency(p.price)}</p>
                            {p.originalPrice && (
                              <p className="text-muted-foreground text-xs line-through">
                                {formatCurrency(p.originalPrice)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-muted-foreground flex items-center justify-between text-xs">
                          <span>{p.vendorName || "—"}</span>
                          <span>
                            {p.createdAt
                              ? new Date(p.createdAt).toLocaleDateString("en-PK", {
                                  day: "numeric",
                                  month: "short",
                                })
                              : "—"}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(p)}
                            disabled={approveMutation.isPending}
                            className="h-8 flex-1 gap-1.5 rounded-xl bg-green-600 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectTarget(p)}
                            className="h-8 flex-1 gap-1.5 rounded-xl border-red-300 text-xs font-bold text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* Desktop table — visible from md up */}
              <Card className="border-border/50 hidden overflow-hidden rounded-2xl shadow-sm md:block">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-muted-foreground h-32 text-center">
                            Loading pending products...
                          </TableCell>
                        </TableRow>
                      ) : pendingProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-48 text-center">
                            <div className="text-muted-foreground flex flex-col items-center gap-2">
                              <CheckCircle className="h-10 w-10 text-green-400" />
                              <p className="font-semibold">All caught up!</p>
                              <p className="text-sm">No products waiting for approval.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        pendingProducts.map((p: ProductRow) => (
                          <TableRow key={p.id} className="hover:bg-amber-50/40">
                            <TableCell>
                              <div className="flex items-start gap-3">
                                {p.image ? (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxSrc(fullImgUrl(p.image))}
                                    className="group relative mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-gray-100"
                                    title="View image"
                                  >
                                    <SafeImage
                                      src={fullImgUrl(p.image) ?? ""}
                                      alt={p.name}
                                      className="h-12 w-12 rounded-xl"
                                      loading="eager"
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition group-hover:opacity-100">
                                      <ZoomIn className="h-4 w-4 text-white" />
                                    </span>
                                  </button>
                                ) : (
                                  <span className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                                    <ImageIcon className="h-5 w-5 text-gray-300" />
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <p className="text-foreground font-semibold">{p.name}</p>
                                  <div className="mt-1 flex items-center gap-2">
                                    <Badge
                                      variant={p.type === "food" ? "default" : "secondary"}
                                      className="text-[10px] uppercase"
                                    >
                                      {p.type}
                                    </Badge>
                                    {p.unit && (
                                      <span className="text-muted-foreground text-xs">
                                        {p.unit}
                                      </span>
                                    )}
                                  </div>
                                  {p.description && (
                                    <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                                      {p.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-medium capitalize">
                              {p.category}
                            </TableCell>
                            <TableCell>
                              <p className="text-foreground font-bold">{formatCurrency(p.price)}</p>
                              {p.originalPrice && (
                                <p className="text-muted-foreground text-xs line-through">
                                  {formatCurrency(p.originalPrice)}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {p.vendorName || "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {p.createdAt
                                ? new Date(p.createdAt).toLocaleDateString("en-PK", {
                                    day: "numeric",
                                    month: "short",
                                  })
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(p)}
                                  disabled={approveMutation.isPending}
                                  className="h-8 gap-1.5 rounded-xl bg-green-600 px-3 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setRejectTarget(p)}
                                  className="h-8 gap-1.5 rounded-xl border-red-300 px-3 text-xs font-bold text-red-600 hover:bg-red-50"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          )}

          {/* ALL PRODUCTS TAB */}
          {tab === "all" && (
            <>
              {/* Filters */}
              <Card className="border-border/50 space-y-3 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      placeholder="Search by name or category..."
                      value={search}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSearch(e.target.value)
                      }
                      className="h-11 rounded-xl pl-9"
                    />
                  </div>
                  <div className="relative sm:w-44">
                    <Filter className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      placeholder="Filter vendor..."
                      value={vendorFilter}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setVendorFilter(e.target.value)
                      }
                      className="h-11 rounded-xl pl-9"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["all", "mart", "food"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`rounded-xl border px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                        typeFilter === t
                          ? "bg-primary border-primary text-white"
                          : "bg-muted/30 border-border/50 hover:border-primary text-muted-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                  <div className="bg-border/60 mx-1 w-px" />
                  {[
                    { v: "all", l: "All Stock" },
                    { v: "in", l: "In Stock" },
                    { v: "out", l: "Out of Stock" },
                  ].map((s) => (
                    <button
                      key={s.v}
                      onClick={() => setStockFilter(s.v)}
                      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                        stockFilter === s.v
                          ? "border-green-600 bg-green-600 text-white"
                          : "bg-muted/30 border-border/50 text-muted-foreground hover:border-green-300"
                      }`}
                    >
                      {s.l}
                    </button>
                  ))}
                  <button
                    onClick={() => setStockFilter(stockFilter === "low" ? "all" : "low")}
                    className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      stockFilter === "low"
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "bg-muted/30 border-border/50 text-muted-foreground hover:border-amber-300"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Low Stock
                  </button>
                </div>
              </Card>

              {/* Mobile card list */}
              <div className="space-y-3 md:hidden">
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="bg-muted h-20 animate-pulse rounded-2xl" />
                  ))
                ) : filtered.length === 0 ? (
                  <Card className="border-border/50 rounded-2xl p-12 text-center">
                    <p className="text-muted-foreground text-sm">No products found.</p>
                  </Card>
                ) : (
                  filtered.map((p: ProductRow) => (
                    <Card key={p.id} className="border-border/50 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-foreground truncate font-semibold">{p.name}</p>
                            <Badge
                              variant={p.type === "food" ? "default" : "secondary"}
                              className="text-[10px] uppercase"
                            >
                              {p.type}
                            </Badge>
                            {!p.inStock && (
                              <StatusBadge status="inactive" label="Out of Stock" size="xs" />
                            )}
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-xs capitalize">
                            {p.category}
                            {p.vendorName ? ` · ${p.vendorName}` : ""}
                          </p>
                          <p className="text-foreground mt-1 text-sm font-bold">
                            {formatCurrency(p.price)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            onClick={() => toggleStock(p)}
                            disabled={updateMutation.isPending || !canWrite}
                            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold disabled:opacity-50 ${p.inStock ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}
                          >
                            {p.inStock ? (
                              <ToggleRight className="h-3.5 w-3.5" />
                            ) : (
                              <ToggleLeft className="h-3.5 w-3.5" />
                            )}
                            {p.inStock ? "In Stock" : "Out"}
                          </button>
                          {canWrite && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEdit(p)}
                                className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTarget(p)}
                                className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>

              {/* Bulk Actions Bar */}
              {selectedProductIds.size > 0 && (
                <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl bg-violet-600 px-4 py-3 text-white shadow-lg">
                  <span className="text-sm font-semibold">
                    {selectedProductIds.size} product{selectedProductIds.size > 1 ? "s" : ""}{" "}
                    selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => setShowBulkEdit(true)}
                      disabled={!canWrite}
                    >
                      <Edit className="mr-1 h-3.5 w-3.5" /> Bulk Edit
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 border-0 bg-amber-500 text-xs text-white hover:bg-amber-600"
                      disabled={refillSending || !canWrite}
                      onClick={async () => {
                        setRefillSending(true);
                        try {
                          const result = (await adminFetch("/products/bulk-refill-reminder", {
                            method: "POST",
                            body: JSON.stringify({ productIds: Array.from(selectedProductIds) }),
                          })) as {
                            notified: number;
                            vendorIds: string[];
                            failed: number;
                            failedVendorIds: string[];
                          };
                          if (result.failed > 0 && result.notified === 0) {
                            toast({
                              title: "Refill reminder failed",
                              description: `Could not reach ${result.failed} vendor${result.failed !== 1 ? "s" : ""}`,
                              variant: "destructive",
                            });
                          } else if (result.failed > 0) {
                            toast({
                              title: `Refill reminder sent to ${result.notified} vendor${result.notified !== 1 ? "s" : ""}`,
                              description: `Could not reach ${result.failed} vendor${result.failed !== 1 ? "s" : ""}`,
                            });
                          } else {
                            toast({
                              title: `Refill reminder sent to ${result.notified} vendor${result.notified !== 1 ? "s" : ""}`,
                            });
                          }
                        } catch (e: unknown) {
                          toast({
                            title: "Refill reminder failed",
                            description:
                              e instanceof Error
                                ? e instanceof Error
                                  ? e.message
                                  : String(e)
                                : "Unknown error",
                            variant: "destructive",
                          });
                        } finally {
                          setRefillSending(false);
                        }
                      }}
                    >
                      <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                      {refillSending ? "Sending…" : "Refill Reminder"}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 border-0 bg-green-600 text-xs text-white hover:bg-green-700"
                      disabled={!canWrite}
                      onClick={() => setBulkApproveConfirm(true)}
                    >
                      <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 border-0 bg-red-600 text-xs text-white hover:bg-red-700"
                      disabled={!canWrite}
                      onClick={() => setBulkDeleteConfirm(true)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-white hover:bg-white/20"
                      onClick={() => setSelectedProductIds(new Set())}
                    >
                      <X className="h-3.5 w-3.5" /> Clear
                    </Button>
                  </div>
                </div>
              )}

              {/* Desktop table */}
              <Card className="border-border/50 hidden overflow-hidden rounded-2xl shadow-sm md:block">
                <div className="overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded accent-violet-600"
                            checked={
                              filtered.length > 0 &&
                              filtered.every((p: ProductRow) => selectedProductIds.has(p.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked)
                                setSelectedProductIds(
                                  new Set(filtered.map((p: ProductRow) => p.id))
                                );
                              else setSelectedProductIds(new Set());
                            }}
                          />
                        </TableHead>
                        {(
                          [
                            { key: "name", label: T("product") },
                            { key: "category", label: T("category") },
                            { key: "price", label: T("price") },
                            { key: "vendor", label: T("vendor") },
                          ] as const
                        ).map((col) => (
                          <TableHead
                            key={col.key}
                            className="group cursor-pointer select-none"
                            onClick={() => toggleSort(col.key)}
                          >
                            <div className="flex items-center gap-1">
                              {col.label}
                              {sortKey === col.key ? (
                                sortDir === "asc" ? (
                                  <ArrowUp className="text-primary h-3 w-3" />
                                ) : (
                                  <ArrowDown className="text-primary h-3 w-3" />
                                )
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />
                              )}
                            </div>
                          </TableHead>
                        ))}
                        <TableHead>{T("stock")}</TableHead>
                        <TableHead className="text-right">{T("actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-muted-foreground h-32 text-center">
                            Loading products...
                          </TableCell>
                        </TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-muted-foreground h-32 text-center">
                            No products found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((p: ProductRow) => {
                          const isOutOfStock =
                            !p.inStock || (p.stock !== undefined && p.stock <= 0);
                          const isLowStock =
                            !isOutOfStock && p.stock !== undefined && p.stock > 0 && p.stock < 5;
                          const rowBg = selectedProductIds.has(p.id)
                            ? "bg-violet-50/60"
                            : isOutOfStock
                              ? "bg-red-50/60 border-l-2 border-l-red-300"
                              : isLowStock
                                ? "bg-amber-50/60 border-l-2 border-l-amber-300"
                                : "";
                          return (
                            <TableRow key={p.id} className={`hover:bg-muted/30 ${rowBg}`}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 cursor-pointer rounded accent-violet-600"
                                  checked={selectedProductIds.has(p.id)}
                                  onChange={() => toggleProductSelect(p.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  {p.image ? (
                                    <button
                                      type="button"
                                      onClick={() => setLightboxSrc(fullImgUrl(p.image))}
                                      className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-100"
                                      title="View image"
                                    >
                                      <SafeImage
                                        src={fullImgUrl(p.image) ?? ""}
                                        alt={p.name}
                                        className="h-10 w-10 rounded-lg"
                                        loading="eager"
                                      />
                                      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition group-hover:opacity-100">
                                        <ZoomIn className="h-4 w-4 text-white" />
                                      </span>
                                    </button>
                                  ) : (
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                                      <ImageIcon className="h-4 w-4 text-gray-300" />
                                    </span>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-foreground font-semibold">{p.name}</p>
                                    <div className="mt-0.5 flex items-center gap-2">
                                      <Badge
                                        variant={p.type === "food" ? "default" : "secondary"}
                                        className="text-[10px] uppercase"
                                      >
                                        {p.type}
                                      </Badge>
                                      {p.unit && (
                                        <span className="text-muted-foreground text-xs">
                                          {p.unit}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm font-medium capitalize">
                                {p.category}
                              </TableCell>
                              <TableCell>
                                <p className="text-foreground font-bold">
                                  {formatCurrency(p.price)}
                                </p>
                                {p.originalPrice && (
                                  <p className="text-muted-foreground text-xs line-through">
                                    {formatCurrency(p.originalPrice)}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {p.vendorName || "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <StatusBadge
                                      status={p.inStock ? "active" : "inactive"}
                                      label={p.inStock ? "In Stock" : "Out of Stock"}
                                      size="xs"
                                    />
                                    {canWrite && (
                                      <button
                                        onClick={() => toggleStock(p)}
                                        disabled={updateMutation.isPending}
                                        className="ml-1 opacity-50 transition-opacity hover:opacity-100"
                                        title={p.inStock ? "Mark out of stock" : "Mark in stock"}
                                      >
                                        {p.inStock ? (
                                          <ToggleRight className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <ToggleLeft className="h-4 w-4 text-red-600" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                  {p.stock !== undefined && isLowStock && (
                                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                                      <AlertTriangle className="h-2.5 w-2.5" /> {p.stock} left
                                    </span>
                                  )}
                                  {p.stock !== undefined && isOutOfStock && p.stock === 0 && (
                                    <span className="text-[10px] font-bold text-red-500">
                                      0 units
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setStockHistoryProduct(p)}
                                    className="h-8 w-8 hover:bg-violet-50 hover:text-violet-600"
                                    title="Stock history"
                                  >
                                    <History className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEdit(p)}
                                    className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                                    disabled={!canWrite}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDeleteTarget(p)}
                                    className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                                    disabled={!canWrite}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </div>

        {lightboxSrc && (
          <ImageLightbox
            src={lightboxSrc}
            label="Product Image"
            onClose={() => setLightboxSrc(null)}
          />
        )}

        {stockHistoryProduct && (
          <StockHistoryDialog
            product={stockHistoryProduct}
            vendors={vendors}
            onClose={() => setStockHistoryProduct(null)}
          />
        )}

        <ConfirmDialog
          open={bulkApproveConfirm}
          title={`Approve ${selectedProductIds.size} Product${selectedProductIds.size !== 1 ? "s" : ""}?`}
          description="Selected products will be approved and marked as in-stock on the platform."
          confirmLabel="Approve All"
          variant="default"
          busy={bulkApproving}
          onConfirm={handleBulkApproveSelected}
          onClose={() => {
            if (!bulkApproving) setBulkApproveConfirm(false);
          }}
        />
        <ConfirmDialog
          open={bulkDeleteConfirm}
          title={`Delete ${selectedProductIds.size} Product${selectedProductIds.size !== 1 ? "s" : ""}?`}
          description="These products will be permanently removed. This action cannot be undone."
          confirmLabel="Delete All"
          variant="destructive"
          busy={bulkDeleting}
          onConfirm={handleBulkDelete}
          onClose={() => {
            if (!bulkDeleting) setBulkDeleteConfirm(false);
          }}
        />

        {/* Bulk Edit Dialog */}
        {showBulkEdit && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setShowBulkEdit(false)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-border flex items-center gap-3 border-b px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100">
                  <Edit className="h-5 w-5 text-violet-700" />
                </div>
                <div>
                  <h2 className="text-foreground font-bold">Bulk Edit Products</h2>
                  <p className="text-muted-foreground text-xs">
                    {selectedProductIds.size} product{selectedProductIds.size !== 1 ? "s" : ""} will
                    be updated
                  </p>
                </div>
              </div>
              <div className="space-y-4 px-5 py-4">
                <p className="text-muted-foreground text-xs">
                  Leave any field blank to keep existing values unchanged.
                </p>
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    New Price (Rs.)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="1000000"
                    step="0.01"
                    value={bulkPrice}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setBulkPrice(e.target.value)
                    }
                    placeholder="Leave blank to keep current price"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Category
                  </label>
                  <Input
                    value={bulkCategory}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setBulkCategory(e.target.value)
                    }
                    placeholder="Leave blank to keep current category"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Stock Status
                  </label>
                  <select
                    value={bulkStock}
                    onChange={(e) => setBulkStock(e.target.value as "" | "in" | "out")}
                    className="border-input bg-background focus:ring-ring h-10 w-full rounded-xl border px-3 text-sm focus:ring-2 focus:outline-none"
                  >
                    <option value="">No change</option>
                    <option value="in">Mark all In Stock</option>
                    <option value="out">Mark all Out of Stock</option>
                  </select>
                </div>
              </div>
              <div className="border-border bg-muted/30 flex justify-end gap-3 border-t px-5 py-4">
                <Button
                  variant="outline"
                  className="h-9 rounded-xl"
                  onClick={() => setShowBulkEdit(false)}
                >
                  Cancel
                </Button>
                <Button className="h-9 rounded-xl" onClick={handleBulkEdit} disabled={bulkApplying}>
                  {bulkApplying ? "Applying…" : `Apply to ${selectedProductIds.size} products`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    </ErrorBoundary>
  );
}
