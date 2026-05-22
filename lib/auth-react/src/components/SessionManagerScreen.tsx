import React, { useState } from "react";
import type { LoginHistoryEntry, Session } from "../hooks/useSessionManager";
import { useSessionManager } from "../hooks/useSessionManager";

/* ── Inline styles (no CSS deps — works in any React web app) ───────────── */

const palette = {
  bg: "#f9fafb",
  card: "#ffffff",
  border: "#e5e7eb",
  primary: "#3b82f6",
  primaryHover: "#2563eb",
  danger: "#ef4444",
  dangerHover: "#dc2626",
  muted: "#6b7280",
  success: "#22c55e",
  error: "#ef4444",
  text: "#111827",
  textSub: "#6b7280",
  badge: "#f3f4f6",
  badgeBorder: "#e5e7eb",
};

const s = {
  root: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: palette.bg,
    minHeight: "100%",
    padding: "24px 16px",
    boxSizing: "border-box" as const,
  },
  inner: {
    maxWidth: 680,
    margin: "0 auto",
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: palette.text,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: palette.textSub,
    marginBottom: 24,
  },
  tabs: {
    display: "flex",
    borderBottom: `2px solid ${palette.border}`,
    marginBottom: 24,
    gap: 0,
  },
  tab: (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    color: active ? palette.primary : palette.muted,
    background: "transparent",
    border: "none",
    borderBottom: active ? `2px solid ${palette.primary}` : "2px solid transparent",
    marginBottom: -2,
    cursor: "pointer",
    transition: "color 0.15s, border-color 0.15s",
  }),
  card: {
    background: palette.card,
    border: `1px solid ${palette.border}`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: palette.badge,
    border: `1px solid ${palette.badgeBorder}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    flexShrink: 0,
  },
  deviceInfo: {
    flex: 1,
    minWidth: 0,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: 600,
    color: palette.text,
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis",
  },
  deviceMeta: {
    fontSize: 12,
    color: palette.textSub,
    marginTop: 2,
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis",
  },
  badge: (success: boolean): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: success ? "#dcfce7" : "#fee2e2",
    color: success ? "#15803d" : "#b91c1c",
    border: `1px solid ${success ? "#bbf7d0" : "#fecaca"}`,
    marginLeft: 8,
    verticalAlign: "middle",
  }),
  revokeBtn: (loading: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: loading ? palette.muted : palette.danger,
    background: loading ? palette.badge : "#fff1f2",
    border: `1px solid ${loading ? palette.badgeBorder : "#fecaca"}`,
    borderRadius: 8,
    cursor: loading ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.15s",
    flexShrink: 0,
  }),
  bulkActions: {
    display: "flex",
    gap: 10,
    marginBottom: 20,
    flexWrap: "wrap" as const,
  },
  bulkBtn: (variant: "primary" | "danger", disabled: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    background: disabled ? palette.muted : variant === "danger" ? palette.danger : palette.primary,
    border: "none",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background 0.15s",
    opacity: disabled ? 0.7 : 1,
  }),
  refreshBtn: {
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: palette.primary,
    background: "#eff6ff",
    border: `1px solid #bfdbfe`,
    borderRadius: 8,
    cursor: "pointer",
  },
  error: {
    background: "#fef2f2",
    border: `1px solid #fecaca`,
    color: "#b91c1c",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  empty: {
    textAlign: "center" as const,
    color: palette.textSub,
    padding: "48px 0",
    fontSize: 14,
  },
  spinner: {
    textAlign: "center" as const,
    padding: "40px 0",
    color: palette.muted,
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: palette.textSub,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 12,
  },
  historyRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 16px",
    background: palette.card,
    border: `1px solid ${palette.border}`,
    borderRadius: 10,
    marginBottom: 8,
  },
};

/* ── Helper formatters ──────────────────────────────────────────────────── */

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString();
}

function deviceIcon(os: string | null): string {
  const o = (os ?? "").toLowerCase();
  if (o.includes("android") || o.includes("ios")) return "📱";
  if (o.includes("mac")) return "💻";
  if (o.includes("windows")) return "🖥️";
  if (o.includes("linux")) return "🐧";
  return "🔒";
}

