import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { adminAbsoluteFetch } from "@/lib/adminFetcher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bus,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  MoreHorizontal,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Save,
  Settings,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { useState } from "react";

async function vanFetch(path: string, opts: RequestInit = {}) {
  return adminAbsoluteFetch(`/api/van${path}`, opts);
}

type SeatTier = "window" | "aisle" | "economy";

const TIER_COLORS: Record<SeatTier, string> = {
  window: "bg-amber-100 text-amber-800 border-amber-300",
  aisle: "bg-blue-100 text-blue-800 border-blue-300",
  economy: "bg-green-100 text-green-800 border-green-300",
};

interface VanRoute {
  id: string;
  name: string;
  nameUrdu?: string;
  fromAddress: string;
  toAddress: string;
  farePerSeat: string;
  fareWindow?: string | null;
  fareAisle?: string | null;
  fareEconomy?: string | null;
  distanceKm?: string;
  durationMin?: number;
  isActive: boolean;
  sortOrder: number;
  notes?: string;
}
interface VanVehicle {
  id: string;
  plateNumber: string;
  model: string;
  totalSeats: number;
  seatLayout?: { seatsPerRow?: number; seats?: Record<string, SeatTier> } | null;
  isActive: boolean;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
}
interface VanSchedule {
  id: string;
  routeId: string;
  vehicleId?: string;
  driverId?: string;
  departureTime: string;
  returnTime?: string;
  daysOfWeek: number[];
  tripStatus?: string;
  isActive: boolean;
  routeName?: string;
  vehiclePlate?: string;
  driverName?: string;
  vanCode?: string | null;
}
interface VanBooking {
  id: string;
  userId: string;
  scheduleId: string;
  seatNumbers: number[];
  seatTiers?: Record<string, SeatTier> | null;
  tierBreakdown?: Record<string, { count: number; fare: number }> | null;
  travelDate: string;
  status: string;
  fare: string;
  paymentMethod: string;
  passengerName?: string;
  tripStatus?: string;
  createdAt: string;
  routeName?: string;
  routeFrom?: string;
  routeTo?: string;
  departureTime?: string;
  userName?: string;
  userPhone?: string;
}
interface VanDriver {
  id: string;
  userId: string;
  vanCode: string;
  approvalStatus: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
}

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-800",
  boarded: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

