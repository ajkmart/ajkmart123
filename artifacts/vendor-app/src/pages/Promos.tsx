import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import { apiFetch } from "../lib/api";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL, SELECT, errMsg, fc } from "../lib/ui";
import { formatDateTz, useCurrency, usePlatformConfig } from "../lib/useConfig";

const EMPTY_PROMO = {
  title: "",
  code: "",
  discountType: "percentage" as "percentage" | "fixed",
  discountValue: "",
  minOrder: "",
  maxUses: "",
  expiresAt: "",
};

export default function Promos() {
  const qc = useQueryClient();
  const { symbol: currencySymbol } = useCurrency();
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone ?? "Asia/Karachi";
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_PROMO });
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );
  const showToast = (m: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  };
  const f = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vendor-promos"],
    queryFn: () => apiFetch("/vendors/promos"),
    retry: 2,
  });

  const _promosRaw = data?.promos ?? data;
  const promos: any[] = Array.isArray(_promosRaw) ? _promosRaw : [];

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch("/vendors/promos", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          code: form.code.trim().toUpperCase(),
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minOrder: form.minOrder ? Number(form.minOrder) : null,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-promos"] });
      setShowAdd(false);
      setForm({ ...EMPTY_PROMO });
      showToast("✅ Promo created!");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/vendors/promos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-promos"] });
      showToast("🗑️ Promo deleted");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const validate = () => {
    if (!form.title.trim()) {
      showToast("❌ Title required");
      return false;
    }
    if (!form.code.trim()) {
      showToast("❌ Promo code required");
      return false;
    }
    if (
      !form.discountValue ||
      Number.isNaN(Number(form.discountValue)) ||
      Number(form.discountValue) <= 0
    ) {
      showToast("❌ Valid discount value required");
      return false;
    }
    if (form.discountType === "percentage" && Number(form.discountValue) > 100) {
      showToast("❌ Percentage cannot exceed 100");
      return false;
    }
    return true;
  };

  return (
    <PullToRefresh
      onRefresh={async () => {
        await refetch();
      }}
    >
      <div className="space-y-4 px-4 pt-4 pb-6">
        <PageHeader
          title="Promotions"
          subtitle={`${promos.length} active promo${promos.length !== 1 ? "s" : ""}`}
          actions={
            <button
              onClick={() => setShowAdd(!showAdd)}
              className={BTN_PRIMARY + " h-9 px-4 text-sm"}
            >
              {showAdd ? "Cancel" : "+ New Promo"}
            </button>
          }
        />

        {/* Add form */}
        {showAdd && (
          <div className={`${CARD} space-y-4`}>
            <h3 className="text-sm font-extrabold text-gray-800">Create Promotion</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => f("title", e.target.value)}
                  placeholder="Eid Sale 20% Off"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Promo Code *</label>
                <input
                  value={form.code}
                  onChange={(e) => f("code", e.target.value.toUpperCase())}
                  placeholder="EID20"
                  className={INPUT + " font-mono uppercase"}
                />
              </div>
              <div>
                <label className={LABEL}>Discount Type *</label>
                <select
                  value={form.discountType}
                  onChange={(e) => f("discountType", e.target.value)}
                  className={SELECT}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount ({currencySymbol})</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Discount Value *</label>
                <input
                  type="number"
                  min="0"
                  value={form.discountValue}
                  onChange={(e) => f("discountValue", e.target.value)}
                  placeholder={form.discountType === "percentage" ? "20" : "50"}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Minimum Order ({currencySymbol})</label>
                <input
                  type="number"
                  min="0"
                  value={form.minOrder}
                  onChange={(e) => f("minOrder", e.target.value)}
                  placeholder="Optional"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Max Uses</label>
                <input
                  type="number"
                  min="1"
                  value={form.maxUses}
                  onChange={(e) => f("maxUses", e.target.value)}
                  placeholder="Unlimited"
                  className={INPUT}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Expires At</label>
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => f("expiresAt", e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setForm({ ...EMPTY_PROMO });
                }}
                className={BTN_SECONDARY + " h-11 flex-1"}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (validate()) createMut.mutate();
                }}
                disabled={createMut.isPending}
                className={BTN_PRIMARY + " h-11 flex-1"}
              >
                {createMut.isPending ? "Creating..." : "Create Promo"}
              </button>
            </div>
          </div>
        )}

        {/* Promos list */}
        {isLoading ? (
          <div className={`${CARD} flex h-32 items-center justify-center text-sm text-gray-400`}>
            Loading promotions...
          </div>
        ) : isError ? (
          <div className={CARD}>
            <ErrorState onRetry={() => refetch()} />
          </div>
        ) : promos.length === 0 ? (
          <div className={`${CARD} flex h-40 flex-col items-center justify-center text-center`}>
            <span className="mb-3 text-4xl">🏷️</span>
            <p className="font-bold text-gray-700">No promotions yet</p>
            <p className="mt-1 text-xs text-gray-400">Create your first promo code above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {promos.map((promo: any) => {
              const expired = promo.expiresAt && new Date(promo.expiresAt) < new Date();
              return (
                <div key={promo.id} className={`${CARD} flex items-start gap-3`}>
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-lg">
                    🏷️
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold text-gray-800">{promo.title}</p>
                      <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-orange-700">
                        {promo.code}
                      </span>
                      {expired && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                          Expired
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {promo.discountType === "percentage"
                        ? `${promo.discountValue}% off`
                        : `${fc(promo.discountValue, currencySymbol)} off`}
                      {promo.minOrder ? ` · Min order ${fc(promo.minOrder, currencySymbol)}` : ""}
                      {promo.maxUses ? ` · Max ${promo.maxUses} uses` : ""}
                    </p>
                    {promo.expiresAt && (
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        Expires:{" "}
                        {formatDateTz(
                          promo.expiresAt,
                          { day: "numeric", month: "short", year: "numeric" },
                          tz
                        )}
                      </p>
                    )}
                    {promo.usedCount != null && (
                      <p className="text-[10px] text-gray-400">
                        Used {promo.usedCount} time{promo.usedCount !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Delete this promo?")) deleteMut.mutate(promo.id);
                    }}
                    disabled={deleteMut.isPending}
                    className="mt-1 flex-shrink-0 text-xs font-bold text-red-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-24 left-1/2 z-50 max-w-xs -translate-x-1/2 rounded-2xl bg-gray-800 px-5 py-3 text-center text-sm font-semibold text-white shadow-xl">
            {toast}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
