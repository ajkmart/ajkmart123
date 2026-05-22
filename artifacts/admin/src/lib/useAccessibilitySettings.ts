import { safeJsonParse, safeJsonStringify } from "@/lib/safeJson";
import { safeLocalGet, safeLocalSet } from "@/lib/safeStorage";
import { useCallback, useEffect, useState } from "react";

/**
 * useAccessibilitySettings — admin-only WCAG affordances kept on the
 * client (font scale + high-contrast mode). Settings persist in
 * `localStorage` and are applied to `<html>` via two attributes:
 *
 *   data-admin-font-scale="1.125"
 *   data-admin-contrast="high"
 *
 * Pages can opt into the styling via the matching CSS in `index.css`.
 * Adopting the hook is incremental — components keep working without
 * any of the attributes set.
 */

export type AdminFontScale = 0.875 | 1 | 1.125 | 1.25;
export type AdminContrast = "normal" | "high";

export interface AccessibilitySettings {
  fontScale: AdminFontScale;
  contrast: AdminContrast;
  reduceMotion: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  fontScale: 1,
  contrast: "normal",
  reduceMotion: false,
};

const STORAGE_KEY = "admin.accessibility.v1";

function isFontScale(v: unknown): v is AdminFontScale {
  return v === 0.875 || v === 1 || v === 1.125 || v === 1.25;
}

function isContrast(v: unknown): v is AdminContrast {
  return v === "normal" || v === "high";
}

function readPersisted(): AccessibilitySettings {
  const raw = safeLocalGet(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_ACCESSIBILITY };
  const parsed = safeJsonParse<Partial<AccessibilitySettings>>(raw, {});
  return {
    fontScale: isFontScale(parsed.fontScale) ? parsed.fontScale : DEFAULT_ACCESSIBILITY.fontScale,
    contrast: isContrast(parsed.contrast) ? parsed.contrast : DEFAULT_ACCESSIBILITY.contrast,
    reduceMotion:
      typeof parsed.reduceMotion === "boolean"
        ? parsed.reduceMotion
        : DEFAULT_ACCESSIBILITY.reduceMotion,
  };
}

function applyToDocument(s: AccessibilitySettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-admin-font-scale", String(s.fontScale));
  root.setAttribute("data-admin-contrast", s.contrast);
  root.setAttribute("data-admin-reduce-motion", s.reduceMotion ? "1" : "0");
  root.style.setProperty("--admin-font-scale", String(s.fontScale));
}

export function useAccessibilitySettings() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => readPersisted());

  useEffect(() => {
    applyToDocument(settings);
    const json = safeJsonStringify(settings);
    if (json) safeLocalSet(STORAGE_KEY, json);
  }, [settings]);

  const setFontScale = useCallback((fontScale: AdminFontScale) => {
    setSettings((prev) => ({ ...prev, fontScale }));
  }, []);

  const setContrast = useCallback((contrast: AdminContrast) => {
    setSettings((prev) => ({ ...prev, contrast }));
  }, []);

  const setReduceMotion = useCallback((reduceMotion: boolean) => {
    setSettings((prev) => ({ ...prev, reduceMotion }));
  }, []);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_ACCESSIBILITY });
  }, []);

  return { settings, setFontScale, setContrast, setReduceMotion, reset };
}

/** Apply the persisted settings on app boot, before any component reads them. */
export function bootAccessibilitySettings(): void {
  applyToDocument(readPersisted());
}
