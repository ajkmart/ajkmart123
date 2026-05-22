import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useHasPermission } from "@/hooks/usePermissions";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { adminFetch, fetchAdmin } from "@/lib/adminFetcher";
import {
  AlertTriangle,
  BarChart2,
  Bot,
  CheckCircle,
  Crown,
  Download,
  Eye,
  Flag,
  MessageCircle,
  Mic,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

interface DashboardStats {
  activeConversations: number;
  messagesToday: number;
  callsToday: number;
  voiceNotesToday: number;
  flaggedMessages: number;
  aiUsageToday: number;
}

interface ConversationUser {
  name: string | null;
  ajkId: string | null;
}

interface ConversationItem {
  id: string;
  status: string;
  lastMessageAt: string | null;
  participant1?: ConversationUser;
  participant2?: ConversationUser;
}

interface MessageItem {
  id: string;
  content: string;
  originalContent?: string | null;
  maskedContent?: string | null;
  messageType: string;
  isFlagged: boolean;
  createdAt?: string;
  created_at?: string;
  sender?: ConversationUser;
}

interface CallItem {
  id: string;
  status: string;
  duration: number | null;
  startedAt?: string;
  started_at?: string;
  caller?: ConversationUser;
  callee?: ConversationUser;
}

interface AILogItem {
  id: string;
  actionType?: string;
  action_type?: string;
  inputText?: string | null;
  input_text?: string | null;
  outputText?: string | null;
  output_text?: string | null;
  tokensUsed?: number;
  tokens_used?: number;
  createdAt?: string;
  created_at?: string;
  user?: ConversationUser;
}

interface FlagItem {
  id: string;
  reason: string;
  keyword: string | null;
  resolvedAt?: string | null;
  resolved_at?: string | null;
  createdAt?: string;
  created_at?: string;
  message?: { content?: string; original_content?: string };
}

interface RolePermissions {
  chat: boolean;
  voiceCall: boolean;
  voiceNote: boolean;
  fileSharing: boolean;
}

interface RolePairRules {
  customer_vendor: boolean;
  customer_rider: boolean;
  vendor_rider: boolean;
  customer_customer: boolean;
  vendor_vendor: boolean;
  rider_rider: boolean;
}

interface RoleItem {
  id: string;
  name: string;
  description: string;
  permissions: RolePermissions;
  rolePairRules?: RolePairRules;
  categoryRules?: Record<string, boolean>;
  timeWindows?: { start: string; end: string };
  messageLimits?: { maxTextLength: number; maxVoiceDuration: number; dailyLimit: number };
  isPreset: boolean;
  createdByAI: boolean;
}

interface UserItem {
  id: string;
  name: string | null;
  phone: string;
  ajkId: string | null;
  roles: string[] | string;
  commBlocked: boolean;
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className={`rounded-xl p-3 bg-${color}-100`}>
          <Icon className={`h-6 w-6 text-${color}-600`} />
        </div>
        <div>
          <p className="text-muted-foreground text-sm">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const { state: authState } = useAdminAuth();
  const token = authState.accessToken ?? "";

  const { toast } = useToast();

  useEffect(() => {
    adminFetch("/communication/dashboard")
      .then(setStats)
      .catch((err: unknown) => {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to load dashboard stats",
          variant: "destructive",
        });
      });

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      query: { rooms: "admin-fleet" },
      transports: ["polling", "websocket"],
    });

    const handler = (data: Partial<DashboardStats>) => {
      setStats((prev) => (prev ? { ...prev, ...data } : prev));
    };
    socket.on("comm:dashboard:update", handler);

    return () => {
      socket.off("comm:dashboard:update", handler);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!stats)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <StatCard
        title="Active Conversations"
        value={stats.activeConversations}
        icon={MessageCircle}
        color="blue"
      />
      <StatCard
        title="Messages Today"
        value={stats.messagesToday}
        icon={MessageCircle}
        color="green"
      />
      <StatCard title="Calls Today" value={stats.callsToday} icon={Phone} color="purple" />
      <StatCard title="Voice Notes Today" value={stats.voiceNotesToday} icon={Mic} color="orange" />
      <StatCard title="Flagged Messages" value={stats.flaggedMessages} icon={Flag} color="red" />
      <StatCard title="AI Usage Today" value={stats.aiUsageToday} icon={Bot} color="cyan" />
    </div>
  );
}