/* ══════════════════════════════════════════════════════════
   ROUTES TAB
══════════════════════════════════════════════════════════ */
function RoutesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editRoute, setEditRoute] = useState<VanRoute | null>(null);
  const [newRouteOpen, setNewRouteOpen] = useState(false);
  const [routeDeleteId, setRouteDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    fromAddress: "",
    toAddress: "",
    farePerSeat: "",
    fareWindow: "",
    fareAisle: "",
    fareEconomy: "",
    distanceKm: "",
    durationMin: "",
    notes: "",
  });

  const { data: routes = [], isLoading } = useQuery<VanRoute[]>({
    queryKey: ["van-admin-routes"],
    queryFn: () => vanFetch("/admin/routes"),
  });

  const saveMut = useMutation({
    mutationFn: (data: Partial<typeof form> & { id?: string }) => {
      const { id, ...body } = data;
      const payload: Record<string, unknown> = {
        name: body.name,
        fromAddress: body.fromAddress,
        toAddress: body.toAddress,
        farePerSeat: parseFloat(body.farePerSeat || "0"),
      };
      if (body.fareWindow) payload.fareWindow = parseFloat(body.fareWindow);
      if (body.fareAisle) payload.fareAisle = parseFloat(body.fareAisle);
      if (body.fareEconomy) payload.fareEconomy = parseFloat(body.fareEconomy);
      if (body.distanceKm) payload.distanceKm = parseFloat(body.distanceKm);
      if (body.durationMin) payload.durationMin = parseInt(body.durationMin);
      if (body.notes) payload.notes = body.notes;
      return id
        ? vanFetch(`/admin/routes/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : vanFetch("/admin/routes", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-routes"] });
      setEditRoute(null);
      setNewRouteOpen(false);
      toast({ title: "Route saved" });
    },
    onError: (e: Error) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => vanFetch(`/admin/routes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-routes"] });
      toast({ title: "Route deactivated" });
    },
    onError: (e: Error) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  function openNew() {
    setForm({
      name: "",
      fromAddress: "",
      toAddress: "",
      farePerSeat: "",
      fareWindow: "",
      fareAisle: "",
      fareEconomy: "",
      distanceKm: "",
      durationMin: "",
      notes: "",
    });
    setNewRouteOpen(true);
  }
  function openEdit(r: VanRoute) {
    setEditRoute(r);
    setForm({
      name: r.name,
      fromAddress: r.fromAddress,
      toAddress: r.toAddress,
      farePerSeat: String(r.farePerSeat),
      fareWindow: r.fareWindow ? String(r.fareWindow) : "",
      fareAisle: r.fareAisle ? String(r.fareAisle) : "",
      fareEconomy: r.fareEconomy ? String(r.fareEconomy) : "",
      distanceKm: r.distanceKm || "",
      durationMin: r.durationMin ? String(r.durationMin) : "",
      notes: r.notes || "",
    });
  }

  const RouteFormDialog = ({
    open,
    onClose,
    id,
  }: {
    open: boolean;
    onClose: () => void;
    id?: string;
  }) => (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{id ? "Edit Route" : "New Route"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Route name (e.g. Rawalpindi → Islamabad)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            placeholder="From address"
            value={form.fromAddress}
            onChange={(e) => setForm((f) => ({ ...f, fromAddress: e.target.value }))}
          />
          <Input
            placeholder="To address"
            value={form.toAddress}
            onChange={(e) => setForm((f) => ({ ...f, toAddress: e.target.value }))}
          />
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              Tiered Pricing (per seat)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-amber-700">🪟 Window</label>
                <Input
                  placeholder="Rs"
                  type="number"
                  value={form.fareWindow}
                  onChange={(e) => setForm((f) => ({ ...f, fareWindow: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-blue-700">💺 Aisle</label>
                <Input
                  placeholder="Rs"
                  type="number"
                  value={form.fareAisle}
                  onChange={(e) => setForm((f) => ({ ...f, fareAisle: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-green-700">🎒 Economy</label>
                <Input
                  placeholder="Rs"
                  type="number"
                  value={form.fareEconomy}
                  onChange={(e) => setForm((f) => ({ ...f, fareEconomy: e.target.value }))}
                />
              </div>
            </div>
            <Input
              placeholder="Default fare/seat (fallback)"
              type="number"
              value={form.farePerSeat}
              onChange={(e) => setForm((f) => ({ ...f, farePerSeat: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Distance km"
              type="number"
              value={form.distanceKm}
              onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))}
            />
            <Input
              placeholder="Duration min"
              type="number"
              value={form.durationMin}
              onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
            />
          </div>
          <Input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMut.mutate({ ...form, ...(id ? { id } : {}) })}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {routes.length} route{routes.length !== 1 ? "s" : ""}
        </span>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" />
          New Route
        </Button>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <>
          {/* Mobile card list */}
          <section className="space-y-3 md:hidden" aria-label="Routes">
            {routes.map((r) => (
              <Card key={r.id} className="overflow-hidden rounded-2xl">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{r.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {r.fromAddress} → {r.toAddress}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={r.isActive ? "default" : "secondary"} className="text-xs">
                        {r.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label="Open actions menu"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(r)}>
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => setRouteDeleteId(r.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Deactivate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="border-border/50 grid grid-cols-3 gap-2 border-t pt-1 text-xs">
                    <div>
                      <p className="text-muted-foreground">Window</p>
                      <p className="font-semibold text-amber-700">
                        {r.fareWindow ? `Rs ${parseFloat(r.fareWindow).toFixed(0)}` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Aisle</p>
                      <p className="font-semibold text-blue-700">
                        {r.fareAisle ? `Rs ${parseFloat(r.fareAisle).toFixed(0)}` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Economy</p>
                      <p className="font-semibold text-green-700">
                        {r.fareEconomy ? `Rs ${parseFloat(r.fareEconomy).toFixed(0)}` : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Aisle</TableHead>
                  <TableHead>Economy</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">
                      {r.fromAddress} → {r.toAddress}
                    </TableCell>
                    <TableCell className="font-semibold text-amber-700">
                      {r.fareWindow ? `Rs ${parseFloat(r.fareWindow).toFixed(0)}` : "—"}
                    </TableCell>
                    <TableCell className="font-semibold text-blue-700">
                      {r.fareAisle ? `Rs ${parseFloat(r.fareAisle).toFixed(0)}` : "—"}
                    </TableCell>
                    <TableCell className="font-semibold text-green-700">
                      {r.fareEconomy ? `Rs ${parseFloat(r.fareEconomy).toFixed(0)}` : "—"}
                    </TableCell>
                    <TableCell className="font-semibold text-gray-600">
                      Rs {parseFloat(r.farePerSeat).toFixed(0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.isActive ? "default" : "secondary"}>
                        {r.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(r)}
                        aria-label="Edit route"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setRouteDeleteId(r.id)}
                        aria-label="Deactivate route"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <RouteFormDialog open={newRouteOpen} onClose={() => setNewRouteOpen(false)} />
      {editRoute && (
        <RouteFormDialog open={!!editRoute} onClose={() => setEditRoute(null)} id={editRoute.id} />
      )}

      <Dialog
        open={!!routeDeleteId}
        onOpenChange={(v) => {
          if (!v) setRouteDeleteId(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Deactivate Route</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2 text-sm">
            Are you sure you want to deactivate this route?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (routeDeleteId) deleteMut.mutate(routeDeleteId);
                setRouteDeleteId(null);
              }}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   VEHICLES TAB (with seat layout tier editor)
══════════════════════════════════════════════════════════ */
function VehiclesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editVehicle, setEditVehicle] = useState<VanVehicle | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({
    plateNumber: "",
    model: "Suzuki Carry",
    totalSeats: "12",
    seatsPerRow: "4",
    driverId: "",
  });
  const [seatTiers, setSeatTiers] = useState<Record<string, SeatTier>>({});

  const { data: vehicles = [], isLoading } = useQuery<VanVehicle[]>({
    queryKey: ["van-admin-vehicles"],
    queryFn: () => vanFetch("/admin/vehicles"),
  });

  function initSeatTiers(
    totalSeats: number,
    seatsPerRow: number,
    existing?: Record<string, SeatTier>
  ) {
    const tiers: Record<string, SeatTier> = {};
    for (let i = 1; i <= totalSeats; i++) {
      if (existing && existing[String(i)]) {
        tiers[String(i)] = existing[String(i)]!;
      } else {
        const posInRow = (i - 1) % seatsPerRow;
        const isLastRow = i > totalSeats - seatsPerRow;
        if (isLastRow) tiers[String(i)] = "economy";
        else if (posInRow === 0 || posInRow === seatsPerRow - 1) tiers[String(i)] = "window";
        else tiers[String(i)] = "aisle";
      }
    }
    setSeatTiers(tiers);
  }

  const saveMut = useMutation({
    mutationFn: (data: typeof form & { id?: string }) => {
      const { id, ...body } = data;
      const payload = {
        plateNumber: body.plateNumber,
        model: body.model,
        totalSeats: parseInt(body.totalSeats),
        seatLayout: { seatsPerRow: parseInt(body.seatsPerRow) || 4, seats: seatTiers },
        driverId: body.driverId || null,
      };
      return id
        ? vanFetch(`/admin/vehicles/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : vanFetch("/admin/vehicles", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-vehicles"] });
      setEditVehicle(null);
      setNewOpen(false);
      toast({ title: "Vehicle saved" });
    },
    onError: (e: Error) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  function openNew() {
    setForm({
      plateNumber: "",
      model: "Suzuki Carry",
      totalSeats: "12",
      seatsPerRow: "4",
      driverId: "",
    });
    initSeatTiers(12, 4);
    setNewOpen(true);
  }
  function openEdit(v: VanVehicle) {
    setEditVehicle(v);
    const spr = v.seatLayout?.seatsPerRow ?? 4;
    setForm({
      plateNumber: v.plateNumber,
      model: v.model,
      totalSeats: String(v.totalSeats),
      seatsPerRow: String(spr),
      driverId: v.driverId || "",
    });
    initSeatTiers(v.totalSeats, spr, v.seatLayout?.seats);
  }

  function cycleTier(seatNum: string) {
    setSeatTiers((prev) => {
      const current = prev[seatNum] || "aisle";
      const next: SeatTier =
        current === "window" ? "aisle" : current === "aisle" ? "economy" : "window";
      return { ...prev, [seatNum]: next };
    });
  }

  const VehicleFormDialog = ({
    open,
    onClose,
    id,
  }: {
    open: boolean;
    onClose: () => void;
    id?: string;
  }) => {
    const ts = parseInt(form.totalSeats) || 12;
    const spr = parseInt(form.seatsPerRow) || 4;
    const rows: number[][] = [];
    for (let i = 1; i <= ts; i += spr) {
      rows.push(Array.from({ length: Math.min(spr, ts - i + 1) }, (_, j) => i + j));
    }

    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{id ? "Edit Vehicle" : "New Vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Plate number (e.g. LHR-1234)"
              value={form.plateNumber}
              onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))}
            />
            <Input
              placeholder="Model (e.g. Suzuki Carry)"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-muted-foreground mb-1 block text-xs font-medium">
                  Total seats
                </label>
                <Input
                  type="number"
                  value={form.totalSeats}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, totalSeats: e.target.value }));
                    initSeatTiers(
                      parseInt(e.target.value) || 12,
                      parseInt(form.seatsPerRow) || 4,
                      seatTiers
                    );
                  }}
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-xs font-medium">
                  Seats per row
                </label>
                <Select
                  value={form.seatsPerRow}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, seatsPerRow: v }));
                    initSeatTiers(parseInt(form.totalSeats) || 12, parseInt(v) || 4, seatTiers);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} per row
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Input
              placeholder="Driver user ID (optional)"
              value={form.driverId}
              onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}
            />

            {/* Seat layout tier editor */}
            <div className="rounded-xl border bg-gray-50 p-4">
              <p className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
                Seat Layout — Click to change tier
              </p>
              <div className="mb-3 flex justify-center gap-3">
                {(["window", "aisle", "economy"] as SeatTier[]).map((t) => (
                  <span
                    key={t}
                    className={`rounded border px-2 py-1 text-xs font-bold ${TIER_COLORS[t]}`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </span>
                ))}
              </div>
              <div className="mb-2 flex justify-center">
                <div className="rounded-lg bg-gray-200 px-3 py-1 text-xs font-medium text-gray-500">
                  🚐 Driver
                </div>
              </div>
              <div className="space-y-1.5">
                {rows.map((row, ri) => (
                  <div key={ri} className="flex justify-center gap-1.5">
                    {row.map((num) => {
                      const tier = seatTiers[String(num)] || "aisle";
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => cycleTier(String(num))}
                          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-2 text-xs font-bold transition-colors ${TIER_COLORS[tier]}`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMut.mutate({ ...form, ...(id ? { id } : {}) })}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
        </span>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" />
          New Vehicle
        </Button>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <>
          {/* Mobile card list */}
          <section className="space-y-3 md:hidden" aria-label="Vehicles">
            {vehicles.map((v) => (
              <Card key={v.id} className="overflow-hidden rounded-2xl">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{v.plateNumber}</p>
                      <p className="text-muted-foreground text-xs">
                        {v.model} · {v.totalSeats} seats
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {v.driverName || "Unassigned"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={v.isActive ? "default" : "secondary"} className="text-xs">
                        {v.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(v)}
                        aria-label="Edit vehicle"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plate</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono font-semibold">{v.plateNumber}</TableCell>
                    <TableCell>{v.model}</TableCell>
                    <TableCell>{v.totalSeats}</TableCell>
                    <TableCell className="text-sm">
                      {v.driverName || <span className="text-muted-foreground">Unassigned</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={v.isActive ? "default" : "secondary"}>
                        {v.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(v)}
                        aria-label="Edit vehicle"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <VehicleFormDialog open={newOpen} onClose={() => setNewOpen(false)} />
      {editVehicle && (
        <VehicleFormDialog
          open={!!editVehicle}
          onClose={() => setEditVehicle(null)}
          id={editVehicle.id}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SEAT INVENTORY MODAL
══════════════════════════════════════════════════════════ */
interface SeatAvailability {
  scheduleId: string;
  date: string;
  available: boolean;
  bookedSeats: number[];
  availableSeats: number;
  totalSeats: number;
  seatsPerRow: number;
  seatTiers: Record<string, SeatTier>;
  fareWindow: number;
  fareAisle: number;
  fareEconomy: number;
  farePerSeat: number;
  departureTime: string;
  returnTime?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
}

function SeatInventoryModal({ schedule, onClose }: { schedule: VanSchedule; onClose: () => void }) {
  const today = new Date().toISOString().split("T")[0]!;
  const [date, setDate] = useState(today);

  const {
    data: avail,
    isLoading,
    error,
  } = useQuery<SeatAvailability>({
    queryKey: ["van-seat-inventory", schedule.id, date],
    queryFn: () => vanFetch(`/schedules/${schedule.id}/availability?date=${date}`),
    retry: false,
  });

  const rows: number[][] = [];
  if (avail) {
    const spr = avail.seatsPerRow || 4;
    for (let i = 1; i <= avail.totalSeats; i += spr) {
      rows.push(Array.from({ length: Math.min(spr, avail.totalSeats - i + 1) }, (_, j) => i + j));
    }
  }

  function getSeatColor(num: number): string {
    if (!avail) return "bg-gray-100 text-gray-400 border-gray-200";
    if (avail.bookedSeats.includes(num)) return "bg-red-100 text-red-700 border-red-300";
    const tier = avail.seatTiers[String(num)] || "aisle";
    return TIER_COLORS[tier] + " opacity-80";
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            Seat Inventory — {schedule.routeName || "Schedule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-muted-foreground mb-1 block text-xs">Travel Date</label>
              <Input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            {avail && (
              <div className="text-right">
                <p className="text-muted-foreground text-xs">Departure</p>
                <p className="font-mono font-bold text-indigo-700">{avail.departureTime}</p>
              </div>
            )}
          </div>

          {isLoading && (
            <div className="text-muted-foreground py-8 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center gap-2 py-4 text-center text-sm text-red-500">
              <AlertTriangle className="h-4 w-4" />
              {(error as Error).message}
            </div>
          )}

          {avail && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{avail.availableSeats}</p>
                  <p className="text-xs font-medium text-green-600">Available</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{avail.bookedSeats.length}</p>
                  <p className="text-xs font-medium text-red-600">Booked</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-700">{avail.totalSeats}</p>
                  <p className="text-xs font-medium text-gray-600">Total Seats</p>
                </div>
              </div>

              {avail.vehiclePlate && (
                <p className="text-muted-foreground text-xs">
                  Vehicle:{" "}
                  <span className="font-semibold">
                    {avail.vehiclePlate} {avail.vehicleModel}
                  </span>
                </p>
              )}

              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="text-muted-foreground mb-3 text-center text-xs font-semibold uppercase">
                  Seat Map
                </p>
                <div className="mb-3 flex flex-wrap justify-center gap-3">
                  <span className="rounded border border-green-300 bg-green-100 px-2 py-1 text-[10px] font-bold text-green-700">
                    Available
                  </span>
                  <span className="rounded border border-red-300 bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">
                    Booked
                  </span>
                  <span className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">
                    Window
                  </span>
                  <span className="rounded border border-blue-300 bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">
                    Aisle
                  </span>
                </div>
                <div className="mb-2 flex justify-center">
                  <div className="rounded-lg bg-gray-200 px-3 py-1 text-xs font-medium text-gray-500">
                    🚐 Driver
                  </div>
                </div>
                <div className="space-y-1.5">
                  {rows.map((row, ri) => (
                    <div key={ri} className="flex justify-center gap-1.5">
                      {row.map((num) => (
                        <div
                          key={num}
                          className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 text-xs font-bold ${getSeatColor(num)}`}
                        >
                          {num}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="text-xs">
                  <p className="font-bold text-amber-700">Rs {avail.fareWindow.toFixed(0)}</p>
                  <p className="text-muted-foreground">Window</p>
                </div>
                <div className="text-xs">
                  <p className="font-bold text-blue-700">Rs {avail.fareAisle.toFixed(0)}</p>
                  <p className="text-muted-foreground">Aisle</p>
                </div>
                <div className="text-xs">
                  <p className="font-bold text-green-700">Rs {avail.fareEconomy.toFixed(0)}</p>
                  <p className="text-muted-foreground">Economy</p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════
   SCHEDULES TAB
══════════════════════════════════════════════════════════ */
function SchedulesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<VanSchedule | null>(null);
  const [inventorySchedule, setInventorySchedule] = useState<VanSchedule | null>(null);
  const [form, setForm] = useState({
    routeId: "",
    vehicleId: "",
    driverId: "",
    departureTime: "07:00",
    returnTime: "",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
  });

  const { data: schedules = [], isLoading } = useQuery<VanSchedule[]>({
    queryKey: ["van-admin-schedules"],
    queryFn: () => vanFetch("/admin/schedules"),
  });
  const { data: routes = [] } = useQuery<VanRoute[]>({
    queryKey: ["van-admin-routes"],
    queryFn: () => vanFetch("/admin/routes"),
  });
  const { data: vehicles = [] } = useQuery<VanVehicle[]>({
    queryKey: ["van-admin-vehicles"],
    queryFn: () => vanFetch("/admin/vehicles"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      vanFetch("/admin/schedules", {
        method: "POST",
        body: JSON.stringify({
          routeId: form.routeId,
          vehicleId: form.vehicleId || null,
          driverId: form.driverId || null,
          departureTime: form.departureTime,
          returnTime: form.returnTime || null,
          daysOfWeek: form.daysOfWeek,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-schedules"] });
      setNewOpen(false);
      toast({ title: "Schedule created" });
    },
    onError: (e: Error) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const editMut = useMutation({
    mutationFn: (id: string) =>
      vanFetch(`/admin/schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          vehicleId: form.vehicleId || null,
          driverId: form.driverId || null,
          departureTime: form.departureTime,
          returnTime: form.returnTime || null,
          daysOfWeek: form.daysOfWeek,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-schedules"] });
      setEditSchedule(null);
      toast({ title: "Schedule updated" });
    },
    onError: (e: Error) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => vanFetch(`/admin/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-schedules"] });
      toast({ title: "Schedule deactivated" });
    },
  });

  const toggleDay = (d: number) =>
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(d)
        ? f.daysOfWeek.filter((x) => x !== d)
        : [...f.daysOfWeek, d].sort(),
    }));

  function openNew() {
    setForm({
      routeId: "",
      vehicleId: "",
      driverId: "",
      departureTime: "07:00",
      returnTime: "",
      daysOfWeek: [1, 2, 3, 4, 5, 6],
    });
    setNewOpen(true);
  }

  function openEdit(s: VanSchedule) {
    setEditSchedule(s);
    setForm({
      routeId: s.routeId,
      vehicleId: s.vehicleId || "",
      driverId: s.driverId || "",
      departureTime: s.departureTime,
      returnTime: s.returnTime || "",
      daysOfWeek: Array.isArray(s.daysOfWeek) ? (s.daysOfWeek as number[]) : [1, 2, 3, 4, 5, 6],
    });
  }

  const ScheduleFormBody = () => (
    <div className="space-y-3">
      {!editSchedule && (
        <Select value={form.routeId} onValueChange={(v) => setForm((f) => ({ ...f, routeId: v }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select route" />
          </SelectTrigger>
          <SelectContent>
            {routes
              .filter((r) => r.isActive)
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
      {editSchedule && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700">
          Route: {editSchedule.routeName || editSchedule.routeId}
        </div>
      )}
      <Select
        value={form.vehicleId || "__none__"}
        onValueChange={(v) => setForm((f) => ({ ...f, vehicleId: v === "__none__" ? "" : v }))}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select vehicle (optional)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No vehicle</SelectItem>
          {vehicles
            .filter((v) => v.isActive)
            .map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.plateNumber} – {v.model}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="Driver user ID (optional)"
        value={form.driverId}
        onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-muted-foreground mb-1 block text-xs">Departure time</label>
          <Input
            type="time"
            value={form.departureTime}
            onChange={(e) => setForm((f) => ({ ...f, departureTime: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs">Return time (optional)</label>
          <Input
            type="time"
            value={form.returnTime}
            onChange={(e) => setForm((f) => ({ ...f, returnTime: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="text-muted-foreground mb-2 block text-xs">Days of operation</label>
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              type="button"
              className={`rounded border px-2.5 py-1 text-xs font-bold transition-colors ${form.daysOfWeek.includes(d) ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 bg-white text-gray-600"}`}
              onClick={() => toggleDay(d)}
            >
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {schedules.length} schedule{schedules.length !== 1 ? "s" : ""}
        </span>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" />
          New Schedule
        </Button>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <>
          {/* Mobile card list */}
          <section className="space-y-3 md:hidden" aria-label="Schedules">
            {schedules.map((s) => (
              <Card key={s.id} className="overflow-hidden rounded-2xl">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{s.routeName || s.routeId}</p>
                      <p className="text-muted-foreground text-xs">
                        <span className="font-mono text-indigo-700">{s.departureTime}</span>
                        {s.returnTime && (
                          <span>
                            {" "}
                            → <span className="font-mono">{s.returnTime}</span>
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label="Open actions menu"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setInventorySchedule(s)}>
                            <Users className="mr-2 h-4 w-4 text-indigo-500" aria-hidden="true" />{" "}
                            Seat Inventory
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(s)}>
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              if (confirm("Deactivate this schedule?")) deleteMut.mutate(s.id);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Deactivate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {(Array.isArray(s.daysOfWeek) ? (s.daysOfWeek as number[]) : []).map((d) => (
                      <span
                        key={d}
                        className="rounded bg-indigo-100 px-1 text-[10px] font-bold text-indigo-700"
                      >
                        {DAY_LABELS[d]}
                      </span>
                    ))}
                  </div>
                  <div className="text-muted-foreground border-border/50 flex gap-4 border-t pt-1 text-xs">
                    <span>{s.vehiclePlate || "No vehicle"}</span>
                    <span>{s.driverName || "No driver"}</span>
                    {s.vanCode && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-bold text-indigo-700">
                        {s.vanCode}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Departure</TableHead>
                  <TableHead>Return</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Van Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm font-medium">
                      {s.routeName || s.routeId}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-semibold text-indigo-700">
                        {s.departureTime}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono">{s.returnTime || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-0.5">
                        {(Array.isArray(s.daysOfWeek) ? (s.daysOfWeek as number[]) : []).map(
                          (d) => (
                            <span
                              key={d}
                              className="rounded bg-indigo-100 px-1 text-[10px] font-bold text-indigo-700"
                            >
                              {DAY_LABELS[d]}
                            </span>
                          )
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.vehiclePlate || (
                        <span className="text-muted-foreground text-xs">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.driverName || (
                        <span className="text-muted-foreground text-xs">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.vanCode ? (
                        <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          {s.vanCode}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.isActive ? "default" : "secondary"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="View seat inventory"
                        onClick={() => setInventorySchedule(s)}
                      >
                        <Users className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit schedule"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        aria-label="Deactivate schedule"
                        onClick={() => {
                          if (confirm("Deactivate this schedule?")) deleteMut.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* New Schedule Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Schedule</DialogTitle>
          </DialogHeader>
          <ScheduleFormBody />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!form.routeId || createMut.isPending}
            >
              {createMut.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Create Schedule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Schedule Dialog */}
      {editSchedule && (
        <Dialog open onOpenChange={() => setEditSchedule(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Schedule</DialogTitle>
            </DialogHeader>
            <ScheduleFormBody />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditSchedule(null)}>
                Cancel
              </Button>
              <Button onClick={() => editMut.mutate(editSchedule.id)} disabled={editMut.isPending}>
                {editMut.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Seat Inventory Modal */}
      {inventorySchedule && (
        <SeatInventoryModal
          schedule={inventorySchedule}
          onClose={() => setInventorySchedule(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   DRIVERS TAB
══════════════════════════════════════════════════════════ */
function DriversTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ userId: "", notes: "" });

  const { data: drivers = [], isLoading } = useQuery<VanDriver[]>({
    queryKey: ["van-admin-drivers"],
    queryFn: () => vanFetch("/admin/drivers"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      vanFetch("/admin/drivers", {
        method: "POST",
        body: JSON.stringify({
          userId: form.userId,
          approvalStatus: "approved",
          notes: form.notes || undefined,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-drivers"] });
      setNewOpen(false);
      toast({ title: "Van driver created" });
    },
    onError: (e: Error) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      vanFetch(`/admin/drivers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approvalStatus: status }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-drivers"] });
      toast({ title: "Status updated" });
    },
    onError: (e: Error) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => vanFetch(`/admin/drivers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-drivers"] });
      toast({ title: "Driver deactivated" });
    },
  });

  const APPROVAL_COLORS: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    suspended: "bg-red-100 text-red-800",
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {drivers.length} driver{drivers.length !== 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          onClick={() => {
            setForm({ userId: "", notes: "" });
            setNewOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          New Van Driver
        </Button>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <>
          {/* Mobile card list */}
          <section className="space-y-3 md:hidden" aria-label="Van drivers">
            {drivers.map((d) => (
              <Card key={d.id} className="overflow-hidden rounded-2xl">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                        {d.vanCode}
                      </span>
                      <p className="mt-1 text-sm font-medium">{d.userName || d.userId}</p>
                      <p className="text-muted-foreground text-xs">{d.userPhone || "—"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${APPROVAL_COLORS[d.approvalStatus] || "bg-gray-100 text-gray-700"}`}
                      >
                        {d.approvalStatus}
                      </span>
                    </div>
                  </div>
                  <div className="border-border/50 flex items-center gap-2 border-t pt-1">
                    <Select onValueChange={(v) => statusMut.mutate({ id: d.id, status: v })}>
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue placeholder="Set status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">Approve</SelectItem>
                        <SelectItem value="suspended">Suspend</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-red-500 hover:text-red-700"
                      aria-label="Deactivate driver"
                      onClick={() => {
                        if (confirm("Deactivate this van driver?")) deactivateMut.mutate(d.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Van Code</TableHead>
                  <TableHead>Driver Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <span className="rounded bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-700">
                        {d.vanCode}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{d.userName || d.userId}</TableCell>
                    <TableCell className="text-sm">{d.userPhone || "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${APPROVAL_COLORS[d.approvalStatus] || "bg-gray-100 text-gray-700"}`}
                      >
                        {d.approvalStatus}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.isActive ? "default" : "secondary"}>
                        {d.isActive ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Select onValueChange={(v) => statusMut.mutate({ id: d.id, status: v })}>
                        <SelectTrigger className="inline-flex h-7 w-28 text-xs">
                          <SelectValue placeholder="Set status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="approved">Approve</SelectItem>
                          <SelectItem value="suspended">Suspend</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        aria-label="Deactivate driver"
                        onClick={() => {
                          if (confirm("Deactivate this van driver?")) deactivateMut.mutate(d.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Van Driver</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                User ID (rider account)
              </label>
              <Input
                placeholder="User ID"
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              />
            </div>
            <Input
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <p className="text-muted-foreground text-xs">
              A unique Van Code (VAN-XXX) will be auto-generated.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!form.userId || createMut.isPending}
            >
              {createMut.isPending ? "Creating…" : "Create Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   BOOKINGS TAB
══════════════════════════════════════════════════════════ */
function BookingsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]!);
  const [statusFilter, setStatusFilter] = useState("all");

  const {
    data: bookings = [],
    isLoading,
    refetch,
  } = useQuery<VanBooking[]>({
    queryKey: ["van-admin-bookings", dateFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      return vanFetch(`/admin/bookings?${params.toString()}`);
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      vanFetch(`/admin/bookings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["van-admin-bookings"] });
      toast({ title: "Status updated" });
    },
    onError: (e: Error) =>
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const totalRevenue = bookings
    .filter((b) => b.status !== "cancelled")
    .reduce((s, b) => s + parseFloat(b.fare), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="date"
          className="w-40"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="boarded">Boarded</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="text-muted-foreground ml-auto text-sm">
          {bookings.length} booking{bookings.length !== 1 ? "s" : ""} · Revenue:{" "}
          <span className="font-semibold text-green-700">Rs {totalRevenue.toFixed(0)}</span>
        </div>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          No bookings found for selected filters.
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <section className="space-y-3 md:hidden" aria-label="Bookings">
            {bookings.map((b) => (
              <Card key={b.id} className="overflow-hidden rounded-2xl">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {b.passengerName || b.userName || "—"}
                      </p>
                      <p className="text-muted-foreground text-xs">{b.userPhone || ""}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}
                      >
                        {b.status}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <p className="text-muted-foreground">
                      {b.routeName || "—"} · <span className="font-mono">{b.travelDate}</span>{" "}
                      {b.departureTime && <span className="font-mono">@ {b.departureTime}</span>}
                      {b.tripStatus === "in_progress" && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                          <Navigation className="h-2.5 w-2.5" aria-hidden="true" />
                          LIVE
                        </span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(b.seatNumbers) ? (b.seatNumbers as number[]) : []).map(
                        (s) => (
                          <span
                            key={s}
                            className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-800"
                          >
                            {s}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <div className="border-border/50 flex items-center gap-2 border-t pt-1">
                    <span className="text-sm font-semibold text-green-700">
                      Rs {parseFloat(b.fare).toFixed(0)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {b.paymentMethod}
                    </Badge>
                    <div className="ml-auto">
                      <Select onValueChange={(v) => statusMut.mutate({ id: b.id, status: v })}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue placeholder="Set status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="boarded">Boarded</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Passenger</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Fare</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {b.passengerName || b.userName || "—"}
                      </div>
                      <div className="text-muted-foreground text-xs">{b.userPhone || ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {b.routeName || "—"}
                      {b.tripStatus === "in_progress" && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                          <Navigation className="h-2.5 w-2.5" aria-hidden="true" />
                          LIVE
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{b.travelDate}</TableCell>
                    <TableCell className="font-mono text-sm">{b.departureTime || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(b.seatNumbers) ? (b.seatNumbers as number[]) : []).map(
                          (s) => (
                            <span
                              key={s}
                              className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-800"
                            >
                              {s}
                            </span>
                          )
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {b.tierBreakdown ? (
                        <div className="flex flex-wrap gap-0.5">
                          {Object.entries(b.tierBreakdown).map(([tier, info]) => (
                            <span
                              key={tier}
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${TIER_COLORS[tier as SeatTier] || "bg-gray-100 text-gray-600"}`}
                            >
                              {tier.charAt(0).toUpperCase()}
                              {(info as { count: number; fare: number }).count}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-green-700">
                      Rs {parseFloat(b.fare).toFixed(0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.paymentMethod}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}
                      >
                        {b.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Select onValueChange={(v) => statusMut.mutate({ id: b.id, status: v })}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue placeholder="Set status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="boarded">Boarded</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   RULES TAB
══════════════════════════════════════════════════════════ */

const KNOWN_VAN_KEYS = new Set([
  "van_min_advance_hours",
  "van_max_seats_per_booking",
  "van_cancellation_window_hours",
  "van_refund_type",
  "van_refund_partial_pct",
  "van_seat_hold_minutes",
  "van_min_passengers",
  "van_min_check_hours_before",
  "van_auto_notify_cancel",
  "van_max_driver_trips_day",
  "van_driver_rest_hours",
  "van_require_start_trip",
  "van_peak_surcharge_pct",
  "van_peak_hours",
  "van_weekend_surcharge_pct",
  "van_holiday_surcharge_pct",
  "van_holiday_dates",
]);

interface PlatformSetting {
  key: string;
  value: string;
  label: string;
  category: string;
  updatedAt: string;
}

const RULE_SECTIONS = [
  {
    title: "Booking Rules",
    keys: [
      "van_min_advance_hours",
      "van_max_seats_per_booking",
      "van_cancellation_window_hours",
      "van_refund_type",
      "van_refund_partial_pct",
      "van_seat_hold_minutes",
    ],
  },
  {
    title: "Operational Rules",
    keys: ["van_min_passengers", "van_min_check_hours_before", "van_auto_notify_cancel"],
  },
  {
    title: "Driver Rules",
    keys: ["van_max_driver_trips_day", "van_driver_rest_hours", "van_require_start_trip"],
  },
  {
    title: "Pricing Rules",
    keys: [
      "van_peak_surcharge_pct",
      "van_peak_hours",
      "van_weekend_surcharge_pct",
      "van_holiday_surcharge_pct",
      "van_holiday_dates",
    ],
  },
];

async function adminFetch(path: string, opts: RequestInit = {}) {
  return adminAbsoluteFetch(`/api/admin/system${path}`, opts);
}

function RuleRow({
  setting,
  onSave,
  saving,
}: {
  setting: PlatformSetting;
  onSave: (key: string, value: string) => void;
  saving: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(setting.value);
  const isKnown = KNOWN_VAN_KEYS.has(setting.key);

  const handleSave = () => {
    onSave(setting.key, localValue);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0 hover:bg-gray-50/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{setting.label}</span>
          {!isKnown && (
            <Badge
              variant="outline"
              className="border-yellow-200 bg-yellow-50 text-[10px] text-yellow-700"
            >
              <AlertTriangle className="mr-0.5 h-3 w-3" />
              Pending implementation
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground font-mono text-xs">{setting.key}</span>
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input
              className="h-8 w-40 text-sm"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") {
                  setLocalValue(setting.value);
                  setEditing(false);
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              variant="default"
              className="h-8 px-3"
              onClick={handleSave}
              disabled={saving === setting.key}
            >
              {saving === setting.key ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setLocalValue(setting.value);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm">
              {setting.value}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3 overflow-hidden rounded-lg border">
      <button
        className="flex w-full items-center gap-2 bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        )}
        <span className="text-sm font-semibold">{title}</span>
      </button>
      {open && <div className="px-1">{children}</div>}
    </div>
  );
}

function RulesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customForm, setCustomForm] = useState({
    key: "",
    label: "",
    type: "number" as string,
    value: "",
    description: "",
  });

  const {
    data: settingsData,
    isLoading,
    refetch,
  } = useQuery<{ settings: PlatformSetting[] }>({
    queryKey: ["van-admin-rules"],
    queryFn: () => adminFetch("/platform-settings"),
  });

  const allSettings = settingsData?.settings ?? [];
  const vanSettings = allSettings.filter((s) => s.key.startsWith("van_"));

  const handleSave = async (key: string, value: string) => {
    setSaving(key);
    try {
      await adminFetch(`/platform-settings/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      });
      toast({ title: "Setting saved" });
      void qc.invalidateQueries({ queryKey: ["van-admin-rules"] });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setSaving(null);
  };

  const handleAddCustomRule = async () => {
    const key = customForm.key.startsWith("van_") ? customForm.key : `van_${customForm.key}`;
    if (!key || !customForm.label) {
      toast({ title: "Key and label are required", variant: "destructive" });
      return;
    }
    try {
      await adminFetch("/platform-settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: [
            { key, value: customForm.value || (customForm.type === "boolean" ? "off" : "0") },
          ],
        }),
      });
      toast({ title: "Custom rule added" });
      setCustomDialogOpen(false);
      setCustomForm({ key: "", label: "", type: "number", value: "", description: "" });
      void qc.invalidateQueries({ queryKey: ["van-admin-rules"] });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  if (isLoading)
    return <div className="text-muted-foreground py-8 text-center">Loading rules…</div>;

  const customRules = vanSettings.filter((s) => !KNOWN_VAN_KEYS.has(s.key));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {vanSettings.length} van rule{vanSettings.length !== 1 ? "s" : ""}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCustomDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Custom Rule
          </Button>
        </div>
      </div>

      {RULE_SECTIONS.map((section) => {
        const sectionSettings = section.keys
          .map((k) => vanSettings.find((s) => s.key === k))
          .filter(Boolean) as PlatformSetting[];
        if (sectionSettings.length === 0) return null;
        return (
          <CollapsibleSection key={section.title} title={section.title}>
            {sectionSettings.map((s) => (
              <RuleRow key={s.key} setting={s} onSave={handleSave} saving={saving} />
            ))}
          </CollapsibleSection>
        );
      })}

      {customRules.length > 0 && (
        <CollapsibleSection title="Custom Rules" defaultOpen={true}>
          {customRules.map((s) => (
            <RuleRow key={s.key} setting={s} onSave={handleSave} saving={saving} />
          ))}
        </CollapsibleSection>
      )}

      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Van Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Key (auto-prefixed with van_)
              </label>
              <Input
                placeholder="e.g. require_passport_upload"
                value={customForm.key}
                onChange={(e) => setCustomForm((f) => ({ ...f, key: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">Label</label>
              <Input
                placeholder="e.g. Require Passport Upload"
                value={customForm.label}
                onChange={(e) => setCustomForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">Type</label>
              <Select
                value={customForm.type}
                onValueChange={(v) => setCustomForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Boolean (on/off)</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Default Value
              </label>
              <Input
                placeholder={customForm.type === "boolean" ? "on or off" : "e.g. 10"}
                value={customForm.value}
                onChange={(e) => setCustomForm((f) => ({ ...f, value: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Description (optional)
              </label>
              <Input
                placeholder="What this rule does"
                value={customForm.description}
                onChange={(e) => setCustomForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCustomRule}>Add Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function VanServicePage() {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">Van page crashed. Please reload.</div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Bus}
          title="Van Service Management"
          subtitle="Manage commercial van routes, schedules, vehicles, drivers and seat bookings"
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-600"
        />

        <Tabs defaultValue="routes">
          <TabsList className="mb-2">
            <TabsTrigger value="routes">
              <Route className="mr-1.5 h-4 w-4" />
              Routes
            </TabsTrigger>
            <TabsTrigger value="schedules">
              <Clock className="mr-1.5 h-4 w-4" />
              Schedules
            </TabsTrigger>
            <TabsTrigger value="vehicles">
              <Bus className="mr-1.5 h-4 w-4" />
              Vehicles
            </TabsTrigger>
            <TabsTrigger value="drivers">
              <UserCheck className="mr-1.5 h-4 w-4" />
              Drivers
            </TabsTrigger>
            <TabsTrigger value="bookings">
              <Calendar className="mr-1.5 h-4 w-4" />
              Bookings
            </TabsTrigger>
            <TabsTrigger value="rules">
              <Settings className="mr-1.5 h-4 w-4" />
              Rules
            </TabsTrigger>
          </TabsList>
          <TabsContent value="routes">
            <RoutesTab />
          </TabsContent>
          <TabsContent value="schedules">
            <SchedulesTab />
          </TabsContent>
          <TabsContent value="vehicles">
            <VehiclesTab />
          </TabsContent>
          <TabsContent value="drivers">
            <DriversTab />
          </TabsContent>
          <TabsContent value="bookings">
            <BookingsTab />
          </TabsContent>
          <TabsContent value="rules">
            <RulesTab />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
}