function methodLabel(method: string | null): string {
  const m = method ?? "";
  const map: Record<string, string> = {
    phone_otp: "Phone",
    email_otp: "Email",
    password: "Password",
    google: "Google",
    facebook: "Facebook",
    magic_link: "Magic Link",
    biometric: "Biometric",
    totp: "2FA",
    refresh: "Token Refresh",
  };
  return map[m] ?? m ?? "Unknown";
}

/* ── Session card ───────────────────────────────────────────────────────── */

function SessionCard({
  session,
  onRevoke,
  isRevoking,
}: {
  session: Session;
  onRevoke: () => void;
  isRevoking: boolean;
}) {
  const meta = [session.browser, session.os, session.ip, session.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={s.card}>
      <div style={s.icon}>{deviceIcon(session.os)}</div>
      <div style={s.deviceInfo}>
        <div style={s.deviceName}>{session.deviceName ?? "Unknown device"}</div>
        {meta && <div style={s.deviceMeta}>{meta}</div>}
        <div style={{ ...s.deviceMeta, marginTop: 4 }}>
          Active {formatRelative(session.lastActiveAt)} &nbsp;·&nbsp; Since{" "}
          {formatAbsolute(session.createdAt)}
        </div>
      </div>
      <button
        style={s.revokeBtn(isRevoking)}
        onClick={onRevoke}
        disabled={isRevoking}
        title="Sign out this device"
      >
        {isRevoking ? "…" : "Sign out"}
      </button>
    </div>
  );
}

/* ── History row ────────────────────────────────────────────────────────── */

function HistoryRow({ entry }: { entry: LoginHistoryEntry }) {
  const meta = [entry.browser, entry.os, entry.ip, entry.location].filter(Boolean).join(" · ");

  return (
    <div style={s.historyRow}>
      <div style={{ ...s.icon, width: 34, height: 34, fontSize: 16 }}>
        {entry.success ? "✅" : "❌"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: palette.text }}>
          {methodLabel(entry.method)}
          <span style={s.badge(entry.success)}>{entry.success ? "Success" : "Failed"}</span>
        </div>
        {meta && <div style={s.deviceMeta}>{meta}</div>}
        <div style={{ ...s.deviceMeta, marginTop: 2 }}>{formatAbsolute(entry.createdAt)}</div>
      </div>
    </div>
  );
}

/* ── Props ──────────────────────────────────────────────────────────────── */

export interface SessionManagerScreenProps {
  /**
   * Override the API base URL. Defaults to the value in AuthProvider.
   */
  baseURL?: string;
  /**
   * Heading title displayed at the top of the screen.
   */
  title?: string;
  /**
   * Optional className applied to the outermost container.
   */
  className?: string;
  /**
   * If true, the "Sign out all devices" button (including current session)
   * is rendered. Defaults to false for safety.
   */
  showRevokeAll?: boolean;
}

/* ── Main component ─────────────────────────────────────────────────────── */

