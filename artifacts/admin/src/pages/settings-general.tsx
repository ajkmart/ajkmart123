import { Badge } from "@/components/ui/badge";
import { Globe, Languages, Zap } from "lucide-react";
import { CatKey, renderSection, SettingsSectionProps, TEXT_KEYS } from "./settings-render";

const GENERAL_CAT_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string; description: string }
> = {
  general: {
    label: "General",
    icon: Globe,
    color: "text-gray-600",
    bg: "bg-gray-50",
    description: "App name, support contact, version and maintenance mode",
  },
  features: {
    label: "Feature Toggles",
    icon: Zap,
    color: "text-violet-600",
    bg: "bg-violet-50",
    description: "Enable or disable each service across the entire platform instantly",
  },
  regional: {
    label: "Regional & Validation",
    icon: Languages,
    color: "text-lime-600",
    bg: "bg-lime-50",
    description: "Phone format, timezone, currency symbol and country code",
  },
  localization: {
    label: "Localization",
    icon: Languages,
    color: "text-lime-600",
    bg: "bg-lime-50",
    description: "Currency code and symbol used across the platform",
  },
};

const GENERAL_CATS: CatKey[] = ["general", "regional", "localization", "features"];

function getInputType(key: string) {
  return TEXT_KEYS.has(key) ? "text" : "number";
}
function getInputSuffix(key: string) {
  if (key.includes("_pct") || key.includes("pct")) return "%";
  if (key.includes("_km") || key === "rider_acceptance_km") return "KM";
  if (key.includes("_day") || key.includes("_days") || key === "security_session_days")
    return "days";
  if (key.includes("_pts") || key.includes("_items") || key.includes("_deliveries")) return "#";
  if (key.includes("_sec")) return "sec";
  if (key.includes("_multiplier")) return "×";
  return "";
}
function getPlaceholder(key: string) {
  if (key.includes("_url")) return "https://...";
  return "";
}

export function GeneralSection({
  settings,
  grouped,
  localValues,
  dirtyKeys,
  handleChange,
  handleToggle,
}: SettingsSectionProps) {
  const cats = GENERAL_CATS.filter((cat) => (grouped[cat]?.length ?? 0) > 0);

  if (cats.length === 0) {
    return (
      <p className="text-muted-foreground px-1 py-2 text-xs italic">
        No general settings configured yet.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {cats.map((cat, idx) => {
        const cfg = GENERAL_CAT_CONFIG[cat];
        const Icon = cfg?.icon ?? Globe;
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
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${cfg?.bg ?? "bg-gray-50"}`}
              >
                <Icon className={`h-4 w-4 ${cfg?.color ?? "text-gray-600"}`} />
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
