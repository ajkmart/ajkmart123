/**
 * i18nKeys — single registry of every translation key the admin panel
 * currently consumes. Pages should read keys from here rather than
 * scattering free-form strings, so:
 *   1. Translators have one auditable list to localise.
 *   2. Renaming a key is a single-file change with type errors at every
 *      consumer site.
 *   3. CI can statically detect duplicate or unused keys (future work).
 *
 * Adoption is incremental: not every hardcoded string is wired through
 * here yet. Use this registry for any *new* user-facing string you add.
 */

/** All keys are kebab-case under the `admin.` namespace. */
export const ADMIN_I18N_KEYS = {
  /* ── Common buttons / actions ──────────────────────────────────── */
  common: {
    save: "admin.common.save",
    cancel: "admin.common.cancel",
    retry: "admin.common.retry",
    delete: "admin.common.delete",
    edit: "admin.common.edit",
    create: "admin.common.create",
    confirm: "admin.common.confirm",
    loading: "admin.common.loading",
    saving: "admin.common.saving",
    submit: "admin.common.submit",
    back: "admin.common.back",
    next: "admin.common.next",
    close: "admin.common.close",
    search: "admin.common.search",
    filter: "admin.common.filter",
    refresh: "admin.common.refresh",
    export: "admin.common.export",
    import: "admin.common.import",
  },
  /* ── Status / feedback ─────────────────────────────────────────── */
  status: {
    online: "admin.status.online",
    offline: "admin.status.offline",
    success: "admin.status.success",
    error: "admin.status.error",
    pending: "admin.status.pending",
    failed: "admin.status.failed",
    completed: "admin.status.completed",
    saved: "admin.status.saved",
    saveFailed: "admin.status.save-failed",
  },
  /* ── Dashboard ─────────────────────────────────────────────────── */
  dashboard: {
    title: "admin.dashboard.title",
    todaysOrders: "admin.dashboard.todays-orders",
    activeRiders: "admin.dashboard.active-riders",
    revenueToday: "admin.dashboard.revenue-today",
    pendingApprovals: "admin.dashboard.pending-approvals",
  },
  /* ── Settings ──────────────────────────────────────────────────── */
  settings: {
    integrations: "admin.settings.integrations",
    payment: "admin.settings.payment",
    security: "admin.settings.security",
    accessibility: "admin.settings.accessibility",
    timing: "admin.settings.timing",
    consent: "admin.settings.consent",
  },
  /* ── Vendor / inventory ────────────────────────────────────────── */
  vendor: {
    inventoryTitle: "admin.vendor.inventory-title",
    lowStockThreshold: "admin.vendor.low-stock-threshold",
    maxQtyPerOrder: "admin.vendor.max-qty-per-order",
    backInStockNotify: "admin.vendor.back-in-stock-notify",
    autoDisableOnZero: "admin.vendor.auto-disable-on-zero",
  },
  /* ── Consent / compliance ──────────────────────────────────────── */
  consent: {
    currentTermsVersion: "admin.consent.current-terms-version",
    consentLog: "admin.consent.consent-log",
    gdprExport: "admin.consent.gdpr-export",
    gdprDelete: "admin.consent.gdpr-delete",
  },
  /* ── Errors ────────────────────────────────────────────────────── */
  errors: {
    generic: "admin.errors.generic",
    network: "admin.errors.network",
    unauthorized: "admin.errors.unauthorized",
    notFound: "admin.errors.not-found",
    forbidden: "admin.errors.forbidden",
    validation: "admin.errors.validation",
  },
} as const;

/**
 * `t()` — placeholder translator. Returns the English fallback bundled
 * here so pages can call `t(ADMIN_I18N_KEYS.common.save, "Save")` today
 * without waiting on the translation backend. When the i18n runtime is
 * wired in, swap the implementation for the real lookup.
 */
export function t(_key: string, fallback: string): string {
  return fallback;
}

/** Flat list of every registered key (handy for unused-key tooling). */
export function listAdminI18nKeys(): string[] {
  const out: string[] = [];
  const walk = (node: Record<string, unknown>): void => {
    for (const v of Object.values(node)) {
      if (typeof v === "string") out.push(v);
      else if (typeof v === "object" && v != null) walk(v as Record<string, unknown>);
    }
  };
  walk(ADMIN_I18N_KEYS as unknown as Record<string, unknown>);
  return out;
}
