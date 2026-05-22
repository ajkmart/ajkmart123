import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  Bike,
  Car,
  CheckCircle2,
  Circle,
  Clock,
  Settings as Cog,
  Eye,
  EyeOff,
  MapPin,
  MessageSquare,
  PackageCheck,
  Pause,
  Pencil,
  Search,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";

/* ── SLabel — section heading used in settings ── */
export function SLabel({ children, icon: Icon }: { children: React.ReactNode; icon?: any }) {
  return (
    <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase">
      {Icon && <Icon className="h-3.5 w-3.5" />} {children}
    </p>
  );
}

/* ── ModeBtn — pill-style toggle button for settings modes ── */
export function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
        active
          ? "bg-primary border-primary text-white shadow-sm"
          : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Toggle ── */
export function Toggle({
  checked,
  onChange,
  label,
  icon,
  isDirty,
  danger,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: string;
  isDirty: boolean;
  danger?: boolean;
  sub?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex w-full cursor-pointer items-center justify-between rounded-xl border p-3.5 text-left transition-all select-none ${checked ? (danger ? "border-red-300 bg-red-50" : "border-green-200 bg-green-50") : "border-border hover:bg-muted/30 bg-white"} ${isDirty ? "ring-2 ring-amber-300" : ""}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {icon && (
          <span className="flex-shrink-0 text-xl" aria-hidden="true">
            {icon}
          </span>
        )}
        {danger && !icon && (
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm leading-snug font-semibold">{label}</p>
          {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
          <p
            className={`flex items-center gap-1 text-xs font-bold ${checked ? (danger ? "text-red-600" : "text-green-600") : "text-muted-foreground"}`}
            aria-hidden="true"
          >
            {checked ? (
              danger ? (
                <>
                  <AlertTriangle className="h-3 w-3" /> Enabled
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" /> Enabled
                </>
              )
            ) : (
              <>
                <Circle className="h-3 w-3" /> Disabled
              </>
            )}
          </p>
        </div>
      </div>
      <div className="ml-2 flex flex-shrink-0 items-center gap-2" aria-hidden="true">
        {isDirty && (
          <Badge
            variant="outline"
            className="hidden border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700 sm:flex"
          >
            CHANGED
          </Badge>
        )}
        <div
          className={`relative h-6 w-11 rounded-full transition-colors ${checked ? (danger ? "bg-red-500" : "bg-green-500") : "bg-gray-300"}`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
          />
        </div>
      </div>
    </button>
  );
}

/* ── SecretInput ── */
export function SecretInput({
  label,
  value,
  onChange,
  placeholder,
  isDirty,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isDirty: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-foreground text-xs font-semibold">{label}</label>
        {isDirty && (
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
          >
            CHANGED
          </Badge>
        )}
        {value && !isDirty && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
      </div>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Not configured"}
          className={`h-9 rounded-lg pr-8 font-mono text-sm ${isDirty ? "border-amber-300 bg-amber-50/50" : ""} ${!value ? "border-dashed" : ""}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide secret" : "Show secret"}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-primary absolute top-1/2 right-2 -translate-y-1/2 rounded-sm focus:outline-none focus-visible:ring-2"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/* ── Field ── */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  isDirty,
  type = "text",
  suffix,
  mono,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isDirty: boolean;
  type?: string;
  suffix?: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-foreground text-xs font-semibold">{label}</label>
        {isDirty && (
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
          >
            CHANGED
          </Badge>
        )}
        {value && !isDirty && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
      </div>
      <div className="relative">
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || ""}
          className={`h-9 rounded-lg text-sm ${mono ? "font-mono" : ""} ${suffix ? "pr-14" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50" : ""} ${!value ? "border-dashed" : ""}`}
        />
        {suffix && (
          <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  );
}

/* ── StatusBadge ── */
type StatusEntry = { label: string; className: string; icon: typeof Zap };
const STATUS_MAP: Record<string, StatusEntry> = {
  // Promotions / offers
  draft: { label: "Draft", icon: Pencil, className: "bg-gray-100 text-gray-600 border-gray-200" },
  pending_approval: {
    label: "Pending Approval",
    icon: AlertTriangle,
    className: "bg-orange-100 text-orange-700 border-orange-200",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    className: "bg-red-100 text-red-700 border-red-200",
  },
  paused: {
    label: "Paused",
    icon: Pause,
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  live: { label: "Live", icon: Zap, className: "bg-green-100 text-green-700 border-green-200" },
  scheduled: {
    label: "Scheduled",
    icon: Clock,
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  expired: {
    label: "Expired",
    icon: Clock,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
  sold_out: {
    label: "Sold Out",
    icon: XCircle,
    className: "bg-red-100 text-red-600 border-red-200",
  },
  inactive: {
    label: "Inactive",
    icon: Circle,
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
  active: {
    label: "Active",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700 border-green-200",
  },
  exhausted: {
    label: "Exhausted",
    icon: XCircle,
    className: "bg-orange-100 text-orange-600 border-orange-200",
  },
  // Orders / delivery
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  preparing: {
    label: "Preparing",
    icon: Cog,
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
  out_for_delivery: {
    label: "Delivering",
    icon: Bike,
    className: "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
  delivered: {
    label: "Delivered",
    icon: PackageCheck,
    className: "bg-green-100 text-green-700 border-green-200",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-red-100 text-red-600 border-red-200",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700 border-green-200",
  },
  // Rides
  bargaining: {
    label: "Bargaining",
    icon: MessageSquare,
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  searching: {
    label: "Searching",
    icon: Search,
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  accepted: {
    label: "Accepted",
    icon: CheckCircle2,
    className: "bg-teal-100 text-teal-700 border-teal-200",
  },
  arrived: {
    label: "Arrived",
    icon: MapPin,
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
  in_transit: {
    label: "In Transit",
    icon: Car,
    className: "bg-orange-100 text-orange-700 border-orange-200",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? {
    label: status,
    icon: Circle,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const Icon = cfg.icon;
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${cfg.className}`}
      role="status"
      aria-label={cfg.label}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {cfg.label}
    </Badge>
  );
}
