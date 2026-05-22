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
import {
  useAddWhitelistEntry,
  useDeleteWhitelistEntry,
  useDeliveryAccess,
  useDeliveryAccessAudit,
  useDeliveryAccessRequests,
  useResolveDeliveryRequest,
  useUpdateDeliveryMode,
  useUpdateWhitelistEntry,
  useUsers,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Store,
  Trash2,
  Truck,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";

const MODE_CARDS = [
  {
    id: "all",
    title: "All",
    icon: "🌐",
    description: "Every customer can order delivery from every store. No restrictions applied.",
    color: "green",
  },
  {
    id: "stores",
    title: "Selected Stores",
    icon: "🏪",
    description: "Only whitelisted vendor stores offer delivery. Others show self-pickup only.",
    color: "blue",
  },
  {
    id: "users",
    title: "Selected Users",
    icon: "👥",
    description: "Only whitelisted customers get delivery. All others see delivery unavailable.",
    color: "purple",
  },
  {
    id: "both",
    title: "Both (Store AND User)",
    icon: "🔐",
    description:
      "Customer must be whitelisted AND ordering from a whitelisted store. Invite-only delivery.",
    color: "orange",
  },
];

const SERVICE_TYPES = ["all", "mart", "food", "pharmacy", "parcel"];

function AddEntryModal({ type, onClose }: { type: "vendor" | "user"; onClose: () => void }) {
  const { toast } = useToast();
  const addMutation = useAddWhitelistEntry();
  const { data: usersData } = useUsers();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [serviceType, setServiceType] = useState("all");
  const [deliveryLabel, setDeliveryLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const allUsers: any[] = usersData?.users || [];
  const filtered = allUsers
    .filter((u: any) => (type === "vendor" ? u.role === "vendor" : u.role === "customer"))
    .filter((u: any) => {
      const q = search.toLowerCase();
      return (
        !search ||
        (u.name ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").includes(q) ||
        (u.storeName ?? "").toLowerCase().includes(q)
      );
    })
    .slice(0, 20);

  const handleAdd = () => {
    if (!selectedId) {
      toast({ title: "Select a " + type, variant: "destructive" });
      return;
    }
    addMutation.mutate(
      {
        type,
        targetId: selectedId,
        serviceType,
        deliveryLabel: type === "vendor" ? deliveryLabel : undefined,
        notes: notes || undefined,
        validUntil: validUntil || undefined,
      },
      {
        onSuccess: () => {
          toast({ title: `${type === "vendor" ? "Store" : "User"} added to whitelist` });
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-500" />
            Add {type === "vendor" ? "Store" : "User"} to Whitelist
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
              Search {type === "vendor" ? "Vendor" : "User"}
            </label>
            <Input
              placeholder={`Search by name${type === "vendor" ? ", store name" : ""}, phone...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          {filtered.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border">
              {filtered.map((u: any) => (
                <div
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className={`cursor-pointer border-b p-3 transition-colors last:border-b-0 ${selectedId === u.id ? "border-blue-200 bg-blue-50" : "hover:bg-muted/30"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{u.storeName || u.name || "—"}</p>
                      <p className="text-muted-foreground text-xs">
                        {u.phone} · {u.name}
                      </p>
                    </div>
                    {selectedId === u.id && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
              Service Type
            </label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((st) => (
                  <SelectItem key={st} value={st} className="capitalize">
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "vendor" && (
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
                Custom Delivery Label (optional)
              </label>
              <Input
                placeholder="e.g. Al-Falah Express"
                value={deliveryLabel}
                onChange={(e) => setDeliveryLabel(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          )}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
              Valid Until (optional)
            </label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
              Admin Note (optional)
            </label>
            <Input
              placeholder="e.g. Partnership contract 2026"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={addMutation.isPending || !selectedId}
              className="flex-1 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
            >
              {addMutation.isPending ? "Adding..." : "Add to Whitelist"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditEntryModal({ entry, onClose }: { entry: any; onClose: () => void }) {
  const { toast } = useToast();
  const updateMutation = useUpdateWhitelistEntry();
  const [deliveryLabel, setDeliveryLabel] = useState(entry.deliveryLabel || "");
  const [notes, setNotes] = useState(entry.notes || "");
  const [validUntil, setValidUntil] = useState(
    entry.validUntil ? new Date(entry.validUntil).toISOString().slice(0, 10) : ""
  );
  const [status, setStatus] = useState(entry.status);

  const handleSave = () => {
    updateMutation.mutate(
      {
        id: entry.id,
        deliveryLabel: entry.type === "vendor" ? deliveryLabel : undefined,
        notes: notes || undefined,
        validUntil: validUntil || undefined,
        status,
      },
      {
        onSuccess: () => {
          toast({ title: "Entry updated" });
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[95vw] max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-orange-500" /> Edit Whitelist Entry
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <div className="bg-muted/30 rounded-xl p-3">
            <p className="text-sm font-medium">{entry.storeName || entry.userName || "—"}</p>
            <p className="text-muted-foreground text-xs">
              {entry.userPhone} · {entry.type} · {entry.serviceType}
            </p>
          </div>
          {entry.type === "vendor" && (
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
                Delivery Label
              </label>
              <Input
                value={deliveryLabel}
                onChange={(e) => setDeliveryLabel(e.target.value)}
                placeholder="Custom label"
                className="h-11 rounded-xl"
              />
            </div>
          )}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
              Valid Until
            </label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
              Notes
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Admin note"
              className="h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold uppercase">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex-1 rounded-xl"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DeliveryAccess() {
  const { toast } = useToast();
  const { data, isLoading, refetch, isFetching } = useDeliveryAccess();
  const { data: requestsData } = useDeliveryAccessRequests();
  const { data: auditData } = useDeliveryAccessAudit();
  const modeMutation = useUpdateDeliveryMode();
  const deleteMutation = useDeleteWhitelistEntry();
  const resolveMutation = useResolveDeliveryRequest();

  const [tab, setTab] = useState<"whitelist" | "requests" | "audit">("whitelist");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [addModal, setAddModal] = useState<"vendor" | "user" | null>(null);
  const [editModal, setEditModal] = useState<any>(null);

  const mode = data?.mode ?? "all";
  const whitelist: any[] = data?.whitelist || [];
  const requests: any[] = requestsData?.requests || [];
  const auditLogs: any[] = auditData?.logs || [];
  const pendingRequests = requests.filter((r: any) => r.status === "pending");

  const handleModeChange = (newMode: string) => {
    modeMutation.mutate(newMode, {
      onSuccess: () => toast({ title: `Mode changed to "${newMode}"` }),
      onError: (e: any) =>
        toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast({ title: "Entry removed" }),
      onError: (e: any) =>
        toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleResolveRequest = (id: string, status: "approved" | "rejected") => {
    resolveMutation.mutate(
      { id, status },
      {
        onSuccess: () => toast({ title: `Request ${status}` }),
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const filtered = whitelist.filter((e: any) => {
    const matchType = typeFilter === "all" || e.type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      (e.userName ?? "").toLowerCase().includes(q) ||
      (e.userPhone ?? "").includes(q) ||
      (e.storeName ?? "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const colorMap: Record<string, string> = {
    green: "bg-green-50 border-green-300 ring-green-400",
    blue: "bg-blue-50 border-blue-300 ring-blue-400",
    purple: "bg-purple-50 border-purple-300 ring-purple-400",
    orange: "bg-orange-50 border-orange-300 ring-orange-400",
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Delivery Access page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Truck}
          title="Delivery Access Control"
          subtitle={`Mode: ${mode} · ${whitelist.length} whitelist entries${pendingRequests.length > 0 ? ` · ${pendingRequests.length} pending requests` : ""}`}
          iconBgClass="bg-blue-100"
          iconColorClass="text-blue-600"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-9 gap-2 rounded-xl"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          }
        />

        <div>
          <p className="text-muted-foreground mb-3 text-sm font-semibold">Delivery Access Mode</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MODE_CARDS.map((card) => {
              const active = mode === card.id;
              return (
                <div
                  key={card.id}
                  onClick={() => handleModeChange(card.id)}
                  className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${active ? `${colorMap[card.color]} ring-2` : "border-border/50 hover:border-border bg-white"}`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-2xl">{card.icon}</span>
                    <p className="text-sm font-bold">{card.title}</p>
                    {active && (
                      <Badge className="border-green-200 bg-green-100 text-[10px] text-green-700">
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {card.description}
                  </p>
                </div>
              );
            })}
          </div>
          {modeMutation.isPending && (
            <p className="mt-2 animate-pulse text-xs text-blue-600">Updating mode...</p>
          )}
        </div>

        <div className="border-border/50 flex gap-2 border-b">
          {(
            [
              { id: "whitelist", label: "Whitelist", icon: Shield },
              {
                id: "requests",
                label: `Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}`,
                icon: Clock,
              },
              { id: "audit", label: "Audit Log", icon: FileText },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? "border-blue-500 text-blue-600" : "text-muted-foreground hover:text-foreground border-transparent"}`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "whitelist" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Search by name, phone, store..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 rounded-xl pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-11 w-full rounded-xl sm:w-40">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="vendor">Vendors</SelectItem>
                  <SelectItem value="user">Users</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setAddModal("vendor")}
                  className="h-11 gap-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Store className="h-4 w-4" /> Add Store
                </Button>
                <Button
                  size="sm"
                  onClick={() => setAddModal("user")}
                  className="h-11 gap-1.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700"
                >
                  <Users className="h-4 w-4" /> Add User
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted h-20 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card className="border-border/50 rounded-2xl">
                <CardContent className="p-12 text-center">
                  <Shield className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
                  <p className="text-muted-foreground font-medium">No whitelist entries</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Add stores or users to control delivery access
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filtered.map((entry: any) => (
                  <Card key={entry.id} className="border-border/50 rounded-2xl">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${entry.type === "vendor" ? "bg-blue-100" : "bg-purple-100"}`}
                          >
                            {entry.type === "vendor" ? "🏪" : "👤"}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold">
                                {entry.storeName || entry.userName || "—"}
                              </p>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {entry.type}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {entry.serviceType}
                              </Badge>
                              <Badge
                                className={`text-[10px] ${entry.status === "active" ? "border-green-200 bg-green-100 text-green-700" : "border-red-200 bg-red-100 text-red-700"}`}
                              >
                                {entry.status}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-xs">{entry.userPhone}</p>
                            {entry.deliveryLabel && (
                              <p className="text-xs font-medium text-blue-600">
                                Label: {entry.deliveryLabel}
                              </p>
                            )}
                            {entry.validUntil && (
                              <p className="text-muted-foreground text-xs">
                                Expires: {new Date(entry.validUntil).toLocaleDateString()}
                              </p>
                            )}
                            {entry.notes && (
                              <p className="text-muted-foreground text-xs italic">{entry.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditModal(entry)}
                            className="h-8 gap-1 rounded-xl text-xs"
                          >
                            <Edit className="h-3 w-3" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(entry.id)}
                            disabled={deleteMutation.isPending}
                            className="h-8 gap-1 rounded-xl border-red-200 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" /> Remove
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

        {tab === "requests" && (
          <div className="space-y-3">
            {requests.length === 0 ? (
              <Card className="rounded-2xl">
                <CardContent className="p-12 text-center">
                  <Clock className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
                  <p className="text-muted-foreground font-medium">No delivery access requests</p>
                </CardContent>
              </Card>
            ) : (
              requests.map((r: any) => (
                <Card key={r.id} className="border-border/50 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-lg">
                          🏪
                        </div>
                        <div>
                          <p className="text-sm font-bold">{r.storeName || r.vendorName || "—"}</p>
                          <p className="text-muted-foreground text-xs">
                            {r.vendorPhone} · Service: {r.serviceType}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Requested: {new Date(r.requestedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`text-[10px] ${r.status === "pending" ? "bg-yellow-100 text-yellow-700" : r.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                        >
                          {r.status}
                        </Badge>
                        {r.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleResolveRequest(r.id, "approved")}
                              disabled={resolveMutation.isPending}
                              className="h-8 gap-1 rounded-xl bg-green-600 text-xs text-white hover:bg-green-700"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResolveRequest(r.id, "rejected")}
                              disabled={resolveMutation.isPending}
                              className="h-8 gap-1 rounded-xl border-red-200 text-xs text-red-600 hover:bg-red-50"
                            >
                              <XCircle className="h-3 w-3" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === "audit" && (
          <div className="space-y-2">
            {auditLogs.length === 0 ? (
              <Card className="rounded-2xl">
                <CardContent className="p-12 text-center">
                  <FileText className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
                  <p className="text-muted-foreground font-medium">No audit log entries yet</p>
                </CardContent>
              </Card>
            ) : (
              auditLogs.map((log: any) => (
                <Card key={log.id} className="border-border/50 rounded-2xl">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="bg-muted/50 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        <FileText className="text-muted-foreground h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{log.action.replace(/_/g, " ")}</p>
                        <p className="text-muted-foreground text-xs">
                          by {log.adminName || log.adminId || "system"} ·{" "}
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                        {log.oldValue && (
                          <p className="text-muted-foreground text-xs">From: {log.oldValue}</p>
                        )}
                        {log.newValue && (
                          <p className="text-muted-foreground text-xs">To: {log.newValue}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {addModal && <AddEntryModal type={addModal} onClose={() => setAddModal(null)} />}
        {editModal && <EditEntryModal entry={editModal} onClose={() => setEditModal(null)} />}
      </div>
    </ErrorBoundary>
  );
}
