import { Badge } from "@/components/ui/badge";
import { Clock, ImageUp, List, MapPin, Server, SlidersHorizontal, Wifi } from "lucide-react";
import { CatKey, renderSection, SettingsSectionProps } from "./settings-render";

const MONITORING_CAT_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string; description: string }
> = {
  system_limits: {
    label: "System Limits",
    icon: Server,
    color: "text-slate-600",
    bg: "bg-slate-50",
    description: "Log retention, cache TTL, body limit and upload size",
  },
  cache: {
    label: "Cache TTLs",
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
    description: "Platform settings, VPN detection, TOR node and zone cache lifetimes",
  },
  network: {
    label: "Network & Retry",
    icon: Wifi,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    description:
      "API timeout, retry attempts, backoff delay, GPS queue size and dismissed-request TTL",
  },
  geo: {
    label: "Geo & Zones",
    icon: MapPin,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    description: "Default zone radius and open-world fallback behavior",
  },
  uploads: {
    label: "Upload Limits",
    icon: ImageUp,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    description: "Image/video file size limits and allowed formats",
  },
  pagination: {
    label: "Pagination",
    icon: List,
    color: "text-lime-600",
    bg: "bg-lime-50",
    description: "Products per page, trending searches limit, flash deals display",
  },
  ratelimit: {
    label: "Endpoint Rate Limits",
    icon: SlidersHorizontal,
    color: "text-rose-600",
    bg: "bg-rose-50",
    description: "Per-endpoint rate limits for bargaining, booking, cancellation and estimates",
  },
};

const MONITORING_CATS: CatKey[] = [
  "system_limits",
  "cache",
  "network",
  "geo",
  "uploads",
  "pagination",
  "ratelimit",
];

function getInputType(key: string) {
  if (key.includes("_url")) return "text";
  return "number";
}
function getInputSuffix(key: string) {
  if (key.includes("_pct") || key.includes("pct")) return "%";
  if (key.includes("_km")) return "KM";
  if (key.includes("_day") || key.includes("_days")) return "days";
  if (key.includes("_sec")) return "sec";
  if (key.includes("_ms")) return "ms";
  if (key.includes("_multiplier")) return "×";
  if (key === "security_rate_limit") return "req/min";
  return "#";
}
function getPlaceholder(key: string) {
  if (key.includes("_url")) return "https://...";
  return "";
}

export function MonitoringSection({
  settings,
  grouped,
  localValues,
  dirtyKeys,
  handleChange,
  handleToggle,
}: SettingsSectionProps) {
  const cats = MONITORING_CATS.filter((cat) => (grouped[cat]?.length ?? 0) > 0);

  if (cats.length === 0) {
    return (
      <p className="text-muted-foreground px-1 py-2 text-xs italic">
        No monitoring settings configured yet.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {cats.map((cat, idx) => {
        const cfg = MONITORING_CAT_CONFIG[cat];
        const Icon = cfg?.icon ?? Server;
        const childSettings = grouped[cat] ?? [];
        const childDirty = Array.from(dirtyKeys).filter((k) => {
          const s = settings.find((x) => x.key === k);
          return s?.category === cat;
        }).length;

        return (
          <section
            key={cat}
            id={`sub-${cat}`}
            data-cat={cat}
            className={idx > 0 ? "border-border/50 border-t pt-6" : ""}
          >
            <div className="mb-4 flex items-start gap-3">
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${cfg?.bg ?? "bg-slate-50"}`}
              >
                <Icon className={`h-4 w-4 ${cfg?.color ?? "text-slate-600"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-foreground text-sm font-bold">{cfg?.label ?? cat}</h3>
                  {childSettings.length > 0 && (
                    <Badge
                      variant="outline"
                      className="bg-muted/40 text-muted-foreground border-border/60 text-[10px]"
                    >
                      {childSettings.length}
                    </Badge>
                  )}
                  {childDirty > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                    >
                      {childDirty} changed
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-[11px]">{cfg?.description ?? ""}</p>
              </div>
            </div>
            {childSettings.length === 0 ? (
              <p className="text-muted-foreground px-1 py-2 text-xs italic">
                No settings configured for this sub-section yet.
              </p>
            ) : (
              renderSection(
                cat,
                childSettings,
                settings,
                localValues,
                dirtyKeys,
                handleChange,
                handleToggle,
                getInputType,
                getInputSuffix,
                getPlaceholder
              )
            )}
          </section>
        );
      })}
    </div>
  );
}
