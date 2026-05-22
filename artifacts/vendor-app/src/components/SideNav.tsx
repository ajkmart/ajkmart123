import { useQuery } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { Link, useLocation } from "wouter";
import { api } from "../lib/api";
import { fc } from "../lib/ui";
import { useCurrency, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { useAuth } from "../lib/vendor-auth";

const items: { href: string; labelKey: TranslationKey; icon: string; descKey: TranslationKey }[] = [
  { href: "/", labelKey: "dashboard", icon: "📊", descKey: "overviewStats" },
  { href: "/orders", labelKey: "orders", icon: "📦", descKey: "manageOrdersShort" },
  { href: "/products", labelKey: "products", icon: "🍽️", descKey: "yourMenuStock" },
  { href: "/wallet", labelKey: "wallet", icon: "💰", descKey: "earningsPayoutsShort" },
  { href: "/analytics", labelKey: "analytics", icon: "📈", descKey: "salesPerf" },
  { href: "/chat", labelKey: "chat", icon: "💬", descKey: "customerFeedback" },
  { href: "/reviews", labelKey: "reviews", icon: "⭐", descKey: "customerFeedback" },
  { href: "/promos", labelKey: "promosLabel", icon: "🏷️", descKey: "salesPerf" },
  { href: "/campaigns", labelKey: "campaignsLabel", icon: "🎯", descKey: "salesPerf" },
  { href: "/store", labelKey: "myStore", icon: "🏪", descKey: "settingsAndHours" },
  { href: "/profile", labelKey: "account", icon: "👤", descKey: "profileAndSecurity" },
];

export function SideNav() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { config } = usePlatformConfig();
  const { symbol: currencySymbol } = useCurrency();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const { data: notifData } = useQuery({
    queryKey: ["vendor-notifs-count"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const unread: number = notifData?.unread || 0;

  return (
    <aside
      className="fixed top-0 left-0 z-30 hidden min-h-screen w-64 flex-col md:flex"
      style={{
        background: "#0D1117",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "4px 0 24px rgba(0,0,0,0.30)",
      }}
    >
      {/* ── Store Header ── */}
      <div
        className="relative flex-shrink-0 overflow-hidden px-5 py-5"
        style={{ background: "linear-gradient(135deg, #1A56DB 0%, #1348B5 60%, #0F3499 100%)" }}
      >
        {/* Decorative glow */}
        <div
          className="pointer-events-none absolute -top-6 -right-6 h-32 w-32 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-20 w-20 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl shadow-lg"
            style={{
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.25)",
            }}
          >
            <span className="text-xl">🏪</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-extrabold text-white">
              {user?.storeName || T("myStore")}
            </p>
            <p className="text-xs font-medium text-blue-200 opacity-80">
              {config.platform.appName} Vendor
            </p>
          </div>
        </div>

        <div className="relative mt-3 flex items-center justify-between">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold"
            style={
              user?.storeIsOpen
                ? {
                    background: "rgba(16,185,129,0.25)",
                    color: "#6EE7B7",
                    border: "1px solid rgba(16,185,129,0.30)",
                  }
                : {
                    background: "rgba(239,68,68,0.22)",
                    color: "#FCA5A5",
                    border: "1px solid rgba(239,68,68,0.28)",
                  }
            }
          >
            {user?.storeIsOpen ? `🟢 ${T("openLabel")}` : `🔴 ${T("closedLabel")}`}
          </span>
          <span className="text-xs font-semibold" style={{ color: "rgba(219,234,254,0.70)" }}>
            {Math.round(100 - (config.platform.vendorCommissionPct ?? 15))}% earnings
          </span>
        </div>
      </div>

      {/* ── Navigation Items ── */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {items.map((item) => {
          const active =
            location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150"
              style={
                active
                  ? { background: "rgba(26,86,219,0.16)", border: "1px solid rgba(26,86,219,0.28)" }
                  : { background: "transparent", border: "1px solid transparent" }
              }
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Icon */}
              <span
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-lg transition-all"
                style={
                  active
                    ? { background: "rgba(26,86,219,0.25)" }
                    : { background: "rgba(255,255,255,0.06)" }
                }
              >
                {item.icon}
              </span>

              {/* Label + desc */}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-bold transition-colors"
                  style={{ color: active ? "#93BBFE" : "#CBD5E1" }}
                >
                  {T(item.labelKey)}
                </p>
                <p className="truncate text-xs" style={{ color: "#374151" }}>
                  {T(item.descKey)}
                </p>
              </div>

              {/* Notification badge */}
              {item.href === "/profile" && unread > 0 && (
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold"
                  style={{ background: "#EF4444", color: "white" }}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}

              {/* Active accent bar */}
              {active && (
                <div
                  className="ml-auto h-5 w-1 flex-shrink-0 rounded-full"
                  style={{ background: "linear-gradient(180deg, #60A5FA, #1A56DB)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Wallet + Logout Footer ── */}
      <div
        className="flex-shrink-0 px-2.5 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link href="/wallet">
          <div
            className="mb-2 cursor-pointer rounded-xl px-3 py-2.5 transition-all"
            style={{ background: "rgba(26,86,219,0.12)", border: "1px solid rgba(26,86,219,0.20)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(26,86,219,0.18)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(26,86,219,0.12)")
            }
          >
            <p className="mb-0.5 text-xs font-medium" style={{ color: "#6B7280" }}>
              {T("walletBalanceLabel")}
            </p>
            <p className="text-lg font-extrabold" style={{ color: "#60A5FA" }}>
              {fc(user?.walletBalance ?? "0", currencySymbol)}
            </p>
          </div>
        </Link>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all"
          style={{ color: "#F87171", background: "transparent" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.10)")
          }
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
        >
          <span>🚪</span> {T("logout")}
        </button>
      </div>
    </aside>
  );
}
