import { StatusBadge } from "@/components/AdminShared";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { formatDate } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Gift,
  Lightbulb,
  Megaphone,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Target,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Truck,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";

/* ── Types ── */
interface _TopOffer {
  offerId: string;
  redemptions: number;
  discountGiven: number;
  offer?: { name: string };
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  theme: string;
  colorFrom: string;
  colorTo: string;
  status: string;
  computedStatus: string;
  startDate: string;
  endDate: string;
  priority: number;
  budgetCap?: number;
  budgetSpent?: number;
  offerCount: number;
}

interface Offer {
  id: string;
  name: string;
  description?: string;
  type: string;
  campaignId?: string;
  code?: string;
  discountPct?: number;
  discountFlat?: number;
  minOrderAmount: number;
  maxDiscount?: number;
  freeDelivery: boolean;
  cashbackPct?: number;
  cashbackMax?: number;
  buyQty?: number;
  getQty?: number;
  targetingRules: Record<string, unknown>;
  stackable: boolean;
  usageLimit?: number;
  usedCount: number;
  appliesTo: string;
  status: string;
  computedStatus: string;
  startDate: string;
  endDate: string;
}

/* ── Offer Type Configs ── */
const OFFER_TYPES: {
  value: string;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
}[] = [
  {
    value: "percentage",
    label: "Percentage Off",
    icon: Tag,
    color: "text-violet-600 bg-violet-100",
    description: "e.g. 10% off all grocery",
  },
  {
    value: "flat_discount",
    label: "Flat Discount",
    icon: Gift,
    color: "text-blue-600 bg-blue-100",
    description: "e.g. Rs.100 off on Rs.500+",
  },
  {
    value: "bogo",
    label: "Buy X Get Y Free",
    icon: ShoppingBag,
    color: "text-green-600 bg-green-100",
    description: "BOGO and bundle deals",
  },
  {
    value: "free_delivery",
    label: "Free Delivery",
    icon: Truck,
    color: "text-teal-600 bg-teal-100",
    description: "Free shipping on orders",
  },
  {
    value: "combo",
    label: "Combo / Bundle",
    icon: Package,
    color: "text-orange-600 bg-orange-100",
    description: "Bundle product discounts",
  },
  {
    value: "first_order",
    label: "First Order Discount",
    icon: Star,
    color: "text-pink-600 bg-pink-100",
    description: "New user acquisition",
  },
  {
    value: "cashback",
    label: "Cashback",
    icon: Award,
    color: "text-amber-600 bg-amber-100",
    description: "Cashback on purchases",
  },
  {
    value: "happy_hour",
    label: "Happy Hour",
    icon: Clock,
    color: "text-indigo-600 bg-indigo-100",
    description: "Time-based discounts",
  },
  {
    value: "category",
    label: "Category Discount",
    icon: Target,
    color: "text-red-600 bg-red-100",
    description: "Service-specific discounts",
  },
];

/* ── Campaign Form Modal ── */
const EMPTY_CAMPAIGN = {
  name: "",
  description: "",
  theme: "general",
  colorFrom: "#7C3AED",
  colorTo: "#4F46E5",
  startDate: "",
  endDate: "",
  priority: "0",
  budgetCap: "",
  status: "draft",
};

