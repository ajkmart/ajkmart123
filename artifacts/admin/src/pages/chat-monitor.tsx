import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileDrawer } from "@/components/MobileDrawer";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Search,
  Shield,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";

type Participant = {
  id: string;
  name: string | null;
  phone: string | null;
  ajkId: string | null;
  chatMuted?: boolean;
};
type Conversation = {
  id: string;
  participant1Id: string;
  participant2Id: string;
  participant1: Participant | null;
  participant2: Participant | null;
  messageCount: number;
  lastMessageAt: string | null;
  status: string;
};
type ChatMessage = {
  id: string;
  content: string | null;
  senderId: string;
  messageType: string;
  createdAt: string;
  deliveryStatus: string;
  isFlagged: boolean;
  flagReason: string | null;
  sender: { id: string; name: string | null; phone: string | null; ajkId: string | null } | null;
};
type ChatReport = {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: { id: string; name: string | null; phone: string | null } | null;
  reportedUser: { id: string; name: string | null; phone: string | null } | null;
  messageId: string | null;
};

function useConversations() {
  return useQuery({
    queryKey: ["admin-chat-conversations"],
    queryFn: () => adminFetch("/chat-monitor/conversations?limit=200"),
    refetchInterval: 30_000,
  });
}
function useConversationMessages(id: string | null) {
  return useQuery({
    queryKey: ["admin-chat-messages", id],
    queryFn: () => adminFetch(`/chat-monitor/conversations/${id}/messages?limit=200`),
    enabled: !!id,
  });
}
function useChatReports(status?: string) {
  const params = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: ["admin-chat-reports", status || "all"],
    queryFn: () => adminFetch(`/chat-monitor/reports${params}`),
    refetchInterval: 30_000,
  });
}

