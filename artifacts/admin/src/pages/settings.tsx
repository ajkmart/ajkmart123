import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NavigationGuard } from "@/components/NavigationGuard";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { useLanguage } from "@/lib/useLanguage";
import { useQueryClient } from "@tanstack/react-query";
import { tDual } from "@workspace/i18n";
import {
  ChevronRight,
  Download,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { BrandingSection } from "./settings-branding";
import { ComplianceSection } from "./settings-compliance";
import {
  CATEGORY_CONFIG,
  LEGACY_TO_TOP10,
  parseSettingsPath,
  resolveTop10,
  TOP10_CONFIG,
  TOP10_ORDER,
  Top10Key,
} from "./settings-config";
import { GeneralSection } from "./settings-general";
import { IntegrationsSection } from "./settings-integrations";
import { MonitoringSection } from "./settings-monitoring";
import { NotificationsSection } from "./settings-notifications";
import { PaymentSection } from "./settings-payment";
import { CatKey, renderSection, Setting, TEXT_KEYS } from "./settings-render";
import { SecuritySection } from "./settings-security";
import { SystemSection } from "./settings-system";
import { WeatherSection } from "./settings-weather";

/* ─────────────────────────────────────────────────────────────────────────
 * TOP-10 settings model
 *
 * The DB still stores ~30 fine-grained `category` values on each setting row
 * (general, features, dispatch, …). The render layer maps those legacy
 * categories into 10 top-level groups via LEGACY_TO_TOP10 below. Every legacy
 * category remains a sub-section inside its top-10 parent — this keeps the
 * existing renderSection() dispatch and dedicated section components
 * untouched while presenting a clean Top-10 navigation.
 *
 * Deep links: both `?tab=` (new) and `?cat=` (legacy) are accepted, and both
 * top-10 keys *and* legacy category names resolve to the right tab.
 * ───────────────────────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Wouter's `useLocation` returns the path with the configured router base
  // already stripped (see `WouterRouter base={…}` in App.tsx) and provides a
  // setter that respects the same base. Using it here keeps deep-link
  // parsing and URL normalisation correct under non-root deployments
  // such as `/admin`.
  const [routerLocation, navigate] = useLocation();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [activeTop10, setActiveTop10] = useState<Top10Key>(() => {
    // Priority: route :section > ?tab= > ?cat= > default ("services").
    // routerLocation is base-stripped so the regex always matches.
    const params = parseSettingsPath(routerLocation);
    const fromRoute = resolveTop10(params.section);
    if (fromRoute) return fromRoute;
    const p = new URLSearchParams(window.location.search);
    return resolveTop10(p.get("tab")) ?? resolveTop10(p.get("cat")) ?? "general";
  });
  // Sub-section deep link — when the path includes /:subsection we scroll to
  // it on mount. The legacy ?cat= query is also honoured so pre-existing
  // bookmarks continue to land on the correct child block.
  const [pendingSubsection, setPendingSubsection] = useState<string | null>(() => {
    const params = parseSettingsPath(routerLocation);
    if (params.subsection) return params.subsection;
    const p = new URLSearchParams(window.location.search);
    return p.get("cat");
  });

  /* ── Global settings search (cross-section) ──────────────────────────── */
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [_highlightKey, setHighlightKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const jumpTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      jumpTimersRef.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "f" &&
        document.querySelector("[data-settings-search]")
      ) {
        const el = document.querySelector<HTMLInputElement>("[data-settings-search]");
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
        }
      }
      if (e.key === "Escape" && searchOpen) setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  /* Keep deep links in sync — canonical form is `/settings/:section`. We
   * normalise away the legacy `?tab=` and `?cat=` query strings on every
   * section change so newly-shared URLs use the modern shape. Existing
   * bookmarks with the legacy params are still resolved on load by
   * `resolveTop10` above. We use wouter's `navigate` (the setter from
   * useLocation) with `{ replace: true }` so the router base path is
   * honoured — direct `window.history.replaceState` would bypass the
   * `<WouterRouter base={…}>` config and break under non-root deploys. */
  useEffect(() => {
    const params = parseSettingsPath(routerLocation);
    // Subsection is only meaningful when it belongs to the active section.
    // When the admin switches the top-level section, drop a stale subsection
    // so we never produce mismatched URLs like /settings/general/cache after
    // starting from /settings/system_perf/cache. A subsection is "valid" if
    // (a) the URL's :section segment resolved to the same activeTop10, and
    // (b) it maps to a CatKey that lives under that activeTop10's children.
    const urlSection = resolveTop10(params.section);
    // TOP10_CONFIG is a module-level constant; safe to read here even though
    // the convenience `activeCfg` alias is declared further down the file.
    const childCats = TOP10_CONFIG[activeTop10].children as readonly string[];
    const subsectionIsValid =
      !!params.subsection && urlSection === activeTop10 && childCats.includes(params.subsection);
    const targetPath = subsectionIsValid
      ? `/settings/${activeTop10}/${encodeURIComponent(params.subsection!)}`
      : `/settings/${activeTop10}`;
    // Preserve any other query params (e.g. ?notice=…) the page may use,
    // but always drop the legacy `tab` / `cat` keys.
    const search = new URLSearchParams(window.location.search);
    search.delete("tab");
    search.delete("cat");
    const qs = search.toString();
    const targetWithQs = qs ? `${targetPath}?${qs}` : targetPath;
    // Skip the navigate when we'd land on the same place (avoids infinite
    // re-render loops if other effects also touch the URL).
    const currentWithQs = qs
      ? `${routerLocation.replace(/\/+$/, "")}?${qs}`
      : routerLocation.replace(/\/+$/, "");
    if (currentWithQs !== targetWithQs) {
      navigate(targetWithQs, { replace: true });
    }
    // Intentionally only re-run when activeTop10 changes — navigate/
    // routerLocation update inside the effect would loop otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTop10]);

  /* Once settings have loaded and the active section is rendered, scroll to
   * the requested sub-section (e.g. `/settings/system_perf/cache`) and clear
   * the pending state so we only do this once per navigation. */
  useEffect(() => {
    if (!pendingSubsection || loading) return;
    const id = `sub-${pendingSubsection}`;
    const el = typeof document !== "undefined" ? document.getElementById(id) : null;
    setPendingSubsection(null);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ajkm-section-flash");
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      el.classList.remove("ajkm-section-flash");
      flashTimerRef.current = null;
    }, 1800);
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
        el.classList.remove("ajkm-section-flash");
      }
    };
  }, [pendingSubsection, loading, activeTop10]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/platform-settings");
      setSettings(data.settings || []);
      const vals: Record<string, string> = {};
      for (const s of data.settings || []) vals[s.key] = s.value;
      setLocalValues(vals);
      setSavedValues(vals);
      setDirtyKeys(new Set());
    } catch (e: unknown) {
      toast({
        title: "Failed to load settings",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleChange = (key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => {
      const n = new Set(prev);
      if (value === savedValues[key]) {
        n.delete(key);
      } else {
        n.add(key);
      }
      return n;
    });
  };
  const handleToggle = (key: string, val: boolean) => handleChange(key, val ? "on" : "off");

  const [showDiffPreview, setShowDiffPreview] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<
    Array<{ key: string; oldValue: string; newValue: string }>
  >([]);

  const handleSave = () => {
    const diff = Array.from(dirtyKeys).map((key) => ({
      key,
      oldValue: savedValues[key] ?? "",
      newValue: localValues[key] ?? "",
    }));
    if (diff.length === 0) return;
    setPendingDiff(diff);
    setShowDiffPreview(true);
  };

  const performSave = async () => {
    setShowDiffPreview(false);
    setSaving(true);
    try {
      const changed =
        pendingDiff.length > 0
          ? pendingDiff.map((d) => ({ key: d.key, value: d.newValue }))
          : Array.from(dirtyKeys).map((key) => ({ key, value: localValues[key] ?? "" }));

      await adminFetch("/platform-settings", {
        method: "PUT",
        body: JSON.stringify({ settings: changed }),
      });
      setSavedValues((prev) => {
        const updated = { ...prev };
        for (const c of changed) updated[c.key] = c.value;
        return updated;
      });
      setDirtyKeys(new Set());
      toast({
        title: "Settings saved ✅",
        description: `${changed.length} change(s) applied instantly.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
    setSaving(false);
    setPendingDiff([]);
  };

  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<File | null>(null);
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const data = await adminFetch("/platform-settings/backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `ajkmart-settings-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Backup download started",
        description: `${data.count ?? data.settings?.length ?? 0} settings exported — check your Downloads folder.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Backup failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
    setBackingUp(false);
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    setPendingRestore(file);
  };

  const performRestore = async (file: File) => {
    setPendingRestore(null);
    setRestoring(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON file.");
      }
      const parsedObj = parsed as Record<string, unknown> | null;
      const settingsArr = Array.isArray(parsedObj?.settings)
        ? parsedObj.settings
        : Array.isArray(parsed)
          ? parsed
          : null;
      if (!Array.isArray(settingsArr))
        throw new Error("Backup file must contain a settings array.");
      const payload = (settingsArr as unknown[]).map((s) => {
        const entry = s as Record<string, unknown>;
        return { key: String(entry.key ?? ""), value: String(entry.value ?? "") };
      });
      const result = await adminFetch("/platform-settings/restore", {
        method: "POST",
        body: JSON.stringify({ settings: payload }),
      });
      await loadSettings();
      toast({
        title: "Settings restored ✅",
        description: `${result.restored ?? payload.length} settings applied${result.skipped ? `, ${result.skipped} skipped` : ""}.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Restore failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
    setRestoring(false);
  };

  const grouped = useMemo(() => {
    const byCategory: Record<string, Setting[]> = {};
    for (const s of settings) {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category]!.push(s);
    }
    return byCategory;
  }, [settings]);

  const getInputType = (key: string) => (TEXT_KEYS.has(key) ? "text" : "number");
  const getInputSuffix = (key: string) => {
    if (key.includes("_pct") || key.includes("pct")) return "%";
    if (TEXT_KEYS.has(key)) return "";
    if (key.includes("_km") || key === "rider_acceptance_km") return "KM";
    if (key.includes("_day") || key.includes("_days") || key === "security_session_days")
      return "days";
    if (key.includes("_pts") || key.includes("_items") || key.includes("_deliveries")) return "#";
    if (key === "security_rate_limit") return "req/min";
    if (key === "payment_timeout_mins") return "min";
    if (key.includes("_sec")) return "sec";
    if (key.includes("_multiplier")) return "×";
    return "Rs.";
  };
  const getPlaceholder = (key: string) => {
    if (key.includes("_url")) return "https://...";
    if (key === "content_announcement") return "Leave empty to hide the bar in all apps";
    if (key === "content_banner") return "";
    if (key === "content_maintenance_msg") return "";
    if (key === "content_support_msg") return "";
    if (key === "content_vendor_notice") return "Leave empty to hide";
    if (key === "content_rider_notice") return "Leave empty to hide";
    if (key === "content_refund_policy_url") return "https://...";
    if (key === "content_faq_url") return "https://...";
    if (key === "content_about_url") return "https://...";
    return "";
  };

  const activeCfg = TOP10_CONFIG[activeTop10];
  const ActiveIcon = activeCfg.icon;

  const DISPLAY_CAT_OVERRIDE = useMemo<Record<string, string>>(
    () => ({
      vendor_min_payout: "finance",
      customer_referral_bonus: "payment",
      customer_signup_bonus: "payment",
    }),
    []
  );

  /* The 7 sections that always render even with zero DB settings. */
  const ALWAYS_VISIBLE = useMemo(
    () =>
      new Set<CatKey>([
        "payment",
        "integrations",
        "security",
        "system",
        "weather",
        "compliance",
        "branding",
      ]),
    []
  );

  const childHasContent = useCallback(
    (cat: CatKey) => {
      return ALWAYS_VISIBLE.has(cat) || (grouped[cat]?.length ?? 0) > 0;
    },
    [ALWAYS_VISIBLE, grouped]
  );

  const activeChildrenWithContent = useMemo(
    () => activeCfg.children.filter(childHasContent),
    [activeCfg.children, childHasContent]
  );

  const activeChildSettingsCount = useMemo(
    () =>
      activeChildrenWithContent.reduce(
        (count, child) =>
          count + ((grouped[child]?.length ?? 0) || (ALWAYS_VISIBLE.has(child) ? 1 : 0)),
        0
      ),
    [activeChildrenWithContent, grouped, ALWAYS_VISIBLE]
  );

  /* Cross-section search results: match settings by key/label/description, group by Top10. */
  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (q.length < 2)
      return [] as Array<{ key: string; label: string; cat: string; top10: Top10Key }>;
    const results: Array<{
      key: string;
      label: string;
      cat: string;
      top10: Top10Key;
      score: number;
    }> = [];
    for (const s of settings) {
      const label = (s.label || s.key).toLowerCase();
      const key = s.key.toLowerCase();
      let score = 0;
      if (key === q) score = 100;
      else if (label === q) score = 95;
      else if (key.startsWith(q)) score = 80;
      else if (label.startsWith(q)) score = 75;
      else if (label.includes(q)) score = 60;
      else if (key.includes(q)) score = 50;
      if (score > 0) {
        const dispCat = DISPLAY_CAT_OVERRIDE[s.key] ?? s.category;
        const top10 = LEGACY_TO_TOP10[dispCat] ?? LEGACY_TO_TOP10[s.category];
        if (top10) {
          results.push({ key: s.key, label: s.label || s.key, cat: dispCat, top10, score });
        }
      }
    }
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ score: _s, ...r }) => r);
  }, [searchQ, settings, DISPLAY_CAT_OVERRIDE]);

  const jumpToSetting = useCallback((target: { key: string; cat: string; top10: Top10Key }) => {
    jumpTimersRef.current.forEach(clearTimeout);
    jumpTimersRef.current = [];
    setActiveTop10(target.top10);
    setSearchOpen(false);
    setMobileDrawerOpen(false);
    setHighlightKey(target.key);
    const t1 = setTimeout(() => {
      const subEl = document.getElementById(`sub-${target.cat}`);
      if (subEl) {
        subEl.scrollIntoView({ behavior: "smooth", block: "start" });
        subEl.classList.add("ajkm-section-flash");
        const t2 = setTimeout(() => subEl.classList.remove("ajkm-section-flash"), 1800);
        const t3 = setTimeout(() => setHighlightKey(null), 2400);
        jumpTimersRef.current.push(t2, t3);
      } else {
        const t4 = setTimeout(() => setHighlightKey(null), 2400);
        jumpTimersRef.current.push(t4);
      }
    }, 100);
    jumpTimersRef.current.push(t1);
  }, []);

  const dirtyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k of dirtyKeys) {
      const s = settings.find((x) => x.key === k);
      if (!s) continue;
      const displayCat = DISPLAY_CAT_OVERRIDE[k] ?? s.category;
      const top10 = LEGACY_TO_TOP10[displayCat] ?? LEGACY_TO_TOP10[s.category];
      if (top10) counts[top10] = (counts[top10] || 0) + 1;
    }
    return counts;
  }, [dirtyKeys, settings, DISPLAY_CAT_OVERRIDE]);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-2xl">
            <Settings2
              className="text-primary h-6 w-6 animate-spin"
              style={{ animationDuration: "3s" }}
            />
          </div>
          <p className="text-muted-foreground text-sm font-medium">Loading settings...</p>
        </div>
      </div>
    );
  }

  const appNameValue = (
    localValues["app_name"] ??
    settings.find((s) => s.key === "app_name")?.value ??
    ""
  ).trim();
  const appNameBlank = appNameValue === "";

  /* Children of the active top-10 group + total settings rendered in this view. */
  const activeChildren = activeCfg.children;
  const _totalChildSettingsCount = activeChildren.reduce(
    (n, c) => n + (grouped[c]?.length ?? 0),
    0
  );

  /* Renders one legacy sub-section inside the active top-10 group. */
  const renderLegacyChild = (cat: CatKey) => {
    if (cat === "payment") {
      return (
        <PaymentSection
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleChange={handleChange}
          handleToggle={handleToggle}
          onNavigateFeatures={() => setActiveTop10("general")}
        />
      );
    }
    if (cat === "integrations") {
      return (
        <IntegrationsSection
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleChange={handleChange}
          handleToggle={handleToggle}
        />
      );
    }
    if (cat === "security") {
      return (
        <SecuritySection
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleChange={handleChange}
          handleToggle={handleToggle}
        />
      );
    }
    if (cat === "compliance") {
      return (
        <ComplianceSection
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleChange={handleChange}
          handleToggle={handleToggle}
          settings={settings}
        />
      );
    }
    if (cat === "branding") {
      return (
        <BrandingSection
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleChange={handleChange}
          handleToggle={handleToggle}
          settings={settings}
        />
      );
    }

    if (cat === "system")
      return (
        <SystemSection
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleChange={handleChange}
          handleToggle={handleToggle}
          settings={settings}
        />
      );
    if (cat === "weather")
      return (
        <WeatherSection
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleChange={handleChange}
          handleToggle={handleToggle}
          settings={settings}
        />
      );
    const childSettings = grouped[cat] ?? [];
    if (childSettings.length === 0) {
      return (
        <p className="text-muted-foreground px-1 py-2 text-xs italic">
          No settings configured for this sub-section yet.
        </p>
      );
    }
    return renderSection(
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
    );
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Settings page crashed. Please reload.
        </div>
      }
    >
      <div className="max-w-5xl space-y-4">
        <NavigationGuard
          isDirty={dirtyKeys.size > 0}
          message={`You have ${dirtyKeys.size} unsaved setting${dirtyKeys.size !== 1 ? "s" : ""}. Save before leaving?`}
        />
        {/* Hidden file input for restore */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleRestoreFile}
        />

        {/* Header */}
        <PageHeader
          icon={Settings2}
          title="App Settings"
          subtitle={
            dirtyKeys.size > 0
              ? `${dirtyKeys.size} unsaved change${dirtyKeys.size > 1 ? "s" : ""}`
              : "All settings saved"
          }
          iconBgClass="bg-slate-100"
          iconColorClass="text-slate-600"
          actions={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleBackup}
                disabled={backingUp || loading}
                title="Download all settings as a JSON backup file"
                className="h-9 gap-2 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                {backingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Backup</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={restoring || loading}
                title="Restore settings from a JSON backup file"
                className="h-9 gap-2 rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                {restoring ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Restore</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void loadSettings();
                  toast({ title: "Reloaded" });
                }}
                disabled={loading}
                className="h-9 gap-2 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" /> <span className="xs:inline hidden">Reset</span>
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || dirtyKeys.size === 0 || appNameBlank}
                title={appNameBlank ? "App Name cannot be blank" : undefined}
                className="h-9 gap-2 rounded-xl shadow-sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Saving..." : `Save${dirtyKeys.size > 0 ? ` (${dirtyKeys.size})` : ""}`}
              </Button>
            </div>
          }
        />

        {/* ── Mobile: sticky section bar with drawer trigger ── */}
        <div className="border-border/40 sticky top-0 z-20 -mx-3 border-b bg-slate-50/95 px-3 py-2 backdrop-blur-sm sm:-mx-5 sm:px-5 md:hidden">
          <div className="flex items-center gap-3">
            {/* Active section indicator */}
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${activeCfg.bg}`}
            >
              <ActiveIcon className={`h-4 w-4 ${activeCfg.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-semibold">{activeCfg.label}</p>
              {(dirtyCounts[activeTop10] ?? 0) > 0 && (
                <p className="text-[11px] leading-tight font-medium text-amber-600">
                  {dirtyCounts[activeTop10] ?? 0} unsaved
                </p>
              )}
            </div>
            {/* Reset shortcut on mobile */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void loadSettings();
                toast({ title: "Reloaded" });
              }}
              disabled={loading}
              className="h-8 shrink-0 rounded-xl px-2.5"
              title="Reset all changes"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {/* Save shortcut on mobile */}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || dirtyKeys.size === 0 || appNameBlank}
              className="h-8 shrink-0 gap-1.5 rounded-xl px-3 text-xs"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {dirtyKeys.size > 0 ? `Save (${dirtyKeys.size})` : "Save"}
            </Button>
            {/* All settings trigger */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="border-border/60 text-foreground hover:bg-muted/40 flex h-8 shrink-0 items-center gap-1.5 rounded-xl border bg-white px-3 text-xs font-semibold transition-colors"
            >
              <SlidersHorizontal className="text-muted-foreground h-3.5 w-3.5" />
              All Settings
            </button>
          </div>
        </div>

        {/* ── Mobile bottom sheet drawer ── */}
        <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
          <SheetContent
            side="bottom"
            className="flex max-h-[85vh] flex-col rounded-t-2xl p-0 md:hidden"
          >
            {/* Drag handle */}
            <div className="flex shrink-0 justify-center pt-3 pb-1">
              <div className="bg-border/60 h-1 w-10 rounded-full" />
            </div>
            {/* Sheet title (accessible, visually styled) */}
            <div className="border-border/30 shrink-0 border-b px-5 pt-1 pb-3">
              <SheetTitle className="text-foreground flex items-center gap-2 text-base font-bold">
                <Settings2 className="text-muted-foreground h-4 w-4" />
                All Settings
                {dirtyKeys.size > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-auto border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                  >
                    {dirtyKeys.size} unsaved
                  </Badge>
                )}
              </SheetTitle>
              {/* Mobile global search */}
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQ}
                  placeholder="Search across all settings…"
                  onChange={(e) => setSearchQ(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white pr-7 pl-8 text-sm placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                />
                {searchQ && (
                  <button
                    onClick={() => setSearchQ("")}
                    className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
                    title="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Flat Top-10 list OR search results */}
            <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3 pb-8">
              {searchQ.trim().length >= 2 ? (
                searchResults.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">
                    No matching settings
                  </div>
                ) : (
                  <>
                    <p className="px-2 pb-1.5 text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                      {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
                    </p>
                    {searchResults.map((r) => {
                      const top10cfg = TOP10_CONFIG[r.top10];
                      return (
                        <button
                          key={r.key}
                          onClick={() => jumpToSetting(r)}
                          className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 text-left transition-colors hover:bg-indigo-50"
                        >
                          <div
                            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${top10cfg.bg}`}
                          >
                            <top10cfg.icon className={`h-4 w-4 ${top10cfg.color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate text-sm font-semibold">
                              {r.label}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                              {r.key}
                            </p>
                          </div>
                          <span className="shrink-0 text-[9px] font-bold tracking-wide text-slate-400 uppercase">
                            {top10cfg.label.split(" ")[0]}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )
              ) : (
                TOP10_ORDER.map((key, idx) => {
                  const cfg = TOP10_CONFIG[key];
                  const Icon = cfg.icon;
                  const isActive = activeTop10 === key;
                  const dirty = dirtyCounts[key] || 0;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setActiveTop10(key);
                        setMobileDrawerOpen(false);
                      }}
                      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                        isActive
                          ? "bg-slate-900 text-white shadow-sm"
                          : "hover:bg-muted/50 text-foreground bg-transparent"
                      }`}
                      data-tab={key}
                    >
                      {isActive && (
                        <span
                          className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full"
                          style={{ background: "var(--color-accent, #6366F1)" }}
                        />
                      )}
                      <div
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-base ${isActive ? "bg-white/15" : cfg.bg}`}
                      >
                        <Icon className={`h-4 w-4 ${isActive ? "text-white" : cfg.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-semibold ${isActive ? "text-white" : "text-foreground"}`}
                        >
                          <span className="text-muted-foreground/70 mr-1 font-normal">
                            {idx + 1}.
                          </span>{" "}
                          {cfg.label}
                        </p>
                        <p
                          className={`mt-0.5 truncate text-[11px] ${isActive ? "text-white/60" : "text-muted-foreground"}`}
                        >
                          {cfg.description}
                        </p>
                      </div>
                      {dirty > 0 ? (
                        <span
                          className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"}`}
                        >
                          {dirty}
                        </span>
                      ) : (
                        <ChevronRight
                          className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-white/40" : "text-muted-foreground/30"}`}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Two-panel layout */}
        <div className="flex items-start gap-4">
          {/* LEFT sidebar — desktop only */}
          <div className="border-border/60 sticky top-4 hidden w-60 flex-shrink-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm md:flex">
            {/* Sidebar header */}
            <div className="border-border/40 border-b bg-slate-50/80 px-4 pt-4 pb-3">
              <div className="mb-2.5 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                  <Settings2 className="h-3.5 w-3.5 text-slate-600" />
                </div>
                <p className="text-[12px] font-bold tracking-wide text-slate-600">Settings</p>
              </div>
              {/* Global search */}
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    data-settings-search
                    type="text"
                    value={searchQ}
                    placeholder="Search settings…"
                    onChange={(e) => {
                      setSearchQ(e.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => searchQ.trim().length >= 2 && setSearchOpen(true)}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white pr-7 pl-8 text-xs placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                  />
                  {searchQ && (
                    <button
                      onClick={() => {
                        setSearchQ("");
                        setSearchOpen(false);
                      }}
                      className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
                      title="Clear"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {searchOpen && searchQ.trim().length >= 2 && (
                  <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {searchResults.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-400">
                        No matching settings
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-1.5">
                          <span className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                            {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
                          </span>
                          <span className="text-[10px] text-slate-400">⌘F</span>
                        </div>
                        {searchResults.map((r) => {
                          const top10cfg = TOP10_CONFIG[r.top10];
                          return (
                            <button
                              key={r.key}
                              onClick={() => jumpToSetting(r)}
                              className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-indigo-50"
                            >
                              <div
                                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${top10cfg.bg}`}
                              >
                                <top10cfg.icon className={`h-3 w-3 ${top10cfg.color}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-700">
                                  {r.label}
                                </p>
                                <p className="truncate font-mono text-[10px] text-slate-400">
                                  {r.key}
                                </p>
                              </div>
                              <span className="shrink-0 text-[9px] font-bold tracking-wide text-slate-400 uppercase">
                                {top10cfg.label.split(" ")[0]}
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <nav
              className="max-h-[calc(100vh-200px)] overflow-y-auto p-2.5 pb-3"
              style={{ scrollbarWidth: "none" }}
            >
              {TOP10_ORDER.map((key, idx) => {
                const cfg = TOP10_CONFIG[key];
                const Icon = cfg.icon;
                const isActive = activeTop10 === key;
                const dirty = dirtyCounts[key] || 0;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTop10(key)}
                    data-tab={key}
                    className={`group relative mb-0.5 flex w-full items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2.5 text-left transition-all ${
                      isActive
                        ? "bg-slate-900 text-white shadow-md"
                        : "text-foreground hover:bg-slate-50"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-indigo-400" />
                    )}
                    <div
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${isActive ? "bg-white/15" : cfg.bg}`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${isActive ? "text-white" : cfg.color}`} />
                    </div>
                    <span
                      className={`flex-1 truncate text-xs font-semibold ${isActive ? "text-white" : "text-slate-700"}`}
                    >
                      <span
                        className={`mr-1 font-normal ${isActive ? "text-white/60" : "text-slate-400"}`}
                      >
                        {idx + 1}.
                      </span>
                      {cfg.label}
                    </span>
                    {dirty > 0 ? (
                      <span
                        className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"}`}
                      >
                        {dirty}
                      </span>
                    ) : (
                      <ChevronRight
                        className={`h-3 w-3 flex-shrink-0 transition-colors ${isActive ? "text-white/40" : "text-slate-300 group-hover:text-slate-400"}`}
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="border-border/40 border-t bg-slate-50/60 px-4 py-2.5">
              <p className="text-muted-foreground text-[10px]">{settings.length} settings</p>
            </div>
          </div>

          {/* RIGHT content */}
          <div className="min-w-0 flex-1 space-y-4">
            <div className="border-border/60 overflow-hidden rounded-2xl border bg-white shadow-sm">
              {/* Section header — breadcrumbs above the title surface the
                hub → section path so admins always know where they are. */}
              <div className="border-border/40 flex items-start gap-3 border-b px-6 py-4">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${activeCfg.bg}`}
                >
                  <ActiveIcon className={`h-5 w-5 ${activeCfg.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <nav
                    aria-label="breadcrumb"
                    className="text-muted-foreground mb-1 flex items-center gap-1 text-[11px] leading-none"
                  >
                    <span className="text-foreground/70 font-semibold">Settings</span>
                    <ChevronRight className="h-3 w-3 opacity-50" />
                    <span className="font-semibold" style={{ color: "rgb(15 23 42 / 0.85)" }}>
                      {activeCfg.label}
                    </span>
                  </nav>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-foreground font-bold">{activeCfg.label}</h2>
                    {activeChildSettingsCount > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-muted/50 text-muted-foreground border-border text-[10px]"
                      >
                        {activeChildSettingsCount} settings
                      </Badge>
                    )}
                    {(dirtyCounts[activeTop10] ?? 0) > 0 && (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                      >
                        {dirtyCounts[activeTop10] ?? 0} changed
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">{activeCfg.description}</p>
                </div>
              </div>
              {/* Section body — dedicated section components for general/notifications/monitoring;
                per-category loop for all other top-10 groups */}
              <div className="space-y-8 p-4 sm:p-6">
                {activeTop10 === "general" ? (
                  <GeneralSection
                    settings={settings}
                    grouped={grouped}
                    localValues={localValues}
                    dirtyKeys={dirtyKeys}
                    handleChange={handleChange}
                    handleToggle={handleToggle}
                  />
                ) : activeTop10 === "notifications" ? (
                  <NotificationsSection
                    settings={settings}
                    grouped={grouped}
                    localValues={localValues}
                    dirtyKeys={dirtyKeys}
                    handleChange={handleChange}
                    handleToggle={handleToggle}
                  />
                ) : activeTop10 === "monitoring" ? (
                  <MonitoringSection
                    settings={settings}
                    grouped={grouped}
                    localValues={localValues}
                    dirtyKeys={dirtyKeys}
                    handleChange={handleChange}
                    handleToggle={handleToggle}
                  />
                ) : activeChildrenWithContent.length === 0 ? (
                  <div className="text-muted-foreground py-12 text-center">
                    <Settings2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    <p className="text-sm">No settings in this section</p>
                  </div>
                ) : (
                  activeChildrenWithContent.map((child, idx) => {
                    const subCfg = CATEGORY_CONFIG[child];
                    const SubIcon = subCfg.icon;
                    const childSettings = grouped[child] ?? [];
                    const childDirty = Array.from(dirtyKeys).filter((k) => {
                      const s = settings.find((x) => x.key === k);
                      if (!s) return false;
                      const dispCat = DISPLAY_CAT_OVERRIDE[k] ?? s.category;
                      return dispCat === child;
                    }).length;
                    return (
                      <section
                        key={child}
                        id={`sub-${child}`}
                        data-cat={child}
                        className={idx > 0 ? "border-border/50 border-t pt-6" : ""}
                      >
                        {/* Sub-section header */}
                        <div className="mb-4 flex items-start gap-3">
                          <div
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${subCfg.bg}`}
                          >
                            <SubIcon className={`h-4 w-4 ${subCfg.color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-foreground text-sm font-bold">{subCfg.label}</h3>
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
                            <p className="text-muted-foreground mt-0.5 text-[11px]">
                              {subCfg.description}
                            </p>
                          </div>
                        </div>
                        {/* Sub-section body */}
                        {renderLegacyChild(child)}
                      </section>
                    );
                  })
                )}
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border border-blue-200/60 bg-blue-50/60 p-4">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
              <p className="text-xs text-blue-700">
                <strong className="text-blue-800">Changes apply instantly</strong> after saving — no
                restart needed. Payment gateways: use Manual mode without API credentials, or API
                mode for automated payments. Sandbox mode works without real credentials for
                testing.
              </p>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={!!pendingRestore}
          onClose={() => setPendingRestore(null)}
          onConfirm={() => pendingRestore && performRestore(pendingRestore)}
          title={tDual("restoreSettingsTitle", language)}
          description={
            pendingRestore
              ? `${pendingRestore.name}\n\n${tDual("restoreSettingsBody", language)}`
              : ""
          }
          confirmLabel="Restore"
          variant="destructive"
          busy={restoring}
        />

        {/* ── Settings Diff Preview — uses shared ConfirmDialog ── */}
        <ConfirmDialog
          open={showDiffPreview}
          title="Review changes before saving"
          description={
            pendingDiff.length === 0
              ? "No changes to apply."
              : `${pendingDiff.length} setting${pendingDiff.length !== 1 ? "s" : ""} will be updated and applied immediately:\n\n` +
                pendingDiff
                  .map(
                    (d) => `• ${d.key}\n  ${d.oldValue || "(empty)"} → ${d.newValue || "(empty)"}`
                  )
                  .join("\n\n")
          }
          confirmLabel={
            saving
              ? "Saving…"
              : `Apply ${pendingDiff.length} change${pendingDiff.length !== 1 ? "s" : ""}`
          }
          busy={saving}
          onConfirm={() => {
            void performSave();
          }}
          onClose={() => setShowDiffPreview(false)}
        />
      </div>
    </ErrorBoundary>
  );
}