function CampaignModal({ campaign, onClose }: { campaign?: Campaign; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!campaign;

  const [form, setForm] = useState(
    campaign
      ? {
          name: campaign.name,
          description: campaign.description || "",
          theme: campaign.theme || "general",
          colorFrom: campaign.colorFrom || "#7C3AED",
          colorTo: campaign.colorTo || "#4F46E5",
          startDate: campaign.startDate ? campaign.startDate.slice(0, 16) : "",
          endDate: campaign.endDate ? campaign.endDate.slice(0, 16) : "",
          priority: String(campaign.priority ?? 0),
          budgetCap: campaign.budgetCap ? String(campaign.budgetCap) : "",
          status: campaign.status || "draft",
        }
      : { ...EMPTY_CAMPAIGN }
  );

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? adminFetch(`/promotions/campaigns/${campaign!.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : adminFetch("/promotions/campaigns", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      toast({ title: isEdit ? "Campaign updated" : "Campaign created" });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.name || !form.startDate || !form.endDate) {
      toast({ title: "Name, start date, and end date are required", variant: "destructive" });
      return;
    }
    mutation.mutate({
      name: form.name.trim(),
      description: form.description || null,
      theme: form.theme,
      colorFrom: form.colorFrom,
      colorTo: form.colorTo,
      startDate: form.startDate,
      endDate: form.endDate,
      priority: Number(form.priority) || 0,
      budgetCap: form.budgetCap ? Number(form.budgetCap) : null,
      status: form.status,
    });
  };

  const themes = [
    { value: "general", label: "General" },
    { value: "eid", label: "Eid Sale" },
    { value: "summer", label: "Summer Splash" },
    { value: "flash", label: "Flash Sale" },
    { value: "weekend", label: "Weekend Special" },
    { value: "newuser", label: "New User" },
  ];

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
            <Calendar className="h-5 w-5 text-violet-600" />
            {isEdit ? "Edit Campaign" : "New Campaign"}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
              Campaign Name *
            </label>
            <Input
              placeholder="e.g. Eid Sale 2026"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
              Description
            </label>
            <Input
              placeholder="Campaign details..."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Theme
              </label>
              <Select value={form.theme} onValueChange={(v) => set("theme", v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Status
              </label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Start Date *
              </label>
              <Input
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                End Date *
              </label>
              <Input
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Priority (0=highest)
              </label>
              <Input
                type="number"
                min={0}
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Budget Cap (Rs.)
              </label>
              <Input
                type="number"
                min={0}
                placeholder="No limit"
                value={form.budgetCap}
                onChange={(e) => set("budgetCap", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Color From
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.colorFrom}
                  onChange={(e) => set("colorFrom", e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-lg border"
                />
                <Input
                  value={form.colorFrom}
                  onChange={(e) => set("colorFrom", e.target.value)}
                  className="h-10 flex-1 rounded-xl font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Color To
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.colorTo}
                  onChange={(e) => set("colorTo", e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-lg border"
                />
                <Input
                  value={form.colorTo}
                  onChange={(e) => set("colorTo", e.target.value)}
                  className="h-10 flex-1 rounded-xl font-mono text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="flex-1 rounded-xl"
            >
              {mutation.isPending ? "Saving..." : isEdit ? "Update Campaign" : "Create Campaign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Offer Form Modal ── */
const EMPTY_OFFER = {
  name: "",
  description: "",
  type: "percentage",
  campaignId: "",
  code: "",
  discountPct: "",
  discountFlat: "",
  minOrderAmount: "",
  maxDiscount: "",
  buyQty: "",
  getQty: "",
  cashbackPct: "",
  cashbackMax: "",
  freeDelivery: false,
  stackable: false,
  usageLimit: "",
  usagePerUser: "1",
  appliesTo: "all",
  targetingRules: {
    newUsersOnly: false,
    returningUsersOnly: false,
    highValueUser: false,
  } as Record<string, unknown>,
  startDate: "",
  endDate: "",
  status: "draft",
};

function OfferModal({
  offer,
  campaigns,
  onClose,
}: {
  offer?: Offer;
  campaigns: Campaign[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!offer;

  const _selectedType =
    OFFER_TYPES.find((t) => t.value === (offer?.type || "percentage")) ?? OFFER_TYPES[0]!;
  const [step, setStep] = useState<"template" | "details">(isEdit ? "details" : "template");
  const [_selectedTypeVal, setSelectedTypeVal] = useState(offer?.type || "percentage");

  const [form, setForm] = useState(
    offer
      ? {
          name: offer.name,
          description: offer.description || "",
          type: offer.type,
          campaignId: offer.campaignId || "",
          code: offer.code || "",
          discountPct: offer.discountPct ? String(offer.discountPct) : "",
          discountFlat: offer.discountFlat ? String(offer.discountFlat) : "",
          minOrderAmount: offer.minOrderAmount ? String(offer.minOrderAmount) : "",
          maxDiscount: offer.maxDiscount ? String(offer.maxDiscount) : "",
          buyQty: offer.buyQty ? String(offer.buyQty) : "",
          getQty: offer.getQty ? String(offer.getQty) : "",
          cashbackPct: offer.cashbackPct ? String(offer.cashbackPct) : "",
          cashbackMax: offer.cashbackMax ? String(offer.cashbackMax) : "",
          freeDelivery: offer.freeDelivery || false,
          stackable: offer.stackable || false,
          usageLimit: offer.usageLimit ? String(offer.usageLimit) : "",
          usagePerUser: "1",
          appliesTo: offer.appliesTo || "all",
          targetingRules: offer.targetingRules || {},
          startDate: offer.startDate ? offer.startDate.slice(0, 16) : "",
          endDate: offer.endDate ? offer.endDate.slice(0, 16) : "",
          status: offer.status || "draft",
        }
      : { ...EMPTY_OFFER }
  );

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const setRule = (k: string, v: unknown) =>
    setForm((f) => ({ ...f, targetingRules: { ...f.targetingRules, [k]: v } }));

  const applyTemplate = (typeVal: string) => {
    const now = new Date();
    now.setSeconds(0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    const defaults: Record<string, Partial<typeof form>> = {
      percentage: { discountPct: "10", minOrderAmount: "200", usagePerUser: "1" },
      flat_discount: { discountFlat: "100", minOrderAmount: "500", usagePerUser: "1" },
      bogo: { buyQty: "2", getQty: "1", usagePerUser: "2" },
      free_delivery: { freeDelivery: true, minOrderAmount: "300", usagePerUser: "1" },
      combo: { discountPct: "15", minOrderAmount: "400", usagePerUser: "1" },
      first_order: { discountPct: "20", usagePerUser: "1", targetingRules: { newUsersOnly: true } },
      cashback: { cashbackPct: "5", cashbackMax: "200", minOrderAmount: "300", usagePerUser: "1" },
      happy_hour: { discountPct: "15", minOrderAmount: "0", usagePerUser: "2" },
      category: { discountPct: "10", minOrderAmount: "100", usagePerUser: "3" },
    };
    const d = defaults[typeVal] || {};
    setForm((f) => ({
      ...f,
      type: typeVal,
      startDate: now.toISOString().slice(0, 16),
      endDate: end.toISOString().slice(0, 16),
      ...d,
      targetingRules: { ...f.targetingRules, ...(d.targetingRules || {}) },
    }));
    setStep("details");
  };

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? adminFetch(`/promotions/offers/${offer!.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : adminFetch("/promotions/offers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-offers"] });
      void qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      toast({ title: isEdit ? "Offer updated" : "Offer created" });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.name || !form.startDate || !form.endDate) {
      toast({ title: "Name, start date, end date required", variant: "destructive" });
      return;
    }
    mutation.mutate({
      name: form.name.trim(),
      description: form.description || null,
      type: form.type,
      campaignId: form.campaignId || null,
      code: form.code || null,
      discountPct: form.discountPct ? Number(form.discountPct) : null,
      discountFlat: form.discountFlat ? Number(form.discountFlat) : null,
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : 0,
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      buyQty: form.buyQty ? Number(form.buyQty) : null,
      getQty: form.getQty ? Number(form.getQty) : null,
      cashbackPct: form.cashbackPct ? Number(form.cashbackPct) : null,
      cashbackMax: form.cashbackMax ? Number(form.cashbackMax) : null,
      freeDelivery: form.freeDelivery,
      stackable: form.stackable,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      usagePerUser: Number(form.usagePerUser) || 1,
      appliesTo: form.appliesTo,
      targetingRules: form.targetingRules,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-violet-600" />
            {isEdit
              ? "Edit Offer"
              : step === "template"
                ? "Choose Offer Template"
                : "Configure Offer"}
          </DialogTitle>
        </DialogHeader>

        {step === "template" && !isEdit ? (
          <div className="mt-3">
            <p className="text-muted-foreground mb-4 text-sm">
              Select a template to get started with smart defaults
            </p>
            <div className="grid grid-cols-1 gap-2">
              {OFFER_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => {
                      setSelectedTypeVal(t.value);
                      applyTemplate(t.value);
                    }}
                    className="border-border group flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-violet-300 hover:bg-violet-50"
                  >
                    <div
                      className={`h-9 w-9 rounded-lg ${t.color} flex shrink-0 items-center justify-center`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="text-muted-foreground text-xs">{t.description}</p>
                    </div>
                    <ChevronRight className="text-muted-foreground h-4 w-4 transition-colors group-hover:text-violet-600" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-4">
            {!isEdit && (
              <button
                onClick={() => setStep("template")}
                className="flex items-center gap-1 text-xs text-violet-600 hover:underline"
              >
                ← Change template
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Offer Name *
                </label>
                <Input
                  placeholder="e.g. Eid 20% Off on Grocery"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="col-span-2">
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Description
                </label>
                <Input
                  placeholder="Short description..."
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Type
                </label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Promo Code
                </label>
                <Input
                  placeholder="Optional code"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  className="h-11 rounded-xl font-mono font-bold tracking-widest"
                />
              </div>
            </div>

            {/* Discount fields based on type */}
            {(form.type === "percentage" ||
              form.type === "category" ||
              form.type === "first_order" ||
              form.type === "happy_hour" ||
              form.type === "combo") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                    Discount % *
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="10"
                    value={form.discountPct}
                    onChange={(e) => set("discountPct", e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                    Max Discount (Rs.)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="No cap"
                    value={form.maxDiscount}
                    onChange={(e) => set("maxDiscount", e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            )}
            {form.type === "flat_discount" && (
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Flat Discount Amount (Rs.) *
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="100"
                  value={form.discountFlat}
                  onChange={(e) => set("discountFlat", e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
            )}
            {form.type === "bogo" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                    Buy Qty *
                  </label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="2"
                    value={form.buyQty}
                    onChange={(e) => set("buyQty", e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                    Get Qty Free *
                  </label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="1"
                    value={form.getQty}
                    onChange={(e) => set("getQty", e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            )}
            {form.type === "cashback" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                    Cashback % *
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="5"
                    value={form.cashbackPct}
                    onChange={(e) => set("cashbackPct", e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                    Max Cashback (Rs.)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="No cap"
                    value={form.cashbackMax}
                    onChange={(e) => set("cashbackMax", e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Min Order (Rs.)
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.minOrderAmount}
                  onChange={(e) => set("minOrderAmount", e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Usage Limit
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={form.usageLimit}
                  onChange={(e) => set("usageLimit", e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Per User Limit
                </label>
                <Input
                  type="number"
                  min={1}
                  placeholder="1"
                  value={form.usagePerUser}
                  onChange={(e) => set("usagePerUser", e.target.value)}
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
                    <SelectItem value="ride">Rides</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Start Date *
                </label>
                <Input
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  End Date *
                </label>
                <Input
                  type="datetime-local"
                  value={form.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            {campaigns.length > 0 && (
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                  Campaign (optional)
                </label>
                <Select
                  value={form.campaignId || "none"}
                  onValueChange={(v) => set("campaignId", v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Campaign</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Targeting */}
            <div className="bg-muted/30 space-y-3 rounded-xl p-4">
              <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
                Targeting Rules
              </p>
              {[
                { key: "newUsersOnly", label: "New Users Only", desc: "First-time customers only" },
                {
                  key: "returningUsersOnly",
                  label: "Returning Users Only",
                  desc: "Users with previous orders",
                },
                {
                  key: "highValueUser",
                  label: "High Value Users",
                  desc: "Users who spent Rs.5000+",
                },
              ].map((rule) => (
                <div key={rule.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{rule.label}</p>
                    <p className="text-muted-foreground text-xs">{rule.desc}</p>
                  </div>
                  <button onClick={() => setRule(rule.key, !form.targetingRules[rule.key])}>
                    {form.targetingRules[rule.key] ? (
                      <ToggleRight className="h-7 w-7 text-violet-600" />
                    ) : (
                      <ToggleLeft className="text-muted-foreground h-7 w-7" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Stacking */}
            <div className="bg-muted/30 flex items-center justify-between rounded-xl p-3">
              <div>
                <p className="text-sm font-semibold">Stackable</p>
                <p className="text-muted-foreground text-xs">Can combine with other offers</p>
              </div>
              <button onClick={() => set("stackable", !form.stackable)}>
                {form.stackable ? (
                  <ToggleRight className="h-7 w-7 text-violet-600" />
                ) : (
                  <ToggleLeft className="text-muted-foreground h-7 w-7" />
                )}
              </button>
            </div>

            {/* Free Delivery */}
            {form.type !== "free_delivery" && (
              <div className="bg-muted/30 flex items-center justify-between rounded-xl p-3">
                <div>
                  <p className="text-sm font-semibold">Include Free Delivery</p>
                  <p className="text-muted-foreground text-xs">Also waive delivery fee</p>
                </div>
                <button onClick={() => set("freeDelivery", !form.freeDelivery)}>
                  {form.freeDelivery ? (
                    <ToggleRight className="h-7 w-7 text-violet-600" />
                  ) : (
                    <ToggleLeft className="text-muted-foreground h-7 w-7" />
                  )}
                </button>
              </div>
            )}

            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
                Status
              </label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={mutation.isPending}
                className="flex-1 rounded-xl"
              >
                {mutation.isPending ? "Saving..." : isEdit ? "Update Offer" : "Create Offer"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── AI Recommendations Panel ── */
function AIRecommendationsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-promotions-ai"],
    queryFn: () => adminFetch("/promotions/ai-recommendations"),
  });

  interface AiRecommendation {
    id: string;
    type: string;
    title: string;
    description: string;
    impact: string;
    suggestedDiscount?: number;
    targetService?: string;
    suggestedTimes?: number[];
  }
  const recommendations: AiRecommendation[] = data?.recommendations ?? [];
  const impactColors: Record<string, string> = {
    high: "text-red-600 bg-red-50 border-red-200",
    medium: "text-amber-600 bg-amber-50 border-amber-200",
    low: "text-green-600 bg-green-50 border-green-200",
  };

  if (isLoading)
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-20 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  if (recommendations.length === 0)
    return (
      <div className="text-muted-foreground py-8 text-center">
        <Sparkles className="mx-auto mb-2 h-8 w-8 opacity-30" />
        <p className="text-sm">No recommendations yet. Add some order data first.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      {recommendations.map((rec) => {
        const typeConf = OFFER_TYPES.find((t) => t.value === rec.type) ?? OFFER_TYPES[0]!;
        const Icon = typeConf.icon;
        return (
          <div
            key={rec.id}
            className="flex items-start gap-3 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 p-4"
          >
            <div
              className={`h-9 w-9 rounded-lg ${typeConf.color} flex shrink-0 items-center justify-center`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">{rec.title}</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${impactColors[rec.impact] ?? impactColors.medium}`}
                >
                  {rec.impact?.toUpperCase()} IMPACT
                </span>
              </div>
              <p className="text-muted-foreground text-xs">{rec.description}</p>
              {rec.suggestedDiscount && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
                  <Lightbulb className="h-3 w-3" /> Suggested: {rec.suggestedDiscount}% discount
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Analytics Overview ── */
function AnalyticsOverview() {
  const { data } = useQuery({
    queryKey: ["admin-promotions-analytics"],
    queryFn: () => adminFetch("/promotions/analytics"),
  });

  const totals = data?.totals ?? {};
  interface TopOffer {
    offerId: string;
    redemptions: number;
    discountGiven: number;
    offer: { id: string; name: string; type: string } | null;
  }
  const topOffers: TopOffer[] = data?.topOffers ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Total Redemptions",
            value: String(totals.redemptions ?? 0),
            color: "text-violet-700 bg-violet-50",
          },
          {
            label: "Discount Given",
            value: `Rs. ${Math.round(totals.discountGiven ?? 0)}`,
            color: "text-red-700 bg-red-50",
          },
          {
            label: "Active Campaigns",
            value: String(data?.activeCampaigns ?? 0),
            color: "text-blue-700 bg-blue-50",
          },
          {
            label: "Active Offers",
            value: String(data?.activeOffers ?? 0),
            color: "text-green-700 bg-green-50",
          },
        ].map((s, i) => (
          <Card key={i} className="border-border/50 rounded-xl">
            <CardContent className="p-3">
              <p className="text-muted-foreground mb-1 text-[10px] font-medium">{s.label}</p>
              <p className={`text-xl font-extrabold ${s.color.split(" ")[0]}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {topOffers.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-bold tracking-wide uppercase">
            Top Performing Offers
          </p>
          <div className="space-y-2">
            {topOffers.map((o: TopOffer, i: number) => (
              <div key={o.offerId} className="bg-muted/30 flex items-center gap-3 rounded-xl p-3">
                <span className="text-muted-foreground w-6 text-center text-lg font-extrabold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{o.offer?.name ?? o.offerId}</p>
                  <p className="text-muted-foreground text-xs">
                    {o.redemptions} redemptions · Rs. {Math.round(o.discountGiven)} given
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════ Main Page ══════════ */
type TabType = "campaigns" | "offers" | "analytics" | "ai";

export default function PromotionsHub() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("offers");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [editOffer, setEditOffer] = useState<Offer | null>(null);
  const [selectedOffers, setSelectedOffers] = useState<Set<string>>(new Set());

  const {
    data: campaignsData,
    isLoading: campaignsLoading,
    refetch: refetchCampaigns,
  } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => adminFetch("/promotions/campaigns"),
    refetchInterval: 30000,
  });

  const {
    data: offersData,
    isLoading: offersLoading,
    refetch: refetchOffers,
  } = useQuery({
    queryKey: ["admin-offers"],
    queryFn: () => adminFetch("/promotions/offers"),
    refetchInterval: 30000,
  });

  const { data: pendingData } = useQuery({
    queryKey: ["admin-offers-pending"],
    queryFn: () => adminFetch("/promotions/offers/pending"),
    refetchInterval: 30000,
  });

  const campaigns: Campaign[] = campaignsData?.campaigns ?? [];
  const offers: Offer[] = offersData?.offers ?? [];
  const pendingOffers: Offer[] = pendingData?.offers ?? [];

  const filteredOffers = offers.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch =
      o.name.toLowerCase().includes(q) ||
      (o.code || "").toLowerCase().includes(q) ||
      (o.description || "").toLowerCase().includes(q);
    const matchType = typeFilter === "all" || o.type === typeFilter;
    const matchStatus = statusFilter === "all" || o.computedStatus === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const filteredCampaigns = campaigns.filter(
    (c) => search === "" || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => adminFetch(`/promotions/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      toast({ title: "Campaign deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const deleteOffer = useMutation({
    mutationFn: (id: string) => adminFetch(`/promotions/offers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-offers"] });
      toast({ title: "Offer deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const cloneOffer = useMutation({
    mutationFn: (id: string) => adminFetch(`/promotions/offers/${id}/clone`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-offers"] });
      toast({ title: "Offer cloned" });
    },
    onError: (e: Error) =>
      toast({ title: "Clone failed", description: e.message, variant: "destructive" }),
  });

  const approveOffer = useMutation({
    mutationFn: (id: string) => adminFetch(`/promotions/offers/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-offers"] });
      void qc.invalidateQueries({ queryKey: ["admin-offers-pending"] });
      toast({ title: "Offer approved" });
    },
    onError: (e: Error) =>
      toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
  });

  const rejectOffer = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminFetch(`/promotions/offers/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-offers"] });
      void qc.invalidateQueries({ queryKey: ["admin-offers-pending"] });
      toast({ title: "Offer rejected" });
    },
    onError: (e: Error) =>
      toast({ title: "Rejection failed", description: e.message, variant: "destructive" }),
  });

  const submitForApproval = useMutation({
    mutationFn: (id: string) => adminFetch(`/promotions/offers/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-offers"] });
      void qc.invalidateQueries({ queryKey: ["admin-offers-pending"] });
      toast({ title: "Offer submitted for approval" });
    },
    onError: (e: Error) =>
      toast({ title: "Submission failed", description: e.message, variant: "destructive" }),
  });

  const bulkAction = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: string }) =>
      adminFetch("/promotions/offers/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, action }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-offers"] });
      setSelectedOffers(new Set());
      toast({ title: "Bulk action completed" });
    },
  });

  const toggleSelectOffer = (id: string) => {
    setSelectedOffers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const liveOffers = offers.filter((o) => o.computedStatus === "live").length;
  const liveCampaigns = campaigns.filter((c) => c.computedStatus === "live").length;

  const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
    { key: "offers", label: "Offers", icon: Tag },
    { key: "campaigns", label: "Campaigns", icon: Calendar },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
    { key: "ai", label: "AI Insights", icon: Sparkles },
  ];

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Promotions Hub page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Megaphone}
          title="Promotions Hub"
          subtitle={`${liveCampaigns} live campaigns · ${liveOffers} live offers`}
          iconBgClass="bg-violet-100"
          iconColorClass="text-violet-600"
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refetchCampaigns();
                  void refetchOffers();
                }}
                className="h-9 gap-2 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {activeTab === "campaigns" ? (
                <Button
                  size="sm"
                  onClick={() => setShowCampaignModal(true)}
                  className="h-9 gap-2 rounded-xl"
                >
                  <Plus className="h-4 w-4" /> New Campaign
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setShowOfferModal(true)}
                  className="h-9 gap-2 rounded-xl"
                >
                  <Plus className="h-4 w-4" /> New Offer
                </Button>
              )}
            </div>
          }
        />

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: "Total Offers",
              value: String(offers.length),
              color: "bg-violet-100 text-violet-700",
            },
            {
              label: "Live Offers",
              value: String(liveOffers),
              color: "bg-green-100 text-green-700",
            },
            {
              label: "Campaigns",
              value: String(campaigns.length),
              color: "bg-blue-100 text-blue-700",
            },
            {
              label: "Live Campaigns",
              value: String(liveCampaigns),
              color: "bg-amber-100 text-amber-700",
            },
          ].map((s, i) => (
            <Card key={i} className="border-border/50 rounded-2xl shadow-sm">
              <CardContent className="p-4">
                <p className="text-muted-foreground mb-1 text-xs font-medium">{s.label}</p>
                <p className={`text-2xl font-extrabold ${s.color.split(" ")[0]}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-muted/30 flex gap-1 rounded-xl p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab: Offers ── */}
        {activeTab === "offers" && (
          <div className="space-y-4">
            {/* Approval Queue — visible only when pending offers exist */}
            {pendingOffers.length > 0 && (
              <Card className="rounded-2xl border-orange-200 bg-orange-50">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <p className="text-sm font-bold text-orange-800">
                      Approval Queue ({pendingOffers.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {pendingOffers.map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center gap-3 rounded-xl border border-orange-100 bg-white p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{o.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {o.type} · {o.code || "no code"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 rounded-lg bg-green-600 text-xs hover:bg-green-700"
                            onClick={() => approveOffer.mutate(o.id)}
                            disabled={approveOffer.isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50"
                            onClick={() =>
                              rejectOffer.mutate({ id: o.id, reason: "Rejected by admin" })
                            }
                            disabled={rejectOffer.isPending}
                          >
                            <XCircle className="mr-1 h-3 w-3" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filters */}
            <Card className="border-border/50 rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    placeholder="Search offers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-muted/30 h-11 rounded-xl pl-9"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-muted/30 h-11 w-full rounded-xl sm:w-44">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {OFFER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-muted/30 h-11 w-full rounded-xl sm:w-40">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "all",
                      "draft",
                      "pending_approval",
                      "scheduled",
                      "live",
                      "paused",
                      "expired",
                      "exhausted",
                      "rejected",
                    ].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === "all"
                          ? "All Status"
                          : s === "pending_approval"
                            ? "Pending Approval"
                            : s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* Bulk actions */}
            {selectedOffers.size > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                <span className="text-sm font-semibold text-violet-800">
                  {selectedOffers.size} selected
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 rounded-lg text-xs"
                    onClick={() =>
                      bulkAction.mutate({ ids: Array.from(selectedOffers), action: "activate" })
                    }
                  >
                    <Play className="h-3 w-3" /> Activate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 rounded-lg text-xs"
                    onClick={() =>
                      bulkAction.mutate({ ids: Array.from(selectedOffers), action: "pause" })
                    }
                  >
                    <Pause className="h-3 w-3" /> Pause
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-8 rounded-lg text-xs"
                  onClick={() => setSelectedOffers(new Set())}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Offers list */}
            {offersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted h-20 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : filteredOffers.length === 0 ? (
              <Card className="border-border/50 rounded-2xl">
                <CardContent className="p-12 text-center">
                  <Tag className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
                  <p className="text-muted-foreground font-medium">No offers found</p>
                  <Button
                    size="sm"
                    className="mt-4 rounded-xl"
                    onClick={() => setShowOfferModal(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Create First Offer
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredOffers.map((offer) => {
                  const typeConf =
                    OFFER_TYPES.find((t) => t.value === offer.type) ?? OFFER_TYPES[0]!;
                  const Icon = typeConf.icon;
                  const isSelected = selectedOffers.has(offer.id);
                  return (
                    <Card
                      key={offer.id}
                      className={`border-border/50 rounded-2xl shadow-sm transition-all hover:shadow-md ${isSelected ? "border-violet-300 bg-violet-50/30" : ""}`}
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOffer(offer.id)}
                            className="mt-1 rounded"
                          />
                          <div
                            className={`h-10 w-10 rounded-xl ${typeConf.color} flex shrink-0 items-center justify-center`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold">{offer.name}</span>
                              <StatusBadge status={offer.computedStatus} />
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {typeConf.label}
                              </Badge>
                              {offer.code && (
                                <span className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-700">
                                  {offer.code}
                                </span>
                              )}
                            </div>
                            {offer.description && (
                              <p className="text-muted-foreground mb-1 text-xs">
                                {offer.description}
                              </p>
                            )}
                            <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                              {offer.discountPct && (
                                <span className="inline-flex items-center gap-1 font-semibold text-green-700">
                                  <Tag className="h-3 w-3" /> {offer.discountPct}% off
                                </span>
                              )}
                              {offer.discountFlat && (
                                <span className="inline-flex items-center gap-1 font-semibold text-green-700">
                                  <Tag className="h-3 w-3" /> Rs.{offer.discountFlat} off
                                </span>
                              )}
                              {offer.cashbackPct && (
                                <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                                  <Wallet className="h-3 w-3" /> {offer.cashbackPct}% cashback
                                </span>
                              )}
                              {offer.freeDelivery && (
                                <span className="inline-flex items-center gap-1 font-semibold text-teal-700">
                                  <Truck className="h-3 w-3" /> Free Delivery
                                </span>
                              )}
                              {offer.buyQty && (
                                <span>
                                  Buy {offer.buyQty} Get {offer.getQty}
                                </span>
                              )}
                              {offer.minOrderAmount > 0 && (
                                <span>Min: Rs.{offer.minOrderAmount}</span>
                              )}
                              <span>
                                Used: {offer.usedCount}
                                {offer.usageLimit ? `/${offer.usageLimit}` : ""}
                              </span>
                              <span className="capitalize">{offer.appliesTo}</span>
                              {offer.endDate && <span>Ends: {formatDate(offer.endDate)}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {offer.computedStatus === "draft" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg border-orange-300 px-2 text-xs text-orange-700 hover:bg-orange-50"
                                title="Submit for Approval"
                                onClick={() => submitForApproval.mutate(offer.id)}
                                disabled={submitForApproval.isPending}
                              >
                                <Send className="mr-1 h-3 w-3" /> Submit
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 rounded-lg p-0"
                              title="Clone"
                              onClick={() => cloneOffer.mutate(offer.id)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 rounded-lg p-0"
                              title="Edit"
                              onClick={() => setEditOffer(offer)}
                            >
                              <Pencil className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 rounded-lg p-0 text-red-500 hover:bg-red-50"
                              title="Delete"
                              onClick={() => {
                                if (confirm("Delete this offer?")) deleteOffer.mutate(offer.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Campaigns ── */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search campaigns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-muted/30 h-11 rounded-xl pl-9"
              />
            </div>

            {campaignsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted h-24 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <Card className="border-border/50 rounded-2xl">
                <CardContent className="p-12 text-center">
                  <Calendar className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
                  <p className="text-muted-foreground font-medium">No campaigns found</p>
                  <Button
                    size="sm"
                    className="mt-4 rounded-xl"
                    onClick={() => setShowCampaignModal(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredCampaigns.map((c) => (
                  <Card
                    key={c.id}
                    className="border-border/50 overflow-hidden rounded-2xl shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div
                      className="h-2"
                      style={{ background: `linear-gradient(90deg, ${c.colorFrom}, ${c.colorTo})` }}
                    />
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="font-bold">{c.name}</span>
                            <StatusBadge status={c.computedStatus} />
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {c.theme}
                            </Badge>
                          </div>
                          {c.description && (
                            <p className="text-muted-foreground mb-1 text-xs">{c.description}</p>
                          )}
                          <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                            <span className="inline-flex items-center gap-1">
                              <ClipboardList className="h-3 w-3" /> {c.offerCount} offers
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Target className="h-3 w-3" /> Priority {c.priority}
                            </span>
                            {c.budgetCap && (
                              <span className="inline-flex items-center gap-1">
                                <Wallet className="h-3 w-3" /> Budget: Rs.{c.budgetCap}
                              </span>
                            )}
                            <span>
                              {formatDate(c.startDate)} → {formatDate(c.endDate)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg p-0"
                            onClick={() => setEditCampaign(c)}
                          >
                            <Pencil className="h-3.5 w-3.5 text-blue-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg p-0 text-red-500 hover:bg-red-50"
                            onClick={() => {
                              if (confirm(`Delete campaign "${c.name}"?`))
                                deleteCampaign.mutate(c.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Analytics ── */}
        {activeTab === "analytics" && (
          <Card className="border-border/50 rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <div className="mb-5 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-violet-600" />
                <h2 className="text-lg font-bold">Promotions Analytics</h2>
              </div>
              <AnalyticsOverview />
            </CardContent>
          </Card>
        )}

        {/* ── Tab: AI Insights ── */}
        {activeTab === "ai" && (
          <Card className="border-border/50 rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" />
                <h2 className="text-lg font-bold">AI-Powered Recommendations</h2>
              </div>
              <p className="text-muted-foreground mb-5 text-sm">
                Suggestions based on your order patterns and sales data
              </p>
              <AIRecommendationsPanel />
            </CardContent>
          </Card>
        )}

        {/* Modals */}
        {(showCampaignModal || editCampaign) && (
          <CampaignModal
            campaign={editCampaign ?? undefined}
            onClose={() => {
              setShowCampaignModal(false);
              setEditCampaign(null);
            }}
          />
        )}
        {(showOfferModal || editOffer) && (
          <OfferModal
            offer={editOffer ?? undefined}
            campaigns={campaigns}
            onClose={() => {
              setShowOfferModal(false);
              setEditOffer(null);
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
