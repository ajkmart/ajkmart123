import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import { apiFetch } from "../lib/api";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, errMsg, fc } from "../lib/ui";
import { formatDateTz, useCurrency, usePlatformConfig } from "../lib/useConfig";

type Participation = {
  id: string;
  campaignId: string;
  vendorId: string;
  status: string;
  notes?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  description?: string;
  theme: string;
  colorFrom: string;
  colorTo: string;
  status: string;
  startDate: string;
  endDate: string;
  budgetCap?: number;
  maxParticipatingVendors?: number;
  participation?: Participation | null;
};

const STATUS_COLORS: Record<string, string> = {
  live: "bg-green-100 text-green-700",
  draft: "bg-gray-100 text-gray-600",
  ended: "bg-red-100 text-red-600",
  paused: "bg-yellow-100 text-yellow-700",
  pending: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

const THEME_EMOJIS: Record<string, string> = {
  flash: "⚡",
  festival: "🎉",
  seasonal: "🌿",
  clearance: "🏷️",
  loyalty: "💎",
  weekend: "📅",
  newuser: "⭐",
  cashback: "💰",
};

function CampaignCard({
  campaign,
  onJoin,
  onWithdraw,
  joining,
  withdrawing,
  currencySymbol,
  tz,
}: {
  campaign: Campaign;
  onJoin: (id: string) => void;
  onWithdraw: (participationId: string) => void;
  joining: boolean;
  withdrawing: boolean;
  currencySymbol: string;
  tz: string;
}) {
  const endDate = new Date(campaign.endDate);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000));
  const participation = campaign.participation;
  const emoji = THEME_EMOJIS[campaign.theme] ?? "🎯";

  return (
    <div className={`${CARD} space-y-3`}>
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-xl shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${campaign.colorFrom || "#7C3AED"}, ${campaign.colorTo || "#4F46E5"})`,
          }}
        >
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">{campaign.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[campaign.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </span>
          </div>
          {campaign.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{campaign.description}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
          <p className="text-xs text-gray-500">Ends In</p>
          <p className="text-sm font-bold text-gray-800">{daysLeft}d</p>
        </div>
        {campaign.budgetCap && (
          <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
            <p className="text-xs text-gray-500">Budget</p>
            <p className="text-sm font-bold text-gray-800">
              {currencySymbol}
              {campaign.budgetCap.toLocaleString()}
            </p>
          </div>
        )}
        {campaign.maxParticipatingVendors && (
          <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
            <p className="text-xs text-gray-500">Max Vendors</p>
            <p className="text-sm font-bold text-gray-800">{campaign.maxParticipatingVendors}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {formatDateTz(campaign.startDate, { day: "numeric", month: "short", year: "numeric" }, tz)}{" "}
        — {formatDateTz(campaign.endDate, { day: "numeric", month: "short", year: "numeric" }, tz)}
      </p>

      {participation ? (
        <div className="flex items-center gap-2">
          <div
            className={`flex-1 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold ${STATUS_COLORS[participation.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {participation.status === "pending"
              ? "⏳ Pending Admin Approval"
              : participation.status === "approved"
                ? "✅ Participating"
                : participation.status === "rejected"
                  ? "❌ Not Approved"
                  : participation.status}
          </div>
          {participation.status === "pending" && (
            <button
              onClick={() => onWithdraw(participation.id)}
              disabled={withdrawing}
              className={BTN_SECONDARY + " flex-shrink-0 px-3 py-1.5 text-xs"}
            >
              {withdrawing ? "..." : "Withdraw"}
            </button>
          )}
        </div>
      ) : campaign.status === "live" ? (
        <button
          onClick={() => onJoin(campaign.id)}
          disabled={joining}
          className={BTN_PRIMARY + " w-full text-sm"}
        >
          {joining ? "Submitting request..." : "🎯 Join Campaign"}
        </button>
      ) : (
        <p className="py-1 text-center text-xs text-gray-400">Not accepting vendors right now</p>
      )}
    </div>
  );
}

function PerformancePanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["campaign-performance", campaignId],
    queryFn: () => apiFetch(`/promotions/vendor/campaigns/${campaignId}/performance`),
    retry: 1,
    staleTime: 60_000,
  });
  const { symbol: currencySymbol } = useCurrency();

  if (isLoading) return <div className="h-20 animate-pulse rounded-xl bg-gray-50" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} className="py-8" />;

  const metrics = [
    { label: "Impressions", value: (data.impressions ?? 0).toLocaleString(), icon: "👁️" },
    { label: "Clicks", value: (data.clicks ?? 0).toLocaleString(), icon: "🖱️" },
    { label: "Orders", value: (data.orders ?? 0).toLocaleString(), icon: "📦" },
    { label: "Revenue", value: fc(data.revenue ?? 0, currencySymbol), icon: "💰" },
  ];

  return (
    <div className="mt-2 rounded-xl bg-indigo-50 p-3">
      <p className="mb-2 text-[10px] font-extrabold tracking-widest text-indigo-400 uppercase">
        Campaign Performance
      </p>
      <div className="grid grid-cols-4 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-base">{m.icon}</p>
            <p className="mt-0.5 text-sm font-extrabold text-indigo-800">{m.value}</p>
            <p className="text-[9px] font-medium text-indigo-500">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Campaigns() {
  const qc = useQueryClient();
  const { symbol: currencySymbol } = useCurrency();
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone ?? "Asia/Karachi";
  const [toast, setToast] = useState("");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [perfOpen, setPerfOpen] = useState<string | null>(null);

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
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vendor-campaigns"],
    queryFn: () => apiFetch("/promotions/vendor/campaigns"),
    retry: 1,
  });

  const campaigns: Campaign[] = data?.campaigns ?? [];
  const participating = campaigns.filter((c) => c.participation);
  const available = campaigns.filter((c) => !c.participation);

  const joinMut = useMutation({
    mutationFn: (campaignId: string) =>
      apiFetch(`/promotions/vendor/campaigns/${campaignId}/participate`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onMutate: (id) => setJoiningId(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-campaigns"] });
      setJoiningId(null);
      showToast("✅ Participation request submitted! Awaiting admin approval.");
    },
    onError: (e: Error) => {
      setJoiningId(null);
      showToast("❌ " + errMsg(e));
    },
  });

  const withdrawMut = useMutation({
    mutationFn: (participationId: string) =>
      apiFetch(`/promotions/vendor/participations/${participationId}`, { method: "DELETE" }),
    onMutate: (id) => setWithdrawingId(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-campaigns"] });
      setWithdrawingId(null);
      showToast("Participation request withdrawn.");
    },
    onError: (e: Error) => {
      setWithdrawingId(null);
      showToast("❌ " + errMsg(e));
    },
  });

  return (
    <PullToRefresh
      onRefresh={async () => {
        await refetch();
      }}
    >
      <div className="space-y-4 px-4 pt-4 pb-6">
        {toast && (
          <div className="animate-fade-in fixed top-4 right-4 left-4 z-50 rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-xl">
            {toast}
          </div>
        )}

        <PageHeader title="Platform Campaigns" subtitle="Join campaigns to reach more customers" />

        {/* Info banner */}
        <div className="flex gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <span className="text-lg">💡</span>
          <p className="text-xs leading-relaxed text-indigo-700">
            Join platform-wide campaigns to appear in promotions and reach more customers. Your
            participation is subject to admin approval.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${CARD} animate-pulse`}>
                <div className="mb-2 h-5 w-3/4 rounded bg-gray-100" />
                <div className="mb-3 h-4 w-1/2 rounded bg-gray-100" />
                <div className="h-10 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mb-3 text-5xl">🎯</div>
            <p className="text-lg font-bold text-gray-700">No Active Campaigns</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-gray-400">
              The platform team will create campaigns here. Check back soon!
            </p>
          </div>
        ) : (
          <>
            {participating.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-800">
                  <span>My Participations</span>
                  <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                    {participating.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {participating.map((campaign) => (
                    <div key={campaign.id}>
                      <CampaignCard
                        campaign={campaign}
                        onJoin={() => {}}
                        onWithdraw={(pid) => withdrawMut.mutate(pid)}
                        joining={false}
                        withdrawing={withdrawingId === campaign.participation?.id}
                        currencySymbol={currencySymbol}
                        tz={tz}
                      />
                      {campaign.participation?.status === "approved" && (
                        <div className="mt-1.5">
                          <button
                            onClick={() =>
                              setPerfOpen(perfOpen === campaign.id ? null : campaign.id)
                            }
                            className="w-full rounded-xl bg-indigo-50 py-2 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-100"
                          >
                            {perfOpen === campaign.id
                              ? "▲ Hide Performance"
                              : "📊 View Performance"}
                          </button>
                          {perfOpen === campaign.id && (
                            <PerformancePanel campaignId={campaign.id} />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {available.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-800">
                  <span>Available Campaigns</span>
                  <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                    {available.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {available.map((campaign) => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      onJoin={(id) => joinMut.mutate(id)}
                      onWithdraw={() => {}}
                      joining={joiningId === campaign.id}
                      withdrawing={false}
                      currencySymbol={currencySymbol}
                      tz={tz}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