function SettingsTab() {
  const canSaveSettings = useHasPermission("support.chat.edit");
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [stunServers, setStunServers] = useState<string[]>([
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
  ]);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    adminFetch("/communication/settings")
      .then((d: Record<string, string>) => {
        setSettings(d);
        const stunRaw = d["comm_stun_servers"] || "";
        try {
          const parsed = JSON.parse(stunRaw);
          if (Array.isArray(parsed)) {
            setStunServers(parsed.filter(Boolean));
          } else if (stunRaw) {
            setStunServers(
              stunRaw
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            );
          }
        } catch {
          if (stunRaw) {
            setStunServers(
              stunRaw
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            );
          }
        }
        setLoaded(true);
      })
      .catch((err: unknown) => {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to load communication settings",
          variant: "destructive",
        });
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!canSaveSettings) {
      toast({
        title: "Permission denied",
        description: "You do not have permission to save communication settings.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    setSaveStatus("idle");
    try {
      const nonEmptyStun = stunServers.filter((s) => s.trim());
      const finalStun =
        nonEmptyStun.length > 0
          ? nonEmptyStun
          : ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];
      const merged = { ...settings, comm_stun_servers: JSON.stringify(finalStun) };
      await adminFetch("/communication/settings", { method: "PUT", body: JSON.stringify(merged) });
      if (nonEmptyStun.length === 0) setStunServers(finalStun);
      setSaveStatus("success");
    } catch {
      setSaveStatus("error");
    }
    setSaving(false);
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
  };

  const toggle = (key: string) =>
    setSettings((s) => ({ ...s, [key]: s[key] === "on" ? "off" : "on" }));
  const set = (key: string, value: string) => setSettings((s) => ({ ...s, [key]: value }));

  const addStun = () => setStunServers((s) => [...s, ""]);
  const removeStun = (i: number) => setStunServers((s) => s.filter((_, idx) => idx !== i));
  const updateStun = (i: number, val: string) =>
    setStunServers((s) => s.map((v, idx) => (idx === i ? val : v)));

  if (!loaded)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> Global Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "comm_enabled", label: "Communication System" },
            { key: "comm_chat_enabled", label: "Chat Messaging" },
            { key: "comm_voice_calls_enabled", label: "Voice Calls" },
            { key: "comm_voice_notes_enabled", label: "Voice Notes" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Switch checked={settings[key] === "on"} onCheckedChange={() => toggle(key)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Content Moderation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "comm_hide_phone", label: "Hide Phone Numbers" },
            { key: "comm_hide_email", label: "Hide Email Addresses" },
            { key: "comm_hide_cnic", label: "Hide CNIC Numbers" },
            { key: "comm_hide_bank", label: "Hide Bank Accounts" },
            { key: "comm_hide_address", label: "Hide Addresses" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Switch checked={settings[key] === "on"} onCheckedChange={() => toggle(key)} />
            </div>
          ))}
          <div>
            <Label>Auto-Flag Keywords (comma separated)</Label>
            <Input
              value={settings.comm_flag_keywords || ""}
              onChange={(e) => set("comm_flag_keywords", e.target.value)}
              placeholder="scam, fraud, police"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "comm_translation_enabled", label: "Translation" },
            { key: "comm_chat_assist_enabled", label: "Chat Compose Assist" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Switch checked={settings[key] === "on"} onCheckedChange={() => toggle(key)} />
            </div>
          ))}
          <div>
            <Label>Daily AI Limit per User</Label>
            <Input
              type="number"
              value={settings.comm_daily_ai_limit || "50"}
              onChange={(e) => set("comm_daily_ai_limit", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Message Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Max Message Length</Label>
            <Input
              type="number"
              value={settings.comm_max_message_length || "2000"}
              onChange={(e) => set("comm_max_message_length", e.target.value)}
            />
          </div>
          <div>
            <Label>Max Voice Duration (seconds)</Label>
            <Input
              type="number"
              value={settings.comm_max_voice_duration || "60"}
              onChange={(e) => set("comm_max_voice_duration", e.target.value)}
            />
          </div>
          <div>
            <Label>Max File Size (bytes)</Label>
            <Input
              type="number"
              value={settings.comm_max_file_size || "5242880"}
              onChange={(e) => set("comm_max_file_size", e.target.value)}
            />
          </div>
          <div>
            <Label>Daily Message Limit</Label>
            <Input
              type="number"
              value={settings.comm_daily_message_limit || "500"}
              onChange={(e) => set("comm_daily_message_limit", e.target.value)}
            />
          </div>
          <div>
            <Label>Request Expiry (hours)</Label>
            <Input
              type="number"
              value={settings.comm_request_expiry_hours || "72"}
              onChange={(e) => set("comm_request_expiry_hours", e.target.value)}
            />
          </div>
          <div>
            <Label>Allowed File Types</Label>
            <Input
              value={settings.comm_allowed_file_types || ""}
              onChange={(e) => set("comm_allowed_file_types", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time Window</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Start Time</Label>
            <Input
              type="time"
              value={settings.comm_time_window_start || "00:00"}
              onChange={(e) => set("comm_time_window_start", e.target.value)}
            />
          </div>
          <div>
            <Label>End Time</Label>
            <Input
              type="time"
              value={settings.comm_time_window_end || "23:59"}
              onChange={(e) => set("comm_time_window_end", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WebRTC Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>STUN Servers</Label>
              <Button variant="outline" size="sm" onClick={addStun}>
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {stunServers.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={s}
                    onChange={(e) => updateStun(i, e.target.value)}
                    placeholder="stun:stun.example.com:3478"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeStun(i)}
                    disabled={stunServers.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Multiple STUN servers provide redundancy and improve connection success rates.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Trickle ICE</Label>
              <p className="text-muted-foreground text-xs">
                Sends ICE candidates incrementally, reducing call setup time significantly.
              </p>
            </div>
            <Switch
              checked={settings["comm_trickle_ice_enabled"] !== "off"}
              onCheckedChange={() => toggle("comm_trickle_ice_enabled")}
            />
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <strong>TURN server required for users behind strict firewalls.</strong> Users on
              symmetric NAT (common in corporate networks) cannot connect using STUN alone. Without
              a TURN server, calls will fail for those users.
            </div>
          </div>

          <div>
            <Label>TURN Server</Label>
            <Input
              value={settings.comm_turn_server || ""}
              onChange={(e) => set("comm_turn_server", e.target.value)}
              placeholder="turn:server:3478"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>TURN Username</Label>
              <Input
                value={settings.comm_turn_user || ""}
                onChange={(e) => set("comm_turn_user", e.target.value)}
              />
            </div>
            <div>
              <Label>TURN Password</Label>
              <Input
                type="password"
                value={settings.comm_turn_pass || ""}
                onChange={(e) => set("comm_turn_pass", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Button
          onClick={save}
          disabled={saving || !canSaveSettings}
          title={
            canSaveSettings ? undefined : "You don't have permission to save communication settings"
          }
          className="w-full"
        >
          {saving ? "Saving..." : "Save Settings"}
        </Button>
        {saveStatus === "success" && (
          <p className="text-center text-sm text-green-600">Settings saved successfully.</p>
        )}
        {saveStatus === "error" && (
          <p className="text-destructive text-center text-sm">
            Failed to save settings. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}

function Pagination({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-muted-foreground text-sm">
        Page {page} of {totalPages} ({total} total)
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function ConversationsTab() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedConv, setSelectedConv] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [viewError, setViewError] = useState("");
  const [listError, setListError] = useState("");
  const LIMIT = 20;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    setListError("");
    fetchAdmin(
      `/communication/conversations?search=${encodeURIComponent(debouncedSearch)}&page=${page}&limit=${LIMIT}`
    )
      .then((d) => {
        setConversations((d.data as ConversationItem[]) || []);
        setTotal((d.total as number) || 0);
      })
      .catch((err: unknown) => {
        console.error("[communication] conversations fetch failed:", err);
        setListError("Failed to load conversations. Please try again.");
      });
  }, [debouncedSearch, page]);

  const viewMessages = async (conv: ConversationItem) => {
    setSelectedConv(conv);
    setViewError("");
    try {
      const resp = await fetchAdmin(`/communication/conversations/${conv.id}/messages`);
      setMessages(
        (resp.data as MessageItem[]) || (Array.isArray(resp) ? (resp as MessageItem[]) : [])
      );
    } catch (e: unknown) {
      setViewError(e instanceof Error ? e.message : "Failed to load messages");
      setMessages([]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search by AJK ID or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button
          variant="outline"
          onClick={() => window.open(`/api/admin/communication/export/messages`, "_blank")}
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {listError && <p className="text-destructive text-sm">{listError}</p>}

      {selectedConv ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedConv.participant1?.name || "User"} ↔{" "}
                {selectedConv.participant2?.name || "User"}
              </CardTitle>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedConv(null);
                  setMessages([]);
                }}
              >
                Back
              </Button>
            </div>
            <CardDescription>
              {selectedConv.participant1?.ajkId} ↔ {selectedConv.participant2?.ajkId}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {viewError && <p className="text-destructive mb-2 text-sm">{viewError}</p>}
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg p-3 ${msg.sender?.ajkId === selectedConv.participant1?.ajkId ? "mr-12 ml-0 bg-blue-50" : "mr-0 ml-12 bg-gray-50"}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {msg.sender?.name || "Unknown"} ({msg.sender?.ajkId})
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(msg.createdAt || msg.created_at || "").toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{msg.content}</p>
                  {msg.originalContent && msg.originalContent !== msg.content && (
                    <p className="text-muted-foreground mt-1 text-xs italic">
                      Original (admin only): {msg.originalContent}
                    </p>
                  )}
                  {msg.messageType !== "text" && (
                    <Badge variant="secondary" className="mt-1">
                      {msg.messageType}
                    </Badge>
                  )}
                  {msg.isFlagged && (
                    <Badge variant="destructive" className="mt-1 ml-1">
                      Flagged
                    </Badge>
                  )}
                </div>
              ))}
              {messages.length === 0 && !viewError && (
                <p className="text-muted-foreground py-4 text-center">No messages</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile card list */}
          <section className="space-y-3 md:hidden" aria-label="Conversations">
            {conversations.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No conversations found</p>
            ) : (
              conversations.map((conv) => (
                <Card key={conv.id} className="overflow-hidden rounded-2xl">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {conv.participant1?.name || "Unknown"} ↔{" "}
                          {conv.participant2?.name || "Unknown"}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {conv.participant1?.ajkId} ↔ {conv.participant2?.ajkId}
                        </p>
                      </div>
                      <Badge
                        variant={conv.status === "active" ? "default" : "secondary"}
                        className="shrink-0"
                      >
                        {conv.status}
                      </Badge>
                    </div>
                    <div className="border-border/50 flex items-center justify-between border-t pt-1">
                      <span className="text-muted-foreground text-xs">
                        {conv.lastMessageAt
                          ? new Date(conv.lastMessageAt).toLocaleDateString()
                          : "—"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => viewMessages(conv)}
                      >
                        <Eye className="mr-1 h-3 w-3" aria-hidden="true" /> View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participants</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Message</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((conv) => (
                  <TableRow key={conv.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{conv.participant1?.name || "Unknown"}</span>
                        <span className="text-muted-foreground"> ({conv.participant1?.ajkId})</span>
                        <span className="mx-2">↔</span>
                        <span className="font-medium">{conv.participant2?.name || "Unknown"}</span>
                        <span className="text-muted-foreground"> ({conv.participant2?.ajkId})</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={conv.status === "active" ? "default" : "secondary"}>
                        {conv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => viewMessages(conv)}
                        aria-label="View messages"
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {conversations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                      No conversations found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function CallHistoryTab() {
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState("");
  const LIMIT = 20;

  useEffect(() => {
    setListError("");
    fetchAdmin(`/communication/calls?page=${page}&limit=${LIMIT}`)
      .then((d) => {
        setCalls((d.data as CallItem[]) || []);
        setTotal((d.total as number) || 0);
      })
      .catch((err: unknown) => {
        console.error("[communication] calls fetch failed:", err);
        setListError("Failed to load call history. Please try again.");
      });
  }, [page]);

  const statusColor: Record<string, string> = {
    completed: "default",
    missed: "destructive",
    rejected: "secondary",
    answered: "default",
    initiated: "outline",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => window.open(`/api/admin/communication/export/calls`, "_blank")}
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>
      {listError && <p className="text-destructive text-sm">{listError}</p>}
      {/* Mobile card list */}
      <section className="space-y-3 md:hidden" aria-label="Call history">
        {calls.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No call history</p>
        ) : (
          calls.map((call) => (
            <Card key={call.id} className="overflow-hidden rounded-2xl">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {call.caller?.name || "Unknown"} → {call.callee?.name || "Unknown"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {call.caller?.ajkId} → {call.callee?.ajkId}
                    </p>
                  </div>
                  <Badge
                    variant={
                      (statusColor[call.status] || "secondary") as
                        | "default"
                        | "destructive"
                        | "secondary"
                        | "outline"
                    }
                    className="shrink-0"
                  >
                    {call.status}
                  </Badge>
                </div>
                <div className="border-border/50 text-muted-foreground flex items-center gap-3 border-t pt-1 text-xs">
                  <span>
                    {call.duration
                      ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, "0")}`
                      : "—"}
                  </span>
                  <span>
                    {new Date(call.startedAt || call.started_at || "").toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Caller</TableHead>
              <TableHead>Callee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => (
              <TableRow key={call.id}>
                <TableCell>
                  {call.caller?.name || "Unknown"}{" "}
                  <span className="text-muted-foreground text-xs">({call.caller?.ajkId})</span>
                </TableCell>
                <TableCell>
                  {call.callee?.name || "Unknown"}{" "}
                  <span className="text-muted-foreground text-xs">({call.callee?.ajkId})</span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      (statusColor[call.status] || "secondary") as
                        | "default"
                        | "destructive"
                        | "secondary"
                        | "outline"
                    }
                  >
                    {call.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {call.duration
                    ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, "0")}`
                    : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {new Date(call.startedAt || call.started_at || "").toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {calls.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                  No call history
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
    </div>
  );
}

function AILogsTab() {
  const [logs, setLogs] = useState<AILogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState("");
  const LIMIT = 20;

  useEffect(() => {
    setListError("");
    fetchAdmin(`/communication/ai-logs?page=${page}&limit=${LIMIT}`)
      .then((d) => {
        setLogs((d.data as AILogItem[]) || []);
        setTotal((d.total as number) || 0);
      })
      .catch((err: unknown) => {
        console.error("[communication] ai-logs fetch failed:", err);
        setListError("Failed to load AI logs. Please try again.");
      });
  }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => window.open(`/api/admin/communication/export/ai-logs`, "_blank")}
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>
      {listError && <p className="text-destructive text-sm">{listError}</p>}
      {/* Mobile card list */}
      <section className="space-y-3 md:hidden" aria-label="AI logs">
        {logs.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No AI logs</p>
        ) : (
          logs.map((log) => (
            <Card key={log.id} className="overflow-hidden rounded-2xl">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {log.user?.name || "Unknown"}{" "}
                      <span className="text-muted-foreground font-normal">({log.user?.ajkId})</span>
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {log.inputText || log.input_text || "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {log.actionType || log.action_type}
                  </Badge>
                </div>
                <div className="border-border/50 text-muted-foreground flex items-center gap-3 border-t pt-1 text-xs">
                  <span>{log.tokensUsed || log.tokens_used || 0} tokens</span>
                  <span>
                    {new Date(log.createdAt || log.created_at || "").toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Output</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  {log.user?.name || "Unknown"}{" "}
                  <span className="text-muted-foreground text-xs">({log.user?.ajkId})</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{log.actionType || log.action_type}</Badge>
                </TableCell>
                <TableCell className="max-w-48 truncate text-sm">
                  {log.inputText || log.input_text || "—"}
                </TableCell>
                <TableCell className="max-w-48 truncate text-sm">
                  {log.outputText || log.output_text || "—"}
                </TableCell>
                <TableCell>{log.tokensUsed || log.tokens_used || 0}</TableCell>
                <TableCell className="text-sm">
                  {new Date(log.createdAt || log.created_at || "").toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                  No AI logs
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
    </div>
  );
}

function FlaggedTab() {
  const [flags, setFlags] = useState<FlagItem[]>([]);
  const [status, setStatus] = useState("pending");
  const [resolveErrors, setResolveErrors] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    adminFetch(`/communication/flags?status=${status}`)
      .then((d: FlagItem[] | { data: FlagItem[] }) => setFlags(Array.isArray(d) ? d : d.data))

      .catch((err: unknown) => {
        console.error("[communication] flags fetch failed:", err);
        setFlags([]);
      });
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (id: string) => {
    setResolveErrors((e) => ({ ...e, [id]: "" }));
    try {
      await adminFetch(`/communication/flags/${id}/resolve`, { method: "PATCH" });
      setFlags((f) => f.filter((fl) => fl.id !== id));
    } catch (e: unknown) {
      setResolveErrors((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : "Failed to resolve",
      }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={status === "pending" ? "default" : "outline"}
          onClick={() => setStatus("pending")}
        >
          Pending
        </Button>
        <Button
          variant={status === "resolved" ? "default" : "outline"}
          onClick={() => setStatus("resolved")}
        >
          Resolved
        </Button>
      </div>
      {/* Mobile card list */}
      <section className="space-y-3 md:hidden" aria-label="Flagged messages">
        {flags.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No flagged messages</p>
        ) : (
          flags.map((flag) => (
            <Card key={flag.id} className="overflow-hidden rounded-2xl">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {flag.reason}{" "}
                      {flag.keyword && (
                        <span className="text-muted-foreground font-normal">· {flag.keyword}</span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {flag.message?.content || flag.message?.original_content || "—"}
                    </p>
                  </div>
                  {!flag.resolvedAt && !flag.resolved_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0 text-green-600"
                      onClick={() => resolve(flag.id)}
                      aria-label="Resolve flag"
                    >
                      <CheckCircle className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <div className="border-border/50 text-muted-foreground border-t pt-1 text-xs">
                  <span>
                    {new Date(flag.createdAt || flag.created_at || "").toLocaleDateString()}
                  </span>
                  {resolveErrors[flag.id] && (
                    <p className="text-destructive mt-1">{resolveErrors[flag.id]}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reason</TableHead>
              <TableHead>Keyword</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.map((flag) => (
              <TableRow key={flag.id}>
                <TableCell>{flag.reason}</TableCell>
                <TableCell>{flag.keyword || "—"}</TableCell>
                <TableCell className="max-w-64 truncate text-sm">
                  {flag.message?.content || flag.message?.original_content || "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {new Date(flag.createdAt || flag.created_at || "").toLocaleString()}
                </TableCell>
                <TableCell>
                  {!flag.resolvedAt && !flag.resolved_at && (
                    <div className="space-y-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolve(flag.id)}
                        aria-label="Resolve flag"
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
                      </Button>
                      {resolveErrors[flag.id] && (
                        <p className="text-destructive text-xs">{resolveErrors[flag.id]}</p>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {flags.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                  No flagged messages
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const ROLE_PAIR_LABELS: Record<string, string> = {
  customer_vendor: "Customer ↔ Vendor",
  customer_rider: "Customer ↔ Rider",
  vendor_rider: "Vendor ↔ Rider",
  customer_customer: "Customer ↔ Customer",
  vendor_vendor: "Vendor ↔ Vendor",
  rider_rider: "Rider ↔ Rider",
};

const CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  mart: "Mart",
  pharmacy: "Pharmacy",
  parcel: "Parcel",
};

const DEFAULT_ROLE_PAIR_RULES: RolePairRules = {
  customer_vendor: true,
  customer_rider: false,
  vendor_rider: false,
  customer_customer: false,
  vendor_vendor: false,
  rider_rider: false,
};

const DEFAULT_CATEGORY_RULES: Record<string, boolean> = {
  food: true,
  mart: true,
  pharmacy: true,
  parcel: true,
};

type RoleFormState = {
  name: string;
  description: string;
  permissions: RolePermissions;
  rolePairRules: RolePairRules;
  categoryRules: Record<string, boolean>;
  timeWindows: { start: string; end: string };
  messageLimits: { maxTextLength: number; maxVoiceDuration: number; dailyLimit: number };
};

const DEFAULT_FORM: RoleFormState = {
  name: "",
  description: "",
  permissions: { chat: true, voiceCall: false, voiceNote: false, fileSharing: false },
  rolePairRules: { ...DEFAULT_ROLE_PAIR_RULES },
  categoryRules: { ...DEFAULT_CATEGORY_RULES },
  timeWindows: { start: "08:00", end: "22:00" },
  messageLimits: { maxTextLength: 2000, maxVoiceDuration: 60, dailyLimit: 500 },
};

function RoleFormDialog({
  open,
  onOpenChange,
  initialData,
  editId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData?: Partial<RoleFormState>;
  editId?: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<RoleFormState>(DEFAULT_FORM);
  const [aiDescription, setAiDescription] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...DEFAULT_FORM, ...initialData } : { ...DEFAULT_FORM });
      setAiDescription("");
      setAiError("");
      setSaveError("");
      setAiAvailable(null);
      adminFetch("/communication/roles/ai-status")
        .then(() => setAiAvailable(true))
        .catch((_err: unknown) => {
          setAiAvailable(false);
        });
    }
  }, [open, initialData]);

  const generateWithAI = async () => {
    if (!aiDescription) return;
    if (aiAvailable === false) {
      const msg =
        "AI generation is not available. Check your AI provider configuration in Platform Settings.";
      setAiError(msg);
      toast({ title: "AI Unavailable", description: msg, variant: "destructive" });
      return;
    }
    setAiGenerating(true);
    setAiError("");
    try {
      const result = await adminFetch("/communication/roles/ai-generate", {
        method: "POST",
        body: JSON.stringify({ description: aiDescription }),
      });
      const data = (result as { data?: Partial<RoleItem> }).data || result;
      setForm((prev) => ({
        ...prev,
        name: (data as Partial<RoleFormState>).name || prev.name,
        description: aiDescription,
        permissions: (data as Partial<RoleFormState>).permissions || prev.permissions,
        rolePairRules: (data as Partial<RoleFormState>).rolePairRules || prev.rolePairRules,
        categoryRules: (data as Partial<RoleFormState>).categoryRules || prev.categoryRules,
        timeWindows: (data as Partial<RoleFormState>).timeWindows || prev.timeWindows,
        messageLimits: (data as Partial<RoleFormState>).messageLimits || prev.messageLimits,
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "AI generation failed";
      setAiError(msg);
      toast({ title: "AI Unavailable", description: msg, variant: "destructive" });
    }
    setAiGenerating(false);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setSaveError("");
    try {
      if (editId) {
        await adminFetch(`/communication/roles/${editId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await adminFetch("/communication/roles", { method: "POST", body: JSON.stringify(form) });
      }
      onOpenChange(false);
      onSaved();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save role");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editId ? "Edit Communication Role" : "Create Communication Role"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {!editId && (
            <div className="bg-muted/50 rounded-lg border p-4">
              <Label className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI-Assisted Creation
              </Label>
              <Textarea
                placeholder="Describe the role in plain language, e.g., 'Customer can only chat with vendor during active order, no calls allowed'"
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={generateWithAI}
                disabled={aiGenerating}
              >
                {aiGenerating ? "Generating..." : "Generate with AI"}
              </Button>
              {aiError && <p className="text-destructive mt-1 text-sm">{aiError}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((r) => ({ ...r, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((r) => ({ ...r, description: e.target.value }))}
              />
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Feature Permissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(Object.entries(form.permissions) as [keyof RolePermissions, boolean][]).map(
                ([key, val]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                    <Switch
                      checked={val}
                      onCheckedChange={(v) =>
                        setForm((r) => ({ ...r, permissions: { ...r.permissions, [key]: v } }))
                      }
                    />
                  </div>
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Role-Pair Communication Rules</CardTitle>
              <CardDescription>Which user types can communicate with each other</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(Object.entries(form.rolePairRules) as [keyof RolePairRules, boolean][]).map(
                ([key, val]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm">{ROLE_PAIR_LABELS[key] || key}</span>
                    <Switch
                      checked={val}
                      onCheckedChange={(v) =>
                        setForm((r) => ({ ...r, rolePairRules: { ...r.rolePairRules, [key]: v } }))
                      }
                    />
                  </div>
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Category Rules</CardTitle>
              <CardDescription>Which order categories this role applies to</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(form.categoryRules).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{CATEGORY_LABELS[key] || key}</span>
                  <Switch
                    checked={val}
                    onCheckedChange={(v) =>
                      setForm((r) => ({ ...r, categoryRules: { ...r.categoryRules, [key]: v } }))
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Time Window & Limits</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Time</Label>
                <Input
                  type="time"
                  value={form.timeWindows.start}
                  onChange={(e) =>
                    setForm((r) => ({
                      ...r,
                      timeWindows: { ...r.timeWindows, start: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">End Time</Label>
                <Input
                  type="time"
                  value={form.timeWindows.end}
                  onChange={(e) =>
                    setForm((r) => ({
                      ...r,
                      timeWindows: { ...r.timeWindows, end: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Max Text Length</Label>
                <Input
                  type="number"
                  value={form.messageLimits.maxTextLength}
                  onChange={(e) =>
                    setForm((r) => ({
                      ...r,
                      messageLimits: {
                        ...r.messageLimits,
                        maxTextLength: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Max Voice Duration (s)</Label>
                <Input
                  type="number"
                  value={form.messageLimits.maxVoiceDuration}
                  onChange={(e) =>
                    setForm((r) => ({
                      ...r,
                      messageLimits: {
                        ...r.messageLimits,
                        maxVoiceDuration: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Daily Message Limit</Label>
                <Input
                  type="number"
                  value={form.messageLimits.dailyLimit}
                  onChange={(e) =>
                    setForm((r) => ({
                      ...r,
                      messageLimits: {
                        ...r.messageLimits,
                        dailyLimit: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>
        {saveError && <p className="text-destructive text-sm">{saveError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : editId ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleTemplatesTab() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [listError, setListError] = useState("");

  const loadRoles = () => {
    setListError("");
    adminFetch("/communication/roles")
      .then((d: RoleItem[] | { data: RoleItem[] }) => setRoles(Array.isArray(d) ? d : d.data))
      .catch((err: unknown) => {
        console.error("[communication] roles fetch failed:", err);
        setListError("Failed to load role templates. Please try again.");
      });
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const deleteRole = async (id: string) => {
    setDeleteErrors((e) => ({ ...e, [id]: "" }));
    try {
      await adminFetch(`/communication/roles/${id}`, { method: "DELETE" });
      setRoles((r) => r.filter((rl) => rl.id !== id));
    } catch (e: unknown) {
      setDeleteErrors((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : "Failed to delete",
      }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Communication Role Templates</h3>
        <Button onClick={() => setCreating(true)}>Create Role</Button>
      </div>

      {listError && <p className="text-destructive text-sm">{listError}</p>}

      <RoleFormDialog open={creating} onOpenChange={setCreating} onSaved={loadRoles} />

      <RoleFormDialog
        open={!!editingRole}
        onOpenChange={(open) => {
          if (!open) setEditingRole(null);
        }}
        initialData={
          editingRole
            ? {
                name: editingRole.name,
                description: editingRole.description,
                permissions: editingRole.permissions,
                rolePairRules: editingRole.rolePairRules,
                categoryRules: editingRole.categoryRules,
                timeWindows: editingRole.timeWindows,
                messageLimits: editingRole.messageLimits,
              }
            : undefined
        }
        editId={editingRole?.id}
        onSaved={loadRoles}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{role.name}</CardTitle>
                  <CardDescription>{role.description}</CardDescription>
                </div>
                <div className="flex gap-1">
                  {role.isPreset && <Badge variant="secondary">Preset</Badge>}
                  {role.createdByAI && <Badge variant="outline">AI</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium">Features</p>
                <div className="flex flex-wrap gap-1">
                  {role.permissions &&
                    Object.entries(role.permissions)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <Badge key={k} variant="outline" className="text-xs capitalize">
                          {k.replace(/([A-Z])/g, " $1")}
                        </Badge>
                      ))}
                </div>
              </div>
              {role.rolePairRules && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Allowed Pairs</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(role.rolePairRules)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <Badge key={k} variant="secondary" className="text-xs">
                          {ROLE_PAIR_LABELS[k] || k}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}
              {role.categoryRules && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Categories</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(role.categoryRules)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <Badge key={k} className="bg-blue-100 text-xs text-blue-700">
                          {CATEGORY_LABELS[k] || k}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}
              {role.timeWindows && (
                <p className="text-muted-foreground text-xs">
                  Time: {role.timeWindows.start} – {role.timeWindows.end}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingRole(role)}>
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit
                </Button>
                {!role.isPreset && (
                  <Button variant="destructive" size="sm" onClick={() => deleteRole(role.id)}>
                    Delete
                  </Button>
                )}
              </div>
              {deleteErrors[role.id] && (
                <p className="text-destructive text-xs">{deleteErrors[role.id]}</p>
              )}
            </CardContent>
          </Card>
        ))}
        {roles.length === 0 && (
          <p className="text-muted-foreground col-span-2 py-8 text-center">No role templates</p>
        )}
      </div>
    </div>
  );
}

function AjkIdsTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [editId, setEditId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchResults, setSearchResults] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const LIMIT = 20;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter]);

  const loadUsers = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (roleFilter) params.set("role", roleFilter);
    params.set("page", String(page));
    params.set("limit", String(LIMIT));
    fetchAdmin(`/communication/ajk-ids?${params.toString()}`)
      .then((d) => {
        setUsers((d.data as UserItem[]) || []);
        setTotal((d.total as number) || 0);
      })

      .catch((err: unknown) => {
        console.error("[communication] ajk-ids fetch failed:", err);
      });
  }, [debouncedSearch, roleFilter, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const searchUsers = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const data = await adminFetch(`/communication/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data as UserItem[]);
    } catch (_err) {
      setSearchResults([]);
      toast({
        title: "User search failed",
        description: "Could not fetch search results. Please try again.",
        variant: "destructive",
      });
    }
  };

  const saveAjkId = async () => {
    if (!editUser || !editId.trim()) return;
    setSaving(true);
    setError("");
    try {
      await adminFetch(`/communication/ajk-ids/${editUser.id}`, {
        method: "PUT",
        body: JSON.stringify({ ajkId: editId.trim() }),
      });
      setEditUser(null);
      setEditId("");
      loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
    setSaving(false);
  };

  const toggleBlock = async (user: UserItem) => {
    setBlockingId(user.id);
    setBlockErrors((e) => ({ ...e, [user.id]: "" }));
    try {
      const action = user.commBlocked ? "unblock" : "block";
      await adminFetch(`/communication/users/${user.id}/${action}`, { method: "POST" });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, commBlocked: !u.commBlocked } : u))
      );
    } catch (e: unknown) {
      setBlockErrors((prev) => ({
        ...prev,
        [user.id]: e instanceof Error ? e.message : "Action failed",
      }));
    }
    setBlockingId(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" /> Gold / Custom AJK IDs
          </CardTitle>
          <CardDescription>
            Assign custom or "gold" AJK IDs to any user, vendor, rider, or admin. Search by name,
            phone, or current AJK ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
              <Input
                placeholder="Search by name, phone, or AJK ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-10 rounded-md border px-3 text-sm"
            >
              <option value="">All Roles</option>
              <option value="customer">Customer</option>
              <option value="vendor">Vendor</option>
              <option value="rider">Rider</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Mobile card list */}
          <section className="space-y-3 md:hidden" aria-label="AJK ID users">
            {users.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No users found</p>
            ) : (
              users.map((u) => (
                <Card key={u.id} className="overflow-hidden rounded-2xl">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{u.name || "—"}</p>
                        <p className="text-muted-foreground text-xs">{u.phone}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant="outline" className="text-xs">
                          {Array.isArray(u.roles) ? u.roles.join(", ") : u.roles || "customer"}
                        </Badge>
                        {u.commBlocked ? (
                          <Badge variant="destructive" className="text-xs">
                            Blocked
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-xs text-green-700">Active</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-primary font-mono text-sm font-bold">{u.ajkId}</p>
                    <div className="border-border/50 flex items-center gap-2 border-t pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 px-2 text-xs"
                        onClick={() => {
                          setEditUser(u);
                          setEditId(u.ajkId || "");
                          setError("");
                        }}
                      >
                        <Pencil className="mr-1 h-3 w-3" aria-hidden="true" /> Edit ID
                      </Button>
                      <Button
                        size="sm"
                        variant={u.commBlocked ? "outline" : "destructive"}
                        className="h-7 flex-1 px-2 text-xs"
                        onClick={() => toggleBlock(u)}
                        disabled={blockingId === u.id}
                      >
                        {blockingId === u.id ? "..." : u.commBlocked ? "Unblock" : "Block"}
                      </Button>
                    </div>
                    {blockErrors[u.id] && (
                      <p className="text-destructive text-xs">{blockErrors[u.id]}</p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </section>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Current AJK ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{u.name || "—"}</p>
                        <p className="text-muted-foreground text-xs">{u.phone}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {Array.isArray(u.roles) ? u.roles.join(", ") : u.roles || "customer"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-primary font-mono font-bold">{u.ajkId}</span>
                    </TableCell>
                    <TableCell>
                      {u.commBlocked ? (
                        <Badge variant="destructive">Blocked</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditUser(u);
                            setEditId(u.ajkId || "");
                            setError("");
                          }}
                        >
                          <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                          Edit ID
                        </Button>
                        <Button
                          size="sm"
                          variant={u.commBlocked ? "outline" : "destructive"}
                          onClick={() => toggleBlock(u)}
                          disabled={blockingId === u.id}
                        >
                          {blockingId === u.id ? "..." : u.commBlocked ? "Unblock" : "Block"}
                        </Button>
                      </div>
                      {blockErrors[u.id] && (
                        <p className="text-destructive mt-1 text-xs">{blockErrors[u.id]}</p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" /> Assign Gold Number
          </CardTitle>
          <CardDescription>
            Search for any user and assign them a custom AJK ID — like a "gold number" (e.g.,
            AJK-AHMED1, AJK-VIP001, AJK-GOLD99)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
            <Input
              placeholder="Search user by name, phone, or AJK ID..."
              value={searchQuery}
              onChange={(e) => searchUsers(e.target.value)}
              className="pl-10"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-60 divide-y overflow-y-auto rounded-lg border">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setEditUser(u);
                    setEditId(u.ajkId || "");
                    setError("");
                    setSearchResults([]);
                    setSearchQuery("");
                  }}
                  className="hover:bg-muted/50 flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="font-medium">{u.name || "Unknown"}</p>
                    <p className="text-muted-foreground text-xs">
                      {u.phone} &middot; {Array.isArray(u.roles) ? u.roles.join(", ") : u.roles}
                    </p>
                  </div>
                  <span className="text-primary font-mono text-sm">{u.ajkId || "No AJK ID"}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editUser}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" /> Edit AJK ID
            </DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium">{editUser.name || "Unknown"}</p>
                <p className="text-muted-foreground text-sm">
                  {editUser.phone} &middot;{" "}
                  {Array.isArray(editUser.roles) ? editUser.roles.join(", ") : editUser.roles}
                </p>
                {editUser.ajkId && (
                  <p className="mt-1 text-sm">
                    Current: <span className="font-mono font-bold">{editUser.ajkId}</span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>New AJK ID (Gold Number)</Label>
                <Input
                  value={editId}
                  onChange={(e) => {
                    setEditId(e.target.value.toUpperCase());
                    setError("");
                  }}
                  placeholder="e.g. AJK-AHMED1, AJK-VIP001, AJK-GOLD99"
                  className="font-mono"
                />
                <p className="text-muted-foreground text-xs">
                  Only uppercase letters, numbers, and hyphens. 3-20 characters.
                </p>
                {error && <p className="text-destructive text-sm">{error}</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button onClick={saveAjkId} disabled={saving || !editId.trim()}>
              {saving ? "Saving..." : "Save Gold ID"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Communication() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageCircle}
        title="Communication System"
        subtitle="Manage chat, calls, voice notes, AI features, and moderation"
        iconBgClass="bg-cyan-100"
        iconColorClass="text-cyan-600"
      />

      <Tabs defaultValue="dashboard">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8">
          <TabsTrigger value="dashboard">
            <BarChart2 className="mr-1 hidden h-4 w-4 sm:block" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="mr-1 hidden h-4 w-4 sm:block" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="conversations">
            <MessageCircle className="mr-1 hidden h-4 w-4 sm:block" />
            Chats
          </TabsTrigger>
          <TabsTrigger value="calls">
            <Phone className="mr-1 hidden h-4 w-4 sm:block" />
            Calls
          </TabsTrigger>
          <TabsTrigger value="ai-logs">
            <Bot className="mr-1 hidden h-4 w-4 sm:block" />
            AI Logs
          </TabsTrigger>
          <TabsTrigger value="flagged">
            <Flag className="mr-1 hidden h-4 w-4 sm:block" />
            Flagged
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Users className="mr-1 hidden h-4 w-4 sm:block" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="ajk-ids">
            <Crown className="mr-1 hidden h-4 w-4 sm:block" />
            AJK IDs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <ErrorBoundary
            fallback={
              <div className="py-8 text-center text-sm text-red-500">
                Dashboard stats unavailable. Please refresh.
              </div>
            }
          >
            <DashboardTab />
          </ErrorBoundary>
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="conversations">
          <ConversationsTab />
        </TabsContent>
        <TabsContent value="calls">
          <CallHistoryTab />
        </TabsContent>
        <TabsContent value="ai-logs">
          <AILogsTab />
        </TabsContent>
        <TabsContent value="flagged">
          <FlaggedTab />
        </TabsContent>
        <TabsContent value="roles">
          <RoleTemplatesTab />
        </TabsContent>
        <TabsContent value="ajk-ids">
          <AjkIdsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
