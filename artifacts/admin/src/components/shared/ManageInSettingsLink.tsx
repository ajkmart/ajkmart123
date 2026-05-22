import { ArrowUpRight, Info } from "lucide-react";
import { Link } from "wouter";

/**
 * Read-only badge + "Manage in Settings →" link used to replace duplicate
 * setting controls that have been canonicalised to the Settings hub.
 *
 * Per `SETTINGS_MAP.md`: any setting that historically had two edit
 * surfaces (e.g. Maintenance Mode, Service Toggles, Auth methods, SMS
 * provider) now lives in exactly one place. The other surface uses this
 * component to surface the **current value as a status pill** plus a
 * shortcut link. No edit control. No drift.
 *
 * Usage:
 *
 *   <ManageInSettingsLink
 *     label="Maintenance Mode"
 *     value={appStatus === "maintenance" ? "ON — users blocked" : "Live — all good"}
 *     tone={appStatus === "maintenance" ? "warning" : "success"}
 *     to="/settings/general"
 *   />
 */

export type ManageInSettingsTone = "success" | "warning" | "danger" | "neutral" | "info";

const TONE_CLASSES: Record<ManageInSettingsTone, { pill: string; icon: string }> = {
  success: { pill: "bg-green-100 text-green-700 border-green-200", icon: "text-green-600" },
  warning: { pill: "bg-amber-100 text-amber-700 border-amber-200", icon: "text-amber-600" },
  danger: { pill: "bg-red-100 text-red-700 border-red-200", icon: "text-red-600" },
  neutral: { pill: "bg-slate-100 text-slate-700 border-slate-200", icon: "text-slate-500" },
  info: { pill: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: "text-indigo-600" },
};

export interface ManageInSettingsLinkProps {
  /** Friendly setting name, e.g. "Maintenance Mode". */
  label: string;
  /** Current value displayed in the status pill, e.g. "Live", "Off", "5 of 13 enabled". */
  value: string;
  /** Optional caption explaining context (1 line). */
  description?: string;
  /** Status pill tone. */
  tone?: ManageInSettingsTone;
  /** Wouter path for the canonical edit page. */
  to: string;
  /** Override link label (default: "Manage in Settings"). */
  linkLabel?: string;
}

export function ManageInSettingsLink({
  label,
  value,
  description,
  tone = "neutral",
  to,
  linkLabel = "Manage in Settings",
}: ManageInSettingsLinkProps) {
  const t = TONE_CLASSES[tone];
  return (
    <div className="border-border/60 flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 ${t.icon} flex-shrink-0`}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">{label}</p>
          {description && (
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</p>
          )}
          <span
            className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${t.pill}`}
            role="status"
            aria-label={`${label}: ${value}`}
          >
            {value}
          </span>
        </div>
      </div>
      <Link
        href={to}
        className="admin-transition admin-focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        {linkLabel}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
