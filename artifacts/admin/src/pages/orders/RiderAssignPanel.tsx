import { Input } from "@/components/ui/input";
import { Phone, UserCheck } from "lucide-react";

interface RiderAssignPanelProps {
  order: any;
  ridersData: any;
  riderSearch: string;
  setRiderSearch: (v: string) => void;
  showAssignRider: boolean;
  setShowAssignRider: (v: boolean) => void;
  onAssignRider: (rider: any) => void;
  assignPending: boolean;
}

export function RiderAssignPanel({
  order,
  ridersData,
  riderSearch,
  setRiderSearch,
  showAssignRider,
  setShowAssignRider,
  onAssignRider,
  assignPending,
}: RiderAssignPanelProps) {
  return (
    <section
      className="space-y-1 rounded-xl border border-green-100 bg-green-50 p-3"
      aria-label="Rider assignment"
    >
      <h3 className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-green-700 uppercase">
        <UserCheck className="h-3 w-3" aria-hidden="true" /> Rider Assignment
      </h3>
      {order.riderName ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">{order.riderName}</p>
            {order.riderPhone && (
              <a
                href={`tel:${order.riderPhone}`}
                className="flex min-h-[36px] items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                aria-label={`Call rider ${order.riderPhone}`}
              >
                <Phone className="h-3 w-3" aria-hidden="true" /> {order.riderPhone}
              </a>
            )}
          </div>
          <button
            onClick={() => {
              setShowAssignRider(true);
              setRiderSearch("");
            }}
            className="min-h-[36px] rounded-lg border border-green-300 bg-white px-2 py-1 text-xs text-green-700 hover:bg-green-50"
            aria-label="Change assigned rider"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">No rider assigned</span>
          <button
            onClick={() => {
              setShowAssignRider(true);
              setRiderSearch("");
            }}
            className="min-h-[36px] rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700"
            aria-label="Assign a rider to this order"
          >
            Assign Rider
          </button>
        </div>
      )}

      {showAssignRider && (
        <div className="mt-2 space-y-2">
          <Input
            placeholder="Search riders..."
            value={riderSearch}
            onChange={(e) => setRiderSearch(e.target.value)}
            className="h-9 rounded-lg text-xs"
            autoFocus
            aria-label="Search riders"
          />
          <div
            className="max-h-36 space-y-1 overflow-y-auto"
            role="listbox"
            aria-label="Available riders"
          >
            {(ridersData?.riders || [])
              .filter((r: any) => r.isActive && !r.isBanned)
              .filter((r: any) =>
                riderSearch
                  ? (r.name || r.phone || "").toLowerCase().includes(riderSearch.toLowerCase())
                  : true
              )
              .slice(0, 8)
              .map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => onAssignRider(r)}
                  disabled={assignPending}
                  role="option"
                  className="border-border/50 flex min-h-[36px] w-full items-center gap-2 rounded-lg border bg-white px-2 py-2 text-left text-xs hover:bg-green-50"
                >
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-[10px] font-bold text-green-700"
                    aria-hidden="true"
                  >
                    {(r.name || r.phone || "R")[0].toUpperCase()}
                  </div>
                  <span className="truncate font-semibold">{r.name || r.phone}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 font-mono">
                    {r.vehiclePlate || ""}
                  </span>
                </button>
              ))}
          </div>
          <button
            onClick={() => setShowAssignRider(false)}
            className="text-muted-foreground min-h-[36px] text-xs hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
