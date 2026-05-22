import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { adminFetch } from "@/lib/adminFetcher";
import { formatDate } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Filter,
  Flag,
  FlagOff,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldOff,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type P2PTx = {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_name: string | null;
  sender_phone: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  amount: string;
  description: string;
  flagged: boolean;
  flag_reason: string | null;
  flagged_by: string | null;
  flagged_at: string | null;
  created_at: string;
};

type WalletStats = {
  today: { transfers: number; volume: number; flagged: number };
  month: { transfers: number; volume: number };
  totalFlagged: number;
};

type PlatformSettingsResponse = {
  settings: Array<{
    key: string;
    value: string;
    label: string;
    category: string;
    updatedAt: string;
  }>;
  grouped: Record<string, Array<{ key: string; value: string; label: string }>>;
};

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function WalletTransfersPage() {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Wallet Transfers page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Wallet}
          title="Wallet P2P Transfers"
          subtitle="Monitor user-to-user transfers, flag suspicious activity, and manage P2P limits"
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
        />

        <Tabs defaultValue="transactions">
          <TabsList className="mb-2">
            <TabsTrigger value="transactions" className="flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5" /> P2P Transactions
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Settings & Limits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4">
            <StatsPanel />
            <TransactionsPanel />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
}

/* ─── Stats Cards ─────────────────────────────────────────────────────────── */
function StatsPanel() {
  const { data: stats, isLoading } = useQuery<WalletStats>({
    queryKey: ["admin-wallet-stats"],
    queryFn: () => adminFetch("/wallet/stats"),
    staleTime: 30_000,
  });

  const cards = [
    {
      label: "Today's Transfers",
      value: stats?.today?.transfers ?? 0,
      color: "text-blue-600",
      icon: <ArrowRight className="h-4 w-4 text-blue-400" />,
    },
    {
      label: "Today's Volume",
      value: `Rs. ${(stats?.today?.volume ?? 0).toLocaleString()}`,
      color: "text-green-600",
      icon: <DollarSign className="h-4 w-4 text-green-400" />,
    },
    {
      label: "Month Volume",
      value: `Rs. ${(stats?.month?.volume ?? 0).toLocaleString()}`,
      color: "text-purple-600",
      icon: <TrendingUp className="h-4 w-4 text-purple-400" />,
    },
    {
      label: "Flagged (Total)",
      value: stats?.totalFlagged ?? 0,
      color: "text-red-600",
      icon: <Flag className="h-4 w-4 text-red-400" />,
    },
  ];

  if (isLoading)
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-muted/30 h-20 animate-pulse p-4" />
        ))}
      </div>
    );

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="mb-1 flex items-center justify-between">{c.icon}</div>
          <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
          <p className="text-muted-foreground mt-0.5 text-xs font-medium">{c.label}</p>
        </Card>
      ))}
    </div>
  );
}