export default function ChatMonitor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"conversations" | "reports">("conversations");
  const [search, setSearch] = useState("");
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<string>("");

  const { data: convData, isLoading: convLoading, isError: convError } = useConversations();
  const { data: msgData, isLoading: msgLoading } = useConversationMessages(selectedConv);
  const { data: reportData, isLoading: reportLoading } = useChatReports(reportFilter || undefined);

  const conversations: Conversation[] = convData?.conversations || [];
  const messages: ChatMessage[] = msgData?.messages || [];
  const reports: ChatReport[] = reportData?.reports || [];

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.participant1?.name?.toLowerCase().includes(s) ||
      c.participant2?.name?.toLowerCase().includes(s) ||
      c.participant1?.phone?.includes(s) ||
      c.participant2?.phone?.includes(s) ||
      c.participant1?.ajkId?.toLowerCase().includes(s) ||
      c.participant2?.ajkId?.toLowerCase().includes(s)
    );
  });

  const muteMutation = useMutation({
    mutationFn: (userId: string) =>
      adminFetch(`/chat-monitor/users/${userId}/chat-mute`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-chat-conversations"] });
      toast({ title: "User muted from chat" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const unmuteMutation = useMutation({
    mutationFn: (userId: string) =>
      adminFetch(`/chat-monitor/users/${userId}/chat-unmute`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-chat-conversations"] });
      toast({ title: "User unmuted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/chat-monitor/reports/${id}/resolve`, { method: "PATCH", body: "{}" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-chat-reports"] });
      toast({ title: "Report resolved" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const pName = (p: Participant | null) => p?.name || p?.phone || "Unknown";

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Chat Monitor page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh
        onRefresh={() =>
          qc.invalidateQueries({
            queryKey:
              tab === "conversations" ? ["admin-chat-conversations"] : ["admin-chat-reports"],
          })
        }
      >
        <div className="space-y-6">
          <PageHeader
            icon={MessageCircle}
            title="P2P Chat Monitor"
            subtitle="Monitor user-to-user conversations and abuse reports"
            iconBgClass="bg-cyan-100"
            iconColorClass="text-cyan-600"
            actions={
              <div className="flex gap-2">
                <Button
                  variant={tab === "conversations" ? "default" : "outline"}
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setTab("conversations")}
                >
                  <Users className="mr-1 h-4 w-4" /> Conversations
                </Button>
                <Button
                  variant={tab === "reports" ? "default" : "outline"}
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setTab("reports")}
                >
                  <Flag className="mr-1 h-4 w-4" /> Reports
                  {reports.filter((r) => r.status === "pending").length > 0 && (
                    <Badge className="ml-1 bg-red-500 px-1.5 text-[10px] text-white">
                      {reports.filter((r) => r.status === "pending").length}
                    </Badge>
                  )}
                </Button>
              </div>
            }
          />

          {tab === "conversations" && (
            <>
              <div className="relative max-w-sm">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Search by name, phone, or AJK ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-xl pl-9"
                />
              </div>

              {/* Mobile card list */}
              <section className="space-y-3 md:hidden" aria-label="Conversations">
                {convLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="animate-pulse rounded-2xl p-4">
                      <div className="bg-muted mb-2 h-4 w-36 rounded" />
                      <div className="bg-muted h-3 w-24 rounded" />
                    </Card>
                  ))
                ) : convError ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center text-red-500">
                    <AlertTriangle className="h-8 w-8 opacity-60" aria-hidden="true" />
                    <p className="text-sm font-medium">Failed to load conversations</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-muted-foreground py-12 text-center">
                    <MessageCircle
                      className="mx-auto mb-3 h-10 w-10 opacity-30"
                      aria-hidden="true"
                    />
                    <p>No conversations found</p>
                  </div>
                ) : (
                  filtered.map((c) => (
                    <Card key={c.id} className="overflow-hidden rounded-2xl">
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <p className="text-muted-foreground text-xs font-medium">
                              Participants
                            </p>
                            <p className="truncate text-sm font-semibold">
                              {pName(c.participant1)}{" "}
                              {c.participant1?.chatMuted && (
                                <Badge
                                  variant="outline"
                                  className="ml-1 border-red-200 text-[10px] text-red-600"
                                >
                                  MUTED
                                </Badge>
                              )}
                              {" ↔ "}
                              {pName(c.participant2)}{" "}
                              {c.participant2?.chatMuted && (
                                <Badge
                                  variant="outline"
                                  className="ml-1 border-red-200 text-[10px] text-red-600"
                                >
                                  MUTED
                                </Badge>
                              )}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 shrink-0 p-0"
                                aria-label="Open actions menu"
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedConv(c.id)}>
                                <Eye className="mr-2 h-4 w-4" aria-hidden="true" /> View Messages
                              </DropdownMenuItem>
                              {c.participant1 &&
                                (c.participant1.chatMuted ? (
                                  <DropdownMenuItem
                                    onClick={() => unmuteMutation.mutate(c.participant1!.id)}
                                  >
                                    <Volume2
                                      className="mr-2 h-4 w-4 text-green-600"
                                      aria-hidden="true"
                                    />{" "}
                                    Unmute {pName(c.participant1)}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => muteMutation.mutate(c.participant1!.id)}
                                  >
                                    <VolumeX
                                      className="mr-2 h-4 w-4 text-red-600"
                                      aria-hidden="true"
                                    />{" "}
                                    Mute {pName(c.participant1)}
                                  </DropdownMenuItem>
                                ))}
                              {c.participant2 &&
                                (c.participant2.chatMuted ? (
                                  <DropdownMenuItem
                                    onClick={() => unmuteMutation.mutate(c.participant2!.id)}
                                  >
                                    <Volume2
                                      className="mr-2 h-4 w-4 text-green-600"
                                      aria-hidden="true"
                                    />{" "}
                                    Unmute {pName(c.participant2)}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => muteMutation.mutate(c.participant2!.id)}
                                  >
                                    <VolumeX
                                      className="mr-2 h-4 w-4 text-red-600"
                                      aria-hidden="true"
                                    />{" "}
                                    Mute {pName(c.participant2)}
                                  </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="text-muted-foreground border-border/50 flex items-center gap-3 border-t pt-1 text-xs">
                          <Badge variant="secondary" className="text-xs">
                            {c.messageCount} msgs
                          </Badge>
                          <span>
                            {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString() : "—"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </section>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden rounded-2xl md:block">
                {convLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                  </div>
                ) : convError ? (
                  <div className="flex flex-col items-center gap-2 py-20 text-center text-red-500">
                    <AlertTriangle className="h-8 w-8 opacity-60" aria-hidden="true" />
                    <p className="text-sm font-medium">Failed to load conversations</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-muted-foreground py-20 text-center">
                    <MessageCircle className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    <p>No conversations found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Participant 1</TableHead>
                          <TableHead>Participant 2</TableHead>
                          <TableHead className="text-center">Messages</TableHead>
                          <TableHead>Last Active</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((c) => (
                          <TableRow key={c.id} className="hover:bg-muted/30">
                            <TableCell>
                              <div>
                                <p className="text-sm font-semibold">{pName(c.participant1)}</p>
                                <p className="text-muted-foreground text-xs">
                                  {c.participant1?.ajkId}
                                </p>
                                {c.participant1?.chatMuted && (
                                  <Badge
                                    variant="outline"
                                    className="mt-0.5 border-red-200 text-[10px] text-red-600"
                                  >
                                    MUTED
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-semibold">{pName(c.participant2)}</p>
                                <p className="text-muted-foreground text-xs">
                                  {c.participant2?.ajkId}
                                </p>
                                {c.participant2?.chatMuted && (
                                  <Badge
                                    variant="outline"
                                    className="mt-0.5 border-red-200 text-[10px] text-red-600"
                                  >
                                    MUTED
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">
                                {c.messageCount}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground text-xs">
                                {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={() => setSelectedConv(c.id)}
                                  aria-label="View messages"
                                >
                                  <Eye className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                {c.participant1 &&
                                  (c.participant1.chatMuted ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-green-600"
                                      onClick={() => unmuteMutation.mutate(c.participant1!.id)}
                                      aria-label={`Unmute ${pName(c.participant1)}`}
                                    >
                                      <Volume2 className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-red-600"
                                      onClick={() => muteMutation.mutate(c.participant1!.id)}
                                      aria-label={`Mute ${pName(c.participant1)}`}
                                    >
                                      <VolumeX className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                  ))}
                                {c.participant2 &&
                                  (c.participant2.chatMuted ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-green-600"
                                      onClick={() => unmuteMutation.mutate(c.participant2!.id)}
                                      aria-label={`Unmute ${pName(c.participant2)}`}
                                    >
                                      <Volume2 className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-red-600"
                                      onClick={() => muteMutation.mutate(c.participant2!.id)}
                                      aria-label={`Mute ${pName(c.participant2)}`}
                                    >
                                      <VolumeX className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                  ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </>
          )}

          {tab === "reports" && (
            <>
              <div className="flex gap-2">
                {["", "pending", "resolved"].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={reportFilter === s ? "default" : "outline"}
                    className="rounded-lg text-xs"
                    onClick={() => setReportFilter(s)}
                  >
                    {s === "" ? "All" : s === "pending" ? "Pending" : "Resolved"}
                  </Button>
                ))}
              </div>
              {/* Mobile card list */}
              <section className="space-y-3 md:hidden" aria-label="Chat reports">
                {reportLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="animate-pulse rounded-2xl p-4">
                      <div className="bg-muted mb-2 h-4 w-32 rounded" />
                      <div className="bg-muted h-3 w-20 rounded" />
                    </Card>
                  ))
                ) : reports.length === 0 ? (
                  <div className="text-muted-foreground py-12 text-center">
                    <Shield className="mx-auto mb-3 h-10 w-10 opacity-30" aria-hidden="true" />
                    <p>No reports found</p>
                  </div>
                ) : (
                  reports.map((r) => (
                    <Card key={r.id} className="overflow-hidden rounded-2xl">
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {r.reporter?.name || r.reporter?.phone || "—"} →{" "}
                              {r.reportedUser?.name || r.reportedUser?.phone || "—"}
                            </p>
                            <p className="text-muted-foreground text-xs">{r.reason}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              r.status === "pending"
                                ? "shrink-0 border-amber-200 bg-amber-50 text-amber-600"
                                : "shrink-0 border-green-200 bg-green-50 text-green-600"
                            }
                          >
                            {r.status}
                          </Badge>
                        </div>
                        <div className="border-border/50 flex items-center justify-between border-t pt-1">
                          <span className="text-muted-foreground text-xs">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                          {r.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg text-xs"
                              onClick={() => resolveMutation.mutate(r.id)}
                              disabled={resolveMutation.isPending}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </section>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden rounded-2xl md:block">
                {reportLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                  </div>
                ) : reports.length === 0 ? (
                  <div className="text-muted-foreground py-20 text-center">
                    <Shield className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    <p>No reports found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reporter</TableHead>
                          <TableHead>Reported User</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reports.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <span className="text-sm font-medium">
                                {r.reporter?.name || r.reporter?.phone || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-medium">
                                {r.reportedUser?.name || r.reportedUser?.phone || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{r.reason}</span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  r.status === "pending"
                                    ? "border-amber-200 bg-amber-50 text-amber-600"
                                    : "border-green-200 bg-green-50 text-green-600"
                                }
                              >
                                {r.status === "pending" ? (
                                  <Clock className="mr-1 h-3 w-3" />
                                ) : (
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                )}
                                {r.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground text-xs">
                                {new Date(r.createdAt).toLocaleDateString()}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {r.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-lg text-xs"
                                  onClick={() => resolveMutation.mutate(r.id)}
                                  disabled={resolveMutation.isPending}
                                >
                                  Resolve
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </>
          )}

          {selectedConv && (
            <MobileDrawer
              open
              onClose={() => setSelectedConv(null)}
              title={
                <>
                  <Eye className="h-5 w-5 text-cyan-600" /> Message Thread
                </>
              }
              dialogClassName="w-[95vw] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl"
            >
              {msgLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center">No messages</p>
              ) : (
                <div className="max-h-[60vh] space-y-2 overflow-y-auto p-1">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl border p-3 ${m.isFlagged ? "border-red-300 bg-red-50" : "border-border bg-muted/20"}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-foreground text-xs font-bold">
                          {m.sender?.name || m.sender?.phone || "Unknown"}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {new Date(m.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-foreground text-sm">{m.content || `[${m.messageType}]`}</p>
                      {m.isFlagged && (
                        <div className="mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                          <span className="text-[10px] text-red-600">
                            {m.flagReason || "Flagged"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </MobileDrawer>
          )}
        </div>
      </PullToRefresh>
    </ErrorBoundary>
  );
}