export function SessionManagerScreen({
  baseURL,
  title = "Active Sessions",
  className,
  showRevokeAll = false,
}: SessionManagerScreenProps) {
  const [activeTab, setActiveTab] = useState<"sessions" | "history">("sessions");
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const {
    sessions,
    history,
    loadingSessions,
    loadingHistory,
    revokingId,
    error,
    refreshSessions,
    refreshHistory,
    revokeSession,
    revokeAllOthers,
    revokeAll,
    clearError,
  } = useSessionManager({ baseURL, autoFetchSessions: true, autoFetchHistory: false });

  const handleTabChange = (tab: "sessions" | "history") => {
    setActiveTab(tab);
    if (tab === "history" && history.length === 0 && !loadingHistory) {
      void refreshHistory();
    }
  };

  const anyBulkLoading = revokingId === "__others__" || revokingId === "__all__";

  return (
    <div style={s.root} className={className}>
      <div style={s.inner}>
        <h2 style={s.heading}>{title}</h2>
        <p style={s.subheading}>
          Manage where you&apos;re signed in and review recent login activity.
        </p>

        {/* ── Error banner ───────────────────────────────────────────── */}
        {error && (
          <div style={s.error}>
            <span>{error}</span>
            <button
              onClick={clearError}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#b91c1c",
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div style={s.tabs}>
          <button
            style={s.tab(activeTab === "sessions")}
            onClick={() => handleTabChange("sessions")}
          >
            Active Devices {sessions.length > 0 && `(${sessions.length})`}
          </button>
          <button style={s.tab(activeTab === "history")} onClick={() => handleTabChange("history")}>
            Login History
          </button>
        </div>

        {/* ── Sessions tab ───────────────────────────────────────────── */}
        {activeTab === "sessions" && (
          <>
            {/* Bulk actions */}
            <div style={s.bulkActions}>
              <button
                style={s.bulkBtn("primary", anyBulkLoading || loadingSessions)}
                onClick={() => void refreshSessions()}
                disabled={anyBulkLoading || loadingSessions}
              >
                {loadingSessions ? "Refreshing…" : "Refresh"}
              </button>
              {sessions.length > 1 && (
                <button
                  style={s.bulkBtn("danger", anyBulkLoading)}
                  onClick={() => void revokeAllOthers()}
                  disabled={anyBulkLoading}
                >
                  {revokingId === "__others__" ? "Signing out…" : "Sign out other devices"}
                </button>
              )}
              {showRevokeAll && sessions.length > 0 && !confirmRevokeAll && (
                <button
                  style={s.bulkBtn("danger", anyBulkLoading)}
                  onClick={() => setConfirmRevokeAll(true)}
                  disabled={anyBulkLoading}
                >
                  {revokingId === "__all__" ? "Signing out all…" : "Sign out all devices"}
                </button>
              )}
            </div>

            {/* Inline revoke-all confirmation — replaces window.confirm() */}
            {confirmRevokeAll && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 10,
                  padding: "16px 20px",
                  marginBottom: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
                role="alert"
                aria-live="assertive"
              >
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#b91c1c" }}>
                  Sign out of ALL devices?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                  This will immediately end every active session including this one. You will need
                  to sign in again.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    style={{
                      padding: "8px 18px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      background: palette.danger,
                      border: "none",
                      borderRadius: 8,
                      cursor: anyBulkLoading ? "not-allowed" : "pointer",
                      opacity: anyBulkLoading ? 0.7 : 1,
                    }}
                    disabled={anyBulkLoading}
                    onClick={() => {
                      setConfirmRevokeAll(false);
                      void revokeAll();
                    }}
                  >
                    Yes, sign out all
                  </button>
                  <button
                    style={{
                      padding: "8px 18px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: palette.text,
                      background: "#f3f4f6",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                    onClick={() => setConfirmRevokeAll(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            {loadingSessions && sessions.length === 0 ? (
              <div style={s.spinner}>Loading sessions…</div>
            ) : sessions.length === 0 ? (
              <div style={s.empty}>No active sessions found.</div>
            ) : (
              <>
                <div style={s.sectionLabel}>
                  {sessions.length} active device{sessions.length !== 1 ? "s" : ""}
                </div>
                {sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onRevoke={() => void revokeSession(session.id)}
                    isRevoking={revokingId === session.id}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* ── History tab ────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <>
            <div style={s.bulkActions}>
              <button
                style={s.refreshBtn}
                onClick={() => void refreshHistory()}
                disabled={loadingHistory}
              >
                {loadingHistory ? "Loading…" : "Refresh"}
              </button>
            </div>

            {loadingHistory && history.length === 0 ? (
              <div style={s.spinner}>Loading history…</div>
            ) : history.length === 0 ? (
              <div style={s.empty}>No login history found.</div>
            ) : (
              <>
                <div style={s.sectionLabel}>
                  Last {history.length} login event{history.length !== 1 ? "s" : ""}
                </div>
                {history.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
