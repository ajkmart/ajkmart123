/**
 * adminTiming — single source of truth for admin-side timeouts, polling
 * intervals, and reporter limits. Replaces the literals previously
 * scattered across CommandPalette, PullToRefresh, error-reporter,
 * launch-control, app-management, categories, and login.
 *
 * Each value can be overridden at runtime via `applyAdminTimingOverrides`,
 * which `loadPlatformConfig()` calls when the backend exposes matching
 * `admin_timing_*` settings.
 *
 * Implementation note: the override / reset / get plumbing is provided
 * by `@workspace/admin-timing-shared#createTimingRegistry`, which the
 * rider, vendor, and customer apps can adopt with their own typed
 * defaults so every app shares identical override semantics.
 */

import { createTimingRegistry } from "@workspace/admin-timing-shared";

export interface AdminTimingConfig {
  [key: string]: number;
  commandPaletteDebounceMs: number;
  pullToRefreshIntervalMs: number;
  errorReporterFlushDelayMs: number;
  errorReporterEnqueueDelayMs: number;
  errorReporterDedupWindowMs: number;
  errorReporterMessageMax: number;
  errorReporterStackMax: number;
  errorReporterMessageKeyMax: number;
  errorReporterRecentMax: number;
  errorReporterQueueMax: number;
  refetchIntervalCategoriesMs: number;
  refetchIntervalLaunchControlMs: number;
  refetchIntervalAppManagementMs: number;
  loginRedirectDelayMs: number;
  layoutErrorPollIntervalMs: number;
  commandPaletteLiveStaleMs: number;
  commandPaletteAiStaleMs: number;
  pullToRefreshThresholdPx: number;
}

const DEFAULTS: AdminTimingConfig = {
  commandPaletteDebounceMs: 300,
  pullToRefreshIntervalMs: 15_000,
  errorReporterFlushDelayMs: 1_000,
  errorReporterEnqueueDelayMs: 100,
  errorReporterDedupWindowMs: 30_000,
  errorReporterMessageMax: 5_000,
  errorReporterStackMax: 50_000,
  errorReporterMessageKeyMax: 200,
  errorReporterRecentMax: 100,
  errorReporterQueueMax: 50,
  refetchIntervalCategoriesMs: 30_000,
  refetchIntervalLaunchControlMs: 30_000,
  refetchIntervalAppManagementMs: 30_000,
  loginRedirectDelayMs: 1_500,
  layoutErrorPollIntervalMs: 60_000,
  commandPaletteLiveStaleMs: 5_000,
  commandPaletteAiStaleMs: 30_000,
  pullToRefreshThresholdPx: 80,
};

const _registry = createTimingRegistry<AdminTimingConfig>(DEFAULTS);

export function getAdminTiming(): AdminTimingConfig {
  return _registry.get();
}

export function applyAdminTimingOverrides(
  overrides: Partial<Record<keyof AdminTimingConfig, unknown>> | null | undefined
): void {
  _registry.apply(overrides);
}

export function resetAdminTiming(): void {
  _registry.reset();
}

export const ADMIN_TIMING_DEFAULTS: Readonly<AdminTimingConfig> = _registry.defaults;
