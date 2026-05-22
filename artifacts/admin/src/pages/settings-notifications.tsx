import { Badge } from "@/components/ui/badge";
import { Bell, MessageSquare } from "lucide-react";
import { CatKey, renderSection, SettingsSectionProps } from "./settings-render";

const NOTIF_CAT_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string; description: string }
> = {
  notifications: {
    label: "Notifications",
    icon: Bell,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    description: "Email templates, push notification text, fraud alert thresholds",
  },
  content: {
    label: "Content & Banners",
    icon: MessageSquare,
    color: "text-pink-600",
    bg: "bg-pink-50",
    description: "Banners, announcements, notices for riders & vendors, policy links",
  },
};

const NOTIF_CATS: CatKey[] = ["notifications", "content"];

function getInputType(_key: string) {
  return "text";
}
function getInputSuffix(key: string) {
  if (key.includes("_pct") || key.includes("pct")) return "%";
  if (key.includes("_sec")) return "sec";
  if (key.includes("_multiplier")) return "×";
  return "";
}
function getPlaceholder(key: string) {
  if (key.includes("_url")) return "https://...";
  if (key === "content_announcement") return "Leave empty to hide the bar in all apps";
  if (key === "content_banner") return "Free delivery on your first order! 🎉";
  if (key === "content_maintenance_msg")
    return "We're performing scheduled maintenance. Back soon!";
  if (key === "content_support_msg") return "Need help? Chat with us on WhatsApp!";
  if (key === "content_vendor_notice")
    return "Leave empty to hide. E.g. New settlement policy starting May 1.";
  if (key === "content_rider_notice")
    return "Leave empty to hide. E.g. Bonus Rs.200 for 10+ deliveries today!";
  if (key === "content_refund_policy_url") return "https://ajkmart.pk/refund-policy";
  if (key === "content_faq_url") return "https://ajkmart.pk/help";
  if (key === "content_about_url") return "https://ajkmart.pk/about";
  return "";
}

export function NotificationsSection({
  settings,
  grouped,
  localValues,
  dirtyKeys,
  handleChange,
  handleToggle,
}: SettingsSectionProps) {
  const cats = NOTIF_CATS.filter((cat) => (grouped[cat]?.length ?? 0) > 0);

  if (cats.length === 0) {
    return (
      <p className="text-muted-foreground px-1 py-2 text-xs italic">
        No notification settings configured yet.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {cats.map((cat, idx) => {
        const cfg = NOTIF_CAT_CONFIG[cat];
        const Icon = cfg?.icon ?? Bell;
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
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${cfg?.bg ?? "bg-yellow-50"}`}
              >
                <Icon className={`h-4 w-4 ${cfg?.color ?? "text-yellow-600"}`} />
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
