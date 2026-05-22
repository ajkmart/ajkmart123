import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBroadcast, useBroadcastRecipientCount } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { useLanguage } from "@/lib/useLanguage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Megaphone,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

type AudienceRole = "customer" | "rider" | "vendor" | "admin";
const ROLE_OPTIONS: { value: AudienceRole; label: string }[] = [
  { value: "customer", label: "Customers" },
  { value: "rider", label: "Riders" },
  { value: "vendor", label: "Vendors" },
  { value: "admin", label: "Admins" },
];

type BroadcastRecord = {
  id: string;
  title: string;
  body: string;
  type: string;
  targetRole?: string;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  adminId?: string;
  sentAt: string;
};

export default function Broadcast() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const broadcastMutation = useBroadcast();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [formData, setFormData] = useState({
    title: "",
    body: "",
    type: "system",
    icon: "notifications-outline",
  });
  const [allUsers, setAllUsers] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<AudienceRole[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["admin-broadcasts-history"],
    queryFn: () => adminFetch("/broadcasts"),
    enabled: historyOpen,
    refetchInterval: historyOpen ? 30_000 : false,
  });
  const history: BroadcastRecord[] = (historyData?.broadcasts ??
    historyData ??
    []) as BroadcastRecord[];

  const targetRolesForQuery: string[] | "all" = allUsers ? "all" : selectedRoles;
  const recipientCountQuery = useBroadcastRecipientCount(
    targetRolesForQuery === "all" ? "all" : targetRolesForQuery
  );

  const audienceLabel = useMemo(() => {
    if (allUsers) return "All Active Users";
    if (selectedRoles.length === 0) return "No audience selected";
    if (selectedRoles.length === 1) {
      const r = selectedRoles[0]!;
      return `${r.charAt(0).toUpperCase() + r.slice(1)}s Only`;
    }
    return selectedRoles.map((r) => r.charAt(0).toUpperCase() + r.slice(1) + "s").join(" + ");
  }, [allUsers, selectedRoles]);

  const audienceReady = allUsers || selectedRoles.length > 0;

  const toggleRole = (role: AudienceRole, checked: boolean) => {
    setSelectedRoles((prev) => {
      if (checked) return prev.includes(role) ? prev : [...prev, role];
      return prev.filter((r) => r !== role);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.body || !audienceReady) return;

    const targetRole = allUsers
      ? undefined
      : selectedRoles.length === 1
        ? selectedRoles[0]
        : selectedRoles;

    const payload = { ...formData, targetRole };

    broadcastMutation.mutate(payload, {
      onSuccess: (data) => {
        toast({
          title: "Broadcast Sent!",
          description: `Sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"} (${audienceLabel}).`,
        });
        setFormData({ title: "", body: "", type: "system", icon: "notifications-outline" });
        setAllUsers(true);
        setSelectedRoles([]);
        void recipientCountQuery.refetch();
        void qc.invalidateQueries({ queryKey: ["admin-broadcasts-history"] });
      },
      onError: (err) => {
        toast({ title: "Failed to send", description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Broadcast page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Megaphone}
          title={T("broadcast")}
          subtitle={T("broadcastSubtitle")}
          iconBgClass="bg-rose-100"
          iconColorClass="text-rose-600"
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Card className="border-border/50 rounded-3xl shadow-lg shadow-black/5">
            <CardContent className="p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-foreground text-sm font-bold">
                    {T("notificationTitle")}
                  </label>
                  <Input
                    required
                    placeholder="e.g., Flash Sale is Live!"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="bg-muted/30 focus:bg-background h-12 rounded-xl text-base"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-foreground text-sm font-bold">{T("messageBody")}</label>
                  <Textarea
                    required
                    placeholder="Type your message here..."
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    className="bg-muted/30 focus:bg-background min-h-[120px] resize-none rounded-xl text-base"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-foreground flex items-center gap-1.5 text-sm font-bold">
                    <Users className="text-muted-foreground h-4 w-4" />
                    Target Audience
                  </label>

                  <Select
                    value={allUsers ? "all" : "specific"}
                    onValueChange={(v) => {
                      if (v === "all") {
                        setAllUsers(true);
                        setSelectedRoles([]);
                      } else {
                        setAllUsers(false);
                      }
                    }}
                  >
                    <SelectTrigger className="bg-muted/30 h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Active Users</SelectItem>
                      <SelectItem value="specific">Specific roles…</SelectItem>
                    </SelectContent>
                  </Select>

                  {!allUsers && (
                    <div className="bg-muted/30 border-border/50 grid grid-cols-2 gap-2 rounded-xl border p-3">
                      {ROLE_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className="flex cursor-pointer items-center gap-2 text-sm select-none"
                        >
                          <Checkbox
                            checked={selectedRoles.includes(opt.value)}
                            onCheckedChange={(c) => toggleRole(opt.value, c === true)}
                            data-testid={`broadcast-role-${opt.value}`}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Estimated recipients preview */}
                  <div
                    className="border-primary/20 bg-primary/5 flex items-center justify-between rounded-xl border px-4 py-3"
                    data-testid="broadcast-recipient-preview"
                  >
                    <div className="text-foreground/80 flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4" />
                      <span>Estimated recipients</span>
                      <span className="text-muted-foreground text-xs">· {audienceLabel}</span>
                    </div>
                    <div className="text-primary text-base font-bold">
                      {!audienceReady ? (
                        "—"
                      ) : recipientCountQuery.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : recipientCountQuery.isError ? (
                        "—"
                      ) : (
                        (recipientCountQuery.data?.count ?? 0).toLocaleString()
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-foreground text-sm font-bold">{T("type")}</label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) => setFormData({ ...formData, type: v })}
                    >
                      <SelectTrigger className="bg-muted/30 h-12 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">{T("system")}</SelectItem>
                        <SelectItem value="promotional">{T("promotional")}</SelectItem>
                        <SelectItem value="alert">{T("alert")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-foreground text-sm font-bold">{T("icon")}</label>
                    <Select
                      value={formData.icon}
                      onValueChange={(v) => setFormData({ ...formData, icon: v })}
                    >
                      <SelectTrigger className="bg-muted/30 h-12 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="notifications-outline">{T("defaultBell")}</SelectItem>
                        <SelectItem value="gift-outline">{T("giftBox")}</SelectItem>
                        <SelectItem value="warning-outline">{T("warning")}</SelectItem>
                        <SelectItem value="megaphone-outline">{T("megaphone")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={
                    broadcastMutation.isPending ||
                    !formData.title ||
                    !formData.body ||
                    !audienceReady
                  }
                  className="shadow-primary/25 mt-4 h-14 w-full rounded-xl text-base font-bold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                  data-testid="broadcast-send-button"
                >
                  {broadcastMutation.isPending ? T("loading") : `Send to ${audienceLabel}`}
                  {!broadcastMutation.isPending && <Send className="ml-2 h-5 w-5" />}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <div>
            <h3 className="mb-4 ml-1 text-lg font-bold">{T("livePreview")}</h3>
            <div className="relative mx-auto flex h-[650px] w-full max-w-[340px] flex-col overflow-hidden rounded-[3rem] border-8 border-gray-800 bg-gray-900 p-4 shadow-2xl">
              <div className="absolute inset-x-0 top-0 z-20 mx-auto h-6 w-32 rounded-b-3xl bg-gray-800"></div>
              <div className="relative flex-1 overflow-hidden rounded-[2rem] bg-gray-50 p-4 pt-12">
                <div className="animate-in slide-in-from-top-4 fade-in relative flex w-full gap-3 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-xl duration-500">
                  {formData.type === "promotional" && (
                    <div className="bg-primary absolute top-0 left-0 h-full w-1"></div>
                  )}
                  <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                    <Bell className="text-primary h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900">
                      {formData.title || T("notificationTitle")}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
                      {formData.body ||
                        "This is how your message will appear to users on their mobile devices."}
                    </p>
                    <p className="mt-2 text-[10px] font-medium text-gray-400">just now • AJKMart</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Recent Broadcasts History ── */}
        <Card className="border-border/50 rounded-2xl">
          <button
            className="hover:bg-muted/30 flex w-full items-center justify-between rounded-2xl px-6 py-4 text-left transition-colors"
            onClick={() => setHistoryOpen((o) => !o)}
          >
            <div className="flex items-center gap-2">
              <History className="text-muted-foreground h-4 w-4" />
              <span className="text-sm font-semibold">Recent Broadcasts</span>
            </div>
            {historyOpen ? (
              <ChevronUp className="text-muted-foreground h-4 w-4" />
            ) : (
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            )}
          </button>

          {historyOpen && (
            <div className="px-6 pb-5">
              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No broadcasts sent yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left text-xs">
                        <th className="pr-3 pb-2">Title</th>
                        <th className="pr-3 pb-2">Audience</th>
                        <th className="pr-3 pb-2">Sent</th>
                        <th className="pr-3 pb-2">Delivered</th>
                        <th className="pr-3 pb-2">Failed</th>
                        <th className="pb-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((b) => (
                        <tr key={b.id} className="hover:bg-muted/20 border-b last:border-0">
                          <td className="max-w-[160px] truncate py-2.5 pr-3 font-medium">
                            {b.title}
                          </td>
                          <td className="py-2.5 pr-3">
                            <Badge variant="outline" className="text-xs capitalize">
                              {b.targetRole ?? "all"}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="font-semibold">{b.sentCount}</span>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Badge
                              variant="outline"
                              className="gap-1 border-green-200 bg-green-50 text-xs text-green-700"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {b.deliveredCount}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Badge
                              variant="outline"
                              className={`gap-1 text-xs ${b.failedCount > 0 ? "border-red-200 bg-red-50 text-red-700" : "text-muted-foreground"}`}
                            >
                              <XCircle className="h-3 w-3" />
                              {b.failedCount}
                            </Badge>
                          </td>
                          <td className="text-muted-foreground py-2.5 text-xs whitespace-nowrap">
                            {new Date(b.sentAt).toLocaleString("en-PK", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </ErrorBoundary>
  );
}
