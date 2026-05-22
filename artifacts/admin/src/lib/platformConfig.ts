import { createLogger } from "@/lib/logger";
import { adminFetch, getAdminAccessToken } from "./adminFetcher";
import { applyAdminTimingOverrides, type AdminTimingConfig } from "./adminTiming";
const log = createLogger("[platformConfig]");

export const PLATFORM_DEFAULTS = {
  currencySymbol: "Rs.",
  vendorCommissionPct: 15,
  defaultLat: 33.7215,
  defaultLng: 73.0433,
} as const;

let _currencySymbol: string = PLATFORM_DEFAULTS.currencySymbol;

export const setCurrencySymbol = (sym: string) => {
  _currencySymbol = sym || PLATFORM_DEFAULTS.currencySymbol;
};

export const getCurrencySymbol = () => _currencySymbol;

/**
 * Settings keys the backend may publish to override admin-side timing.
 * Keys are mapped 1:1 onto AdminTimingConfig fields so a single new
 * `admin_timing_command_palette_debounce_ms` row in the platform_settings
 * table is enough to retune the in-browser debounce.
 */
const TIMING_SETTING_KEYS: Record<string, keyof AdminTimingConfig> = {
  admin_timing_command_palette_debounce_ms: "commandPaletteDebounceMs",
  admin_timing_command_palette_live_stale_ms: "commandPaletteLiveStaleMs",
  admin_timing_command_palette_ai_stale_ms: "commandPaletteAiStaleMs",
  admin_timing_pull_to_refresh_interval_ms: "pullToRefreshIntervalMs",
  admin_timing_pull_to_refresh_threshold_px: "pullToRefreshThresholdPx",
  admin_timing_error_reporter_flush_ms: "errorReporterFlushDelayMs",
  admin_timing_error_reporter_enqueue_ms: "errorReporterEnqueueDelayMs",
  admin_timing_error_reporter_dedup_ms: "errorReporterDedupWindowMs",
  admin_timing_error_reporter_message_max: "errorReporterMessageMax",
  admin_timing_error_reporter_stack_max: "errorReporterStackMax",
  admin_timing_error_reporter_message_key_max: "errorReporterMessageKeyMax",
  admin_timing_error_reporter_recent_max: "errorReporterRecentMax",
  admin_timing_error_reporter_queue_max: "errorReporterQueueMax",
  admin_timing_refetch_categories_ms: "refetchIntervalCategoriesMs",
  admin_timing_refetch_launch_control_ms: "refetchIntervalLaunchControlMs",
  admin_timing_refetch_app_management_ms: "refetchIntervalAppManagementMs",
  admin_timing_login_redirect_delay_ms: "loginRedirectDelayMs",
  admin_timing_layout_error_poll_ms: "layoutErrorPollIntervalMs",
};

export const loadPlatformConfig = async () => {
  // Skip the API call if there is no admin token — this function is called
  // at app startup (main.tsx), which runs before login. Making an
  // unauthenticated request here causes a 401 that the api.ts handler could
  // use to clear a freshly-saved login token (race condition).
  if (!getAdminAccessToken()) return;
  try {
    const data = await adminFetch("/platform-settings");
    const settings: { key: string; value: string }[] = data.settings || [];
    const sym = settings.find((s) => s.key === "currency_symbol")?.value;
    if (sym) setCurrencySymbol(sym);

    const overrides: Partial<Record<keyof AdminTimingConfig, unknown>> = {};
    for (const row of settings) {
      const target = TIMING_SETTING_KEYS[row.key];
      if (target) overrides[target] = row.value;
    }
    if (Object.keys(overrides).length > 0) applyAdminTimingOverrides(overrides);
  } catch (err) {
    // Falling back to defaults is intentional, but the failure should be
    // observable. Without this log, broken /platform-settings responses
    // (auth errors, network failures, schema drift) are invisible.
    log.error("loadPlatformConfig failed; using defaults:", err);
  }
};
