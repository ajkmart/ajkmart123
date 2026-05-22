import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NavigationGuard } from "@/components/NavigationGuard";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminFetch } from "@/lib/adminFetcher";
import { ADMIN_I18N_KEYS, t } from "@/lib/i18nKeys";
import {
  useAccessibilitySettings,
  type AdminContrast,
  type AdminFontScale,
} from "@/lib/useAccessibilitySettings";
import { CheckCircle2, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function AccessibilityPage() {
  const { settings, setFontScale, setContrast, setReduceMotion, reset } =
    useAccessibilitySettings();

  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    adminFetch("/system/me/preferences")
      .then((data: any) => {
        const prefs = data?.preferences ?? {};
        if (prefs.font_scale) setFontScale(prefs.font_scale as AdminFontScale);
        if (prefs.contrast) setContrast(prefs.contrast as AdminContrast);
        if (typeof prefs.reduce_motion === "boolean") setReduceMotion(prefs.reduce_motion);
      })
      .catch(() => {
        setSyncStatus("error");
      });
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSyncStatus("saving");
    debounceRef.current = setTimeout(() => {
      adminFetch("/system/me/preferences", {
        method: "PUT",
        body: JSON.stringify({
          font_scale: settings.fontScale,
          contrast: settings.contrast,
          reduce_motion: settings.reduceMotion,
        }),
      })
        .then(() => {
          setSyncStatus("saved");
          setTimeout(() => setSyncStatus("idle"), 2000);
        })
        .catch(() => {
          setSyncStatus("error");
          setTimeout(() => setSyncStatus("idle"), 3000);
        });
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings]);

  const fontOptions: Array<{ value: AdminFontScale; label: string }> = [
    { value: 0.875, label: "Small (87.5%)" },
    { value: 1, label: "Default (100%)" },
    { value: 1.125, label: "Large (112.5%)" },
    { value: 1.25, label: "Extra Large (125%)" },
  ];

  const contrastOptions: Array<{ value: AdminContrast; label: string }> = [
    { value: "normal", label: "Normal" },
    { value: "high", label: "High contrast (WCAG AAA)" },
  ];

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Accessibility page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <NavigationGuard
          isDirty={syncStatus === "saving"}
          message="Your accessibility settings are still saving. Are you sure you want to leave?"
        />
        <PageHeader
          icon={Eye}
          title={t(ADMIN_I18N_KEYS.settings.accessibility, "Accessibility")}
          subtitle="Personalise how the admin renders for low-vision and motion-sensitive users. Settings sync across devices."
          iconBgClass="bg-slate-100"
          iconColorClass="text-slate-600"
          actions={
            <div className="flex items-center gap-2 text-sm">
              {syncStatus === "saving" && (
                <span className="text-muted-foreground animate-pulse">Saving…</span>
              )}
              {syncStatus === "saved" && (
                <span className="flex items-center gap-1 font-medium text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> Saved
                </span>
              )}
              {syncStatus === "error" && (
                <span className="text-xs text-amber-600">Sync failed — browser-only mode</span>
              )}
            </div>
          }
        />

        <Card className="p-5">
          <div role="radiogroup" aria-labelledby="font-scale-label">
            <p id="font-scale-label" className="mb-3 text-sm font-semibold">
              Text size
            </p>
            <div className="flex flex-wrap gap-2">
              {fontOptions.map((opt) => (
                <Button
                  key={opt.value}
                  role="radio"
                  aria-checked={settings.fontScale === opt.value}
                  variant={settings.fontScale === opt.value ? "default" : "outline"}
                  onClick={() => setFontScale(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div role="radiogroup" aria-labelledby="contrast-label">
            <p id="contrast-label" className="mb-3 text-sm font-semibold">
              Contrast
            </p>
            <div className="flex flex-wrap gap-2">
              {contrastOptions.map((opt) => (
                <Button
                  key={opt.value}
                  role="radio"
                  aria-checked={settings.contrast === opt.value}
                  variant={settings.contrast === opt.value ? "default" : "outline"}
                  onClick={() => setContrast(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="reduce-motion" className="text-sm font-semibold">
                Reduce motion
              </Label>
              <p className="mt-1 text-xs text-gray-500">
                Disables animations and transitions across the admin panel. Honours the system{" "}
                <code>prefers-reduced-motion</code> setting too.
              </p>
            </div>
            <Switch
              id="reduce-motion"
              checked={settings.reduceMotion}
              onCheckedChange={setReduceMotion}
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={reset}>
            Reset to defaults
          </Button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
