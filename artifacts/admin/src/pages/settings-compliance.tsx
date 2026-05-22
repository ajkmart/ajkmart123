import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Lock, Shield } from "lucide-react";

interface Setting {
  key: string;
  value: string;
  label: string;
  category: string;
}

const COMPLIANCE_KEYS = [
  "content_tnc_url",
  "content_privacy_url",
  "content_refund_policy_url",
  "content_faq_url",
  "content_about_url",
];

const COMPLIANCE_META: Record<string, { label: string; hint: string; placeholder: string }> = {
  content_tnc_url: {
    label: "Terms of Service URL",
    hint: "Link shown in app when user taps 'Terms & Conditions'",
    placeholder: "https://ajkmart.pk/terms",
  },
  content_privacy_url: {
    label: "Privacy Policy URL",
    hint: "Link shown when user taps 'Privacy Policy'",
    placeholder: "https://ajkmart.pk/privacy",
  },
  content_refund_policy_url: {
    label: "Refund Policy URL",
    hint: "Link shown in order details and customer support",
    placeholder: "https://ajkmart.pk/refund-policy",
  },
  content_faq_url: {
    label: "FAQ / Help Center URL",
    hint: "Shown in app Help section. Leave empty to hide the link",
    placeholder: "https://ajkmart.pk/help",
  },
  content_about_url: {
    label: "About Us URL",
    hint: "Shown in app Settings → About. Leave empty to hide",
    placeholder: "https://ajkmart.pk/about",
  },
};

export function ComplianceSection({
  localValues = {},
  dirtyKeys = new Set<string>(),
  handleChange = () => {},
  settings = [],
}: {
  localValues?: Record<string, string>;
  dirtyKeys?: Set<string>;
  handleChange?: (k: string, v: string) => void;
  handleToggle?: (k: string, v: boolean) => void;
  settings?: Setting[];
}) {
  const configuredCount = COMPLIANCE_KEYS.filter((k) => (localValues[k] ?? "").trim()).length;
  const allConfigured = configuredCount === COMPLIANCE_KEYS.length;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Compliance & Legal Links</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Policy pages shown to users in the app
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-[11px] font-bold ${
              allConfigured
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
          >
            {configuredCount}/{COMPLIANCE_KEYS.length} configured
          </Badge>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2.5 border-b border-blue-100 bg-blue-50 px-5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
          <p className="text-xs leading-relaxed text-blue-800">
            These links open in the user's browser when tapped in the app. Leaving a field empty
            hides that link from the app UI. For GDPR compliance, ensure your Privacy Policy and
            Terms of Service URLs are always configured.
          </p>
        </div>

        <div className="space-y-4 p-5">
          {COMPLIANCE_KEYS.map((key) => {
            const meta = COMPLIANCE_META[key]!;
            const value = localValues[key] ?? settings.find((s) => s.key === key)?.value ?? "";
            const isDirty = dirtyKeys.has(key);
            const isSet = value.trim().length > 0;

            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="text-foreground text-sm font-semibold">{meta.label}</label>
                  {isDirty && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                    >
                      CHANGED
                    </Badge>
                  )}
                  {isSet && !isDirty && (
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                  )}
                </div>
                <div className="relative">
                  <input
                    type="url"
                    value={value}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={meta.placeholder}
                    className={`h-10 w-full rounded-xl border px-3 pr-10 text-sm focus:ring-2 focus:ring-slate-300 focus:outline-none ${
                      isDirty
                        ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200"
                        : "border-slate-200 bg-white"
                    }`}
                  />
                  {isSet && (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                      title="Open in browser"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-muted-foreground text-[11px]">{meta.hint}</p>
                <p className="text-muted-foreground font-mono text-[10px]">{key}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* GDPR readiness checklist */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Shield className="h-4 w-4 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-700">Compliance Readiness</h4>
        </div>
        <div className="space-y-3 p-5">
          {[
            {
              label: "Privacy Policy linked",
              done: !!(localValues["content_privacy_url"] ?? "").trim(),
              required: true,
            },
            {
              label: "Terms of Service linked",
              done: !!(localValues["content_tnc_url"] ?? "").trim(),
              required: true,
            },
            {
              label: "Refund Policy linked",
              done: !!(localValues["content_refund_policy_url"] ?? "").trim(),
              required: false,
            },
            {
              label: "FAQ / Help Center linked",
              done: !!(localValues["content_faq_url"] ?? "").trim(),
              required: false,
            },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                  item.done
                    ? "bg-green-100 text-green-600"
                    : item.required
                      ? "bg-red-100 text-red-500"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {item.done ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              </div>
              <span
                className={`text-sm ${item.done ? "text-slate-700" : item.required ? "font-medium text-red-600" : "text-slate-500"}`}
              >
                {item.label}
                {item.required && !item.done && (
                  <span className="ml-1.5 text-[10px] font-bold text-red-500">Required</span>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            These links appear in the Customer App, Vendor Portal and Rider App settings screens.
            Ensure all required URLs are live and publicly accessible before launching.
          </p>
        </div>
      </div>
    </div>
  );
}
