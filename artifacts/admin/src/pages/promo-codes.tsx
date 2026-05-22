import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SensitiveActionDialog } from "@/components/SensitiveActionDialog";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreatePromoCode,
  useDeletePromoCode,
  usePromoCodes,
  useUpdatePromoCode,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  ToggleLeft,
  ToggleRight,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";

const EMPTY_FORM = {
  code: "",
  description: "",
  discountPct: "",
  discountFlat: "",
  minOrderAmount: "",
  maxDiscount: "",
  usageLimit: "",
  appliesTo: "all",
  expiresAt: "",
  isActive: true,
};

function PromoModal({ promo, onClose }: { promo?: any; onClose: () => void }) {
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (k: TranslationKey) => tDual(k, language);
  const createMutation = useCreatePromoCode();
  const updateMutation = useUpdatePromoCode();
  const isEdit = !!promo;

  const [form, setForm] = useState(
    promo
      ? {
          code: promo.code || "",
          description: promo.description || "",
          discountPct: promo.discountPct ? String(promo.discountPct) : "",
          discountFlat: promo.discountFlat ? String(promo.discountFlat) : "",
          minOrderAmount: promo.minOrderAmount ? String(promo.minOrderAmount) : "",
          maxDiscount: promo.maxDiscount ? String(promo.maxDiscount) : "",
          usageLimit: promo.usageLimit ? String(promo.usageLimit) : "",
          appliesTo: promo.appliesTo || "all",
          expiresAt: promo.expiresAt ? promo.expiresAt.slice(0, 16) : "",
          isActive: promo.isActive !== false,
        }
      : EMPTY_FORM
  );

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.code) {
      toast({ title: "Promo code required", variant: "destructive" });
      return;
    }
    if (!form.discountPct && !form.discountFlat) {
      toast({ title: T("discountAmountRequired"), variant: "destructive" });
      return;
    }

    const payload: any = {
      code: form.code.toUpperCase().trim(),
      description: form.description || null,
      discountPct: form.discountPct ? Number(form.discountPct) : null,
      discountFlat: form.discountFlat ? Number(form.discountFlat) : null,
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : 0,
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      appliesTo: form.appliesTo,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      isActive: form.isActive,
    };

    const mutation = isEdit ? updateMutation : createMutation;
    const mutArgs = isEdit ? { id: promo.id, ...payload } : payload;

    mutation.mutate(mutArgs, {
      onSuccess: () => {
        toast({ title: isEdit ? "Promo code updated ✅" : "Promo code created ✅" });
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-violet-600" />
            {isEdit ? "Edit Promo Code" : "New Promo Code"}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {/* Code */}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
              Promo Code *
            </label>
            <Input
              placeholder="e.g. EID50, SUMMER20"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              className="h-12 rounded-xl font-mono text-lg font-bold tracking-widest"
              disabled={isEdit}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
              Description
            </label>
            <Input
              placeholder="e.g. Eid special 50% off"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Discount Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Discount % (e.g. 20)
              </label>
              <Input
                type="number"
                placeholder="0"
                value={form.discountPct}
                onChange={(e) => set("discountPct", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Flat Discount Rs.
              </label>
              <Input
                type="number"
                placeholder="0"
                value={form.discountFlat}
                onChange={(e) => set("discountFlat", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          {/* Min Order & Max Discount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Min Order (Rs.)
              </label>
              <Input
                type="number"
                placeholder="0"
                value={form.minOrderAmount}
                onChange={(e) => set("minOrderAmount", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Max Discount (Rs.)
              </label>
              <Input
                type="number"
                placeholder="No limit"
                value={form.maxDiscount}
                onChange={(e) => set("maxDiscount", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          {/* Usage Limit & Applies To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Usage Limit
              </label>
              <Input
                type="number"
                placeholder="Unlimited"
                value={form.usageLimit}
                onChange={(e) => set("usageLimit", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Applies To
              </label>
              <Select value={form.appliesTo} onValueChange={(v) => set("appliesTo", v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  <SelectItem value="mart">Mart</SelectItem>
                  <SelectItem value="food">Food</SelectItem>
                  <SelectItem value="pharmacy">Pharmacy</SelectItem>
                  <SelectItem value="parcel">Parcel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Expiry */}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
              Expiry Date & Time
            </label>
            <Input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Active Toggle */}
          <div className="bg-muted/30 flex items-center justify-between rounded-xl p-3">
            <div>
              <p className="text-sm font-semibold">Active</p>
              <p className="text-muted-foreground text-xs">Customers can use this code</p>
            </div>
            <button onClick={() => set("isActive", !form.isActive)}>
              {form.isActive ? (
                <ToggleRight className="h-8 w-8 text-green-600" />
              ) : (
                <ToggleLeft className="text-muted-foreground h-8 w-8" />
              )}
            </button>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 rounded-xl"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : isEdit
                  ? "Update Code"
                  : "Create Code"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════ Main Page ══════════ */
export default function PromoCodes() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading, refetch, isFetching } = usePromoCodes();
  const deleteMutation = useDeletePromoCode();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editPromo, setEditPromo] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const codes: any[] = data?.codes || [];
  const filtered = codes.filter((c: any) => {
    const q = search.toLowerCase();
    const matchSearch =
      c.code.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCodes = codes.filter((c: any) => c.status === "active").length;
  const expiredCodes = codes.filter((c: any) => c.status === "expired").length;
  const exhaustedCodes = codes.filter((c: any) => c.status === "exhausted").length;

  const getStatusBadge = (c: any) => {
    const conf: Record<string, { color: string; icon: any; label: string }> = {
      active: {
        color: "bg-green-100 text-green-700 border-green-200",
        icon: CheckCircle2,
        label: "Active",
      },
      inactive: {
        color: "bg-gray-100 text-gray-600 border-gray-200",
        icon: XCircle,
        label: "Inactive",
      },
      expired: { color: "bg-red-100 text-red-700 border-red-200", icon: Clock, label: "Expired" },
      exhausted: {
        color: "bg-amber-100 text-amber-700 border-amber-200",
        icon: Zap,
        label: "Exhausted",
      },
    };
    const cfg = conf[c.status] || conf["inactive"]!;
    const Icon = cfg.icon;
    return (
      <Badge className={`${cfg.color} gap-1 text-[10px]`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </Badge>
    );
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Promo code deleted" });
        setDeleteId(null);
      },
      onError: (e: any) =>
        toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Promo Codes page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Ticket}
          title={T("promoCodes")}
          subtitle={`${codes.length} total · ${activeCodes} active · ${expiredCodes} expired`}
          iconBgClass="bg-violet-100"
          iconColorClass="text-violet-600"
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-9 gap-2 rounded-xl"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => setShowModal(true)} className="h-9 gap-2 rounded-xl">
                <Plus className="h-4 w-4" /> New Code
              </Button>
            </div>
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: "Total Codes",
              value: String(codes.length),
              color: "bg-violet-100 text-violet-600",
            },
            { label: "Active", value: String(activeCodes), color: "bg-green-100 text-green-600" },
            { label: "Expired", value: String(expiredCodes), color: "bg-red-100 text-red-600" },
            {
              label: "Exhausted",
              value: String(exhaustedCodes),
              color: "bg-amber-100 text-amber-600",
            },
          ].map((s, i) => (
            <Card key={i} className="border-border/50 rounded-2xl shadow-sm">
              <CardContent className="p-4">
                <p className="text-muted-foreground mb-1 text-xs font-medium">{s.label}</p>
                <p className={`text-2xl font-extrabold`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="border-border/50 flex flex-col gap-3 rounded-2xl p-4 shadow-sm sm:flex-row">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search code or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-muted/30 h-11 rounded-xl pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-muted/30 h-11 w-full rounded-xl sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">✅ Active</SelectItem>
              <SelectItem value="inactive">⊘ Inactive</SelectItem>
              <SelectItem value="expired">🕒 Expired</SelectItem>
              <SelectItem value="exhausted">⚡ Exhausted</SelectItem>
            </SelectContent>
          </Select>
        </Card>

        {/* Codes List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-20 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-border/50 rounded-2xl">
            <CardContent className="p-12 text-center">
              <Ticket className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
              <p className="text-muted-foreground font-medium">No promo codes found</p>
              <Button size="sm" className="mt-4 rounded-xl" onClick={() => setShowModal(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create First Code
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((c: any) => (
              <Card
                key={c.id}
                className="border-border/50 rounded-2xl shadow-sm transition-shadow hover:shadow-md"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {/* Code Info */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-violet-50 px-3 py-0.5 font-mono text-lg font-extrabold tracking-widest text-violet-700">
                          {c.code}
                        </span>
                        {getStatusBadge(c)}
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {c.appliesTo}
                        </Badge>
                      </div>
                      {c.description && (
                        <p className="text-muted-foreground text-sm">{c.description}</p>
                      )}
                      <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-xs">
                        {c.discountPct && (
                          <span className="font-semibold text-green-700">
                            🏷️ {c.discountPct}% off
                          </span>
                        )}
                        {c.discountFlat && (
                          <span className="font-semibold text-green-700">
                            🏷️ Rs. {c.discountFlat} off
                          </span>
                        )}
                        {c.minOrderAmount > 0 && <span>Min: Rs. {c.minOrderAmount}</span>}
                        {c.maxDiscount && <span>Max: Rs. {c.maxDiscount}</span>}
                        <span>
                          Used: {c.usedCount || 0}
                          {c.usageLimit ? `/${c.usageLimit}` : ""}
                        </span>
                        {c.expiresAt && <span>Expires: {formatDate(c.expiresAt)}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditPromo(c)}
                        className="h-9 gap-1.5 rounded-xl text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteId(c.id)}
                        className="h-9 gap-1.5 rounded-xl border-red-200 text-xs text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && <PromoModal onClose={() => setShowModal(false)} />}
        {editPromo && <PromoModal promo={editPromo} onClose={() => setEditPromo(null)} />}

        {/* Delete Confirm — requires password re-entry */}
        <SensitiveActionDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={() => {
            if (deleteId) handleDelete(deleteId);
          }}
          title={tDual("deletePromoCodeTitle", language)}
          description={tDual("actionCannotBeUndone", language)}
          confirmLabel="Delete"
          actionType="delete_promo_code"
          targetId={deleteId ?? undefined}
        />
      </div>
    </ErrorBoundary>
  );
}
