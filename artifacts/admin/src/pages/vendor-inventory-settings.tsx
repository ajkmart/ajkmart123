import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/LoadingState";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { ADMIN_I18N_KEYS, t } from "@/lib/i18nKeys";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Vendor Inventory Settings — admin surface for vendor-side inventory
 * automation. Closes the "Inventory Management Issues" deferral.
 *
 * Backend contract (documented in `bugs.md`):
 *
 *   GET /api/admin/inventory-settings
 *     → {
 *         globalLowStockThreshold: number,         // default 5
 *         globalMaxQuantityPerOrder: number,       // default 50
 *         autoDisableOnZeroStock: boolean,         // default true
 *         backInStockNotifyEnabled: boolean,       // default true
 *         backInStockNotifyChannels: ("email"|"sms"|"push")[],
 *       }
 *
 *   PUT /api/admin/inventory-settings
 *     Body: same shape as GET. Validates each field server-side and
 *     persists to the `system_settings` table under the `inventory.*`
 *     namespace. Vendors may override the global defaults per product
 *     via the existing `products.lowStockThreshold` /
 *     `products.maxQuantityPerOrder` columns; nullable means "use
 *     global default".
 *
 *   When `autoDisableOnZeroStock=true` the API server marks any product
 *   with `stock=0` as `isActive=false` on order completion. When
 *   `backInStockNotifyEnabled=true` the API server enqueues a
 *   notification (channel set: `backInStockNotifyChannels`) to every
 *   user that wishlisted the product whenever stock crosses 0 → >0.
 */

interface InventorySettings {
  globalLowStockThreshold: number;
  globalMaxQuantityPerOrder: number;
  autoDisableOnZeroStock: boolean;
  backInStockNotifyEnabled: boolean;
  backInStockNotifyChannels: Array<"email" | "sms" | "push">;
}

const DEFAULTS: InventorySettings = {
  globalLowStockThreshold: 5,
  globalMaxQuantityPerOrder: 50,
  autoDisableOnZeroStock: true,
  backInStockNotifyEnabled: true,
  backInStockNotifyChannels: ["email", "push"],
};

export default function VendorInventorySettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<InventorySettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const q = useQuery<InventorySettings>({
    queryKey: ["admin", "inventory-settings"],
    queryFn: () => adminFetch("/inventory-settings") as Promise<InventorySettings>,
    retry: false,
  });

  useEffect(() => {
    if (q.data) setSettings({ ...DEFAULTS, ...q.data });
  }, [q.data]);

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/inventory-settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      toast({ title: "Saved", description: "Inventory settings updated." });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (q.isLoading) {
    return <LoadingState label="Loading inventory settings…" variant="page" />;
  }

  if (q.isError && !q.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageHeader
          icon={Package}
          title={t(ADMIN_I18N_KEYS.vendor.inventoryTitle, "Vendor Inventory Settings")}
          subtitle="Global defaults for stock thresholds and back-in-stock notifications. Vendors can override per product."
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
        />
        <ErrorState
          title="Could not load inventory settings"
          error={q.error as Error}
          onRetry={() => q.refetch()}
          variant="card"
        />
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Vendor Inventory Settings page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageHeader
          icon={Package}
          title={t(ADMIN_I18N_KEYS.vendor.inventoryTitle, "Vendor Inventory Settings")}
          subtitle="Global defaults for stock thresholds and back-in-stock notifications. Vendors can override per product."
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
        />

        {q.isError && (
          <ErrorState
            title="Could not load inventory settings"
            error={q.error as Error}
            onRetry={() => q.refetch()}
            variant="card"
          />
        )}

        <Card className="space-y-4 p-5">
          <div className="grid gap-2">
            <Label htmlFor="lst">Low-stock threshold (units)</Label>
            <Input
              id="lst"
              type="number"
              min={0}
              value={settings.globalLowStockThreshold}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  globalLowStockThreshold: Math.max(0, Number(e.target.value) || 0),
                }))
              }
            />
            <p className="text-xs text-gray-500">
              Vendors get a low-stock alert when remaining quantity falls at or below this value.
              Per-product overrides take precedence.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mqp">Max quantity per order</Label>
            <Input
              id="mqp"
              type="number"
              min={1}
              value={settings.globalMaxQuantityPerOrder}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  globalMaxQuantityPerOrder: Math.max(1, Number(e.target.value) || 1),
                }))
              }
            />
            <p className="text-xs text-gray-500">
              Hard cap enforced at checkout; prevents inventory wipeouts from a single order.
            </p>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="auto-disable" className="font-semibold">
                Auto-disable products at zero stock
              </Label>
              <p className="mt-1 text-xs text-gray-500">
                Marks a product inactive automatically when stock hits zero. Re-enabled by the
                vendor when stock is restocked.
              </p>
            </div>
            <Switch
              id="auto-disable"
              checked={settings.autoDisableOnZeroStock}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, autoDisableOnZeroStock: v }))}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="bis-toggle" className="font-semibold">
                Back-in-stock notifications
              </Label>
              <p className="mt-1 text-xs text-gray-500">
                Notify wishlisters when a product transitions from out of stock to in stock.
              </p>
            </div>
            <Switch
              id="bis-toggle"
              checked={settings.backInStockNotifyEnabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, backInStockNotifyEnabled: v }))}
            />
          </div>
          {settings.backInStockNotifyEnabled && (
            <div className="grid gap-2">
              <Label>Notification channels</Label>
              <div className="flex flex-wrap gap-2">
                {(["email", "sms", "push"] as const).map((ch) => {
                  const active = settings.backInStockNotifyChannels.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          backInStockNotifyChannels: active
                            ? s.backInStockNotifyChannels.filter((x) => x !== ch)
                            : [...s.backInStockNotifyChannels, ch],
                        }))
                      }
                      aria-pressed={active}
                      className={`admin-transition rounded-full border px-3 py-1 text-sm capitalize ${
                        active
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-gray-300 bg-white text-gray-700"
                      }`}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <div className="flex justify-end">
          <SubmitButton isSubmitting={saving} loadingText="Saving…" onClick={save}>
            Save Settings
          </SubmitButton>
        </div>
      </div>
    </ErrorBoundary>
  );
}