/* ─── Transactions Panel ──────────────────────────────────────────────────── */
function TransactionsPanel() {
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [flagFilter, setFlagFilter] = useState("all");
  const [flagModal, setFlagModal] = useState<P2PTx | null>(null);
  const [freezeModal, setFreezeModal] = useState<{ userId: string; name: string } | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const qc = useQueryClient();
  const { toast } = useToast();
  const { onError: onWalletError } = useErrorHandler({ title: "Failed" });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [_bulkProcessing, setBulkProcessing] = useState(false);

  const _handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkProcessing(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => adminFetch(`/wallet/transfers/${id}/approve`, { method: "POST" }))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;
      if (failed > 0) {
        toast({
          title: "Partial Success",
          description: `${succeeded} approved, ${failed} failed — check individual transfers for errors`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Approved", description: `Successfully approved ${ids.length} transfers` });
      }
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: ["admin-wallet-transfers"] });
    } catch (e: unknown) {
      onWalletError(e);
    } finally {
      setBulkProcessing(false);
    }
  };

  const _toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const params = new URLSearchParams({ page: String(page), limit: "50" });

  if (userId) params.set("userId", userId);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (minAmt) params.set("minAmt", minAmt);
  if (maxAmt) params.set("maxAmt", maxAmt);
  if (flagFilter !== "all") params.set("flagged", flagFilter);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-p2p-txns", params.toString()],
    queryFn: () => adminFetch(`/wallet/p2p-transactions?${params}`),
    staleTime: 15_000,
  });

  // Backend returns `{ transactions: P2PTx[], total: number, pages: number }`.
  // Narrow once via a typed alias instead of repeating `(data as any)`.
  const txnsResp = data as { transactions?: P2PTx[]; total?: number; pages?: number } | undefined;
  const transactions: P2PTx[] = txnsResp?.transactions ?? [];
  const total: number = txnsResp?.total ?? 0;
  const pages: number = txnsResp?.pages ?? 1;

  const flagMutation = useMutation({
    mutationFn: ({ id, flag, reason }: { id: string; flag: boolean; reason?: string }) =>
      adminFetch(`/wallet/transactions/${id}/flag`, {
        method: "PATCH",
        body: JSON.stringify({ flag, reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-p2p-txns"] });
      void qc.invalidateQueries({ queryKey: ["admin-wallet-stats"] });
      setFlagModal(null);
      toast({ title: "Transaction flag updated" });
    },
    onError: onWalletError,
  });

  const freezeMutation = useMutation({
    mutationFn: (uid: string) => adminFetch(`/wallet/freeze-p2p/${uid}`, { method: "PATCH" }),
    onSuccess: (d: any) => {
      setFreezeModal(null);
      void qc.invalidateQueries({ queryKey: ["admin-p2p-txns"] });
      void qc.invalidateQueries({ queryKey: ["admin-wallet-stats"] });
      toast({ title: d?.data?.p2pFrozen ? "P2P transfers frozen" : "P2P transfers unfrozen" });
    },
    onError: onWalletError,
  });

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Filter by User ID..."
            className="h-8 pl-8 text-xs"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={flagFilter}
          onValueChange={(v) => {
            setFlagFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Flagged" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Transfers</SelectItem>
            <SelectItem value="true">Flagged Only</SelectItem>
            <SelectItem value="false">Clean Only</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="mr-1 h-3.5 w-3.5" />
          Filters
          {showFilters ? (
            <ChevronUp className="ml-1 h-3 w-3" />
          ) : (
            <ChevronDown className="ml-1 h-3 w-3" />
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {showFilters && (
        <Card className="p-3">
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex min-w-[120px] flex-1 flex-col gap-1">
              <span className="text-muted-foreground font-medium">Date From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
              />
            </label>
            <label className="flex min-w-[120px] flex-1 flex-col gap-1">
              <span className="text-muted-foreground font-medium">Date To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
              />
            </label>
            <label className="flex min-w-[100px] flex-1 flex-col gap-1">
              <span className="text-muted-foreground font-medium">Min Amount</span>
              <input
                type="number"
                placeholder="Rs. 0"
                value={minAmt}
                onChange={(e) => {
                  setMinAmt(e.target.value);
                  setPage(1);
                }}
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
              />
            </label>
            <label className="flex min-w-[100px] flex-1 flex-col gap-1">
              <span className="text-muted-foreground font-medium">Max Amount</span>
              <input
                type="number"
                placeholder="Rs. ∞"
                value={maxAmt}
                onChange={(e) => {
                  setMaxAmt(e.target.value);
                  setPage(1);
                }}
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
              />
            </label>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setMinAmt("");
                  setMaxAmt("");
                  setPage(1);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card>
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-medium">{total} P2P transfers</span>
          {flagFilter === "true" && (
            <Badge variant="outline" className="border-red-200 bg-red-50 text-xs text-red-700">
              {total} Flagged
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="text-muted-foreground/20 mx-auto h-8 w-8 animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-muted-foreground p-12 text-center">
            <Wallet className="mx-auto mb-2 h-10 w-10 opacity-20" />
            <p className="text-sm">No P2P transactions found.</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <section className="divide-border divide-y md:hidden" aria-label="P2P transfers">
              {transactions.map((tx) => (
                <div key={tx.id} className={`space-y-2 p-4 ${tx.flagged ? "bg-red-50/40" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {tx.sender_name || "Unknown"} → {tx.receiver_name || "Unknown"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {tx.sender_phone} → {tx.receiver_phone || tx.receiver_id?.slice(0, 8)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 shrink-0 p-0"
                          aria-label="Open actions menu"
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setFlagModal(tx)}>
                          {tx.flagged ? (
                            <>
                              <FlagOff className="mr-2 h-4 w-4 text-red-500" aria-hidden="true" />{" "}
                              Unflag
                            </>
                          ) : (
                            <>
                              <Flag className="mr-2 h-4 w-4" aria-hidden="true" /> Flag
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setFreezeModal({
                              userId: tx.sender_id,
                              name: tx.sender_name || tx.sender_phone || tx.sender_id,
                            })
                          }
                        >
                          <ShieldOff className="mr-2 h-4 w-4 text-orange-500" aria-hidden="true" />{" "}
                          Freeze Sender
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      {formatDate(tx.created_at)}
                    </span>
                    <div className="flex items-center gap-2">
                      {tx.flagged ? (
                        <Badge
                          variant="outline"
                          className="border-red-200 bg-red-50 text-xs text-red-700"
                        >
                          <Flag className="mr-1 h-2.5 w-2.5" aria-hidden="true" /> Flagged
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-50 text-xs text-green-700"
                        >
                          Clean
                        </Badge>
                      )}
                      <span className="text-sm font-semibold text-green-700">
                        Rs. {parseFloat(tx.amount ?? "0").toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </section>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground border-b text-xs">
                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium">Sender</th>
                    <th className="px-4 py-2.5 text-left font-medium">Receiver</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-3 py-2.5 text-center font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className={`hover:bg-muted/20 border-b last:border-0 ${tx.flagged ? "bg-red-50/40" : ""}`}
                    >
                      <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium">{tx.sender_name || "Unknown"}</div>
                        <div className="text-muted-foreground text-xs">{tx.sender_phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium">{tx.receiver_name || "Unknown"}</div>
                        <div className="text-muted-foreground text-xs">
                          {tx.receiver_phone || tx.receiver_id?.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-green-700">
                        Rs. {parseFloat(tx.amount ?? "0").toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {tx.flagged ? (
                          <Badge
                            variant="outline"
                            className="border-red-200 bg-red-50 text-xs text-red-700"
                          >
                            <Flag className="mr-1 h-2.5 w-2.5" aria-hidden="true" /> Flagged
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-green-200 bg-green-50 text-xs text-green-700"
                          >
                            Clean
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${tx.flagged ? "text-red-500 hover:text-red-700" : "text-muted-foreground hover:text-red-500"}`}
                            aria-label={tx.flagged ? "Unflag transaction" : "Flag as suspicious"}
                            onClick={() => setFlagModal(tx)}
                          >
                            {tx.flagged ? (
                              <FlagOff className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground h-7 w-7 hover:text-orange-500"
                            aria-label="Freeze sender's P2P"
                            onClick={() =>
                              setFreezeModal({
                                userId: tx.sender_id,
                                name: tx.sender_name || tx.sender_phone || tx.sender_id,
                              })
                            }
                          >
                            <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-1 border-t p-3">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <span className="text-muted-foreground px-2 text-xs">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page === pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>

      {/* Flag Modal */}
      {flagModal && (
        <FlagModal
          tx={flagModal}
          onClose={() => setFlagModal(null)}
          onSubmit={(flag, reason) => flagMutation.mutate({ id: flagModal.id, flag, reason })}
          loading={flagMutation.isPending}
        />
      )}

      {/* Freeze Modal */}
      {freezeModal && (
        <Dialog open onOpenChange={() => setFreezeModal(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldOff className="h-5 w-5 text-orange-500" />
                Toggle P2P Freeze
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-muted-foreground text-sm">
                Toggle P2P transfer restriction for{" "}
                <span className="text-foreground font-semibold">{freezeModal.name}</span>. This will
                prevent them from sending or receiving P2P transfers while not affecting other
                wallet features.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setFreezeModal(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => freezeMutation.mutate(freezeModal.userId)}
                  disabled={freezeMutation.isPending}
                >
                  {freezeMutation.isPending ? (
                    <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldOff className="mr-1 h-4 w-4" />
                  )}
                  Toggle P2P Freeze
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ─── Flag Modal ─────────────────────────────────────────────────────────── */
function FlagModal({
  tx,
  onClose,
  onSubmit,
  loading,
}: {
  tx: P2PTx;
  onClose: () => void;
  onSubmit: (flag: boolean, reason?: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState(tx.flag_reason ?? "");
  const isFlagged = tx.flagged;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isFlagged ? (
              <FlagOff className="text-muted-foreground h-5 w-5" />
            ) : (
              <Flag className="h-5 w-5 text-red-500" />
            )}
            {isFlagged ? "Unflag Transaction" : "Flag as Suspicious"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-muted/30 space-y-1 rounded-lg p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sender</span>
              <span className="font-medium">
                {tx.sender_name} ({tx.sender_phone})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receiver</span>
              <span className="font-medium">
                {tx.receiver_name} ({tx.receiver_phone})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold text-green-700">
                Rs. {parseFloat(tx.amount ?? "0").toLocaleString()}
              </span>
            </div>
          </div>

          {!isFlagged && (
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">Reason (optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Unusually large transfer, potential fraud..."
                rows={3}
                className="border-input bg-background focus:ring-ring w-full resize-none rounded-md border p-2 text-xs focus:ring-1 focus:outline-none"
              />
            </div>
          )}

          {isFlagged && tx.flag_reason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs">
              <span className="text-muted-foreground font-medium">Current reason: </span>
              <span>{tx.flag_reason}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant={isFlagged ? "outline" : "destructive"}
              className="flex-1"
              onClick={() => onSubmit(!isFlagged, reason || undefined)}
              disabled={loading}
            >
              {loading ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : isFlagged ? (
                <FlagOff className="mr-1 h-4 w-4" />
              ) : (
                <Flag className="mr-1 h-4 w-4" />
              )}
              {isFlagged ? "Unflag" : "Flag Transaction"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Settings Panel ─────────────────────────────────────────────────────── */
function SettingsPanel() {
  const { data, isLoading, refetch } = useQuery<PlatformSettingsResponse>({
    queryKey: ["admin-platform-settings"],
    queryFn: () => adminFetch("/platform-settings"),
    staleTime: 30_000,
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  /* Convert the settings array to a Record<key, value> for easy lookup. */
  const settings: Record<string, string> = Object.fromEntries(
    (data?.settings ?? []).map((s) => [s.key, s.value])
  );

  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const get = (key: string, def: string) => fields[key] ?? settings[key] ?? def;
  const set = (key: string, val: string) => setFields((prev) => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = Object.entries(fields).map(([key, value]) => ({ key, value }));
      await adminFetch("/platform-settings", {
        method: "PUT",
        body: JSON.stringify({ settings: payload }),
      });
      void qc.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      setFields({});
      toast({ title: "Settings saved" });
    } catch (e: unknown) {
      toast({
        title: "Failed to save",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const settingGroups = [
    {
      title: "P2P Transfer Limits",
      color: "text-blue-600",
      fields: [
        {
          key: "wallet_p2p_enabled",
          label: "P2P Transfers Enabled",
          type: "toggle",
          def: "on",
          hint: "Master on/off for all user-to-user transfers",
        },
        {
          key: "wallet_min_withdrawal",
          label: "Min Transfer Amount (Rs.)",
          type: "number",
          def: "200",
          hint: "Minimum amount per single transfer",
        },
        {
          key: "wallet_max_withdrawal",
          label: "Max Transfer Amount (Rs.)",
          type: "number",
          def: "10000",
          hint: "Maximum amount per single transfer",
        },
        {
          key: "wallet_p2p_daily_limit",
          label: "P2P Daily Limit (Rs.)",
          type: "number",
          def: "10000",
          hint: "Max total P2P outflow per user per day",
        },
        {
          key: "wallet_daily_limit",
          label: "Overall Daily Wallet Limit",
          type: "number",
          def: "20000",
          hint: "Total daily wallet spending (all types)",
        },
      ],
    },
    {
      title: "Fees & Auto-Flag",
      color: "text-purple-600",
      fields: [
        {
          key: "wallet_p2p_fee_pct",
          label: "P2P Fee (%)",
          type: "number",
          def: "0",
          hint: "Percentage fee charged on P2P transfers (0 = free)",
        },
        {
          key: "wallet_p2p_auto_flag_amount",
          label: "Auto-Flag Threshold (Rs.)",
          type: "number",
          def: "5000",
          hint: "Transfers above this amount are automatically flagged for review",
        },
        {
          key: "wallet_max_balance",
          label: "Max Wallet Balance (Rs.)",
          type: "number",
          def: "50000",
          hint: "Maximum wallet balance a user can hold",
        },
        {
          key: "wallet_mpin_enabled",
          label: "Require MPIN for Transfers",
          type: "toggle",
          def: "on",
          hint: "Require 4-digit PIN for all outgoing transfers",
        },
      ],
    },
  ];

  if (isLoading)
    return (
      <div className="p-12 text-center">
        <RefreshCw className="text-muted-foreground/20 mx-auto h-8 w-8 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-4">
      {settingGroups.map((group) => (
        <Card key={group.title} className="p-5">
          <h3 className={`mb-4 text-sm font-semibold ${group.color}`}>{group.title}</h3>
          <div className="space-y-4">
            {group.fields.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium">{f.label}</label>
                  <p className="text-muted-foreground mt-0.5 text-xs">{f.hint}</p>
                </div>
                {f.type === "toggle" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {get(f.key, f.def) === "on" ? "On" : "Off"}
                    </span>
                    <button
                      onClick={() => set(f.key, get(f.key, f.def) === "on" ? "off" : "on")}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${get(f.key, f.def) === "on" ? "bg-primary" : "bg-muted"}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${get(f.key, f.def) === "on" ? "translate-x-4.5" : "translate-x-0.5"}`}
                      />
                    </button>
                  </div>
                ) : (
                  <input
                    type="number"
                    value={get(f.key, f.def)}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="border-input bg-background focus:ring-ring h-8 w-28 rounded-md border px-2 text-right text-xs focus:ring-1 focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setFields({});
            void refetch();
          }}
        >
          Reset
        </Button>
        <Button onClick={save} disabled={saving || Object.keys(fields).length === 0}>
          {saving ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : null}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
