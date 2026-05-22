import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileDrawer } from "@/components/MobileDrawer";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformSettings, useUpdatePlatformSettings } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { formatCurrency } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Loader2, Minus, Plus, Search, Settings2, Star } from "lucide-react";
import { useRef, useState } from "react";

type LoyaltyPoints = {
  totalEarned: number;
  totalRedeemed: number;
  available: number;
};

type LoyaltyUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatar: string | null;
  walletBalance: number;
  isActive: boolean;
  createdAt: string;
  loyaltyPoints: LoyaltyPoints;
};

type AdjustResponse = {
  success: boolean;
  loyaltyPoints: LoyaltyPoints;
};

type PlatformSetting = {
  key: string;
  value: string;
};

function useLoyaltyUsers(search: string) {
  return useQuery<{ users: LoyaltyUser[]; total: number }>({
    queryKey: ["admin-loyalty-users", search],
    queryFn: () => adminFetch(`/loyalty/users${search ? `?q=${encodeURIComponent(search)}` : ""}`),
    refetchInterval: 30_000,
  });
}

function AdjustPointsModal({ user, onClose }: { user: LoyaltyUser; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const mutation = useMutation<
    AdjustResponse,
    Error,
    { amount: number; reason: string; type: string }
  >({
    mutationFn: (body) =>
      adminFetch(`/loyalty/users/${user.id}/adjust`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["admin-loyalty-users"] });
      toast({
        title: type === "credit" ? "Points credited" : "Points debited",
        description: `${amount} loyalty points ${type === "credit" ? "added to" : "removed from"} ${user.name || user.phone}'s account. New balance: ${data.loyaltyPoints?.available ?? "N/A"} pts`,
      });
      onClose();
    },
    onError: (e) =>
      toast({ title: "Adjustment failed", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const numAmount = Math.floor(Number(amount));
    if (!numAmount || numAmount <= 0 || !Number.isInteger(Number(amount))) {
      toast({
        title: "Invalid amount",
        description: "Enter a positive whole number",
        variant: "destructive",
      });
      return;
    }
    if (!reason.trim()) {
      toast({
        title: "Reason required",
        description: "Please provide a reason for this adjustment",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate({ amount: numAmount, reason: reason.trim(), type });
  };

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={
        <>
          <Star className="h-5 w-5 text-amber-500" /> Adjust Points — {user.name || user.phone}
        </>
      }
      dialogClassName="w-[95vw] max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl"
    >
      <div className="mt-2 space-y-4">
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
              {(user.name || user.phone || "U")[0]!.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name || user.phone}</p>
              <p className="text-muted-foreground text-xs">{user.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-amber-700">
                {user.loyaltyPoints?.available ?? 0}
              </p>
              <p className="text-muted-foreground text-[10px] font-bold uppercase">Available Pts</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setType("credit")}
            className={`rounded-xl border p-3 transition-all ${type === "credit" ? "border-emerald-400 bg-emerald-50 shadow-sm" : "bg-muted/30 border-border hover:border-emerald-300"}`}
          >
            <Plus
              className={`mx-auto mb-1 h-5 w-5 ${type === "credit" ? "text-emerald-600" : "text-muted-foreground"}`}
            />
            <p
              className={`text-sm font-semibold ${type === "credit" ? "text-emerald-700" : "text-muted-foreground"}`}
            >
              Credit
            </p>
            <p className="text-muted-foreground text-[10px]">Add points</p>
          </button>
          <button
            onClick={() => setType("debit")}
            className={`rounded-xl border p-3 transition-all ${type === "debit" ? "border-red-400 bg-red-50 shadow-sm" : "bg-muted/30 border-border hover:border-red-300"}`}
          >
            <Minus
              className={`mx-auto mb-1 h-5 w-5 ${type === "debit" ? "text-red-600" : "text-muted-foreground"}`}
            />
            <p
              className={`text-sm font-semibold ${type === "debit" ? "text-red-700" : "text-muted-foreground"}`}
            >
              Debit
            </p>
            <p className="text-muted-foreground text-[10px]">Remove points</p>
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Amount (points)</label>
          <Input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Enter points amount"
            className="h-10 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Reason</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Compensation for late delivery, Manual correction..."
            className="resize-none rounded-xl"
            rows={3}
          />
        </div>

        {type === "debit" &&
          Number(amount) > (user.loyaltyPoints?.available ?? 0) &&
          Number(amount) > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">
                Cannot debit {amount} points. User only has {user.loyaltyPoints?.available ?? 0}{" "}
                points available.
              </p>
            </div>
          )}

        <Button
          onClick={handleSubmit}
          disabled={
            mutation.isPending ||
            !amount ||
            !reason.trim() ||
            (type === "debit" && Number(amount) > (user.loyaltyPoints?.available ?? 0))
          }
          className={`h-11 w-full gap-2 rounded-xl ${type === "credit" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"} text-white`}
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : type === "credit" ? (
            <Plus className="h-4 w-4" />
          ) : (
            <Minus className="h-4 w-4" />
          )}
          {type === "credit" ? "Credit" : "Debit"} {amount || "0"} Points
        </Button>
      </div>
    </MobileDrawer>
  );
}

type SortField = "name" | "available" | "totalEarned";
type SortDir = "asc" | "desc";

export default function LoyaltyPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [adjustUser, setAdjustUser] = useState<LoyaltyUser | null>(null);
  const [sortField, setSortField] = useState<SortField>("available");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, refetch } = useLoyaltyUsers(debouncedSearch);
  const { data: settingsData } = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();
  const { toast } = useToast();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const settings = settingsData as PlatformSetting[] | undefined;
  const loyaltyEnabledSetting = settings?.find((s) => s.key === "customer_loyalty_enabled");
  const loyaltyPtsSetting = settings?.find((s) => s.key === "customer_loyalty_pts");
  const loyaltyEnabled = (loyaltyEnabledSetting?.value ?? "on") === "on";
  const loyaltyPtsPerRs100 = parseFloat(loyaltyPtsSetting?.value ?? "5");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const users = [...(data?.users || [])].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") {
      cmp = (a.name || "").localeCompare(b.name || "");
    } else if (sortField === "available") {
      cmp = (a.loyaltyPoints?.available ?? 0) - (b.loyaltyPoints?.available ?? 0);
    } else if (sortField === "totalEarned") {
      cmp = (a.loyaltyPoints?.totalEarned ?? 0) - (b.loyaltyPoints?.totalEarned ?? 0);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPointsInCirculation = users.reduce(
    (sum, u) => sum + (u.loyaltyPoints?.available ?? 0),
    0
  );
  const totalEarned = users.reduce((sum, u) => sum + (u.loyaltyPoints?.totalEarned ?? 0), 0);
  const totalRedeemed = users.reduce((sum, u) => sum + (u.loyaltyPoints?.totalRedeemed ?? 0), 0);

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      className={`ml-1 inline h-3 w-3 cursor-pointer ${sortField === field ? "text-amber-600" : "text-muted-foreground/50"}`}
    />
  );

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Loyalty page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh
        onRefresh={async () => {
          await refetch();
        }}
      >
        <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
          <PageHeader
            icon={Star}
            title="Loyalty Points"
            subtitle="Manage customer loyalty point balances"
            iconBgClass="bg-amber-100"
            iconColorClass="text-amber-600"
            actions={
              <Badge
                variant="outline"
                className={`${loyaltyEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"} text-xs font-bold`}
              >
                {loyaltyEnabled ? "Program Active" : "Program Disabled"}
              </Badge>
            }
          />

          <Card className="rounded-xl border p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <Settings2 className="text-muted-foreground h-4 w-4" />
              <h2 className="text-sm font-bold">Platform Configuration</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="bg-muted/30 flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-muted-foreground text-xs font-bold uppercase">
                    Program Status
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {loyaltyEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <Switch
                  checked={loyaltyEnabled}
                  onCheckedChange={(checked) => {
                    updateSettings.mutate(
                      [{ key: "customer_loyalty_enabled", value: checked ? "on" : "off" }],
                      {
                        onSuccess: () =>
                          toast({ title: "Loyalty program " + (checked ? "enabled" : "disabled") }),
                        onError: (e) =>
                          toast({
                            title: "Failed",
                            description: e instanceof Error ? e.message : "Unknown error",
                            variant: "destructive",
                          }),
                      }
                    );
                  }}
                />
              </div>
              <div className="bg-muted/30 rounded-xl border p-3">
                <p className="text-muted-foreground text-xs font-bold uppercase">Earn Rate</p>
                <p className="mt-0.5 text-sm font-semibold">{loyaltyPtsPerRs100} pts per Rs. 100</p>
              </div>
              <div className="bg-muted/30 rounded-xl border p-3">
                <p className="text-muted-foreground text-xs font-bold uppercase">Total Customers</p>
                <p className="mt-0.5 text-sm font-semibold">{data?.total ?? "—"}</p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="rounded-xl border bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm">
              <p className="text-xs font-bold text-amber-600 uppercase">Points in Circulation</p>
              <p className="mt-1 text-2xl font-bold text-amber-800">
                {totalPointsInCirculation.toLocaleString()}
              </p>
            </Card>
            <Card className="rounded-xl border bg-gradient-to-br from-emerald-50 to-green-50 p-4 shadow-sm">
              <p className="text-xs font-bold text-emerald-600 uppercase">Total Earned</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">
                {totalEarned.toLocaleString()}
              </p>
            </Card>
            <Card className="rounded-xl border bg-gradient-to-br from-blue-50 to-indigo-50 p-4 shadow-sm">
              <p className="text-xs font-bold text-blue-600 uppercase">Total Redeemed</p>
              <p className="mt-1 text-2xl font-bold text-blue-800">
                {totalRedeemed.toLocaleString()}
              </p>
            </Card>
          </div>

          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name, phone, or email..."
              className="h-10 rounded-xl pl-10"
            />
          </div>

          {/* Mobile card list — shown below md breakpoint */}
          <section className="space-y-3 md:hidden" aria-label="Loyalty customers">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse rounded-xl border p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="bg-muted h-4 w-28 rounded" />
                      <div className="bg-muted h-3 w-20 rounded" />
                    </div>
                    <div className="bg-muted h-5 w-14 rounded-full" />
                  </div>
                </Card>
              ))
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground text-sm">No customers found</p>
              </div>
            ) : (
              users.map((u) => (
                <Card key={u.id} className="overflow-hidden rounded-xl border shadow-sm">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700"
                        aria-hidden="true"
                      >
                        {(u.name || u.phone || "U")[0]!.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{u.name || "—"}</p>
                        {u.email && (
                          <p className="text-muted-foreground truncate text-[11px]">{u.email}</p>
                        )}
                        <p className="text-muted-foreground text-xs">{u.phone || "—"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-amber-50 p-2">
                        <p className="font-bold text-amber-700">
                          {(u.loyaltyPoints?.available ?? 0).toLocaleString()}
                        </p>
                        <p className="text-muted-foreground">Available</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-2">
                        <p className="font-bold text-emerald-600">
                          {(u.loyaltyPoints?.totalEarned ?? 0).toLocaleString()}
                        </p>
                        <p className="text-muted-foreground">Earned</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2">
                        <p className="font-bold text-blue-600">
                          {(u.loyaltyPoints?.totalRedeemed ?? 0).toLocaleString()}
                        </p>
                        <p className="text-muted-foreground">Redeemed</p>
                      </div>
                    </div>
                    <div className="border-border/50 flex items-center justify-between border-t pt-2">
                      <span className="text-sm font-semibold">
                        {formatCurrency(u.walletBalance)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAdjustUser(u)}
                        className="h-8 gap-1.5 rounded-lg border-amber-200 text-xs text-amber-700 hover:bg-amber-50"
                      >
                        <Star className="h-3.5 w-3.5" aria-hidden="true" />
                        Adjust
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          {/* Desktop table — hidden below md breakpoint */}
          <Card className="hidden overflow-hidden rounded-xl border shadow-sm md:block">
            {isLoading ? (
              <div className="text-muted-foreground flex h-40 items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading customers...</span>
              </div>
            ) : users.length === 0 ? (
              <div className="text-muted-foreground flex h-40 items-center justify-center">
                <p className="text-sm">No customers found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => toggleSort("name")}
                      >
                        Customer <SortIcon field="name" />
                      </TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead
                        className="cursor-pointer text-right select-none"
                        onClick={() => toggleSort("available")}
                      >
                        Available <SortIcon field="available" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer text-right select-none"
                        onClick={() => toggleSort("totalEarned")}
                      >
                        Earned <SortIcon field="totalEarned" />
                      </TableHead>
                      <TableHead className="text-right">Redeemed</TableHead>
                      <TableHead className="text-right">Wallet</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                              {(u.name || u.phone || "U")[0]!.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{u.name || "—"}</p>
                              {u.email && (
                                <p className="text-muted-foreground truncate text-[11px]">
                                  {u.email}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {u.phone || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold text-amber-700">
                            {(u.loyaltyPoints?.available ?? 0).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-emerald-600">
                          {(u.loyaltyPoints?.totalEarned ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-blue-600">
                          {(u.loyaltyPoints?.totalRedeemed ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(u.walletBalance)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAdjustUser(u)}
                            className="h-8 gap-1.5 rounded-lg border-amber-200 text-xs text-amber-700 hover:bg-amber-50"
                          >
                            <Star className="h-3.5 w-3.5" />
                            Adjust
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {adjustUser && (
            <AdjustPointsModal user={adjustUser} onClose={() => setAdjustUser(null)} />
          )}
        </div>
      </PullToRefresh>
    </ErrorBoundary>
  );
}
