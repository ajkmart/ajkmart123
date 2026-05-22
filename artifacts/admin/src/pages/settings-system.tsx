import { useToast } from "@/hooks/use-toast";
import { fetchAdminAbsolute, fetchAdminAbsoluteResponse } from "@/lib/adminFetcher";
import { isAbortError, useAbortableEffect } from "@/lib/useAbortableEffect";
import {
  AlertTriangle,
  BookCopy,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  FlaskConical,
  HardDrive,
  Loader2,
  Plus,
  RefreshCcw,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Settings,
  Shield,
  ShoppingCart,
  Tag,
  Trash2,
  Upload,
  UserPlus,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactElement } from "react";

type PendingUndo = { id: string; label: string; expiresAt: string; actionId: string };

function fmtCountdown(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "00:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

type CustomFormType = "user" | "product" | "order" | "promo" | "banner" | null;

interface Setting {
  key: string;
  value: string;
  label: string;
  category: string;
}

export function SystemSection({
  localValues: _localValues = {},
  dirtyKeys: _dirtyKeys = new Set<string>(),
  handleChange: _handleChange = () => {},
  handleToggle: _handleToggle = () => {},
  settings: _settings = [],
}: {
  localValues?: Record<string, string>;
  dirtyKeys?: Set<string>;
  handleChange?: (k: string, v: string) => void;
  handleToggle?: (k: string, v: boolean) => void;
  settings?: Setting[];
} = {}) {
  const { toast } = useToast();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingUndos, setPendingUndos] = useState<PendingUndo[]>([]);
  const [undoLoading, setUndoLoading] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{ type: "remove" | "demo" } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const [customFormOpen, setCustomFormOpen] = useState<CustomFormType>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formLoading, setFormLoading] = useState(false);

  const [showOldActions, setShowOldActions] = useState(false);

  type DemoBackupMeta = {
    id: string;
    label: string;
    rowsTotal: number;
    sizeKb: number;
    createdAt: string;
  };
  const [demoBackups, setDemoBackups] = useState<DemoBackupMeta[]>([]);
  const [demoBackupsLoading, setDemoBackupsLoading] = useState(true);
  const [newBackupLabel, setNewBackupLabel] = useState("");
  const [demoSaving, setDemoSaving] = useState(false);
  const [demoRestoring, setDemoRestoring] = useState<string | null>(null);
  const [demoDeleting, setDemoDeleting] = useState<string | null>(null);
  const [confirmDemoRestore, setConfirmDemoRestore] = useState<DemoBackupMeta | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      setPendingUndos((prev) => prev.filter((u) => new Date(u.expiresAt).getTime() > ts));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const apiFetch = async (path: string, opts?: RequestInit) => {
    return fetchAdminAbsolute(`/api/admin/system${path}`, opts);
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await apiFetch("/stats");
      setStats(data.stats);
    } catch (e: unknown) {
      toast({
        title: "Failed to load DB stats",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setStatsLoading(false);
  };

  useAbortableEffect((signal) => {
    void loadStats();
    void loadDemoBackups();
    apiFetch("/snapshots", { signal })
      .then((data) => {
        if (signal.aborted) return;
        if (data?.snapshots?.length) {
          setPendingUndos(
            data.snapshots.map((s: any) => ({
              id: s.id,
              label: s.label,
              expiresAt: s.expiresAt,
              actionId: s.actionId,
            }))
          );
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return;
      });
  }, []);

  const addUndoFromResponse = (data: any, label: string) => {
    if (data.snapshotId) {
      setPendingUndos((prev) => [
        { id: data.snapshotId, label, expiresAt: data.expiresAt, actionId: data.snapshotId },
        ...prev,
      ]);
    }
  };

  const handleRemoveAll = async () => {
    setActionLoading("remove-all");
    try {
      const data = await apiFetch("/remove-all", { method: "POST" });
      toast({ title: "All data removed", description: "You have 30 minutes to undo this action." });
      addUndoFromResponse(data, "Remove All Data");
      await loadStats();
    } catch (e: unknown) {
      toast({
        title: "Remove failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setActionLoading(null);
    setConfirmDialog(null);
    setConfirmText("");
  };

  const handleSeedDemo = async () => {
    setActionLoading("seed-demo");
    try {
      const data = await apiFetch("/seed-demo", { method: "POST" });
      toast({ title: "Demo data loaded!", description: "Full realistic demo content populated." });
      addUndoFromResponse(data, "Load Demo Data");
      await loadStats();
    } catch (e: unknown) {
      toast({
        title: "Seed failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setActionLoading(null);
    setConfirmDialog(null);
    setConfirmText("");
  };

  const handleUndo = async (undo: PendingUndo) => {
    setUndoLoading(undo.id);
    try {
      const data = await apiFetch(`/undo/${undo.id}`, { method: "POST" });
      toast({ title: "Undo complete", description: data.message });
      setPendingUndos((prev) => prev.filter((u) => u.id !== undo.id));
      await loadStats();
    } catch (e: unknown) {
      toast({
        title: "Undo failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      setPendingUndos((prev) => prev.filter((u) => u.id !== undo.id));
    }
    setUndoLoading(null);
  };

  const handleDismissUndo = async (id: string) => {
    try {
      await apiFetch(`/snapshots/${id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("[settings-system] Failed to delete undo snapshot:", err);
    }
    setPendingUndos((prev) => prev.filter((u) => u.id !== id));
    toast({ title: "Action confirmed permanent", description: "Undo snapshot discarded." });
  };

  const handleBackup = async () => {
    setActionLoading("backup");
    try {
      const res = await fetchAdminAbsoluteResponse("/api/admin/system/backup");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ajkmart-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded", description: "Full database exported as JSON" });
    } catch (e: unknown) {
      toast({
        title: "Backup failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setActionLoading(null);
  };

  const handleRestore = async (file: File) => {
    setRestoreError(null);
    setActionLoading("restore");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.tables) throw new Error("Invalid backup file — missing 'tables' key");
      const data = await apiFetch("/restore", { method: "POST", body: JSON.stringify(json) });
      toast({ title: "Restore complete", description: "You have 30 minutes to undo this." });
      addUndoFromResponse(data, "Import Restore");
      await loadStats();
    } catch (e: unknown) {
      setRestoreError(e instanceof Error ? e.message : String(e));
      toast({
        title: "Restore failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setActionLoading(null);
  };

  const loadDemoBackups = useCallback(async () => {
    setDemoBackupsLoading(true);
    try {
      const data = await apiFetch("/demo-backups");
      setDemoBackups(data.data ?? data);
    } catch (err) {
      console.warn("[settings-system] Failed to load demo backups:", err);
    }
    setDemoBackupsLoading(false);
  }, []);

  const handleSaveDemoBackup = async () => {
    const label = newBackupLabel.trim() || `Demo Backup ${new Date().toLocaleDateString("en-PK")}`;
    setDemoSaving(true);
    try {
      await apiFetch("/demo-backups", { method: "POST", body: JSON.stringify({ label }) });
      toast({ title: "Demo backup saved!", description: `"${label}" saved to server.` });
      setNewBackupLabel("");
      await loadDemoBackups();
    } catch (e: unknown) {
      toast({
        title: "Backup failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setDemoSaving(false);
  };

  const handleRestoreDemoBackup = async (backup: DemoBackupMeta) => {
    setDemoRestoring(backup.id);
    setConfirmDemoRestore(null);
    try {
      const data = await apiFetch(`/demo-backups/${backup.id}/restore`, { method: "POST" });
      toast({
        title: "Restored!",
        description: `"${backup.label}" restored. Undo available for 30 min.`,
      });
      addUndoFromResponse(data, `Demo Restore: ${backup.label}`);
      await loadStats();
    } catch (e: unknown) {
      toast({
        title: "Restore failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setDemoRestoring(null);
  };

  const handleDeleteDemoBackup = async (id: string, label: string) => {
    setDemoDeleting(id);
    try {
      await apiFetch(`/demo-backups/${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: `"${label}" deleted.` });
      setDemoBackups((prev) => prev.filter((b) => b.id !== id));
    } catch (e: unknown) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setDemoDeleting(null);
  };

  const handleOldAction = async (endpoint: string, label: string) => {
    setActionLoading(endpoint);
    try {
      const data = await apiFetch(endpoint, { method: "POST" });
      toast({ title: `${label} — done`, description: "You have 30 minutes to undo this action." });
      addUndoFromResponse(data, label);
      await loadStats();
    } catch (e: unknown) {
      toast({
        title: `${label} failed`,
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setActionLoading(null);
  };

  const handleCustomFormSubmit = async () => {
    if (!customFormOpen) return;
    setFormLoading(true);
    try {
      let endpoint = "";
      let body: any = {};

      if (customFormOpen === "user") {
        if (!formData.name?.trim() && !formData.phone?.trim()) {
          toast({
            title: "Validation",
            description: "Name or phone is required",
            variant: "destructive",
          });
          setFormLoading(false);
          return;
        }
        endpoint = "/api/admin/users";
        body = {
          phone: formData.phone?.trim() || "",
          name: formData.name?.trim() || "",
          role: formData.role || "customer",
          city: formData.city?.trim() || "Muzaffarabad",
        };
      } else if (customFormOpen === "product") {
        if (!formData.name?.trim()) {
          toast({
            title: "Validation",
            description: "Product name is required",
            variant: "destructive",
          });
          setFormLoading(false);
          return;
        }
        const price = Number(formData.price);
        if (!price || price <= 0) {
          toast({
            title: "Validation",
            description: "Price must be a positive number",
            variant: "destructive",
          });
          setFormLoading(false);
          return;
        }
        endpoint = "/api/admin/products";
        body = {
          name: formData.name.trim(),
          price: price.toString(),
          category: formData.category?.trim() || "fruits",
          type: formData.type || "mart",
          description: formData.description?.trim() || "",
          unit: formData.unit?.trim() || "1 pc",
        };
      } else if (customFormOpen === "order") {
        if (!formData.userId?.trim()) {
          toast({
            title: "Validation",
            description: "User ID is required",
            variant: "destructive",
          });
          setFormLoading(false);
          return;
        }
        const total = Number(formData.total);
        if (!total || total <= 0) {
          toast({
            title: "Validation",
            description: "Total must be a positive number",
            variant: "destructive",
          });
          setFormLoading(false);
          return;
        }
        endpoint = "/api/admin/orders";
        body = {
          userId: formData.userId.trim(),
          vendorId: formData.vendorId?.trim() || formData.userId.trim(),
          type: formData.type || "mart",
          total: total.toString(),
          deliveryAddress: formData.deliveryAddress?.trim() || "Admin-created order",
          paymentMethod: formData.paymentMethod || "cod",
        };
      } else if (customFormOpen === "promo") {
        if (!formData.code?.trim()) {
          toast({
            title: "Validation",
            description: "Promo code is required",
            variant: "destructive",
          });
          setFormLoading(false);
          return;
        }
        if (!formData.discountPct && !formData.discountFlat) {
          toast({
            title: "Validation",
            description: "Either discount % or flat amount is required",
            variant: "destructive",
          });
          setFormLoading(false);
          return;
        }
        endpoint = "/api/admin/promo-codes";
        body = {
          code: formData.code.trim().toUpperCase(),
          description: formData.description?.trim() || "",
          discountPct: formData.discountPct ? Number(formData.discountPct).toString() : undefined,
          discountFlat: formData.discountFlat
            ? Number(formData.discountFlat).toString()
            : undefined,
          minOrderAmount: formData.minOrderAmount || "0",
          appliesTo: formData.appliesTo || "all",
        };
      } else if (customFormOpen === "banner") {
        if (!formData.title?.trim()) {
          toast({
            title: "Validation",
            description: "Banner title is required",
            variant: "destructive",
          });
          setFormLoading(false);
          return;
        }
        endpoint = "/api/admin/banners";
        body = {
          title: formData.title.trim(),
          subtitle: formData.subtitle?.trim() || "",
          colorFrom: formData.colorFrom || "#7C3AED",
          colorTo: formData.colorTo || "#4F46E5",
          placement: formData.placement || "home",
        };
      }

      const _data = await fetchAdminAbsolute(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });

      toast({
        title: `${customFormOpen} created`,
        description: `New ${customFormOpen} has been added.`,
      });
      setCustomFormOpen(null);
      setFormData({});
      await loadStats();
    } catch (e: unknown) {
      toast({
        title: "Creation failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setFormLoading(false);
  };

  const STAT_ITEMS = [
    { key: "users", label: "Users", icon: "👤", color: "bg-blue-50 border-blue-200 text-blue-700" },
    {
      key: "orders",
      label: "Orders",
      icon: "🛒",
      color: "bg-orange-50 border-orange-200 text-orange-700",
    },
    { key: "rides", label: "Rides", icon: "🚗", color: "bg-teal-50 border-teal-200 text-teal-700" },
    {
      key: "pharmacy",
      label: "Pharmacy",
      icon: "💊",
      color: "bg-green-50 border-green-200 text-green-700",
    },
    {
      key: "parcel",
      label: "Parcels",
      icon: "📦",
      color: "bg-amber-50 border-amber-200 text-amber-700",
    },
    {
      key: "products",
      label: "Products",
      icon: "🏪",
      color: "bg-violet-50 border-violet-200 text-violet-700",
    },
    {
      key: "walletTx",
      label: "Wallet Txns",
      icon: "💳",
      color: "bg-indigo-50 border-indigo-200 text-indigo-700",
    },
    {
      key: "reviews",
      label: "Reviews",
      icon: "⭐",
      color: "bg-yellow-50 border-yellow-200 text-yellow-700",
    },
    {
      key: "notifications",
      label: "Notifications",
      icon: "🔔",
      color: "bg-pink-50 border-pink-200 text-pink-700",
    },
    {
      key: "promos",
      label: "Promo Codes",
      icon: "🎫",
      color: "bg-rose-50 border-rose-200 text-rose-700",
    },
    {
      key: "flashDeals",
      label: "Flash Deals",
      icon: "⚡",
      color: "bg-sky-50 border-sky-200 text-sky-700",
    },
    {
      key: "banners",
      label: "Banners",
      icon: "🖼️",
      color: "bg-purple-50 border-purple-200 text-purple-700",
    },
    {
      key: "vendorProfiles",
      label: "Vendor Profiles",
      icon: "🏬",
      color: "bg-emerald-50 border-emerald-200 text-emerald-700",
    },
    {
      key: "riderProfiles",
      label: "Rider Profiles",
      icon: "🏍️",
      color: "bg-cyan-50 border-cyan-200 text-cyan-700",
    },
    {
      key: "serviceZones",
      label: "Service Zones",
      icon: "📍",
      color: "bg-lime-50 border-lime-200 text-lime-700",
    },
    {
      key: "savedAddresses",
      label: "Saved Addresses",
      icon: "📌",
      color: "bg-slate-50 border-slate-200 text-slate-700",
    },
    {
      key: "settings",
      label: "Settings",
      icon: "⚙️",
      color: "bg-slate-50 border-slate-200 text-slate-700",
    },
    {
      key: "adminAccounts",
      label: "Admin Accounts",
      icon: "🛡️",
      color: "bg-red-50 border-red-200 text-red-700",
    },
  ];

  const CUSTOM_FORM_OPTIONS: { key: CustomFormType; label: string; icon: any; color: string }[] = [
    {
      key: "user",
      label: "User",
      icon: <UserPlus size={14} />,
      color: "text-blue-600 bg-blue-50 border-blue-200",
    },
    {
      key: "product",
      label: "Product",
      icon: <ShoppingCart size={14} />,
      color: "text-violet-600 bg-violet-50 border-violet-200",
    },
    {
      key: "order",
      label: "Order",
      icon: <ShoppingCart size={14} />,
      color: "text-green-600 bg-green-50 border-green-200",
    },
    {
      key: "promo",
      label: "Promo Code",
      icon: <Tag size={14} />,
      color: "text-rose-600 bg-rose-50 border-rose-200",
    },
    {
      key: "banner",
      label: "Banner",
      icon: <Zap size={14} />,
      color: "text-amber-600 bg-amber-50 border-amber-200",
    },
  ];

  const renderFormField = (
    label: string,
    field: string,
    opts?: { type?: string; placeholder?: string; options?: { value: string; label: string }[] }
  ) => (
    <div key={field}>
      <label className="mb-1 block text-[11px] font-semibold text-slate-600">{label}</label>
      {opts?.options ? (
        <select
          value={formData[field] || opts.options[0]?.value || ""}
          onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
        >
          {opts.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={opts?.type || "text"}
          value={formData[field] || ""}
          onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
          placeholder={opts?.placeholder || ""}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
        />
      )}
    </div>
  );

  const renderCustomForm = () => {
    if (!customFormOpen) return null;

    let fields: ReactElement[] = [];
    if (customFormOpen === "user") {
      fields = [
        renderFormField("Name", "name", { placeholder: "Ahmed Khan" }),
        renderFormField("Phone", "phone", { placeholder: "+923001234000" }),
        renderFormField("Role", "role", {
          options: [
            { value: "customer", label: "Customer" },
            { value: "rider", label: "Rider" },
            { value: "vendor", label: "Vendor" },
          ],
        }),
        renderFormField("City", "city", { placeholder: "Muzaffarabad" }),
      ];
    } else if (customFormOpen === "product") {
      fields = [
        renderFormField("Name", "name", { placeholder: "Basmati Rice 5kg" }),
        renderFormField("Price (Rs.)", "price", { type: "number", placeholder: "980" }),
        renderFormField("Type", "type", {
          options: [
            { value: "mart", label: "Mart" },
            { value: "food", label: "Food" },
            { value: "pharmacy", label: "Pharmacy" },
          ],
        }),
        renderFormField("Category", "category", { placeholder: "fruits" }),
        renderFormField("Unit", "unit", { placeholder: "1kg" }),
        renderFormField("Description", "description", { placeholder: "Premium quality..." }),
      ];
    } else if (customFormOpen === "order") {
      fields = [
        renderFormField("User ID", "userId", { placeholder: "demo_cust_1" }),
        renderFormField("Vendor ID", "vendorId", { placeholder: "demo_vend_1" }),
        renderFormField("Type", "type", {
          options: [
            { value: "mart", label: "Mart" },
            { value: "food", label: "Food" },
          ],
        }),
        renderFormField("Total (Rs.)", "total", { type: "number", placeholder: "500" }),
        renderFormField("Delivery Address", "deliveryAddress", {
          placeholder: "Upper Adda, Muzaffarabad",
        }),
        renderFormField("Payment Method", "paymentMethod", {
          options: [
            { value: "cod", label: "Cash on Delivery" },
            { value: "wallet", label: "Wallet" },
            { value: "jazzcash", label: "JazzCash" },
            { value: "easypaisa", label: "EasyPaisa" },
          ],
        }),
      ];
    } else if (customFormOpen === "promo") {
      fields = [
        renderFormField("Code", "code", { placeholder: "WELCOME50" }),
        renderFormField("Description", "description", { placeholder: "50% off first order" }),
        renderFormField("Discount %", "discountPct", { type: "number", placeholder: "50" }),
        renderFormField("Discount Flat (Rs.)", "discountFlat", {
          type: "number",
          placeholder: "100",
        }),
        renderFormField("Min Order (Rs.)", "minOrderAmount", {
          type: "number",
          placeholder: "200",
        }),
        renderFormField("Applies To", "appliesTo", {
          options: [
            { value: "all", label: "All" },
            { value: "mart", label: "Mart" },
            { value: "food", label: "Food" },
            { value: "ride", label: "Rides" },
          ],
        }),
      ];
    } else if (customFormOpen === "banner") {
      fields = [
        renderFormField("Title", "title", { placeholder: "Free Delivery" }),
        renderFormField("Subtitle", "subtitle", { placeholder: "On orders above Rs. 500" }),
        renderFormField("Color From", "colorFrom", { placeholder: "#7C3AED" }),
        renderFormField("Color To", "colorTo", { placeholder: "#4F46E5" }),
        renderFormField("Placement", "placement", {
          options: [
            { value: "home", label: "Home" },
            { value: "mart", label: "Mart" },
            { value: "food", label: "Food" },
          ],
        }),
      ];
    }

    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Add {customFormOpen}</p>
          <button
            onClick={() => {
              setCustomFormOpen(null);
              setFormData({});
            }}
            className="rounded-lg p-1 hover:bg-slate-100"
          >
            <X size={14} className="text-slate-400" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields}</div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => {
              setCustomFormOpen(null);
              setFormData({});
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCustomFormSubmit}
            disabled={formLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {formLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {formLoading ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {pendingUndos.length > 0 && (
        <div className="space-y-2">
          {pendingUndos.map((undo) => {
            const countdown = fmtCountdown(undo.expiresAt, now);
            const urgentMs = new Date(undo.expiresAt).getTime() - now;
            const isUrgent = urgentMs < 5 * 60 * 1000;
            return (
              <div
                key={undo.id}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all ${
                  isUrgent
                    ? "animate-pulse border-red-300 bg-red-50"
                    : "border-amber-300 bg-amber-50"
                }`}
              >
                <div
                  className={`flex shrink-0 items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${isUrgent ? "text-red-600" : "text-amber-700"}`}
                >
                  <Clock size={14} className={isUrgent ? "text-red-500" : "text-amber-500"} />
                  {countdown}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-xs font-semibold ${isUrgent ? "text-red-800" : "text-amber-800"}`}
                  >
                    "{undo.label}" — undo available
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    Snapshot saved before this action. Tap Undo to reverse it completely.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleUndo(undo)}
                    disabled={undoLoading === undo.id || !!actionLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-amber-700 disabled:opacity-50"
                  >
                    {undoLoading === undo.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <RotateCcw size={11} />
                    )}
                    Undo
                  </button>
                  <button
                    onClick={() => handleDismissUndo(undo.id)}
                    disabled={undoLoading === undo.id}
                    title="Dismiss — make this action permanent"
                    className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-white/60 hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Scheduled Maintenance Window ═══ */}
      <MaintenanceScheduleSection apiFetch={apiFetch} toast={toast} />

      {/* ═══ Data Retention Policies ═══ */}
      <DataRetentionSection apiFetch={apiFetch} toast={toast} />

      {/* ═══ CSV / Report Export ═══ */}
      <CSVExportSection toast={toast} />

      {/* ═══ Developer Tools ═══ */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <BookCopy size={16} className="text-indigo-600" />
          <p className="text-base font-bold text-slate-800">Developer Tools</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 rounded-xl border border-indigo-200 bg-white p-4 transition-all hover:border-indigo-300 hover:bg-indigo-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 transition-all group-hover:bg-indigo-200">
              <Wrench size={18} className="text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-sm font-bold text-slate-800">
                API Docs
                <svg
                  className="ml-0.5 h-3 w-3 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                Interactive Swagger UI — browse all API endpoints, view request/response schemas,
                and run test calls.
              </p>
            </div>
          </a>
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <BookCopy size={18} className="text-slate-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800">Operational Runbooks</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                Deployment, rollback, incident response, and on-call guides are in{" "}
                <code className="rounded bg-slate-100 px-1 text-slate-600">docs/runbooks/</code> in
                the repository.
              </p>
            </div>
          </div>
        </div>
      </div>

      {import.meta.env.DEV && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Database size={16} className="text-slate-600" />
            <p className="text-base font-bold text-slate-800">Data Management</p>
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase">
              Dev only
            </span>
            <p className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
              <Clock size={10} /> All actions create undo snapshots for 30 min
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              onClick={() => {
                setConfirmDialog({ type: "remove" });
                setConfirmText("");
              }}
              disabled={!!actionLoading}
              className="group relative flex flex-col items-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 p-5 transition-all hover:border-red-300 hover:bg-red-100 disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 transition-all group-hover:bg-red-200">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <p className="text-sm font-bold text-red-800">Remove All</p>
              <p className="text-center text-[10px] leading-tight text-red-600">
                Wipe all data (users, orders, products...). Admin accounts & settings preserved.
              </p>
            </button>

            <button
              onClick={() => {
                setConfirmDialog({ type: "demo" });
                setConfirmText("");
              }}
              disabled={!!actionLoading}
              className="group relative flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5 transition-all hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-50"
            >
              {actionLoading === "seed-demo" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60">
                  <Loader2 size={24} className="animate-spin text-emerald-600" />
                </div>
              )}
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 transition-all group-hover:bg-emerald-200">
                <FlaskConical size={22} className="text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-emerald-800">Load Demo Data</p>
              <p className="text-center text-[10px] leading-tight text-emerald-600">
                Populate with 22 users, 38+ products, 24 orders, 15 rides, reviews & more.
              </p>
            </button>

            <button
              onClick={() => {
                setCustomFormOpen(customFormOpen ? null : "user");
                setFormData({});
              }}
              disabled={!!actionLoading}
              className="group relative flex flex-col items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 p-5 transition-all hover:border-blue-300 hover:bg-blue-100 disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 transition-all group-hover:bg-blue-200">
                <Plus size={22} className="text-blue-600" />
              </div>
              <p className="text-sm font-bold text-blue-800">Add Custom Data</p>
              <p className="text-center text-[10px] leading-tight text-blue-600">
                Manually add individual users, products, promo codes or banners.
              </p>
            </button>
          </div>
        </div>
      )}

      {import.meta.env.DEV && customFormOpen && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {CUSTOM_FORM_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setCustomFormOpen(opt.key);
                  setFormData({});
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  customFormOpen === opt.key
                    ? opt.color + " shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
          {renderCustomForm()}
        </div>
      )}

      {import.meta.env.DEV && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive size={15} className="text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Database Overview</p>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase">
                Dev only
              </span>
              {!statsLoading && stats && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  {Object.values(stats)
                    .reduce((a, b) => a + b, 0)
                    .toLocaleString()}{" "}
                  total rows
                </span>
              )}
            </div>
            <button
              onClick={loadStats}
              disabled={statsLoading}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700"
            >
              <RefreshCw size={11} className={statsLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {statsLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array(8)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STAT_ITEMS.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 ${item.color}`}
                >
                  <span className="shrink-0 text-lg">{item.icon}</span>
                  <div>
                    <p className="text-lg leading-none font-extrabold">
                      {(stats?.[item.key] ?? 0).toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium opacity-70">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <HardDrive size={15} className="text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">Backup & Restore</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Download size={16} className="text-green-700" />
              <p className="text-sm font-semibold text-green-800">Export Backup</p>
            </div>
            <p className="mb-4 text-[11px] text-green-700">
              Downloads the full database as a JSON file.
            </p>
            <button
              onClick={handleBackup}
              disabled={actionLoading === "backup"}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white transition-all hover:bg-green-700 disabled:opacity-60"
            >
              {actionLoading === "backup" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {actionLoading === "backup" ? "Exporting..." : "Download Backup (.json)"}
            </button>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Upload size={16} className="text-blue-700" />
              <p className="text-sm font-semibold text-blue-800">Import Restore</p>
            </div>
            <p className="mb-3 text-[11px] text-blue-700">
              Upload a previously exported backup JSON file. Undo available for 30 min.
            </p>
            {restoreError && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-600">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                {restoreError}
              </div>
            )}
            <label
              className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed py-2 text-sm font-semibold transition-all ${actionLoading === "restore" ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "border-blue-300 bg-white text-blue-700 hover:border-blue-500 hover:bg-blue-100"}`}
            >
              {actionLoading === "restore" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {actionLoading === "restore" ? "Restoring..." : "Upload Backup File"}
              <input
                type="file"
                accept=".json"
                className="hidden"
                disabled={!!actionLoading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleRestore(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* ── Demo Backup & Restore ── */}
      {import.meta.env.DEV && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <BookCopy size={15} className="text-indigo-500" />
            <p className="text-sm font-semibold text-slate-700">Demo Data Snapshots</p>
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase">
              Dev only
            </span>
            <span className="ml-auto rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
              Server-side
            </span>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">
            Save the current database state as a named snapshot. Restore anytime in one click — no
            file upload needed.
          </p>

          {/* Save new demo backup */}
          <div className="mb-4 flex gap-2">
            <input
              value={newBackupLabel}
              onChange={(e) => setNewBackupLabel(e.target.value)}
              placeholder="Snapshot name (e.g. Clean Demo State)"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !demoSaving) void handleSaveDemoBackup();
              }}
            />
            <button
              onClick={handleSaveDemoBackup}
              disabled={demoSaving}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-60"
            >
              {demoSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {demoSaving ? "Saving..." : "Save Snapshot"}
            </button>
          </div>

          {/* List of saved demo backups */}
          {demoBackupsLoading ? (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 size={18} className="mr-2 animate-spin" /> Loading snapshots...
            </div>
          ) : demoBackups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-[12px] text-slate-400">
              No demo snapshots saved yet. Save one above to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {demoBackups.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{b.label}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {b.rowsTotal.toLocaleString()} rows · {b.sizeKb} KB ·{" "}
                      {new Date(b.createdAt).toLocaleDateString("en-PK", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirmDemoRestore(b)}
                    disabled={!!demoRestoring || !!demoDeleting}
                    title="Restore this snapshot"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {demoRestoring === b.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RotateCw size={12} />
                    )}
                    {demoRestoring === b.id ? "Restoring..." : "Restore"}
                  </button>
                  <button
                    onClick={() => handleDeleteDemoBackup(b.id, b.label)}
                    disabled={!!demoDeleting || !!demoRestoring}
                    title="Delete this snapshot"
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-all hover:bg-red-100 disabled:opacity-50"
                  >
                    {demoDeleting === b.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Confirm restore dialog */}
          {confirmDemoRestore && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="mx-4 w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <AlertTriangle size={18} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Restore Demo Snapshot?</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      This will overwrite current data with "{confirmDemoRestore.label}". Undo
                      available for 30 min.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDemoRestore(null)}
                    className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRestoreDemoBackup(confirmDemoRestore)}
                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-700"
                  >
                    Yes, Restore
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {import.meta.env.DEV && (
        <div>
          <button
            onClick={() => setShowOldActions(!showOldActions)}
            className="mb-2 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700"
          >
            {showOldActions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span className="font-semibold">Advanced Reset Actions</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase">
              Dev only
            </span>
          </button>

          {showOldActions && (
            <div className="mt-2 space-y-2">
              {[
                {
                  endpoint: "/reset-demo",
                  label: "Reset Demo Content",
                  desc: "Clear transactional data + reseed products",
                  color: "border-amber-200 bg-amber-50",
                  btnColor: "bg-amber-500 hover:bg-amber-600",
                  icon: <FlaskConical size={14} />,
                },
                {
                  endpoint: "/reset-transactional",
                  label: "Clear Transactional Data",
                  desc: "Clear orders, rides, reviews. Keep users/products.",
                  color: "border-orange-200 bg-orange-50",
                  btnColor: "bg-orange-500 hover:bg-orange-600",
                  icon: <RotateCcw size={14} />,
                },
                {
                  endpoint: "/reset-products",
                  label: "Reseed Products",
                  desc: "Delete all products and insert fresh demo products.",
                  color: "border-violet-200 bg-violet-50",
                  btnColor: "bg-violet-500 hover:bg-violet-600",
                  icon: <RefreshCcw size={14} />,
                },
                {
                  endpoint: "/reset-settings",
                  label: "Reset Platform Settings",
                  desc: "Delete all settings. Factory defaults on next visit.",
                  color: "border-red-200 bg-red-50",
                  btnColor: "bg-red-500 hover:bg-red-600",
                  icon: <Settings size={14} />,
                },
                {
                  endpoint: "/reset-all",
                  label: "Full Database Reset",
                  desc: "Delete ALL users, orders, rides, products. Preserves settings.",
                  color: "border-red-300 bg-red-50",
                  btnColor: "bg-red-700 hover:bg-red-800",
                  icon: <Trash2 size={14} />,
                },
              ].map((action) => (
                <div
                  key={action.endpoint}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${action.color}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-slate-600">{action.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{action.label}</p>
                      <p className="truncate text-[10px] text-slate-500">{action.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOldAction(action.endpoint, action.label)}
                    disabled={!!actionLoading}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${action.btnColor}`}
                  >
                    {actionLoading === action.endpoint ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      "Run"
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {import.meta.env.DEV && confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div
              className={`px-6 py-4 ${confirmDialog.type === "remove" ? "bg-red-600" : "bg-emerald-600"} text-white`}
            >
              <div className="flex items-center gap-2">
                {confirmDialog.type === "remove" ? (
                  <Trash2 size={18} />
                ) : (
                  <FlaskConical size={18} />
                )}
                <p className="font-bold">
                  {confirmDialog.type === "remove" ? "Remove All Data" : "Load Demo Data"}
                </p>
              </div>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm text-slate-600">
                {confirmDialog.type === "remove"
                  ? "This will delete ALL users, orders, rides, products, reviews, wallet transactions and all other content. Admin accounts and platform settings will be preserved."
                  : "This will clear existing data and populate the system with comprehensive demo content: 22 users (customers, riders, vendors), 38+ products, 24 orders, 15 rides, reviews, wallet transactions, banners, promo codes and more."}
              </p>

              <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <Clock size={13} className="mt-0.5 shrink-0 text-blue-500" />
                <p className="text-xs text-blue-700">
                  A full snapshot will be taken before this action runs. You will have{" "}
                  <strong>30 minutes</strong> to undo it.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs text-slate-500">
                  Type{" "}
                  <span className="font-mono font-bold text-slate-800">
                    {confirmDialog.type === "remove" ? "DELETE ALL" : "LOAD DEMO"}
                  </span>{" "}
                  to confirm:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={confirmDialog.type === "remove" ? "DELETE ALL" : "LOAD DEMO"}
                  className="w-full rounded-lg border px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setConfirmDialog(null);
                    setConfirmText("");
                  }}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  disabled={
                    (confirmDialog.type === "remove" && confirmText !== "DELETE ALL") ||
                    (confirmDialog.type === "demo" && confirmText !== "LOAD DEMO") ||
                    !!actionLoading
                  }
                  onClick={() => {
                    if (confirmDialog.type === "remove") void handleRemoveAll();
                    else void handleSeedDemo();
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold text-white transition-all disabled:opacity-40 ${confirmDialog.type === "remove" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  {actionLoading ? "Processing..." : "Confirm & Snapshot"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ Maintenance Schedule Section ═══════════ */
function MaintenanceScheduleSection({
  apiFetch,
  toast,
}: {
  apiFetch: (path: string, opts?: RequestInit) => Promise<any>;
  toast: any;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch("/maintenance-schedule")
      .then((d) => {
        if (!d) return;
        const data = d.data ?? d;
        setStart(data.scheduledStart || "");
        setEnd(data.scheduledEnd || "");
        setMsg(data.scheduledMsg || "");
      })
      .catch((err) => {
        console.error(
          "[settings-system] maintenance-schedule fetch failed:",
          err instanceof Error ? err.message : err
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/maintenance-schedule", {
        method: "PUT",
        body: JSON.stringify({
          scheduledStart: start || null,
          scheduledEnd: end || null,
          scheduledMsg: msg,
        }),
      });
      toast({ title: "Maintenance schedule saved" });
    } catch (e: unknown) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const clear = async () => {
    setSaving(true);
    try {
      await apiFetch("/maintenance-schedule", {
        method: "PUT",
        body: JSON.stringify({ scheduledStart: null, scheduledEnd: null }),
      });
      setStart("");
      setEnd("");
      toast({ title: "Maintenance schedule cleared" });
    } catch (e: unknown) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const isActive =
    start &&
    end &&
    new Date(start).getTime() <= Date.now() &&
    new Date(end).getTime() >= Date.now();
  const isUpcoming = start && new Date(start).getTime() > Date.now();

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <Wrench size={16} className="text-amber-600" />
        <p className="text-base font-bold text-slate-800">Scheduled Maintenance Window</p>
        {isActive && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
            ACTIVE NOW
          </span>
        )}
        {isUpcoming && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
            UPCOMING
          </span>
        )}
      </div>
      {loading ? (
        <div className="py-4 text-center text-slate-400">
          <Loader2 size={16} className="inline animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                Start (ISO 8601)
              </label>
              <input
                type="datetime-local"
                value={start ? start.slice(0, 16) : ""}
                onChange={(e) =>
                  setStart(e.target.value ? new Date(e.target.value).toISOString() : "")
                }
                className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                End (ISO 8601)
              </label>
              <input
                type="datetime-local"
                value={end ? end.slice(0, 16) : ""}
                onChange={(e) =>
                  setEnd(e.target.value ? new Date(e.target.value).toISOString() : "")
                }
                className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Maintenance Message
            </label>
            <input
              type="text"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="We're performing scheduled maintenance..."
              className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
              {saving ? "Saving..." : "Save Schedule"}
            </button>
            {(start || end) && (
              <button
                onClick={clear}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ Data Retention Section ═══════════ */
function DataRetentionSection({
  apiFetch,
  toast,
}: {
  apiFetch: (path: string, opts?: RequestInit) => Promise<any>;
  toast: any;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [policies, setPolicies] = useState({
    locationDays: 90,
    chatDays: 180,
    auditDays: 365,
    notificationsDays: 30,
    lastCleanup: null as string | null,
  });
  const [cleanupResult, setCleanupResult] = useState<{
    totalDeleted: number;
    deleted: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    apiFetch("/retention-policies")
      .then((d) => {
        if (!d) return;
        const data = d.data ?? d;
        setPolicies({
          locationDays: data.locationDays,
          chatDays: data.chatDays,
          auditDays: data.auditDays,
          notificationsDays: data.notificationsDays,
          lastCleanup: data.lastCleanup,
        });
      })
      .catch((err) => {
        console.error(
          "[settings-system] retention-policies fetch failed:",
          err instanceof Error ? err.message : err
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const d = await apiFetch("/retention-policies", {
        method: "PUT",
        body: JSON.stringify(policies),
      });
      const data = d.data ?? d;
      setPolicies({
        locationDays: data.locationDays,
        chatDays: data.chatDays,
        auditDays: data.auditDays,
        notificationsDays: data.notificationsDays,
        lastCleanup: data.lastCleanup,
      });
      toast({ title: "Retention policies saved" });
    } catch (e: unknown) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const runCleanup = async () => {
    setCleaning(true);
    setCleanupResult(null);
    try {
      const d = await apiFetch("/retention-cleanup", { method: "POST" });
      const data = d.data ?? d;
      setCleanupResult({ totalDeleted: data.totalDeleted, deleted: data.deleted });
      setPolicies((p) => ({ ...p, lastCleanup: data.lastCleanup }));
      toast({ title: `Cleanup complete: ${data.totalDeleted} records purged` });
    } catch (e: unknown) {
      toast({
        title: "Cleanup failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setCleaning(false);
  };

  const field = (label: string, key: keyof typeof policies, hint: string) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={policies[key] as number}
          onChange={(e) => setPolicies((p) => ({ ...p, [key]: parseInt(e.target.value) || 1 }))}
          className="w-24 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 focus:outline-none"
        />
        <span className="text-xs text-slate-400">{hint}</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <Shield size={16} className="text-purple-600" />
        <p className="text-base font-bold text-slate-800">Data Retention Policies</p>
        {policies.lastCleanup && (
          <span className="ml-auto text-[10px] text-slate-400">
            Last cleanup: {new Date(policies.lastCleanup).toLocaleDateString()}
          </span>
        )}
      </div>
      {loading ? (
        <div className="py-4 text-center text-slate-400">
          <Loader2 size={16} className="inline animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("Location History", "locationDays", "days")}
            {field("Chat / Support Messages", "chatDays", "days")}
            {field("Auth Audit Logs", "auditDays", "days")}
            {field("Notifications", "notificationsDays", "days")}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? "Saving..." : "Save Policies"}
            </button>
            <button
              onClick={runCleanup}
              disabled={cleaning}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {cleaning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {cleaning ? "Cleaning..." : "Run Cleanup Now"}
            </button>
          </div>
          {cleanupResult && (
            <div className="space-y-1 rounded-xl border border-purple-200 bg-white p-3 text-xs">
              <p className="font-bold text-slate-700">
                Cleanup Result: {cleanupResult.totalDeleted} records deleted
              </p>
              {Object.entries(cleanupResult.deleted).map(([k, v]) => (
                <p key={k} className="text-slate-500">
                  {k}: <span className="font-mono font-bold text-slate-700">{v}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════ CSV Export Section ═══════════ */
function CSVExportSection({ toast }: { toast: any }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const downloadCSV = async (
    endpoint: string,
    filename: string,
    params?: Record<string, string>
  ) => {
    setDownloading(endpoint);
    try {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      const res = await fetchAdminAbsoluteResponse(`/api/admin/system/export/${endpoint}${qs}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${endpoint}`, description: `Downloaded ${filename}` });
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setDownloading(null);
  };

  const exports = [
    { key: "orders", label: "Orders", icon: "📦", desc: "All orders with status, totals, dates" },
    { key: "users", label: "Users", icon: "👥", desc: "All users with roles, balances, dates" },
    { key: "riders", label: "Riders", icon: "🏍️", desc: "Rider details, status, earnings" },
    { key: "vendors", label: "Vendors", icon: "🏪", desc: "Vendor details, stores, balances" },
    { key: "rides", label: "Rides", icon: "🚗", desc: "Ride history with fares, distances" },
    { key: "financial", label: "Financial", icon: "💰", desc: "Wallet transactions, all types" },
  ];

  return (
    <div className="rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <FileSpreadsheet size={16} className="text-green-600" />
        <p className="text-base font-bold text-slate-800">CSV / Report Export</p>
        <span className="ml-auto text-[10px] text-slate-400">Max 5,000-10,000 rows per export</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {exports.map((exp) => (
          <button
            key={exp.key}
            onClick={() =>
              downloadCSV(exp.key, `${exp.key}-${new Date().toISOString().slice(0, 10)}.csv`)
            }
            disabled={!!downloading}
            className="group flex flex-col items-center gap-1.5 rounded-xl border border-green-200 bg-white p-4 transition-all hover:border-green-300 hover:bg-green-50 disabled:opacity-50"
          >
            {downloading === exp.key ? (
              <Loader2 size={20} className="animate-spin text-green-600" />
            ) : (
              <span className="text-2xl">{exp.icon}</span>
            )}
            <p className="text-sm font-bold text-slate-800">{exp.label}</p>
            <p className="text-center text-[10px] leading-tight text-slate-500">{exp.desc}</p>
            <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-green-600">
              <Download size={12} /> CSV
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
